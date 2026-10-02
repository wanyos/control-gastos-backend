# Resumen — feature 52 `remove-var`

Fecha de cierre: 2026-10-02
Intención original: `feature_list.json` → feature `remove-var`, bloque `intent`
Spec (si SDD): `specs/52-remove-var/`

## Qué hace ahora la app que antes no

El backend ya no usa la carpeta `var/` de tu ordenador. Importar funciona igual
(descarga de Drive, lee, guarda en la base, mueve a `procesados/`), pero el archivo
va de la descarga al parser en memoria y no queda ninguna copia en el disco. Las
ocho rutas que solo trabajaban con esa copia responden 404. Para ver qué entiende
un parser de un archivo tuyo sin importarlo hay un comando de terminal nuevo,
`pnpm run parse-file <banco> <ruta-del-archivo>`, que enseña solo recuentos y fechas.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/import` — importa lo pendiente, ya sin copia en disco | [import.routes.ts:47](../../src/modules/import/import.routes.ts#L47) |
| `GET /api/ingestion/pending` — la única ruta que queda en ese módulo | [ingestion.routes.ts:19](../../src/modules/ingestion/ingestion.routes.ts#L19) |
| `pnpm run parse-file <banco> <ruta>` — el comando | [parse-bank-file.ts:25](../../scripts/parse-bank-file.ts#L25) |
| La lógica del comando | [import.parse-file.ts:58](../../src/modules/import/import.parse-file.ts#L58) |
| El test que impide que el código vuelva a nombrar `var/` | [architecture.test.ts:598](../../src/architecture.test.ts#L598) |
| El aviso de las rutas retiradas en el contrato | [api-contract.md:31](../../docs/api-contract.md#L31) |

## Dónde está el código

### La importación sin copia en disco

| Qué hace | Dónde |
| --- | --- |
| Importa cada archivo pendiente, de la descarga al parser en memoria | [import.service.ts](../../src/modules/import/import.service.ts) → `importPending`, `importDriveFile` |
| Código de error de un fallo, ahora exportado para el comando | [import.service.ts](../../src/modules/import/import.service.ts) → `describeError` |
| Una sola ruta de importación; sin `POST /local` ni `rawCopyBaseDir` | [import.routes.ts](../../src/modules/import/import.routes.ts) → `importRoutes`, `ImportRoutesOptions` |
| Sin los tipos `Local*` | [import.types.ts](../../src/modules/import/import.types.ts) → `FileCounts`, `StatementResult` |
| Sin `LocalCopyNotFoundError` (`LOCAL_COPY_NOT_FOUND`) | [app-error.ts](../../src/errors/app-error.ts) |
| Solo detecta pendientes; sin `processPending` ni sus tipos | [ingestion.service.ts](../../src/modules/ingestion/ingestion.service.ts) → `detectPending`; [ingestion.routes.ts](../../src/modules/ingestion/ingestion.routes.ts); [ingestion.types.ts](../../src/modules/ingestion/ingestion.types.ts) |
| Sin los seis registros bajo `/api/parser` | [app.ts](../../src/app.ts) → `buildApp` |

Borrados: `import.local.service.ts`, `import.schema.ts`, los seis
`<banco>.routes.ts`, y el `<banco>.service.ts` de bankinter, n26, openbank y revolut.

### Lo que queda de cada módulo de banco

| Qué hace | Dónde |
| --- | --- |
| Solo la función que usa el registro de productos | [myinvestor.service.ts](../../src/modules/myinvestor/myinvestor.service.ts) → `parseMyinvestorProductFile` |
| Ídem | [trade-republic.service.ts](../../src/modules/trade-republic/trade-republic.service.ts) → `parseTradeRepublicProductFile` |
| Sin los tipos de resumen del recorrido de la copia | `<banco>.types.ts` de [bankinter](../../src/modules/bankinter/bankinter.types.ts), [myinvestor](../../src/modules/myinvestor/myinvestor.types.ts), [n26](../../src/modules/n26/n26.types.ts), [openbank](../../src/modules/openbank/openbank.types.ts), [revolut](../../src/modules/revolut/revolut.types.ts), [trade-republic](../../src/modules/trade-republic/trade-republic.types.ts) |
| Sin `writeLocalCopy`; comentarios corregidos | `<banco>.fixture.ts` de [myinvestor](../../src/modules/myinvestor/myinvestor.fixture.ts), [n26](../../src/modules/n26/n26.fixture.ts), [openbank](../../src/modules/openbank/openbank.fixture.ts), [revolut](../../src/modules/revolut/revolut.fixture.ts), [trade-republic](../../src/modules/trade-republic/trade-republic.fixture.ts) |
| Una línea de comentario cada uno, ningún cambio de código | [n26.statement.parser.ts](../../src/modules/n26/n26.statement.parser.ts), [revolut.statement.parser.ts](../../src/modules/revolut/revolut.statement.parser.ts), [category-rules.seed.ts](../../src/modules/category-rules/category-rules.seed.ts), [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts), [transfers.types.ts](../../src/modules/transfers/transfers.types.ts), [cp1252.ts](../../src/lib/cp1252.ts) |

### El comando `parse-file`

| Qué hace | Dónde |
| --- | --- |
| Lee los argumentos y el archivo, imprime y fija el código de salida | [parse-bank-file.ts](../../scripts/parse-bank-file.ts) → `main` |
| Pasa el archivo por el parser de su banco y resume | [import.parse-file.ts](../../src/modules/import/import.parse-file.ts) → `summarizeBankFile`, `BankFileSummary` |
| El texto que se imprime y el código de salida | [import.parse-file.ts](../../src/modules/import/import.parse-file.ts) → `formatBankFileSummary`, `exitCodeOf` |
| La entrada del comando | [package.json](../../package.json) → `"parse-file"` |

### La suite y `.gitignore`

| Qué hace | Dónde |
| --- | --- |
| Ya no fotografía `var/` antes y después (se quita lo de la feature 33; borrado `src/lib/test-var.ts`) | [vitest.global-setup.ts](../../vitest.global-setup.ts) → `setup` |
| `failRun` se queda para la comprobación de la base; cabecera corregida | [test-guard.ts](../../src/lib/test-guard.ts) → `failRun` |
| Una sola línea, `var/` | [.gitignore](../../.gitignore) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Las ocho rutas responden 404 en la aplicación real | [architecture.test.ts](../../src/architecture.test.ts) → `answers 404 to the eight routes retired by feature 52` |
| El importador y la detección no usan el disco | [architecture.test.ts](../../src/architecture.test.ts) → `keeps the importer off the filesystem` |
| Ningún archivo de código nombra `var/` (tres excepciones declaradas) | [architecture.test.ts](../../src/architecture.test.ts) → `mentions the var folder nowhere in the code` |
| Los 26 archivos borrados no vuelven | [architecture.test.ts](../../src/architecture.test.ts) → `has none of the files feature 52 removed` |
| `.gitignore` ignora `var/` entera y nada bajo ella está versionado | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `has the var folder gitignored whole, and versions nothing under it` |
| Contrato, documentos y ADR | [retired-routes.docs.test.ts](../../src/retired-routes.docs.test.ts) → los cuatro tests |
| El comando: recuentos sin valores, cuatro casos de error | [import.parse-file.test.ts](../../src/modules/import/import.parse-file.test.ts) → los seis tests |
| Drive simulado en memoria para los tests reescritos | [drive.fixture.ts](../../src/lib/drive.fixture.ts) → `driveWithPendingFiles` |
| Revolut de punta a punta, ahora por `importPending` | [revolut.import.test.ts](../../src/modules/revolut/revolut.import.test.ts) |
| Productos de MyInvestor, ahora por `importPending` | [myinvestor.import.test.ts](../../src/modules/myinvestor/myinvestor.import.test.ts) |
| Categorización dentro de una importación, y cuatro más traídos del camino retirado | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `categorizes the movements this run just imported…`, `reports a categorization failure…`, `hands the parser the bytes of the download…`, `imports the pending files of every year folder…`, `adds one row for the next month…`, `stores the warnings with the file they came out of…` |
| Los dos casos de traspasos y la segunda importación tras emparejar | [import.routes.test.ts](../../src/modules/import/import.routes.test.ts) → `links nobody when two mirrors compete…`, `reports a detection failure inside the 200…`, `changes nothing when the same file is imported again after pairing…` |
| Tests de registro que vivían en los `*.routes.test.ts`, mudados sin cambios | `<banco>.registry.test.ts` de [n26](../../src/modules/n26/n26.registry.test.ts), [openbank](../../src/modules/openbank/openbank.registry.test.ts), [revolut](../../src/modules/revolut/revolut.registry.test.ts), [trade-republic](../../src/modules/trade-republic/trade-republic.registry.test.ts) |
| `GET /pending`, sin cambiar lo que afirman | [ingestion.service.test.ts](../../src/modules/ingestion/ingestion.service.test.ts), [ingestion.routes.test.ts](../../src/modules/ingestion/ingestion.routes.test.ts) |
| `failRun` tumba una pasada, con un archivo inventado propio | [test-guard.e2e.test.ts](../../src/lib/test-guard.e2e.test.ts), [test-guard.test.ts](../../src/lib/test-guard.test.ts) |
| Solo lo que queda de cada servicio | [myinvestor.service.test.ts](../../src/modules/myinvestor/myinvestor.service.test.ts), [trade-republic.service.test.ts](../../src/modules/trade-republic/trade-republic.service.test.ts) |

La suite pasa de 76 archivos y 1385 tests a 69 y 1271.

### Documentos

| Qué cambia | Dónde |
| --- | --- |
| Sección «Rutas retiradas» antes de «Errores»; fuera las ocho subsecciones; «Qué lee el parser de `<banco>`» | [api-contract.md](../../docs/api-contract.md) |
| ADR-032 nuevo, ADR-029 superada, línea de revisión en diez ADR, árbol de carpetas | [architecture.md](../../docs/architecture.md) |
| Tabla de rutas, fila de `parse-file` | [README.md](../../README.md) |
| La prueba con un archivo real se hace con `parse-file` | [verification.md](../../docs/verification.md) |
| Fuera §Tests que tocan `var/`; la regla de `failRun` se muda | [conventions.md](../../docs/conventions.md) |
| El módulo de un banco sin ruta; paso nuevo con `parse-file` | [dar-de-alta-un-banco.md](../../docs/dar-de-alta-un-banco.md) |
| Menciones a la carpeta y a las rutas | [archivos-por-banco.md](../../docs/archivos-por-banco.md), [data-model.md](../../docs/data-model.md), [myinvestor-product-files.md](../../docs/myinvestor-product-files.md), [trade-republic-product-files.md](../../docs/trade-republic-product-files.md) |
| «guardián» y «red» dejan de nombrar `var/` | [vocabulary.md](../../docs/vocabulary.md) |
| Cabos 14 y 16 cerrados; tus deberes apuntados | [roadmap.md](../../docs/roadmap.md) |

## Cumplimiento de la intención

- ✅ "POST /api/import importa igual que hoy y no escribe nada en var/." → se
  cumple; sus tests de antes no cambian ninguna afirmación, y
  `keeps the importer off the filesystem`.
  Check: ✅ `vitest run import.service.test.ts import.routes.test.ts` (78 tests) y
  ✅ `-t "keeps the importer off the filesystem"`.
- ✅ "Las ocho rutas responden 404." → se cumple; `answers 404 to the eight routes
  retired by feature 52`. Check: ✅.
- ✅ "En el código de la aplicación no queda ninguna referencia a var/." → se
  cumple; `mentions the var folder nowhere in the code`. La nombran solo tres
  tests, declarados con su motivo, que son los que la vigilan. Check: ✅.
- ✅ "docs/api-contract.md ya no describe las ocho rutas, y dice de forma visible
  que se han quitado." → se cumple; los dos tests `api-contract: …` de
  `retired-routes.docs.test.ts`. Check: ✅ (4 tests).
- ✅ "GET /api/ingestion/pending sigue funcionando igual." → se cumple; sus tests
  de antes, sin cambiar. Check: ✅ (7 tests).
- ⚠️ "La suite entera pasa con la carpeta var/ borrada." → **no comprobado
  literalmente**: ningún agente puede borrarla. Lo que sí está comprobado: la suite
  entera pasa (1271 tests), nada del código nombra la carpeta y la suite ya no la
  lee ni la compara. Checks: ✅ `-t "has none of the files feature 52 removed"` y
  ✅ `pnpm test`. La prueba literal es tuya (ver abajo).

## Decisiones que se tomaron por ti

- (delegado) El comando `pnpm run parse-file` para probar un parser con tu archivo
  real, en lugar de las rutas `POST /api/parser/<banco>`.
- (delegado) La comprobación de la feature 33 se quita entera; la sustituye el test
  que impide nombrar `var/`.
- (delegado) En el contrato, las secciones de cada parser se quedan sin su ruta.
- (delegado) ADR-032 nuevo, ADR-029 superada, diez ADR con línea de revisión.
- (añadido) `.gitignore` conserva una línea, `var/`, mientras la carpeta siga en tu
  disco.
- (decidido por el leader en la revisión, **no lo has visto todavía**) El test que
  no deja nombrar `var/` tiene tres excepciones y no dos: la tercera es
  `src/retired-routes.docs.test.ts`, que tiene que buscar ese nombre en los
  documentos.

## Qué NO se tocó / quedó fuera

- Ningún parser cambia una línea de código, ni el guardado en la base, ni el esquema.
- Lo que devuelven `POST /api/import` y `GET /api/ingestion/pending`.
- No hay flujo nuevo para reimportar desde `procesados/`: se devuelve el archivo a
  mano a la carpeta del año.
- Tu carpeta `var/` sigue en el disco con sus 72 archivos; nadie la ha abierto.
- `scripts/myinvestor-xlsx-a-csv.mjs` y el frontend.

## Notas para el futuro (opcional)

- **Deberes tuyos**, apuntados en `docs/roadmap.md` §Deberes tuyos pendientes:
  mirar que no haya en `var/` nada que no esté en Drive, borrar la carpeta, pasar
  `./init.sh` después, y probar `pnpm run parse-file` con un archivo real (solo
  está probado con archivos inventados).
- Dos comportamientos desaparecieron con el recorrido de la copia y no existen en
  `POST /api/import`: «si dos archivos declaran el mismo producto y fecha, se queda
  el primero por orden alfabético» (ahora la foto se sobrescribe sin avisar; es el
  cabo 21 del roadmap) y el volcado a disco de lo parseado.
- `ingestion.service.test.ts` conserva en su Drive simulado opciones que solo
  usaban los tests borrados.
- `docs/roadmap.md`, fila «MyInvestor · productos», sigue diciendo que sus `.json`
  no llegan a la base, y el cabo 11 dice que sí desde la F29. No lo causó esta
  feature.
