import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * N26 does NOT declare its own movement shape: the contract every bank parser
 * returns lives in `src/lib/parsed-statement.ts` (feature 11, ADR-013) and a
 * guardian of `architecture.test.ts` rejects any second declaration of
 * `ParsedMovement`, `UnparsedRow` or `ParsedMovementType`.
 *
 * The export has ELEVEN columns and the contract has room for five of them. The
 * ones that have no place in it are NOT invented as new fields (feature 18,
 * criterion 11): the counterparty IBAN, the bank's own transaction type, the
 * account alias, the original amount, its currency and the exchange rate stay in
 * the file. What the movements carry:
 *
 * - `Booking Date` → `bookingDate` and `Value Date` → `valueDate`, filled
 *   SEPARATELY: they differ often enough that copying one into the other loses a
 *   datum.
 * - `Partner Name` (+ `Payment Reference` when it is written) → `description`.
 *   This bank has no «concept» column, so the description is composed; see
 *   `n26.statement.parser.ts` for the rule and the reason.
 * - `Amount (EUR)` → `amount`, sign included, and the currency of the movement
 *   is read from THAT column's own header.
 *
 * Two data this bank does not report at all: `balance` on every movement (there
 * is no balance column and none is ever accumulated) and the IBAN of the
 * account, which the human writes by hand as a labelled preamble line, exactly
 * as he already does on the other bank of this repo whose export omits it. The
 * balance OF THE ACCOUNT comes from the second such line. Both are `null` when
 * their line is absent, which is not a failure.
 */
export type N26StatementResult = ParsedStatement<'n26'>

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
   * balance, which this bank never reports.
   */
  accountBalance: number | null
  /** Number of parsed movements. */
  movements: number
  /** Number of rows that could not be interpreted. */
  unparsedRows: number
  /** Path of the JSON dump relative to the dump base dir (`<bank>/<year>/<file>.json`). */
  dumpPath: string
}

/** Outcome of parsing every local N26 copy under the source dir. */
export interface N26ParseRunResult {
  parsedCount: number
  failedCount: number
  ignoredCount: number
  statements: ParsedStatementSummary[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}
