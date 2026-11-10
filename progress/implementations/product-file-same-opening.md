# product-file-same-opening — implementación

> F70, SDD, Lote A (único). Spec aprobado por el humano el 2026-11-09 tal cual: la
> regla vale también para los depósitos (opción a) y el nombre
> `SAME_OPENING_PRODUCT` / `SameOpeningProductError`. No se ha escrito nada en la
> base `gastos` ni en Drive: los tests usan las bases desechables `gastos_test_*` y un
> Drive simulado.

## Lote A — implementación

### Archivos modificados / creados

Código:
- `src/errors/app-error.ts` — clase `SameOpeningProductError` (`SAME_OPENING_PRODUCT`, 422), con comentario como el de `DuplicateProductFileError` (T1).
- `src/modules/investments/investments.service.ts` — `findSameOpeningProducts(prisma, { bank, name, type, openedAt })`: si `(bank, name)` existe devuelve `[]`; si no, los nombres de los productos del mismo banco, `type` y `openedAt`, ordenados por nombre, sin filtrar por `closedAt`. Solo `findUnique` / `findMany` (T2).
- `src/modules/import/import.service.ts` — en `importProductFile`, paso nuevo después de la comprobación de la F53 y antes de `persistProductSnapshot`, con el banco de la carpeta (`deps.bankSlug`); función `sameOpeningMessage` con el texto de `decisions.md` punto 4 (T3). Los escritores (`persistProductSnapshot`, `persistSavingsSnapshot`, `persistValuation`, `persistDeposit`, `upsertProduct`) y los parsers no se han tocado.

Tests:
- `src/modules/import/import.service.test.ts` — bloque nuevo de 7 tests (T4) y el ajuste de T6 (abajo). Import nuevo de `persistSavingsSnapshot` para el test de R6.
- `src/modules/myinvestor/myinvestor.import.test.ts` — bloque nuevo de 3 tests con el registro real de `src/app.ts` (T5).
- `src/modules/import/import.product-files.docs.test.ts` — bloque nuevo de 2 tests de documentos (T10).

Documentos: `docs/api-contract.md`, `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/vocabulary.md`. Además `specs/70-product-file-same-opening/tasks.md` (T1–T11 marcadas) y `progress/current.md`.

### Decisiones tomadas

- **Texto con varios productos:** «ya existen en <banco> los productos 'a', 'b', del mismo tipo (<tipo>) y abiertos el mismo día (<fecha>) … corrige el "name" del archivo para que diga el nombre del que sea.» (design §4: «los productos '<a>', '<b>'» y «el nombre del que sea»; el verbo y el participio en plural son concordancia).
- **Test de R6:** el producto B del mismo día se guarda llamando a `persistSavingsSnapshot` con la salida de `fakeProductAdapter(bank).parse(...)` y el banco puesto a mano, como pide T4 («el escritor no comprueba»).
- **Fechas inventadas distintas por bloque** (`2024-11-18` en `import.service.test.ts`; `2024-05-21`, `2026-02-03`, `2024-07-08` en `myinvestor.import.test.ts`) para que ningún test dependa de las fechas por defecto de los fixtures.
- **Comprobado que los tests nuevos de rechazo fallan sin la regla:** cambié temporalmente `sameOpening.length > 0` por `> 999` en `import.service.ts`, lancé `pnpm exec vitest run src/modules/import/import.service.test.ts src/modules/myinvestor/myinvestor.import.test.ts -t "feature 70"` → `Tests  6 failed | 4 passed | 106 skipped (116)` (fallan los 6 de rechazo; pasan los 4 de «entra igual»). Restaurado desde copia y verificado después con la suite entera.

### T6 — tests existentes ajustados

Primera pasada de `pnpm test` con el código nuevo y sin tests nuevos: `Test Files  1 failed | 98 passed (99)`, `Tests  1 failed | 1555 passed (1556)`. Único fallo:

| Archivo | Test | Motivo | Cambio |
|---|---|---|---|
| `src/modules/import/import.service.test.ts` | `importPending: two product files of one run declaring the same product and date (feature 53) > goes on with the files that come after the rejected one` | El tercer archivo (`cuenta-c.json`) es otro producto con nombre nuevo y la `openedAt` por defecto de `productFile()` (`2025-03-10`), la misma que el primero, ya guardado en esa misma importación: ahora sale `SAME_OPENING_PRODUCT` | Su `openedAt` pasa a `2025-04-22`, con un comentario. Lo que afirma no cambia |

### Trazabilidad

- R1 → `rejects a product file whose new name matches the bank, type and opening day of an existing product, naming it`; `rejects a renamed managed portfolio file that keeps the opening day of the stored one`
- R2 → los dos anteriores (el mensaje nombra el guardado, `"name"`, «para que diga '<guardado>'»)
- R3 → `stores nothing from a file rejected for its opening day and leaves it pending in Drive` (producto con sus `SavingsSnapshot` y `lastImportedAt` idénticos, un solo producto en el banco); `rejects a renamed managed portfolio file…` (sus `Valuation` y la fila del producto idénticas)
- R4 → `stores nothing from a file rejected for its opening day and leaves it pending in Drive` (`movedToProcessed: false`, ninguna llamada a `update` de Drive con su id)
- R5 → `goes on with the files after one rejected for its opening day`
- R6 → `imports a file whose name already exists as always, even with another product opened that same day`
- R7 → `creates a new product with another opening day as it did before`
- R8 → `creates the product when only the type differs`
- R9 → `creates the product when only the bank differs`
- R10 → `rejects a second deposit opened the same day under another name` (depósito); `rejects a product file whose new name…` (`savings_account`); `rejects a renamed managed portfolio file…` (`managed_portfolio`)
- R11 → `rejects against a closed product opened the same day`
- R12 → `api-contract: describes the rejection of a new product name with an existing opening day`
- R13 → `product-file documents: list the rejection for the opening day`

### Documentos actualizados

- `docs/api-contract.md` §`POST /api/import`: párrafo nuevo después del de la F53 en «Archivos de producto», la advertencia «El `name` es la identidad de la cuenta» completada, la nota de totales (un rechazo con `SAME_OPENING_PRODUCT` suma a `failedCount`) y fila `SAME_OPENING_PRODUCT` en la tabla de códigos por archivo.
- `docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md`: fila nueva en «Qué pasa cuando un archivo está mal», la celda del `name` en la tabla de campos («cambiarlo crea otro, salvo…») y la frase donde explican que el `name` es la identidad.
- `docs/data-model.md`: la «Consecuencia que hay que conocer» de `(bank, name)`. Sin columna nueva: el bloque Prisma y el diagrama no cambian (lección 2).
- `docs/architecture.md`: ADR-045 nuevo y la línea «Revisado el 2026-11-09 por la feature 70…» encima del ADR-012. Ningún ADR reescrito; el «Límite conocido» dentro del ADR-012 se queda como está.
- `docs/roadmap.md`: fila E5 con la F70.
- `docs/vocabulary.md`: el término aprobado `SAME_OPENING_PRODUCT` / `SameOpeningProductError`.

Búsquedas lanzadas:

```
git grep -n "DUPLICATE_PRODUCT_FILE" -- ':!progress' ':!specs'
git grep -n -i "renombr[a-z]* .*producto\|crea un producto nuevo\|crea otro producto\|cambiarlo crea" -- ':!progress' ':!specs'
git grep -n -i "DUPLICATE\|archivo de producto\|identidad" -- README.md docs/conventions.md docs/verification.md
```

Lo que queda tras corregir y por qué sigue siendo verdad: las menciones de `DUPLICATE_PRODUCT_FILE` describen la F53, que no cambia; `docs/architecture.md:939` («renombrar un producto en el fichero crea un producto nuevo») está dentro del ADR-012, que no se reescribe y ya lleva la línea de revisión; `docs/architecture.md:904` y `:1292`, `docs/data-model.md:1103` hablan de que un banco renombre o de Drive renombrando archivos, no de esta regla; `feature_list.json` es histórico de otras features. El README no lista códigos de error por archivo. Ninguna línea fuera del lote.

### Prueba real (la feature lee archivos de Drive)

No se ha importado un archivo real: haría falta escribir en la base `gastos`, que está prohibido. Hecha solo una consulta de lectura sobre la base real, dentro de una transacción `READ ONLY` (recuentos, ningún nombre ni importe):

```
docker exec gastos-postgres psql -U postgres -d gastos -At -c "BEGIN READ ONLY; SELECT count(*), count(\"openedAt\") FROM \"InvestmentProduct\"; SELECT count(*) FROM (SELECT bank, type, \"openedAt\" FROM \"InvestmentProduct\" GROUP BY 1,2,3 HAVING count(*) > 1) g; ROLLBACK;"
BEGIN
11|11
0
ROLLBACK
```

11 productos, los 11 con `openedAt`, y 0 grupos de banco + tipo + `openedAt` con más de un producto: los archivos que ya se importan cada mes con su `name` actual no pueden salir rechazados (R6), y no hay hoy dos productos que se rechacen entre sí. La prueba con el archivo real renombrado es del humano: subirlo a Drive y lanzar `POST /api/import`.

### Tests: antes y después

- Antes de añadir tests (código nuevo ya puesto): 99 archivos, 1556 tests.
- Después: 99 archivos, 1568 tests (+7 en `import.service.test.ts`, +3 en `myinvestor.import.test.ts`, +2 en `import.product-files.docs.test.ts`). Ningún archivo de test nuevo.

### `pnpm run typecheck` / `lint` / `format:check`

```
pnpm run typecheck  → exit 0 (tsc --noEmit sin salida)
pnpm run lint       → exit 0 ($ oxlint, sin avisos)
pnpm run format:check → All matched files use Prettier code style!
```

### Último ./init.sh

`./init.sh` → exit 0:

```
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  99 passed (99)
      Tests  1568 passed (1568)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks

`./init.sh --checks` → exit 0, `Checks: 13 de 13 en verde.` Cada uno de los 12 checks de un test dio `Tests  1 passed | N skipped`, y el de `pnpm test` exit 0.

### Sugerencias fuera de scope (NO aplicadas)

- `docs/roadmap.md` línea 30 («Las 69 features de `feature_list.json` están `done`…», §Dónde estás ahora mismo) deja de ser verdad desde que existe la F70; lo normal es que lo actualice el leader al cerrarla.
- Frontend: añadir `SAME_OPENING_PRODUCT` (y `DUPLICATE_PRODUCT_FILE`) a `gastos-frontend/src/features/import/fileMessages.ts`, como ya dice `decisions.md` §Consecuencias. Es de una sesión del frontend.
