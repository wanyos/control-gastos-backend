/**
 * Types of the transfer detection (feature 40): the candidates the pairing
 * works on and the report every import run carries back.
 *
 * The detection has NO endpoint: both import ways call it after their file
 * loop, and its result travels inside the import report (design §1, §4).
 */

/** One movement the pairing may link: `transferId` still null, type not neutral. */
export interface TransferCandidate {
  id: number
  accountId: number
  accountAlias: string
  type: 'expense' | 'income'
  /** Decimal string (`toFixed(2)`), as amounts travel in the whole project. */
  amount: string
  bookingDate: Date
  /** Position inside its `bookingDate` (1 = first); breaks date ties in the pairing order (F41). */
  daySequence: number | null
  description: string
}

/**
 * Movements that have valid candidates but form no unambiguous pair (R5): one
 * connected group per report entry, so the human sees together the movements
 * that block each other (R6).
 */
export interface AmbiguousTransferGroup {
  amount: string
  movements: Array<{
    id: number
    accountId: number
    accountAlias: string
    type: 'expense' | 'income'
    /** `YYYY-MM-DD`: the column is date-only and the report keeps it that way. */
    bookingDate: string
    description: string
  }>
}

/** What one detection run did, always present in the import report. */
export interface TransferDetectionResult {
  pairsCreated: number
  /** Groups, not movements. */
  ambiguousCount: number
  ambiguous: AmbiguousTransferGroup[]
  /** R15: present only when the detection failed; the import itself stands. */
  error?: { code: string; message: string }
}
