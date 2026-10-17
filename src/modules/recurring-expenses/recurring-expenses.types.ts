/**
 * Types of `GET /api/recurring-expenses` (feature 58). Every amount is a
 * decimal string with two decimals, like the rest of the contract.
 */

/** How often a bill is charged, read from the months it has a charge in. */
export type BillPeriodicity =
  | 'once'
  | 'twice_monthly'
  | 'monthly'
  | 'every_two_months'
  | 'every_three_months'
  | 'every_six_months'
  | 'annual'

/** One movement of an entry, as the response ships it. */
export interface RecurringMovement {
  id: number
  accountId: number
  bookingDate: string
  amount: string
  description: string
}

/** The total of one `YYYY-MM` month. */
export interface MonthAmount {
  month: string
  amount: string
}

/** One bill: every charge whose description gives the same `key`. */
export interface RecurringBill {
  key: string
  /** The description of its most recent charge, as the bank wrote it. */
  name: string
  periodicity: BillPeriodicity
  usualAmount: string
  count: number
  lastDate: string
  lastMonth: string
  lastMonthAmount: string
  previousMonth: string | null
  previousMonthAmount: string | null
  change: string | null
  hasIncreased: boolean
  monthlyCost: string
  /** Every charge of its whole history, most recent first. */
  movements: RecurringMovement[]
}

/** A group summed per month over the 12 months of the period. */
export interface RecurringGroup {
  months: MonthAmount[]
  monthlyCost: string
  /** Only the movements inside the period, most recent first. */
  movements: RecurringMovement[]
}

export interface RecurringCategory {
  id: number
  name: string
  parentId: number | null
}

/** The variable expense of one category (`null`: the movements with no category). */
export interface RecurringCategoryGroup extends RecurringGroup {
  category: RecurringCategory | null
}

export interface RecurringExpensesResponse {
  period: { from: string; to: string; months: string[] }
  monthlyTotal: string
  bills: RecurringBill[]
  transfersToPeople: RecurringGroup
  variable: RecurringCategoryGroup[]
}
