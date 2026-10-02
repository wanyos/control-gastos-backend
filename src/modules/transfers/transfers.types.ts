/**
 * Types of the transfer detection (feature 40) and of the manual link (F44):
 * the candidates the pairing works on, the report every import run carries
 * back, and the shapes of the manual link endpoints.
 *
 * The detection itself still has NO endpoint: the importer calls it after
 * its file loop, and its result travels inside the import report. What DOES
 * have an endpoint since F44 is the manual writer of the link
 * (`POST /api/transfers`, `DELETE /api/transfers/:transferId`). Since F49 there
 * are also two reads: the list of pairs (`GET /api/transfers`) and the doubtful
 * groups computed on request (`GET /api/transfers/ambiguous`), which never writes.
 */
import type { SerializedMovement } from '../movements/movements.types.js'

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
  /**
   * The transferId this movement carried until its pair was undone by hand
   * (F44), or null. Two candidates sharing the same non-null value are never
   * linked again by the detection; each stays eligible for anyone else.
   */
  undoneTransferId: string | null
}

/** Body of `POST /api/transfers`: the two legs to link, by id (F44). */
export interface LinkTransferBody {
  movementIds: [number, number]
}

/** Params of `DELETE /api/transfers/:transferId` (F44). */
export interface TransferIdParams {
  transferId: string
}

/** What `POST /api/transfers` answers with a 201 (F44). */
export interface LinkTransferResult {
  transferId: string
  movements: [SerializedMovement, SerializedMovement]
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

/**
 * One pair of `GET /api/transfers` (F49 R12): the shared transferId and its two
 * legs serialized like any movement, the `expense` first and the `income` after.
 */
export interface TransferPair {
  transferId: string
  movements: [SerializedMovement, SerializedMovement]
}

/** What `GET /api/transfers` answers (F49 R12): every pair, unpaginated. */
export interface TransferPairsResponse {
  pairs: TransferPair[]
}

/**
 * What `GET /api/transfers/ambiguous` answers (F49 R14): the same two fields,
 * with the same shape, that the import report carries in `transfers`, computed
 * at the moment of the request.
 */
export type AmbiguousTransfersResponse = Pick<
  TransferDetectionResult,
  'ambiguousCount' | 'ambiguous'
>
