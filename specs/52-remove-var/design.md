# Design — F52 `remove-var`

> Todo lo que se afirma aquí del código actual lo leí o lo ejecuté el 2026-10-02.
> Lo que **no** comprobé va dicho con esas palabras.

## 1. Qué hay hoy (comprobado)

- `src/app.ts` registra seis plugins de ruta bajo `/api/parser` (líneas 115-124) y
  construye tres registros (`bankParsers`, `productParsers`,
  `depositMaturityMatchers`). De los `*.service.ts` de banco solo importa dos
  funciones: `parseMyinvestorProductFile` y `parseTradeRepublicProductFile`.
- Los `*.service.ts` de **bankinter, n26, openbank y revolut** exportan una sola
  función (`parseLocal<Banco>Copies`) y solo la importan su `*.routes.ts` y su
  test. Los de **myinvestor y trade-republic** exportan además la función que usa
  `src/app.ts`.
- `importDriveFile` (`src/modules/import/import.service.ts`, líneas 482-522)
  descarga a memoria, escribe la copia (líneas 497-499) y pasa **el buffer en
  memoria** a `store`. La copia no se vuelve a leer en ese camino.
- `POST /api/import/local` vive en `import.routes.ts` (línea 76) y en
  `import.local.service.ts`, con su esquema `import.schema.ts`, sus tipos
  `Local*` en `import.types.ts` y `LocalCopyNotFoundError` en
  `src/errors/app-error.ts`.
- `POST /api/ingestion/process` es `processPending` en `ingestion.service.ts`.
  `detectPending` (lo de `GET /pending`) no usa el disco.
- El valor por defecto `join(process.cwd(), 'var', …)` está en ocho
  `*.routes.ts`: los seis bancos, `import` e `ingestion`.
- `vitest.global-setup.ts` llama a `snapshotVarDir` / `describeVarDifferences` de
  `src/lib/test-var.ts`. `src/lib/test-guard.e2e.test.ts` usa esas dos funciones
  dentro del proyecto de prueba que escribe, como vehículo para demostrar que
  `failRun` hace salir a `vitest run` con código ≠ 0.
- `.gitignore` tiene tres líneas de `var/`. `src/architecture.test.ts` (líneas
  632-642) y `src/no-real-data.test.ts` (líneas 677-683) exigen dos de ellas.
- `scripts/myinvestor-xlsx-a-csv.mjs` **no usa `var/`**: lee y escribe las rutas
  que recibe por `--xlsx` y `--salida`. No se toca.
- El frontend (`../gastos-frontend/src`) solo llama a `GET /api/ingestion/pending`
  de todo lo que roza esta feature; a ninguna de las ocho.
- `pnpm exec tsx -e "import('./src/app.ts')…"` carga `src/app.ts` fuera del
  servidor y lee los registros (5 parsers de extracto, 2 de producto) sin arrancar
  nada: es lo que necesita el comando de §4.
- En el disco del humano, contando nombres sin abrir nada: `var/drive-read` 65
  archivos, `var/parsed` 7, `var/backups` 0. Nada del repositorio escribe en
  `var/backups` (solo lo nombra `.gitignore`).

## 2. Archivos que se BORRAN

| Archivo | Por qué |
|---|---|
| `src/modules/<banco>/<banco>.routes.ts` y `.routes.test.ts` (los seis bancos) | La ruta desaparece |
| `src/modules/{bankinter,n26,openbank,revolut}/<banco>.service.ts` y `.service.test.ts` | Solo contenían el recorrido de la copia en disco |
| `src/modules/import/import.local.service.ts`, `import.local.service.test.ts`, `import.local.routes.test.ts`, `import.schema.ts` | `POST /api/import/local` |
| `src/lib/test-var.ts`, `src/lib/test-var.test.ts` | La comprobación de la feature 33 |

**Lo que NO se borra de un módulo de banco:** sus `*.parser.ts`, `*.format.ts`,
`*.csv.ts`, `*.html.ts`, `*.fixture.ts`, `*.types.ts`, sus tests de parser y
`myinvestor.deposit-maturity.ts`. Ningún parser cambia una línea de código (solo
comentarios que nombren `var/`, ver §6).

## 3. Archivos que se MODIFICAN

### 3.1 Módulos de banco

- `myinvestor.service.ts`: quedan `parseMyinvestorProductFile` y `toProductInput`.
  Se va `parseLocalMyinvestorCopies` con todo lo que solo ella usa, y los imports
  de `node:fs/promises` y `node:path`. La cabecera de `parseMyinvestorProductFile`
  deja de compararse con el otro camino.
- `trade-republic.service.ts`: queda `parseTradeRepublicProductFile`. Se va el
  resto.
- `myinvestor.service.test.ts` y `trade-republic.service.test.ts`: quedan los
  `describe` de `parse…ProductFile` (en MyInvestor los dos últimos; en Trade
  Republic el tercero). Los demás se borran.
- `<banco>.types.ts` (los seis): se borra **cada tipo exportado que ya no importe
  nadie** tras los borrados (resúmenes de la pasada local: `ParsedFileSummary`,
  `FailedParse`, `ParseRunResult`, `FailedFile`, `IgnoredFile`,
  `ParsedStatementSummary`, `<Banco>ParseRunResult`, `ParsedProductSummary`,
  `ParsedSavingsAccountSummary`, `MyinvestorProductsResult`,
  `TradeRepublicProductsResult`). Regla para el implementer: se borra un tipo solo
  tras buscar su nombre en `src/` y no encontrar otro uso; no se fía de esta lista.
- **Tests de los `*.routes.test.ts` que no eran de la ruta** se conservan en un
  archivo nuevo `src/modules/<banco>/<banco>.registry.test.ts`, sin cambiar lo que
  afirman:

  | Banco | Tests que se conservan |
  |---|---|
  | n26 | `is in the parser registry of the composition root, with the .csv extension (C12)`; `leaves the account to the existing importer path when the iban is not written (C8)` |
  | openbank | `is in the parser registry … with the .xls extension`; `leaves the account to the existing importer path when the IBAN is not written`; `stops POST /api/import reporting this bank .xls as skipped` |
  | revolut | `is in the parser registry … with the .csv extension`; `is chosen by the importer for a .csv in the revolut folder, with this very parser` |
  | trade-republic | `is NOT in the STATEMENT registry: it has no statement to import (R16)`; `IS in the PRODUCT registry, reading only its .json (feature 26, R10)` |

  Bankinter y MyInvestor no tienen ninguno de esos: sus `*.routes.test.ts` se
  borran sin más.

### 3.2 `src/modules/import/`

- `import.routes.ts`: se va `POST /local`, la opción `rawCopyBaseDir`, los imports
  de `import.local.service.js`, `import.schema.js` y `node:path`. La cabecera
  describe una sola ruta de importación más las dos de la feature 48.

  ```ts
  export interface ImportRoutesOptions {
    parsers?: BankParserRegistry
    productParsers?: ProductParserRegistry
  }
  ```

- `import.service.ts`: `rawCopyBaseDir` sale de `ImportPendingDeps` y de
  `DriveFileDeps`; se borran las líneas 494-499 de `importDriveFile` y los imports
  `mkdir`, `writeFile`, `dirname`, `join` (`extname` se queda). `describeError`
  pasa a exportarse (lo usa §4). Los comentarios que hablan de «the two ways in» o
  de «the local copies» se corrigen.
- `import.types.ts`: se borran `LocalFileReportBase`, `SkippedLocalFileReport`,
  `AttemptedLocalFileReport`, `AttemptedLocalProductFileReport`, `LocalFileReport`
  y `LocalImportRunResult`.
- `src/errors/app-error.ts`: se borra `LocalCopyNotFoundError`.

### 3.3 `src/modules/ingestion/`

- `ingestion.routes.ts`: una sola ruta, `GET /pending`; se va
  `IngestionRoutesOptions` entera (no le queda ninguna opción).
- `ingestion.service.ts`: se va `processPending`, `describeError` y los imports de
  disco y de `downloadFileContent`.
- `ingestion.types.ts`: se van `ProcessedFile`, `FailedFile`, `ProcessResult`.
- Tests: se borran los de `processPending` y el `describe('POST
  /api/ingestion/process')`. El bloque `retired /api/ingesta/* surface` se queda;
  su test `registers the same capabilities under /api/ingestion/*` deja de afirmar
  `POST /api/ingestion/process`.

### 3.4 `src/app.ts`

Se van los seis imports de rutas, los seis `app.register(…, { prefix:
'/api/parser' })` y el comentario de Trade Republic que habla de volcar a disco.
Los tres registros no cambian.

### 3.5 Suite y guardianes

- `vitest.global-setup.ts`: se va la foto de `var/` (antes y después), su mensaje
  y el import de `test-var.js`. La cabecera pasa a hablar de dos comprobaciones.
- `src/lib/test-guard.ts`: solo la cabecera (deja de nombrar `var/` y el ADR-029).
- `src/lib/test-guard.test.ts`: la cadena `'var/ ha cambiado'` pasa a otro texto
  inventado.
- `src/lib/test-guard.e2e.test.ts`: el proyecto de prueba que escribe deja de
  importar `test-var.js`. Su `guard.setup.ts` guarda con `statSync` la fecha de
  modificación del archivo vigilado antes, la compara después y llama a `failRun`
  con un mensaje propio que no nombre `var/`. Sigue demostrando lo mismo: que
  `failRun` en el cierre del `globalSetup` hace salir a `vitest run` con código ≠ 0
  con todos los tests en verde, y con 0 cuando no se toca nada.
- `src/no-real-data.test.ts`: el test `has the local captures gitignored, so a
  capture is never versioned` pasa a llamarse `has the var folder gitignored whole,
  and versions nothing under it`: exige una línea que sea exactamente `var/` y que
  `versionedFiles()` no tenga nada bajo `var/`.
- `src/architecture.test.ts`:
  - la lista del árbol (`contains the target tree…`): se quitan los archivos de §2
    y se añaden los nuevos de §4 y §3.1;
  - se borran `keeps the local reimport away from Drive…` y los dos tests de
    `.gitignore` (queda el de `no-real-data.test.ts`);
  - las listas de `keeps the <banco> parser module free of data access` pierden los
    archivos borrados; la de `ingestion` no cambia de archivos;
  - **cuatro tests nuevos** (nombres exactos, los usan los `checks`):
    1. `answers 404 to the eight routes retired by feature 52` — en un `describe`
       propio junto al de `/api/expenses`, con `buildApp()` e `inject` a las ocho,
       esperando `404` y `{ statusCode: 404, code: 'NOT_FOUND' }`. Un solo `it` que
       recorre las ocho y dice cuál falla.
    2. `keeps the importer off the filesystem` — ningún archivo de
       `src/modules/import/` ni de `src/modules/ingestion/` que no sea test
       contiene `node:fs`.
    3. `mentions the var folder nowhere in the code` — recorre los archivos de R5 y
       falla con `archivo:línea` si alguno casa con `/(?<![\w/.-])var\//` o con
       `/['"]var['"]/`. Las dos excepciones van en una lista con su motivo.
    4. `has none of the files feature 52 removed` — los archivos de §2 no existen.

### 3.6 Tests que hoy solo pasan por los caminos que se quitan

Se **reescriben** sobre `importPending` con un cliente de Drive simulado, porque
afirman algo del importador y no de la ruta retirada:

| Test de hoy | Dónde queda |
|---|---|
| `revolut.import.test.ts` (6 tests, registro real de `src/app.ts`) | mismo archivo, vía `importPending` |
| `myinvestor.import.test.ts` (los que usan `importLocalCopies`) | mismo archivo, vía `importPending` |
| `import.local.service.test.ts`: `categorizes the movements this run just imported, after the detection (R12)` y `reports a categorization failure inside the report, with the import intact (R12)` | `import.service.test.ts` |
| `import.local.routes.test.ts`: `links nobody when two mirrors compete, and lists the group in the report (feature 40, R5, R6)` y `reports a detection failure inside the 200, with the import intact (feature 40, R15)` | `import.routes.test.ts` |

Lo comprobé buscando en `import.service.test.ts` e `import.routes.test.ts`: del
camino de Drive hoy solo existe «el informe lleva la categorización a ceros» y
«empareja una pareja inequívoca». El resto de `import.local.*.test.ts` (anclas,
relleno de saldos, descuadres, avisos guardados, archivo sin movimientos, archivo
sin IBAN, duplicados, productos) **ya tiene su gemelo** en el camino de Drive por
el nombre de sus tests; el implementer lo confirma test a test antes de borrar y,
si alguno no lo tiene, lo lleva en vez de perderlo y lo dice en su informe.

Para no escribir un tercer y cuarto simulacro de Drive, se crea
`src/lib/drive.fixture.ts` (precedente: `src/lib/iban.fixture.ts`):

```ts
export interface PendingFileFixture { name: string; content: Buffer }
/** One bank folder, one year, its `procesados/`, and the given pending files. */
export function driveWithPendingFiles(
  bankFolder: string,
  year: string,
  files: PendingFileFixture[],
): { client: AppDriveClient; moved: () => string[] }
```

Los simulacros que ya existen en `import.service.test.ts` e
`import.routes.test.ts` **no se refactorizan** (fuera de alcance).

El test `writes the raw copy of the downloaded file before parsing it` se borra;
R2 lo cubre el test 2 de §3.5.

### 3.7 `.gitignore`

Las tres entradas de `var/` y sus comentarios se sustituyen por:

```gitignore
# Carpeta local que el proyecto dejó de usar en la feature 52. Se mantiene
# ignorada entera: si queda en el disco con archivos de banco, nunca se versiona.
var/
```

## 4. Lo NUEVO: el comando para probar un parser con un archivo real

**Uso:** `pnpm run parse-file <banco> <ruta-del-archivo>`

- `package.json`: `"parse-file": "tsx scripts/parse-bank-file.ts"` (precedente:
  `seed:categories`, que ya ejecuta TypeScript con `tsx` fuera de `src/`).
- `scripts/parse-bank-file.ts`: delgado. Lee los dos argumentos, lee el archivo
  con `readFile`, importa `bankParsers` y `productParsers` de `../src/app.js`,
  llama a `summarizeBankFile`, imprime `formatBankFileSummary` y fija
  `process.exitCode`. No llama a `buildApp()`, no carga `.env`, no abre la base.
  Si faltan argumentos o la ruta no existe: mensaje de uso y código 1.
- `src/modules/import/import.parse-file.ts` (la lógica, con tests):

  ```ts
  export type BankFileSummary =
    | { outcome: 'statement'; movements: number; unparsedRowNumbers: number[];
        hasIban: boolean; hasAccountBalance: boolean; linesWithBalance: number;
        firstBookingDate: string | null; lastBookingDate: string | null }
    | { outcome: 'product'; type: string }
    | { outcome: 'no-parser'; reason: string }   // de selectAdapter / selectProductAdapter
    | { outcome: 'rejected'; code: string }      // el `code` de describeError

  export async function summarizeBankFile(input: {
    bank: string            // se normaliza con normalizeBankName
    fileName: string
    content: Buffer
    parsers: BankParserRegistry
    productParsers: ProductParserRegistry
  }): Promise<BankFileSummary>

  /** Text for the terminal. Exit code: 0 for statement/product, 1 otherwise. */
  export function formatBankFileSummary(summary: BankFileSummary): string
  export function exitCodeOf(summary: BankFileSummary): 0 | 1
  ```

  Elige el parser con `selectAdapter` y, si no hay, `selectProductAdapter`: el
  mismo orden y las mismas funciones que `importPending`. No recibe `prisma` ni
  cliente de Drive: no puede escribir en ninguno de los dos.
- **Qué NO imprime:** importes, IBAN, nombres, conceptos, ni el `reason` de una
  fila no leída, ni el `message` de un rechazo (los dos llevan valores del archivo
  entre comillas). De un rechazo sale solo el `code` (`NOT_UTF8`, `INVALID_IBAN`,
  `VALIDATION_ERROR`…); de las filas no leídas, sus números de fila. Así la salida
  se puede pegar tal cual en un informe (regla de `docs/verification.md` §La prueba
  real). El archivo sigue en su disco para mirar la fila.
- El módulo no nombra ningún banco (lo exige el guardián `keeps the importer free
  of bank knowledge`): los registros llegan como parámetro.

## 5. Errores

- Se **quita** `LocalCopyNotFoundError` / `LOCAL_COPY_NOT_FOUND`.
- No se añade ninguno. Las ocho rutas caen en el 404 del manejador central
  (`NOT_FOUND`), como ya hacen `/api/expenses` y `/api/ingesta/*`.

## 6. Comentarios del código que nombran `var/`

R5 obliga a corregirlos. Están en: los cinco `*.fixture.ts` de banco,
`revolut.statement.parser.ts`, `n26.statement.parser.ts`,
`category-rules.seed.ts`, `revolut.import.test.ts`, `myinvestor.service.test.ts`,
`trade-republic.service.test.ts`. Se reescribe la frase para que diga lo mismo sin
la carpeta (p. ej. «the real files of the human are never copied into a test»).
**Solo comentarios:** ninguna línea de código de un parser cambia.

## 7. Documentos

### 7.1 `docs/api-contract.md`

- Sección nueva `## Rutas retiradas`, justo antes de `## Errores`: aviso de cambio
  que rompe el contrato, fecha 2026-10-02, feature 52, tabla de las ocho rutas con
  «qué se usa ahora» (`POST /api/import` para importar; nada para las otras), y la
  retirada de `LOCAL_COPY_NOT_FOUND`.
- Se borran enteras las subsecciones `### POST /api/ingestion/process`,
  `### POST /api/import/local` y las seis `### POST /api/parser/<banco>`.
- Las secciones `## Parser de <banco> (sin base de datos)` **se quedan**
  (describen lo que el parser lee: el modelo `ParsedMovement`, los motivos de fila
  no leída, la codificación), renombradas a `## Qué lee el parser de <banco>`, sin
  los párrafos del volcado a disco y con cada mención a su ruta cambiada por
  `POST /api/import` cuando la frase siga siendo cierta, o borrada si no.
- Se corrigen las menciones sueltas (líneas 120-134, 153, 271, 633, 1565-1571,
  1665, 2000-2012 de hoy) y se quita la fila `LOCAL_COPY_NOT_FOUND` de errores.

### 7.2 `docs/architecture.md`

- El árbol de carpetas (líneas 78-124 de hoy) se actualiza: no es un ADR.
- **ADR-032 nuevo**, al final de los ADR: «El backend no guarda en disco ningún
  archivo de banco: se quitan `var/`, la copia de la importación y las ocho
  rutas». Contexto (las palabras del humano), decisión (lo de este diseño),
  alternativas descartadas (§9), consecuencias (reimportar un archivo ya movido es
  devolverlo a mano a la carpeta del año en Drive; el comando de §4). Dice además
  que las menciones de pasada a esas rutas en los ADR-013, 018 y 019 son históricas.
- ADR-029: `Estado: superada por ADR-032`.
- Línea «Revisado el 2026-10-02 por la feature 52 `remove-var`: …» encima de:

  | ADR | Qué dice la línea |
  |---|---|
  | 009 | se quitan `POST /api/ingestion/process` y la copia en disco; queda `GET /pending` |
  | 010 | se quitan la ruta `POST /api/parser/bankinter` y el volcado; el parser queda |
  | 014 | ídem para MyInvestor (decisión 8) |
  | 015 | la importación ya no escribe la copia; `ingestion/process` desaparece |
  | 016 | la ruta que devolvía `products[]` desaparece; el parser de producto queda |
  | 017 | `.gitignore` pasa a una línea `var/`; nada del proyecto escribe ahí |
  | 020 | se quita `POST /api/parser/n26` |
  | 024 | Trade Republic deja de tener ruta propia; sigue en el registro de productos |
  | 025 | se quita la reimportación desde la copia; **sigue vigente** que un archivo sin movimientos ni se cuenta ni se mueve |
  | 026 | la decisión 10 (`var/parsed/` como sitio donde mirar sin guardar) desaparece |

### 7.3 El resto

| Documento | Qué cambia |
|---|---|
| `README.md` | Tabla de rutas (líneas 86-93) y el párrafo «Dos caminos» (95-96, 111) |
| `docs/verification.md` | §La prueba real (línea 110): el archivo real se pasa con `pnpm run parse-file <banco> <ruta>` |
| `docs/conventions.md` | Se borra §Tests que tocan `var/` salvo la regla de `failRun`, que se muda a §Tests con base de datos; línea 113; la frase de Trade Republic «su ruta y sus guardianes»; «una línea en el registro de `src/app.ts`» sigue igual |
| `docs/dar-de-alta-un-banco.md` | Líneas 85-86 (el módulo ya no tiene `service` ni `routes` de recorrido), 161, 238, 487-488; se añade el paso de `pnpm run parse-file` |
| `docs/archivos-por-banco.md` | Línea 63 |
| `docs/data-model.md` | Líneas 446 y 903 |
| `docs/myinvestor-product-files.md` | Líneas 11, 265, 299-302, 333 |
| `docs/trade-republic-product-files.md` | Líneas 228-241. **Ojo:** `trade-republic.docs.test.ts` exige frases literales de este documento; no se tocan esas frases |
| `docs/vocabulary.md` | En **guardián** y **red**, se quita la mención a la carpeta `var/`; el significado aprobado no cambia (🔴 en `decisions.md`) |
| `docs/roadmap.md` | Líneas 136-137, 159, 190, 363-364, 383; cabos 14 y 16 tachados con «cerrado por la F52» |
| `progress/current.md` | Nota visible del cambio que rompe el contrato (regla de `docs/related-projects.md`) |

**No se tocan** (son histórico): `feature_list.json` de features cerradas,
`specs/` anteriores, `progress/history.md`, `summaries/`, `reviews/`,
`implementations/`, `explorations/`.

### 7.4 El test de los documentos

`src/retired-routes.docs.test.ts` (nuevo; precedentes:
`import.warnings.docs.test.ts`, `trade-republic.docs.test.ts`):

- `api-contract: names the eight retired routes only inside "Rutas retiradas"` (R8)
- `api-contract: has the "Rutas retiradas" section before "Errores", naming the eight, the date and feature 52` (R9)
- `the documents that describe today name no retired route nor var/drive-read nor var/parsed` (R13)
- `architecture: ADR-032 exists, ADR-029 is superseded by it and ten ADRs carry the review line of feature 52` (R14)

## 8. Trazabilidad prevista

| R | Test |
|---|---|
| R1 | Los tests de `importPending` y de `POST /api/import` que ya existen, sin cambiar lo que afirman, más los reescritos de §3.6 |
| R2 | `keeps the importer off the filesystem` |
| R3 | `answers 404 to the eight routes retired by feature 52`; `has none of the files feature 52 removed` |
| R4 | Los tests de `detectPending` y de `GET /api/ingestion/pending` que ya existen, sin tocar |
| R5 | `mentions the var folder nowhere in the code` |
| R6 | `mentions the var folder nowhere in the code` (incluye `vitest.global-setup.ts`); `has none of the files feature 52 removed` (incluye `test-var.ts`); los dos de `test-guard.e2e.test.ts` |
| R7 | `has the var folder gitignored whole, and versions nothing under it` |
| R8, R9, R13, R14 | Los cuatro de §7.4 |
| R10 | `summarizes a statement with counts and shape, and no value of the file`; `summarizes a product file by its type` |
| R11 | `takes no database nor Drive client, and imports nothing from node:fs` (lectura del fuente de `import.parse-file.ts`) |
| R12 | `says there is no parser for the bank`; `says the extension is not read by that bank`; `reports a rejected file by its code only, never its message`; y en el script, ruta inexistente → código 1 (lo ejecuta el implementer a mano y pega la salida: `scripts/` no tiene tests) |

## 9. Alternativas descartadas

- **Mantener la comprobación de la feature 33 hasta que el humano borre la
  carpeta.** Dejaría `src/lib/test-var.ts` y `vitest.global-setup.ts` nombrando
  `var/`, contra su frase «no queda ninguna referencia», y vigilaría una carpeta
  en la que ya no puede escribir nada del proyecto. El test de R5 impide lo que de
  verdad causó la F33: un valor por defecto que apunta ahí.
- **Dejar las rutas y mover el valor por defecto a `src/app.ts`** (lo que proponía
  el cabo 16). Resuelve el accidente de los tests, pero conserva ocho rutas que
  nadie llama y la carpeta con sus archivos reales: lo contrario del `intent`.
- **Que el comando de §4 sea una ruta HTTP que reciba el archivo.** Volvería a
  poner en el contrato una ruta que el frontend no usa y obligaría a añadir subida
  de archivos (multipart), que el proyecto no tiene.
- **Sin comando: la prueba es la primera importación real.** Un parser que falla
  deja el archivo sin mover y no guarda nada, pero uno que lee mal **sin fallar**
  guarda datos erróneos en la base del humano y mueve el archivo. Es justo lo que
  la prueba real encontró tres veces (`docs/verification.md`).
- **Quitar del todo `var/` de `.gitignore`.** Mientras la carpeta siga en su
  disco, `git status` ofrecería 72 archivos reales para versionar.

## 10. Lo que NO he comprobado

- Que cada archivo de `var/drive-read/` esté también en Drive. Haría falta listar
  Drive con sus credenciales; es un deber suyo antes de borrar la carpeta.
- Que la suite pase con la carpeta borrada de verdad: ningún agente puede
  borrarla. Lo que sí queda probado por test es que nada la nombra ni la lee.
- El número de tests que quedará: baja de 1385 por los borrados; el implementer
  da la cifra en su informe.
