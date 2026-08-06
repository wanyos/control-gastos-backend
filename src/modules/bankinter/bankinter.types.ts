/** Whether a movement is money in (`income`) or money out (`expense`). */
export type ParsedMovementType = 'income' | 'expense'

/**
 * A single parsed movement from a Bankinter statement row. The fields mirror the
 * real Bankinter export columns: `Fecha contable | Fecha valor | Descripción |
 * Importe | Saldo | Divisa` (the parser maps them by header name, not position).
 */
export interface ParsedMovement {
  /** Accounting date, ISO `YYYY-MM-DD`. */
  bookingDate: string
  /** Value date, ISO `YYYY-MM-DD`. */
  valueDate: string
  /** Description column ("Descripción"). */
  description: string
  /** Signed amount in euros (negative = money out). */
  amount: number
  /** Balance after the movement ("Saldo"), in euros. */
  balance: number
  /** Currency of the movement ("Divisa"), e.g. `'EUR'`; `''` when absent. */
  currency: string
  /** Derived from the sign of `amount`. */
  type: ParsedMovementType
}

/** A statement row that could not be interpreted; it is reported, never dropped. */
export interface UnparsedRow {
  /** 1-based row number in the sheet. */
  row: number
  /** Human-readable reason the row was not interpretable. */
  reason: string
}

/** Full result of parsing a Bankinter `.xlsx` statement. */
export interface BankinterParseResult {
  bank: 'bankinter'
  /** IBAN extracted from the metadata preamble; `''` when it cannot be found. */
  accountIban: string
  movements: ParsedMovement[]
  unparsedRows: UnparsedRow[]
}

/** Summary of one local `.xlsx` copy that was parsed and dumped to JSON. */
export interface ParsedFileSummary {
  bank: string
  year: string
  file: string
  accountIban: string
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
