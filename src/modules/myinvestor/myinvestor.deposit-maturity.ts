/**
 * Recognizes the statement description of a DEPOSIT MATURITY in a MyInvestor
 * statement (feature 50). The text is knowledge of this bank, so it lives here
 * and reaches the investments module through the registry of `src/app.ts`
 * (ADR-015): the investments service may not name a bank.
 *
 * Only the prefix is read. The number that follows it repeats between deposits,
 * so nothing is ever deduced from it. If the bank changes the text, a matured
 * deposit comes out as "not found", never with a false figure.
 */
export function isMyinvestorDepositMaturity(description: string): boolean {
  return description.trimStart().startsWith('INTERESES DEP')
}
