import type { UnparsedRow } from '../../lib/parsed-statement.js'
import type { BalanceMismatch } from './import.balance.service.js'

/**
 * THE SHAPES of the warnings an import leaves behind (feature 48).
 *
 * A warning is one of exactly two things: a row of a statement file the parser
 * could not read, or a descuadre one of the two checks of feature 32 found.
 * Nothing else is a warning here: doubtful transfers and clashing
 * categorization rules are explicitly out (decisions.md).
 *
 * What is stored is a FACT of the moment it was found: the amounts are the ones
 * that were computed then and are never recalculated when read (ADR-031).
 */

/** The statement file a warning came out of: bank slug, year folder and name. */
export interface WarningFileRef {
  bank: string
  year: string
  name: string
}

/** What one imported file produced, straight from its report. */
export interface ImportWarningsInput {
  unparsedRows: UnparsedRow[]
  balanceMismatches: BalanceMismatch[]
}

/**
 * A stored unreadable row as it leaves the backend. `row` and `reason` are
 * EXACTLY the fields the frontend already receives inside the import report
 * (`UnparsedRow`), so whoever renders the modal renders this too.
 */
export interface SerializedUnparsedRow {
  id: number
  file: WarningFileRef
  row: number
  reason: string
  /** When it was stored for the first time, ISO UTC. */
  detectedAt: string
}

/**
 * A stored descuadre as it leaves the backend. `date`, `computed`, `fromFile`,
 * `difference` and `check` are the same fields, with the same names and the same
 * decimal-string format, as the `BalanceMismatch` of the import report.
 */
export interface SerializedBalanceMismatch {
  id: number
  file: WarningFileRef
  accountId: number
  accountAlias: string
  /** `YYYY-MM-DD` of the compared point. */
  date: string
  computed: string
  fromFile: string
  /** `computed − fromFile`, derived when serializing: it is never stored. */
  difference: string
  check: BalanceMismatch['check']
  status: 'pending' | 'reviewed'
  note: string | null
  /** When it was stored for the first time, ISO UTC. */
  detectedAt: string
  /** The last import that produced it again, ISO UTC. */
  lastSeenAt: string
}

/** The answer of the query: two separate lists plus their counters. */
export interface ImportWarningsReport {
  unparsedRows: SerializedUnparsedRow[]
  balanceMismatches: SerializedBalanceMismatch[]
  counts: {
    unparsedRows: number
    balanceMismatches: number
  }
}

/**
 * What the human changes of a descuadre. Both properties are optional, and at
 * least one must arrive: an empty body is rejected by the HTTP schema (R14),
 * never applied as a no-op.
 */
export interface ReviewBalanceMismatchPatch {
  status?: 'pending' | 'reviewed'
  /** `null` clears the note; `undefined` leaves the stored one untouched (R12). */
  note?: string | null
}
