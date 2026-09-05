/**
 * Types of the investments layer (feature 26, ADR-026).
 *
 * This is the contract between a PRODUCT file and the database, the twin of
 * `lib/parsed-statement.ts` for statements: the bank module produces it and the
 * importer carries it, so neither of the two has to know the other. It names no
 * bank on purpose -- which bank a file belongs to is said by its FOLDER, and the
 * registry that binds slug to parser is built in `src/app.ts` (ADR-015).
 */

import type { InvestmentProductType } from '../../generated/prisma/client.js'

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

// ---------------------------------------------------------------------------
// Read side (feature 39): the shapes `GET /api/investments/overview` answers
// with. The write side above stays untouched -- this is the first reader of
// the layer features 26 and 29 only wrote.
// ---------------------------------------------------------------------------

/**
 * Querystring of `GET /api/investments/overview` (feature 39). All three are
 * optional and combinable; a missing `month` falls back to the current month
 * (UTC), same as `GET /api/overview`.
 */
export interface InvestmentsOverviewQuery {
  month?: string
  productId?: number
  type?: InvestmentProductType
}

/** The month the view was computed over, with its resolved date range. */
export interface InvestmentsOverviewPeriod {
  /** `YYYY-MM`, either the one asked for or the current month. */
  month: string
  /** `YYYY-MM-DD`, first day of the month (inclusive). */
  from: string
  /** `YYYY-MM-DD`, last day of the month (inclusive). */
  to: string
}

/**
 * A `Valuation` row exactly as stored: the five amounts are serialized
 * verbatim (rule 4 of ADR-012 -- `gain` is NEVER derived from
 * `marketValue - invested`, and nothing is rounded).
 */
export interface SerializedValuation {
  /** `YYYY-MM-DD` of the photo. */
  date: string
  invested: string
  marketValue: string
  gain: string | null
  gainPercent: string | null
  /** APART from `marketValue`: never added into anything (ADR-012). */
  uninvestedCash: string | null
}

/**
 * How much the product moved between two photos, measured on the `gain` /
 * `gainPercent` the human writes -- never on `marketValue`, which would count
 * a monthly contribution as a market rise (decisions.md 🔴 2). Each component
 * is `null` when one of its two inputs is missing (R4): a gap is a gap.
 */
export interface ValuationChange {
  /** Euros, signed: `gain` of the period photo minus the previous one. */
  amount: string | null
  /** Percent POINTS, signed: difference of the two `gainPercent`. */
  percentPoints: string | null
}

/** Identity every product of the view carries, whatever its type. */
export interface InvestmentProductCommon {
  id: number
  bank: string
  name: string
  currency: string
  /** `YYYY-MM-DD`, or `null` when unknown. */
  openedAt: string | null
  /** `YYYY-MM-DD`; `null` means alive. */
  closedAt: string | null
}

/**
 * A product that FLUCTUATES (fund / ETF / managed portfolio). `valuation` is
 * the photo of the period or `null` when that month's file was never uploaded;
 * the previous photo, when shown, always carries its own date -- it never
 * stands in for the missing one (R7).
 */
export interface FluctuatingProductOverview extends InvestmentProductCommon {
  type: 'fund' | 'etf' | 'managed_portfolio'
  valuation: SerializedValuation | null
  previousValuation: SerializedValuation | null
  change: ValuationChange | null
}

/** The four conditions a deposit was signed with, exactly as stored. */
export interface DepositConditions {
  principal: string | null
  /** The APR that applies, AS A PERCENTAGE (`2.75` is 2,75 %). */
  interestRate: string | null
  expectedGain: string | null
  /** `YYYY-MM-DD`. */
  maturityDate: string | null
}

/**
 * A deposit does not fluctuate and keeps no series (ADR-012): it has NO
 * `valuation`, `previousValuation` or `change` fields at all, so a `null`
 * can never be misread as "its photo is missing".
 */
export interface DepositProductOverview extends InvestmentProductCommon {
  type: 'deposit'
  conditions: DepositConditions
}

/** A `SavingsSnapshot` row exactly as stored (its five amounts are NOT NULL). */
export interface SerializedSavingsSnapshot {
  /** `YYYY-MM-DD` of the photo (the day the interest was paid). */
  date: string
  openingBalance: string
  moneyIn: string
  moneyOut: string
  interest: string
  balance: string
}

/**
 * A remunerated account: its photo of the period, or `null` when that month's
 * file was never uploaded. Its `interest` counts as gain of the month the
 * photo's `date` falls in -- the month it was paid.
 */
export interface SavingsProductOverview extends InvestmentProductCommon {
  type: 'savings_account'
  snapshot: SerializedSavingsSnapshot | null
}

/** The shape of each product depends on its type (design §6). */
export type InvestmentProductOverview =
  FluctuatingProductOverview | DepositProductOverview | SavingsProductOverview

/**
 * Why a product with a series could not enter the sum of the period (R8).
 * Closed enum, part of the contract; a deposit never gets one -- it has no
 * series to miss.
 */
export type PeriodGainExclusionReason =
  'no_photo_in_period' | 'no_previous_photo' | 'gain_not_reported'

/** One product left out of the sum, with its machine-readable reason. */
export interface ExcludedFromPeriodGain {
  productId: number
  name: string
  reason: PeriodGainExclusionReason
}

/**
 * What was gained in the period: the sum of the computable changes of the
 * fluctuating products plus the interest paid inside it. `excluded` is what
 * keeps the sum honest -- what could not be counted is listed, never silently
 * counted as zero (decisions.md 🔴 3).
 */
export interface PeriodGain {
  total: string
  fluctuation: string
  interest: string
  excluded: ExcludedFromPeriodGain[]
}

/** Shape of the `GET /api/investments/overview` response (feature 39). */
export interface InvestmentsOverviewResponse {
  period: InvestmentsOverviewPeriod
  products: InvestmentProductOverview[]
  periodGain: PeriodGain
}

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
