# Implementación — feature 5 `drive-read`

> Primera lectura de archivos de banco desde Google Drive, **sin parsear y sin
> base de datos**. Feature **no-SDD**: implementada contra el `intent` y el
> `acceptance` de `feature_list.json` (no hay spec formal ni `R<n>`).
>
> **Fecha:** 2026-08-03 · **Estado final:** `done` (reviewer APPROVED en
> [reviews/drive-read.md](../reviews/drive-read.md), smoke real end-to-end validado
> por el humano y resumen de cierre en [summaries/drive-read.md](../summaries/drive-read.md)).

## Retoque final 2026-08-04 — el `path` de la respuesta siempre con barras `/`

**Motivación.** El campo `path` de cada elemento de `processed` salía con el
separador del SO (en Windows `bankinter\2026\movs.xlsx`), porque `relativePath` se
construía con `join` del SO y se reutilizaba tanto para escribir en disco como para
el cuerpo de la respuesta. Pero `path` es una **ruta lógica relativa para el
cliente**, no una ruta de sistema de archivos, así que debe ser estable entre
plataformas y usar siempre `/` (como ya mostraba `docs/api-contract.md`).

**Cambio (solo el response).** En
[ingesta.service.ts:96](../../src/modules/ingesta/ingesta.service.ts#L96) se separan
las dos rutas dentro del bucle por archivo:

- **Escritura local:** `targetPath = join(dumpBaseDir, bank.name, year.name, file.name)`
  sigue usando `join` del SO → el volcado en disco es correcto en Windows y en
  POSIX (sin cambios de comportamiento).
- **Response:** `path: posix.join(bank.name, year.name, file.name)` → siempre con
  `/`, nunca con `\`. Se añade `posix` al import de `node:path`.

**Test que lo fija.** En
[ingesta.service.test.ts:135](../../src/modules/ingesta/ingesta.service.test.ts#L135)
(`processPending` copia y mueve) el `toEqual` de `result.processed` ahora exige el
literal `'bankinter/2026/movs.xlsx'` / `'santander/2025/extracto.pdf'` (con `/`), y
se añade una aserción explícita `expect(entry.path).not.toContain('\\')` sobre cada
elemento. Antes el assert usaba `join(...)`, que en Windows habría dado `\` y ahora
fallaría — el test queda blindado contra la regresión.

**Contrato.** [docs/api-contract.md:250](../../docs/api-contract.md#L250) ya mostraba
el ejemplo con `/`; verificado, **no requiere cambios**.

**Puertas (sin red):** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` y
`bash ./init.sh` en verde. **123 tests** en 11 archivos (sin variación en el número:
el nuevo assert se integra en el test existente, no añade caso).

## Endurecimiento 2026-08-04 — normalización de `GOOGLE_DRIVE_ROOT_FOLDER_ID` (URL vs. id)

**Hallazgo del smoke real (Nivel 3, humano).** Contra Drive de verdad,
`files.list` devolvía `404 "File not found"`. Causa: **error de configuración**,
no de código. La variable `GOOGLE_DRIVE_ROOT_FOLDER_ID` del `.env` contenía la
**URL completa** de la carpeta (`https://drive.google.com/drive/folders/<ID>`) en
vez del **id pelado**. Como la URL *contiene* el id, es un traspié muy común: se
copia la barra de direcciones entera. Drive direcciona por `fileId`, así que la
URL entera nunca resuelve. El código de la f5 estaba bien; se endurece el arranque
para tolerar ambas formas.

**Cambio.** Función pura exportada `normalizeDriveFolderId(raw)` en
[env.ts:42](../../src/config/env.ts#L42): acepta id pelado (pasa tal cual, con
`trim`), `/drive/folders/<id>` (con `/` final o `?usp=sharing`) y `open?id=<id>`;
devuelve siempre el id pelado. `loadConfig` la aplica y **guarda el id pelado** en
`config.driveRootFolderId` ([env.ts:114](../../src/config/env.ts#L114)),
manteniendo el fail-fast (sigue obligatoria) y añadiendo una **validación de
cordura**: si tras normalizar el id queda vacío o contiene espacios/`/`, se apila
como problema con su nombre ([env.ts:115](../../src/config/env.ts#L115)). Todo
downstream (la ingesta) sigue recibiendo el id pelado por `config`, sin cambios;
la normalización es transparente y vive solo en el guardián `config/env.ts`.

**Tests nuevos** (ID sintético, sin red; +8, suite 115→123):

| Test | Dónde |
| --- | --- |
| `loadConfig` normaliza URL `/folders/<id>?usp=sharing` → id pelado | [env.test.ts:157](../../src/config/env.test.ts#L157) |
| `loadConfig` lanza nombrando la var si queda un `/` tras normalizar (cordura) | [env.test.ts:166](../../src/config/env.test.ts#L166) |
| `normalizeDriveFolderId`: id pelado → igual | [env.test.ts:192](../../src/config/env.test.ts#L192) |
| `normalizeDriveFolderId`: `trim` de espacios | [env.test.ts:196](../../src/config/env.test.ts#L196) |
| `normalizeDriveFolderId`: URL `/folders/<id>` → extrae | [env.test.ts:200](../../src/config/env.test.ts#L200) |
| `normalizeDriveFolderId`: URL con `/` final → extrae | [env.test.ts:206](../../src/config/env.test.ts#L206) |
| `normalizeDriveFolderId`: URL con `?usp=sharing` → extrae | [env.test.ts:212](../../src/config/env.test.ts#L212) |
| `normalizeDriveFolderId`: `open?id=<id>&…` → extrae | [env.test.ts:220](../../src/config/env.test.ts#L220) |

Los 21 tests previos de `loadConfig` (obligatoriedad, defaults, mensajes de
error) siguen verdes: el placeholder `test-root-folder-id` de
[vitest.config.ts:19](../../vitest.config.ts#L19) es id pelado y pasa la cordura.

**Docs (ligero):** comentario en [.env.example:18](../../.env.example#L18) (acepta
id o URL), fila y nota de la variable en `docs/stack.md`, y nota de la raíz en
`specs/drive-structure/design.md` §9. **Sin ADR nuevo** (endurecimiento dentro de
ADR-008/ADR-009). Sin dependencias ni variables de entorno nuevas. `.env` NO tocado.

## Qué se construyó

- **Operaciones Drive de lectura** en `src/lib/drive-structure.ts` (contraparte
  `files.*`, ADR-008), reutilizando el cliente de la f3 y el mover/`ensureFolder`
  de la f4: `listBankFolders` (registro dinámico de bancos = subcarpetas de la
  raíz), `listYearFolders` (solo carpetas con forma `^\d{4}$`), `listPendingFiles`
  (hijos no-carpeta del año, excluye `procesados/`) y `downloadFileContent`
  (`files.get` con `alt: 'media'` + `responseType: 'arraybuffer'` → `Buffer`,
  envuelto en `DriveConnectionError` sanitizado).
- **Módulo `src/modules/ingesta/`** con dos endpoints **sin auth nueva**:
  `GET /api/ingesta/pending` (detección no destructiva) y
  `POST /api/ingesta/process` (descarga tal cual → copia local → mover a
  `procesados/`, **uno a uno**, aislando el fallo por archivo).
- **Volcado local gitignoreado** en `var/drive-read/<banco>/<año>/<archivo>`
  (base inyectable; por defecto `process.cwd()/var/drive-read`).
- Docs y guardianes actualizados (contrato, ADR-009, `.gitignore`, tests de
  arquitectura).

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| `listBankFolders` (bancos dinámicos bajo la raíz) | [drive-structure.ts:365](../../src/lib/drive-structure.ts#L365) |
| `listYearFolders` (años del banco, forma `^\d{4}$`) | [drive-structure.ts:386](../../src/lib/drive-structure.ts#L386) |
| `listPendingFiles` (pendientes del año, excluye `procesados/`) | [drive-structure.ts:407](../../src/lib/drive-structure.ts#L407) |
| `downloadFileContent` (`files.get` alt=media → `Buffer`) | [drive-structure.ts:438](../../src/lib/drive-structure.ts#L438) |
| `processedFolderName` exportado (reuso f4) | [drive-structure.ts:12](../../src/lib/drive-structure.ts#L12) |
| `detectPending` (detección multi-banco no destructiva) | [ingesta.service.ts:32](../../src/modules/ingesta/ingesta.service.ts#L32) |
| `processPending` (descarga + copia local + mover, archivo-a-archivo) | [ingesta.service.ts:72](../../src/modules/ingesta/ingesta.service.ts#L72) |
| `describeError` (mensaje sanitizado del fallo) | [ingesta.service.ts:139](../../src/modules/ingesta/ingesta.service.ts#L139) |
| Rutas `GET /pending` y `POST /process` (base inyectable) | [ingesta.routes.ts:24](../../src/modules/ingesta/ingesta.routes.ts#L24) |
| Tipos de respuesta (`DetectionResult`, `ProcessResult`, ...) | [ingesta.types.ts:1](../../src/modules/ingesta/ingesta.types.ts#L1) |
| Registro del módulo bajo `/api/ingesta` | [app.ts:32](../../src/app.ts#L32) |
| Guardián: ingesta sin `prisma` | [architecture.test.ts:104](../../src/architecture.test.ts#L104) |
| Guardián: `.gitignore` tapa el volcado (privacidad) | [architecture.test.ts:116](../../src/architecture.test.ts#L116) |
| `.gitignore` del volcado local | [.gitignore:16](../../.gitignore#L16) |
| Contrato de API (2 endpoints + nota `DRIVE_CONNECTION_ERROR`) | [api-contract.md](../../docs/api-contract.md) |
| ADR-009 (decisiones de la feature) | [architecture.md](../../docs/architecture.md) |

### Tests (dobles del cliente Drive, sin red; escritura local contra tempdir)

| Test | Dónde |
| --- | --- |
| Detección multi-banco dinámica, no destructiva | [ingesta.service.test.ts:96](../../src/modules/ingesta/ingesta.service.test.ts#L96) |
| Detección: cero pendientes → sin bancos | [ingesta.service.test.ts:120](../../src/modules/ingesta/ingesta.service.test.ts#L120) |
| Proceso: copia local + mover original (reuso f4) | [ingesta.service.test.ts:135](../../src/modules/ingesta/ingesta.service.test.ts#L135) |
| Proceso: idempotencia (sin pendientes, x2) → no duplica | [ingesta.service.test.ts:189](../../src/modules/ingesta/ingesta.service.test.ts#L189) |
| Fallo de lectura → no mueve + error sanitizado | [ingesta.service.test.ts:211](../../src/modules/ingesta/ingesta.service.test.ts#L211) |
| Fallo de copia local → no mueve | [ingesta.service.test.ts:241](../../src/modules/ingesta/ingesta.service.test.ts#L241) |
| Aislamiento del fallo por archivo (los sanos siguen) | [ingesta.service.test.ts:268](../../src/modules/ingesta/ingesta.service.test.ts#L268) |
| Fallo Drive de nivel superior → `DriveConnectionError` | [ingesta.service.test.ts:305](../../src/modules/ingesta/ingesta.service.test.ts#L305) |
| Endpoint `GET /pending` 200 | [ingesta.routes.test.ts:74](../../src/modules/ingesta/ingesta.routes.test.ts#L74) |
| Endpoint `GET /pending` 503 `DRIVE_CONNECTION_ERROR` | [ingesta.routes.test.ts:96](../../src/modules/ingesta/ingesta.routes.test.ts#L96) |
| Endpoint `POST /process` 200 + copia + mover | [ingesta.routes.test.ts:113](../../src/modules/ingesta/ingesta.routes.test.ts#L113) |
| `listBankFolders` (id/name, filtra basura) | [drive-structure.test.ts:405](../../src/lib/drive-structure.test.ts#L405) |
| `listYearFolders` (solo años) | [drive-structure.test.ts:438](../../src/lib/drive-structure.test.ts#L438) |
| `listPendingFiles` (excluye `procesados/`) | [drive-structure.test.ts:461](../../src/lib/drive-structure.test.ts#L461) |
| `downloadFileContent` (Buffer + wrap sanitizado) | [drive-structure.test.ts:492](../../src/lib/drive-structure.test.ts#L492) |

## Mapeo acceptance → test

1. **Detección no destructiva, multi-banco dinámica, cuenta+lista sin tocar** →
   `ingesta.service.test.ts:96` (get/update/create no llamados),
   `drive-structure.test.ts:405/438/461`, `ingesta.routes.test.ts:74`.
2. **Proceso: descarga tal cual + copia local** → `ingesta.service.test.ts:135`
   (lee los bytes del fichero local), `drive-structure.test.ts:492`,
   `ingesta.routes.test.ts:113`.
3. **Tras copiar OK, mueve a `procesados/` reutilizando f4** →
   `ingesta.service.test.ts:135` (assert `update` con `addParents`/`removeParents`),
   `ingesta.routes.test.ts:113`.
4. **Si lectura/copia falla → NO mueve + error sin secretos** →
   `ingesta.service.test.ts:211` (lectura), `:241` (copia), `:268` (aislamiento),
   `drive-structure.test.ts:492` (token oculto en el wrap).
5. **Reejecutar sin pendientes no hace nada ni duplica** →
   `ingesta.service.test.ts:189` (corre 2 veces, tempdir vacío), `:120`.
6. **Volcado local en `.gitignore`** → `architecture.test.ts:116`.
7. **NO parsea / NO BD / NO UI / reutiliza f3+f4** → `architecture.test.ts:104`
   (sin `prisma`; ninguna tabla ni `*.schema.ts` nuevo), reuso de
   `moveFileToProcessed`/`ensureFolder`/`AppDriveClient` ejercitado en
   `ingesta.service.test.ts:135`; el contenido se devuelve como `Buffer` sin
   interpretarse (no parse). "No UI" es N/A (backend).
8. **Se expone como endpoint(s) + contrato actualizado, sin auth nueva** →
   `ingesta.routes.test.ts:74/96/113` + `docs/api-contract.md` (sección Ingesta).
9. **Cada criterio con test (dobles, sin red), init.sh verde, decisiones anotadas** →
   este mapeo + ADR-009 en `docs/architecture.md`. **Sin variables de entorno ni
   dependencias nuevas** (la carpeta de volcado es ruta fija del repo, inyectable),
   por lo que `docs/stack.md` y `.env.example` no cambian.

## Decisiones tomadas (delegadas en el agente)

- **Endpoints** (vs servicio interno de la f4): se exponen como HTTP porque el
  `intent` pide que el backend "me diga" pendientes y dispare el proceso "cuando
  lo pida", y el frontend los consumirá. `GET /api/ingesta/pending` +
  `POST /api/ingesta/process`, sin auth nueva. Detalle en ADR-009.
- **Volcado local:** `var/drive-read/<banco>/<año>/<archivo>` (espeja Drive, legible
  para inspeccionar el formato de cada banco). Base **inyectable** (opción del
  plugin de rutas) para testear contra tempdir; por defecto
  `process.cwd()/var/drive-read`. En `.gitignore` (privacidad crítica).
- **Uno a uno con aislamiento del fallo:** cada archivo se descarga/copia/mueve por
  separado; un fallo se reporta en `failed[]` (su original no se mueve) y no
  detiene al resto → respuesta 200 con detalle. Solo un fallo de Drive de nivel
  superior (ni listar bancos) sube como 503 `DRIVE_CONNECTION_ERROR`.
- **`DRIVE_CONNECTION_ERROR`** deja de estar solo "reservado": es el primer código
  de Drive que un endpoint de dominio devuelve en el cuerpo (contrato actualizado).
  `UNKNOWN_BANK` sigue reservado (la ingesta descubre bancos por carpeta).

## Límites conocidos (anotados, no bloqueantes)

- **Paginación:** las listas usan `pageSize: 1000` sin seguir `nextPageToken`
  (igual que `listBankNames` de la f4). Suficiente para el uso previsto.
- **Colisión de nombre local:** dos pendientes con el mismo nombre en el mismo
  `<banco>/<año>/` sobrescribirían la copia local; cada uno es un fichero distinto
  en Drive y se mueve igual, así que el original nunca se pierde.

## Sugerencias fuera de scope (NO aplicadas)

- Cuando llegue la f6 (parser + modelo), el `path` relativo del volcado local
  puede servir de entrada directa para el parser del primer banco (Bankinter).

## Verificación

- `bash ./init.sh` → **`[OK] Entorno listo`**: type check OK (`tsc --noEmit` sin
  errores) + **123 tests** en 11 archivos, todos verdes (baseline de la f5 eran
  115; +8 del endurecimiento de la normalización).
- `pnpm typecheck` → sin errores.
- `pnpm lint` → limpio (eslint sin hallazgos).
- `pnpm format:check` → `All matched files use Prettier code style!`.

```
── 4. Type checking (tsc) ──
[OK]    Type check OK (tsc sin errores)
── 5. Ejecutando tests ──
 Test Files  11 passed (11)
      Tests  123 passed (123)
── 6. Resumen ──
[OK]    Entorno listo. Puedes empezar a trabajar.
```

## Estado en `feature_list.json`

Feature 5 `drive-read` queda en **`done`**: el `reviewer` aprobó
([reviews/drive-read.md](../reviews/drive-read.md)), el humano validó el smoke real
end-to-end y existe el resumen de cierre
([summaries/drive-read.md](../summaries/drive-read.md)). Ninguna feature queda en
`in_progress` y el JSON es válido.

## Archivos creados / modificados

**Creados**
- `src/modules/ingesta/ingesta.routes.ts`
- `src/modules/ingesta/ingesta.service.ts`
- `src/modules/ingesta/ingesta.types.ts`
- `src/modules/ingesta/ingesta.service.test.ts`
- `src/modules/ingesta/ingesta.routes.test.ts`

**Modificados**
- `src/lib/drive-structure.ts` (4 funciones de lectura/descarga + `DriveFolder`/
  `DriveFile` + export de `processedFolderName`)
- `src/lib/drive-structure.test.ts` (4 describe nuevos)
- `src/app.ts` (registro del módulo `ingesta`)
- `src/architecture.test.ts` (2 guardianes nuevos + tree con `modules/ingesta/`)
- `.gitignore` (`var/drive-read/`)
- `docs/api-contract.md` (sección Ingesta + nota `DRIVE_CONNECTION_ERROR`)
- `docs/architecture.md` (ADR-009 + árbol de carpetas)
- `feature_list.json` (status 5 → `in_progress`)
- `progress/current.md` (feature en curso + plan)

**Modificados (endurecimiento 2026-08-04, normalización URL vs. id)**
- `src/config/env.ts` (`normalizeDriveFolderId` + normalización y cordura en `loadConfig`)
- `src/config/env.test.ts` (+8 tests con id sintético)
- `.env.example` (comentario: acepta id o URL de la carpeta)
- `docs/stack.md` (fila y nota de `GOOGLE_DRIVE_ROOT_FOLDER_ID`)
- `specs/drive-structure/design.md` (§9: nota de normalización)
