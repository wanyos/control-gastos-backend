import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * This bank does NOT declare its own movement shape: the contract every bank
 * parser returns lives in `src/lib/parsed-statement.ts` (feature 11, ADR-013) and
 * a guardian of `architecture.test.ts` rejects any second declaration of
 * `ParsedMovement`, `UnparsedRow` or `ParsedMovementType`.
 *
 * The export has TEN columns. What the movements carry (feature 46):
 *
 * - `Fecha de finalización` → `bookingDate` and `Fecha de inicio` → `valueDate`,
 *   the day only (the time is discarded).
 * - `Descripción` → `description`, as written.
 * - `Importe` → `amount`, sign included.
 * - `Divisa` → `currency`.
 * - `Saldo` → `balance`, the running balance of that line.
 * - `State` decides whether the row is a movement at all.
 *
 * `Tipo`, `Producto` and `Comisión` are not read. The balance OF THE ACCOUNT
 * (`accountBalance`) is always `null`: the file already carries the balance on
 * every line and no `saldo;` line is read. The IBAN of the account comes from the
 * hand-written `iban;` line, and is `null` when it is absent.
 */
export type RevolutStatementResult = ParsedStatement<'revolut'>
