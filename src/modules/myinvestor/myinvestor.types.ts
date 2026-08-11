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
 * Two data this bank does NOT report, and that are therefore always `null`:
 * `balance` on every movement (the file has no balance column) and
 * `accountIban` on the result (the file has no preamble). `null` means "not in
 * the file": never a `0`, never an empty string, and never an extra per-bank
 * flag announcing it (ADR-013 discarded `providesBalance`).
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
  /** Always `null` for this bank: the statement carries no IBAN. */
  accountIban: string | null
  /** Number of parsed movements. */
  movements: number
  /** Number of rows that could not be interpreted. */
  unparsedRows: number
  /** Path of the JSON dump relative to the dump base dir (`<bank>/<year>/<file>.json`). */
  dumpPath: string
}

/** Outcome of parsing every local MyInvestor copy under the source dir. */
export interface MyinvestorParseRunResult {
  parsedCount: number
  failedCount: number
  ignoredCount: number
  statements: ParsedStatementSummary[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}
