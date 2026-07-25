# Tasks — Feature 4: drive-structure

> Checklist ordenada para el `implementer`. Cada task referencia los `R<n>` de
> `requirements.md` que cubre. Marcar `[x]` al completar; una task saltada exige
> justificación documentada (el reviewer rechaza si no).
>
> **Orden pensado para que la suite esté roja el menor tiempo posible:** primero
> el bloque de config **con su placeholder de vitest y sus tests en la misma
> tanda** (T1-T3 son indivisibles: en cuanto `env.ts` exige la variable nueva, la
> suite se cae hasta que T2 y T3 estén hechas), después la clase de error nueva,
> después el `export` mínimo en `drive.ts`, después la lib nueva con sus tests,
> después los guardianes, después docs.
>
> 🔁 **Revisión de la puerta (2026-07-24):** modelo de registro de bancos
> (resolver-existente vs. crear-explícito). Tareas afectadas: T4b (error nuevo),
> T6 (findFolder/ensureFolder), T6b (resolveBankFolder + suggestBank + createBank),
> T7 (ensureBankYearFolders resuelve, no crea banco), T10 (tests de
> banco-desconocido y crear-banco), T15 (api-contract: `UNKNOWN_BANK`), T14
> (ADR-008).
>
> 🔴 **`pnpm`, NO npm. Sin dependencias nuevas** (`@googleapis/drive` de la
> feature 3 ya trae `files.*`). 🔴 **No toques `.env`** (secretos del humano),
> solo `.env.example`. 🔴 Los `files.*` van en `drive-structure.ts`, **nunca** en
> `drive.ts` (su guardián `no files.` debe seguir verde). 🔴 **Una carpeta de
> banco solo se crea en `createBank`** — nunca en la ruta normal.
>
> 🚨 **El paso manual del humano (crear `notas-banco/` y pegar su fileId) es la §9
> de `design.md`.** No es task del implementer y no bloquea nada de abajo: toda la
> verificación automática es verde con dobles y placeholder.

## Configuración de entorno (T1-T3 van juntas o la suite se queda roja)

- [x] T1 — Modificar `src/config/env.ts`: campo `driveRootFolderId: string` en
      `AppConfig`; bloque `if` de validación de `GOOGLE_DRIVE_ROOT_FOLDER_ID`
      **después** de los tres de Drive (patrón de `env.ts:66-79`); sumar
      `|| !driveRootFolderId` al guard del `throw` (`env.ts:82-88`) o el `return`
      no compila con `strict`; y añadir `driveRootFolderId` al objeto devuelto.
      Cubre: R1, R2.
- [x] T2 — Modificar `vitest.config.ts`: añadir
      `GOOGLE_DRIVE_ROOT_FOLDER_ID: 'test-root-folder-id'` al bloque `env` (junto a
      los placeholders de la feature 3). Mantiene verdes `health.test.ts`,
      `drive.test.ts` de plugin, `expenses.test.ts`, etc., que llaman a
      `buildApp()` → `loadConfig()`. Cubre: R1 (mecanismo de suite hermética).
- [x] T3 — Modificar `src/config/env.test.ts`: añadir
      `GOOGLE_DRIVE_ROOT_FOLDER_ID` a `baseEnv` (y a `driveEnv` o como constante
      aparte) y `driveRootFolderId` al `toEqual` de `builds a typed config from a
      complete environment` y `applies defaults when only the required variables
      are present`; tests nuevos: env completo → `config.driveRootFolderId`
      correcto (R1); ausente → lanza nombrándola (R2); junto a otros problemas →
      la nombra en el mismo mensaje (R2). Cubre: R1, R2.

## Error nuevo (`UnknownBankError`) — antes de la lib que lo lanza

- [x] T4b — Modificar `src/errors/app-error.ts`: añadir la subclase
      `UnknownBankError extends AppError` con `code = 'UNKNOWN_BANK'`,
      `statusCode = 404` y mensaje por defecto (patrón de `NotFoundError`/
      `ValidationError`). Modificar `src/errors/app-error.test.ts`: test análogo a
      los existentes que afirme `instanceof AppError`, `code`, `statusCode 404`,
      `name = 'UnknownBankError'` y el mensaje por defecto. **No** tocar
      `error-handler.ts` (mapea cualquier `AppError` por su `statusCode`/`code`).
      Cubre: R28.

## Reutilización del mapeo de errores (cambio mínimo en `drive.ts`)

- [x] T4 — Modificar `src/lib/drive.ts`: añadir `export` a la función
      `driveErrorMessage` (hoy privada) para que `drive-structure.ts` reutilice la
      tabla de síntomas sanitizada. **No cambiar su comportamiento** ni añadir
      `files.` a este archivo (su guardián de la feature 3 debe seguir verde). Los
      tests existentes de `drive.test.ts` siguen intactos. Cubre: R12.

## Servicio de estructura (`src/lib/drive-structure.ts`)

- [x] T5 — Crear `src/lib/drive-structure.ts` con las validaciones de forma:
      `normalizeBankName(input)` (NFD + quita diacríticos, minúsculas, trim,
      separadores→`-`, descarta fuera de `[a-z0-9-]`, colapsa `-`, recorta
      extremos; `ValidationError` si queda vacío, > 64, o `'procesados'`) y
      `validateYear(input)` (`^\d{4}$` en 2000-2100; `ValidationError` si no).
      Ninguna toca Drive. `import type { Readable } from 'node:stream'` para
      `FileUpload`. Cubre: R14, R15, R16, R17.
- [x] T5b — En `src/lib/drive-structure.ts`, `suggestBank(slug, known)`: función
      **pura** (sin cliente, sin red) que calcula la distancia de Levenshtein del
      `slug` a cada nombre de `known` y devuelve el de menor distancia si esa
      distancia ≤ **2** (umbral de `design.md` §6), con desempate por orden
      alfabético; `undefined` si nadie entra en el umbral. Cubre: R26.
- [x] T6 — En `src/lib/drive-structure.ts`, `findFolder(client, name, parentId)`
      (resolver, NO crea) y `ensureFolder(client, name, parentId)` (resolver o
      crea): `findFolder` hace `files.list` con el `q` de `design.md` §3.1
      (`fields: 'files(id, name, createdTime)'`, `orderBy: 'createdTime'`,
      `spaces: 'drive'`); si hay ≥1 devuelve la más antigua (y `warn` si hay >1),
      si no `null`. `ensureFolder` llama a `findFolder`; si `null`, `files.create`
      con `mimeType` de carpeta y `parents: [parentId]`, `fields: 'id'`; **lock en
      memoria** `Map<string, Promise<string>>` por `` `${parentId}\n${name}` ``
      (patrón de §3.2). Envolver los fallos de Drive en
      `DriveConnectionError(driveErrorMessage(error))` **re-lanzando cualquier
      `AppError` propio tal cual** (`instanceof AppError`, no solo
      `DriveConnectionError`, para preservar R28). Cubre: R4, R6, R7, R8, R12.
- [x] T6b — En `src/lib/drive-structure.ts`, las dos operaciones de banco del
      modelo de registro:
      - `resolveBankFolder(client, rootFolderId, bank)` (**ruta por defecto,
        segura**): `normalizeBankName` (T5) → `findFolder(slug, rootFolderId)`. Si
        hay id → lo devuelve (R23). Si `null` → **no crea**: `files.list` de las
        subcarpetas de la raíz para obtener los bancos conocidos, calcula la
        sugerencia con `suggestBank` (T5b) y lanza `UnknownBankError` cuyo `message`
        lista los bancos conocidos y, si la hay, la sugerencia (R24, R25, R26).
      - `createBank(client, rootFolderId, bank)` (**alta explícita, único camino
        de creación**): `normalizeBankName` (T5) → `ensureFolder(slug,
        rootFolderId)` (T6, idempotente); devuelve el `bankFolderId` (R27).
      Cubre: R23, R24, R25, R26, R27.
- [x] T7 — En `src/lib/drive-structure.ts`, `ensureBankYearFolders(client,
      rootFolderId, bank, year)`: valida año (T5); **resuelve** el banco con
      `resolveBankFolder` (T6b) — que exige que exista y lanza `UnknownBankError`
      si no (R23, R24), **nunca lo crea**; luego encadena `ensureFolder(year,
      bankFolderId)` → `ensureFolder('procesados', yearFolderId)` (auto-crean);
      devuelve `{ bankFolderId, yearFolderId, processedFolderId }`. Nunca crea la
      raíz ni la carpeta de banco. Propaga sin reportar éxito si algo falla (R13).
      Cubre: R3, R4, R5, R13, R14, R16, R23, R24.
- [x] T8 — En `src/lib/drive-structure.ts`, `uploadFile(client, folderId, file)`:
      `files.create` con `requestBody: { name, parents: [folderId] }` y `media:
      { mimeType, body }`, `fields: 'id'`; devuelve `data.id`. Sin `files.update`
      sobre ningún archivo previo. Envolver fallos en `DriveConnectionError`.
      Cubre: R9, R10, R12.
- [x] T9 — En `src/lib/drive-structure.ts`, `moveFileToProcessed(client, fileId,
      folders)`: `files.update` con `fileId`, `addParents:
      folders.processedFolderId`, `removeParents: folders.yearFolderId`,
      `fields: 'id, parents'`. Envolver fallos en `DriveConnectionError`.
      Cubre: R11, R12.

## Tests de la lib (dobles en el seam, sin red)

- [x] T10 — Crear `src/lib/drive-structure.test.ts` con el `driveDouble` de
      `design.md` §8 y los casos del mapa de esa sección:
      - normalización válida + traversal neutralizado (R14); rechazos
        vacío/largo/`'procesados'` sin llamadas a Drive (R15).
      - año aceptado (R16); rechazos `'99'`/`'20260'`/`'abcd'`/`'1999'`/`'2101'`/
        `"20'26"` sin llamadas a Drive (R17).
      - `suggestBank` puro: `('santender',['santander','bbva'])→'santander'`;
        `('zzzzz',['santander','bbva'])→undefined` (R26).
      - `ensureFolder`: crea si `list` vacío (R4); reutiliza si `list` con una,
        sin `create` (R6); de-dup determinista con dos (createdTime distinto),
        devuelve la más antigua (R8); concurrente `Promise.all` → `create` una vez
        (R7).
      - `resolveBankFolder`: banco existe (`list` del banco con una) → devuelve id,
        sin `create` (R23); banco desconocido (`list` del banco vacío + `list` de
        la raíz con `['santander','bbva']`) → `UnknownBankError`, **`create` nunca
        llamado** (R24), `message` contiene `santander` y `bbva` (R25) y la
        sugerencia `santander` para `santender` (R26).
      - `createBank`: `list` vacío → `create` con `parents:[rootFolderId]`, devuelve
        id (R27); banco existente (`list` con una) → sin `create`, devuelve id
        existente (R27, idempotente).
      - `UnknownBankError` discriminación: un slug de formato inválido lanza
        `ValidationError` (no `UnknownBankError`); un slug válido no registrado lanza
        `UnknownBankError` (no `ValidationError`) (R28).
      - `ensureBankYearFolders`: banco existe + año/procesados vacíos → 2 `create`,
        el del año con `parents:[bankFolderId]`, nunca crea banco ni raíz (R3, R4);
        resultado con los tres ids (R5); banco desconocido → `UnknownBankError`,
        ningún `create` (R24); convergencia tras fallo parcial en el año (R13).
      - `uploadFile`: `create` con `parents:[folderId]` + `media`, devuelve id
        (R9); dos subidas mismo `name` → dos `create`, dos ids, nunca `update`
        (R10).
      - `moveFileToProcessed`: `update` con `addParents`/`removeParents`/`fileId`
        (R11).
      - error de Drive con token falso (`1//fake-token-value`) →
        `DriveConnectionError` cuyo `message` no lo contiene (R12).
      Cubre: R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17,
      R23, R24, R25, R26, R27, R28.

## Guardianes de arquitectura

- [x] T11 — Modificar `src/architecture.test.ts`: (a) añadir
      `lib/drive-structure.ts` y `lib/drive-structure.test.ts` a la lista
      `expected` del árbol objetivo; (b) guardián nuevo: `src/lib/drive-structure.ts`
      **no** contiene la cadena `prisma` (R18); (c) guardián nuevo:
      `src/lib/drive-structure.ts` **no** contiene `createDriveClient`,
      `createDriveAuth` ni `OAuth2` (R19). No tocar el guardián `no files.` de
      `drive.ts` (sigue verde). Cubre: R18, R19.

## Documentación

- [x] T12 — Modificar `.env.example`: añadir `GOOGLE_DRIVE_ROOT_FOLDER_ID` con
      **placeholder** (nunca un id real) y un comentario que apunte a `design.md`
      §9 (cómo obtener el fileId de la URL de la carpeta). Cubre: R21.
- [x] T13 — Modificar `docs/stack.md`: añadir `GOOGLE_DRIVE_ROOT_FOLDER_ID`
      (obligatoria) a la tabla §Variables de entorno, citando `src/config/env.ts`
      como fuente y `design.md` §9 para obtenerla. **NO** tocar la línea del gestor
      de paquetes. Cubre: R21.
- [x] T14 — Modificar `docs/architecture.md`: añadir **ADR-008** (borrador literal
      en `design.md` §10, con el **modelo de registro** aprobado en la puerta:
      Drive como registro de bancos + `createBank` explícito + `UnknownBankError`);
      añadir `lib/drive-structure.ts` al árbol de la §Estructura de carpetas; añadir
      al *"Umbral para reconsiderar"* de **ADR-006** la nota de que la 8ª variable
      (`GOOGLE_DRIVE_ROOT_FOLDER_ID`) mantiene la cuenta en strings planos →
      validador manual mantenido; reevaluar cuando aparezca la primera variable
      no-string; anotar bajo **ADR-005** que `UnknownBankError` es la nueva subclase
      idiomática que esta feature necesitó. Cubre: R20, R21.
- [x] T15 — Modificar `docs/api-contract.md`: **no** añadir endpoints; (a) ampliar
      la nota de la reserva de `DRIVE_CONNECTION_ERROR` para dejar constancia de que
      la feature 4 se resolvió como **servicio interno** (sin endpoints); (b) añadir
      `UNKNOWN_BANK` (HTTP 404) a la tabla de códigos estables, anotado como
      **reservado** (interno, ningún endpoint lo devuelve todavía; lo devolverá la
      feature que exponga la operación de cara al cliente). Razón en `design.md`
      §5 y §7. Cubre: R20.

## Verificación final

- [x] T16 — `pnpm test`: suite completa en verde (95 tests, 9 files), **sin
      credenciales reales de Drive y sin red** (los nuevos usan dobles; el
      placeholder de vitest cubre `buildApp()`). Los tests existentes siguen
      pasando. Cubre: R22.
- [x] T17 — `pnpm typecheck` en verde (tsc sin errores) y `pnpm format:check` en
      verde (`All matched files use Prettier code style!`). ⚠️ `pnpm lint`
      **BLOQUEADO por un problema de entorno PREEXISTENTE ajeno a la feature**: el
      árbol de trabajo trae un bump sin commitear `typescript ^6.0.3 → ^7.0.2` (y
      `typescript-eslint 8.63 → 8.65`), y typescript-eslint 8.65 no soporta TS 7.0,
      así que ESLint falla al cargar (no llega a mirar el código). No lo toco:
      cambiar dependencias está fuera de scope. `init.sh` (la puerta real) corre
      `tsc + pnpm test`, no lint. Ver informe § sugerencias fuera de scope.
      Cubre: R22.
- [x] T18 — `bash ./init.sh` → termina con `[OK] Entorno listo` (typecheck + 95
      tests verdes). Cubre: R22.
- [x] T19 — Escribir el mapa de trazabilidad `R<n>` → test concreto en
      `progress/implementations/drive-structure.md` (Nivel 4 de
      `docs/verification.md`) para **R1-R28**, anotando explícitamente que **R20 y
      R21 son requirements de proceso** verificados por checklist del reviewer, no
      por test (excepción consciente, precedente: R21/R22/R23 de
      `specs/drive-connection/`). Cubre: R22 (y cierra la trazabilidad de todos).

## Smoke test del humano (Nivel 3 — NO es del implementer)

- [ ] T20 — **El humano** ejecuta el paso manual de `design.md` §9 (crear
      `notas-banco/` a mano, pegar su fileId en `.env` como
      `GOOGLE_DRIVE_ROOT_FOLDER_ID`, y dar de alta al menos un banco creando su
      subcarpeta a mano o vía `createBank`). El contacto real con Drive de las
      operaciones llegará con la feature de ingesta; opcionalmente puede invocar
      `createBank(...)` y luego `ensureBankYearFolders(...)` desde un `tsx` de usar
      y tirar (§9) y verificar en la web de Drive que aparece
      `<banco>/<año>/procesados`. El implementer **no queda bloqueado** por esta
      task. Cubre: R3 (end-to-end), R4, R27.
</content>
