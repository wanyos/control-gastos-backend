/**
 * Types of the Trade Republic module (feature 20, ADR-024).
 *
 * This bank declares ONLY its own shapes. It does NOT import `ParsedProduct`
 * from MyInvestor and it does NOT move it to `src/lib/`: the FORM of the output
 * is copied on purpose (same vocabulary, same `products.json` per year, same
 * accumulated reason per file) but the TYPE is not shared, because a savings
 * account is neither a fund nor a deposit — it has no `valuation` and no
 * `depositTerms`, it has a balance and the interest paid into it. Sharing the
 * type would force a nullable third branch and a fifth `InvestmentProductType`
 * that MyInvestor could never emit (design §3b, and the very mistake ADR-013
 * rejected with `providesBalance`).
 *
 * The day a THIRD bank enters with a hand-written `.json`, that decision is
 * revisited and the common product contract goes out to `src/lib/` with its own
 * ADR, exactly as ADR-013 did for statements when the second bank arrived.
 *
 * There is no `ParsedStatement` here either: this bank has no statement parser.
 * Its `.pdf` is never opened (design §1).
 */

/**
 * The only product this bank contributes today: the remunerated account. It is
 * a single-valued union on purpose, so a second product of this bank (if it
 * ever appears) is added here and the parser refuses everything else meanwhile.
 */
export type TradeRepublicProductType = 'savings_account'

/** One remunerated account read from one hand-written `.json` file. */
export interface ParsedSavingsAccount {
  bank: 'trade-republic'
  /** Provenance: the source file name. It never decides the name nor the date. */
  file: string
  type: TradeRepublicProductType
  /** The identity of the account: changing it creates another one. */
  name: string
  /** ISO `YYYY-MM-DD`: the day of the interest payment (the photo). */
  date: string
  /** ISO `YYYY-MM-DD`: the day the account was opened. Mandatory (feature 15). */
  openedAt: string
  currency: string
  /** The opening balance of the month, exactly as written. */
  openingBalance: number
  /** What came IN during the month, WITHOUT the interest, exactly as written. */
  moneyIn: number
  /** What went OUT during the month, exactly as written. */
  moneyOut: number
  /** The closing balance right after the payment, exactly as written. */
  balance: number
  /** The interest paid on that date, exactly as written. */
  interest: number
  /** ISO `YYYY-MM-DD`; `null` means alive. Missing the file does NOT close it. */
  closedAt: string | null
}

/** A local copy whose parse or dump failed; isolated so the rest still run. */
export interface FailedFile {
  bank: string
  year: string
  file: string
  /** Sanitized reason (never leaks secrets). */
  reason: string
}

/** A local copy this parser does not handle (unsupported extension); not a failure. */
export interface IgnoredFile {
  bank: string
  year: string
  file: string
  reason: string
}

/** The dump of every account file of one year: one `products.json` per year. */
export interface TradeRepublicProductsResult {
  bank: 'trade-republic'
  year: string
  products: ParsedSavingsAccount[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}

/** Summary of one parsed account, as the run result reports it. */
export interface ParsedSavingsAccountSummary {
  bank: string
  year: string
  file: string
  type: TradeRepublicProductType
  name: string
  date: string
  /** Path of the year dump relative to the dump base dir (`<bank>/<year>/products.json`). */
  dumpPath: string
}

/** Outcome of parsing every local Trade Republic copy under the source dir. */
export interface TradeRepublicParseRunResult {
  productCount: number
  failedCount: number
  ignoredCount: number
  products: ParsedSavingsAccountSummary[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}
