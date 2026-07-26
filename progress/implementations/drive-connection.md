# Informe de implementación — Feature 3: drive-connection

- **Agente:** implementer
- **Fecha:** 2026-07-20
- **Estado en `feature_list.json`:** `in_progress` (NO se cierra: pendiente de
  aprobación del reviewer y del resumen de cierre C8; T25 es del humano).
- **Spec seguido:** `specs/drive-connection/{requirements,design,tasks}.md`.
  Todas las tasks **T1–T24** marcadas `[x]`. T25 (smoke real contra Drive) queda
  pendiente del humano.

## Resultado del spike (T2)

`import { drive, auth } from '@googleapis/drive'` (**named import**) **resuelve
correctamente en runtime** bajo Node v24 ESM/NodeNext. Spike ejecutado con un
`.mjs` dentro del proyecto: `typeof drive === 'function'`, `auth.OAuth2` es
constructor, `new auth.OAuth2({...}).setCredentials({ refresh_token })` deja el
token accesible en `.credentials.refresh_token`, y `drive({version:'v3',auth})`
expone `about.get`. **No hizo falta el fallback de default import.**

## Nota de arranque (precondición de entorno, no cambio de código)

`bash ./init.sh` arrancaba **rojo** (7 tests): el daemon de Docker Desktop no
corría y el contenedor `gastos-postgres` estaba parado, así que los tests de
integración de `expenses`/`health/db` fallaban por no alcanzar Postgres (el
typecheck ya estaba verde). Se levantó Docker Desktop + `docker compose up -d` y
la baseline volvió a **35 tests verdes** antes de empezar. No es un fallo de
código ni parte de la feature.

## Archivos creados

- [`src/lib/drive.ts`](../../src/lib/drive.ts) — `driveScope`, `createDriveAuth`, `createDriveClient`,
  `type AppDriveClient`, `checkDriveConnection` y el `driveErrorMessage` privado
  (tabla de síntomas). Recibe `DriveCredentials` por parámetro; **no** menciona
  `process.env` ni `files.`.
- [`src/lib/drive.test.ts`](../../src/lib/drive.test.ts) — 11 unitarios con dobles en el seam, sin red.
- [`src/plugins/drive.ts`](../../src/plugins/drive.ts) — plugin `fp` que decora `fastify.drive`. **Sin
  handshake, sin log de arranque, sin `onClose`** (las tres diferencias
  deliberadas con `plugins/prisma.ts`).
- [`src/plugins/drive.test.ts`](../../src/plugins/drive.test.ts) — integración: `buildApp()` + `ready()` con
  placeholders; ruta posterior lee `fastify.drive`.
- [`scripts/get-drive-refresh-token.mjs`](../../scripts/get-drive-refresh-token.mjs) — one-shot fuera de `src/` (R23),
  formateado con Prettier.

## Archivos modificados

- [`src/errors/app-error.ts`](../../src/errors/app-error.ts) — `+ DriveConnectionError` (`DRIVE_CONNECTION_ERROR`,
  503). `error-handler.ts` **no se tocó** (ya despacha por `instanceof AppError`).
- [`src/errors/app-error.test.ts`](../../src/errors/app-error.test.ts) — `+ 2` tests de la subclase.
- [`src/config/env.ts`](../../src/config/env.ts) — `interface DriveCredentials`, campo `drive` en
  `AppConfig`, 3 bloques `if` de validación tras el de `LOG_LEVEL`, y el guard
  del `throw` ampliado con `|| !driveClientId || !driveClientSecret ||
  !driveRefreshToken`.
- [`src/config/env.test.ts`](../../src/config/env.test.ts) — fixtures `driveEnv`/`drive`/`baseEnv`; 3 tests
  arreglados (uno renombrado a `applies defaults when only the required variables
  are present`); tests nuevos de Drive.
- [`vitest.config.ts`](../../vitest.config.ts) — 3 credenciales placeholder junto a `LOG_LEVEL: 'silent'`.
- [`src/app.ts`](../../src/app.ts) — `import` + `app.register(drivePlugin)` tras `prismaPlugin`.
- [`src/modules/health/health.routes.ts`](../../src/modules/health/health.routes.ts) — `+ GET /health/drive`.
- [`src/modules/health/health.test.ts`](../../src/modules/health/health.test.ts) — describe nuevo con Fastify desnudo +
  doble de Drive (3 tests). Los 2 tests existentes intactos.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — árbol objetivo (+ `lib/drive.ts`, `plugins/drive.ts`),
  guardián de `.env.example` y guardián de alcance (`no files.`).
- [`.env.example`](../../.env.example) — 3 variables con placeholders + comentario a `design.md` §10.
- [`docs/api-contract.md`](../../docs/api-contract.md) — `GET /health/drive` + `DRIVE_CONNECTION_ERROR` (503),
  anotando que hoy ningún endpoint de dominio lo devuelve en el body.
- [`docs/architecture.md`](../../docs/architecture.md) — **ADR-007**, árbol de carpetas, nota en el umbral de
  ADR-006.
- [`docs/stack.md`](../../docs/stack.md) — 3 variables en la tabla de entorno + `@googleapis/drive` en
  librerías clave (la línea del gestor de paquetes NO se tocó).
- [`package.json`](../../package.json) / [`pnpm-lock.yaml`](../../pnpm-lock.yaml) — `+ @googleapis/drive@^20.2.0`
  (`google-auth-library` **no** declarada; se usa el `auth` reexportado).

## Decisiones y detalles de diseño respetados

- **Detección de errores sin fuga (R12/R19):** `driveErrorMessage` inspecciona un
  string de señales (mensaje + `response.data` + `errors` serializados de forma
  segura) para clasificar el síntoma, pero **cada rama devuelve una constante
  fija**; nunca interpola el texto crudo. Los síntomas de API
  (`accessNotConfigured`, `insufficientPermissions`) viven en el `reason` anidado,
  por eso se serializa `response.data`; los de OAuth (`invalid_grant`,
  `invalid_client`) llegan por el mensaje.
- **`checkDriveConnection`** repropaga tal cual los `DriveConnectionError` que él
  mismo lanza (respuesta sin `user.emailAddress`) para no envolver dos veces.
- **Logger espiado (R20):** el email va a `fastify.log.info({ account }, …)` y se
  verifica con `vi.spyOn(app.log, 'info')`; el body 200 es exactamente
  `{ status: 'ok', drive: 'up' }` (sin email, comprobado con
  `payload.not.toContain`).
- **Suite hermética (R16):** placeholders en `vitest.config.ts`; `env.test.ts`
  inyecta objetos sintéticos y no depende de ellos. Verde sin credenciales y sin
  red.

## Trazabilidad `R<n>` → test (Nivel 4)

| R | Verificación |
| - | ------------ |
| R1 | `env.test.ts`: `builds a typed config from a complete environment`; `applies defaults when only the required variables are present`; `exposes the three Drive credentials under config.drive` |
| R2 | `env.test.ts`: `throws naming GOOGLE_DRIVE_CLIENT_ID when it is missing`; `…CLIENT_SECRET…`; `…REFRESH_TOKEN…`; `names every missing Drive variable in a single error message` |
| R3 | `env.test.ts`: `collects all problems into a single error message`; `lists the missing Drive variables alongside the preexisting ones` |
| R4 | `drive.test.ts`: `createDriveAuth sets the refresh token on the OAuth2 client (R4)` (+ end-to-end en T25, humano) |
| R5 | `drive.test.ts`: `createDriveClient builds a client with an invocable about.get, no network (R5)`; `drive` plugin: `decorates fastify.drive without any network handshake at startup` |
| R6 | `drive.test.ts`: `exposes the exact full-drive scope as a constant (R6)` |
| R7 | `drive` plugin (`plugins/drive.test.ts`): `decorates fastify.drive without any network handshake at startup (R7, R8)`; `exposes fastify.drive to a route registered after the plugin (R7)` |
| R8 | `plugins/drive.test.ts`: `decorates fastify.drive without any network handshake at startup (R7, R8)` (`ready()` resuelve con credenciales placeholder → no hay handshake eager) |
| R9 | `health.test.ts`: `returns 200 with the exact body and without the email when Drive is up (R9)` |
| R10 | `health.test.ts`: `returns 503 with the exact body when Drive is down and keeps the app up (R10)` |
| R11 | `drive.test.ts`: `returns the connected account email on success (R11)` |
| R12 | `drive.test.ts`: `never leaks the raw error text (e.g. a token) into the message (R12)` |
| R13 | `app-error.test.ts`: `DriveConnectionError is an AppError with DRIVE_CONNECTION_ERROR / 503`; `DriveConnectionError has a default message` |
| R14 | `architecture.test.ts`: `.env.example lists the Drive variables with placeholders, not real credentials (R14)` |
| R15 | `architecture.test.ts`: `reads process.env only in src/config/env.ts` (guardián existente; ahora cubre `lib/drive.ts` y `plugins/drive.ts`) |
| R16 | Suite completa verde con placeholders (61 tests), sin red ni credenciales reales; mecanismo en `vitest.config.ts` |
| R17 | `architecture.test.ts`: `keeps src/lib/drive.ts within the connection scope: no files.* surface (R17)` |
| R18 | Ejecución de `bash ./init.sh` → `[OK] Entorno listo` |
| R19 | `drive.test.ts`: `maps invalid_grant…`; `maps invalid_client…`; `maps accessNotConfigured (nested reason)…`; `maps insufficientPermissions (nested reason)…`; `maps an unknown failure to the generic message` |
| R20 | `health.test.ts`: `logs the connected account email at info level, not in the body (R20)` (+ el body 200 sin email de R9) |
| **R21** | **Proceso (checklist del reviewer):** `docs/api-contract.md` actualizado. Sin test propio. |
| **R22** | **Proceso (checklist del reviewer):** `docs/architecture.md` (ADR-007 + árbol + nota ADR-006) y `docs/stack.md`. Sin test propio. |
| **R23** | **Proceso (checklist del reviewer / humano):** `scripts/get-drive-refresh-token.mjs`; lo ejecuta el humano en T25. Sin test propio. |

> **R21, R22 y R23 son requirements de proceso**, verificados por checklist del
> reviewer, no por test ejecutable. Es la misma excepción consciente que R16/R17
> de `specs/foundations/` (requirements de proceso sin superficie ejecutable).

## Salida de la verificación final

- `pnpm typecheck` → OK (tsc sin errores).
- `pnpm lint` → OK (eslint sin warnings).
- `pnpm format:check` → `All matched files use Prettier code style!` (incluye el
  `.mjs` del script).
- `pnpm test` → **61 passed (8 files)** (baseline 35 + 26 nuevos), sin red ni
  credenciales reales de Drive.
- `bash ./init.sh` → `[OK] Entorno listo`.

## Sugerencias fuera de alcance (NO aplicadas)

- **`docs/stack.md` líneas 35-36 (gestor de paquetes)**: siguen diciendo cosas
  de npm en algún punto histórico; el spec ordena **no tocarlas** (ya reportado
  al humano por el leader). No se modificó esa línea; solo la tabla de variables
  y las librerías clave.
- **Aviso de cuota de Drive (`storageQuota`)**: `about.get` podría pedir
  `fields: 'user,storageQuota'` para avisar de un Drive lleno, pero eso pertenece
  a la feature 4 (subida de archivos). Se dejó `fields: 'user'` por alcance.

## Pendiente (no del implementer)

- **T25** — smoke test real del humano: pasos manuales de `design.md` §10 y
  `GET /health/drive` → `{"status":"ok","drive":"up"}` contra su Drive real.
- **Cierre** — tras `APPROVED` del reviewer y su resumen en
  `progress/summaries/drive-connection.md`, cambiar el `status` a `done` y volcar
  este informe a `progress/history.md`.
