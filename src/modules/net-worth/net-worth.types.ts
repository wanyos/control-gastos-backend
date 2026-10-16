/**
 * Types of the net-worth view (feature 42): what all the money is worth TODAY,
 * accounts plus investments, in one read-only answer.
 *
 * This module owns only the RESPONSE shape. The investment side
 * (`InvestmentsNetWorth` and its products/issues) is declared in
 * `modules/investments/investments.types.ts`, next to the single reader of
 * those tables (ADR-026); the account entry is `OverviewAccount`, imported
 * from the overview module so the shape has one owner.
 */

import type { InvestmentsNetWorth } from '../investments/investments.types.js'
import type { OverviewAccount } from '../overview/overview.types.js'

/** The account side: the same balances `GET /api/accounts` publishes (R2). */
export interface NetWorthAccounts {
  /** Sum of the balance of every account, as a decimal string. */
  total: string
  accounts: OverviewAccount[]
}

/** Shape of the `GET /api/net-worth` response (feature 42). */
export interface NetWorthResponse {
  /** `YYYY-MM-DD` of today (UTC): the endpoint answers only for today (R11). */
  asOf: string
  /**
   * `YYYY-MM-DD` of the most recent date written anywhere in the database
   * (2026-10-16): the latest between `Movement.bookingDate`, `Valuation.date`
   * and `SavingsSnapshot.date`, over every account and product. `null` when
   * none of the three tables has a row. Says up to which day the figures
   * reach; `asOf` keeps saying which day they are computed for.
   */
  lastDataDate: string | null
  /** `accounts.total + investments.total`, as a decimal string. */
  total: string
  accounts: NetWorthAccounts
  investments: InvestmentsNetWorth
}
