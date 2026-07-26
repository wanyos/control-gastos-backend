# Informe de implementación — Feature 4: drive-structure

- **Agente:** implementer
- **Fecha:** 2026-07-25
- **Estado en `feature_list.json`:** `in_progress` (NO se cierra: pendiente de
  `APPROVED` del reviewer y del resumen de cierre en
  `progress/summaries/drive-structure.md`). T20 (smoke real contra Drive) es del humano.
- **Spec seguido:** `specs/drive-structure/{requirements,design,tasks}.md`. Tasks
  **T1–T19** marcadas `[x]` (T17 con salvedad de lint, ver abajo). T20 es del humano.

## Archivos creados

- [`src/lib/drive-structure.ts`](../../src/lib/drive-structure.ts) — servicio interno (funciones puras que reciben
  `AppDriveClient` por parámetro): `normalizeBankName`, `validateYear`,
  `suggestBank` (Levenshtein ≤ 2, desempate alfabético), `findFolder`,
  `ensureFolder` (con lock en memoria por `(padre, nombre)`), `resolveBankFolder`,
  `createBank`, `ensureBankYearFolders`, `uploadFile`, `moveFileToProcessed`.
  Superficie `files.*` (NO en `drive.ts`). Sin `prisma`, sin `process.env`, sin
  wiring de auth.
- [`src/lib/drive-structure.test.ts`](../../src/lib/drive-structure.test.ts) — 26 unitarios con `driveDouble` en el seam,
  sin red.

## Archivos modificados

- [`src/config/env.ts`](../../src/config/env.ts) — `+ driveRootFolderId: string` en `AppConfig`; bloque `if`
  de validación de `GOOGLE_DRIVE_ROOT_FOLDER_ID` tras los tres de Drive; guard del
  `throw` ampliado con `|| !driveRootFolderId`; campo añadido al objeto devuelto.
- [`src/config/env.test.ts`](../../src/config/env.test.ts) — constante `driveRootFolderId`, `baseEnv` con la nueva
  var, los dos `toEqual` de config completa con `driveRootFolderId`, y tests
  nuevos (expone la var; ausente/vacía → lanza nombrándola; junto a otros
  problemas → la nombra en el mismo mensaje).
- [`vitest.config.ts`](../../vitest.config.ts) — placeholder `GOOGLE_DRIVE_ROOT_FOLDER_ID: 'test-root-folder-id'`.
- [`src/errors/app-error.ts`](../../src/errors/app-error.ts) — `+ UnknownBankError` (`UNKNOWN_BANK`, 404).
  `error-handler.ts` **no se tocó** (despacha cualquier `AppError` por su código).
- [`src/errors/app-error.test.ts`](../../src/errors/app-error.test.ts) — 2 tests de la subclase (código/status/name/mensaje).
- [`src/lib/drive.ts`](../../src/lib/drive.ts) — `export` a `driveErrorMessage` (única línea; comportamiento
  y guardián `no files.` intactos).
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — árbol objetivo (+ `lib/drive-structure.ts` y su
  `.test.ts`); guardián `no "prisma"` (R18); guardián `no createDriveClient /
  createDriveAuth / OAuth2` (R19).
- [`.env.example`](../../.env.example) — `GOOGLE_DRIVE_ROOT_FOLDER_ID` con placeholder + comentario a
  `design.md` §9.
- [`docs/stack.md`](../../docs/stack.md) — la variable en la tabla de entorno (obligatoria) + fuente.
- [`docs/architecture.md`](../../docs/architecture.md) — **ADR-008**; `lib/drive-structure.ts` en el árbol; nota
  del umbral de ADR-006 (8ª variable, string plano → validador manual); nota bajo
  ADR-005 (`UnknownBankError` como subclase idiomática nueva).
- [`docs/api-contract.md`](../../docs/api-contract.md) — **sin endpoints nuevos**; `UNKNOWN_BANK` (404) en la
  tabla de códigos estables como **reservado**; nota de que la feature 4 se
  resolvió como servicio interno.

## Decisiones y detalles respetados (del spec, no reinventados)

- **Modelo de registro (puerta 2026-07-24):** `resolveBankFolder` exige que el
  banco exista (nunca crea, R23); si no, `UnknownBankError` con lista + sugerencia
  y **sin `create`** (R24-R26). `createBank` es el único camino de alta,
  idempotente (R27). Año y `procesados` se auto-crean (R4).
- **Errores distinguibles (R28):** `ValidationError` (400, formato), `UnknownBankError`
  (404, no registrado), `DriveConnectionError` (503, fallo Drive). El `catch` de
  `callDrive` re-lanza cualquier `AppError` propio tal cual (`instanceof AppError`),
  sin re-envolver, preservando la distinguibilidad.
- **Seguridad del `q`:** el slug validado (`^[a-z0-9-]{1,64}$`, no `procesados`) y
  el año (`^\d{4}$`, 2000-2100) hacen imposible inyectar `'`/`/`/`.` en el filtro.
- **Idempotencia y carrera:** `findFolder` de-duplica por `createdTime` más antiguo
  (R8); `ensureFolder` con lock en memoria por `(padre, nombre)` (R7, single-process).
- **Umbral de sugerencia:** Levenshtein ≤ 2, desempate alfabético (aprobado por el
  humano; no modificado).
- **Sin red:** todos los tests con dobles del cliente; el placeholder de vitest
  mantiene `buildApp()` verde sin credenciales reales.

## Trazabilidad `R<n>` → test (Nivel 4)

| R | Verificación |
| - | ------------ |
| R1 | `env.test.ts`: `builds a typed config from a complete environment`; `applies defaults when only the required variables are present`; `exposes the Drive root folder id under config.driveRootFolderId` |
| R2 | `env.test.ts`: `throws naming GOOGLE_DRIVE_ROOT_FOLDER_ID when it is missing`; `…when it is empty`; `lists GOOGLE_DRIVE_ROOT_FOLDER_ID alongside the other missing problems` |
| R3 | `drive-structure.test.ts`: `createBank creates the bank folder under the root when absent (R27)` (`parents:[root]`, nunca crea la raíz) + `ensureBankYearFolders resolves the bank and auto-creates year and procesados, never the bank or root (R3, R4, R5)` (1er `create` = año con `parents:[bank-id]`) |
| R4 | `drive-structure.test.ts`: `ensureFolder creates the folder … when none exists (R4)` + `ensureBankYearFolders … auto-creates year and procesados … (R3, R4, R5)` |
| R5 | `drive-structure.test.ts`: `ensureBankYearFolders … (R3, R4, R5)` (`toEqual` de los tres ids) |
| R6 | `drive-structure.test.ts`: `ensureFolder reuses an existing folder without creating (R6)` |
| R7 | `drive-structure.test.ts`: `ensureFolder creates each folder at most once under concurrent calls (R7)` (`Promise.all` → `create` una vez) |
| R8 | `drive-structure.test.ts`: `ensureFolder reuses the oldest folder when duplicates exist … (R8)` + `resolveBankFolder reuses the oldest bank folder when duplicates exist (R8)` |
| R9 | `drive-structure.test.ts`: `uploadFile creates a new file in the folder with the media and returns its id (R9)` |
| R10 | `drive-structure.test.ts`: `uploadFile never overwrites: two uploads of the same name yield two independent files (R10)` (dos `create`, dos ids, nunca `update`) |
| R11 | `drive-structure.test.ts`: `moveFileToProcessed moves the file into procesados via addParents/removeParents (R11)` |
| R12 | `drive-structure.test.ts`: `ensureFolder wraps a Drive failure in a sanitized DriveConnectionError (R12)` (token falso `1//fake-token-value` no aparece en el mensaje) |
| R13 | `drive-structure.test.ts`: `ensureBankYearFolders converges after a partial failure, reusing the bank and never recreating it (R13)` |
| R14 | `drive-structure.test.ts`: `normalizeBankName lowercases and dashes realistic human input (R14)` + `normalizeBankName neutralizes path traversal and quotes by construction (R14)` |
| R15 | `drive-structure.test.ts`: `normalizeBankName rejects empty, too-long and reserved names (R15)` + `an invalid slug throws ValidationError … without touching Drive` (afirma `list`/`create` no llamados) |
| R16 | `drive-structure.test.ts`: `validateYear accepts a 4-digit year in range and returns it (R16)` |
| R17 | `drive-structure.test.ts`: `validateYear rejects malformed or out-of-range years (R17)` + `ensureBankYearFolders rejects an invalid year without touching Drive (R17)` |
| R18 | `architecture.test.ts`: `keeps src/lib/drive-structure.ts free of data access (no "prisma" reference) (R18)` |
| R19 | `architecture.test.ts`: `keeps src/lib/drive-structure.ts free of Drive auth wiring, consuming the client (R19)` + `reads process.env only in src/config/env.ts` (guardián existente, ahora cubre `drive-structure.ts`); además todas las funciones reciben el cliente por parámetro (probadas con doble) |
| **R20** | **Proceso (checklist del reviewer):** sin rutas nuevas en el diff; `docs/api-contract.md` con la nota de servicio interno + `UNKNOWN_BANK` reservado. Sin test propio. |
| **R21** | **Proceso (checklist del reviewer):** `docs/architecture.md` (ADR-008 + árbol + nota ADR-006 + nota ADR-005), `docs/stack.md`, `.env.example`. Sin test propio. |
| R22 | `bash ./init.sh` → `[OK] Entorno listo` (typecheck + 95 tests); + este mapa de trazabilidad |
| R23 | `drive-structure.test.ts`: `resolveBankFolder returns the existing bank id without creating (R23)` |
| R24 | `drive-structure.test.ts`: `resolveBankFolder throws UnknownBankError … without creating (R24, R25, R26)` + `ensureBankYearFolders throws UnknownBankError and creates nothing for an unregistered bank (R24)` |
| R25 | `drive-structure.test.ts`: `resolveBankFolder throws UnknownBankError … (R24, R25, R26)` (el `message` contiene `santander` y `bbva`) |
| R26 | `drive-structure.test.ts`: `suggestBank returns the closest bank within the threshold (R26)`; `suggestBank returns undefined when nobody is close enough (R26)`; integración: el `message` matchea `Did you mean 'santander'` |
| R27 | `drive-structure.test.ts`: `createBank creates the bank folder under the root when absent (R27)`; `createBank is idempotent: reuses an existing bank folder without creating (R27)`; la ruta normal (R24) confirma que nunca da de alta un banco |
| R28 | `app-error.test.ts`: `UnknownBankError is an AppError with UNKNOWN_BANK / 404`; `UnknownBankError has a default message` + `drive-structure.test.ts` bloque de discriminación: `an invalid slug throws ValidationError, not UnknownBankError …`; `a valid but unregistered slug throws UnknownBankError, not ValidationError`; el test R12 muestra fallo de Drive → `DriveConnectionError` (no `UnknownBankError`) |

> **R20 y R21 son requirements de proceso**, verificados por checklist del
> reviewer, no por test ejecutable. Misma excepción consciente que R21/R22/R23 de
> `specs/drive-connection/` y R16/R17 de `specs/foundations/`.

## Salida de la verificación final

- `pnpm typecheck` → OK (tsc 7.0.2 sin errores).
- `pnpm format:check` → `All matched files use Prettier code style!`.
- `pnpm test` → **95 passed (9 files)** (baseline 61 + 34 nuevos), sin red ni
  credenciales reales de Drive.
- `bash ./init.sh` → `[OK] Entorno listo`.
- `pnpm lint` → **falla al cargar** por el problema de entorno preexistente
  descrito abajo (NO por el código de la feature).

## Sugerencias fuera de scope (NO aplicadas)

- **`pnpm lint` roto por incompatibilidad de entorno preexistente (ajena a la
  feature).** El árbol de trabajo trae un bump **sin commitear** en `package.json`
  (`M package.json` en el git status inicial, que yo NO toqué): `typescript
  ^6.0.3 → ^7.0.2` (instalado 7.0.2) y `typescript-eslint ^8.63.0 → ^8.65.0`.
  `typescript-eslint@8.65` **no soporta TypeScript 7.0**, así que ESLint falla al
  cargar (`Error: typescript-eslint does not support TS 7.0`) **antes** de mirar
  ningún archivo — es 100% de entorno, independiente de mi código. No lo arreglo:
  cambiar dependencias está fuera de scope (regla dura del implementer). La puerta
  real (`init.sh`) corre `tsc + pnpm test`, no lint, y está verde. **Decisión para
  el leader/humano:** alinear versiones (subir `typescript-eslint` a una que
  soporte TS 7, o fijar `typescript` a la 6.x) y actualizar `docs/stack.md` (que
  aún dice `typescript@^6.0.3`). Es un cambio de dependencias, no de esta feature.
- **`docs/stack.md` línea del gestor de paquetes y versión de TypeScript
  (`^6.0.3`):** desincronizadas con `package.json`; no las toco (el spec ordena no
  tocar la línea del gestor; la de TypeScript es parte del bump de dependencias de
  arriba).

## Nota de diseño anotada (dentro de scope, siguiendo el spec)

- **`console.warn` en `findFolder` para el caso de carpetas homónimas
  preexistentes.** `design.md` §3.1 y `tasks.md` T6 piden "registrar un warn (dato
  diagnóstico)" cuando Drive devuelve >1 carpeta con el mismo nombre. Las funciones
  son puras y su firma (fijada en `design.md` §2) **no recibe logger**, así que no
  hay `fastify.log` disponible; `console.warn` es el único mecanismo. Es
  diagnóstico, no un swallow de error (la convención "nunca console.log" apunta al
  manejo de errores de la capa HTTP, que sí tiene logger). En los tests se silencia
  con un spy para no ensuciar la salida. Lo dejo anotado por transparencia.

## Pendiente (no del implementer)

- **T20** — smoke real del humano: crear `notas-banco/` a mano, pegar su fileId en
  `.env` como `GOOGLE_DRIVE_ROOT_FOLDER_ID`, dar de alta al menos un banco.
- **Cierre** — tras `APPROVED` del reviewer y su resumen en
  `progress/summaries/drive-structure.md`, cambiar el `status` a `done` y volcar
  este informe a `progress/history.md`.
