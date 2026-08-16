import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * Bankinter does NOT declare its own movement shape: the contract every bank
 * parser returns lives in `src/lib/parsed-statement.ts` (feature 11). What stays
 * here is only what is Bankinter's own: the bank literal and the summaries of
 * its local parse run.
 *
 * The real export columns this parser maps by header name (not by position) are
 * `Fecha contable | Fecha valor | Descripción | Importe | Saldo | Divisa`, which
 * fill `bookingDate | valueDate | description | amount | balance | currency`.
 * `accountIban` comes from the preamble line and is `null` when it is absent.
 * `accountBalance` (the balance of the ACCOUNT at the date of the statement,
 * feature 16) is always `null` here: this export has no such line. The `Saldo`
 * COLUMN it does have is a different datum — the running balance of each row —
 * and travels, as always, in `balance` of each movement.
 */
export type BankinterParseResult = ParsedStatement<'bankinter'>

/** Summary of one local `.xlsx` copy that was parsed and dumped to JSON. */
export interface ParsedFileSummary {
  bank: string
  year: string
  file: string
  /** IBAN of the statement, or `null` when the file does not carry it. */
  accountIban: string | null
  /** Number of parsed movements. */
  movements: number
  /** Number of rows that could not be interpreted. */
  unparsedRows: number
  /** Path of the JSON dump relative to the dump base dir (`<bank>/<year>/<file>.json`). */
  dumpPath: string
}

/** A local copy whose parse or dump failed; isolated so the rest still run. */
export interface FailedParse {
  bank: string
  year: string
  file: string
  /** Sanitized error message (never leaks secrets). */
  error: string
}

/** Outcome of parsing every local Bankinter copy under the source dir. */
export interface ParseRunResult {
  parsedCount: number
  failedCount: number
  parsed: ParsedFileSummary[]
  failed: FailedParse[]
}
