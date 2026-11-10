# myinvestor-investment-purchases — implementación

## Lote A — implementación

**Estado: hecho.** T1–T6 hechos. `./init.sh` en verde (101 archivos, 1580 tests).
El primer intento se bloqueó porque 8 tests de 4 archivos que no eran del lote
sembraban gastos corrientes en cuentas de MyInvestor (ver §Desbloqueo). El leader
añadió esos cuatro archivos a `Archivos:` del Lote A el 2026-11-10 y eligió la
corrección: sembrar el gasto corriente en una cuenta de otro banco.

No se ha escrito nada en la base `gastos` del humano: todos los tests corren en
la base desechable de cada worker de vitest.

### Archivos modificados / creados

Nuevos:
- `src/modules/myinvestor/myinvestor.investment-purchase.ts` — `classifyMyinvestorInvestmentPurchase` y la lista cerrada de los seis conceptos fijos del banco.
- `src/modules/myinvestor/myinvestor.investment-purchase.test.ts`
- `src/modules/movements/movements.investment-purchases.ts` — `resolveInvestmentPurchases` (pura) y `readInvestmentPurchases` (solo `findMany`; con el registro vacío no consulta).
- `src/modules/movements/movements.investment-purchases.test.ts`

Modificados:
- `src/modules/movements/movements.types.ts` — `InvestmentPurchaseMatcher`, `InvestmentPurchaseMatcherRegistry`, `InvestmentPurchaseReading`, `SerializedInvestmentPurchase`; `ListedMovement` gana `investmentPurchase`.
- `src/modules/movements/movements.service.ts` — cuarto parámetro obligatorio en `isCountedExpense` y `computeTotals` (orden depósito → compra → `ownership`); `listMovements` recibe el registro, lee el mapa y serializa `investmentPurchase`.
- `src/modules/movements/movements.routes.ts`, `src/modules/overview/overview.routes.ts`, `src/modules/expenses-by-category/expenses-by-category.routes.ts` — opción `investmentPurchaseMatchers` (por defecto `[]`).
- `src/modules/overview/overview.service.ts`, `src/modules/expenses-by-category/expenses-by-category.service.ts` — leen el mapa y lo pasan a `computeTotals` / `isCountedExpense`.
- `src/app.ts` — registro `investmentPurchaseMatchers` (MyInvestor) y su paso a las tres rutas.
- `src/modules/movements/movements.test.ts` — las 7 llamadas directas a `computeTotals` pasan `new Map()` como cuarto argumento, y el test «keeps the serialized shape of each movement exactly as it was (feature 36)» lista la clave nueva `investmentPurchase`.
- `src/modules/movements/movements.deposits.test.ts`, `src/modules/movements/movements.exclusion.test.ts`, `src/modules/movements/movements.hide-not-counted.test.ts`, `src/modules/overview/overview.test.ts`: ver §Desbloqueo.
- `specs/71-myinvestor-investment-purchases/tasks.md` — `[x]` en T1–T6.
- `progress/current.md` — una línea del Lote A en la sección de la F71.

### Decisiones tomadas

- `getExpensesByCategory` recibe el registro de compras como **último** parámetro, con valor por defecto `[]`. Motivo: `src/modules/expenses-by-category/expenses-by-category.test.ts:413` la llama directamente con cuatro argumentos posicionales y ese archivo no es del Lote A; ponerlo obligatorio o en otra posición lo rompería. La ruta siempre pasa el registro. `listMovements` y `getOverview` sí lo reciben como cuarto parámetro obligatorio (solo las llaman sus rutas).
- `readInvestmentPurchases` filtra ya en la consulta `type: 'expense'` y `transferId: null`, y `resolveInvestmentPurchases` lo vuelve a exigir (es pura y puede recibir cualquier fila).
- Los tests de integración miden «suma como antes» de forma directa: además de las tres sumas de la API, leen las mismas tres sumas llamando a `listMovements`, `getOverview` y `getExpensesByCategory` con el registro de compras **vacío**, que es exactamente el backend anterior a la F71, y comparan.
- Un importe inventado del test de depósitos (el interés de un vencimiento) coincidía con uno de la base del humano y `src/no-real-data.test.ts` lo señaló; lo cambié por otro inventado (principal 2741.30, vencimiento 2759.04, interés 17.74). No se usó `no-real-data-ok`.

### Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `classifies every known non-purchase concept as no purchase, ignoring case, accents and leading spaces`; `an imported MyInvestor purchase of a product never seen counts in none of the three sums with the own accounts table empty` |
| R2 | `an imported MyInvestor purchase with shares in its concept counts in none of the three sums without any mark`; `an imported MyInvestor purchase of a product never seen counts in none of the three sums with the own accounts table empty` |
| R3 | los dos anteriores (importación por `importPending` con el registro real, sin marca, tabla de cuentas propias vacía y ningún producto con ese nombre) |
| R4 | `recognizing a purchase writes nothing: mark, ownership decision, own account texts, amount, type and balance stay the same` |
| R5 | `lists the purchase with the bank amount and type and investmentPurchase certain true or false` |
| R6 | `the MyInvestor premium subscription, its VAT and the premium withholding still count as expense in the three sums`; el unitario de R1 |
| R7 | `MyInvestor deposit openings, cancellations and maturities add up as they did before` |
| R8 | `a purchase marked by hand or recognized by the own accounts table still counts in no sum and keeps its mark` |
| R9 | `lists the purchase with the bank amount and type and investmentPurchase certain true or false`; `keeps the serialized shape of each movement exactly as it was (feature 36)` (`movements.test.ts`) |
| R10 | `marks as certain only a concept ending in @ and a number of shares`; `an imported MyInvestor purchase with shares in its concept…` (`certain: true`); `…product never seen…` (`certain: false`) |
| R11 | `the same concept in an account of another bank is not a purchase and counts as before` |
| R12 | `a MyInvestor income is never a purchase and counts as before` |
| R13 | `a leg of a paired transfer is not a purchase` |
| R14 | Lote B |

### Documentos actualizados

Ninguno: los documentos son del Lote B. `git grep -n "isCountedExpense\|computeTotals\|depositMaturityMatchers"` fuera de `progress/`, `specs/` y `src/` da, entre otras, estas líneas que la F71 deja incompletas y que el Lote B tiene que cubrir:
- `docs/api-contract.md:2122` — dice que `GET /api/expenses-by-category` usa «las mismas lecturas de depósitos y de cuentas propias»; ahora también la de compras de inversión.
- `docs/data-model.md:478` — §Totales globales, lo que aplica `computeTotals` (el párrafo «desde la F71» de `design.md` §7).
- Las menciones de `computeTotals(movements, deposits, ownership)` en `docs/architecture.md` (3063, 3180, 3417-3420, 3494) están dentro de ADR ya cerrados; describen la firma de cuando se decidieron y no las he tratado como falsas.

### Prueba real

La feature no lee datos nuevos de fuera del código: el extracto de MyInvestor ya lo leía el importador. No he hecho prueba con datos reales (la medida sobre la base del humano de `design.md` §6 la hace el reviewer con la API en marcha, solo lectura).

### Comandos ejecutados

- `pnpm exec tsc --noEmit -p .` → sin errores.
- `pnpm run lint` → exit 0. `pnpm exec prettier --write` sobre los archivos del lote → solo reformateó `movements.routes.ts` y el test de integración.
- `pnpm exec vitest run src/modules/movements/movements.investment-purchases.test.ts src/modules/myinvestor/myinvestor.investment-purchase.test.ts src/modules/movements/movements.test.ts` → los 12 tests nuevos pasan; falló `keeps the serialized shape…` hasta añadirle la clave nueva.

### Desbloqueo: dónde se siembra el gasto corriente en los cuatro archivos

Criterio del leader: el gasto corriente sale de la cuenta de MyInvestor y se siembra en una cuenta de otro banco (`bankinter`). El concepto no cambia y ninguna aserción cambia. Donde la consulta miraba una sola cuenta, ahora mira las fechas del test, para que siga viendo el gasto movido.

- `movements.deposits.test.ts`
  - «counts a deposit opening and cancellation as zero in the totals»: la apertura y la cancelación siguen en la cuenta de MyInvestor; `SYNTHETIC CARD PAYMENT` (52.37) pasa a una cuenta `bankinter` nueva. La consulta pasa de `accountId=<cuenta>` a `from=2026-03-05&to=2026-03-21`, que cubre las tres filas del test (`afterEach` borra lo de cada test). Aserción igual: `{ income: '0.00', expense: '52.37', net: '-52.37' }`.
  - «returns deposit null on a movement that is not a deposit one»: `plain` (`SYNTHETIC CARD PAYMENT`) pasa a la cuenta `bankinter` que el test ya creaba para `elsewhere`. Ahora se crea antes. La consulta ya era por fechas y no cambia. Matiz: `plain` deja de ser «un gasto no-depósito de una cuenta de MyInvestor». El caso «texto de MyInvestor que no es un movimiento de depósito» lo sigue cubriendo `wrongType`, en la cuenta de MyInvestor.
- `movements.exclusion.test.ts`: el cambio más corto es el banco de `createAccount()`, que pasa de `myinvestor` a `bankinter`. Lo comprobé antes: ningún test del archivo usa una descripción de depósito real (`APERTURA DEP`, `CANCELACION DEP`, `INTERESES DEP`), ni lee `deposit`, ni nombra el banco. El `'SYNTHETIC DEPOSIT OPENING'` por defecto nunca fue un movimiento de depósito para la regla de la F57. Ningún test depende de una apertura de MyInvestor.
- `movements.hide-not-counted.test.ts`: en `seedWholeMonth`, la cuenta `main` (nómina, `SYNTHETIC PHARMACY` y un movimiento escondido) pasa a `createAccount('bankinter')`. Las cuentas `zero` y `openings`, que llevan las aperturas, cancelaciones y vencimientos de depósito, siguen en MyInvestor. Todas las consultas del archivo son por mes, no por cuenta.
- `overview.test.ts` («period totals of GET /api/overview apply the deposit rule»): los cuatro movimientos de depósito siguen en la cuenta de MyInvestor; `SYNTHETIC CARD PAYMENT` (41.73) se siembra en una cuenta `bankinter` nueva, registrada en `createdAccountIds` para la limpieza. La consulta de `/api/movements` que se compara con el overview pasa de `accountId=<cuenta>&from…&to…` a `from=2026-06-01&to=2026-06-30`: el mismo conjunto que suma el overview, que ya era de todo el mes. Aserciones iguales.

`pnpm exec vitest run` de los cuatro archivos: `Test Files  4 passed (4)`, `Tests  59 passed (59)`.

### Último ./init.sh

Exit **0**. Estado, tipos, lint y `format:check` en `[OK]`. Suite:

```
Test Files  101 passed (101)
     Tests  1580 passed (1580)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks

Exit **1**: `Checks: 13 de 14 en verde`. Todos pasan menos el [13], el test de documentación (`movements.investment-purchases.docs.test.ts`: `No test files found`). Es del Lote B (T9) y todavía no existe. El [14] `pnpm test` ya está en verde.

### Sugerencias fuera de scope (NO aplicadas)

- Ninguna.

## Lote B — implementación

**Estado: hecho.** T7–T9 hechos. `./init.sh` exit 0 (102 archivos, 1581 tests) y
`./init.sh --checks` exit 0 (14 de 14). No se ha escrito nada en la base `gastos`
del humano. No he tocado código del Lote A ni `progress/current.md` (fuera de los
archivos que me asignó el leader).

### Archivos modificados / creados

- `docs/api-contract.md`
  - `GET /api/movements`: párrafo «Desde la feature 71»; `"investmentPurchase": null`
    en el ejemplo de respuesta (detrás de `ownership`, el mismo orden en que lo
    serializa `listMovements`); la lista de campos añadidos dice ya que
    `investmentPurchase` solo viaja en esta respuesta; viñeta
    `movements[].investmentPurchase` con su tabla (`certain`) y dos ejemplos
    (`{ "certain": true }`, `{ "certain": false }`); en la viñeta de `totals`, la
    exclusión de la F71.
  - Sección nueva `#### Compras de inversión de MyInvestor en las sumas` (dentro de
    `GET /api/movements`, detrás de la de cuentas propias): las cuatro condiciones,
    la lista cerrada de los seis conceptos en tabla, la regla de `certain`, qué suma
    (nada, con o sin marca u `ownership`), el orden depósito → compra → `ownership`
    → lo de siempre, y que no escribe nada.
  - `#### Esconder lo que no cuenta`: la compra de inversión entra en el ejemplo de
    «sale aunque no sume» (`design.md` §5: `hideNotCounted` no cambia).
  - `#### Movimientos entre tus cuentas en las sumas` §Qué cuenta en las sumas: una
    viñeta que dice que una compra no cuenta sea cual sea su `ownership`. Sin ella,
    la línea «`not_mine` y `ownership: null` cuentan como contarían sin la tabla»
    dejaba de ser verdad para una compra.
  - `GET /api/overview`: viñeta «Desde la feature 71» que remite a la sección.
  - `GET /api/expenses-by-category` §Qué gasto entra: la lectura de compras en la
    frase de `isCountedExpense` (la línea 2122 que señaló el Lote A) y la condición
    «que no sea una compra de inversión de MyInvestor» con enlace a la sección.
  - `PATCH /api/movements/:id`, `PATCH /api/movements`, `POST /api/transfers` y
    `GET /api/transfers/ambiguous`: la frase «misma forma que en `GET /api/movements`
    salvo …» nombra ahora `investmentPurchase`. En las tres últimas tampoco nombraba
    `ownership` (falso desde la F62); lo he añadido en la misma frase, porque la
    estaba reescribiendo. Comprobado con `grep -rn "ownership:\|investmentPurchase:"
    src` fuera de tests: solo `listMovements` (`movements.service.ts:387-388`)
    serializa esos dos campos.
- `docs/data-model.md` §Totales globales: párrafo «Compras de inversión de MyInvestor
  — desde la F71» tras el de cuentas propias (lista, orden, `readInvestmentPurchases`,
  registro `investmentPurchaseMatchers`, sin columna ni escritor). Lección 2: no
  aplica, la feature no añade columna ni escritor.
- `docs/architecture.md`: ADR-046 al final de la lista de ADR, antes de «Qué NO
  hacer». No revisa ADR-035 ni ADR-040 (`design.md` §7): no les he añadido línea
  «Revisado».
- `src/modules/movements/movements.investment-purchases.docs.test.ts` (nuevo).
- `specs/71-myinvestor-investment-purchases/tasks.md`: `[x]` en T7–T9.

### Decisiones tomadas

- El test de documentos comprueba: la clave `investmentPurchase` en cada movimiento
  del primer bloque JSON de `GET /api/movements`; la fila `| \`certain\` | boolean |`;
  los dos ejemplos `{ "certain": true }` y `{ "certain": false }`; cada uno de los
  seis prefijos como fila de la tabla de la sección nueva (lista literal en el test,
  no importada del código: lo que se comprueba es el documento); seis frases de la
  sección (no-empieza-por, producto que no conoce, regla de `true`, qué suma, orden,
  no escribe); y que `GET /api/overview` y `GET /api/expenses-by-category` enlazan a
  la sección.
- Prueba en negativo: cambié a mano en `docs/api-contract.md` la fila
  `APORTACION A MI CARTERA`, lancé el test y falló con
  `the closed list does not name \`APORTACION A MI CARTERA\``; restauré el archivo
  desde la copia y volvió a verde.
- Los conceptos de ejemplo del contrato son los inventados de `design.md` §8
  (`ETC INVENTADO METAL @ 3`, `ETC INVENTADO METAL @2,5`, `FONDO INVENTADO GLOBAL INDX`).
  Ningún importe nuevo. `src/no-real-data.test.ts` pasa dentro de la suite.

### Trazabilidad

| R | Test |
|---|---|
| R14 | `api-contract: describes the investmentPurchase field and the rule of MyInvestor investment purchases in the sums` (`movements.investment-purchases.docs.test.ts`) |

### Documentos actualizados

`git grep -n "computeTotals\|isCountedExpense\|lecturas de depósitos\|solo viaja"`
fuera de `progress/`, `specs/` y `src/`:
- `docs/api-contract.md` 1754, 1893, 1936, 2021, 2237: corregidas (arriba).
- `docs/data-model.md` 65, 478, 497, 1302: no los cambia la F71 (hablan de
  `productId`, de los depósitos y de qué alimenta `computeTotals`; siguen siendo
  ciertos).
- `docs/roadmap.md` 270 y 378, `feature_list.json` 1514, 1524, 2003, 2021: histórico
  de features cerradas, ciertos en su fecha.
- `docs/architecture.md`: las firmas de tres argumentos de ADR-035/ADR-040/ADR-041
  son de cuando se decidieron; ADR-046 dice que el mapa es ahora el cuarto parámetro.

`git grep -n "depositMaturityMatchers\|tres registros\|tercer registro"` en `docs/`
y `README.md` (fuera de `architecture.md`): sin resultados.

### Prueba real

No aplica: el Lote B solo toca documentos y un test que lee `docs/api-contract.md`.

### Último ./init.sh

Exit **0**. Estado, tipos, lint y `format:check` en `[OK]`. Suite:

```
 Test Files  102 passed (102)
      Tests  1581 passed (1581)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks

Exit **0**: los 14 checks con `exit 0`, el [13] (test de documentos) incluido.

```
[INFO]  [13] (añadido) docs/api-contract.md describe el campo nuevo y la regla.
[OK]        exit 0
[INFO]  [14] (añadido) Lo demás sigue igual: la suite entera pasa.
[OK]        exit 0
[OK]    Checks: 14 de 14 en verde.
```

### Sugerencias fuera de scope (NO aplicadas)

- `docs/data-model.md:478` dice que `computeTotals` alimenta los `totals` de
  `GET /api/movements` y los `period.totals` de `GET /api/overview`, sin nombrar
  `GET /api/expenses-by-category` (que pregunta a `isCountedExpense` desde la F63).
  No lo vuelve falso la F71; no lo he tocado.

## Revisión 1 — arreglos

Solo el hallazgo 1 de `progress/reviews/myinvestor-investment-purchases.md`. Los
hallazgos 2 y 3 los resuelve el leader con el humano; no se han tocado.

### Archivos modificados

- `README.md` (añadido por el leader a `Archivos:` del Lote B de `tasks.md`): la
  fila de `GET /api/movements` (línea 81) añade, al final, una frase:
  «Cada movimiento dice también en `investmentPurchase` si es una compra de
  inversión de MyInvestor (`null` si no lo es; `certain` `true` o `false` si lo
  es); una compra de inversión no cuenta en las sumas, sea cual sea su
  `ownership` (feature 71).»

  Sacado de `docs/api-contract.md` (sección de `GET /api/movements`, campo
  `movements[].investmentPurchase` y la lista de lo que no cuenta). Los términos
  son los de la fila de la F71 en `docs/vocabulary.md` (campo `investmentPurchase`,
  «compra de inversión», «no cuenta en las sumas»).

### Último ./init.sh

`./init.sh > <scratchpad>/init.log 2>&1` → `EXIT=0`. Tipos, `pnpm run lint` y
`pnpm run format:check` en `[OK]`; `Test Files 102 passed (102)`,
`Tests 1581 passed (1581)`; «Entorno listo».
