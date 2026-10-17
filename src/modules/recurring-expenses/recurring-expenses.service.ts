import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import { normalizeForMatch } from '../category-rules/category-rules.service.js'
import { readDepositMovements } from '../investments/investments.service.js'
import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import { isCountedExpense } from '../movements/movements.service.js'
import { monthRange } from '../overview/overview.service.js'
import { transferWords } from '../transfers/transfers.service.js'
import type {
  BillPeriodicity,
  MonthAmount,
  RecurringBill,
  RecurringCategory,
  RecurringCategoryGroup,
  RecurringExpensesResponse,
  RecurringGroup,
  RecurringMovement,
} from './recurring-expenses.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference.
 */
export function recurringExpensesDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** The words a bank writes at the start of the description of a bill. */
const billWords = ['recibo', 'recib', 'tributo']

/** A bill: the normalized description STARTS with a bill word not followed by a letter. */
const billStart = /^(recibo|recib|tributo)(?![a-z])/

/** `bizum` as a whole word, next to the transfer words of the transfer detection. */
const bizumWord = /\bbizum\b/iu

/** Whether an expense that counts is a bill (design.md §2, rule 1). */
export function isBill(description: string): boolean {
  return billStart.test(normalizeForMatch(description))
}

/** Whether an expense that counts and is not a bill went to a person (design.md §2, rule 2). */
export function isTransferToPerson(description: string): boolean {
  return transferWords.test(description) || bizumWord.test(description)
}

/**
 * The key that joins the charges of one bill whose description changes
 * (design.md §3): the first two words of the normalized description, leaving
 * out the bill words and every word with a digit in it (a reference number
 * that changes each year). The bank that writes bills cuts the description at
 * 30 characters, and two spellings of one provider differ only after the
 * second word. With no word left, the key is the first bill word.
 */
export function billKey(description: string): string {
  const words = normalizeForMatch(description)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((word) => word !== '')
  const kept = words.filter((word) => !/\d/.test(word) && !billWords.includes(word))
  if (kept.length > 0) return kept.slice(0, 2).join(' ')
  return words.find((word) => billWords.includes(word)) ?? ''
}

/** `(year2 − year1) · 12 + month2 − month1` for two `YYYY-MM`. */
function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  return (toYear - fromYear) * 12 + toMonth - fromMonth
}

/** The `YYYY-MM` that is `delta` months after `month` (negative: before). */
function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** With an even count, the smaller of the two central values. */
function lowerMedianIndex(length: number): number {
  return Math.floor((length - 1) / 2)
}

/**
 * How often a bill is charged, over its whole history (design.md §4): the
 * lower median of the gaps, in months, between its consecutive months with a
 * charge. Gap 1 is `twice_monthly` when the most frequent number of charges in
 * a month with a charge (tie: the smaller) is two or more: a utility with one
 * stray double bill is still monthly; a gym with two fees almost every month
 * is not.
 */
export function billPeriodicity(chargeDates: string[]): BillPeriodicity {
  const chargesPerMonth = new Map<string, number>()
  for (const date of chargeDates) {
    const month = date.slice(0, 7)
    chargesPerMonth.set(month, (chargesPerMonth.get(month) ?? 0) + 1)
  }
  const months = [...chargesPerMonth.keys()].sort()
  if (months.length <= 1) return 'once'

  const gaps = months.slice(1).map((month, index) => monthsBetween(months[index], month))
  gaps.sort((a, b) => a - b)
  const gap = gaps[lowerMedianIndex(gaps.length)]

  if (gap === 1) {
    const frequency = new Map<number, number>()
    for (const count of chargesPerMonth.values()) {
      frequency.set(count, (frequency.get(count) ?? 0) + 1)
    }
    let mode = 0
    let modeFrequency = 0
    for (const [count, times] of frequency) {
      if (times > modeFrequency || (times === modeFrequency && count < mode)) {
        mode = count
        modeFrequency = times
      }
    }
    return mode >= 2 ? 'twice_monthly' : 'monthly'
  }
  if (gap === 2) return 'every_two_months'
  if (gap === 3) return 'every_three_months'
  if (gap <= 8) return 'every_six_months'
  return 'annual'
}

/** An expense that counts, as the module works with it. */
interface Charge {
  id: number
  accountId: number
  bookingDate: string
  month: string
  daySequence: number | null
  amount: Prisma.Decimal
  description: string
  categoryId: number | null
}

/** Most recent first: date, then the order of the day, then the id. */
function byRecency(a: Charge, b: Charge): number {
  if (a.bookingDate !== b.bookingDate) return a.bookingDate < b.bookingDate ? 1 : -1
  const sequenceA = a.daySequence ?? 0
  const sequenceB = b.daySequence ?? 0
  if (sequenceA !== sequenceB) return sequenceB - sequenceA
  return b.id - a.id
}

function serializeCharge(charge: Charge): RecurringMovement {
  return {
    id: charge.id,
    accountId: charge.accountId,
    bookingDate: charge.bookingDate,
    amount: charge.amount.toFixed(2),
    description: charge.description,
  }
}

function sum(charges: Charge[]): Prisma.Decimal {
  return charges.reduce((total, charge) => total.plus(charge.amount), new Prisma.Decimal(0))
}

/** What the entry costs a month: its charges in the period / 12, to cents, half up. */
function monthlyCostOf(periodCharges: Charge[]): Prisma.Decimal {
  return new Prisma.Decimal(sum(periodCharges).dividedBy(12).toFixed(2))
}

/** The total of each month of the period, `"0.00"` where there is none. */
function monthAmounts(periodMonths: string[], charges: Charge[]): MonthAmount[] {
  return periodMonths.map((month) => ({
    month,
    amount: sum(charges.filter((charge) => charge.month === month)).toFixed(2),
  }))
}

function buildGroup(periodMonths: string[], periodCharges: Charge[]): RecurringGroup {
  return {
    months: monthAmounts(periodMonths, periodCharges),
    monthlyCost: monthlyCostOf(periodCharges).toFixed(2),
    movements: [...periodCharges].sort(byRecency).map(serializeCharge),
  }
}

function buildBill(key: string, charges: Charge[], periodMonths: Set<string>): RecurringBill {
  const sorted = [...charges].sort(byRecency)
  const totalsByMonth = new Map<string, Prisma.Decimal>()
  for (const charge of charges) {
    const current = totalsByMonth.get(charge.month) ?? new Prisma.Decimal(0)
    totalsByMonth.set(charge.month, current.plus(charge.amount))
  }
  // Most recent month first.
  const chargedMonths = [...totalsByMonth.keys()].sort().reverse()
  const lastMonth = chargedMonths[0]
  const previousMonth = chargedMonths[1] ?? null
  const lastMonthAmount = totalsByMonth.get(lastMonth) as Prisma.Decimal
  const previousMonthAmount = previousMonth === null ? null : totalsByMonth.get(previousMonth)
  const change =
    previousMonthAmount === undefined || previousMonthAmount === null
      ? null
      : lastMonthAmount.minus(previousMonthAmount)

  const recentTotals = chargedMonths
    .slice(0, 12)
    .map((month) => totalsByMonth.get(month) as Prisma.Decimal)
    .sort((a, b) => a.comparedTo(b))
  const usualAmount = recentTotals[lowerMedianIndex(recentTotals.length)]

  return {
    key,
    name: sorted[0].description,
    periodicity: billPeriodicity(charges.map((charge) => charge.bookingDate)),
    usualAmount: usualAmount.toFixed(2),
    count: charges.length,
    lastDate: sorted[0].bookingDate,
    lastMonth,
    lastMonthAmount: lastMonthAmount.toFixed(2),
    previousMonth,
    previousMonthAmount: previousMonthAmount?.toFixed(2) ?? null,
    change: change?.toFixed(2) ?? null,
    hasIncreased: change !== null && change.greaterThan(0),
    monthlyCost: monthlyCostOf(charges.filter((charge) => periodMonths.has(charge.month))).toFixed(
      2,
    ),
    movements: sorted.map(serializeCharge),
  }
}

/** The 12 complete months before the month of `today`, oldest first. */
export function periodMonthsBefore(today: string): string[] {
  const current = today.slice(0, 7)
  return Array.from({ length: 12 }, (_, index) => addMonths(current, index - 12))
}

/**
 * The one read of feature 58: what a month costs. Every expense that counts
 * (`isCountedExpense`, the same rule as the income/expense totals) falls in
 * the first group whose rule it meets: a bill (description starts with a bill
 * word), a transfer to a person (a transfer word or `bizum`), or the variable
 * expense of its category. Each entry costs a month what it charged in the 12
 * complete months before the current one, divided by 12; `monthlyTotal` adds
 * those already rounded, so the screen adds up.
 *
 * Read-only: only `findMany`. Nothing is stored; the answer is computed on
 * every request.
 */
export async function getRecurringExpenses(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
  today: string,
): Promise<RecurringExpensesResponse> {
  const periodMonths = periodMonthsBefore(today)
  const periodMonthSet = new Set(periodMonths)
  const period = {
    from: monthRange(periodMonths[0]).from,
    to: monthRange(periodMonths[periodMonths.length - 1]).to,
    months: periodMonths,
  }

  const [rows, categories, deposits] = await Promise.all([
    prisma.movement.findMany({
      where: { type: 'expense' },
      select: {
        id: true,
        accountId: true,
        type: true,
        amount: true,
        description: true,
        bookingDate: true,
        daySequence: true,
        categoryId: true,
        transferId: true,
        productId: true,
        excludedFromTotals: true,
      },
    }),
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    // Over the whole history: a deposit movement is recognized by its bank's rule.
    readDepositMovements(prisma, matchers),
  ])

  const bills = new Map<string, Charge[]>()
  const toPeople: Charge[] = []
  const variable = new Map<number | null, Charge[]>()

  for (const row of rows) {
    if (!isCountedExpense(row, deposits)) continue
    const bookingDate = row.bookingDate.toISOString().slice(0, 10)
    const charge: Charge = {
      id: row.id,
      accountId: row.accountId,
      bookingDate,
      month: bookingDate.slice(0, 7),
      daySequence: row.daySequence,
      amount: new Prisma.Decimal(row.amount),
      description: row.description,
      categoryId: row.categoryId,
    }

    if (isBill(charge.description)) {
      const key = billKey(charge.description)
      bills.set(key, [...(bills.get(key) ?? []), charge])
      continue
    }
    // Transfers to people and the variable expense only look at the period.
    if (!periodMonthSet.has(charge.month)) continue
    if (isTransferToPerson(charge.description)) {
      toPeople.push(charge)
      continue
    }
    variable.set(charge.categoryId, [...(variable.get(charge.categoryId) ?? []), charge])
  }

  const billEntries = [...bills.entries()]
    .map(([key, charges]) => buildBill(key, charges, periodMonthSet))
    .sort(
      (a, b) =>
        new Prisma.Decimal(b.monthlyCost).comparedTo(a.monthlyCost) ||
        (a.lastDate === b.lastDate ? 0 : a.lastDate < b.lastDate ? 1 : -1) ||
        (a.key === b.key ? 0 : a.key < b.key ? -1 : 1),
    )

  const categoryById = new Map<number, RecurringCategory>(
    categories.map((category) => [category.id, category]),
  )
  const variableEntries: RecurringCategoryGroup[] = [...variable.entries()]
    .map(([categoryId, charges]) => ({
      category: categoryId === null ? null : (categoryById.get(categoryId) ?? null),
      ...buildGroup(periodMonths, charges),
    }))
    .sort((a, b) => {
      const byCost = new Prisma.Decimal(b.monthlyCost).comparedTo(a.monthlyCost)
      if (byCost !== 0) return byCost
      if (a.category === null) return b.category === null ? 0 : 1
      if (b.category === null) return -1
      return a.category.name.localeCompare(b.category.name)
    })

  const transfersToPeople = buildGroup(periodMonths, toPeople)

  const monthlyTotal = [
    ...billEntries.map((bill) => bill.monthlyCost),
    transfersToPeople.monthlyCost,
    ...variableEntries.map((entry) => entry.monthlyCost),
  ].reduce((total, cost) => total.plus(cost), new Prisma.Decimal(0))

  return {
    period,
    monthlyTotal: monthlyTotal.toFixed(2),
    bills: billEntries,
    transfersToPeople,
    variable: variableEntries,
  }
}
