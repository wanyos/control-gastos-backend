import { ValidationError } from '../../errors/app-error.js'
import { decodeUtf8Strict } from '../../lib/utf8.js'
import { parseTradeRepublicProduct } from './trade-republic.product.parser.js'
import type { ParsedSavingsAccount } from './trade-republic.types.js'

/**
 * Parses ONE hand-written account file from its raw bytes (feature 26).
 *
 * This is the entry the importer wires into its product registry from
 * `src/app.ts`: bytes in, one account out, an `AppError` carrying the WHOLE
 * reason when the file is wrong. It is the ONLY entry of this bank: its `.pdf`
 * statement keeps landing in the same folder every month and is read by nobody,
 * because this bank enters the system without a parser of what the bank emits
 * (ADR-024).
 *
 * The bytes are decoded with `decodeUtf8Strict` and NEVER with
 * `readFile(…, 'utf8')` (ADR-018): this file is written by the human, so it is
 * expected in UTF-8, and a file his editor saved as cp1252 would otherwise lose
 * every accent in silence while the parse looked perfect.
 *
 * The parser RETURNS the reason instead of throwing, so a badly written file
 * becomes a `ValidationError` here — with every problem of the file accumulated
 * into a single message, never truncated — and the caller isolates it.
 *
 * It touches no database: what it returns is a plain value, and who writes it
 * is `modules/investments/` (ADR-024 and its guardian stay green).
 */
export function parseTradeRepublicProductFile(
  fileName: string,
  content: Buffer,
): ParsedSavingsAccount {
  const result = parseTradeRepublicProduct(fileName, decodeUtf8Strict(content))
  if ('reason' in result) {
    throw new ValidationError(result.reason)
  }
  return result
}
