/**
 * The three kinds of deposit movement a statement line can be (feature 57).
 * Declared here as a plain union and not imported from the investments module:
 * a bank module imports no other module (`architecture.test.ts`), and the
 * structural type is the same `DepositMovementKind` the registry expects.
 */
export type MyinvestorDepositMovementKind = 'opening' | 'cancellation' | 'maturity'

/**
 * The three statement descriptions of a DEPOSIT in a MyInvestor statement
 * (feature 57): its opening, its early cancellation and its maturity. The text
 * is knowledge of this bank, so it lives here and reaches the investments
 * module through the registry of `src/app.ts` (ADR-015): the investments
 * service may not name a bank.
 *
 * The SQL migration of feature 57 that unmarks the deposit movements repeats
 * these three prefixes, because a migration cannot call code: if one changes
 * here, change it there too.
 */
const depositPrefixes: ReadonlyArray<readonly [string, MyinvestorDepositMovementKind]> = [
  ['APERTURA DEP', 'opening'],
  ['CANCELACION DEP', 'cancellation'],
  ['INTERESES DEP', 'maturity'],
]

/**
 * Which kind of deposit movement a MyInvestor description is, or `null` when it
 * is none (feature 57, R1). Only the prefix is read, after the leading spaces.
 * The number that follows it repeats between deposits, so nothing is ever
 * deduced from it. The `type` of the movement is checked by the caller, not
 * here: this function only knows the text of the bank.
 */
export function classifyMyinvestorDepositMovement(
  description: string,
): MyinvestorDepositMovementKind | null {
  const text = description.trimStart()
  for (const [prefix, kind] of depositPrefixes) {
    if (text.startsWith(prefix)) return kind
  }
  return null
}

/**
 * Recognizes the statement description of a DEPOSIT MATURITY in a MyInvestor
 * statement (feature 50). Since feature 57 it reads the same list of prefixes
 * as `classifyMyinvestorDepositMovement`, so the two can never disagree.
 *
 * If the bank changes the text, a matured deposit comes out as "not found",
 * never with a false figure.
 */
export function isMyinvestorDepositMaturity(description: string): boolean {
  return classifyMyinvestorDepositMovement(description) === 'maturity'
}
