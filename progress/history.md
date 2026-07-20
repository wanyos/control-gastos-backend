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
