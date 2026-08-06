# Review — feature 8 `data-model`

**Veredicto: APROBADO (APPROVED)**

- **Fecha:** 2026-08-06
- **Revisado contra:** `specs/data-model/{requirements,design,tasks}.md`,
  `progress/implementations/data-model.md`, `docs/architecture.md`,
  `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`.
- **Alcance del diff revisado:** working tree vs. commit `4caeb38`. Los cambios de
  `src/modules/bankinter/*` que aparecen sin commitear son de la **F7
  `parser-english`**, ya aprobada; no forman parte de esta review.
- **`bash ./init.sh` ejecutado por el reviewer:** **verde** — typecheck OK,
  **16 archivos / 197 tests pasando**, `[OK] Entorno listo`. Complementario:
  `pnpm run lint` sin avisos y `pnpm run format:check` → *All matched files use
  Prettier code style!*.
- **`feature_list.json`: NO se ha tocado.** La feature sigue `in_progress`;
  marcarla `done` es del `implementer` tras esta aprobación.

---

## 1. Las cinco comprobaciones específicas de la puerta humana

### 1.1 No existe superficie de traspasos — OK

| Qué se buscó | Resultado |
| --- | --- |
| ruta `/api/movements/transfer` | **No existe.** `movements.routes.ts:15-22` solo registra `fastify.get('/')`. |
| servicio `createTransfer` | **No existe** en todo `src/` (grep sobre el árbol completo). |
| valor `transfer` en `MovementType` | **No existe**: `prisma/schema.prisma:29-33` = `expense income neutral`; migración `migration.sql:19` = `('expense','income','neutral')`. Guardado por `movements.test.ts:552`. |
| enum / columna `direction` | **No existe**: ni `MovementDirection` en el schema ni en el cliente generado. Guardado por `movements.test.ts:557` (`Object.keys(prismaEnums)` sin `MovementDirection`) y `movements.test.ts:470` (`Object.keys(stored)` sin `direction`). |
| único rastro = `Movement.transferId` | Correcto: `schema.prisma:104` + `@@index([transferId])` en `schema.prisma:114`. Ninguna ruta ni servicio lo escribe; solo los tests. |

Guardián ejecutable añadido: `src/architecture.test.ts:104-116` prohíbe las
cadenas `createMovement`, `deleteMovement` y `createTransfer` en el módulo.

### 1.2 El módulo `movements` es de solo lectura — OK

- `src/modules/movements/movements.routes.ts:18` — **única** ruta: `GET /`.
- **No existe `movements.schema.ts`** (el directorio tiene routes, service, types
  y test). La ausencia está documentada y guardada en
  `src/architecture.test.ts:57-62` (comentario + árbol objetivo sin `*.schema.ts`).
- `movements.service.ts` exporta `movementsDb`, `deriveMovementTypeFromAmount`,
  `computeAccountBalance`, `listMovements`, `serializeMovement` y `computeTotals`.
  **Ningún** `createMovement` ni `deleteMovement`.
- `POST /api/movements` y `DELETE /api/movements/:id` no están registrados
  (`src/app.ts:36`) → caen en el `setNotFoundHandler` central.

### 1.3 El saldo se LEE, no se suma — OK (con la prueba anti-casualidad)

`computeAccountBalance` (`movements.service.ts:56-73`):

1. filtra `balanceAfter !== null`, ordena por `bookingDate DESC, daySequence DESC`
   (`byMostRecent`, líneas 40-44) y **devuelve ese `balanceAfter` tal cual**;
2. solo si **ningún** movimiento trae `balanceAfter`, cae a
   `initialBalance + Σincome − Σexpense` (`neutral` aporta 0, línea 71).

**Ninguna rama menciona `transferId`** (verificado por lectura íntegra de la
función; `transferId` solo aparece en `computeTotals`, línea 140).

Test anti-casualidad, exactamente el pedido: `movements.test.ts:46-76` → tres
movimientos con `balanceAfter` 24816.16 / 24627.49 / 22800.11 y un
**`initialBalance` de `999999.99`** que no cuadra con ninguna suma → el resultado
es **`24627.49`**, el del más reciente. Refuerzo de integración:
`accounts.test.ts:127-168` (`initialBalance: 100` → saldo `24627.49`).
Desempate intradía: `movements.test.ts:78-98` (gana `daySequence` 3 aunque esté
el primero del array). Fallback: `movements.test.ts:120-128` y
`accounts.test.ts:170-208` (`210.00` = 100 + 150.25 − 40.25, `neutral` = 0).
Piernas de traspaso sin rama especial: `movements.test.ts:134-152` (unitario) y
`movements.test.ts:361-390` (`GET /api/accounts` → 1500.00 / 2500.00).

### 1.4 `daySequence` está en la clave del índice parcial de dedup — OK

`prisma/migrations/20260806191700_data_model/migration.sql:106-108`:

```sql
CREATE UNIQUE INDEX "Movement_imported_dedup_key"
  ON "Movement" ("accountId", "bookingDate", "type", "amount", "description", "daySequence")
  WHERE "origin" = 'imported';
```

SQL **crudo en la migración**, `daySequence` **dentro** de la clave y predicado
`WHERE origin='imported'`. Comprobado además que **no** está declarado en el
schema (`schema.prisma:113-116` solo tiene los dos `@@index` normales).

Tests reales contra Postgres:

- `movements.test.ts:408-424` — **tres** líneas idénticas (`TRANS INM/ Openbank`,
  `1000.00`, `2026-07-24`) que solo difieren en `daySequence` 1/2/3 → **las tres
  se guardan** (`toHaveLength(3)`). Es la protección contra perder los −2.000 €.
- `movements.test.ts:392-406` — clave completa repetida (incluido `daySequence`)
  → el segundo insert falla con `P2002` y `count() === 1`.
- `movements.test.ts:533-548` — dos `origin='manual'` idénticos → **ambos** se
  guardan: el índice es parcial de verdad.

### 1.5 Índices en SQL crudo y `NULLS NOT DISTINCT` — OK

Verificado **en el archivo de migración**, no solo en el schema:
`migration.sql:114-116` hace `DROP INDEX "Category_parentId_kind_name_key"` y lo
re-crea con **mismo nombre y mismas columnas** más `NULLS NOT DISTINCT`. El
schema conserva el `@@unique([parentId, kind, name])` (`schema.prisma:79`) tal
como manda `design.md` §4, con el comentario que explica por qué.
Efecto probado: `categories.test.ts:158-166` (segunda raíz `{expense,name}` →
409), `categories.test.ts:168-174` (mismo nombre con `kind` distinto → permitido)
y `categories.test.ts:176-195` (subcategorías homónimas bajo padres distintos →
ambas se guardan).

---

## 2. Trazabilidad requirements ↔ tests

> Vigentes: R1-R11, R3b, R13, R18-R20 y R25-R37.
> **R12, R14-R17 y R21-R24 están RETIRADOS**: no aparecen en la trazabilidad
> (correcto) y **su funcionalidad no existe** (comprobado en §1.1 y §1.2).

- **R1** `Account` (`iban` único y obligatorio, sin `cash`) → [x]
  `accounts.test.ts:80` (`AccountType` = `['checking','savings']`),
  `accounts.test.ts:85` (201 con los campos), `accounts.test.ts:101` (duplicado
  rechazado también en BD con `P2002`). Modelo en `schema.prisma:55-65`.
- **R2** `Category` + relaciones `parent`/`children` → [x]
  `categories.test.ts:70-93` (recupera padre e hijos por relación, no solo por
  `parentId`).
- **R3** `Movement` completo, defaults, sin `direction` → [x]
  `movements.test.ts:426-471` (persiste los 16 campos y los comprueba uno a uno) y
  `movements.test.ts:473-496` (defaults `imported` / `pending_review` / `EUR`).
- **R3b** `daySequence` = posición dentro del día → [x]
  `movements.test.ts:300-322` (orden intradía por API), `movements.test.ts:408`
  (tres líneas) y el unitario de desempate `movements.test.ts:78`.
- **R4** enums (sin `transfer`, sin `MovementDirection`) → [x]
  `movements.test.ts:551-569` (los cinco enums, valor a valor) y
  `movements.test.ts:498-531` (matriz que inserta cada combinación real en BD).
- **R5** migración sobre BD limpia sin error → [x] toda la suite de integración
  corre contra la BD migrada, `architecture.test.ts:235-244` (la `Category` es la
  nueva) y la evidencia de `prisma migrate deploy` sobre BD limpia del informe §3.
- **R6** índice único **parcial** de dedup → [x] `movements.test.ts:392`, `:408`,
  `:533` (ver §1.4).
- **R7** unicidad de raíz con `NULLS NOT DISTINCT` → [x] `categories.test.ts:158`,
  `:168`, `:176` (ver §1.5).
- **R8** `POST /api/accounts` → 201 → [x] `accounts.test.ts:85` (decimales como
  string, `"1500.50"`) y `accounts.test.ts:112` (normaliza el IBAN, honra `alias`
  y `type`).
- **R9** `balance` leído del extracto → [x] `accounts.test.ts:127`, `:170`, `:210`
  más los cinco unitarios de `computeAccountBalance` (`movements.test.ts:46`,
  `:78`, `:100`, `:120`, `:130`). Ver §1.3.
- **R10** IBAN duplicado → 409 `CONFLICT` → [x] `accounts.test.ts:223` (409 y una
  sola cuenta en el `GET` posterior), `app-error.test.ts:59` y `:69`.
- **R11** alta sin `iban` / sin `bank` / `iban:""` → 400 → [x]
  `accounts.test.ts:237`, `:244`, `:251`.
- **R13** `GET /api/movements` ordenado y con embebidos → [x]
  `movements.test.ts:260-298` (orden desc, `account` y `category` embebidos,
  `transferId`/`daySequence`/`origin`/`status` en el cuerpo) y
  `movements.test.ts:300`.
- **R18** traspaso = dos movimientos enlazados, sin endpoint → [x]
  `movements.test.ts:324-359` (las dos piernas se recuperan por `transferId`
  conservando `expense`/`income`), guardián `architecture.test.ts:104` y
  **checklist del reviewer sobre el diff (§1.1): sin ruta ni servicio de
  traspaso**.
- **R19** el saldo no da trato especial a las piernas → [x]
  `movements.test.ts:361-390` (integración) y `movements.test.ts:134-152`
  (unitario), más la revisión del código: `computeAccountBalance` **no menciona**
  `transferId`.
- **R20** totales globales excluyen traspasos y `neutral` → [x]
  `movements.test.ts:155-177` (dataset con gasto, ingreso, dos piernas enlazadas y
  un `neutral` → `expense 45.90` / `income 1200.00`).
- **R25** `POST /api/categories` raíz y subcategoría → [x] `categories.test.ts:54`.
- **R26** `GET /api/categories` con `children` → [x] `categories.test.ts:95-110`
  (además comprueba que la hija **no** sale como raíz).
- **R27** más de un nivel → 400 → [x] `categories.test.ts:112-132` (verifica el
  `message` concreto, no solo el status).
- **R28** `kind` distinto al del padre → 400 → [x] `categories.test.ts:134-145`.
- **R29** segunda raíz `{kind,name}` → 409 → [x] `categories.test.ts:158-166`.
- **R30** `findOrCreateAccountFromMetadata` → [x] `accounts.test.ts:258`
  (`created=false`, misma cuenta, IBAN en minúsculas normalizado) y
  `accounts.test.ts:273` (`created=true`, alias derivado, `type checking`,
  `initialBalance 0.00`, `appliedDefaults`).
- **R31** metadatos insuficientes → `MissingAccountDataError` 422 → [x]
  `accounts.test.ts:291` (sin `iban`: lanza, el mensaje nombra `iban` y **no crea
  ninguna cuenta**), `accounts.test.ts:305` (sin `bank`: `code`, `statusCode` 422
  y 0 cuentas), `app-error.test.ts:73` y `:83`.
- **R32** límite de la feature → [x] **requirement de proceso, verificado por el
  reviewer sobre el diff:** ningún import de Drive ni del parser en los tres
  módulos nuevos; `findOrCreateAccountFromMetadata` **no** está cableada a ninguna
  ruta (`accounts.routes.ts:3-11` no la importa); no hay endpoint de importación;
  `MISSING_ACCOUNT_DATA` figura como **reservado** en `docs/api-contract.md:53`.
- **R33** importe 0 → `neutral` → [x] `movements.test.ts:31-43` (las tres vías),
  su trato como 0 en el saldo (`movements.test.ts:120`) y su exclusión de los
  totales (`movements.test.ts:164`).
- **R34** `/api/expenses*` → 404 y módulo borrado → [x]
  `architecture.test.ts:202`, `:209` y `:220` (GET, POST y GET `:id` → 404 con
  cuerpo `NOT_FOUND`) y `architecture.test.ts:88` (la carpeta ya no existe).
- **R35** la migración elimina las tablas viejas → [x]
  `architecture.test.ts:226-233` (`information_schema` sin `Expense`) y
  `architecture.test.ts:235-244` (la `Category` tiene `kind` y `parentId`).
- **R36** docs actualizadas → [x] **requirement de proceso**, verificado sobre el
  diff en §4 de esta review.
- **R37** ADR, invariantes e `init.sh` verde → [x] ADR-011 en
  `docs/architecture.md:547-653`; `architecture.test.ts:92-102` (las tres rutas
  nuevas sin la cadena `prisma`); `init.sh` **ejecutado por el reviewer**: verde.

**Cobertura: 27/27 requirements vigentes con test concreto o checklist explícito.
Ningún `R<n>` se queda sin cubrir.**

---

## 3. Tasks completas

Las 22 tasks de `specs/data-model/tasks.md` están `[x]` y **verificadas contra el
código**, no solo marcadas:

- **T1** `[x]` `app-error.ts:29,39` + `app-error.test.ts:59-86`.
- **T2** `[x]` `movements.service.ts:33,56,137`. **T3** `[x]`
  `movements.test.ts:31-177`.
- **T4** `[x]` `schema.prisma` completo. **T5** `[x]` `migration.sql` (DROP+CREATE
  y los dos índices en SQL crudo). **T6** `[x]` cliente regenerado (los tests
  importan los enums nuevos de `src/generated/prisma/`).
- **T7/T8** `[x]` módulo `accounts` + 15 tests. **T9/T10** `[x]` módulo
  `categories` + 11 tests. **T11/T12** `[x]` módulo `movements` de solo lectura +
  integración.
- **T13** `[x]` `src/modules/expenses/` borrado (5 archivos, `git status` = `D`) y
  `app.ts:34-36` con los tres registros nuevos.
- **T14** `[x]` `architecture.test.ts` (árbol objetivo, guardianes y 404 de
  `/api/expenses`).
- **T15-T18** `[x]` docs (ver §4). **T19-T21** `[x]` typecheck, format, tests e
  `init.sh` **re-ejecutados por el reviewer**: verdes. **T22** `[x]` mapa de
  trazabilidad en `progress/implementations/data-model.md` §5.

**Ninguna task saltada: no hace falta justificación.**

---

## 4. Documentación (R36, R37)

- [x] **`docs/api-contract.md`** — nota **BREAKING CHANGE** visible y fechada
  (`:88-96`: `Expense` y `/api/expenses` fuera, ahora 404, y la `Category` del
  bootstrap reemplazada); modelos `Account` (`:100-115`), `Category` (`:117-130`)
  y `Movement` (`:132-158`) en inglés, decimales como string, fechas
  `YYYY-MM-DD`, `transferId`/`daySequence` nullable y hoy siempre `null`; nota de
  traspasos sin endpoint (`:160-166`); `GET /api/movements` con el aviso "es el
  único endpoint de movimientos: SOLO LECTURA" (`:339-344`); `CONFLICT` (409) y
  `MISSING_ACCOUNT_DATA` (422, **reservado**) en la tabla de códigos estables
  (`:52-53`).
- [x] **`docs/data-model.md`** — deja de ser borrador (`:5`); sin `cash` (`:87`),
  sin `transfer` ni `MovementDirection` (`:93`), con `transferId` y `daySequence`
  (`:163-164`); fórmula de saldo reescrita (`:208-218`, "ninguna rama mira
  `transferId`"); totales que excluyen traspasos y `neutral` (`:221`); los dos
  índices con su SQL (`:279`, `:303`) y los **puntos abiertos 1 y 2 cerrados**
  (`:272`, `:294`, `:311`).
- [x] **`docs/architecture.md`** — **ADR-011** completa (`:547-653`) con decisión,
  alternativas descartadas (incluidas "crear los traspasos por API" y "marcarlos
  mutando el `type`") y límites conocidos (el día partido entre descargas); árbol
  de `src/` actualizado (`:62-107`, con la nota de que `movements` es de solo
  lectura y de que `modules/expenses/` se borró); subclases nuevas anotadas bajo
  ADR-005 (`:212-220`).
- [x] **`progress/current.md`** — bloque de **breaking change** de la F8
  (`:83-95`) y plan de implementación.
- [x] **`docs/stack.md`** — sin cambios, y es correcto: cero dependencias y cero
  variables de entorno nuevas (`package.json` y `.env.example` intactos).

---

## 5. Arquitectura (`docs/architecture.md`)

- [x] **P1 — la capa HTTP no contiene lógica de negocio.** `accounts.routes.ts`,
  `categories.routes.ts` y `movements.routes.ts` solo declaran el schema, llaman
  al servicio y formatean. Ninguna decisión de dominio en la ruta.
- [x] **P2 — el acceso a datos se aísla.** Las tres rutas no contienen ni la
  cadena `prisma` (guardián `architecture.test.ts:92-102`); el acceso pasa por
  `accountsDb` / `categoriesDb` / `movementsDb`.
- [x] **P3 — errores explícitos y tipados.** `ConflictError` (409) y
  `MissingAccountDataError` (422) como subclases de `AppError`
  (`app-error.ts:29,39`), traducidas por el handler central sin tocarlo. El
  `P2002` de Prisma se traduce en el servicio (`accounts.service.ts:153`,
  `categories.service.ts:63`) y **cualquier otro error se re-lanza**, sin
  disfrazarse de conflicto: detalle correcto y comentado.
- [x] **P4 — configuración validada al arrancar.** No se toca `config/`; el
  guardián "`process.env` solo en `config/env.ts`" (`architecture.test.ts:29`)
  sigue verde.
- [x] **P5 — composición por plugins.** Los tres módulos se registran con su
  prefijo en `app.ts:34-36`.
- [x] **ADR-004 (vertical slice).** `modules/<recurso>/` con routes, service,
  schema, types y test; `movements` sin `*.schema.ts` **por decisión documentada**.
- [x] **ADR-003.** JSON Schema nativo (`accounts.schema.ts`,
  `categories.schema.ts`) con `additionalProperties: false`. Sin librerías nuevas.
- [x] **"Qué NO hacer".** Sin `console.log`, sin `TODO`/`FIXME` en `src/modules/`
  (grep limpio); el modelo Prisma **no** se devuelve crudo (hay `serializeAccount`,
  `serializeCategory` y `serializeMovement`).

---

## 6. Convenciones (`docs/conventions.md`)

- [x] **Idioma.** Código, tipos, tests y nombres de test en inglés; el dominio
  también (`bookingDate`, `balanceAfter`, `iban`).
- [x] **Estilo.** `pnpm run format:check` verde (comillas simples, sin `;`, 2
  espacios, 100 columnas) y `pnpm run lint` sin avisos, ambos re-ejecutados aquí.
- [x] **Imports.** Vendor → relativos con extensión `.js`, `import type` para lo
  que solo es tipo (revisado archivo a archivo en los tres módulos).
- [x] **Nombres.** Archivos `<recurso>.<capa>.ts`, tipos `PascalCase` sin `I`,
  funciones `camelCase`, `createAccountSchema` como constante de módulo.
- [x] **Tests.** Junto al archivo, Vitest, AAA, nombres descriptivos en inglés con
  el `R<n>` entre paréntesis (muy útil para la trazabilidad).
- [x] **Errores.** Ningún `throw` de string; las rutas no arman bodies de error.
- [x] **Comentarios.** Escasos y de *por qué* (p. ej. `movements.service.ts:46-55`
  explica que el saldo se lee y no se suma; `accounts.service.ts:151-152` explica
  por qué solo el `P2002` se convierte en conflicto).

---

## 7. Verificación (`docs/verification.md`)

- [x] **Recursos reales, sin mocks innecesarios.** Integración con `buildApp()` +
  `app.inject()` contra el **Postgres real** de `docker-compose`; los índices se
  prueban provocando la violación de verdad, no simulándola. Cero mocks nuevos.
- [x] **Output concreto, no "no lanza".** Todas las aserciones comprueban valores
  exactos: `"24627.49"`, `"1500.50"`, `toHaveLength(3)`, `['expense','income']`,
  `message: 'Only one level of subcategory is allowed'`, `code: 'P2002'`.
- [x] **Camino de error cubierto**, no solo el feliz: 400 (x4), 404 (x5), 409
  (x2), 422 (x2) y violación de índice único (x2).
- [x] **Aislamiento.** Cada test limpia sus filas (`afterEach`) y se aísla por
  clave propia (IBAN y nombre con sufijo aleatorio) en vez de por `count()`
  global: correcto con Vitest en paralelo sobre una BD compartida.
- [x] **Nivel 4 (trazabilidad)** cumplido en
  `progress/implementations/data-model.md` §5 y re-verificado en §2 de esta review.

---

## 8. CHECKPOINTS.md

- [x] **C1 — Arnés completo.** Archivos base y `docs/*` presentes; `./init.sh`
  ejecutado por el reviewer con exit code 0.
- [x] **C2 — Estado coherente.** Una sola feature `in_progress` (la 8); las `done`
  tienen tests que pasan; `progress/current.md` describe la sesión activa.
- [x] **C3 — Arquitectura.** Árbol conforme a `docs/architecture.md` (actualizado
  en la misma feature); **cero dependencias nuevas**; sin logs de debug ni TODOs;
  convenciones respetadas.
- [x] **C4 — Verificación real.** Al menos un test ejecutable por módulo nuevo;
  corren en el entorno de `docs/verification.md`; feliz y error cubiertos.
- [x] **C5 — Sesión cerrada bien.** Los untracked son legítimos
  (`specs/data-model/`, `progress/implementations/data-model.md`, la migración y
  los tres módulos nuevos): ni temporales, ni builds, ni caches.
  `progress/current.md` refleja la sesión; la entrada de `history.md` es el paso
  de cierre del leader.
- [x] **C6 — Coherencia con proyectos hermanos.** El contrato cambia (breaking) y
  queda anotado en `docs/api-contract.md`, que es la fuente de verdad que lee el
  frontend, con la nota de que **aún no está consumido**. No hay endpoints ni
  modelos inventados fuera del contrato.
- [x] **C7 — SDD.** `specs/data-model/` con los tres archivos; `requirements.md`
  en EARS estricto **y con la sección de Procedencia completa** (cada `R<n>`
  vigente clasificado `humano` / `delegado` / `añadido`, con los `← REVISAR` que
  el humano usó en la puerta); las 22 tasks `[x]`; cada `R<n>` con test.
- [x] **C8 — Resumen de cierre escrito** en `progress/summaries/data-model.md`.

---

## 9. Observaciones no bloqueantes

Ninguna impide aprobar; se anotan para que no se pierdan.

1. **`nulls: 'last'` asimétrico entre consultas.** `listMovements`
   (`movements.service.ts:82`) ordena `daySequence` con
   `{ sort: 'desc', nulls: 'last' }`, pero `listAccounts` y `getAccountById`
   (`accounts.service.ts:92` y `:111`) usan `'desc'` a secas, y Postgres pone los
   `NULL` **primero** en un `DESC`. Solo diverge del helper puro (que usa
   `daySequence ?? 0`) si una línea trae `balanceAfter` **y** `daySequence` nulo a
   la vez, combinación que hoy nadie produce (el importer dará siempre los dos).
   Arreglo de dos líneas; candidato a la feature de importación.
2. **`parentId` inexistente devuelve 404, no 400.** El propio `design.md` se
   contradice (§5 lo lista como 400; §10 lo enumera explícitamente como
   `NotFoundError` 404) y ningún requirement lo fija. El implementer siguió §10,
   lo documentó en `docs/api-contract.md:295` y lo señaló en su informe. **Se
   acepta**; si el humano prefiere 400, es una línea en
   `categories.service.ts:42`.
3. **`initialBalance` no admite negativos** (`accounts.schema.ts:11`,
   `minimum: 0`), tal como pedía T7. Si alguna cuenta arranca en descubierto,
   habrá que relajarlo.
4. **Deuda ajena a esta feature.** La F7 `parser-english` está `done` pero no
   tiene `progress/summaries/parser-english.md` (C8) ni entrada en
   `progress/history.md`; y `docs/verification.md:42-62` conserva el bloque `curl`
   contra `/api/expenses`, que ya no existe. El implementer lo detectó y no lo
   tocó (correcto: fuera de sus tasks). Conviene sanearlo al cerrar la sesión.

---

## 10. Cambios requeridos

**Ninguno.** La feature está lista para pasar a `done`, lo cual hace el
`implementer`, no el reviewer.
