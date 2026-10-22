/**
 * Types of `GET /api/expenses-by-category` (feature 63). Every amount is a
 * decimal string with two decimals, like the rest of the contract.
 */

/** What the asked period is compared with when it is a month. */
export type MonthComparison = 'previous-month' | 'same-month-last-year'

/** What the response says it compared with: a year is always compared with the previous one. */
export type Comparison = MonthComparison | 'previous-year'

/** Querystring: exactly one of `month` and `year`; `compare` only with `month`. */
export interface ExpensesByCategoryQuery {
  month?: string
  year?: string
  compare?: MonthComparison
}

/** A date range, both ends inclusive, and how many months it spans. */
export interface PeriodRange {
  /** `YYYY-MM-DD`, first day (inclusive). */
  from: string
  /** `YYYY-MM-DD`, last day (inclusive). */
  to: string
  months: number
}

export interface AskedPeriod extends PeriodRange {
  month: string | null
  year: string | null
}

export interface ExpensesByCategoryCategory {
  id: number
  name: string
  parentId: number | null
  isFixed: boolean
}

/** One counted expense of the asked period, as the response ships it. */
export interface ExpensesByCategoryMovement {
  id: number
  bookingDate: string
  description: string
  amount: string
  accountId: number
}

/** `new`: nothing in the compared period; `gone`: nothing in the asked one. */
export type LineChange = 'new' | 'gone' | null

export interface ExpensesByCategoryLine {
  /** `null`: the counted expenses with no category (R10). */
  category: ExpensesByCategoryCategory | null
  amount: string
  comparedAmount: string
  difference: string
  change: LineChange
  /** Only with `year`: `amount` divided by the months of the period. */
  monthlyAmount: string | null
  movements: ExpensesByCategoryMovement[]
}

export interface ExpensesByCategoryGroup {
  amount: string
  comparedAmount: string
  difference: string
  lines: ExpensesByCategoryLine[]
}

export interface ExpensesByCategoryResponse {
  period: AskedPeriod
  compared: PeriodRange
  compare: Comparison
  amount: string
  comparedAmount: string
  difference: string
  fixed: ExpensesByCategoryGroup
  variable: ExpensesByCategoryGroup
}
