/**
 * Types of the investments layer (feature 26, ADR-026).
 *
 * This is the contract between a PRODUCT file and the database, the twin of
 * `lib/parsed-statement.ts` for statements: the bank module produces it and the
 * importer carries it, so neither of the two has to know the other. It names no
 * bank on purpose -- which bank a file belongs to is said by its FOLDER, and the
 * registry that binds slug to parser is built in `src/app.ts` (ADR-015).
 */

/**
 * What EVERY product file contributes, whatever its type (feature 29). It is the
 * part the writer needs before it knows which photo it is storing: the identity
 * of the product `(bank, name)`, what it is made of, and the date of the file.
 */
export interface ProductFileCommon {
  /** Slug of the FOLDER the file came from, never of its contents (ADR-009). */
  bank: string
  /**
   * The identity of the product, written by hand and copied the same every
   * month. Nothing in the system generates or renumbers it, which is what makes
   * the reload idempotent (design §3).
   */
  name: string
  currency: string
  /** ISO `YYYY-MM-DD`: the day the product was opened. */
  openedAt: string
  /** ISO `YYYY-MM-DD`; `null` means alive. */
  closedAt: string | null
  /**
   * ISO `YYYY-MM-DD`: the date the file is a photo OF. Together with the product
   * it is the identity of that photo, and both halves are written by the human:
   * no counter, no position, no autoincrement (the mistake of feature 25).
   */
  date: string
}

/** What a remunerated-account file contributes, already validated by its parser. */
export interface SavingsSnapshotInput extends ProductFileCommon {
  type: 'savings_account'
  openingBalance: number
  moneyIn: number
  moneyOut: number
  interest: number
  balance: number
}

/**
 * What a file of a product that FLUCTUATES contributes: a fund, an ETF or a
 * managed portfolio (feature 29). Its photo is a `Valuation`, one row per date.
 *
 * `valuation` is NOT optional here: the union is discriminated by `type`, so a
 * fund with no valuation cannot even be expressed. That is what moves "a fund
 * always brings its numbers" from a runtime check to a compile-time one.
 */
export interface ValuationInput extends ProductFileCommon {
  type: 'fund' | 'etf' | 'managed_portfolio'
  valuation: {
    invested: number
    marketValue: number
    /** Signed: negative while the product loses money. */
    gain: number
    /** Percentage, never a fraction: `7.25` is 7,25 %. Signed. */
    gainPercent: number
    /** APART from `marketValue`: never added into it nor into any total (ADR-012). */
    uninvestedCash: number | null
  }
}

/**
 * What a DEPOSIT file contributes (feature 29). Its four conditions are columns
 * of the PRODUCT and it has NO photo at all: a deposit does not fluctuate, it is
 * signed once with a rate and a maturity, so a `Valuation` row per month would
 * be the same four numbers copied over and over (ADR-012, and decision 2 of this
 * feature).
 */
export interface DepositInput extends ProductFileCommon {
  type: 'deposit'
  depositTerms: {
    principal: number
    /** The APR that APPLIES, AS A PERCENTAGE (`3` is 3 %), never a fraction. */
    interestRate: number
    expectedGain: number
    /** ISO `YYYY-MM-DD`. */
    maturityDate: string
  }
}

/**
 * Everything a product file can be, discriminated by `type` (feature 29). The
 * union is resolved ONCE, in `persistProductSnapshot`, and never again: no
 * caller of the importer asks a product what kind of thing it is.
 */
export type ProductFileInput = SavingsSnapshotInput | ValuationInput | DepositInput

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
  parse(fileName: string, content: Buffer): ProductFileInput
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
  /**
   * The photo this file left: a `SavingsSnapshot` row or a `Valuation` row.
   *
   * `null` on a DEPOSIT, and only there (feature 29): its conditions are columns
   * of the product itself and it keeps no series, so there is no photo to report.
   * A zeroed one would read as "a photo was stored", which is the lie ADR-012
   * exists to prevent.
   */
  snapshot: {
    /** ISO `YYYY-MM-DD` of the photo. */
    date: string
    /** `true` when this run added the month; `false` when it overwrote it. */
    created: boolean
  } | null
}
