import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import { ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { readDepositMovements } from '../investments/investments.service.js'
import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import { isCountedExpense } from '../movements/movements.service.js'
import { monthRange } from '../overview/overview.service.js'
import { readOwnership } from '../own-accounts/own-accounts.service.js'
import type {
  AskedPeriod,
  Comparison,
  ExpensesByCategoryCategory,
  ExpensesByCategoryGroup,
  ExpensesByCategoryLine,
  ExpensesByCategoryMovement,
  ExpensesByCategoryQuery,
  ExpensesByCategoryResponse,
  LineChange,
  PeriodRange,
} from './expenses-by-category.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function expensesByCategoryDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** The `YYYY-MM` that is `delta` months after `month` (negative: before). */
function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** From the first day of `firstMonth` to the last day of `lastMonth`. */
function monthsRange(firstMonth: string, lastMonth: string, months: number): PeriodRange {
  return { from: monthRange(firstMonth).from, to: monthRange(lastMonth).to, months }
}

/**
 * The asked period and the one it is compared with (design.md §3). A month is
 * compared with the previous month or with the same month of the previous
 * year. A year before the year of `today` (or after it) is compared with the
 * whole previous year; the year of `today` runs from January to the month of
 * `today` and is compared with the same months of the previous year (R4).
 * The two ranges never overlap.
 */
export function resolvePeriods(
  query: ExpensesByCategoryQuery,
  today: string,
): { period: AskedPeriod; compared: PeriodRange; compare: Comparison } {
  const { month, year, compare } = query
  if (month === undefined && year === undefined) {
    throw new ValidationError("One of 'month' or 'year' is required")
  }
  if (month !== undefined && year !== undefined) {
    throw new ValidationError("'month' and 'year' cannot be sent together")
  }
  if (year !== undefined && compare !== undefined) {
    throw new ValidationError("'compare' is only accepted with 'month'")
  }

  if (month !== undefined) {
    const comparison = compare ?? 'previous-month'
    const comparedMonth = addMonths(month, comparison === 'previous-month' ? -1 : -12)
    return {
      period: { month, year: null, ...monthsRange(month, month, 1) },
      compared: monthsRange(comparedMonth, comparedMonth, 1),
      compare: comparison,
    }
  }

  const askedYear = year as string
  const previousYear = String(Number(askedYear) - 1).padStart(4, '0')
  const lastMonthNumber = askedYear === today.slice(0, 4) ? Number(today.slice(5, 7)) : 12
  const lastMonth = String(lastMonthNumber).padStart(2, '0')
  return {
    period: {
      month: null,
      year: askedYear,
      ...monthsRange(`${askedYear}-01`, `${askedYear}-${lastMonth}`, lastMonthNumber),
    },
    compared: monthsRange(`${previousYear}-01`, `${previousYear}-${lastMonth}`, lastMonthNumber),
    compare: 'previous-year',
  }
}

/** What each line adds up while the counted expenses are walked. */
interface Accumulator {
  categoryId: number | null
  amount: Prisma.Decimal
  comparedAmount: Prisma.Decimal
  movements: ExpensesByCategoryMovement[]
}

function changeOf(amount: Prisma.Decimal, comparedAmount: Prisma.Decimal): LineChange {
  if (comparedAmount.isZero() && !amount.isZero()) return 'new'
  if (amount.isZero() && !comparedAmount.isZero()) return 'gone'
  return null
}

/** R1: amount desc, then compared amount desc, then category name (no category last). */
function byLineOrder(a: SortableLine, b: SortableLine): number {
  const byAmount = b.amount.comparedTo(a.amount)
  if (byAmount !== 0) return byAmount
  const byCompared = b.comparedAmount.comparedTo(a.comparedAmount)
  if (byCompared !== 0) return byCompared
  if (a.line.category === null) return b.line.category === null ? 0 : 1
  if (b.line.category === null) return -1
  return a.line.category.name.localeCompare(b.line.category.name)
}

interface SortableLine {
  amount: Prisma.Decimal
  comparedAmount: Prisma.Decimal
  line: ExpensesByCategoryLine
}

function buildGroup(lines: SortableLine[]): ExpensesByCategoryGroup {
  const amount = lines.reduce((total, entry) => total.plus(entry.amount), new Prisma.Decimal(0))
  const comparedAmount = lines.reduce(
    (total, entry) => total.plus(entry.comparedAmount),
    new Prisma.Decimal(0),
  )
  return {
    amount: amount.toFixed(2),
    comparedAmount: comparedAmount.toFixed(2),
    difference: amount.minus(comparedAmount).toFixed(2),
    lines: [...lines].sort(byLineOrder).map((entry) => entry.line),
  }
}

/** `bookingDate` is a date-only column stored at midnight UTC. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The one read of feature 63: the counted expense of each category in the
 * asked period and in the one it is compared with, split into fixed and
 * variable by the mark of each category (ADR-041).
 *
 * What is an expense is NOT decided here: a movement counts only when
 * `isCountedExpense` says so, with the same deposit and ownership readings
 * `GET /api/overview` uses, so a month adds up to its `period.totals.expense`
 * by construction (R9).
 *
 * Read-only: only `findMany`. Nothing is stored.
 */
export async function getExpensesByCategory(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
  query: ExpensesByCategoryQuery,
  today: string,
): Promise<ExpensesByCategoryResponse> {
  const { period, compared, compare } = resolvePeriods(query, today)
  const from = compared.from < period.from ? compared.from : period.from
  const to = compared.to > period.to ? compared.to : period.to

  const [rows, categories, deposits, ownership] = await Promise.all([
    prisma.movement.findMany({
      where: {
        type: 'expense',
        // Both ends inclusive: `bookingDate` is date-only stored at midnight UTC.
        bookingDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      // The order of `GET /api/movements` (R8): the lines keep it.
      orderBy: [
        { bookingDate: 'desc' },
        { daySequence: { sort: 'desc', nulls: 'last' } },
        { id: 'desc' },
      ],
      select: {
        id: true,
        type: true,
        amount: true,
        transferId: true,
        productId: true,
        excludedFromTotals: true,
        categoryId: true,
        bookingDate: true,
        description: true,
        accountId: true,
      },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, parentId: true, isFixed: true },
    }),
    // Over the whole history, as the overview does: a maturity's principal may
    // come from an opening of an earlier month (feature 57).
    readDepositMovements(prisma, matchers),
    // Feature 62: what the own accounts table recognizes as the human's own money.
    readOwnership(prisma),
  ])

  const accumulators = new Map<number | null, Accumulator>()
  for (const row of rows) {
    if (!isCountedExpense(row, deposits, ownership)) continue
    const bookingDate = toDateOnly(row.bookingDate)
    const inPeriod = bookingDate >= period.from && bookingDate <= period.to
    const inCompared = bookingDate >= compared.from && bookingDate <= compared.to
    if (!inPeriod && !inCompared) continue

    const accumulator = accumulators.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      amount: new Prisma.Decimal(0),
      comparedAmount: new Prisma.Decimal(0),
      movements: [],
    }
    accumulators.set(row.categoryId, accumulator)
    const amount = new Prisma.Decimal(row.amount)
    if (inPeriod) {
      accumulator.amount = accumulator.amount.plus(amount)
      accumulator.movements.push({
        id: row.id,
        bookingDate,
        description: row.description,
        amount: amount.toFixed(2),
        accountId: row.accountId,
      })
    } else {
      accumulator.comparedAmount = accumulator.comparedAmount.plus(amount)
    }
  }

  const categoryById = new Map<number, ExpensesByCategoryCategory>(
    categories.map((category) => [category.id, category]),
  )
  const fixed: SortableLine[] = []
  const variable: SortableLine[] = []
  for (const accumulator of accumulators.values()) {
    // R11: a category whose counted expense is zero in both periods has no line.
    if (accumulator.amount.isZero() && accumulator.comparedAmount.isZero()) continue
    const category =
      accumulator.categoryId === null ? null : (categoryById.get(accumulator.categoryId) ?? null)
    const line: ExpensesByCategoryLine = {
      category,
      amount: accumulator.amount.toFixed(2),
      comparedAmount: accumulator.comparedAmount.toFixed(2),
      difference: accumulator.amount.minus(accumulator.comparedAmount).toFixed(2),
      change: changeOf(accumulator.amount, accumulator.comparedAmount),
      monthlyAmount:
        period.year === null ? null : accumulator.amount.dividedBy(period.months).toFixed(2),
      movements: accumulator.movements,
    }
    const entry = { amount: accumulator.amount, comparedAmount: accumulator.comparedAmount, line }
    // R6, R12: the mark of THIS category; no category goes to variable (R10).
    if (category?.isFixed === true) fixed.push(entry)
    else variable.push(entry)
  }

  const amount = [...fixed, ...variable].reduce(
    (total, entry) => total.plus(entry.amount),
    new Prisma.Decimal(0),
  )
  const comparedAmount = [...fixed, ...variable].reduce(
    (total, entry) => total.plus(entry.comparedAmount),
    new Prisma.Decimal(0),
  )

  return {
    period,
    compared,
    compare,
    amount: amount.toFixed(2),
    comparedAmount: comparedAmount.toFixed(2),
    difference: amount.minus(comparedAmount).toFixed(2),
    fixed: buildGroup(fixed),
    variable: buildGroup(variable),
  }
}
