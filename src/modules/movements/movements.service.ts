import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { MovementType } from '../../generated/prisma/client.js'

import { NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  AnchorColumns,
  BalanceAnchor,
  BalanceMovement,
  DecimalLike,
  RecencyPoint,
  MovementListQuery,
  MovementListResponse,
  MovementTotals,
  MovementWithRelations,
  SerializedMovement,
  SerializedMovementTotals,
  TotalsMovement,
  UpdateMovementBody,
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
 * income nor an expense, hence `neutral` (see specs/08-data-model/design.md §6).
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

/** `bookingDate` is a date-only column stored at midnight UTC (see toDateOnly). */
function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/**
 * The `where` clause every read of the listing shares: the page, the match
 * count and the totals MUST look at the same rows, so the filter is built once
 * (feature 36). Both date ends are inclusive: the column holds midnight UTC,
 * so `lte` at midnight of `to` covers the whole day.
 */
function movementListWhere(query: MovementListQuery): Prisma.MovementWhereInput {
  const where: Prisma.MovementWhereInput = {}
  if (query.accountId !== undefined) where.accountId = query.accountId
  if (query.type !== undefined) where.type = query.type
  if (query.status !== undefined) where.status = query.status
  if (query.from !== undefined || query.to !== undefined) {
    where.bookingDate = {
      ...(query.from === undefined ? {} : { gte: dateOnlyToDate(query.from) }),
      ...(query.to === undefined ? {} : { lte: dateOnlyToDate(query.to) }),
    }
  }
  return where
}

/**
 * Read-only listing: movements only enter through the importer, so this module
 * has no create/delete. Most recent first, with the account and the category
 * embedded (R13). Since feature 36 the listing is filtered, paginated and
 * carries the totals OF THE FILTER — never again 1520 rows in one response.
 *
 * Where the line between an error and a legitimate empty page runs:
 *  - an `accountId` that does not exist → 404, same answer as GET /api/accounts/:id;
 *  - `from` after `to` → 400, no movement could ever match it;
 *  - a page past the last one → 400, the caller is reading a page that is not there;
 *  - an existing account with nothing in the range → 200 with an empty page and
 *    zero totals: the filter is fine, there is simply nothing in it.
 */
export async function listMovements(
  prisma: AppPrismaClient,
  query: MovementListQuery,
): Promise<MovementListResponse> {
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
    throw new ValidationError(`'from' (${query.from}) is after 'to' (${query.to})`)
  }

  if (query.accountId !== undefined) {
    const account = await prisma.account.findUnique({
      where: { id: query.accountId },
      select: { id: true },
    })
    if (account === null) throw new NotFoundError('Account not found')
  }

  const where = movementListWhere(query)
  const total = await prisma.movement.count({ where })
  const totalPages = Math.ceil(total / query.pageSize)

  if (query.page > 1 && query.page > totalPages) {
    throw new ValidationError(
      `page ${query.page} is out of range: ${totalPages} page(s) match this filter`,
    )
  }

  const [pageRows, totalsRows] = await Promise.all([
    prisma.movement.findMany({
      where,
      orderBy: [{ bookingDate: 'desc' }, { daySequence: { sort: 'desc', nulls: 'last' } }],
      include: { account: true, category: true },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    // The totals run over EVERY matching row, not over the page: "how much went
    // out in August" cannot depend on which page you happen to be reading.
    prisma.movement.findMany({
      where,
      select: { type: true, amount: true, transferId: true, productId: true },
    }),
  ])

  return {
    movements: pageRows.map(serializeMovement),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages },
    totals: serializeTotals(computeTotals(totalsRows)),
  }
}

/**
 * Updates the ONLY two writable fields of a movement: `categoryId` and/or
 * `status` (feature 37). The bank fact — amount, type, dates, description,
 * balanceAfter… — cannot change here: the input type does not admit it and the
 * route schema rejects it before this runs (R15).
 *
 * A category must match the movement: an `expense` category only goes on an
 * `expense` movement, an `income` one only on an `income`; a `neutral`
 * movement (zero amount) takes no category at all (R9).
 */
export async function updateMovement(
  prisma: AppPrismaClient,
  id: number,
  input: UpdateMovementBody,
): Promise<SerializedMovement> {
  const movement = await prisma.movement.findUnique({ where: { id } })
  if (movement === null) throw new NotFoundError('Movement not found')

  if (typeof input.categoryId === 'number') {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
    if (category === null) throw new NotFoundError('Category not found')

    if (movement.type === 'neutral') {
      throw new ValidationError('A neutral movement (zero amount) cannot take a category')
    }
    if (category.kind !== movement.type) {
      throw new ValidationError(
        `Category kind '${category.kind}' does not match movement type '${movement.type}'`,
      )
    }
  }

  const data: { categoryId?: number | null; status?: UpdateMovementBody['status'] } = {}
  if (input.categoryId !== undefined) data.categoryId = input.categoryId
  if (input.status !== undefined) data.status = input.status

  const updated = await prisma.movement.update({
    where: { id },
    data,
    include: { account: true, category: true },
  })

  return serializeMovement(updated)
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
 * Expense/income totals. Moving money between your own accounts is neither:
 * both legs of a transfer (linked by `transferId`) are excluded, and so are
 * `neutral` movements (R20). A contribution to an investment product
 * (`productId != null`) is excluded too: the money is still yours, it just
 * changed shape (docs/data-model.md §Totales; feature 36 closes roadmap
 * loose end 8). Since feature 40 the transfer detection writes `transferId`
 * after every import run; `productId` still has no writer (a later feature).
 */
export function computeTotals(movements: TotalsMovement[]): MovementTotals {
  return movements.reduce<MovementTotals>(
    (totals, movement) => {
      if (movement.transferId !== null) return totals
      if (movement.productId !== null) return totals
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

/** Totals as the contract ships them: decimal strings, `net = income − expense`. */
export function serializeTotals(totals: MovementTotals): SerializedMovementTotals {
  return {
    income: totals.income.toFixed(2),
    expense: totals.expense.toFixed(2),
    net: totals.income.minus(totals.expense).toFixed(2),
  }
}
