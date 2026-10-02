import { ValidationError } from '../../errors/app-error.js'
import { decodeUtf8Strict } from '../../lib/utf8.js'
import { parseMyinvestorProduct } from './myinvestor.product.parser.js'
import type { MyinvestorProductInput, ParsedProduct } from './myinvestor.types.js'

/**
 * The PRODUCT-file entry of this bank into the IMPORTER (feature 29): the
 * product parser wrapped so it fits the registry of `src/app.ts`.
 *
 * What the wrapping adds, and nothing else:
 *
 *  - The bytes arrive as a `Buffer` and are decoded STRICTLY as UTF-8 (the same
 *    decoder the other banks use): a file saved in another encoding is a failure
 *    with a reason, never a name with a broken accent silently stored as the
 *    identity of a product.
 *  - A badly written file becomes a `ValidationError` carrying the WHOLE reason
 *    of the parser, because that is what the importer reports per file.
 *
 * The parser itself is NOT touched here: this function adds WHO writes, never
 * HOW the file is read.
 */
export function parseMyinvestorProductFile(
  fileName: string,
  content: Buffer,
): MyinvestorProductInput {
  const result = parseMyinvestorProduct(fileName, decodeUtf8Strict(content))
  if ('reason' in result) {
    throw new ValidationError(result.reason)
  }
  return toProductInput(result)
}

/**
 * Narrows a `ParsedProduct` -- whose `valuation` and `depositTerms` are nullable
 * on every type -- into the union the database writer takes, where the type
 * decides which of the two is there.
 *
 * The two throws are unreachable through the parser, which never returns a
 * product with its shape missing (it returns a reason instead). They are here
 * because the compiler cannot know that, and because an unreachable
 * `ValidationError` is the right thing to leave behind if the parser ever
 * changes: the file is rejected with a reason, not stored half-empty.
 */
function toProductInput(product: ParsedProduct): MyinvestorProductInput {
  const common = {
    bank: product.bank,
    name: product.name,
    currency: product.currency,
    openedAt: product.openedAt,
    closedAt: product.closedAt,
    date: product.date,
  }

  if (product.type === 'deposit') {
    if (product.depositTerms === null) {
      throw new ValidationError(
        `el depósito '${product.name}' no trae sus condiciones: no se guarda nada`,
      )
    }
    return { ...common, type: 'deposit', depositTerms: product.depositTerms }
  }

  if (product.valuation === null) {
    throw new ValidationError(
      `el producto '${product.name}' no trae su valoración: no se guarda nada`,
    )
  }
  return { ...common, type: product.type, valuation: product.valuation }
}
