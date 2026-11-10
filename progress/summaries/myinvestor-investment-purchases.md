# Resumen — feature 71 `myinvestor-investment-purchases`

Fecha de cierre: 2026-11-10
Intención original: `feature_list.json` → feature `myinvestor-investment-purchases`, bloque `intent`
Spec (SDD): `specs/71-myinvestor-investment-purchases/`

## Qué hace ahora la app que antes no

Un gasto de la cuenta de MyInvestor que es una compra de inversión (un ETF, un ETC,
un fondo, también uno que la app no ha visto nunca) ya no cuenta como gasto en los
totales de movimientos, en Overview ni en Expenses by category, sin marcarlo a mano
ni añadir textos. Se decide cada vez que se leen las sumas: no se escribe nada en la
base. Cada movimiento de `GET /api/movements` trae el campo `investmentPurchase`
(`null`, `{ "certain": true }` si el concepto acaba en «@ nº de participaciones»,
`{ "certain": false }` si es compra solo por no ser uno de los 6 conceptos fijos del
banco).

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| La regla del banco: qué concepto es compra y con qué certeza | [myinvestor.investment-purchase.ts:58](../../src/modules/myinvestor/myinvestor.investment-purchase.ts#L58) |
| El registro que conecta MyInvestor con las tres sumas | [app.ts:107](../../src/app.ts#L107) |
| `GET /api/movements` — lista con `investmentPurchase` y totales sin compras | [movements.routes.ts:116](../../src/modules/movements/movements.routes.ts#L116) |
| `GET /api/overview` — totales del periodo sin compras | [overview.routes.ts:41](../../src/modules/overview/overview.routes.ts#L41) |
| `GET /api/expenses-by-category` — gasto por categoría sin compras | [expenses-by-category.routes.ts:39](../../src/modules/expenses-by-category/expenses-by-category.routes.ts#L39) |

## Dónde está el código

### Reconocer la compra (banco)

| Qué hace | Dónde |
| --- | --- |
| Lista cerrada de los 6 conceptos fijos que no son compra | [myinvestor.investment-purchase.ts](../../src/modules/myinvestor/myinvestor.investment-purchase.ts) → `knownNonPurchasePrefixes` |
| Normaliza el concepto (espacios, tildes, mayúsculas) | [myinvestor.investment-purchase.ts](../../src/modules/myinvestor/myinvestor.investment-purchase.ts) → `normalize` |
| Decide compra / no compra y `certain` | [myinvestor.investment-purchase.ts](../../src/modules/myinvestor/myinvestor.investment-purchase.ts) → `classifyMyinvestorInvestmentPurchase` |
| Registro de bancos con regla de compras | [app.ts](../../src/app.ts) → `investmentPurchaseMatchers` |

### Leer las compras al sumar

| Qué hace | Dónde |
| --- | --- |
| Decide qué movimientos son compra (solo gastos, sin traspaso, del banco registrado) | [movements.investment-purchases.ts](../../src/modules/movements/movements.investment-purchases.ts) → `resolveInvestmentPurchases` |
| Lee los candidatos de la base (solo `findMany`) | [movements.investment-purchases.ts](../../src/modules/movements/movements.investment-purchases.ts) → `readInvestmentPurchases` |
| Tipos del registro, de la lectura y del campo serializado | [movements.types.ts](../../src/modules/movements/movements.types.ts) → `InvestmentPurchaseMatcher`, `InvestmentPurchaseMatcherRegistry`, `InvestmentPurchaseReading`, `SerializedInvestmentPurchase`, `ListedMovement` |
| Qué gasto cuenta (depósito → compra → cuentas propias) | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `isCountedExpense` |
| Totales de movimientos y de Overview | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `computeTotals` |
| Lista con el campo `investmentPurchase` | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `listMovements`, `serializeInvestmentPurchase` |
| Overview lee las compras | [overview.service.ts](../../src/modules/overview/overview.service.ts) → `getOverview` |
| Expenses by category lee las compras | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `getExpensesByCategory` |
| Opción `investmentPurchaseMatchers` de cada ruta | [movements.routes.ts](../../src/modules/movements/movements.routes.ts), [overview.routes.ts](../../src/modules/overview/overview.routes.ts), [expenses-by-category.routes.ts](../../src/modules/expenses-by-category/expenses-by-category.routes.ts) → `investmentPurchaseMatchers` |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Campo `investmentPurchase` y sección «Compras de inversión de MyInvestor en las sumas» | [api-contract.md](../../docs/api-contract.md) |
| Párrafo «Compras de inversión de MyInvestor — desde la F71» en §Totales globales | [data-model.md](../../docs/data-model.md) |
| ADR-046 | [architecture.md](../../docs/architecture.md) |
| Términos aprobados (punto 5 de la hoja) | [vocabulary.md](../../docs/vocabulary.md) |
| Fila de `GET /api/movements` | [README.md](../../README.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Los 6 conceptos fijos y la regla de `certain` | [myinvestor.investment-purchase.test.ts](../../src/modules/myinvestor/myinvestor.investment-purchase.test.ts) |
| Las tres sumas con compras importadas, marcadas, de otro banco, ingresos, traspasos, depósitos, premium; que no escribe nada; el campo en la lista | [movements.investment-purchases.test.ts](../../src/modules/movements/movements.investment-purchases.test.ts) |
| El contrato publica el campo y la regla | [movements.investment-purchases.docs.test.ts](../../src/modules/movements/movements.investment-purchases.docs.test.ts) |
| Forma serializada del movimiento y `computeTotals` con el cuarto argumento | [movements.test.ts](../../src/modules/movements/movements.test.ts) |
| Gasto corriente sembrado en otro banco para que sigan midiendo lo mismo | [movements.deposits.test.ts](../../src/modules/movements/movements.deposits.test.ts), [movements.exclusion.test.ts](../../src/modules/movements/movements.exclusion.test.ts), [movements.hide-not-counted.test.ts](../../src/modules/movements/movements.hide-not-counted.test.ts), [overview.test.ts](../../src/modules/overview/overview.test.ts) |

## Cumplimiento de la intención

- ✅ «Al importar un extracto de MyInvestor con una compra del ETC de oro, esa compra no
  suma…» → `an imported MyInvestor purchase with shares in its concept counts in none of
  the three sums without any mark`. Check: ✅ (`./init.sh --checks`, 2026-11-10).
- ✅ «Lo mismo con una compra de un producto que la aplicación no ha visto nunca…» →
  `an imported MyInvestor purchase of a product never seen counts in none of the three
  sums with the own accounts table empty` y `classifies every known non-purchase
  concept…`. Checks: ✅ ✅.
- ✅ «La suscripción premium de MyInvestor y su IVA siguen contando como gasto» →
  `the MyInvestor premium subscription, its VAT and the premium withholding still count
  as expense in the three sums`. Check: ✅.
- ✅ «Los intereses, las aperturas, cancelaciones y vencimientos de depósitos suman igual»
  → `MyInvestor deposit openings, cancellations and maturities add up as they did before`
  y `a MyInvestor income is never a purchase and counts as before`. Checks: ✅ ✅.
- ✅ «Las compras que ya estaban marcadas a mano, y las que ya reconoce la tabla de cuentas
  propias, siguen sin contar» → `a purchase marked by hand or recognized by the own
  accounts table still counts in no sum and keeps its mark`. Check: ✅.
- ✅ «El gasto de octubre de 2026 en Overview sigue siendo el mismo que antes de la
  feature» → sin check (los tests no leen la base del humano); revisado a mano con la API
  en marcha, solo lectura: `GET /api/overview?month=2026-10` da el mismo `expense` y el
  mismo `income` que antes de la feature. Además, en la cuenta de MyInvestor la regla
  reconoce 11 compras (2 `certain: true`, 9 `certain: false`), las mismas que dice la hoja.
- Añadidos de la hoja (no escribe nada, campo en la lista, certeza, otros bancos,
  traspasos, contrato, suite entera): un test por cada uno; checks ✅. Total:
  14 de 14 en verde.

## Decisiones que se tomaron por ti

- (delegado) R1: es compra todo gasto de MyInvestor que no empiece por uno de los 6
  conceptos fijos (punto 1 de la hoja). Vive en `knownNonPurchasePrefixes`.
- (delegado) R10: sin «@ nº» también es compra, pero `certain: false` (punto 2).
- (delegado) R6: la retención de la remuneración premium sigue contando, como la
  suscripción y su IVA.
- (delegado, lo confirmaste en la hoja) R12: un ingreso de MyInvestor nunca es compra; las
  ventas quedan para otra feature (punto 3).
- (añadido) R9: el campo `investmentPurchase` en la lista (punto 5).
- (añadido) R13: una pierna de traspaso emparejada no se toma por compra.
- (añadido) R14: el contrato publica el campo y la regla.

## Qué NO se tocó / quedó fuera

- Ventas y reembolsos de inversiones, depósitos, aportaciones a cartera y otros bancos.
- No hay forma de deshacer la regla desde la app: un concepto que no debe ser compra se
  añade a `knownNonPurchasePrefixes` (punto 4 de la hoja).
- Ni las marcas a mano ni los textos de la tabla de cuentas propias; nada se escribe en
  la base.
- El frontend todavía no muestra el campo nuevo (📌 de la hoja).

## Notas para el futuro

- `docs/data-model.md` §Totales globales dice que `computeTotals` alimenta los totales
  de `GET /api/movements` y de `GET /api/overview` sin nombrar
  `GET /api/expenses-by-category`, que pregunta a `isCountedExpense` desde la F63
  (sugerencia del implementer, no la vuelve falsa esta feature).
