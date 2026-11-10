/**
 * What `classifyMyinvestorInvestmentPurchase` answers on a movement it reads as
 * an investment purchase (feature 71). Declared here as a plain structural type
 * and not imported from the movements module: a bank module imports no other
 * module (`architecture.test.ts`), and the shape is the same the registry of
 * `src/app.ts` expects.
 */
export interface MyinvestorInvestmentPurchase {
  /** `true` only when the description ends in `@` and a number of shares (R10). */
  certain: boolean
}

/**
 * The fixed statement descriptions of this bank that are NOT an investment
 * purchase (feature 71, R1): the premium subscription, its VAT, the withholding
 * of the premium remuneration, the opening of a deposit and the two
 * contributions to the portfolio. Written in capitals and without accents: the
 * description is normalized the same way before comparing.
 *
 * `APERTURA DEP` is here although the deposit rule runs before this one in the
 * sums, so that this function is right on its own. A concept added here stops
 * being read as a purchase: it is how a real expense the rule took is given
 * back (decisions.md, point 4).
 */
const knownNonPurchasePrefixes: readonly string[] = [
  'SUSCRIPCION PREMIUM',
  'IVA SUSCRIPCION PREMIUM',
  'RET. REMUNERACION PREMIUM',
  'APERTURA DEP',
  'APORTACION AUTOMATICA CARTERA',
  'APORTACION A MI CARTERA',
]

/** A description ending in `@`, optional spaces and a number of shares (`@ 3`, `@2,5`). */
const sharesAtTheEnd = /@\s*\d+(?:[.,]\d+)?\s*$/

/**
 * Leading spaces out, accents out, capitals, repeated spaces as one: so that
 * `  Suscripción  premium` and `SUSCRIPCION PREMIUM` read the same.
 */
function normalize(description: string): string {
  return description
    .trimStart()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/**
 * Whether a MyInvestor description is an investment purchase (feature 71, R1,
 * R10), or `null` when it starts with one of the fixed concepts of the bank.
 * Everything else is a purchase: a product the application never saw included.
 *
 * The `type` and the `transferId` of the movement are checked by the caller,
 * not here: this function only knows the text of the bank.
 */
export function classifyMyinvestorInvestmentPurchase(
  description: string,
): MyinvestorInvestmentPurchase | null {
  const text = normalize(description)
  if (knownNonPurchasePrefixes.some((prefix) => text.startsWith(prefix))) return null
  return { certain: sharesAtTheEnd.test(description) }
}
