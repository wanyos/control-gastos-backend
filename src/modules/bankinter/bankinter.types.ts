/** Whether a movement is money in (`ingreso`) or money out (`gasto`). */
export type MovimientoTipo = 'ingreso' | 'gasto'

/**
 * A single parsed movement from a Bankinter statement row. The fields mirror the
 * real Bankinter export columns: `Fecha contable | Fecha valor | Descripción |
 * Importe | Saldo | Divisa` (the parser maps them by header name, not position).
 */
export interface MovimientoParseado {
  /** Accounting date, ISO `YYYY-MM-DD`. */
  fechaContable: string
  /** Value date, ISO `YYYY-MM-DD`. */
  fechaValor: string
  /** Description column ("Descripción"). */
  descripcion: string
  /** Signed amount in euros (negative = money out). */
  importe: number
  /** Balance after the movement ("Saldo"), in euros. */
  saldo: number
  /** Currency of the movement ("Divisa"), e.g. `'EUR'`; `''` when absent. */
  divisa: string
  /** Derived from the sign of `importe`. */
  tipo: MovimientoTipo
}

/** A statement row that could not be interpreted; it is reported, never dropped. */
export interface FilaNoReconocida {
  /** 1-based row number in the sheet. */
  fila: number
  /** Human-readable reason the row was not interpretable. */
  motivo: string
}

/** Full result of parsing a Bankinter `.xlsx` statement. */
export interface BankinterParseResult {
  banco: 'bankinter'
  /** IBAN extracted from the metadata preamble; `''` when it cannot be found. */
  cuentaIban: string
  movimientos: MovimientoParseado[]
  noReconocidas: FilaNoReconocida[]
}

/** Summary of one local `.xlsx` copy that was parsed and dumped to JSON. */
export interface ParsedFileSummary {
  bank: string
  year: string
  file: string
  cuentaIban: string
  /** Number of parsed movements. */
  movimientos: number
  /** Number of rows that could not be interpreted. */
  noReconocidas: number
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
