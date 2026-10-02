import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * N26 does NOT declare its own movement shape: the contract every bank parser
 * returns lives in `src/lib/parsed-statement.ts` (feature 11, ADR-013) and a
 * guardian of `architecture.test.ts` rejects any second declaration of
 * `ParsedMovement`, `UnparsedRow` or `ParsedMovementType`.
 *
 * The export has ELEVEN columns and the contract has room for five of them. The
 * ones that have no place in it are NOT invented as new fields (feature 18,
 * criterion 11): the counterparty IBAN, the bank's own transaction type, the
 * account alias, the original amount, its currency and the exchange rate stay in
 * the file. What the movements carry:
 *
 * - `Booking Date` → `bookingDate` and `Value Date` → `valueDate`, filled
 *   SEPARATELY: they differ often enough that copying one into the other loses a
 *   datum.
 * - `Partner Name` (+ `Payment Reference` when it is written) → `description`.
 *   This bank has no «concept» column, so the description is composed; see
 *   `n26.statement.parser.ts` for the rule and the reason.
 * - `Amount (EUR)` → `amount`, sign included, and the currency of the movement
 *   is read from THAT column's own header.
 *
 * Two data this bank does not report at all: `balance` on every movement (there
 * is no balance column and none is ever accumulated) and the IBAN of the
 * account, which the human writes by hand as a labelled preamble line, exactly
 * as he already does on the other bank of this repo whose export omits it. The
 * balance OF THE ACCOUNT comes from the second such line. Both are `null` when
 * their line is absent, which is not a failure.
 */
export type N26StatementResult = ParsedStatement<'n26'>
