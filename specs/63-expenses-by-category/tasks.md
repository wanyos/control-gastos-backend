# Tasks — F63 `expenses-by-category`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto**, ser únicos en
> su archivo y ejecutarse.
>
> **Ningún dato del humano en tests ni en ejemplos** (`docs/conventions.md` §Tests):
> importes y conceptos inventados. `src/no-real-data.test.ts` compara importes y
> frases con su base.
>
> ⚠️ **Nada de esta feature se ejecuta contra la base del humano** (`gastos`): la
> migración se aplica en la base de tests; aplicarla en la suya es un deber del
> humano (`decisions.md` 📌).
>
> Los nombres de ruta, columna, parámetro y campo son propuesta (`decisions.md`
> 🔴 6): si el humano los cambia, el leader corrige este archivo antes de lanzar.
>
> **Orden:** A primero. B y C dependen de A y pueden ir **en paralelo** entre sí
> (no comparten archivos).

## Lote A — marca de categoría fija
Archivos: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_category_is_fixed/migration.sql`, `src/modules/categories/categories.routes.ts`, `src/modules/categories/categories.schema.ts`, `src/modules/categories/categories.service.ts`, `src/modules/categories/categories.types.ts`, `src/modules/categories/categories.test.ts`, `src/modules/categories/categories.seed.test.ts`, `src/modules/category-rules/category-rules.routes.test.ts`, `docs/data-model.md`
Depende de: —

- [x] T1 — Migración y `schema.prisma`: `Category.isFixed Boolean @default(false)` con comentario `///` (`design.md` §1). Cubre: R7.
- [x] T2 — `docs/data-model.md` según la lección #2 (bloque Prisma, diagrama ER, «Columnas reservadas», claves naturales), comprobado contra `schema.prisma`. Cubre: R7.
- [x] T3 — `PATCH /api/categories/:id` acepta `name` y/o `isFixed`; `serializeCategory` saca `isFixed` (`design.md` §6). Cubre: R7, R12.
- [x] T4 — Tests en `categories.test.ts`:
  - "marks and unmarks a category as fixed" — R7 (marca, `GET` la trae, desmarca; el nombre no cambia; una nueva nace `false`).
  - ajustar "PATCH /api/categories/:id rejects kind, extra properties and an empty body (R12)" para que `isFixed` deje de ser rechazado y un `isFixed` no booleano sí lo sea.
  - `categories.seed.test.ts` y `category-rules.routes.test.ts`: tocar solo si fallan por el campo nuevo en la forma de la categoría. Cubre: R7.

## Lote B — la consulta
Archivos: `src/modules/expenses-by-category/expenses-by-category.routes.ts`, `src/modules/expenses-by-category/expenses-by-category.schema.ts`, `src/modules/expenses-by-category/expenses-by-category.service.ts`, `src/modules/expenses-by-category/expenses-by-category.types.ts`, `src/modules/expenses-by-category/expenses-by-category.test.ts`, `src/app.ts`, `src/architecture.test.ts`, `src/modules/movements/movements.service.ts`
Depende de: Lote A

- [x] T5 — `resolvePeriods` (`design.md` §3) y `getExpensesByCategory` (§4) usando `isCountedExpense`, `readDepositMovements`, `readOwnership` y `monthRange`; sin reescribir ninguna condición de la regla. Cubre: R1–R6, R8–R12, R14.
- [x] T6 — Schema, types y ruta; registrar en `src/app.ts` con `/api/expenses-by-category` y `depositMaturityMatchers`; añadir la ruta a la lista de `architecture.test.ts` de rutas sin `prisma`; comentario de `isCountedExpense`. Cubre: R1, R13.
- [x] T7 — Tests en `expenses-by-category.test.ts` (base de tests, `today` fijo inyectado):
  - "a month lists each category with its amount, the previous month and the difference" — R1 (incluye el orden).
  - "compares a month with the same month of the previous year" — R2.
  - "a closed year compares with the whole previous year and divides by twelve" — R3.
  - "the year in progress compares with the same months of the previous year" — R4.
  - "marks a category as new or gone against the compared period" — R5.
  - "splits the lines into fixed and variable by the category mark" — R6.
  - "each line carries the counted movements of the period" — R8 (un excluido de la misma categoría no sale).
  - "the month and the year add up to the expense of GET /api/overview" — R9: con un traspaso emparejado, un `excludedFromTotals`, una apertura y un vencimiento de depósito, una aportación a producto, un movimiento reconocido como propio, uno dudoso, un ingreso y un `neutral`; compara con `GET /api/overview` del mes y con la suma de sus meses en el año.
  - "puts counted expenses without category in their own line" — R10.
  - "leaves out a category whose movements count nothing" — R11.
  - "a subcategory is its own line" — R12.
  - "rejects a malformed period with 400 and writes nothing" — R13 (los seis casos).
  - "writes nothing in the database" — R14 (recuento y `updatedAt` antes y después).

## Lote C — documentos
Archivos: `docs/api-contract.md`, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/vocabulary.md`, `src/modules/expenses-by-category/expenses-by-category.docs.test.ts`
Depende de: Lote A

- [x] T8 — `docs/api-contract.md` según `design.md` §5 y §7 (sección nueva, `isFixed` en `Category` y en el `PATCH`, nota en `GET /api/recurring-expenses`), con importes y conceptos inventados. Cubre: R15.
- [x] T9 — `README.md`, ADR-041 en `docs/architecture.md`, cabo suelto 29 en `docs/roadmap.md`, nombres aprobados en `docs/vocabulary.md` (`design.md` §7). Cubre: R15.
- [x] T10 — Test en `expenses-by-category.docs.test.ts`:
  - "the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses" — R15 (la sección existe con `month`, `year`, `compare`, `isFixed`, `VALIDATION_ERROR`; la de recurrentes dice que sigue respondiendo y que se retirará).
