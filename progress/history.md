# Bitácora histórica (append-only)

> Cada vez que se cierra una sesión, su resumen se añade aquí.
> No edites entradas anteriores. Solo añades al final.

---

<!--
Plantilla para cada entrada nueva:

## YYYY-MM-DD — Feature N: nombre_de_la_feature
- **Agente:** quién/qué modelo
- **Plan:** descripción breve del enfoque tomado
- **Cambios:** lista de archivos tocados (alto nivel, no diff)
- **Verificación:** resultado de ./init.sh, número de tests
- **Cierre:** estado final de la feature, próxima feature
-->

## 2026-07-08 → 2026-07-10 — Tarea directa: english-migration

- **Agente:** implementer (verificación final: leader)
- **Plan:** migrar el dominio de español a inglés (schema Prisma + migración
  init reescrita para reset + rutas/mensajes/comentarios), sin cambiar
  comportamiento ni infraestructura.
- **Cambios:** `prisma/schema.prisma` (Categoria/Gasto → Category/Expense),
  `prisma/migrations/20260707171322_init/migration.sql`, `src/routes/gastos.ts`
  → `src/routes/expenses.ts`, `src/app.ts` (prefix `/api/expenses`),
  traducciones en server/health/plugins/lib/prisma.config.
  Detalle: `progress/impl_english-migration.md`.
- **Verificación:** `prisma generate` OK; `typecheck` 0 errores. 2026-07-10:
  usuario ejecutó `prisma migrate reset --force` (esquema inglés aplicado);
  smoke-test niveles 2-3 de docs/verification.md en verde (health, health/db,
  POST 201, GET, 400 sin `amount`, 404, DELETE 204; BD limpia al terminar).
- **Cierre:** completa y verificada end-to-end. No era feature de
  `feature_list.json` (tarea directa). Siguiente: configurar test runner y
  luego feature 1 (bootstrap).

## 2026-07-10 — Feature 1: bootstrap (+ fix init.sh y tarea test-runner)

- **Agente:** leader (orquestando) + implementer + reviewer (Claude).
- **Plan:** sesión en tres tramos: (a) desbloquear `./init.sh` en Windows;
  (b) tarea directa test-runner (configurar Vitest y portar el smoke-test
  manual a tests automáticos); (c) feature 1 `bootstrap` en flujo simple —
  el proyecto ya existía, así que el enfoque fue verificar cada criterio de
  aceptación contra la realidad con evidencia ejecutable, sin reconstruir
  nada ni robar trabajo a la feature 2 (migración a `modules/`).
- **Cambios:**
  - init.sh (leader): el alias falso `python.exe` de la Microsoft Store
    engañaba a `command -v`; ahora se comprueba que el binario responde a
    `--version` (fallback a Node). Post-cierre (leader): añadida también
    normalización del casing del cwd con `cygpath -m` — vitest 4.1.10 falla
    si la letra de unidad va en minúscula (`c:/`), y algunos shells heredan
    ese casing; verificado init.sh verde desde ambos casings.
  - test-runner (implementer, APPROVED): `vitest@4.1.10` + `vitest.config.ts`,
    scripts `test`/`test:watch`, 8 tests de integración (`buildApp()` +
    `app.inject()` contra Postgres real): `src/routes/health.test.ts` y
    `src/routes/expenses.test.ts`. Leader actualizó docs/stack.md (§Testing)
    y docs/verification.md. Informes: impl_/review_test-runner.md.
  - Feature 1 bootstrap (implementer): **0 cambios en código fuente y 0
    dependencias nuevas** — los 4 criterios ya se cumplían; se produjo la
    evidencia (arranque real `npm run dev` → /health y /health/db 200;
    stack.md contrastado dato a dato con `npm ls`; init.sh verde; árbol de
    src/ coincidente archivo a archivo con el estado presente de
    architecture.md). Se detectó y limpió un servidor dev huérfano en :3000.
    Primer veredicto del reviewer: **REJECTED** (quedaron watchers `tsx
    watch` vivos y el informe afirmaba una limpieza completa falsa);
    corregido (3 árboles de proceso matados de verdad, verificación por
    lista de procesos Win32_Process, informe reescrito con la lección de
    re-parenting en Windows) → **APPROVED** en re-review. Informes:
    impl_/review_/resumen_bootstrap.md.
- **Verificación:** `bash ./init.sh` → stack node (v24.11.0), typecheck 0
  errores, tests 8/8, `[OK] Entorno listo` (re-ejecutado también por el
  reviewer). Arranque real demostrado y proceso parado sin huérfanos.
- **Cierre:** feature 1 `bootstrap` → **done** en feature_list.json.
  ⚠️ Decisión pendiente del humano: colisión del puerto 5432 (PostgreSQL
  17.6 nativo de Windows responde en localhost:5432 en lugar del contenedor
  `gastos-postgres`; app y tests usan coherentemente el nativo) — parar el
  servicio nativo o remapear el contenedor (ej. 5433) y ajustar
  DATABASE_URL. Próxima feature: 2 `fundamentos` (SDD: requiere spec_author
  y aprobación humana antes de implementar).

## 2026-07-10 — Tarea directa: resolver colisión de puerto de PostgreSQL

- **Agente:** leader (solo configuración; decisión tomada por el humano:
  remapear el contenedor, no parar el servicio nativo).
- **Cambios:** `docker-compose.yml` → `5434:5432` (5433 también estaba
  ocupado, por el relay de WSL/Docker); `DATABASE_URL` en `.env` y
  `.env.example` → `localhost:5434`; docs/stack.md (§BD reescrita: colisión
  resuelta, razón del 5434) y docs/verification.md (puerto del smoke).
- **Verificación:** contenedor recreado y healthy en 5434;
  `prisma migrate deploy` aplicó la migración init a la BD del contenedor
  (estaba vacía); `SELECT version()` vía DATABASE_URL → "PostgreSQL 17.9 on
  x86_64-pc-linux-musl" (es el contenedor, ya no el nativo de Windows);
  `./init.sh` → typecheck OK + 8/8 tests + `[OK] Entorno listo`.
- **Cierre:** app y tests trabajan contra el contenedor. El PostgreSQL
  nativo de Windows sigue corriendo con su BD `gastos` residual (sin uso;
  el humano puede pararlo o borrarla cuando quiera).

## 2026-07-10 → 2026-07-11 — Feature 2: fundamentos (SDD) + tarea directa lint-tooling

- **Agente:** leader (orquestando) + spec_author + implementer + reviewer.
- **Plan:** flujo SDD completo. (a) spec_author redactó
  `specs/fundamentos/` (R1-R18 en EARS con procedencia, design, T1-T25);
  (b) puerta humana: aprobado el 2026-07-11 sin cambios (R3 valores de env
  inválidos y R10 404 de router normalizado ENTRAN; R18 se dio por
  satisfecho vía tarea directa); (c) implementer ejecutó las tasks en
  orden; (d) reviewer validó trazabilidad R↔test re-ejecutando todo.
  Durante la revisión del spec, el humano pidió adelantar el lint tooling
  como tarea directa.
- **Cambios:**
  - lint-tooling (implementer, APPROVED): ESLint 10 flat config +
    typescript-eslint 8 + Prettier 3 + eslint-config-prettier; scripts
    `lint`/`lint:fix`/`format`/`format:check`; cero reformateo en `src/`.
    Leader actualizó docs/conventions.md y docs/stack.md. Informes:
    impl_/review_lint-tooling.md.
  - Feature 2 fundamentos (implementer; T1-T25 completadas, T22 N/A por el
    lint ya hecho):
    - `src/config/env.ts` — `loadConfig()` tipado que valida al arrancar y
      acumula todos los problemas en un mensaje; fail-fast en `server.ts`
      (stderr + exit 1); `process.env` centralizado (adiós lecturas
      dispersas en app/server/lib).
    - `src/errors/app-error.ts` (`AppError`, `NotFoundError`,
      `ValidationError`) + `src/plugins/error-handler.ts`
      (`setErrorHandler` + `setNotFoundHandler`): formato único de error
      `{ statusCode, code, message }`; 500 genérico sin filtrar detalles.
    - Migración a `modules/` (ADR-004): `expenses/`
      (routes/service/schema/types, service único punto de acceso a Prisma
      vía accessor `expensesDb`) y `health/`; `src/routes/` eliminado; los
      8 tests movidos sin tocar asserts.
    - `src/architecture.test.ts` — guardián de invariantes (R4, R11, R12,
      R13).
    - Docs: api-contract.md §Errores nueva (códigos estables + nota
      no-breaking), architecture.md (ADR-005 patrón de errores, ADR-006
      validación de env a mano, árbol sin `(nueva)`, notas de realidad),
      stack.md y verification.md (referencias a `src/modules/*`).
    - Suite: de 8 → **35 tests**. Informes:
      impl_/review_/resumen_fundamentos.md.
- **Verificación:** `npm test` 35/35; `typecheck`/`lint`/`format:check`
  exit 0; `bash ./init.sh` → `[OK] Entorno listo` (re-ejecutado también
  por el reviewer). Smoke real: `npm run dev` responde /health, /health/db
  y 404 normalizado; sin `DATABASE_URL` → exit 1 con mensaje claro;
  `PORT`/`LOG_LEVEL` inválidos → exit 1 listando ambos problemas. Procesos
  `tsx watch` matados por PID y verificados por lista de procesos
  (Win32_Process) + puerto 3000 libre.
- **Cierre:** feature 2 `fundamentos` → **done** (reviewer APPROVED sin
  cambios requeridos; resumen en `progress/resumen_fundamentos.md`).
  Observaciones no bloqueantes anotadas en `review_fundamentos.md` para el
  leader: nota obsoleta en conventions.md §Manejo de errores, pie de
  stack.md §Variables de entorno desactualizado, placeholder en
  related-projects.md, assert histórico redundante en expenses.test.ts.
  Próxima feature: no quedan features pendientes en `feature_list.json`;
  esperar el siguiente `intent` del humano.

## 2026-07-11 — Tarea directa: reorganización de progress/ y regla de nombres en inglés

- **Agente:** leader (solo harness/docs). Decisiones del humano: subcarpetas
  sin prefijo; renombrar la feature "fundamentos" → "foundations".
- **Cambios:** `progress/` organizado por tipo — `implementations/`,
  `reviews/`, `summaries/` (y `explorations/` para el futuro); `current.md`
  e `history.md` quedan en la raíz. Renombrados a inglés:
  `specs/fundamentos/` → `specs/foundations/`, `name` de la feature 2 →
  `foundations`, `docs/resumen-template.md` → `docs/summary-template.md`.
  Referencias actualizadas en `.claude/agents/*` (leader, implementer,
  reviewer, spec_author — este último ahora reporta bloqueos en
  `progress/current.md`), `CHECKPOINTS.md` (C8) y
  `docs/{specs,verification,conventions,architecture,api-contract}.md`.
  Regla codificada en `docs/conventions.md` §Idioma: nombres de archivos y
  carpetas SIEMPRE en inglés; solo la prosa de los documentos va en español.
  Corregida de paso la nota obsoleta de conventions.md §Manejo de errores
  ("aún no implementado" → implementado por foundations).
- **Verificación:** `./init.sh` → `[OK] Entorno listo` (su paso 3 valida
  `specs/foundations/` contra el nombre nuevo); 35/35 tests.
- **Cierre:** los informes históricos NO se editaron (history.md es
  append-only; las rutas citadas en su contenido reflejan la época en que
  se escribieron). Siguiente: commits del trabajo pendiente.

## 2026-07-20 — Feature 3: drive-connection (SDD)

- **Agente:** leader (orquestando) + spec-author + implementer + reviewer.
- **Verificación:** `bash ./init.sh` → typecheck OK + **61 tests** en verde +
  `[OK] Entorno listo` (re-ejecutado por el reviewer). Suite hermética: verde sin
  credenciales reales de Drive y sin red (placeholders en `vitest.config.ts` +
  arranque lazy del plugin).
- **Cierre:** feature 3 `drive-connection` → **done** (reviewer APPROVED, 0
  problemas bloqueantes; review en `progress/reviews/drive-connection.md`, informe
  del implementer en `progress/implementations/drive-connection.md`). Pendiente
  del humano: **T25** (smoke real contra su Drive + pasos manuales de
  `specs/drive-connection/design.md` §10). Próxima feature: 4 `drive-structure`
  (SDD, `pending`: requiere spec-author y aprobación humana antes de implementar).

### Resumen de cierre

Fecha de cierre: 2026-07-20
Intención original: `feature_list.json` -> feature `drive-connection`, bloque `intent`
Spec (SDD): `specs/drive-connection/`

#### Qué hace ahora la app que antes no

El backend ya sabe hablar con tu Google Drive. Al arrancar valida que las tres
credenciales OAuth de Drive están puestas (si falta alguna, no arranca y te dice
exactamente cuáles faltan, sin tocar la red). El cliente de Drive queda disponible
para toda la app como `fastify.drive`, listo para que la feature 4 lo use sin
volver a resolver el auth. Y hay un endpoint nuevo, `GET /health/drive`, que
comprueba bajo demanda si de verdad se llega a Drive. Antes el backend no tenía
ninguna forma de conectarse a Drive.

Importante: esto es solo la tubería de conexión. No crea carpetas ni sube/mueve
archivos (eso es la feature 4). La única llamada real a Drive es `about.get`, para
saber "conecto / no conecto" y con qué cuenta.

#### Por dónde se usa (puntos de entrada)

- `GET /health/drive` — 200 `{ "status": "ok", "drive": "up" }` si Drive responde;
  503 `{ "status": "error", "drive": "down" }` si no. No tumba la app cuando Drive
  falla. La cuenta conectada (email) se registra en el log, nunca en la respuesta.
- `fastify.drive` — el cliente de Drive v3, disponible en cualquier ruta/plugin
  registrado después. Es lo que consumirá la feature 4.
- `node scripts/get-drive-refresh-token.mjs` — script de un solo uso (lo ejecutas
  tú una vez) para obtener el refresh token tras el consentimiento OAuth.

#### Dónde está el código (para revisión directa)

| Qué | Archivo:línea |
|-----|---------------|
| Fábrica del cliente + auth OAuth2 + scope | `src/lib/drive.ts:10,18,31` |
| Comprobación de conexión (devuelve el email) | `src/lib/drive.ts:110` |
| Mapeo de errores a mensaje fijo (sin fuga de tokens) | `src/lib/drive.ts:38-67` |
| Plugin que expone `fastify.drive` (sin handshake) | `src/plugins/drive.ts:22-30` |
| Registro del plugin en la app | `src/app.ts:26` |
| Endpoint `GET /health/drive` | `src/modules/health/health.routes.ts:26-38` |
| Validación de las 3 variables al arrancar | `src/config/env.ts:66-92` |
| Error de dominio `DriveConnectionError` (503) | `src/errors/app-error.ts:29-33` |
| Placeholders que hacen hermética la suite | `vitest.config.ts:14-19` |
| Guardianes (.env.example sin secretos, sin `files.*`) | `src/architecture.test.ts:66,77` |
| Tests unitarios del cliente de Drive | `src/lib/drive.test.ts` |
| Tests del endpoint y del logueo del email | `src/modules/health/health.test.ts:42-102` |
| Tests del arranque lazy del plugin | `src/plugins/drive.test.ts` |

#### Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ "Arranca con las credenciales configuradas y establece conexión sin
  intervención en cada arranque" -> el refresh token deja que la librería renueve
  el access token sola; verificado en `src/lib/drive.test.ts:36` (R4). La conexión
  real end-to-end la valida tu smoke test (T25).
- ✅ "Falta o es inválida una credencial -> lo detecta y falla con mensaje claro"
  -> `loadConfig` lista todas las que faltan sin llamar a la red; verificado en
  `src/config/env.test.ts:86-132` (R2, R3).
- ✅ "Cuando compruebo la conexión, me dice si llega a Drive o no" ->
  `GET /health/drive` 200/503 sin tumbar la app; verificado en
  `src/modules/health/health.test.ts:43,85` (R9, R10).
- ✅ "Cualquier feature futura reutiliza la conexión sin volver a resolver el auth"
  -> `fastify.drive` decorado por plugin `fp`; verificado en
  `src/plugins/drive.test.ts:22,29` (R7).

Y los `que_no_quiero`:

- ✅ "No crear carpetas ni subir/leer/mover archivos" -> guardián de alcance:
  `src/lib/drive.ts` no contiene `files.*`; `src/architecture.test.ts:77` (R17).
- ✅ "No guardar credenciales ni tokens en el código ni el repo" -> `.env.example`
  solo con placeholders, guardado por test; `src/architecture.test.ts:66` (R14).
  Los mensajes de error nunca filtran el token; `src/lib/drive.test.ts:66` (R12).

#### Decisiones que se tomaron por ti

- (delegado) **Auth = OAuth2 con refresh token de larga duración** (no Service
  Account, que no funciona con un Drive personal). ADR-007 en
  `docs/architecture.md:207`.
- (delegado) **Librería = `@googleapis/drive`**, no el monolito `googleapis`
  (~85x más pesado); y NO se declara `google-auth-library` aparte (se usa el
  `auth` reexportado). `package.json:34`, ADR-007.
- (delegado) **Variables en forma anidada** `drive: { clientId, clientSecret,
  refreshToken }` y la comprobación con `about.get`. `src/config/env.ts:5-9`,
  `src/lib/drive.ts:112`.
- (añadido) **Tabla de diagnóstico de 4 síntomas** (`invalid_grant`,
  `invalid_client`, `accessNotConfigured`, `insufficientPermissions`) con mensaje
  fijo y accionable cada uno; pediste "un mensaje claro", esto lo hace concreto.
  `src/lib/drive.ts:38-44` (R19). En especial `invalid_grant` avisa de que el
  token caducó (app dejada en "Testing").
- (añadido) **El email de la cuenta conectada se registra en el log** (no en la
  respuesta HTTP) para que detectes si consentiste con la cuenta equivocada.
  `src/modules/health/health.routes.ts:31` (R20).

#### Qué NO se tocó / quedó fuera

- No se crean carpetas ni se suben/mueven archivos: es la feature 4.
- `about.get` pide solo `fields: 'user'`; el aviso de cuota (`storageQuota`) queda
  para la feature 4 (la que sube archivos).
- No se tocó `.env` (tus secretos locales) ni la línea del gestor de paquetes de
  `docs/stack.md`.
- El handler central de errores no se tocó: `DriveConnectionError` funciona por
  `instanceof AppError`.

#### Notas para el futuro

- **Pendiente tuyo (T25):** haz los pasos manuales de `specs/drive-connection/design.md`
  §10 (Google Cloud Console) y ejecuta `node scripts/get-drive-refresh-token.mjs`.
  EL PASO QUE MÁS IMPORTA: publicar la app "In production"; si la dejas en
  "Testing", el refresh token caduca cada 7 días. Luego `pnpm dev` + `curl
  http://localhost:3000/health/drive` debe dar `{"status":"ok","drive":"up"}`, y el
  log debe mostrar TU cuenta.
- El scope es Drive completo (restringido): si el refresh token se filtra, alcanza
  todo tu Drive. Es una decisión que aceptaste con las alternativas delante
  (revocable en myaccount.google.com/permissions).
- Umbral de ADR-006 (config a mano vs. librería): con Drive vas por 7 variables;
  reevaluar de verdad cuando la feature 4 llegue a 8 y aparezca la primera variable
  que no sea un string plano. Nota en `docs/architecture.md:199-205`.

## 2026-07-25 — Feature 4: drive-structure (SDD)

- **Agente:** leader (orquestando) + spec-author + implementer + reviewer.
- **Plan:** flujo SDD completo con dos puertas de aprobación humana. spec-author
  redactó `specs/drive-structure/` (R1-R28 en EARS + design + T1-T20); la 1ª puerta
  cambió el modelo de identidad de banco a "Drive es el registro; crear es
  explícito" (R23-R28 nuevos) y la 2ª aprobó el umbral de sugerencia (Levenshtein
  ≤ 2, desempate alfabético). El implementer ejecutó las tasks en orden; el reviewer
  validó trazabilidad R↔test re-ejecutando todo.
- **Cambios (alto nivel):** creado `src/lib/drive-structure.ts` (servicio interno
  `files.*`: `ensureBankYearFolders`, `resolveBankFolder`, `createBank`,
  `uploadFile`, `moveFileToProcessed`, `findFolder`/`ensureFolder` idempotentes con
  lock en memoria, `normalizeBankName`/`validateYear`/`suggestBank` puras) +
  `drive-structure.test.ts` (26 casos con dobles, sin red). `GOOGLE_DRIVE_ROOT_FOLDER_ID`
  obligatoria (`env.ts`, `vitest.config.ts`, `env.test.ts`). Nueva clase
  `UnknownBankError` (`UNKNOWN_BANK`, 404). `driveErrorMessage` exportado de
  `drive.ts`. Guardianes de arquitectura (no `prisma`, no auth-wiring). Docs:
  ADR-008, `stack.md`, `api-contract.md` (`UNKNOWN_BANK` reservado, servicio
  interno), `.env.example`. Informe: `progress/implementations/drive-structure.md`.
- **Verificación:** `bash ./init.sh` → typecheck OK + **95 tests** en verde
  (baseline 61 + 34 nuevos) + `[OK] Entorno listo` (re-ejecutado por el reviewer).
  Suite hermética: verde sin credenciales reales de Drive y sin red (dobles del
  cliente + placeholder en `vitest.config.ts`). `format:check` verde.
- **Cierre:** feature 4 `drive-structure` → **done** (reviewer APPROVED; review en
  `progress/reviews/drive-structure.md`, resumen en
  `progress/summaries/drive-structure.md`). Pendiente del humano: **T20** (smoke
  real: crear `notas-banco/` a mano, pegar su fileId en `.env`, dar de alta un
  banco). ⚠️ Observación no bloqueante (ajena a la feature): `pnpm lint` roto por un
  bump sin commitear en `package.json` (`typescript ^6.0.3 → ^7.0.2`,
  `typescript-eslint 8.63 → 8.65`; typescript-eslint 8.65 no soporta TS 7.0) —
  `init.sh` no usa lint y está verde; alinear versiones y actualizar `docs/stack.md`
  es decisión de dependencias del humano. No quedan features `pending` en
  `feature_list.json`: esperar el siguiente `intent` del humano.

### Resumen de cierre

Fecha de cierre: 2026-07-25
Intención original: `feature_list.json` → feature `drive-structure`, bloque `intent`
Spec (SDD): `specs/drive-structure/`

#### Qué hace ahora la app que antes no

Ahora el backend sabe organizar físicamente el Drive del dueño para la ingesta:
asegura la estructura `notas-banco/<banco>/<año>/procesados/` colgando de una raíz
que tú creas a mano, sube archivos nuevos a la carpeta del banco/año, y mueve un
archivo a `procesados/` cuando se da por procesado. Antes solo sabía **conectarse**
a Drive (feature 3); no tocaba carpetas ni archivos.

Punto clave decidido por ti en la puerta: **Drive es el registro de bancos**. Un
banco existe si existe su carpeta bajo la raíz. La operación normal (asegurar/subir/
mover) **exige** que el banco exista y falla ruidosamente si no —con la lista de
bancos conocidos y una sugerencia del más parecido—, en vez de crear una carpeta
equivocada por un typo. Dar de alta un banco es una acción aparte y deliberada.

Es un **servicio interno** (funciones en `src/lib/`), sin endpoints de API: el
consumidor será la futura feature de ingesta, no el frontend.

#### Por dónde se usa (puntos de entrada)

Funciones públicas de `src/lib/drive-structure.ts` (reciben `fastify.drive` y
`fastify.config.driveRootFolderId` por parámetro; no hay HTTP):

- `ensureBankYearFolders(client, rootFolderId, bank, year)` — asegura
  `<banco>/<año>/procesados` (el banco debe existir) y devuelve los tres ids.
- `createBank(client, rootFolderId, bank)` — **único** camino de alta de un banco
  (idempotente).
- `resolveBankFolder(client, rootFolderId, bank)` — resuelve el banco existente o
  lanza `UnknownBankError`.
- `uploadFile(client, folderId, file)` — sube un archivo nuevo, devuelve su fileId.
- `moveFileToProcessed(client, fileId, folders)` — mueve el archivo a `procesados/`.
- `normalizeBankName`, `validateYear`, `suggestBank` — validación/ayuda puras.

#### Decisiones que se tomaron por ti

- (humano, puerta 2026-07-24) **Drive es el registro de bancos; crear es explícito.**
  La ruta normal exige que el banco exista (`resolveBankFolder`); el alta es una
  función aparte (`createBank`). Elegido sobre un flag `{create:true}` para que un
  typo no cree basura.
- (delegado) **Raíz por variable de entorno obligatoria** `GOOGLE_DRIVE_ROOT_FOLDER_ID`,
  validada al arrancar; el backend nunca crea la raíz. Campo hermano de `drive`.
- (delegado) **Servicio interno, sin endpoints.** No se abre superficie HTTP sin
  auth sobre un Drive con scope completo.
- (delegado) **Error nuevo `UnknownBankError`** (`UNKNOWN_BANK`, 404), distinguible
  de `ValidationError` (400) y `DriveConnectionError` (503).
- (delegado) **Idempotencia/carrera:** de-dup por la carpeta más antigua + lock en
  memoria por proceso (límite honesto: multi-instancia puede duplicar, pero de forma
  inofensiva).
- (añadido) **Rango de año fijo 2000-2100** (tests deterministas) y **umbral de
  sugerencia Levenshtein ≤ 2 con desempate alfabético** (aprobado en la 2ª puerta).

#### Qué NO se tocó / quedó fuera

- No lee ni parsea el contenido de los archivos, ni importa nada a la base de datos.
- No detecta "N nuevos" ni dispara la importación (eso es la feature de ingesta).
- No re-monta la conexión con Drive: consume `fastify.drive` de la feature 3.
- No crea la carpeta raíz `notas-banco/` (la creas tú a mano; ver `design.md §9`).
- No expone endpoints HTTP (los códigos `UNKNOWN_BANK` y `DRIVE_CONNECTION_ERROR`
  quedan **reservados** en el contrato).

#### Notas para el futuro

- **Pendiente tuyo (T20, smoke real):** crea `notas-banco/` en tu Drive, pega su
  fileId en `.env` como `GOOGLE_DRIVE_ROOT_FOLDER_ID`, y da de alta al menos un banco
  (subcarpeta a mano o `createBank`). El contacto real con Drive llegará con la ingesta.
- **Bloqueo de lint ajeno a la feature:** el árbol trae un bump sin commitear en
  `package.json` (`typescript ^6.0.3 → ^7.0.2`, `typescript-eslint 8.63 → 8.65`), y
  esa versión de typescript-eslint no soporta TS 7.0, así que `pnpm lint` falla al
  cargar el config (antes de mirar código). `init.sh` (tsc + tests) no usa lint y
  está verde. Conviene alinear versiones y actualizar `docs/stack.md` (aún dice
  `typescript@^6.0.3`).
- **`console.warn` diagnóstico** en `findFolder` cuando Drive tiene carpetas
  homónimas: exigido por el spec; las funciones son puras y no tienen logger. A
  migrar si algún día reciben uno.

## 2026-08-04 — Feature 5: drive-read (no-SDD)

- **Agente:** leader (orquestando) + implementer + reviewer. Feature **no-SDD**
  (sin spec formal; medida contra `intent` + `acceptance`).
- **Qué hace:** primera lectura de archivos de banco desde Drive, **sin parsear y
  sin base de datos**. `GET /api/ingesta/pending` detecta pendientes recorriendo
  TODAS las carpetas de banco (descubiertas dinámicamente de la raíz, no lista
  fija); `POST /api/ingesta/process` descarga cada pendiente tal cual, guarda una
  copia local gitignoreada en `var/drive-read/<banco>/<año>/<archivo>` y, solo si
  la copia se escribió, mueve el original a `procesados/` (reusa la f4). Fallo por
  archivo aislado. Consume f3 (conexión) y f4 (estructura).
- **Cambios (alto nivel):** nuevas ops de lectura en `src/lib/drive-structure.ts`
  (`listBankFolders`, `listYearFolders`, `listPendingFiles`, `downloadFileContent`)
  + módulo `src/modules/ingesta/` (routes + service + types) + tests con dobles.
  Guardianes: ingesta sin `prisma`, `.gitignore` tapa el volcado. **ADR-009**
  (endpoints HTTP sin auth, razonado frente al servicio interno de ADR-008);
  `api-contract.md` §Ingesta (los 2 endpoints; `DRIVE_CONNECTION_ERROR` ya en el
  cuerpo). Informe: `progress/implementations/drive-read.md`; resumen:
  `progress/summaries/drive-read.md`.
- **Smoke real Nivel 3 (2026-08-04, leader + humano):** end-to-end contra el Drive
  real → `pending` detectó `bankinter/2026/Movimientos_3_8_2026.xlsx`, `process` lo
  descargó (copia local de 8.548 bytes), lo movió a `procesados/` y `pending` volvió
  a 0. **El smoke cazó un fallo de configuración** invisible para los tests con
  dobles: `GOOGLE_DRIVE_ROOT_FOLDER_ID` en el `.env` tenía la **URL completa** de la
  carpeta en vez del fileId, así que `files.list` daba 404. Se endureció con
  **`normalizeDriveFolderId`** (`src/config/env.ts`): acepta el fileId pelado, la URL
  `/drive/folders/<id>` y `open?id=<id>`, extrayendo el id al arrancar. También se
  normalizó el campo `path` del response a barras `/` (antes salía con `\` en Windows).
- **Verificación:** `bash ./init.sh` → typecheck OK + **123 tests** en 11 archivos +
  `[OK] Entorno listo`; `lint` y `format:check` verdes. Sin red (dobles + tempdir);
  privacidad confirmada (`git check-ignore` sobre el volcado; ningún dato bancario
  trackeado). Sin variables de entorno ni dependencias nuevas.
- **Cierre:** feature 5 `drive-read` → **done** (reviewer APPROVED, review en
  `progress/reviews/drive-read.md`; los retoques post-review —normalización de la raíz
  y del `path`— con puertas verdes y smoke real superado). Límites conocidos (ADR-009):
  listas con `pageSize 1000` sin `nextPageToken`; la copia local se sobrescribiría con
  dos pendientes homónimos en el mismo banco/año (el original en Drive nunca se pierde).
  No quedan features `pending`: la siguiente (parser + modelo de datos del primer banco
  → BD) espera el `intent` del humano.

## 2026-08-04 — Feature 6: bankinter-parser (no-SDD)

- **Agente:** leader (orquestando) + implementer + reviewer. No-SDD (contra `intent` + `acceptance`).
- **Qué hace:** parsea un `.xlsx` de Bankinter (la copia local que dejó la f5) a
  movimientos estructurados, **sin base de datos ni persistencia**. Salta el
  preámbulo, extrae el IBAN, mapea las columnas reales y vuelca el resultado a un
  JSON local gitignoreado. `POST /api/parser/bankinter` (read-only: no persiste, no
  toca Drive, no mueve).
- **Modelo (ajustado a las columnas reales tras el smoke):** `MovimientoParseado {
  fechaContable, fechaValor (ISO), descripcion, importe (number con signo), saldo
  (number), divisa, tipo 'ingreso'|'gasto' }` dentro de `BankinterParseResult {
  banco, cuentaIban, movimientos[], noReconocidas[] }`. El extracto real trae
  `Fecha contable | Fecha valor | Descripción | Importe | Saldo | Divisa` (no
  `Concepto`/`Tipo de movimiento`, que eran etiquetas del preámbulo); se quitaron
  esos campos y se añadieron `saldo`/`divisa`. El `saldo` (saldo corrido) reforzará
  el dedup en la feature de persistencia.
- **Cambios (alto nivel):** módulo `src/modules/bankinter/` (parser + service +
  routes + types + fixture) + tests con fixture sintético (sin datos reales, sin
  red). Dependencia **`exceljs@^4.4.0`** (ADR-010; elegida sobre SheetJS `xlsx` por
  CVEs sin parchear). Guardián: parser sin `prisma`; `var/parsed/` en `.gitignore`.
  `api-contract.md` (endpoint + modelo), `architecture.md` (ADR-010). Informe:
  `progress/implementations/bankinter-parser.md`; resumen:
  `progress/summaries/bankinter-parser.md`.
- **Smoke real Nivel 3 (2026-08-04, leader + humano):** `POST /api/parser/bankinter`
  sobre la copia local real → **39 movimientos, 0 no reconocidas**, IBAN extraído,
  fechas ISO, importe con signo, saldo, divisa EUR, tipo por signo. Volcado en
  `var/parsed/bankinter/2026/...json` (gitignoreado).
- **Verificación:** `bash ./init.sh` → typecheck OK + **146 tests** + `[OK]`; lint y
  format verdes. Privacidad confirmada (volcado gitignoreado; ningún dato real
  trackeado).
- **Cierre:** feature 6 `bankinter-parser` → **done** (reviewer APPROVED, review en
  `progress/reviews/bankinter-parser.md`). No bloqueante: un importe `0` cae hoy en
  `ingreso` (el acceptance no define el cero). No quedan features `pending`. La
  siguiente es la **persistencia** (guardar los movimientos en BD + dedup), que el
  humano ya está diseñando en `docs/data-model.md` (esquema Account/Category/Movement
  con `importHash`, `pending_review`, traspasos como dos filas).

## 2026-08-06 — Feature 8: data-model (SDD)

> Informe completo del implementer:
> [`progress/implementations/data-model.md`](implementations/data-model.md).
> Review: [`progress/reviews/data-model.md`](reviews/data-model.md).
> Resumen de cierre: [`progress/summaries/data-model.md`](summaries/data-model.md).

- **Agente:** leader (orquestando) + spec-author + **puerta humana (4 correcciones)**
  + implementer + reviewer. SDD: `specs/data-model/{requirements,design,tasks}.md`
  fue la fuente de verdad, no el `acceptance` original.
- **Qué hace:** fija la **base de datos real del flujo de dinero**. Reemplaza el
  `Expense` + `Category` placeholder del bootstrap por `Account` / `Category`
  (jerárquica, un nivel) / `Movement`, en inglés y alineado con el parser (f6/f7).
  Expone `/api/accounts` (POST, GET, GET `:id`), `/api/categories` (POST, GET) y
  `/api/movements` (**solo GET**), más el servicio reutilizable de auto-alta de
  cuenta que consumirá la importación.
- **Las cuatro correcciones humanas en la puerta (todas respetadas):**
  1. **No hay endpoint de traspasos.** Un traspaso son **dos movimientos ordinarios
     que ya llegan de los extractos** (gasto en origen, ingreso en destino),
     enlazados por `transferId`; crearlos por API los duplicaría. Sin
     `createTransfer`, sin `POST /transfer`, sin `MovementType.transfer`, sin enum
     ni columna `direction`. `transferId` queda como **columna reservada** (nadie la
     escribe todavía; el emparejado es una feature posterior).
  2. **No hay alta ni borrado manual de movimientos.** El módulo `movements` es de
     **solo lectura**: entran únicamente por importación. `Movement` nace
     `origin=imported` / `status=pending_review`. R12, R14-R17 retirados.
  3. **El saldo se LEE del extracto**, no se suma: `balanceAfter` del movimiento más
     reciente (`bookingDate DESC, daySequence DESC`). La suma desde `initialBalance`
     es solo el plan B de una cuenta sin saldo corrido importado.
  4. **`Movement.daySequence`** (posición dentro del `bookingDate`) entra en la clave
     del índice único parcial de dedup. Sin ella, las **tres** líneas idénticas
     legítimas `TRANS INM/ OTRO BANCO −850,00` del mismo día de la muestra real se
     habrían tomado por duplicados: −2.000 € perdidos en silencio.
- **Cambios (alto nivel):** `prisma/schema.prisma` reemplazado (6 enums + 3 modelos);
  migración `20260806191700_data_model` con **DROP + CREATE** y los **dos índices en
  SQL crudo** (dedup parcial `WHERE origin='imported'` y raíz de categorías con
  `NULLS NOT DISTINCT`, Postgres 17); módulos nuevos `accounts/`, `categories/` y
  `movements/`; **borrado** `src/modules/expenses/`; errores nuevos `ConflictError`
  (409) y `MissingAccountDataError` (422, **reservado**); helpers de dominio
  `deriveMovementTypeFromAmount`, `computeAccountBalance`, `computeTotals`;
  `architecture.test.ts` endurecido (árbol nuevo, rutas sin `prisma`, `movements`
  read-only, `/api/expenses` → 404, tablas viejas ausentes en BD). **Sin
  dependencias ni variables de entorno nuevas.**
- **Docs:** `api-contract.md` (**breaking change** visible + modelos y endpoints
  nuevos + códigos `CONFLICT` y `MISSING_ACCOUNT_DATA`), `data-model.md` reescrito al
  modelo final (cierra sus puntos abiertos 1 y 2), `architecture.md` con **ADR-011**
  y el árbol actualizado. `stack.md` sin cambios.
- **Verificación:** `bash ./init.sh` → typecheck OK + **197 tests** en 16 archivos +
  `[OK] Entorno listo` (la suite estaba en 146); `lint` y `format:check` verdes.
  Además, historial de migraciones aplicado sobre una **BD limpia** creada al efecto
  (`migrate deploy` → solo `Account`/`Category`/`Movement`; `migrate status` al día;
  `migrate diff` → *empty migration*, **sin drift** pese a los índices fuera del
  schema). Trazabilidad de los **27 requirements vigentes** (R1-R11, R3b, R13,
  R18-R20, R25-R37) en el informe; **R32 y R36 son de proceso** (checklist del
  reviewer, sin superficie ejecutable) y de **R18** el "no existe endpoint" lo
  verificó el reviewer sobre el diff.
- **Cierre:** feature 8 `data-model` → **done** (reviewer **APPROVED**). **Breaking
  change** asumido: `/api/expenses*` responde 404 y las tablas del bootstrap
  desaparecen (eran placeholder sin datos). Aún **no consumido por el frontend**.
  Límites conocidos anotados en ADR-011: un día del extracto partido entre dos
  descargas reempezaría en `daySequence = 1` (duplicado **visible**, no pérdida);
  `GET /api/movements` sin paginación; carrera pendiente de blindar en
  `findOrCreateAccountFromMetadata` cuando la importación lo llame. La siguiente es
  la **importación** (mapear el JSON del parser a la BD invirtiendo el array de
  Bankinter, auto-alta de cuenta, dedup y mover a `procesados/`); después,
  **categorización por reglas** y **detección de traspasos**.

## 2026-08-11 — Feature 9: investments-data-model (SDD)

> Informe completo del implementer:
> [`progress/implementations/investments-data-model.md`](implementations/investments-data-model.md).
> Review: [`progress/reviews/investments-data-model.md`](reviews/investments-data-model.md).
> Resumen de cierre: [`progress/summaries/investments-data-model.md`](summaries/investments-data-model.md).

- **Agente:** leader (orquestando) + spec-author + **puerta humana (2 decisiones
  confirmadas)** + implementer + reviewer. SDD:
  `specs/investments-data-model/{requirements,design,tasks}.md` (28 requirements,
  20 tasks) fue la fuente de verdad, no el `acceptance` original.
- **Qué hace:** llena el hueco que la feature 8 dejó reservado a propósito — ahora
  la base de datos sabe guardar **inversiones**. `InvestmentProduct` es la
  abstracción única del producto (banco, nombre, tipo, divisa, alta y cierre) con
  las **cuatro columnas del depósito dentro y nullable** (capital, TAE, ganancia
  final, vencimiento); `Valuation` es la **foto** de un producto en una fecha
  (invertido, valor de mercado, ganancia, porcentaje, efectivo sin invertir), que
  conserva la **serie** mes a mes. **Alcance idéntico al de la feature 8 con el
  flujo: solo esquema + migración.** Sin endpoints, sin parser, sin importador y
  sin servicio.
- **Las dos decisiones de la puerta humana (confirmadas tal cual las proponía el
  spec):**
  1. **Que un depósito no tenga valoraciones es regla del SERVICIO, no de la BD.**
     Se conserva el **cero SQL crudo**: los tres índices son declarativos, Prisma
     los conoce y el esquema no puede desincronizarse. Un `CHECK` además **no
     puede consultar otra tabla** (haría falta un trigger). Coste asumido y
     escrito: hoy nada impide insertar una `Valuation` sobre un `deposit`, y hay
     un test que lo deja como **límite conocido** y se pondría rojo si alguien
     añadiera el `CHECK` en silencio.
  2. **Los importes se quedan en `Decimal(10,2)`** (techo ~100 M €), heredado del
     flujo: que las dos capas tengan el mismo techo importa más que el techo. Si
     se sube, se sube **en las dos a la vez**.
- **Cambios (alto nivel):** `prisma/schema.prisma` **+77 líneas y −0** (enum
  `InvestmentProductType` de cuatro valores, `model InvestmentProduct`, `model
  Valuation` y, dentro de `Movement`, la columna reservada `productId` con su
  relación e índice); migración `20260811152117_investments` **100 % generada**,
  sin una línea de SQL a mano, sin `CHECK`, sin `DROP` ni `ALTER COLUMN` sobre el
  flujo; módulo nuevo `src/modules/investments/` con **un solo archivo**, su test
  (`investments.model.test.ts`); `architecture.test.ts` con **una entrada aditiva**
  al árbol. **Sin dependencias ni variables de entorno nuevas** → `stack.md` sin
  tocar. Deliberadamente **no** se escribió el guardián de "esta carpeta solo tiene
  un archivo": el módulo está diseñado para crecer con el servicio del importador.
- **Decisiones delegadas que cierra (ADR-012):** clave natural `(bank, name)` para
  el producto —cae el `isin`: el nombre lo escribe el humano en su propio fichero,
  luego es estable— y `(productId, date)` para la foto; **recargar el mismo fichero
  es un UPSERT** que gana el último, **al revés que el flujo**, donde un duplicado
  importado se descarta (una valoración es una medición que puede corregirse, un
  movimiento es un hecho inmutable); **`interestRate` es la TAE en PORCENTAJE**
  (`2.7500` = 2,75 %) y del depósito se guarda **una sola**, la aplicada; y ✅ el
  único punto capaz de dar un patrimonio equivocado, **`marketValue` NO incluye
  `uninvestedCash`**, confirmado por el humano y por la aritmética de las muestras
  reales (cifras **inventadas** desde la F14: `8.250,45 + 1.250,15 = 9.500,60`, con
  los `75,25 €` fuera): el
  patrimonio de un producto es **su suma**, sin doble conteo.
- **Docs:** `data-model.md` retitulado a `# Modelo de datos`, con **cinco reglas**
  (nuevas: *la valoración se lee, no se calcula* y *una aportación no se crea, se
  marca*), `## Parte 1 — Flujo` (prosa intacta) y `## Parte 2 — Inversiones` nueva;
  `architecture.md` con **ADR-012** y el árbol actualizado; `api-contract.md` con
  una nota de que la capa de inversiones **no expone endpoints todavía** (y que
  `Movement.productId` no se filtra a la respuesta: `serializeMovement` mapea campo
  a campo).
- **Verificación:** `bash ./init.sh` → typecheck OK + **220 tests** en 17 archivos
  + `[OK] Entorno listo` (la suite estaba en **197 / 16**: **+23 tests, +1 fichero,
  0 tests modificados**, que es la prueba de que la capa es aditiva); `lint` y
  `format:check` verdes; `prisma migrate dev` posterior responde *"Already in
  sync"* → **cero drift**. El reviewer verificó además de forma independiente el
  **77/0** del schema, aplicó el historial sobre una **BD limpia** creada al efecto
  y comprobó una a una las **21 referencias de línea** del mapa de trazabilidad.
  De los 28 requirements, **nueve son de proceso** (R17, R18, R19, R21, R23, R24,
  R25, R26, R27), verificados por checklist sobre el diff.
- **Cierre:** feature 9 `investments-data-model` → **done** (reviewer
  **APPROVED**). Dos desviaciones declaradas y aceptadas: se **revirtió el
  realineado de `prisma format`** sobre líneas preexistentes de `model Movement`
  para que el diff fuera estrictamente aditivo (el schema queda fuera de la forma
  canónica, como ya estaba), y las secciones de la Parte 1 de `data-model.md`
  **bajaron un nivel de encabezado** con la prosa intacta. Límites conocidos: la BD
  no impide una valoración sobre un depósito, y **renombrar** un producto en el
  fichero crearía uno nuevo dejando la serie colgando del nombre viejo (precio de
  la clave natural). Columnas reservadas sin escritor: `Movement.productId`,
  `InvestmentProduct.closedAt` y `openedAt` (esta última **sin escritor previsto**:
  el fichero no lleva el campo). ⚠️ **Deuda anotada, no aplicada:** quien escriba
  `Movement.productId` deberá excluir en esa misma feature los movimientos con
  producto de `computeTotals`, o las aportaciones mensuales seguirán contando como
  gasto. Y 📌 **deber del humano:** la cuenta corriente de MyInvestor hay que darla
  de alta **a mano** y con un `initialBalance` correcto — su extracto no trae IBAN
  ni saldo por línea, así que ese saldo inicial será el **único ancla** de esa
  cuenta. Orden acordado a partir de aquí: **F11 → F10 → F12**.

## 2026-08-11 — Tareas de harness previas a la F9 (archivadas a posteriori)

> Se añaden **después** de la entrada de la feature 9 aunque ocurrieron antes que
> ella: se quedaron en `current.md` y se archivan al cerrar la sesión, sin editar
> nada anterior (append-only).

### (1) El mapa del proyecto: `docs/roadmap.md`

- **Agente:** leader (sin tocar código de aplicación).
- **Plan:** el humano sintió que perdía el control del proyecto al leer una spec
  con decisiones que no recordaba. La causa real era otra: `docs/ideas.md` del
  workspace llevaba desde el 2026-08-04 sin actualizarse y **contradecía al código
  en cinco puntos** del modelo del flujo (cuenta de efectivo, `type = transfer`,
  alta manual de movimientos, dedup sin `daySequence`, «será la feature 6»).
- **Cambios:** nuevo [`docs/roadmap.md`](../docs/roadmap.md) — el recorrido en
  diez etapas (E0–E9) con su estado, el eje «por cada banco» que la lista plana de
  features escondía, seis cabos sueltos con su columna de «lo resuelve» y los
  deberes del humano. Cableado al harness para que se lea al empezar
  ([`AGENTS.md`](../AGENTS.md) §1 y §2, `CLAUDE.md`,
  [`.claude/agents/leader.md`](../.claude/agents/leader.md)) y **se actualice al
  cerrar** cada feature (§5, en el mismo paso en que se vacía `current.md`).
  `docs/ideas.md` corregido: las cinco divergencias marcadas con 🔄 y su fecha —no
  borradas, para ver qué se decidió y cuándo cambió—, y la tabla «de idea a
  features» rellena tras diez features vacía.
- **Verificación:** sin código; `./init.sh` en verde (197 tests, 16 ficheros).
- **Cierre:** responde a «¿por dónde voy?», la pregunta que ninguno de los otros
  cuatro documentos de estado contestaba.

### (2) Reordenar leer → parsear → guardar, y el contrato que faltaba

- **Agente:** leader.
- **Plan:** el humano preguntó si el parser debía ir a la par de la lectura y si
  debía basarse en el modelo de la BD. Revisando el código apareció un hallazgo
  urgente **porque la F10 estaba en la puerta y lo iba a cementar**:
  `ParsedMovement`, `UnparsedRow` y `ParsedMovementType` viven dentro de
  [`src/modules/bankinter/bankinter.types.ts:9`](../src/modules/bankinter/bankinter.types.ts#L9)
  y la spec de F10 los volvía a declarar, **ya divergiendo** (Bankinter emite
  `income|expense`; MyInvestor `income|expense|neutral`). La versión correcta de
  tres vías existía desde la F8 en
  [`movements.service.ts:33`](../src/modules/movements/movements.service.ts#L33)
  y los dos parsers la reimplementaban mal. El design de la F8 lo había predicho
  por escrito (`specs/data-model/design.md:584`).
- **Cambios:** orden nuevo **F9 → F11 → F10 → F12** (E3 y E4 intercambiadas en el
  roadmap: el modelo va antes que los parsers porque la salida del parser se
  deriva de él). Dos features nuevas en `feature_list.json`: **F11
  `parsed-movement-contract`** (saca los tipos a un módulo compartido, `balance` y
  `accountIban` opcionales, `type` a tres vías reutilizando el helper y
  `daySequence` emitido por cada parser; único cambio de comportamiento: el
  importe 0 pasa de `income` a `neutral`) y **F12 `import`**. Norma escrita en
  [`docs/conventions.md`](../docs/conventions.md) §Parsers de banco: un parser por
  banco, y **el contrato no es el modelo de la BD** aunque se derive de él. Del
  banco #3 en adelante, parser e importación son **una sola feature**.
- **Bonus — agujero de encoding:** al añadir las features, `init.sh` se puso rojo
  (`'charmap' codec can't decode byte 0x8f`): su validador de Python abría
  `feature_list.json` sin declarar encoding y en Windows caía a `cp1252`. Es el
  mismo incidente que el frontend tuvo en su feature #5 (commit `9649ec1`, «se
  ataca la causa, no el síntoma») y que al backend nunca le llegó. Arreglado igual
  que allí: `init.sh:425` → `open(..., encoding="utf-8")`, regla en
  `docs/conventions.md` §Idioma y **`.editorconfig` creado** (el backend no tenía).
- **Verificación:** `./init.sh` en verde — 197 tests, 16 ficheros, 12 features.
- **Cierre:** ⚠️ los `intent` de F11 y F12 son **borrador del agente**, marcados
  con `_intent_es_borrador` en `feature_list.json`. El QUÉ es del humano: hasta que
  los cierre no se deriva `acceptance` ni se lanza a nadie. La F10 se
  **re-especifica** contra el contrato de la F11 con changelog de cinco líneas
  (`docs/specs.md` §Regla 3), no reescribiendo el documento.

---

## 2026-08-11 — Feature 11: parsed-movement-contract (no-SDD)

> Informe completo del implementer:
> [`progress/implementations/parsed-movement-contract.md`](implementations/parsed-movement-contract.md).
> Review: [`progress/reviews/parsed-movement-contract.md`](reviews/parsed-movement-contract.md).
> Resumen de cierre: [`progress/summaries/parsed-movement-contract.md`](summaries/parsed-movement-contract.md).

- **Agente:** leader (orquestando) + **cierre del `intent` por el humano** +
  implementer + reviewer. Sin SDD: el contrato fueron el `intent` y los **10
  criterios de `acceptance`** de `feature_list.json`.
- **Qué hace:** «cómo es un movimiento parseado» deja de vivir **dentro** del
  módulo de Bankinter y pasa a un único archivo compartido que no es de ningún
  banco, [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts)
  (`ParsedMovementType`, `ParsedMovement`, `UnparsedRow`, `ParsedStatement<Bank>`
  y el helper `assignDaySequence`). Bankinter se queda solo con lo suyo:
  [`BankinterParseResult = ParsedStatement<'bankinter'>`](../src/modules/bankinter/bankinter.types.ts#L14).
  Un banco nuevo **se adapta al contrato**; lo que se comparte es la FORMA de la
  salida, **nunca** el código que lee el formato.
- **Las dos decisiones que cerró el humano:**
  1. **El importe 0 pasa de `income` a `neutral` aquí**, reutilizando
     [`deriveMovementTypeFromAmount`](../src/modules/movements/movements.service.ts#L33)
     de la F8 en vez de reimplementar la regla del signo. Es el **único** cambio
     de comportamiento de la feature y **cierra el cabo suelto #2** del roadmap.
  2. **`daySequence` lo emite cada parser**, no el importador: `1` es el
     movimiento **más antiguo** de su `bookingDate`. Lo único bank-specific es
     decir en qué sentido exporta el banco
     ([`statementOrder = 'newest-first'`](../src/modules/bankinter/bankinter.parser.ts#L10),
     verificado con los saldos de la muestra real: 10 000,00 − 45,37 = 9 954,63).
- **Decisiones delegadas (ADR-013 en [`docs/architecture.md`](../docs/architecture.md)):**
  el contrato vive en `lib/` («lo que usan todos y no es de nadie»; `modules/` es
  un directorio por recurso); **el dato que no viene en el fichero es `null`**,
  nunca `0` ni `''` —con la clave presente en el JSON volcado—, que es lo que
  necesita MyInvestor (no trae ni saldo ni IBAN); y el contrato **no gana nada
  más** para el importador (`origin`, `status`, `transferId`, `accountId` los pone
  él: meterlos aquí lo convertiría en el modelo de la BD).
- **Cambios (alto nivel):** dos archivos nuevos (`src/lib/parsed-statement.ts` y
  su test); `bankinter.types.ts` pierde las tres declaraciones propias;
  `bankinter.parser.ts` importa el contrato, numera con `assignDaySequence` y
  devuelve `accountIban: null` en vez de `''` cuando el extracto no lo trae.
  **Tres guardianes nuevos** en `src/architecture.test.ts`: ninguna segunda
  declaración de esos tipos en `src/`, el contrato sin BD y **sin ningún import**,
  y todo `*.parser.ts` usando el helper del signo. Docs: **ADR-013**,
  `docs/conventions.md` §Parsers de banco apuntando ya al archivo y sus líneas, y
  `docs/api-contract.md` con la nota de **breaking change** (`type` puede ser
  `"neutral"`, `daySequence` nuevo, `accountIban`/`balance` pueden ser `null`)
  **aún no consumido por el frontend**.
- **Hallazgo registrado:** **no existía** ningún test que fijara el comportamiento
  viejo del importe 0 (`0 → income`); la regla vivía solo en un ternario del
  parser. El reviewer lo confirmó con `git show HEAD`. Se añadió el test que
  faltaba, ya con el comportamiento nuevo.
- **No regresión demostrada:** el test
  `produces exactly the same movements and values as before the shared contract`
  compara con `toEqual` el **resultado entero** (5 movimientos campo a campo + la
  fila 15 no reconocida) contra los valores de la F7; el reviewer verificó que no
  es un subconjunto. Las funciones que leen el formato (cabecera, fechas,
  importes) están **intactas**.
- **Verificación:** `./init.sh` en verde — **233 tests en 18 ficheros** (línea base
  220/17: +13). `lint` y `format:check` también verdes. Sin dependencias ni
  variables de entorno nuevas; **sin tocar Prisma ni la base de datos**.
- **Cierre:** reviewer **APROBADO**; feature 11 marcada `done`. Nits del reviewer
  aplicados (rótulos de enlace de `conventions.md`, prosa «1 = el más antiguo del
  día» en vez de «el primero», y el supuesto de que `daySequence` **solo numera lo
  parseado** escrito en el contrato y en ADR-013 para quien haga la F12).
  Fuera de scope y anotados, no aplicados: renombrar `balance` → `balanceAfter` y
  `currency: ''` → nullable. **Siguiente paso acordado: re-especificar la F10
  (MyInvestor) contra este contrato** — su `design.md` §13 todavía declara
  `MyinvestorMovement`, `balanceAfter` y `providesBalance`.

---

## 2026-08-11 — Feature 10: myinvestor-statement (SDD)

> Informe completo del implementer:
> [`progress/implementations/myinvestor-statement.md`](implementations/myinvestor-statement.md).
> Review: [`progress/reviews/myinvestor-statement.md`](reviews/myinvestor-statement.md).
> Resumen de cierre: [`progress/summaries/myinvestor-statement.md`](summaries/myinvestor-statement.md).
> Spec: [`specs/myinvestor-statement/`](../specs/myinvestor-statement/decisions.md).

- **Agente:** leader (orquestando) + spec-author (re-especificación y corte) +
  implementer + reviewer. **SDD**: puerta de aprobación humana pasada el
  2026-08-11 sobre un `decisions.md` **sin ningún punto 🔴**.
- **⚠️ La antigua F10 `myinvestor-parser` se partió en dos** (aprobado por el
  humano; historial en
  [`CHANGELOG-respec.md`](../specs/myinvestor-statement/CHANGELOG-respec.md)):
  tenía **70 requirements** —muy por encima del tope de ~15 de `docs/specs.md`
  §2— y sus cinco puntos rojos pendientes eran **todos** del JSON de producto.
  - **F10 `myinvestor-statement`** (esta): **el extracto CSV** que genera el
    banco. Formato que no se elige.
  - **F13 `myinvestor-products`**: **los JSON de producto**, que escribe el
    humano a mano y cuyo formato **sí** se diseña. Sigue en `spec_ready`
    esperando sus cinco 🔴. **Aquí no se escribió ni una línea de eso.**
  - La numeración `R<n>` **no se tocó** al repartir: los huecos de cada spec son
    la otra feature, y cada documento dice dónde buscarlos.
  - Además, la spec se **re-especificó** antes contra el contrato de la F11
    (fuera `MyinvestorMovement`, `balanceAfter` → `balance`, fuera
    `providesBalance`, y `daySequence` nueva).
- **Qué hace:** el backend entiende el **extracto de la cuenta corriente de
  MyInvestor** (`.csv` separado por `;`) y lo convierte en movimientos
  estructurados volcados a un JSON local revisable. **Segundo banco con parser
  propio**: la norma «un parser por banco» pasa de escrita a demostrada.
  Endpoint `POST /api/parser/myinvestor` (mismo prefijo `/api/parser` que
  Bankinter). **Sin base de datos, sin Prisma, sin mover nada en Drive y sin
  interfaz.**
- **Lo que este banco NO da, dicho en voz alta:** `balance: null` en **todos** los
  movimientos y `accountIban: null` en el resultado — clave **presente y nula**,
  nunca `0`, nunca `''` y **sin ningún campo aparte que lo anuncie**
  (`providesBalance` lo descartó ADR-013). El parser **no acumula ni calcula
  ningún saldo**, ni en una variable local.
- **Conformidad con el contrato de la F11:** el módulo **consume**
  [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts) y solo declara
  [`MyinvestorStatementResult = ParsedStatement<'myinvestor'>`](../src/modules/myinvestor/myinvestor.types.ts#L19);
  emite `daySequence` con `assignDaySequence(drafts, statementOrder)` y
  [`statementOrder = 'newest-first'`](../src/modules/myinvestor/myinvestor.statement.parser.ts#L9)
  (verificado sobre la muestra real), con las filas de `unparsedRows` **sin
  consumir número**; y **importa** `deriveMovementTypeFromAmount` (importe 0 →
  `neutral`).
- **Decisiones delegadas (ADR-014 en [`docs/architecture.md`](../docs/architecture.md)):**
  módulo `src/modules/myinvestor/` (slug de `normalizeBankName`); CSV leído como
  texto delimitado **sin ninguna librería** (cero dependencias nuevas, y
  **prohibido** usar el parser de CSV transitivo de `exceljs`); cabecera
  localizada **por nombre** de columna con prefijo ASCII para la única acentuada;
  **el banco sale de la carpeta y el parser lo decide la extensión**
  (`.csv` → extracto; el resto → `ignored[]`); errores por archivo aislados en
  `failed[]` con respuesta **200**; y volcado determinista en
  `var/parsed/myinvestor/<año>/` con rutas **relativas**.
- **Cambios (alto nivel):** 10 archivos nuevos en `src/modules/myinvestor/`
  (tipos, formato, parser puro, servicio, ruta, fixture sintético y 4 tests);
  `src/app.ts` registra la ruta; **3 guardianes nuevos** en
  `src/architecture.test.ts` (módulo sin `prisma`, aislamiento entre módulos de
  banco, slug = nombre del módulo) y 10 entradas al árbol esperado. Docs:
  **ADR-014** + árbol, `docs/api-contract.md` con el endpoint y el modelo, y
  **`docs/dar-de-alta-un-banco.md` gana el paso que le faltaba**: dar de alta un
  banco obliga a crear **su módulo de parser**.
- **Piezas que la F13 va a consumir y que quedan construidas con el nombre y la
  ubicación que su spec da por hechos** (verificado por el reviewer, su spec no
  queda mintiendo): `parseAmountText` en `myinvestor.format.ts`, el recorrido +
  `failed[]` + `ignored[]` + aislamiento + determinismo en
  `myinvestor.service.ts`, la ruta en `myinvestor.routes.ts` y
  `FailedFile`/`IgnoredFile` en `myinvestor.types.ts`.
- **Verificación:** `./init.sh` en verde — **280 tests en 22 ficheros** (línea
  base 233/18: **+47 tests, +4 ficheros**). `lint`, `format:check` y `typecheck`
  también verdes. **Sin dependencias, sin variables de entorno y sin tocar Prisma
  ni la base de datos.** Fixtures **sintéticos**, sin red: ningún dato financiero
  real se versiona.
- **Cierre:** reviewer **APROBADO con cero cambios requeridos**; feature 10
  marcada `done`. Verificó a mano la aritmética de `daySequence` contra el
  fixture, confirmó el `'newest-first'` sobre la muestra real y juzgó que el test
  que lee el fuente del parser **vale y no es tautológico** (cubre el acumulador
  local que un test de salida no puede ver). Dio la razón a las dos declaraciones
  del implementer.
- **Cuatro anotaciones NO bloqueantes del reviewer — deuda conocida, no
  despistes:**
  1. **Redacción de R2.** Pide un guardián de que «ningún archivo de `src/`
     importa `modules/myinvestor/`», lo que **contradice su propio `design.md`
     §1 y R51** (la ruta hay que registrarla en `app.ts`). El guardián
     implementado exige que el **único** importador externo sea `app.ts` y que
     ningún módulo de banco nombre a otro. El defecto es del spec, no del código.
  2. **`error` vs `reason`.** Bankinter devuelve los fallos con la clave `error`
     y MyInvestor con `reason` (lo que pedía el spec). Unificarlo exigía tocar el
     módulo de Bankinter, que las tasks prohibían: **se hizo bien en no tocarlo**.
     Conviene unificarlo la próxima vez que se toque ese endpoint, **antes** de
     que el frontend consuma los dos.
  3. **Un `;` dentro de un campo** se reporta como «número de columnas
     inesperado» en `unparsedRows` en vez de parsearse (no hay soporte de
     comillas). Visible, no silencioso; anotado en el ADR-014 para reevaluarlo
     con el caso real delante.
  4. **Matiz del `row` 1-based:** el número que se reporta es el de **línea del
     archivo**, así que con un preámbulo por delante no coincide con «la enésima
     fila de datos». Es lo que se quería (coincide con lo que ve el humano al
     abrir el archivo), pero conviene tenerlo presente al leer un `reason`.
- **Consecuencias operativas para el humano (siguen en pie):** sin IBAN, **la
  cuenta corriente de MyInvestor hay que darla de alta a mano** por
  `POST /api/accounts` (`findOrCreateAccountFromMetadata` devolvería
  `MISSING_ACCOUNT_DATA`, 422); y sin saldo en el archivo, **`initialBalance` es
  el único ancla** del saldo de esa cuenta — la rama que ADR-011 describía como
  excepcional pasa a ser la normal para este banco.

- 2026-08-12 — F12 `import`: la app **guarda datos de verdad** — `POST /api/import` baja de Drive, parsea, escribe los movimientos en su cuenta (creada sola con el IBAN del fichero) y solo entonces mueve el fichero a `procesados/`; reimportar no duplica. De paso, `ingesta` → `ingestion` (`/api/ingesta/*` → 404) → [resumen](summaries/import.md)

- 2026-08-12 — F13 `myinvestor-products`: el módulo de MyInvestor lee ya **su segunda entrada** — los `.json` de producto de inversión que escribes a mano (fondo, ETF, cartera y depósito) — desde el mismo `POST /api/parser/myinvestor`, encaminados por extensión, con los errores de cada archivo acumulados en un solo motivo y un `products.json` por año para revisarlos. Sin base de datos → [resumen](summaries/myinvestor-products.md)

- 2026-08-12 — F14 `no-real-data`: el repositorio deja de guardar datos financieros tuyos y deja de depender de que alguien se acuerde — `src/no-real-data.test.ts` **falla en la suite** señalando archivo, línea y motivo cuando reaparece uno, con dos capas (IBAN por checksum, siempre activa; comparación contra las capturas de `var/`, que **se salta diciéndolo** si no están o están a medias). De paso salió y se limpió lo que quedaba desde la F6, incluido tu IBAN real en un test → [resumen](summaries/no-real-data.md)

- 2026-08-13 — F15 `product-opened-at`: el `.json` de producto de inversión que escribes a mano lleva ya **la fecha de apertura** (`openedAt`, `AAAA-MM-DD`), **obligatoria en los cuatro tipos** — se lee antes de bifurcar depósito/resto, así que lo es de verdad y no solo donde se probó; sin ella el archivo sale como fallido nombrando el campo, en el motivo único de siempre, sin tumbar el resto del lote. Cierra el cabo suelto nº 9: la columna `openedAt` de la F9 deja de estar condenada a `NULL`. Sin tocar Prisma ni persistir nada → [resumen](summaries/product-opened-at.md)

- 2026-08-15 — F17 `statement-encoding-guard`: un extracto `.csv` que no esté guardado en UTF-8 **se rechaza entero** en vez de leerse igualmente — hasta hoy un guardado en cp1252 convertía la `Ó` de los conceptos en `�` de forma irreversible y el parseo aparentaba ir perfecto (11 movimientos, cero filas sin parsear). Ahora falla en voz alta, como fallo **de ese archivo** (`NOT_UTF8`, dentro del 200) diciendo el byte, la línea y que lo vuelvas a guardar en UTF-8; el resto del lote se parsea igual y el archivo no se mueve a `procesados/`. El backend no aprende cp1252 ni adivina codificaciones (ADR-018) → [resumen](summaries/statement-encoding-guard.md)
