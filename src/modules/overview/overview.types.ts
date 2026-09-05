import type { AccountType } from '../../generated/prisma/client.js'

import type { SerializedMovementTotals } from '../movements/movements.types.js'

/**
 * Querystring of `GET /api/overview` (feature 38). `month` is optional: the
 * service falls back to the current month (UTC) when it is missing.
 */
export interface OverviewQuery {
  month?: string
}

/** One account of the breakdown: identity plus its real balance (feature 31). */
export interface OverviewAccount {
  id: number
  iban: string
  bank: string
  alias: string
  type: AccountType
  balance: string
}

/** The month the totals were computed over, with its resolved date range. */
export interface OverviewPeriod {
  /** `YYYY-MM`, either the one asked for or the current month. */
  month: string
  /** `YYYY-MM-DD`, first day of the month (inclusive). */
  from: string
  /** `YYYY-MM-DD`, last day of the month (inclusive). */
  to: string
  /** Same shape as the totals of `GET /api/movements` (feature 36). */
  totals: SerializedMovementTotals
}

/** Shape of the `GET /api/overview` response (feature 38). */
export interface OverviewResponse {
  /** Sum of the balance of every account, as a decimal string. */
  totalBalance: string
  accounts: OverviewAccount[]
  period: OverviewPeriod
}
