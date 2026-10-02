# Tasks — F53 `product-file-collision`

> Un solo lote: el cambio de código es un archivo y los documentos describen ese
> mismo cambio. Los nombres de test entre comillas son **exactos**: los `checks`
> de `feature_list.json` filtran por ellos.
>
> ❌ No se toca `src/modules/investments/investments.service.ts` ni ningún parser.
> ❌ No se crea ninguna ruta. La fila 24 de `docs/roadmap.md` no se toca.

## Lote A — rechazo, tests y documentos
Archivos: `src/errors/app-error.ts`, `src/modules/import/import.service.ts`, `src/modules/import/import.types.ts`, `src/modules/import/import.service.test.ts`, `src/modules/import/import.product-files.docs.test.ts`, `src/modules/myinvestor/myinvestor.import.test.ts`, `src/architecture.test.ts`, `docs/api-contract.md`, `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md`
Depende de: —

- [x] T1 — `src/errors/app-error.ts`: `DuplicateProductFileError` (`DUPLICATE_PRODUCT_FILE`, 422), según `design.md` §2.4. Cubre: R1.
- [x] T2 — `src/modules/import/import.service.ts` (y `import.types.ts` si los tipos van ahí): `ProductFilesStoredInRun`, `StoredProductFileRef`, `productFileKey`; el `Map` creado en `importPending` y pasado a cada `importProductFile` con el año de la carpeta; los pasos 2, 3 y 5 de `design.md` §2.2, con el texto del mensaje de §2.4. `importDriveFile`, `totals` e `importStatement` no cambian. Cubre: R1, R2, R3, R4, R5, R6, R9, R10, R11.
- [x] T3 — `src/modules/import/import.service.test.ts`, bloque nuevo `importPending: two product files of one run declaring the same product and date (feature 53)`, con `fakeProductAdapter` y datos inventados. Tests, con estos nombres:
  - `rejects the second product file of a run that declares the same bank, name and date, naming the first` — el primero `imported`, el segundo `failed` con `error.code` `DUPLICATE_PRODUCT_FILE` y un `error.message` que contiene el nombre del primer archivo y su carpeta de año. Cubre: R1, R2.
  - `leaves the rejected product file pending in Drive and moves only the first` — `movedToProcessed` `true`/`false` y una sola llamada a `update`, con el id del primero. Cubre: R4.
  - `keeps the value the first file stored exactly as it stored it` — los dos archivos llevan importes distintos; tras la importación hay una sola fila y sus cinco importes son los del primero. Cubre: R3.
  - `imports two files of the same product with different dates in one run` — los dos `imported`, dos filas. Cubre: R7.
  - `still replaces the value when a corrected file of the same product and date arrives in a later run` — dos llamadas a `importPending`; la segunda sale `imported` con `snapshot.created: false` y la fila lleva los importes del segundo archivo. Cubre: R8.
  - `counts only the stored file in importedProductCount and the rejected one in failedCount` — `importedProductCount: 1`, `failedCount: 1`, y el informe del rechazado con `product: null` y `snapshot: null`. Cubre: R5.
  - `goes on with the files that come after the rejected one` — un tercer archivo de otro producto, listado después del rechazado, sale `imported` y se mueve. Cubre: R6.
  - `does not hold a file that failed against the next one with the same product and date` — el primero no cuadra (falla en el parser); el segundo, mismo producto y fecha, sale `imported`. Cubre: R10.
  - `holds a stored file against the next one even when its move to procesados failed` — el `update` de Drive falla para el primero (queda `failed` con su valor ya guardado); el segundo sale `DUPLICATE_PRODUCT_FILE` y la fila conserva los importes del primero. Cubre: R1, R3.
  - `rejects the second file across two year folders of the same bank, and not across two banks` — mismo `name` y `date` en dos carpetas de año de un banco (rechazo, y el mensaje nombra la otra carpeta) y en dos bancos (los dos `imported`, dos productos). Cubre: R2, R11.
- [x] T4 — `src/modules/myinvestor/myinvestor.import.test.ts`, con el registro real de `src/app.ts`:
  - `rejects the second file of the same fund and date in one run` — una sola fila de `Valuation`, con el `marketValue` del primero. Cubre: R9, R3.
  - `rejects the second file of the same deposit and date in one run` — el producto conserva el `principal` del primero. Cubre: R9, R3.
  (El tipo `savings_account` lo cubren los tests de T3.)
- [x] T5 — Comprobar que **ningún test existente** de `import.service.test.ts`, `import.routes.test.ts`, `myinvestor.import.test.ts` ni de los módulos de banco cambia lo que afirma: si alguno hay que tocarlo, se para y se dice cuál y por qué en el informe. Cubre: R7, R8, R12.
- [x] T6 — `docs/api-contract.md` según `design.md` §4 (párrafo en «Archivos de producto», precisión en «Idempotencia», fila `DUPLICATE_PRODUCT_FILE`, nota de `importedProductCount`). Cubre: R13.
- [x] T7 — `docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md` según `design.md` §4, sin romper `trade-republic.docs.test.ts`. Cubre: R14.
- [x] T8 — `docs/data-model.md` (nota bajo la tabla de resoluciones de conflicto) y `docs/architecture.md` (ADR-033 y la línea «Revisado el 2026-10-02 por la feature 53…» encima del ADR-026, sin reescribir ningún ADR), según `design.md` §4.
- [x] T9 — `docs/roadmap.md`: fila 21 tachada y cerrada por la F53; fila E5 con la F53; la fila 24 queda como está. Cubre: R15.
- [x] T10 — `src/modules/import/import.product-files.docs.test.ts` (nuevo), leyendo los documentos:
  - `api-contract: describes the rejection of the second product file of one import` — dentro de la sección `### POST /api/import`: aparece `DUPLICATE_PRODUCT_FILE` en la tabla de códigos por archivo y el texto dice que no se guarda y que no se mueve a `procesados/`. Cubre: R13.
  - `product-file documents: say the second file is rejected, not that nobody warns` — los dos documentos nombran `DUPLICATE_PRODUCT_FILE` y ninguno contiene «nadie te avisa». Cubre: R14.
  - `roadmap: closes loose end 21 with feature 53 and leaves 24 open` — la fila 21 está tachada y nombra la F53; la fila 24 no está tachada. Cubre: R15.
  Si `src/architecture.test.ts` exige nombrar el archivo nuevo en su lista de árbol, se añade ahí; si no, ese archivo no se toca.
- [x] T11 — `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `./init.sh` y `./init.sh --checks 53` en verde, con la salida pegada en el informe y el recuento de archivos de test y de tests (partida: 69 y 1271).
