import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * MyInvestor does NOT declare its own movement shape: the contract every bank
 * parser returns lives in `src/lib/parsed-statement.ts` (feature 11, ADR-013)
 * and a guardian of `architecture.test.ts` rejects any second declaration of
 * `ParsedMovement`, `UnparsedRow` or `ParsedMovementType` inside `src/`.
 *
 * The statement columns this parser maps by header name (not by position) are
 * `Fecha de operación | Fecha de valor | Concepto | Importe | Divisa`, which
 * fill `bookingDate | valueDate | description | amount | currency`.
 *
 * One datum this bank does NOT report, and that is therefore always `null`:
 * `balance` on every movement (the file has no balance column). `null` means "not
 * in the file": never a `0`, never an empty string, and never an extra per-bank
 * flag announcing it (ADR-013 discarded `providesBalance`).
 *
 * The two the bank does not report either but the HUMAN writes by hand, as
 * labelled preamble lines above the header: `accountIban` (feature 12) and
 * `accountBalance` (feature 16, the balance of the account at the date of the
 * statement). Both are `null` when their line is absent, which is not a failure.
 */
export type MyinvestorStatementResult = ParsedStatement<'myinvestor'>

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

/** Summary of one local statement copy that was parsed and dumped to JSON. */
export interface ParsedStatementSummary {
  bank: string
  year: string
  file: string
  /** `null` unless the file carries the hand-written `iban;` preamble line. */
  accountIban: string | null
  /**
   * Balance of the ACCOUNT at the date of the statement, from the hand-written
   * `saldo;` preamble line; `null` when it is absent. Not the per-movement
   * balance, which this bank never reports (feature 16).
   */
  accountBalance: number | null
  /** Number of parsed movements. */
  movements: number
  /** Number of rows that could not be interpreted. */
  unparsedRows: number
  /** Path of the JSON dump relative to the dump base dir (`<bank>/<year>/<file>.json`). */
  dumpPath: string
}

/**
 * The four investment products this bank holds (feature 9 `InvestmentProductType`).
 * A fund, an ETF and a managed portfolio carry exactly the same fields; a deposit
 * is the only different shape.
 */
export type InvestmentProductType = 'fund' | 'etf' | 'managed_portfolio' | 'deposit'

/** The monthly photo of a product that fluctuates; absent on a deposit. */
export interface ParsedValuation {
  invested: number
  marketValue: number
  /** Signed: negative while the product loses money. */
  gain: number
  /** Percentage, never a fraction: `7.25` is 7,25 %. Signed. */
  gainPercent: number
  /** APART from `marketValue`, never added into it nor into any total (R36). */
  uninvestedCash: number | null
}

/** The conditions of a deposit, written once when it is signed. */
export interface ParsedDepositTerms {
  principal: number
  /** The APR that APPLIES, in percentage (`3` is 3 %); the commercial one is not kept. */
  interestRate: number
  expectedGain: number
  /** ISO `YYYY-MM-DD`. */
  maturityDate: string
}

/** One investment product read from one hand-written `.json` file. */
export interface ParsedProduct {
  bank: 'myinvestor'
  /** Provenance: the source file name. It never decides the name nor the date. */
  file: string
  type: InvestmentProductType
  name: string
  /** ISO `YYYY-MM-DD`: the day of the photo (of the note, on a deposit). */
  date: string
  currency: string
  /**
   * ISO `YYYY-MM-DD`: the day the product was opened. MANDATORY on the four types
   * (feature 15, decision of the human of 2026-08-13), so it is a `string` and
   * never `null`: a product with no opening date is a FAILED file, not a product
   * with a hole. Asymmetric with `closedAt` on purpose — every product was opened,
   * only some are closed.
   */
  openedAt: string
  /** ISO `YYYY-MM-DD`; `null` means alive. Missing the file does NOT close it. */
  closedAt: string | null
  /** `null` on a deposit. */
  valuation: ParsedValuation | null
  /** `null` on the other three types. */
  depositTerms: ParsedDepositTerms | null
}

/** The dump of every product of one year: one `products.json` per year (R53). */
export interface MyinvestorProductsResult {
  bank: 'myinvestor'
  year: string
  products: ParsedProduct[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}

/** Summary of one parsed product, as the run result reports it. */
export interface ParsedProductSummary {
  bank: string
  year: string
  file: string
  type: InvestmentProductType
  name: string
  date: string
  /** Path of the year dump relative to the dump base dir (`<bank>/<year>/products.json`). */
  dumpPath: string
}

/** Outcome of parsing every local MyInvestor copy under the source dir. */
export interface MyinvestorParseRunResult {
  parsedCount: number
  productCount: number
  failedCount: number
  ignoredCount: number
  statements: ParsedStatementSummary[]
  products: ParsedProductSummary[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}
