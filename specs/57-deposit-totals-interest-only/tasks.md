# Tasks — F57 `deposit-totals-interest-only`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto** y ejecutarse.
> Ningún test lleva cifras de la base del humano: importes inventados
> (`docs/conventions.md` §Tests, `docs/lessons.md` #3).

## Lote A — la regla, en el banco, en inversiones, en movimientos y en el resumen
Archivos: `src/modules/myinvestor/myinvestor.deposit-maturity.ts`, `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts`, `src/modules/investments/investments.types.ts`, `src/modules/investments/investments.deposit-movements.ts`, `src/modules/investments/investments.deposit-movements.test.ts`, `src/modules/investments/investments.service.ts`, `src/app.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.routes.ts`, `src/modules/movements/movements.schema.ts`, `src/modules/movements/movements.deposits.test.ts`, `src/modules/movements/movements.test.ts`, `src/modules/movements/movements.exclusion.test.ts`, `src/modules/overview/overview.service.ts`, `src/modules/overview/overview.routes.ts`, `src/modules/overview/overview.test.ts`
Depende de: —

- [x] T1 — `classifyMyinvestorDepositMovement` en `myinvestor.deposit-maturity.ts`; `isMyinvestorDepositMaturity` la usa. Tests de los tres prefijos, con espacios iniciales y de una descripción que no es de depósito. Cubre: R1.
- [x] T2 — Tipos de `design.md` §2 en `investments.types.ts`; `classifyDepositMovement` en la entrada `myinvestor` de `src/app.ts`. Cubre: R1.
- [x] T3 — `resolveDepositMovements` pura en `investments.deposit-movements.ts` (`design.md` §3). Cubre: R1, R3, R4, R5, R6, R7, R8.
- [x] T4 — Tests unitarios de la pura en `investments.deposit-movements.test.ts`: capital del producto; capital de la apertura aún no devuelta; vencimiento y apertura el mismo día (la posterior no es candidata); dos aperturas de importes distintos con la condición de importe resolviendo una; dos de importes distintos que cumplen ambas → `several_principals` con ids; sin apertura → `principal_not_found`; dos productos el mismo día → `several_principals`; cancelación que devuelve una apertura; cancelación sin apertura → `opening_not_found`; un dudoso no consume apertura; tipo inesperado → no es de depósito. Cubre: R1, R4, R5, R6, R7, R8.
- [x] T5 — `readDepositMovements` en `investments.service.ts` (solo `findMany`). Cubre: R15.
- [x] T6 — `computeTotals(movements, deposits)` y `TotalsMovement.id`; `listMovements` recibe el registro, añade `deposit` a cada fila; opción del registro en `movements.routes.ts`; `deposit` en el esquema de respuesta. Ajustar las llamadas de `movements.test.ts` y `movements.exclusion.test.ts` que usen `computeTotals` directamente. Cubre: R2, R3, R7, R9, R10, R11.
- [x] T7 — `overview.service.ts` / `overview.routes.ts`: mismo registro y `computeTotals` con el mapa. Registro pasado a ambos en `src/app.ts`. Cubre: R13.
- [x] T8 — Tests HTTP en `movements.deposits.test.ts` (siembran cuenta `myinvestor`, movimientos y producto con Prisma en la base desechable):
  - "counts a deposit opening and cancellation as zero in the totals" — R2.
  - "counts a deposit maturity only by its interest over the principal of its product file" — R3, R4.
  - "takes the principal of a maturity without product file from the earlier opening not yet returned" — R5, R6.
  - "counts a deposit maturity marked excludedFromTotals by its interest" — R9.
  - "keeps the bank amount and type of every deposit movement in the listing" — R12, R10.
  - "marks a maturity whose principal is not certain as ambiguous counting zero with reason and candidates" — R7, R11.
  - "returns deposit null on a movement that is not a deposit one" — R10.
  - "counts a deposit maturity added after the first read without any other action" — R15.
  - "computes the deposit rule over the whole history and not only over the filtered month" — R3, R5.
- [x] T9 — Test en `overview.test.ts`: "period totals of GET /api/overview apply the deposit rule". Cubre: R13.
- [x] T10 — Test de que `GET /api/net-worth` no cambia con movimientos de depósito sembrados: los tests existentes de `net-worth.test.ts` pasan sin tocarlos (se comprueba con `pnpm test`). Cubre: — (de `que_no_quiero`).

## Lote B — migración y documentos
Archivos: `prisma/migrations/20261016120000_deposit_movements_unmark/migration.sql`, `src/modules/movements/movements.deposit-unmark-migration.test.ts`, `src/modules/movements/movements.deposits.docs.test.ts`, `docs/api-contract.md`, `docs/data-model.md`, `docs/architecture.md`
Depende de: —

- [x] T11 — `migration.sql` con el `UPDATE` de `design.md` §5 y un comentario que remita a `myinvestor.deposit-maturity.ts`. Sin cifras ni textos de la base del humano en el comentario. Cubre: R14.
- [x] T12 — "the deposit unmark migration unmarks the deposit movements and leaves any other mark" en `movements.deposit-unmark-migration.test.ts` (`design.md` §5). Cubre: R14.
- [x] T13 — `docs/api-contract.md` según `design.md` §8. Cubre: R16.
- [x] T14 — "api-contract: describes how each kind of deposit movement counts, the deposit field, the ambiguous ones and excludedFromTotals" en `movements.deposits.docs.test.ts` (patrón de `category-rules.docs.test.ts`: la sección existe, nombra las claves de `deposit`, los tres `kind`, los tres `reason` y dice que la marca no cambia lo que suma un movimiento de depósito). Cubre: R16.
- [x] T15 — `docs/data-model.md` §Totales y `docs/architecture.md` ADR-035 (`design.md` §1). Cubre: R9, R15.
