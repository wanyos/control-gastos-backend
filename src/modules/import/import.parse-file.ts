import { normalizeBankName } from '../../lib/drive-structure.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import type { ProductParserRegistry } from '../investments/investments.types.js'
import { describeError, selectAdapter, selectProductAdapter } from './import.service.js'
import type { BankParserRegistry } from './import.types.js'

/**
 * What `pnpm run parse-file <banco> <ruta>` says about ONE file (feature 52):
 * counts and shape, never a value of the file. It exists so a new parser can be
 * tried on a real file before the first real import, and so its output can be
 * pasted into a report as it is.
 *
 * It is made of counts, row numbers, yes/no and two dates. No amount, no IBAN,
 * no name and no description travels in it -- and neither does the `reason` of
 * an unread row nor the `message` of a rejection, because both quote values of
 * the file.
 */
export type BankFileSummary =
  | {
      outcome: 'statement'
      movements: number
      /** The 1-based numbers of the rows the parser could not read. */
      unparsedRowNumbers: number[]
      hasIban: boolean
      /** Whether the file carries the balance OF THE ACCOUNT. */
      hasAccountBalance: boolean
      /** How many movements carry the running balance of their line. */
      linesWithBalance: number
      /** ISO `YYYY-MM-DD`; `null` when the file brings no movement. */
      firstBookingDate: string | null
      lastBookingDate: string | null
    }
  | { outcome: 'product'; type: string }
  /** No parser for that bank, or an extension the parser of that bank does not read. */
  | { outcome: 'no-parser'; reason: string }
  /** The parser refused the file: only the stable code of the error. */
  | { outcome: 'rejected'; code: string }

export interface SummarizeBankFileInput {
  /** As the human types it: it is normalized to the slug of the bank folder. */
  bank: string
  /** Only its extension chooses the parser; it never decides a value. */
  fileName: string
  content: Buffer
  parsers: BankParserRegistry
  productParsers: ProductParserRegistry
}

/**
 * Passes one file through the parser registered for its bank and summarizes
 * what came out. The parser is chosen exactly as an import chooses it: the
 * statement registry first, the product registry second, by bank and extension.
 *
 * It receives the bytes and the two registries, and nothing that could store
 * or move anything: there is no data client and no remote client among its
 * parameters, so it cannot write anywhere.
 */
export async function summarizeBankFile(input: SummarizeBankFileInput): Promise<BankFileSummary> {
  const bankSlug = normalizeBankName(input.bank)
  const statementAdapter = selectAdapter(input.parsers, bankSlug, input.fileName)

  if (!('reason' in statementAdapter)) {
    try {
      return summarizeStatement(await statementAdapter.adapter.parse(input.content))
    } catch (error) {
      return { outcome: 'rejected', code: describeError(error).code }
    }
  }

  const productAdapter = selectProductAdapter(input.productParsers, bankSlug, input.fileName)

  if (!('reason' in productAdapter)) {
    try {
      const product = productAdapter.adapter.parse(input.fileName, input.content)
      return { outcome: 'product', type: product.type }
    } catch (error) {
      return { outcome: 'rejected', code: describeError(error).code }
    }
  }

  // Neither registry reads it. The reason is the one of the registry that DOES
  // know the bank, so «no parser for the bank» is only said when it is true in
  // both: a bank with product files only is not a bank without parser.
  const knownOnlyAsProduct =
    !input.parsers.some((candidate) => candidate.bank === bankSlug) &&
    input.productParsers.some((candidate) => candidate.bank === bankSlug)
  return {
    outcome: 'no-parser',
    reason: knownOnlyAsProduct ? productAdapter.reason : statementAdapter.reason,
  }
}

function summarizeStatement(statement: ParsedStatement): BankFileSummary {
  // ISO dates sort as text, so the first and the last need no date arithmetic.
  const dates = statement.movements.map((movement) => movement.bookingDate).sort()
  return {
    outcome: 'statement',
    movements: statement.movements.length,
    unparsedRowNumbers: statement.unparsedRows.map((unparsed) => unparsed.row),
    hasIban: statement.accountIban !== null && statement.accountIban.trim().length > 0,
    hasAccountBalance: statement.accountBalance !== null,
    linesWithBalance: statement.movements.filter((movement) => movement.balance !== null).length,
    firstBookingDate: dates[0] ?? null,
    lastBookingDate: dates[dates.length - 1] ?? null,
  }
}

/** Text for the terminal. Exit code: 0 for statement/product, 1 otherwise. */
export function formatBankFileSummary(summary: BankFileSummary): string {
  if (summary.outcome === 'no-parser') {
    return `No se ha leído el archivo: ${summary.reason}.`
  }
  if (summary.outcome === 'rejected') {
    return (
      `El parser ha rechazado el archivo. Código: ${summary.code}.\n` +
      'El motivo no se imprime porque puede citar valores del archivo.'
    )
  }
  if (summary.outcome === 'product') {
    return `Tipo de archivo: producto\nTipo de producto: ${summary.type}`
  }

  const unparsed = summary.unparsedRowNumbers
  return [
    'Tipo de archivo: extracto de movimientos',
    `Movimientos leídos: ${summary.movements}`,
    unparsed.length === 0
      ? 'Filas que no se han podido leer: 0'
      : `Filas que no se han podido leer: ${unparsed.length} (filas ${unparsed.join(', ')})`,
    `Trae IBAN: ${yesOrNo(summary.hasIban)}`,
    `Trae saldo de la cuenta: ${yesOrNo(summary.hasAccountBalance)}`,
    `Movimientos con saldo en su línea: ${summary.linesWithBalance} de ${summary.movements}`,
    `Primera fecha: ${summary.firstBookingDate ?? 'ninguna'}`,
    `Última fecha: ${summary.lastBookingDate ?? 'ninguna'}`,
  ].join('\n')
}

export function exitCodeOf(summary: BankFileSummary): 0 | 1 {
  return summary.outcome === 'statement' || summary.outcome === 'product' ? 0 : 1
}

function yesOrNo(value: boolean): string {
  return value ? 'sí' : 'no'
}
