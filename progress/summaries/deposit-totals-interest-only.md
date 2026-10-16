# Resumen — feature 57 `deposit-totals-interest-only`

Fecha de cierre: 2026-10-16
Intención original: `feature_list.json` → feature `deposit-totals-interest-only`, bloque `intent`
Spec (SDD): `specs/57-deposit-totals-interest-only/`

## Qué hace ahora la app que antes no

En las sumas de entrada y salida (`totals` de `GET /api/movements` y `period.totals`
de `GET /api/overview`) un depósito de MyInvestor ya solo cuenta por sus intereses, sin
marcar nada a mano: la apertura y la cancelación suman 0, y el vencimiento suma solo su
importe menos el capital. Antes contaban enteros o, si estaban marcados con
`excludedFromTotals`, no contaban nada, tampoco el interés. Cada movimiento de
`GET /api/movements` trae ahora el campo `deposit`, que dice qué clase de movimiento de
depósito es, cuánto suma y, si su capital no se sabe con certeza, que es dudoso, por qué
y qué aperturas podrían ser.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/movements` — `totals` con la regla y `deposit` en cada movimiento | [movements.routes.ts:97](../../src/modules/movements/movements.routes.ts#L97) |
| `GET /api/overview` — `period.totals` con la misma regla | [overview.routes.ts:34](../../src/modules/overview/overview.routes.ts#L34) |
| La suma única de las dos respuestas | [movements.service.ts:526](../../src/modules/movements/movements.service.ts#L526) |
| La regla: qué suma cada movimiento de depósito y de dónde sale su capital | [investments.deposit-movements.ts:71](../../src/modules/investments/investments.deposit-movements.ts#L71) |
| Qué texto de MyInvestor es apertura, cancelación o vencimiento | [myinvestor.deposit-maturity.ts:33](../../src/modules/myinvestor/myinvestor.deposit-maturity.ts#L33) |
| El registro por banco que lo conecta todo | [app.ts:87](../../src/app.ts#L87) |

## Dónde está el código

### Reconocer los movimientos de depósito (código del banco)

| Qué hace | Dónde |
| --- | --- |
| Clasifica una descripción de MyInvestor por sus tres prefijos | [myinvestor.deposit-maturity.ts](../../src/modules/myinvestor/myinvestor.deposit-maturity.ts) → `classifyMyinvestorDepositMovement`, `MyinvestorDepositMovementKind` |
| El reconocedor de vencimientos de la F50 pasa a usar la misma lista | [myinvestor.deposit-maturity.ts](../../src/modules/myinvestor/myinvestor.deposit-maturity.ts) → `isMyinvestorDepositMaturity` |
| Entrada `myinvestor` del registro con `classifyDepositMovement`; el registro llega también a movimientos y resumen | [app.ts](../../src/app.ts) → `depositMaturityMatchers`, `buildApp` |

### La regla (inversiones)

| Qué hace | Dónde |
| --- | --- |
| Tipos de la clasificación, de la entrada y del resultado | [investments.types.ts](../../src/modules/investments/investments.types.ts) → `DepositMovementKind`, `DepositAmbiguityReason`, `DepositMovementInput`, `DepositProductInput`, `DepositMovementReading`, `DepositMaturityMatcher.classifyDepositMovement` |
| Recorre cada cuenta en orden, con las aperturas aún no devueltas, y decide capital, lo que suma y si es dudoso (función pura) | [investments.deposit-movements.ts](../../src/modules/investments/investments.deposit-movements.ts) → `resolveDepositMovements`, `resolveMaturity`, `meetsAmountCondition`, `returnOldestOpening`, `byHistoryOrder` |
| Lee de la base toda la historia de las cuentas del banco y los productos `deposit` (solo lectura) | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `readDepositMovements` |

### Las sumas y el listado

| Qué hace | Dónde |
| --- | --- |
| Un movimiento de depósito suma lo que dice la regla, sin mirar marca, `transferId` ni `productId` | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `computeTotals` |
| Añade `deposit` a cada movimiento listado | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `listMovements`, `serializeDeposit` |
| Forma de `deposit` en la respuesta | [movements.types.ts](../../src/modules/movements/movements.types.ts) → `SerializedDeposit`, `ListedMovement`, `TotalsMovement.id` |
| Recibe el registro por banco | [movements.routes.ts](../../src/modules/movements/movements.routes.ts) → `MovementsRoutesOptions` |
| `period.totals` con la misma suma | [overview.service.ts](../../src/modules/overview/overview.service.ts) → `getOverview`; [overview.routes.ts](../../src/modules/overview/overview.routes.ts) → `OverviewRoutesOptions` |

### Migración

| Qué hace | Dónde |
| --- | --- |
| Quita `excludedFromTotals` de los movimientos de depósito de cuentas `myinvestor`; no toca ninguna otra fila ni columna | [migration.sql](../../prisma/migrations/20261016120000_deposit_movements_unmark/migration.sql) |
| Comentarios de `productId` y `excludedFromTotals` (sin cambio de esquema) | [schema.prisma](../../prisma/schema.prisma) → `model Movement` |

### Documentación

| Qué hace | Dónde |
| --- | --- |
| Campo `deposit`, la regla y lo que pasa con `excludedFromTotals` | [api-contract.md](../../docs/api-contract.md) → §Movimientos de depósito en las sumas, `GET /api/movements`, `Movement`, los dos `PATCH`, `/api/transfers`, `GET /api/overview`, `GET /api/investments/deposits`, `POST /api/import` |
| La decisión y su porqué | [architecture.md](../../docs/architecture.md) → ADR-035 (y notas en ADR-011 y ADR-012) |
| Totales globales | [data-model.md](../../docs/data-model.md) → §Totales globales |
| Fila de `PATCH /api/movements/:id` | [README.md](../../README.md) → tabla de endpoints |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La regla por HTTP: apertura y cancelación a 0, vencimiento por su interés, capital de la apertura, marca que no oculta el interés, importe y tipo intactos, dudoso, `deposit: null`, vencimiento añadido después, toda la historia | [movements.deposits.test.ts](../../src/modules/movements/movements.deposits.test.ts) → `deposit movements in GET /api/movements (feature 57)` |
| La función pura, caso a caso (producto, aperturas, mismo día, condición de importe, dudosos, cancelaciones, cuentas separadas, tipo inesperado) | [investments.deposit-movements.test.ts](../../src/modules/investments/investments.deposit-movements.test.ts) → `resolveDepositMovements (feature 57)` |
| Los tres prefijos de MyInvestor | [myinvestor.deposit-maturity.test.ts](../../src/modules/myinvestor/myinvestor.deposit-maturity.test.ts) → `classifyMyinvestorDepositMovement (feature 57, R1)` |
| La suma con marca, `transferId` y `productId` | [movements.test.ts](../../src/modules/movements/movements.test.ts) → `counts a deposit movement only by its reading, ignoring the mark, transferId and productId` |
| `period.totals` igual que `totals` | [overview.test.ts](../../src/modules/overview/overview.test.ts) → `period totals of GET /api/overview apply the deposit rule` |
| La migración sobre la base de test | [movements.deposit-unmark-migration.test.ts](../../src/modules/movements/movements.deposit-unmark-migration.test.ts) → `the deposit unmark migration unmarks the deposit movements and leaves any other mark` |
| El contrato | [movements.deposits.docs.test.ts](../../src/modules/movements/movements.deposits.docs.test.ts) → `api-contract: describes how each kind of deposit movement counts, …` |
| Registro de prueba de la F50 con el campo nuevo | [investments.deposits.test.ts](../../src/modules/investments/investments.deposits.test.ts) → `matchers` |

## Cumplimiento de la intención

- ⏳ "Con mis datos reales, octubre de 2026 sale en GET /api/movements con las
  aperturas y cancelaciones fuera de las sumas, y del INTERESES DEP. de octubre solo su
  interés dentro" → la regla se cumple con datos inventados. **Las cifras reales no las
  he comprobado**: es tu prueba, tras `prisma migrate deploy`, comparando con
  `../docs/handoff-depositos.md`.
  Checks: ✅ `counts a deposit opening and cancellation as zero in the totals`;
  ✅ `counts a deposit maturity only by its interest over the principal of its product file`.
- ✅ "Agosto de 2025 a septiembre de 2026 recuperan como ingreso los intereses" → se
  cumple con datos inventados, salvo el vencimiento de agosto de 2025, que queda dudoso
  y suma 0 (lo aprobaste en 🔴 1). Las cifras reales, también tu prueba.
  Checks: ✅ `counts a deposit maturity marked excludedFromTotals by its interest`;
  ✅ `takes the principal of a maturity without product file from the earlier opening not yet returned`;
  ✅ `the deposit unmark migration unmarks the deposit movements and leaves any other mark`.
- ✅ "Cada movimiento de depósito sigue enseñando el importe que dio el banco" → check:
  ✅ `keeps the bank amount and type of every deposit movement in the listing`.
- ✅ "Uno sin capital cierto no se adivina: dudoso, cuál y por qué" → check:
  ✅ `marks a maturity whose principal is not certain as ambiguous counting zero with reason and candidates`.
- ✅ "docs/api-contract.md lo describe" → check:
  ✅ `api-contract: describes how each kind of deposit movement counts, the deposit field, the ambiguous ones and excludedFromTotals`.
- ✅ (añadido) Resumen, importaciones nuevas y el resto → checks:
  ✅ `period totals of GET /api/overview apply the deposit rule`;
  ✅ `counts a deposit maturity added after the first read without any other action`;
  ✅ `pnpm test`.

Resultado real de `./init.sh --checks` (2026-10-16): **11 de 11 en verde**.

## Decisiones que se tomaron por ti

- (delegado) Un movimiento es de depósito si el código de su banco reconoce el texto y,
  además, tiene el tipo que le toca (apertura `expense`; cancelación y vencimiento
  `income`). Vive en `myinvestor.deposit-maturity.ts` y `resolveDepositMovements`.
- (delegado + añadido) El capital de un vencimiento sale del `.json` de depósito de ese
  día y, si no hay, de la apertura anterior aún no devuelta, con la condición «interés
  ≥ 0 y menor que el capital». El número de la descripción no se lee.
- (añadido) Un dudoso suma 0; una cancelación sin apertura sale dudosa.
- (delegado) En un movimiento de depósito, `excludedFromTotals` deja de contar, y la
  migración quita las 29 marcas de depósito.
- (delegado) Nombres del campo `deposit` y sus claves.
- (añadido) En un movimiento de depósito tampoco cuentan `transferId` ni `productId`.

## Qué NO se tocó / quedó fuera

- El `amount` y el `type` de ningún movimiento, el saldo, `GET /api/net-worth`,
  `GET /api/investments/deposits`, la importación y el frontend.
- Los traspasos a cuentas propias sin pareja y las compras o aportaciones dentro de
  MyInvestor.
- `deposit` solo viaja en `GET /api/movements`; los `PATCH` y `/api/transfers` siguen
  con su forma.

## Notas para el futuro

- 📌 **Al desplegar, `prisma migrate deploy` escribe en tu base** (quita las 29 marcas
  de depósito).
- El código quita cualquier blanco inicial de la descripción y la migración solo los
  espacios: con un tabulador inicial dirían cosas distintas. Ninguna suma cambiaría,
  solo el filtro `excluded=only`. No se ha comprobado si hay alguna descripción así.
- El árbol de carpetas de `docs/architecture.md` está desfasado en `movements/` e
  `investments/` desde antes de esta feature.
