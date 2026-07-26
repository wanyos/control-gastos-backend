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

> Los enlaces de la columna **Código** son **clicables** en la vista previa de
> Markdown de VS Code (o con `Ctrl`/`Cmd` + clic sobre el enlace): te llevan a la
> línea exacta del archivo.

### 📁 Estructura de carpetas — banco / año / procesados

> Todo en [`src/lib/drive-structure.ts`](../../src/lib/drive-structure.ts).

| Qué hace | Función | Código |
| --- | --- | --- |
| Asegura `<banco>/<año>/procesados`: resuelve el banco y auto-crea año + `procesados` | `ensureBankYearFolders` | [:288](../../src/lib/drive-structure.ts#L288) |
| Resuelve el banco existente, o lanza `UnknownBankError` (lista + sugerencia) | `resolveBankFolder` | [:254](../../src/lib/drive-structure.ts#L254) |
| Alta explícita de banco — **único** camino, idempotente | `createBank` | [:272](../../src/lib/drive-structure.ts#L272) |
| Crea la carpeta solo si falta; lock en memoria por `(padre, nombre)` | `ensureFolder` | [:205](../../src/lib/drive-structure.ts#L205) |
| Resuelve por nombre; de-dup determinista (reutiliza la más antigua) | `findFolder` | [:144](../../src/lib/drive-structure.ts#L144) |

### 📤 Archivos — subir y mover

> Todo en [`src/lib/drive-structure.ts`](../../src/lib/drive-structure.ts).

| Qué hace | Función | Código |
| --- | --- | --- |
| Sube un archivo nuevo (nunca sobrescribe ni concatena) | `uploadFile` | [:306](../../src/lib/drive-structure.ts#L306) |
| Mueve el archivo a `procesados/` (`addParents` / `removeParents`) | `moveFileToProcessed` | [:330](../../src/lib/drive-structure.ts#L330) |

### ✅ Validación y ayudas (funciones puras)

> Todo en [`src/lib/drive-structure.ts`](../../src/lib/drive-structure.ts).

| Qué hace | Función | Código |
| --- | --- | --- |
| Normaliza y valida el nombre de banco a slug seguro | `normalizeBankName` | [:52](../../src/lib/drive-structure.ts#L52) |
| Valida el año (`^\d{4}$`, rango 2000-2100) | `validateYear` | [:82](../../src/lib/drive-structure.ts#L82) |
| Sugiere el banco más parecido (Levenshtein ≤ 2, desempate alfabético) | `suggestBank` | [:123](../../src/lib/drive-structure.ts#L123) |

### ⚠️ Errores y configuración

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Envuelve fallos de Drive en `DriveConnectionError` sanitizado | `callDrive` | [drive-structure.ts:34](../../src/lib/drive-structure.ts#L34) |
| Clase de error de banco no registrado (`UNKNOWN_BANK`, 404) | `UnknownBankError` | [app-error.ts:35](../../src/errors/app-error.ts#L35) |
| Variable de la carpeta raíz, validada al arrancar | `GOOGLE_DRIVE_ROOT_FOLDER_ID` | [env.ts:82](../../src/config/env.ts#L82) |

### 🧪 Tests y guardianes

| Qué cubre | Código |
| --- | --- |
| Test principal de la lib (26 casos, sin red) | [drive-structure.test.ts:1](../../src/lib/drive-structure.test.ts#L1) |
| Guardián de alcance: sin `prisma` (R18) | [architecture.test.ts:85](../../src/architecture.test.ts#L85) |
| Guardián de alcance: sin wiring de auth (R19) | [architecture.test.ts:91](../../src/architecture.test.ts#L91) |

### 📄 Documentación de la decisión

| Qué | Código |
| --- | --- |
| ADR-008 — estructura en Drive, Drive como registro de bancos | [architecture.md:276](../../docs/architecture.md#L276) |

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
