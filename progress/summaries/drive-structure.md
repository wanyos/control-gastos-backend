# Resumen — feature 4 `drive-structure`

Fecha de cierre: 2026-07-25
Intención original: `feature_list.json` → feature `drive-structure`, bloque `intent`
Spec (SDD): `specs/drive-structure/`

## Qué hace ahora la app que antes no

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

## Por dónde se usa (puntos de entrada)

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

## Dónde está el código (para revisión directa)

| Qué | Archivo:línea |
|-----|---------------|
| Asegurar `<banco>/<año>/procesados` (resuelve banco, auto-crea año/procesados) | `src/lib/drive-structure.ts:288` |
| Resolver banco existente o `UnknownBankError` (lista + sugerencia) | `src/lib/drive-structure.ts:254` |
| Alta explícita de banco (único camino, idempotente) | `src/lib/drive-structure.ts:272` |
| `ensureFolder` idempotente + lock en memoria por `(padre,nombre)` | `src/lib/drive-structure.ts:205` |
| `findFolder` (de-dup determinista: la más antigua) | `src/lib/drive-structure.ts:144` |
| Subir archivo nuevo (nunca sobrescribe) | `src/lib/drive-structure.ts:306` |
| Mover a `procesados/` (addParents/removeParents) | `src/lib/drive-structure.ts:330` |
| Validación de slug de banco / año | `src/lib/drive-structure.ts:52` / `:82` |
| `suggestBank` (Levenshtein ≤ 2, desempate alfabético) | `src/lib/drive-structure.ts:123` |
| Sanitizado de errores de Drive (`callDrive`) | `src/lib/drive-structure.ts:34` |
| Nueva clase de error `UnknownBankError` | `src/errors/app-error.ts:35` |
| Variable `GOOGLE_DRIVE_ROOT_FOLDER_ID` validada al arrancar | `src/config/env.ts:82` |
| Test principal de la lib (26 casos, sin red) | `src/lib/drive-structure.test.ts:1` |
| Guardianes de alcance (no prisma / no auth-wiring) | `src/architecture.test.ts:85`, `:91` |
| ADR-008 | `docs/architecture.md:276` |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien`:

- ✅ "Cuando pido asegurar la carpeta de un banco/año que aún no existe, la crea (con
  su procesados/ dentro) sin fallar" → se cumple para año/procesados; verificado en
  `src/lib/drive-structure.test.ts:261`. (Matiz de la puerta: el **banco** debe existir;
  si no, falla a propósito.)
- ✅ "Cuando esa carpeta ya existe, NO crea duplicados: la reutiliza (idempotente)" →
  verificado en `src/lib/drive-structure.test.ts:105` (reutiliza), `:118` (de-dup),
  `:134` (concurrente, un solo create).
- ✅ "Cuando subo un archivo, aparece como archivo nuevo sin sobrescribir ni
  concatenarse" → verificado en `src/lib/drive-structure.test.ts:350` y `:367`.
- ✅ "Cuando un archivo se da por procesado, lo mueve a procesados/ y deja de estar en
  pendientes" → verificado en `src/lib/drive-structure.test.ts:387`.
- ✅ "Cuando algo falla con Drive, error claro y no deja la estructura a medias" →
  verificado en `src/lib/drive-structure.test.ts:148` (error sanitizado) y `:313`
  (converge tras fallo parcial, sin recrear el banco).

## Decisiones que se tomaron por ti

- (humano, puerta 2026-07-24) **Drive es el registro de bancos; crear es explícito.**
  La ruta normal exige que el banco exista (`resolveBankFolder`); el alta es una función
  aparte (`createBank`). Elegido sobre un flag `{create:true}` para que un typo no cree
  basura. Vive en `src/lib/drive-structure.ts:254` y `:272`.
- (delegado) **Raíz por variable de entorno obligatoria** `GOOGLE_DRIVE_ROOT_FOLDER_ID`,
  validada al arrancar; el backend nunca crea la raíz. `src/config/env.ts:82`. Es campo
  hermano de `drive` (no una credencial).
- (delegado) **Servicio interno, sin endpoints.** No se abre superficie HTTP sin auth
  sobre un Drive con scope completo. `docs/api-contract.md:60-68`.
- (delegado) **Error nuevo `UnknownBankError`** (`UNKNOWN_BANK`, 404), distinguible de
  `ValidationError` (400) y `DriveConnectionError` (503). `src/errors/app-error.ts:35`.
- (delegado) **Idempotencia/carrera:** de-dup por la carpeta más antigua + lock en memoria
  por proceso. Límite honesto: en multi-instancia pueden aparecer duplicados, hechos
  inofensivos por la de-dup pero no borrados. `design.md §3.3`.
- (añadido) **Rango de año fijo 2000-2100** (no relativo al reloj, para tests
  deterministas). `src/lib/drive-structure.ts:82`.
- (añadido) **Umbral de sugerencia Levenshtein ≤ 2 y desempate alfabético**
  (aprobado por ti en la 2ª puerta). `src/lib/drive-structure.ts:123`.

## Qué NO se tocó / quedó fuera

- No lee ni parsea el contenido de los archivos, ni importa nada a la base de datos.
- No detecta "N nuevos" ni dispara la importación (eso es la feature de ingesta).
- No re-monta la conexión con Drive: consume `fastify.drive` de la feature 3.
- No crea la carpeta raíz `notas-banco/` (la creas tú a mano; ver `design.md §9`).
- No expone endpoints HTTP (los códigos `UNKNOWN_BANK` y `DRIVE_CONNECTION_ERROR`
  quedan **reservados** en el contrato).

## Notas para el futuro

- **Pendiente tuyo (T20, smoke real):** crea `notas-banco/` en tu Drive, pega su fileId
  en `.env` como `GOOGLE_DRIVE_ROOT_FOLDER_ID`, y da de alta al menos un banco (subcarpeta
  a mano o `createBank`). El contacto real con Drive llegará con la ingesta.
- **Bloqueo de lint ajeno a la feature:** el árbol trae un bump sin commitear en
  `package.json` (`typescript ^6.0.3 → ^7.0.2`, `typescript-eslint 8.63 → 8.65`), y
  esa versión de typescript-eslint no soporta TS 7.0, así que `pnpm lint` falla al cargar
  el config (antes de mirar código). `init.sh` (tsc + tests) no usa lint y está verde.
  Conviene alinear versiones y actualizar `docs/stack.md` (aún dice `typescript@^6.0.3`).
- **`console.warn` diagnóstico** en `findFolder` cuando Drive tiene carpetas homónimas:
  exigido por el spec; las funciones son puras y no tienen logger. A migrar si algún día
  reciben uno.
