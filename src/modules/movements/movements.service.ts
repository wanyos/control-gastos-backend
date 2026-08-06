import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { MovementType } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  BalanceMovement,
  DecimalLike,
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

/** Most recent first: `bookingDate DESC, daySequence DESC` (R3b). */
function byMostRecent(a: BalanceMovement, b: BalanceMovement): number {
  const dateDiff = b.bookingDate.getTime() - a.bookingDate.getTime()
  if (dateDiff !== 0) return dateDiff
  return (b.daySequence ?? 0) - (a.daySequence ?? 0)
}

/**
 * The balance of an account is READ from the statement, not recomputed: banks
 * already print the running balance on every line, so the balance is the
 * `balanceAfter` of the most recent movement that carries one.
 *
 * Summing from `initialBalance` is only the fallback for an account whose
 * movements bring no `balanceAfter` at all (a bank without a running balance,
 * or an account with nothing imported yet). No branch looks at `transferId`:
 * a transfer leg is a real charge/credit already contained in `balanceAfter`.
 */
export function computeAccountBalance(
  initialBalance: DecimalLike,
  movements: BalanceMovement[],
): Prisma.Decimal {
  const fromStatement = movements
    .filter((movement) => movement.balanceAfter !== null)
    .sort(byMostRecent)[0]

  if (fromStatement?.balanceAfter != null) {
    return toDecimal(fromStatement.balanceAfter)
  }

  return movements.reduce((balance, movement) => {
    if (movement.type === 'income') return balance.plus(toDecimal(movement.amount))
    if (movement.type === 'expense') return balance.minus(toDecimal(movement.amount))
    return balance
  }, toDecimal(initialBalance))
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
