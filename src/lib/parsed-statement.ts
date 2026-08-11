/**
 * THE CONTRACT every bank parser returns (feature 11).
 *
 * The norm "one parser per bank" (docs/conventions.md §Parsers de banco) forbids
 * sharing the code that READS a format, because a format changes without notice.
 * The SHAPE of the output is the opposite: the stable interface each bank adapts
 * to on its own, and what lets the importer avoid knowing ~7 different shapes.
 *
 * It is derived from the data model but it is NOT the data model: it knows
 * nothing about accounts, internal ids, the bookkeeping columns the database
 * adds when importing, nor whether a movement already exists. It represents THE
 * FILE. Data a given bank does not report is `null`, never a zero or an empty
 * string.
 *
 * This module holds no I/O, no database client and no bank-specific knowledge.
 */

/** Money in (`income`), money out (`expense`) or neither (`neutral`, amount 0). */
export type ParsedMovementType = 'income' | 'expense' | 'neutral'

/** A single movement read from a bank file. */
export interface ParsedMovement {
  /** Accounting date, ISO `YYYY-MM-DD`. */
  bookingDate: string
  /** Value date, ISO `YYYY-MM-DD`. */
  valueDate: string
  /** Description of the movement, as the bank writes it. */
  description: string
  /** Signed amount (negative = money out). */
  amount: number
  /**
   * Running balance after the movement, or `null` when the file does not carry
   * one. `null` means "not in the file": it is never a `0`, which is a real
   * balance (MyInvestor reports no balance at all).
   */
  balance: number | null
  /** Currency of the movement, e.g. `'EUR'`; `''` when the file has no column. */
  currency: string
  /** Derived from the sign of `amount`, in a single place (see below). */
  type: ParsedMovementType
  /**
   * Position of the movement inside its `bookingDate`: `1` is the OLDEST
   * movement of that day and the number grows towards the most recent one of
   * the same day (it is not the order of appearance in the file). Each parser
   * emits it already normalized: the direction in which a bank exports its file
   * is the bank's own knowledge, so computing it in the importer would make the
   * importer bank-specific.
   *
   * IMPORTANT for whoever imports this (feature 12): only PARSED movements are
   * numbered. A row that ended up in `unparsedRows` consumes no number, so the
   * sequence of a day is always `1..movements-of-that-day` with no holes. If
   * that row is recovered later (fixed parser, re-download), the day is
   * renumbered and the previous numbers of that day no longer match the ones
   * already stored.
   */
  daySequence: number
}

/** A row that could not be interpreted; it is reported, never dropped. */
export interface UnparsedRow {
  /** 1-based row number in the file. */
  row: number
  /** Human-readable reason the row was not interpretable. */
  reason: string
}

/** Full result of parsing one bank statement file. */
export interface ParsedStatement<Bank extends string = string> {
  /** Normalized bank name (same slug as its Drive folder). */
  bank: Bank
  /**
   * IBAN of the account the statement belongs to, or `null` when the file does
   * not carry it (MyInvestor does not). `null` means "not in the file", never
   * an empty string.
   */
  accountIban: string | null
  movements: ParsedMovement[]
  unparsedRows: UnparsedRow[]
}

/** A movement before its position inside the day is known. */
export type ParsedMovementDraft = Omit<ParsedMovement, 'daySequence'>

/** The direction in which a bank writes its file: bank-specific knowledge. */
export type StatementOrder = 'newest-first' | 'oldest-first'

/**
 * Numbers each movement inside its `bookingDate` (`1` = the oldest of the day),
 * whatever the direction in which the bank exports the file. The array order is
 * preserved: only `daySequence` is added.
 *
 * Shared because it is normalization of the contract, not format reading: what
 * stays in each bank module is the single argument saying how that bank exports
 * (Bankinter: most recent first).
 */
export function assignDaySequence(
  drafts: ParsedMovementDraft[],
  fileOrder: StatementOrder,
): ParsedMovement[] {
  const seenPerDay = new Map<string, number>()
  const totalPerDay = new Map<string, number>()

  for (const draft of drafts) {
    totalPerDay.set(draft.bookingDate, (totalPerDay.get(draft.bookingDate) ?? 0) + 1)
  }

  return drafts.map((draft) => {
    const position = (seenPerDay.get(draft.bookingDate) ?? 0) + 1
    seenPerDay.set(draft.bookingDate, position)
    const daySequence =
      fileOrder === 'oldest-first'
        ? position
        : (totalPerDay.get(draft.bookingDate) ?? position) - position + 1
    return { ...draft, daySequence }
  })
}
