/**
 * Types of `GET /api/last-imports` (feature 69): for every account and every
 * live product, up to which date there is data, which day it was last
 * imported, whether a file is expected every month and the stretches with no
 * data. Read-only (R15).
 *
 * Every date is `YYYY-MM-DD`. `importedAt` is the Madrid day of the instant
 * stored in `lastImportedAt` (R3); the others are date-only columns.
 */

import type { InvestmentProductType } from '../../generated/prisma/client.js'

/** A stretch with no data, both ends included (R11, R12). */
export interface DateGap {
  from: string
  to: string
}

/** One entry of `accounts` (R2). */
export interface AccountImportStatus {
  accountId: number
  bank: string
  alias: string
  /** `bookingDate` of its most recent movement; `null` with no movements. */
  dataUntil: string | null
  /** Madrid day of `Account.lastImportedAt`; `null` = never imported. */
  importedAt: string | null
  /** Always `true`: an account has no closing nor maturity date. */
  expectedMonthly: true
  /** Stretches of more than 31 days between two different imports (R12, R13). */
  gaps: DateGap[]
}

/** One entry of `products`: only live products are listed (R7, R8). */
export interface ProductImportStatus {
  productId: number
  bank: string
  name: string
  type: InvestmentProductType
  maturityDate: string | null
  /** Date of its most recent photo; `null` with no photo (a deposit). */
  dataUntil: string | null
  /** Madrid day of `InvestmentProduct.lastImportedAt`; `null` = never imported. */
  importedAt: string | null
  /** `false` while it has a maturity date in the future (R9, R10). */
  expectedMonthly: boolean
  /** Whole months with no photo between its first and last photo (R11). */
  gaps: DateGap[]
}

/** Shape of the `GET /api/last-imports` response (R1). */
export interface LastImportsResponse {
  /** Today in Madrid, `YYYY-MM-DD`. */
  asOf: string
  accounts: AccountImportStatus[]
  products: ProductImportStatus[]
}
