import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { MovementType } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  AnchorColumns,
  BalanceAnchor,
  BalanceMovement,
  DecimalLike,
  RecencyPoint,
  MovementTotals,
  MovementWithRelations,
  SerializedMovement,
  TotalsMovement,
} from './movements.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function movementsDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

function toDecimal(value: DecimalLike): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

/**
 * Sign rule of the domain: the parser emits a signed amount, the database keeps
 * it always positive and lets `type` carry the sign. A zero amount is neither an
 * income nor an expense, hence `neutral` (see specs/data-model/design.md §6).
 */
export function deriveMovementTypeFromAmount(amount: number): MovementType {
  if (amount < 0) return 'expense'
  if (amount > 0) return 'income'
  return 'neutral'
}

/**
 * Is `a` strictly more recent than `b`? `(bookingDate, daySequence)`, with a
 * missing `daySequence` read as `0`. THE only recency comparison of the module:
 * the anchor point and the filter of what comes after it must not be able to
 * diverge (feature 31, R7).
 */
export function isAfter(a: RecencyPoint, b: RecencyPoint): boolean {
  const dateDiff = a.bookingDate.getTime() - b.bookingDate.getTime()
  if (dateDiff !== 0) return dateDiff > 0
  return (a.daySequence ?? 0) > (b.daySequence ?? 0)
}

/** Most recent first: `bookingDate DESC, daySequence DESC` (R3b). */
function byMostRecent(a: BalanceMovement, b: BalanceMovement): number {
  if (isAfter(a, b)) return -1
  if (isAfter(b, a)) return 1
  return 0
}

/** The anchor stored on an account, or `null` when it was never anchored. */
export function readAnchor(account: AnchorColumns): BalanceAnchor | null {
  if (account.balanceAnchor === null || account.balanceAnchorDate === null) return null
  return {
    amount: account.balanceAnchor,
    bookingDate: account.balanceAnchorDate,
    daySequence: account.balanceAnchorDaySequence,
  }
}

/**
 * The point the balance is summed from: the most recent between the stored
 * anchor and the most recent movement carrying a per-line balance (R7). On a
 * tie the stored anchor wins, because it comes from the statement header, which
 * outranks the balance of a single line.
 */
export function resolveAnchorPoint(
  anchor: BalanceAnchor | null,
  movements: BalanceMovement[],
): BalanceAnchor | null {
  const mostRecentWithBalance = movements
    .filter((movement) => movement.balanceAfter !== null)
    .sort(byMostRecent)[0]

  if (mostRecentWithBalance?.balanceAfter == null) return anchor

  const fromStatement: BalanceAnchor = {
    amount: mostRecentWithBalance.balanceAfter,
    bookingDate: mostRecentWithBalance.bookingDate,
    daySequence: mostRecentWithBalance.daySequence,
  }

  if (anchor === null) return fromStatement
  return isAfter(fromStatement, anchor) ? fromStatement : anchor
}

/**
 * The net of a set of movements over a starting amount: an `income` adds, an
 * `expense` subtracts and a `neutral` moves nothing. Exported (feature 32) so
 * the balance formula and the reconciliation checks share THE one sum: two
 * copies of this rule is how a `neutral` ends up counted on one side only.
 */
export function netOf(movements: BalanceMovement[], from: Prisma.Decimal): Prisma.Decimal {
  return movements.reduce((balance, movement) => {
    if (movement.type === 'income') return balance.plus(toDecimal(movement.amount))
    if (movement.type === 'expense') return balance.minus(toDecimal(movement.amount))
    return balance
  }, from)
}

/**
 * The balance of an account is the amount of its effective anchor point plus
 * the net of everything strictly after it (R6):
 *
 *     balance = amount(anchor point) + net(movements after the anchor point)
 *
 * The precedence rule does NOT change: where the statement brings a balance it
 * still wins, because that line usually IS the anchor point. What is gone is
 * summing as a *fallback*: the sum now always runs, from the anchor instead of
 * from zero, so movements newer than the statement move the balance too (R10)
 * while older ones do not — the anchor already contained them (R9).
 *
 * Without any anchor and without a single per-line balance, it sums everything
 * over `initialBalance`, exactly as before (R8). No branch looks at
 * `transferId`: a transfer leg is a real charge/credit.
 */
export function computeAccountBalance(
  initialBalance: DecimalLike,
  movements: BalanceMovement[],
  anchor?: BalanceAnchor | null,
): Prisma.Decimal {
  const point = resolveAnchorPoint(anchor ?? null, movements)

  if (point === null) return netOf(movements, toDecimal(initialBalance))

  const after = movements.filter((movement) => isAfter(movement, point))
  return netOf(after, toDecimal(point.amount))
}

/**
 * Read-only listing: movements only enter through the importer (next feature),
 * so this module has no create/delete. Most recent first, with the account and
 * the category embedded (R13).
 */
export function listMovements(prisma: AppPrismaClient): Promise<MovementWithRelations[]> {
  return prisma.movement.findMany({
    orderBy: [{ bookingDate: 'desc' }, { daySequence: { sort: 'desc', nulls: 'last' } }],
    include: { account: true, category: true },
  })
}

/** Maps the domain object to the API contract shape. */
export function serializeMovement(movement: MovementWithRelations): SerializedMovement {
  return {
    id: movement.id,
    type: movement.type,
    bookingDate: toDateOnly(movement.bookingDate),
    valueDate: toDateOnly(movement.valueDate),
    amount: movement.amount.toFixed(2),
    description: movement.description,
    balanceAfter: movement.balanceAfter === null ? null : movement.balanceAfter.toFixed(2),
    currency: movement.currency,
    note: movement.note,
    accountId: movement.accountId,
    categoryId: movement.categoryId,
    paymentMethod: movement.paymentMethod,
    origin: movement.origin,
    status: movement.status,
    transferId: movement.transferId,
    daySequence: movement.daySequence,
    createdAt: movement.createdAt.toISOString(),
    updatedAt: movement.updatedAt.toISOString(),
    account: {
      id: movement.account.id,
      iban: movement.account.iban,
      bank: movement.account.bank,
      alias: movement.account.alias,
      type: movement.account.type,
    },
    category:
      movement.category === null
        ? null
        : {
            id: movement.category.id,
            name: movement.category.name,
            kind: movement.category.kind,
            parentId: movement.category.parentId,
          },
  }
}

/** `bookingDate`/`valueDate` are date-only columns: no time, no timezone. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Global expense/income totals. Moving money between your own accounts is
 * neither: both legs of a transfer (linked by `transferId`) are excluded, and so
 * are `neutral` movements (R20).
 */
export function computeTotals(movements: TotalsMovement[]): MovementTotals {
  return movements.reduce<MovementTotals>(
    (totals, movement) => {
      if (movement.transferId !== null) return totals
      if (movement.type === 'income') {
        return { ...totals, income: totals.income.plus(toDecimal(movement.amount)) }
      }
      if (movement.type === 'expense') {
        return { ...totals, expense: totals.expense.plus(toDecimal(movement.amount)) }
      }
      return totals
    },
    { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) },
  )
}
