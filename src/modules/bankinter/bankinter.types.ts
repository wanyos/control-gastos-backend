import type { ParsedStatement } from '../../lib/parsed-statement.js'

/**
 * Bankinter does NOT declare its own movement shape: the contract every bank
 * parser returns lives in `src/lib/parsed-statement.ts` (feature 11). What stays
 * here is only what is Bankinter's own: the bank literal.
 *
 * The real export columns this parser maps by header name (not by position) are
 * `Fecha contable | Fecha valor | Descripción | Importe | Saldo | Divisa`, which
 * fill `bookingDate | valueDate | description | amount | balance | currency`.
 * `accountIban` comes from the preamble line and is `null` when it is absent.
 * `accountBalance` (the balance of the ACCOUNT at the date of the statement,
 * feature 16) is always `null` here: this export has no such line. The `Saldo`
 * COLUMN it does have is a different datum — the running balance of each row —
 * and travels, as always, in `balance` of each movement.
 */
export type BankinterParseResult = ParsedStatement<'bankinter'>
