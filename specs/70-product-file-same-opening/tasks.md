# Tasks — F70 `product-file-same-opening`

> Un solo lote: el cambio de código son tres archivos pequeños y los documentos
> describen ese mismo cambio. Los nombres de test entre comillas son **exactos**:
> los `checks` de `feature_list.json` filtran por ellos.
>
> 🔒 Ningún nombre real de producto ni importe real en tests ni documentos
> (`src/no-real-data.test.ts`): nombres generados (`trackedName()`,
> `uniqueBank()`) y fechas inventadas.
>
> ❌ No se tocan `persistProductSnapshot`, `persistValuation`, `persistDeposit`,
> `persistSavingsSnapshot` ni `upsertProduct`, ni ningún parser. Ninguna ruta nueva,
> ninguna migración.

## Lote A — rechazo, tests y documentos
Archivos: `src/errors/app-error.ts`, `src/modules/investments/investments.service.ts`, `src/modules/import/import.service.ts`, `src/modules/import/import.service.test.ts`, `src/modules/myinvestor/myinvestor.import.test.ts`, `src/modules/import/import.product-files.docs.test.ts`, cualquier `*.test.ts` existente que haya que ajustar según T6, `docs/api-contract.md`, `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md`
Depende de: —

- [x] T1 — `src/errors/app-error.ts`: `SameOpeningProductError` (`SAME_OPENING_PRODUCT`, 422), según `design.md` §3. Cubre: R1.
- [x] T2 — `src/modules/investments/investments.service.ts`: `findSameOpeningProducts`, según `design.md` §3. Cubre: R1, R6, R8, R9, R10, R11.
- [x] T3 — `src/modules/import/import.service.ts`: el paso nuevo de `importProductFile` y el texto del mensaje, según `design.md` §4. Cubre: R1, R2, R3, R4, R5.
- [x] T4 — `src/modules/import/import.service.test.ts`, bloque nuevo `importPending: a product file with a new name and the opening day of an existing product (feature 70)`, con `fakeProductAdapter` (tipo `savings_account`), un banco inventado por test y datos inventados. Tests, con estos nombres:
  - `rejects a product file whose new name matches the bank, type and opening day of an existing product, naming it` — primera importación crea el producto A; la segunda trae otro `name` con el mismo `openedAt`: `failed`, `error.code` `SAME_OPENING_PRODUCT`, `error.message` contiene el nombre de A y `"name"`. Cubre: R1, R2, R10.
  - `stores nothing from a file rejected for its opening day and leaves it pending in Drive` — tras el rechazo: un solo producto en ese banco, A con las mismas filas de `SavingsSnapshot` y el mismo `lastImportedAt`; `movedToProcessed: false` y ninguna llamada a `update` de Drive con su id. Cubre: R3, R4.
  - `goes on with the files after one rejected for its opening day` — un archivo de otro producto con otro `openedAt`, listado después del rechazado, sale `imported` y se mueve. Cubre: R5.
  - `imports a file whose name already exists as always, even with another product opened that same day` — existe A; se crea en la base B con el mismo banco, tipo y `openedAt` llamando a `persistSavingsSnapshot` directamente (el escritor no comprueba); un archivo de A de otro mes sale `imported` con `snapshot.created: true`. Cubre: R6.
  - `creates a new product with another opening day as it did before` — existe A; un archivo de otro `name` y otro `openedAt` sale `imported` con `product.created: true`. Cubre: R7.
  - `creates the product when only the bank differs` — A en un banco inventado; mismo `name` nuevo, tipo y `openedAt` en otro banco inventado: `imported`. Cubre: R9.
  - `rejects against a closed product opened the same day` — A guardado con `closedAt`; un archivo con otro `name` y el mismo `openedAt`: `SAME_OPENING_PRODUCT`. Cubre: R11.
- [x] T5 — `src/modules/myinvestor/myinvestor.import.test.ts`, bloque nuevo `a product file with a new name and the opening day of an existing product (feature 70)`, con el registro real de `src/app.ts` y `trackedName()`:
  - `rejects a renamed managed portfolio file that keeps the opening day of the stored one` — el caso del intent con nombres inventados: cartera gestionada guardada con un nombre; otro archivo con otro nombre, mismo `openedAt` y otra `date`: `failed`, `SAME_OPENING_PRODUCT`, el mensaje nombra la guardada, un solo producto y sus `Valuation` sin cambios. Cubre: R1, R2, R3.
  - `rejects a second deposit opened the same day under another name` — dos depósitos, nombres distintos, mismo `openedAt`, en dos importaciones: el segundo `SAME_OPENING_PRODUCT`. Cubre: R10. (Si el humano elige la opción (b), este test pasa a afirmar que entran los dos: ver `design.md` §5.)
  - `creates the product when only the type differs` — un fondo guardado; un ETF con otro `name` y el mismo `openedAt`: `imported`. Cubre: R8.
- [x] T6 — Lanzar la suite entera. Si un test **existente** falla solo porque crea por la importación dos productos inventados de mismo banco, tipo y `openedAt` con nombres distintos, se le cambia el `openedAt` del segundo, **sin tocar lo que afirma**, y se lista en el informe (archivo, test, motivo). Si falla por otra cosa, se para y se reporta. Cubre: R6, R7.
- [x] T7 — `docs/api-contract.md` según `design.md` §7. Cubre: R12.
- [x] T8 — `docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md` según `design.md` §7, sin romper `trade-republic.docs.test.ts`. Cubre: R13.
- [x] T9 — `docs/data-model.md`, `docs/architecture.md` (ADR-045 y la línea de revisión encima del ADR-012) y `docs/roadmap.md` (fila E5 con la F70), según `design.md` §7.
- [x] T10 — `src/modules/import/import.product-files.docs.test.ts`, bloque nuevo:
  - `api-contract: describes the rejection of a new product name with an existing opening day` — dentro de `### POST /api/import` aparece `SAME_OPENING_PRODUCT` en la tabla de códigos por archivo y el texto dice que no se guarda nada y que no se mueve a `procesados/`. Cubre: R12.
  - `product-file documents: list the rejection for the opening day` — los dos documentos nombran `SAME_OPENING_PRODUCT`. Cubre: R13.
- [x] T11 — `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `./init.sh` y `./init.sh --checks 70` en verde, con la salida pegada en el informe y el recuento de archivos de test y de tests antes y después.
