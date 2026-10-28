import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { MovementType } from '../../generated/prisma/client.js'

import { NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { readDepositMovements } from '../investments/investments.service.js'
import type {
  DepositMaturityMatcherRegistry,
  DepositMovementReading,
} from '../investments/investments.types.js'
import type { OwnershipReading } from '../own-accounts/own-accounts.recognition.js'
import { readOwnership } from '../own-accounts/own-accounts.service.js'
import type {
  AnchorColumns,
  BalanceAnchor,
  BalanceMovement,
  BulkUpdateMovementsBody,
  BulkUpdateMovementsResult,
  ConfirmAllMovementsBody,
  ConfirmAllMovementsResult,
  DecimalLike,
  ListedMovement,
  RecencyPoint,
  MovementListQuery,
  MovementWritableFields,
  MovementListResponse,
  MovementTotals,
  MovementWithRelations,
  SerializedDeposit,
  SerializedMovement,
  SerializedOwnership,
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
 * Is `a` strictly more recent than `b`? `(bookingDate, daySequence, id)`, with a
 * missing `daySequence` read as `0`. THE only recency comparison of the module:
 * the anchor point and the filter of what comes after it must not be able to
 * diverge (feature 31, R7).
 *
 * The id breaks the tie only when BOTH points carry one (roadmap item 25): the
 * anchor stored on an account has no row id, and against it a movement of the
 * same date and `daySequence` is not "after", exactly as before.
 */
export function isAfter(a: RecencyPoint, b: RecencyPoint): boolean {
  const dateDiff = a.bookingDate.getTime() - b.bookingDate.getTime()
  if (dateDiff !== 0) return dateDiff > 0
  const sequenceDiff = (a.daySequence ?? 0) - (b.daySequence ?? 0)
  if (sequenceDiff !== 0) return sequenceDiff > 0
  if (a.id === undefined || b.id === undefined) return false
  return a.id > b.id
}

/** Most recent first: `bookingDate DESC, daySequence DESC, id DESC` (R3b). */
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
    // Carried so a same-day, same-sequence movement with a LOWER id is not
    // summed again on top of the balance this line already contains.
    id: mostRecentWithBalance.id,
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
function movementListWhere(
  query: MovementListQuery,
  ownership: Map<number, OwnershipReading>,
): Prisma.MovementWhereInput {
  const where: Prisma.MovementWhereInput = {}
  if (query.accountId !== undefined) where.accountId = query.accountId
  if (query.type !== undefined) where.type = query.type
  if (query.status !== undefined) where.status = query.status
  if (query.categoryId !== undefined) where.categoryId = query.categoryId
  if (query.uncategorized === true) where.categoryId = null
  const text = searchTerm(query.q)
  if (text !== undefined) where.descriptionSearch = { contains: text }
  // Feature 49 (R10, R16): inside the shared `where`, so the page, the count and
  // the totals all see the same filtered set.
  if (query.transfer === 'only') where.transferId = { not: null }
  if (query.transfer === 'none') where.transferId = null
  if (query.excluded === 'only') where.excludedFromTotals = true
  if (query.excluded === 'none') where.excludedFromTotals = false
  // Feature 62 (R12): the reading is computed when reading, not stored, so the
  // filter is the list of ids that are doubtful right now.
  if (query.ownership === 'doubtful') {
    where.id = {
      in: [...ownership].filter(([, reading]) => reading.status === 'doubtful').map(([id]) => id),
    }
  }
  if (query.from !== undefined || query.to !== undefined) {
    where.bookingDate = {
      ...(query.from === undefined ? {} : { gte: dateOnlyToDate(query.from) }),
      ...(query.to === undefined ? {} : { lte: dateOnlyToDate(query.to) }),
    }
  }
  return where
}

/**
 * The same transformation PostgreSQL applies to `descriptionSearch` (feature 47,
 * design.md §3), done here in TypeScript so both sides of the comparison agree:
 * decompose, drop the diacritics, lowercase.
 */
function normalizeDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Turns the `q` of the querystring into what the `contains` filter needs (R5,
 * R6): normalized like the generated column, and with the three LIKE
 * metacharacters escaped — Prisma's `contains` builds a `LIKE '%…%'` and does
 * NOT escape them, so without this a search for `100%` would match anything.
 * The backslash goes first, or it would escape the escapes.
 */
export function normalizeForSearch(text: string): string {
  return normalizeDiacritics(text).replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** The trimmed, normalized `q`, or `undefined` when there is nothing to search. */
function searchTerm(q: string | undefined): string | undefined {
  if (q === undefined) return undefined
  const trimmed = q.trim()
  return trimmed === '' ? undefined : normalizeForSearch(trimmed)
}

/**
 * THE order of every list of movements this module returns: most recent first,
 * ending in `id` so it is a total order. `daySequence` is the position inside
 * the day AND the account, so two accounts can share `(bookingDate, daySequence)`;
 * without the last key a page boundary falling on such a tie repeats one row and
 * never returns the other.
 */
const movementListOrder: Prisma.MovementOrderByWithRelationInput[] = [
  { bookingDate: 'desc' },
  { daySequence: { sort: 'desc', nulls: 'last' } },
  { id: 'desc' },
]

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
 *
 * Since feature 57 every movement carries `deposit` and the totals count a
 * deposit movement only by what `readDepositMovements` says it counts. That map
 * is read over the whole history of the accounts of the registry's banks, not
 * over the filter (R3, R5).
 *
 * Since feature 62 every movement carries `ownership` too, and the totals
 * leave out what `readOwnership` recognizes as the human's own money moving.
 * That map is also read over the whole table, before the count, so that the
 * `ownership=doubtful` filter can enter the shared `where` (R12).
 */
export async function listMovements(
  prisma: AppPrismaClient,
  query: MovementListQuery,
  matchers: DepositMaturityMatcherRegistry,
): Promise<MovementListResponse> {
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
    throw new ValidationError(`'from' (${query.from}) is after 'to' (${query.to})`)
  }

  if (query.categoryId !== undefined && query.uncategorized === true) {
    throw new ValidationError(
      "'categoryId' and 'uncategorized' cannot be combined: they ask for opposite things",
    )
  }

  if (query.q !== undefined && query.q.trim().length < 2) {
    throw new ValidationError("'q' must have at least 2 characters once trimmed")
  }

  if (query.accountId !== undefined) {
    const account = await prisma.account.findUnique({
      where: { id: query.accountId },
      select: { id: true },
    })
    if (account === null) throw new NotFoundError('Account not found')
  }

  if (query.categoryId !== undefined) {
    const category = await prisma.category.findUnique({
      where: { id: query.categoryId },
      select: { id: true },
    })
    if (category === null) throw new NotFoundError('Category not found')
  }

  // Feature 62: read before the count, so the `ownership` filter goes into the
  // shared `where` and the page, `total` and `totals` see the same set (R12).
  const ownership = await readOwnership(prisma)
  const where = movementListWhere(query, ownership)
  const total = await prisma.movement.count({ where })
  const totalPages = Math.ceil(total / query.pageSize)

  if (query.page > 1 && query.page > totalPages) {
    throw new ValidationError(
      `page ${query.page} is out of range: ${totalPages} page(s) match this filter`,
    )
  }

  const [pageRows, totalsRows, deposits] = await Promise.all([
    prisma.movement.findMany({
      where,
      orderBy: movementListOrder,
      include: { account: true, category: true },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    // The totals run over EVERY matching row, not over the page: "how much went
    // out in August" cannot depend on which page you happen to be reading.
    prisma.movement.findMany({
      where,
      select: {
        id: true,
        type: true,
        amount: true,
        transferId: true,
        productId: true,
        excludedFromTotals: true,
      },
    }),
    readDepositMovements(prisma, matchers),
  ])

  return {
    movements: pageRows.map((row): ListedMovement => ({
      ...serializeMovement(row),
      deposit: serializeDeposit(deposits.get(row.id)),
      ownership: serializeOwnership(ownership.get(row.id)),
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages },
    totals: serializeTotals(computeTotals(totalsRows, deposits, ownership)),
  }
}

/**
 * `ownership` of a listed movement (feature 62, R11): `null` when it matches
 * nothing and the human decided nothing. `leavesTotals` does not travel: the
 * `status` already says it.
 */
function serializeOwnership(reading: OwnershipReading | undefined): SerializedOwnership | null {
  if (reading === undefined) return null
  return {
    status: reading.status,
    ownAccountId: reading.ownAccountId,
    ownAccountName: reading.ownAccountName,
    matchedText: reading.matchedText,
  }
}

/** `deposit` of a listed movement (feature 57, R10): `null` when it is not one. */
function serializeDeposit(reading: DepositMovementReading | undefined): SerializedDeposit | null {
  if (reading === undefined) return null
  return {
    kind: reading.kind,
    principal: reading.principal === null ? null : reading.principal.toFixed(2),
    countedAmount: reading.counted.toFixed(2),
    ambiguous: reading.ambiguous,
    reason: reading.reason,
    candidateMovementIds: reading.candidateMovementIds,
  }
}

/**
 * Updates the ONLY writable fields of a movement: `categoryId` and/or
 * `status` (feature 37), the mark `excludedFromTotals` (feature 49) and the
 * human's `ownershipDecision` (feature 62). The bank fact — amount, type, dates, description,
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

  const data: MovementWritableFields = {}
  if (input.categoryId !== undefined) {
    data.categoryId = input.categoryId
    // Feature 60: a category written here is the human's, even the one the
    // movement already had (R2); removing it leaves no source (R4).
    data.categorySource = input.categoryId === null ? null : 'manual'
  }
  if (input.status !== undefined) data.status = input.status
  // Feature 49: no domain rule — any movement can be marked, a transfer leg or
  // a neutral one included (R9). Only the mark travels; the amount never does.
  if (input.excludedFromTotals !== undefined) data.excludedFromTotals = input.excludedFromTotals
  // Feature 62 (R10): the human's answer on whether it is money between his own
  // accounts. The only writer of the column; `null` hands it back to the
  // recognition.
  if (input.ownershipDecision !== undefined) data.ownershipDecision = input.ownershipDecision

  const updated = await prisma.movement.update({
    where: { id },
    data,
    include: { account: true, category: true },
  })

  return serializeMovement(updated)
}

/**
 * The same two writable fields as `updateMovement`, applied to a set of
 * movements in ONE request and as ONE atomic operation (feature 47): either
 * every id in the list ends up changed or not a single row moves (R8-R10).
 *
 * Why it does not call `updateMovement` in a loop: that would be N validations
 * and N `UPDATE`s, and its `NotFoundError` cannot say WHICH id of the batch
 * failed. The rules it enforces are the very same ones, read over a set.
 *
 * Everything runs inside `prisma.$transaction`, so even a failure between the
 * checks and the write leaves the table untouched. `updateMany` carries only
 * `categoryId` (with its `categorySource`, feature 60), `status` and
 * `excludedFromTotals`: no other column of the bank fact can travel (R13).
 */
export async function bulkUpdateMovements(
  prisma: AppPrismaClient,
  input: BulkUpdateMovementsBody,
): Promise<BulkUpdateMovementsResult> {
  const { ids } = input

  return prisma.$transaction(async (tx) => {
    const found = await tx.movement.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true },
    })

    const foundIds = new Set(found.map((movement) => movement.id))
    const missing = ids.filter((id) => !foundIds.has(id))
    if (missing.length > 0) {
      throw new NotFoundError(`Movement not found: ${missing.join(', ')}`)
    }

    if (typeof input.categoryId === 'number') {
      const category = await tx.category.findUnique({ where: { id: input.categoryId } })
      if (category === null) throw new NotFoundError('Category not found')

      const neutral = found.filter((movement) => movement.type === 'neutral')
      if (neutral.length > 0) {
        throw new ValidationError(
          `A neutral movement (zero amount) cannot take a category: ${idList(neutral)}`,
        )
      }

      const mismatched = found.filter((movement) => movement.type !== category.kind)
      if (mismatched.length > 0) {
        throw new ValidationError(
          `Category kind '${category.kind}' does not match the type of movement(s): ${idList(mismatched)}`,
        )
      }
    }

    const data: MovementWritableFields = {}
    if (input.categoryId !== undefined) {
      data.categoryId = input.categoryId
      // Feature 60: same `updateMany`, same transaction: every listed movement
      // ends up `manual`, or without a source if the category is removed (R3, R4).
      data.categorySource = input.categoryId === null ? null : 'manual'
    }
    if (input.status !== undefined) data.status = input.status
    // Feature 49: the mark goes in the same `updateMany`, inside the same
    // transaction — all or nothing like the other two fields (R2).
    if (input.excludedFromTotals !== undefined) data.excludedFromTotals = input.excludedFromTotals

    const { count } = await tx.movement.updateMany({ where: { id: { in: ids } }, data })

    const movements = await tx.movement.findMany({
      where: { id: { in: ids } },
      orderBy: movementListOrder,
      include: { account: true, category: true },
    })

    return { updated: count, movements: movements.map(serializeMovement) }
  })
}

/**
 * Closes everything that is still open, in ONE transaction (2026-10-16):
 *
 *  1. every `expense` movement without a category receives `expenseCategoryId`,
 *     and every `income` one `incomeCategoryId` — except the legs of a linked
 *     transfer and the movements of an investment product, which are not
 *     spending nor earnings and stay without one;
 *  2. every `pending_review` movement, whatever its category, becomes
 *     `confirmed`.
 *
 * Why it exists: the human decided that telling a supermarket from a gym is
 * not worth doing by hand for 1,600 movements; what he wants is every figure to
 * be complete and honest. With this, "N uncategorized" drops to zero in one
 * request and the review queue empties. Nothing of the bank fact changes, and
 * the totals do not move either (`categoryId` and `status` never enter a sum).
 *
 * Both categories are validated first: they must exist and their `kind` must
 * be the one they are used for, otherwise nothing is written.
 */
export async function confirmAllMovements(
  prisma: AppPrismaClient,
  input: ConfirmAllMovementsBody,
): Promise<ConfirmAllMovementsResult> {
  return prisma.$transaction(async (tx) => {
    const [expenseCategory, incomeCategory] = await Promise.all([
      tx.category.findUnique({ where: { id: input.expenseCategoryId } }),
      tx.category.findUnique({ where: { id: input.incomeCategoryId } }),
    ])
    if (expenseCategory === null) {
      throw new NotFoundError(`Category not found: expenseCategoryId ${input.expenseCategoryId}`)
    }
    if (incomeCategory === null) {
      throw new NotFoundError(`Category not found: incomeCategoryId ${input.incomeCategoryId}`)
    }
    if (expenseCategory.kind !== 'expense') {
      throw new ValidationError(
        `expenseCategoryId ${input.expenseCategoryId} is an '${expenseCategory.kind}' category, not an 'expense' one`,
      )
    }
    if (incomeCategory.kind !== 'income') {
      throw new ValidationError(
        `incomeCategoryId ${input.incomeCategoryId} is an '${incomeCategory.kind}' category, not an 'income' one`,
      )
    }

    const uncategorized = (type: 'expense' | 'income'): Prisma.MovementWhereInput => ({
      type,
      categoryId: null,
      transferId: null,
      productId: null,
    })
    // Feature 60: what this step fills is marked `closing`, so a rule created
    // or changed later may still move it to its own category (R5).
    const expense = await tx.movement.updateMany({
      where: uncategorized('expense'),
      data: { categoryId: expenseCategory.id, categorySource: 'closing' },
    })
    const income = await tx.movement.updateMany({
      where: uncategorized('income'),
      data: { categoryId: incomeCategory.id, categorySource: 'closing' },
    })
    const confirmed = await tx.movement.updateMany({
      where: { status: 'pending_review' },
      data: { status: 'confirmed' },
    })

    return {
      categorized: { expense: expense.count, income: income.count },
      confirmed: confirmed.count,
    }
  })
}

/** The ids of a failing subset, so the message says exactly which ones broke. */
function idList(movements: { id: number }[]): string {
  return movements.map((movement) => movement.id).join(', ')
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
    categorySource: movement.categorySource,
    paymentMethod: movement.paymentMethod,
    origin: movement.origin,
    status: movement.status,
    transferId: movement.transferId,
    daySequence: movement.daySequence,
    excludedFromTotals: movement.excludedFromTotals,
    ownershipDecision: movement.ownershipDecision,
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
 * Whether a movement adds its `amount` to `expense` in `computeTotals`: an
 * `expense` that is not a deposit movement (feature 57), not recognized as the
 * human's own money moving (feature 62: its `ownership` reading leaves the
 * totals), not marked `excludedFromTotals`, not a leg of a linked transfer and
 * not a contribution to an investment product. The single answer to "is this
 * an expense" in the backend: the totals and `GET /api/expenses-by-category`
 * (feature 63) both ask here, so they can never disagree.
 */
export function isCountedExpense(
  movement: TotalsMovement,
  deposits: Map<number, DepositMovementReading>,
  ownership: Map<number, OwnershipReading>,
): boolean {
  return (
    deposits.get(movement.id) === undefined &&
    ownership.get(movement.id)?.leavesTotals !== true &&
    !movement.excludedFromTotals &&
    movement.transferId === null &&
    movement.productId === null &&
    movement.type === 'expense'
  )
}

/**
 * Expense/income totals. Moving money between your own accounts is neither:
 * both legs of a transfer (linked by `transferId`) are excluded, and so are
 * `neutral` movements (R20). A contribution to an investment product
 * (`productId != null`) is excluded too: the money is still yours, it just
 * changed shape (docs/data-model.md §Totales; feature 36 closes roadmap
 * loose end 8). Since feature 40 the transfer detection writes `transferId`
 * after every import run; `productId` still has no writer (a later feature).
 * Since feature 49 a movement the human marked `excludedFromTotals` is left out
 * too. None of these exclusions touch the account balance (`netOf`).
 *
 * Since feature 57 a DEPOSIT movement (one with an entry in `deposits`) adds
 * only what its entry says: a maturity its `counted` to `income`, an opening or
 * a cancellation nothing. For those the mark, `transferId` and `productId` are
 * not looked at (R9): the rule replaces them.
 *
 * Since feature 62 a movement whose `ownership` reading leaves the totals
 * (status `own` or `mine`, from `readOwnership`) adds nothing either: it is
 * money moving between the human's own accounts. A deposit movement still goes
 * by the deposit rule first, whatever its reading (R9); a `doubtful` or a
 * `not_mine` one counts as it would without the own accounts table (R7, R10).
 * Nothing is written on the movement (ADR-040).
 */
export function computeTotals(
  movements: TotalsMovement[],
  deposits: Map<number, DepositMovementReading>,
  ownership: Map<number, OwnershipReading>,
): MovementTotals {
  return movements.reduce<MovementTotals>(
    (totals, movement) => {
      const deposit = deposits.get(movement.id)
      if (deposit !== undefined) {
        if (deposit.kind !== 'maturity') return totals
        return { ...totals, income: totals.income.plus(deposit.counted) }
      }
      if (ownership.get(movement.id)?.leavesTotals === true) return totals
      if (isCountedExpense(movement, deposits, ownership)) {
        return { ...totals, expense: totals.expense.plus(toDecimal(movement.amount)) }
      }
      if (movement.excludedFromTotals) return totals
      if (movement.transferId !== null) return totals
      if (movement.productId !== null) return totals
      if (movement.type === 'income') {
        return { ...totals, income: totals.income.plus(toDecimal(movement.amount)) }
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
