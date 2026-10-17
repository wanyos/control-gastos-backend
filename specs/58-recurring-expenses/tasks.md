# Tasks — F58 `recurring-expenses`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto** y ejecutarse.
> Ningún test lleva cifras ni conceptos de la base del humano: todo inventado
> (`docs/conventions.md` §Tests, `docs/lessons.md` #3).

## Lote A — la consulta
Archivos: `src/modules/recurring-expenses/recurring-expenses.types.ts`, `src/modules/recurring-expenses/recurring-expenses.service.ts`, `src/modules/recurring-expenses/recurring-expenses.schema.ts`, `src/modules/recurring-expenses/recurring-expenses.routes.ts`, `src/modules/recurring-expenses/recurring-expenses.test.ts`, `src/app.ts`, `src/modules/movements/movements.service.ts`, `src/modules/transfers/transfers.service.ts`
Depende de: —

- [x] T1 — `isCountedExpense` exportada en `movements.service.ts`; `computeTotals` la usa para la rama de gasto, sin cambiar su comportamiento (`design.md` §2). `transferWords` pasa a `export const` en `transfers.service.ts`. Cubre: R2.
- [x] T2 — Tipos de `design.md` §5; `billKey` y `billPeriodicity` puras (§3, §4); `getRecurringExpenses` con solo `findMany` (§2, §4). Cubre: R1, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14.
- [x] T3 — Esquema de respuesta completo (§6), ruta `GET /` con la opción `depositMaturityMatchers` y `todayInMadrid()`, registro en `src/app.ts` con prefijo `/api/recurring-expenses`. Cubre: R1.
- [x] T4 — Tests en `recurring-expenses.test.ts` (fechas relativas al mes de hoy, datos inventados):
  - "lists a bill on its own by its concept even when it was charged once" — R3, R6.
  - "groups the charges of one bill whose concept changes only in digits or after its second word" — R4.
  - "classifies a bill charged once a year as annual" — R5.
  - "classifies a bill charged twice a month as twice monthly" — R5.
  - "classifies a bill charged every two months as every two months" — R5.
  - "marks a bill as increased when its last month is one cent above the previous one" — R7.
  - "puts transfers and bizum to people in their own group and in the monthly total" — R8, R12.
  - "groups the variable expense by its category summed per month" — R9, R13.
  - "counts an annual bill as one twelfth of its amount in the monthly total" — R11, R12.
  - "leaves out paired transfers, movements excluded from totals and deposit movements" — R2.
  - "writes nothing in the database while answering" — R10 (recuentos y `max(updatedAt)` de `Movement`, `Category`, `CategoryRule` y `Account` iguales antes y después; y el código de `recurring-expenses.service.ts` no contiene `create`, `update`, `delete`, `upsert` ni `$executeRaw`).
  - "answers an empty database with empty groups and a zero total" — R14.
  - "lists a bill with no charge in the period with a monthly cost of zero" — R3, R11.
  - "excludes the current month from the period" — R1.

## Lote B — documentos
Archivos: `docs/api-contract.md`, `README.md`, `docs/architecture.md`, `src/modules/recurring-expenses/recurring-expenses.docs.test.ts`
Depende de: Lote A

- [x] T5 — Sección `GET /api/recurring-expenses` en `docs/api-contract.md` según `design.md` §8, con los nombres de campo que haya dejado el Lote A. Cubre: R15.
- [x] T6 — "api-contract: describes GET /api/recurring-expenses, its groups, its monthly total and the movements of each one" en `recurring-expenses.docs.test.ts`: la sección existe, su ejemplo JSON parsea y tiene `period`, `monthlyTotal`, `bills`, `transfersToPeople` y `variable`; nombra los siete valores de `periodicity`, `monthlyCost`, `hasIncreased`, `excludedFromTotals` y las palabras que reconocen un recibo y un bizum. Cubre: R15.
- [x] T7 — `README.md`: fila de la tabla de endpoints y línea `recurring-expenses/` del árbol de `modules/`. `docs/architecture.md`: ADR-037 (`design.md` §9). Cubre: R15.
