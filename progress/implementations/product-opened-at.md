# product-opened-at (F15) — implementación

> Feature **sin spec** (`sdd: false`): la fuente son el `intent` y los **8 criterios de
> `acceptance`** de `feature_list.json`. Por eso la trazabilidad de abajo va contra los
> criterios (`C1`…`C8`), no contra `R<n>`.

## Archivos modificados / creados

Ninguno creado. Cinco modificados de código y dos de documentación:

| Archivo | Qué cambia |
| --- | --- |
| [`src/modules/myinvestor/myinvestor.types.ts:93`](../../src/modules/myinvestor/myinvestor.types.ts) | `ParsedProduct.openedAt: string` (**no** `string \| null`), junto a `closedAt`, con el porqué de la asimetría |
| [`src/modules/myinvestor/myinvestor.product.parser.ts:44`](../../src/modules/myinvestor/myinvestor.product.parser.ts) | `openedAt` entra en `commonKeys` (deja de ser clave no admitida) |
| [`src/modules/myinvestor/myinvestor.product.parser.ts:78`](../../src/modules/myinvestor/myinvestor.product.parser.ts) | `readIso('openedAt', true)`, el mismo patrón de `closedAt` con `required = true` |
| [`src/modules/myinvestor/myinvestor.product.parser.ts:113`](../../src/modules/myinvestor/myinvestor.product.parser.ts) | `openedAt === null` entra en la guarda de salida, y el campo en el objeto devuelto |
| [`src/modules/myinvestor/myinvestor.fixture.ts:107`](../../src/modules/myinvestor/myinvestor.fixture.ts) y `:132` | `openedAt` sintético en `buildProductFund` (`2025-01-15`) y en `buildProductDeposit` (`2026-01-15`); `buildProductPortfolio` lo hereda |
| [`src/modules/myinvestor/myinvestor.product.parser.test.ts:140`](../../src/modules/myinvestor/myinvestor.product.parser.test.ts) | `describe` nuevo *«opening a product»* con 5 tests, más el `toEqual` del producto completo |
| [`src/modules/myinvestor/myinvestor.service.test.ts:229`](../../src/modules/myinvestor/myinvestor.service.test.ts) y `:270` | el volcado del año lleva `openedAt`; un archivo sin él no tumba al lote |
| [`docs/api-contract.md:745`](../../docs/api-contract.md) | `openedAt` en el JSON de ejemplo y una fila nueva en la tabla del modelo del producto |
| [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) | las **tres plantillas**, la regla de fechas, la tabla de campos, una sección `openedAt` propia y la corrección destacada de la nota que lo daba por «deliberadamente fuera» |
| [`docs/data-model.md:214`](../../docs/data-model.md) | **(segunda vuelta)** la fila de `InvestmentProduct.openedAt` en «Columnas reservadas» ya no dice que la columna se queda `NULL` para siempre |

**Fuera de esta feature, y no se ha tocado nada:** `prisma/schema.prisma` (la columna
`openedAt DateTime? @db.Date` ya existía desde la F9), migraciones, base de datos,
persistencia de productos, el parser del extracto `.csv` y el de Bankinter.

## Decisiones tomadas

1. **`openedAt: string`, nunca `string | null`.** El tipo es la mitad ejecutable de la
   decisión del humano del 2026-08-13: si el campo es obligatorio en los cuatro tipos, un
   producto **sin** fecha de apertura no existe como producto, es un **archivo fallido**.
   Dejarlo nullable habría permitido que un consumidor futuro (la persistencia) escribiera
   `NULL` en la columna, que es exactamente el agujero que esta feature cierra.
2. **En `commonKeys`, no en las claves de tipo.** Es el sitio que lo hace obligatorio en
   los cuatro tipos con **una sola línea** y sin bifurcar por tipo: `readIso` se llama
   antes de la bifurcación `deposit` / resto. El comentario del array explica por qué está
   ahí siendo obligatorio mientras su vecino `closedAt` es opcional.
3. **`required = true` sobre el `readIsoField` existente**, sin lector nuevo. Eso hace que
   la ausencia caiga en `missing[]` y salga en el `faltan campos obligatorios: …` que ya
   se antepone al **motivo único** del archivo (regla de la F13, R48). No se ha añadido
   ningún mensaje ni ninguna forma de error nueva.
4. **Vacío (`""`) y mal formado se tratan como fecha inválida, no como ausente.** `null` y
   la ausencia sí son lo mismo (R32). El criterio C2 dice «si falta **o viene vacío**», y
   las dos rutas cumplen lo que pide: el archivo falla y el motivo **nombra `openedAt`**.
   Se ha preferido no colapsarlas porque el motivo es más útil distinto (*«se espera
   AAAA-MM-DD»* frente a *«falta»*), y los dos casos están cubiertos por test.
5. **Fechas de fixture distintas de `date`.** `openedAt` (`2025-01-15`) es anterior y de
   otro año que la foto (`2026-08-31`) a propósito: si el parser confundiera un campo con
   otro, el test lo vería. El parser **no valida** que `openedAt` sea anterior a `date` ni
   a `closedAt`; nadie lo pidió y habría sido inventarse un requirement.
6. **El volcado no necesitó ni una línea.** `products.json` serializa el `ParsedProduct`
   entero, así que el campo llega solo; lo que se ha añadido es la **aserción** que lo
   fija, para que un cambio futuro del volcado no lo pierda en silencio.

## Trazabilidad — criterio → test

| Criterio de `acceptance` | Test que lo cubre |
| --- | --- |
| **C1** — el archivo admite `openedAt` ISO y el resultado lo expone junto a `closedAt` | `product.parser.test.ts` › *«reads openedAt on the four types, next to closedAt»* y *«keeps the exact opening date written, in both shapes of product»*; además el `toEqual` del producto completo en *«emits the whole product with its bank and its source file as provenance»* |
| **C2** — obligatorio en los **cuatro** tipos; si falta o viene vacío el archivo falla nombrando el campo, en el **motivo único**, y los demás del lote se parsean igual | *«fails the file naming openedAt when it is missing, on the four types»* (fund, etf, managed_portfolio, deposit) · *«treats an explicit null openedAt as missing»* · *«rejects an empty or badly shaped openedAt naming the expected format»* (`""`, `15/01/2025`, `2025-1-5`, `2025-02-30`) · *«accumulates a missing openedAt with the rest of the problems of the file»* (comprueba que el motivo sigue siendo **uno**: `reason.split(';')` tiene 2 tramos, no 3) · y el lote en `service.test.ts` › *«fails only the file that forgot openedAt and parses the rest of the batch»* |
| **C3** — `closedAt` NO cambia: opcional, vacío = vivo | los dos tests **preexistentes** de `describe('closing a product (R30, R31)')` siguen verdes sin tocarlos, más la aserción `closedAt === null` dentro de *«reads openedAt on the four types…»* |
| **C4** — el volcado `products.json` del año incluye `openedAt` | `service.test.ts` › *«dumps every product of the year into a single products.json (R53)»*, con `expect(dumped.products[0].openedAt).toBe('2025-01-15')` |
| **C5** — el resto del comportamiento no cambia: mismos campos, mismos errores, misma ruta, mismo encaminamiento por extensión | los **372 tests previos** siguen verdes sin cambiar ninguna aserción salvo añadir el campo nuevo al `toEqual` exhaustivo. En particular `routes.test.ts` › *«returns the products of the same bank in the same call (R76)»* y `service.test.ts` › *«routes each entry by its extension and none through the other parser (R76)»* / *«produces byte-identical product dumps on two consecutive runs (R55)»* |
| **C6** — NO toca Prisma ni la BD, NO persiste, NO cambia el CSV ni Bankinter | `git status` no lista `prisma/` ni ningún parser ajeno (ver §Archivos); el guardián `architecture.test.ts` sigue verde y el parser sigue sin referenciar `prisma` |
| **C7** — `api-contract.md` con el campo nuevo, y el documento del formato refleja que es obligatorio | verificable en [`docs/api-contract.md`](../../docs/api-contract.md) (ejemplo + fila de tabla) y [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) (3 plantillas, tabla, sección propia y corrección destacada de la nota vieja) |
| **C8** — fixtures sintéticos sin datos reales ni red, `./init.sh` verde con el guardián de la F14 | `src/no-real-data.test.ts` corre en la suite y pasa; las fechas y cifras añadidas son inventadas y las capas de comparación no marcan nada |

## Segunda vuelta — el cambio pedido por el `reviewer` (2026-08-13)

Veredicto `CHANGES_REQUESTED` con **un solo punto**, de documentación
([`reviews/product-opened-at.md`](../reviews/product-opened-at.md) §1). Aplicado tal cual,
sin tocar código ni tests:

- [`docs/data-model.md:214`](../../docs/data-model.md) — la fila de
  `InvestmentProduct.openedAt` de la tabla **«Columnas reservadas (definidas, sin escritor
  todavía)»** decía *«nadie, de momento: se queda `NULL`. El formato del fichero no lleva
  ese campo; si algún día se quiere, es un campo opcional más»*. Falso en las dos mitades
  tras esta feature. Ahora dice **quién la rellenará** (el importador del fichero de
  inversiones) y **de dónde sale** (el `openedAt` del JSON de producto, obligatorio en los
  cuatro tipos desde la F15), en el mismo formato que la fila vecina de `closedAt`.
- Añadida además una nota fechada **🔄 Cambio del 2026-08-13 (F15)** bajo la tabla,
  siguiendo el estilo que ya usa el documento para el cambio del 2026-08-11: la fila
  cambia de sentido y el porqué no cabe en una celda.

Era el hueco real que quedaba: esa tabla se declara a sí misma el **registro único de
columnas sin escritor del proyecto** y es la que leerá quien implemente la persistencia de
inversiones — justo el consumidor al que esta feature le prepara el dato.

**No tocado, por indicación expresa del reviewer:** `docs/architecture.md:751` y `:845`
(cuerpo del **ADR-012**, registro fechado de la F9; el proyecto no anota los ADR como
superados), ni nada de `specs/` o `progress/` anterior, que son bitácora.

## Último `./init.sh`

Verde y completo (no `--fast`), **repetido tras el cambio de la segunda vuelta**:

```
Test Files  26 passed (26)
     Tests  379 passed (379)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

**379 = 372 + 7**: 5 tests nuevos en `product.parser.test.ts` y 2 en `service.test.ts`.
Ningún test previo se ha borrado ni relajado.

## Sugerencias fuera de scope (NO aplicadas)

1. **La plantilla que el humano guarda en Drive no se entera de este cambio.** Es la
   asimetría que ya avisa el propio `myinvestor-product-files.md` («nadie comprueba que
   las dos coincidan»). Hoy es más que un aviso: **sus archivos escritos con la plantilla
   vieja fallarán todos** hasta que la actualice. Es trabajo manual suyo, no de código.
2. **Nadie escribe todavía `openedAt` en la columna de la F9.** Esta feature cierra la
   mitad de arriba del hueco (el archivo ya trae el dato); la de abajo —persistir
   productos— sigue sin existir, y era `que_no_quiero` explícito aquí.
3. **El parser no comprueba la coherencia entre fechas** (`openedAt` ≤ `date`,
   `openedAt` ≤ `closedAt`, `openedAt` ≤ `maturityDate`). Un dedo torpe puede escribir un
   producto abierto después de su propia foto y pasa. Añadirlo sería un requirement nuevo
   y encaja mejor cuando exista la persistencia, que es quien sufre esa incoherencia.
4. **`openedAt` se teclea igual cada mes** en todos los archivos de un mismo producto, y
   nada comprueba que las copias coincidan entre sí: dos archivos del mismo fondo pueden
   declarar aperturas distintas y ambos parsean. Es el precio de que el parser no tenga
   memoria (R31), y detectarlo pertenece a quien agregue la serie, no a quien lee un
   archivo.
