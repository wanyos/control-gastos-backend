# Resumen — feature 70 `product-file-same-opening`

Fecha de cierre: 2026-11-10
Intención original: `feature_list.json` → feature `product-file-same-opening`, bloque `intent`
Spec: `specs/70-product-file-same-opening/`

## Qué hace ahora la app que antes no

Antes, un archivo de producto con un `name` mal copiado (por ejemplo, el nombre anterior de una cartera) creaba otro producto sin avisar, y había que arreglarlo a mano en la base. Ahora la importación lo rechaza en dos casos. El primero: el `name` del archivo no existe en ese banco y ya hay un producto guardado del mismo banco, el mismo tipo y la misma fecha de apertura (`openedAt`), vivo o cerrado. Entonces el archivo sale fallido con el código `SAME_OPENING_PRODUCT`. El mensaje nombra el producto guardado y te pide que corrijas el `"name"`. No se guarda nada y el archivo no se mueve a `procesados/`. El segundo caso cubre los depósitos.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/import`: cada archivo de producto pasa por `importProductFile` | [import.service.ts:652](../../src/modules/import/import.service.ts#L652) |
| El paso nuevo: pregunta y rechaza antes de escribir | [import.service.ts:675](../../src/modules/import/import.service.ts#L675) |
| La consulta a la base (solo lectura) | [investments.service.ts:355](../../src/modules/investments/investments.service.ts#L355) |
| El error `SAME_OPENING_PRODUCT` (422, dentro de `files[].error`) | [app-error.ts:165](../../src/errors/app-error.ts#L165) |

## Dónde está el código

### Rechazo

| Qué hace | Dónde |
| --- | --- |
| Devuelve los nombres de los productos del mismo banco, tipo y `openedAt` cuando el `name` es nuevo; devuelve una lista vacía si el `name` ya existe | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `findSameOpeningProducts` |
| Llama a la consulta después de la comprobación de la F53 y antes de `persistProductSnapshot`, con el banco de la carpeta | [import.service.ts](../../src/modules/import/import.service.ts) → `importProductFile` |
| Escribe el mensaje (uno o varios productos) | [import.service.ts](../../src/modules/import/import.service.ts) → `sameOpeningMessage` |
| La clase del error | [app-error.ts](../../src/errors/app-error.ts) → `SameOpeningProductError` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Rechazo, mensaje, nada guardado, no se mueve, los archivos siguientes siguen, el `name` existente entra, otra apertura, otro banco, producto cerrado (7 tests) | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `describe('importPending: a product file with a new name and the opening day of an existing product (feature 70)')` |
| El mismo caso con el parser real de MyInvestor (cartera gestionada renombrada), depósitos y otro tipo (3 tests) | [myinvestor.import.test.ts](../../src/modules/myinvestor/myinvestor.import.test.ts) → `describe('a product file with a new name and the opening day of an existing product (feature 70)')` |
| El contrato y los dos documentos de archivos de producto describen el código (2 tests) | [import.product-files.docs.test.ts](../../src/modules/import/import.product-files.docs.test.ts) → `describe('the documents describe the rejection of feature 70')` |
| Test de la F53 ajustado: su tercer archivo pasa a tener otra `openedAt` y lo que comprueba no cambia | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `goes on with the files that come after the rejected one` |

### Documentos

| Qué dice | Dónde |
| --- | --- |
| Un párrafo sobre el rechazo, el aviso del `name`, los totales y la fila `SAME_OPENING_PRODUCT` en la tabla de códigos | [api-contract.md](../../docs/api-contract.md) → `### POST /api/import` |
| La fila en «Qué pasa cuando un archivo está mal», la celda del `name` y la frase sobre la identidad | [myinvestor-product-files.md](../../docs/myinvestor-product-files.md), [trade-republic-product-files.md](../../docs/trade-republic-product-files.md) |
| Qué pasa ahora al cambiar el `name` de un producto: el archivo se rechaza en lugar de crear otro | [data-model.md](../../docs/data-model.md) → clave natural `(bank, name)` |
| La decisión, y una línea de revisión encima del ADR-012 | [architecture.md](../../docs/architecture.md) → `ADR-045` |
| El término aprobado | [vocabulary.md](../../docs/vocabulary.md) → `SAME_OPENING_PRODUCT` |
| La fila E5 con la F70 | [roadmap.md](../../docs/roadmap.md) |

## Cumplimiento de la intención

- ✅ «Un archivo con el nombre anterior de una cartera y su misma fecha de apertura se rechaza, el mensaje nombra la cartera con su nombre actual y no se guarda nada» → se cumple. Lo verifican `rejects a product file whose new name matches…`, `stores nothing from a file rejected for its opening day…` y `rejects a renamed managed portfolio file that keeps the opening day of the stored one`. Checks: ✅ ✅ ✅
- ✅ «Un archivo con el nombre actual de la cartera se importa como siempre» → se cumple. Lo verifica `imports a file whose name already exists as always, even with another product opened that same day`. Check: ✅
- ✅ «Un producto nuevo de verdad, con otra fecha de apertura, se crea como hoy» → se cumple. Lo verifica `creates a new product with another opening day as it did before`. Check: ✅
- Añadidos: los archivos siguientes siguen ✅, otro banco ✅, otro tipo ✅, depósitos ✅, producto cerrado ✅, contrato ✅, documentos de archivos de producto ✅, suite entera (`pnpm test`) ✅.

Resultado real de `./init.sh --checks` (2026-11-10): **13 de 13 en verde**. Cada check filtrado por nombre ejecutó 1 test.

## Decisiones que se tomaron por ti

Todas aprobadas en `decisions.md` el 2026-11-09:

- (delegado) La regla vale también para los depósitos (tu opción a).
- (delegado) El código `SAME_OPENING_PRODUCT` y la clase `SameOpeningProductError`, y el texto del mensaje. Si coinciden varios productos, los nombra todos.
- (añadido) También se rechaza si el producto que coincide está cerrado.
- (añadido) El contrato y los dos documentos de archivos de producto describen el código nuevo.

## Qué NO se tocó / quedó fuera

- Ni los escritores (`persistProductSnapshot` y los de debajo, `upsertProduct`) ni los parsers. No hay migración ni ruta nueva.
- Un renombrado que además cambie la `openedAt` sigue creando un producto nuevo sin avisar.
- Dos llamadas a `POST /api/import` lanzadas a la vez no se ven entre sí, igual que en la F53.
- Dos productos del mismo banco y tipo abiertos el mismo día con nombres distintos: el segundo no puede entrar.
- No se ha probado con un archivo real: te toca a ti subirlo a Drive y lanzar `POST /api/import`.

## Notas para el futuro

- Frontend: hasta que una sesión del frontend añada `SAME_OPENING_PRODUCT` (y `DUPLICATE_PRODUCT_FILE`) a `gastos-frontend/src/features/import/fileMessages.ts`, ese rechazo se muestra con el texto genérico.
- `docs/roadmap.md` §«Dónde estás ahora mismo» todavía dice «Las 69 features…»; lo actualiza el leader al cerrar la F70.
