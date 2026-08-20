/**
 * Types of the investments layer (feature 26, ADR-026).
 *
 * This is the contract between a PRODUCT file and the database, the twin of
 * `lib/parsed-statement.ts` for statements: the bank module produces it and the
 * importer carries it, so neither of the two has to know the other. It names no
 * bank on purpose -- which bank a file belongs to is said by its FOLDER, and the
 * registry that binds slug to parser is built in `src/app.ts` (ADR-015).
 */

/** What a remunerated-account file contributes, already validated by its parser. */
export interface SavingsSnapshotInput {
  /** Slug of the FOLDER the file came from, never of its contents (ADR-009). */
  bank: string
  /**
   * The identity of the account, written by hand and copied the same every
   * month. Nothing in the system generates or renumbers it, which is what makes
   * the reload idempotent (design §3).
   */
  name: string
  type: 'savings_account'
  currency: string
  /** ISO `YYYY-MM-DD`: the day the account was opened. */
  openedAt: string
  /** ISO `YYYY-MM-DD`; `null` means alive. */
  closedAt: string | null
  /** ISO `YYYY-MM-DD`: the day of the interest payment. Identity of the photo. */
  date: string
  openingBalance: number
  moneyIn: number
  moneyOut: number
  interest: number
  balance: number
}

/**
 * Twin of `BankParserAdapter`, for the files of a PRODUCT. It is a SECOND
 * registry and not a `kind` flag on the first one, so the union between "a
 * statement" and "a product photo" is resolved once, where the parser is picked,
 * instead of at every use (design §2).
 */
export interface ProductParserAdapter {
  /** Slug of the bank: the same normalized name as its Drive folder. */
  bank: string
  /** Extensions this parser reads, lowercase and with the dot. */
  extensions: string[]
  /** Throws `ValidationError` carrying the WHOLE reason when the file is wrong. */
  parse(fileName: string, content: Buffer): SavingsSnapshotInput
}

export type ProductParserRegistry = ProductParserAdapter[]

/**
 * What one product file left in the database. `created` is what tells "it has
 * been stored" apart from "the same thing has been stored again", which is the
 * only way the human can check the promise of R6 and R7.
 */
export interface ProductImportResult {
  product: {
    id: number
    bank: string
    name: string
    type: string
    /** `true` when this run created the product; `false` when it updated it. */
    created: boolean
  }
  snapshot: {
    /** ISO `YYYY-MM-DD` of the photo. */
    date: string
    /** `true` when this run added the month; `false` when it overwrote it. */
    created: boolean
  }
}
