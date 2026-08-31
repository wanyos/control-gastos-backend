import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * Openbank does NOT declare its own movement shape: the contract every bank
 * parser returns lives in `src/lib/parsed-statement.ts` (feature 11, ADR-013)
 * and a guardian of `architecture.test.ts` rejects any second declaration of
 * `ParsedMovement`, `UnparsedRow` or `ParsedMovementType`.
 *
 * This bank is the one that carries MOST of what the contract can hold, and two
 * of those data are deliberately left out:
 *
 * - Its table has five columns and every one of them is used except the last:
 *   the two dates → `bookingDate` / `valueDate`, the concept → `description`
 *   (whole, never split) and the amount → `amount`, sign included.
 * - The fifth column is the RUNNING BALANCE after each movement, and it is the
 *   only file of this project that reports it. It stays `null` all the same
 *   (decision of the human, feature 19): ADR-013 is not touched here, and the
 *   datum is described in `progress/implementations/openbank-statement.md` so
 *   the day it gets decided nobody has to rediscover that it exists.
 * - There is NO currency column: the movements carry `''`, never an invented
 *   `EUR`. The only currency in the file is the one glued to the balance of the
 *   preamble, and it is not propagated to 200 rows.
 *
 * What the preamble gives, and what it does not: the balance OF THE ACCOUNT is
 * read from its `Saldo:` row (this is the first bank where the human does not
 * write it by hand), while the account number it prints is a CCC and NOT an
 * IBAN — no IBAN is ever derived from it. The IBAN is written by hand, once, as
 * an HTML comment on the first line of the file.
 */
export type OpenbankStatementResult = ParsedStatement<'openbank'>

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
  /** `null` unless the file carries the hand-written `<!-- iban;… -->` comment. */
  accountIban: string | null
  /**
   * Balance of the ACCOUNT at the date of the statement, read from the `Saldo:`
   * row of the file's own preamble; `null` when that row is absent. Not the
   * per-movement balance, which this bank reports on every row and which this
   * parser DOES keep since feature 31 (it dropped it under feature 19; see the
   * header of `openbank.statement.parser.ts`). Two different data, and this
   * field is only ever the first of them.
   */
  accountBalance: number | null
  /** Number of parsed movements. */
  movements: number
  /** Number of rows that could not be interpreted. */
  unparsedRows: number
  /** Path of the JSON dump relative to the dump base dir (`<bank>/<year>/<file>.json`). */
  dumpPath: string
}

/** Outcome of parsing every local Openbank copy under the source dir. */
export interface OpenbankParseRunResult {
  parsedCount: number
  failedCount: number
  ignoredCount: number
  statements: ParsedStatementSummary[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}
