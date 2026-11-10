# Tasks — F71 `myinvestor-investment-purchases`

> Los nombres de test entre comillas son **exactos**: los `checks` de
> `feature_list.json` los filtran por nombre. Todo concepto e importe de los tests es
> inventado (`design.md` §8).

## Lote A — la regla, las tres sumas y el campo
Archivos: `src/modules/myinvestor/myinvestor.investment-purchase.ts`, `src/modules/myinvestor/myinvestor.investment-purchase.test.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.investment-purchases.ts`, `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.routes.ts`, `src/modules/movements/movements.test.ts`, `src/modules/overview/overview.service.ts`, `src/modules/overview/overview.routes.ts`, `src/modules/expenses-by-category/expenses-by-category.service.ts`, `src/modules/expenses-by-category/expenses-by-category.routes.ts`, `src/app.ts`, `src/modules/movements/movements.investment-purchases.test.ts`, `src/modules/movements/movements.deposits.test.ts`, `src/modules/movements/movements.exclusion.test.ts`, `src/modules/movements/movements.hide-not-counted.test.ts`, `src/modules/overview/overview.test.ts` (añadidos por el leader el 2026-11-10: siembran un gasto corriente en una cuenta de MyInvestor que la regla R1 vuelve compra)
Depende de: —

- [x] T1 — `classifyMyinvestorInvestmentPurchase` con la lista cerrada y la regla de `certain` (`design.md` §3). Cubre: R1, R6, R10.
- [x] T2 — Unitarios en `myinvestor.investment-purchase.test.ts`: «classifies every known non-purchase concept as no purchase, ignoring case, accents and leading spaces» y «marks as certain only a concept ending in @ and a number of shares». Cubre: R1, R6, R10.
- [x] T3 — Tipos del registro, la lectura y el campo en `movements.types.ts`; `resolveInvestmentPurchases` y `readInvestmentPurchases` en `movements.investment-purchases.ts`. Cubre: R1, R11, R12, R13.
- [x] T4 — Cuarto parámetro en `isCountedExpense` y `computeTotals` (orden depósito → compra → `ownership`); `listMovements` lee el mapa y serializa `investmentPurchase`; actualizar las llamadas de `movements.test.ts`. Cubre: R2, R7, R8, R9.
- [x] T5 — Registro `investmentPurchaseMatchers` en `app.ts` y opción en las rutas de movements, overview y expenses-by-category; los dos servicios leen el mapa. Cubre: R2.
- [x] T6 — Integración en `movements.investment-purchases.test.ts`, importando un extracto de MyInvestor por `importPending` con el registro real (como `own-accounts.totals.test.ts`) y midiendo las tres sumas antes y después:
  - «an imported MyInvestor purchase with shares in its concept counts in none of the three sums without any mark». Cubre: R2, R3, R10.
  - «an imported MyInvestor purchase of a product never seen counts in none of the three sums with the own accounts table empty». Cubre: R2, R3.
  - «the MyInvestor premium subscription, its VAT and the premium withholding still count as expense in the three sums». Cubre: R6.
  - «MyInvestor deposit openings, cancellations and maturities add up as they did before». Cubre: R7.
  - «a purchase marked by hand or recognized by the own accounts table still counts in no sum and keeps its mark». Cubre: R8.
  - «recognizing a purchase writes nothing: mark, ownership decision, own account texts, amount, type and balance stay the same». Cubre: R4.
  - «lists the purchase with the bank amount and type and investmentPurchase certain true or false». Cubre: R5, R9, R10.
  - «the same concept in an account of another bank is not a purchase and counts as before». Cubre: R11.
  - «a MyInvestor income is never a purchase and counts as before». Cubre: R12.
  - «a leg of a paired transfer is not a purchase». Cubre: R13.

## Lote B — documentos
Archivos: `docs/api-contract.md`, `docs/data-model.md`, `docs/architecture.md`, `src/modules/movements/movements.investment-purchases.docs.test.ts`, `README.md` (añadido por el leader el 2026-11-10 tras la revisión 1)
Depende de: Lote A

- [x] T7 — `docs/api-contract.md` según `design.md` §5 y §7 (campo, ejemplo, sección nueva con la lista cerrada y el orden, líneas en overview y expenses-by-category). Cubre: R14.
- [x] T8 — `docs/data-model.md` §Totales globales y ADR-046 en `docs/architecture.md` (`design.md` §7). Cubre: R14.
- [x] T9 — `movements.investment-purchases.docs.test.ts`: «api-contract: describes the investmentPurchase field and the rule of MyInvestor investment purchases in the sums» (el campo en el ejemplo JSON de `GET /api/movements`, la clave `certain` y los seis prefijos). Cubre: R14.
