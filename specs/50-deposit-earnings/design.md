# Design — F50 `deposit-earnings`

> Se apoya en `docs/architecture.md` (capas HTTP → servicio → datos, ADR-015 del
> registro por banco en `app.ts`, ADR-026 del módulo de inversiones como único
> lector de sus tablas) y en `docs/conventions.md`. Aquí solo lo que esta feature
> decide. Los nombres del contrato están **propuestos** (`decisions.md` 🔴 5).

## 1. Archivos

| Archivo | Qué le pasa |
| --- | --- |
| `src/modules/myinvestor/myinvestor.deposit-maturity.ts` | **Nuevo.** `isMyinvestorDepositMaturity(description: string): boolean` (R11). Sin base de datos, sin `prisma` (guardián de [`architecture.test.ts:390`](../../src/architecture.test.ts#L390)) |
| `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts` | **Nuevo.** Tests de R11 |
| `src/modules/investments/investments.types.ts` | `DepositMaturityMatcher`, `DepositMaturityMatcherRegistry`, `DepositEarningsStatus`, `DepositEarningsEntry`, `DepositEarningsResponse` |
| `src/modules/investments/investments.service.ts` | Nueva `getDepositEarnings(prisma, matchers, today)` en la parte de lectura. Solo `find*` |
| `src/modules/investments/investments.schema.ts` | `getDepositEarningsSchema`: sin querystring (`additionalProperties: false` sobre un objeto vacío) |
| `src/modules/investments/investments.routes.ts` | `GET /deposits`; el plugin recibe `InvestmentsRoutesOptions { depositMaturityMatchers?: DepositMaturityMatcherRegistry }` (por defecto `[]`, como `importRoutes`) |
| `src/modules/investments/investments.deposits.test.ts` | **Nuevo.** Tests de R1-R10, R12-R14, con un reconocedor falso inyectado y con el real |
| `src/app.ts` | Registro nuevo `depositMaturityMatchers = [{ bank: 'myinvestor', isDepositMaturity: isMyinvestorDepositMaturity }]`, exportado como los otros dos, y pasado a `investmentsRoutes` |
| `docs/api-contract.md` | Sección nueva `GET /api/investments/deposits` (R15); en §`GET /api/investments/overview` se corrige «el **único** endpoint bajo `/api/investments`» |
| `docs/myinvestor-product-files.md` | Plantilla B: una nota de que `maturityDate` es también lo que enlaza el vencimiento del extracto, y de que un depósito cancelado antes de vencer se dice con `closedAt` anterior a `maturityDate` |

No se toca: `prisma/schema.prisma` (ninguna migración), el importador, los parsers,
`getInvestmentsOverview`, `getInvestmentsNetWorth`, `computeTotals` ni nada del
módulo de movimientos o de traspasos. `Movement.productId` sigue sin escritor.

## 2. Tipos

```ts
/** Recognizes, for ONE bank, the statement description of a deposit maturity. */
export interface DepositMaturityMatcher {
  bank: string
  isDepositMaturity(description: string): boolean
}
export type DepositMaturityMatcherRegistry = DepositMaturityMatcher[]

export type DepositEarningsStatus =
  'active' | 'matured' | 'cancelled' | 'maturity_not_found' | 'ambiguous' | 'below_principal'

export interface DepositEarningsEntry {
  id: number
  bank: string
  name: string
  openedAt: string | null
  closedAt: string | null
  principal: string | null
  expectedGain: string | null
  maturityDate: string | null
  status: DepositEarningsStatus
  /** amount − principal; ONLY on `matured`. Never zero standing in for a gap. */
  earned: string | null
  /** The linked movement, on `matured` and `below_principal`. */
  maturity: { movementId: number; date: string; amount: string } | null
  /** Ascending ids, ONLY on `ambiguous`; `[]` otherwise. */
  candidateMovementIds: number[]
}

export interface DepositEarningsResponse {
  /** `YYYY-MM-DD`, the "today" the statuses were decided against. */
  asOf: string
  deposits: DepositEarningsEntry[]
  /** Sum of `earned` of the `matured` entries, `toFixed(2)`. */
  total: string
}
```

## 3. El enlace vencimiento → `.json` (el centro de la feature)

Por cada producto `deposit`, en este orden:

1. `closedAt !== null && closedAt < maturityDate` → `cancelled` (R7). No se busca nada.
2. `maturityDate > today` → `active` (R3).
3. Si no, se buscan los **movimientos candidatos**: cuenta con `Account.bank ===
   product.bank`, `type = 'income'`, `bookingDate = maturityDate`, y
   `matcher.isDepositMaturity(description)` del reconocedor cuyo `bank` es el del
   producto. Si no hay reconocedor para ese banco, no hay candidatos.
   - 0 → `maturity_not_found` (R5).
   - más de 1 → `ambiguous` con los ids ascendentes (R6).
   - 1 con `amount < principal` → `below_principal` (R8).
   - 1 con `amount >= principal` → `matured`, `earned = amount.minus(principal)` (R4).

Defensivo, sin requirement propio: un producto `deposit` con `principal` o
`maturityDate` `NULL` (el parser lo impide) sale como `maturity_not_found` si ya
no puede ser `active`, y nunca con cifra; con `maturityDate` `NULL` no se decide
`active` ni se busca: `maturity_not_found`.

Lectura: **una** consulta de productos `deposit` y **una** de movimientos
(`findMany` con `type: 'income'`, `bookingDate: { in: <maturityDates que hacen
falta> }`, `account: { bank: { in: <bancos> } }`, `select` de `id`, `bookingDate`,
`amount`, `description` y `account.bank`); el filtro del reconocedor y el reparto por
producto se hacen en memoria. El número de la descripción no se lee (R12) y
`excludedFromTotals`, `transferId` y `productId` no entran en el `where` (R13).
Toda la aritmética en `Prisma.Decimal`, serializada `toFixed(2)`, como F39 y F42.

`today` lo calcula la ruta (fecha UTC a medianoche, igual que
[`net-worth.service.ts`](../../src/modules/net-worth/net-worth.service.ts)) y se
inyecta al servicio: los tests fijan el reloj.

**Por qué por fecha.** Es el único dato que el humano ya escribe en el `.json`
(`maturityDate`) y que el extracto también trae (`bookingDate` del vencimiento). En
la base real (consulta de solo lectura del 2026-09-28) el único depósito con `.json`
ya vencido encaja el día exacto, y los 10 vencimientos antiguos cuya apertura está en la base caen el día exacto de
uno o tres meses después de la fecha valor de su apertura, con `bookingDate =
valueDate`; ningún día tiene dos vencimientos.

## 4. El reconocedor, en el módulo del banco

`isMyinvestorDepositMaturity(description)` = `description.trimStart().startsWith('INTERESES DEP')`.
Vive en `src/modules/myinvestor/` y llega al servicio por un tercer registro en
`app.ts`, gemelo de `bankParsers` y `productParsers` (ADR-015): el servicio de
inversiones tiene prohibido nombrar un banco
([`architecture.test.ts:488-504`](../../src/architecture.test.ts#L488)) y el texto
`INTERESES DEP` es conocimiento de MyInvestor. Si el banco cambia el texto, los
depósitos vencidos salen `maturity_not_found`: nunca una cifra falsa.

## 5. Ruta

`GET /api/investments/deposits`, sin parámetros; un parámetro desconocido se ignora y la respuesta sigue siendo `200`,
como el resto de rutas (desviación aceptada por el leader el 2026-09-28: el spec pedía `400`). Respuesta `200`
`DepositEarningsResponse`. Solo lectura de punta a punta (R14).

## 6. Alternativas descartadas

- **Meterlo en `GET /api/investments/overview`.** Esa vista es por mes y quita los
  productos cerrados antes del mes
  ([`investments.service.ts:382-385`](../../src/modules/investments/investments.service.ts#L382)):
  un depósito vencido en agosto no saldría en septiembre, y el total de «lo que me
  han generado» sería de un mes. Cambiaría además `periodGain`, aprobado en la F39.
- **Guardar el enlace escribiendo `Movement.productId`** (a mano con un `PATCH`, o
  automático al importar). A mano cuesta una petición del humano por depósito; al
  importar, necesita el `.json` antes que el extracto o una pasada de recálculo, y
  convierte un cálculo en un dato que se puede quedar desfasado si el humano
  corrige el `maturityDate`. Además `productId` saca el movimiento de las sumas por su
  cuenta, que roza la regla de no tocar lo de la F49.
- **Tolerancia de ±N días en la fecha.** Atraparía un vencimiento apuntado un día
  tarde, pero en los datos no pasa nunca y abre la puerta a coger el vencimiento de
  otro depósito que cae al lado. Si algún día pasa, sale `maturity_not_found` y se
  ve.
- **Reconocer el vencimiento sin texto** (cualquier ingreso ≥ principal ese día). No
  necesita registro nuevo, pero la cancelación de otro depósito ese mismo día (que
  devuelve justo el principal) sería candidata: en los extractos hay días con
  apertura y cancelación juntas.
- **Enlazar por el número de la descripción.** Prohibido por el humano: se repite
  entre depósitos (F49, `progress/spec_honest-totals.md` punto 4).
