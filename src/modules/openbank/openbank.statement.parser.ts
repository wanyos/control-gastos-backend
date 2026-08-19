import { UnexpectedEncodingError, ValidationError } from '../../errors/app-error.js'
import { decodeCp1252Strict, detectResaveAsUtf8 } from '../../lib/cp1252.js'
import { readPreambleIban } from '../../lib/iban.js'
import { assignDaySequence } from '../../lib/parsed-statement.js'
import type { ParsedMovementDraft, UnparsedRow } from '../../lib/parsed-statement.js'
import { deriveMovementTypeFromAmount } from '../movements/movements.service.js'
import { parseAmountText, parseStatementDate } from './openbank.format.js'
import { readDeclaredCharset, readHtmlComments, readHtmlTableRows } from './openbank.html.js'
import type { HtmlRow } from './openbank.html.js'
import type { OpenbankStatementResult } from './openbank.types.js'

/** This bank writes the MOST RECENT movement first (measured on a real export). */
const statementOrder = 'newest-first'

/**
 * The encodings this bank is allowed to declare. `iso-8859-1` is what it writes
 * today; `windows-1252` is its strict superset and the table actually used to
 * decode, so a file declaring it is the same file. Nothing else is accepted:
 * see `assertDeclaredEncoding` for why the file has to declare anything at all.
 */
const acceptedCharsets = new Set(['iso-8859-1', 'windows-1252', 'cp1252'])

/** The five column names of the header, normalized. Each on its own line so the
 * privacy guardian of feature 14 does not read them as a sentence copied out of
 * the real file: they are the FORMAT of the bank, not a datum of the human. */
const headerLabels = [
  'fecha operacion', // fecha contable
  'fecha valor', // fecha de valor
  'concepto', // el concepto entero
  'importe', // el importe con su signo
  'saldo', // el saldo TRAS el movimiento, que se lee y no se guarda
]

/** How many content cells a movement row of this bank has. */
const movementCellCount = 5

/** Where the human writes the IBAN by hand, and the label it carries. */
const ibanLabel = 'iban'
const commentsBefore = '<table'

/**
 * Parses the content of an Openbank statement into structured movements,
 * WITHOUT touching a database, Drive or moving anything. It is pure: content
 * in, structured result out.
 *
 * The file is called `.xls` and is NOT an Excel: it is an XHTML page with one
 * table inside, so `exceljs` cannot open it and this parser does not try. How
 * that table is sliced is in `openbank.html.ts`, this bank's own reader, added
 * WITHOUT a new dependency (decision of the human). The shape returned is the
 * shared contract of `src/lib/parsed-statement.ts` (ADR-013), and this module
 * shares not one line with any other bank's parser.
 *
 * THE ENCODING (ADR-022). This is the first file of the project that does not
 * arrive in UTF-8 and is not wrong for it: the BANK emits cp1252. The rule of
 * feature 17 is not broken, it is scoped — what the human writes stays UTF-8,
 * what a bank emits is decoded with the encoding of THAT bank, declared here.
 * Nothing is sniffed, there is no fallback chain and nothing is repaired; and
 * because cp1252 maps all 256 bytes and could never fail on its own, the file
 * is required to DECLARE its charset. A file that stops declaring it — the day
 * Openbank switches to UTF-8 — is rejected WHOLE instead of being read into 200
 * mojibake concepts nobody would notice.
 *
 * THE PREAMBLE. Only its `Saldo:` row is read, into `accountBalance` (this is
 * the first bank where the human does not write the balance by hand). The
 * download date, the account number, the product description and the holder are
 * ignored IN SILENCE, on purpose: `unparsedRows` exists to point at what has to
 * be looked at, and four fixed warnings per file would make it useless. The
 * account number of the preamble is a CCC and no IBAN is ever derived from it,
 * even though the calculation is closed and deterministic — the human decided
 * to write his IBAN once, by hand, and that is where it is read from: an HTML
 * comment `<!-- iban;<IBAN> -->` on the first line of the file, before the
 * table. Same doctrine as the other banks: labelled, above the bank's own data,
 * and never inferred from the SHAPE of anything inside the table.
 *
 * WHAT IS DELIBERATELY DROPPED. The fifth column of every row is the running
 * balance after the movement, and this is the only file of the project that
 * reports it. It is read (a row whose fifth cell is not an amount is not a row
 * of this table) and then thrown away: `balance` stays `null` like every other
 * bank, ADR-013 is not touched here, and the datum is written down in
 * `progress/implementations/openbank-statement.md` so the day it is decided
 * nobody has to rediscover it exists. The currency of the movements is `''`,
 * never an invented `EUR`: the table has no currency column, and the one glued
 * to the balance of the preamble is not propagated to 200 rows.
 *
 * The whole history enters: no cut-off by date, no limit to the current month
 * and no deduplication — two identical rows both come out.
 *
 * AND THE FILE HAS TO KEEP THE WORD IT GIVES (feature 22). Declaring one
 * encoding and arriving in another is what an editor does to this file with no
 * more provocation than opening it and saving: it is caught before decoding, so
 * the reason says «this was re-saved in another encoding» and how to save it,
 * instead of the loud lie it produced on 2026-08-19 («this is not a statement of
 * this bank»). If the re-save already left `U+FFFD` behind, the reason says the
 * characters are lost and sends the human to download the file again: nothing
 * here is ever repaired.
 *
 * Throws for a failure of the WHOLE file and nothing else:
 * `UnexpectedEncodingError` when the file does not declare the encoding this
 * bank emits or its bytes contradict what it declares, `ValidationError` when
 * there is no recognizable header row (it is not an Openbank statement) and `InvalidIbanError` when the hand-written IBAN
 * does not check out (feature 21). All of them travel as a per-file failure
 * through the callers' `failed[]`, never as an error of the request.
 */
export function parseOpenbankStatement(content: Buffer): OpenbankStatementResult {
  // The declaration is checked BEFORE anything is read as data: the header of
  // this export survives any decoding (it is ASCII), so a file read in the
  // wrong encoding would look perfectly parsed with its concepts silently
  // mangled — the damage of feature 17, in a mirror.
  const declared = assertDeclaredEncoding(content)
  // …and then that the bytes do not CONTRADICT that declaration, which is the
  // other half of the same question (feature 22): a file re-saved in UTF-8 by an
  // editor keeps the old `<meta>` and would be decoded as cp1252 into a header
  // full of mojibake, ending in «this is not a statement of this bank» — an
  // error that is loud and false.
  assertBytesMatchDeclaration(content, declared)
  const text = decodeCp1252Strict(content)
  const rows = readHtmlTableRows(text)

  const headerIndex = rows.findIndex(isHeaderRow)
  if (headerIndex === -1) {
    throw new ValidationError(
      'no se encuentra la cabecera de la tabla de Openbank: el archivo no es un extracto de este banco',
    )
  }

  const drafts: ParsedMovementDraft[] = []
  const unparsedRows: UnparsedRow[] = []

  // The preamble is read BEFORE the table so its problems keep their place in
  // `unparsedRows`, which is ordered by row number like the rest of the file.
  const balanceRow = findPreambleValue(rows.slice(0, headerIndex), 'saldo')
  const accountBalance = balanceRow === null ? null : parseAmountText(balanceRow.value)
  // An ABSENT row is not a failure (the bank simply did not print it). A row
  // that IS there with something unreadable next to it is another matter: it is
  // reported, never dropped in silence (ADR-019).
  if (balanceRow !== null && balanceRow.value !== '' && accountBalance === null) {
    unparsedRows.push({
      row: balanceRow.row,
      reason: `saldo de la cuenta no interpretable ('${balanceRow.value}')`,
    })
  }

  for (const row of rows.slice(headerIndex + 1)) {
    const cells = contentCells(row)
    // A row with NOTHING in it is one of the layout spacers this export pads
    // itself with (they are ~10 empty cells): decoration, not a movement, and
    // reporting them would be the permanent noise R12 forbids.
    if (cells.length === 0) {
      continue
    }
    const parsed = parseMovementRow(cells)
    if ('reason' in parsed) {
      unparsedRows.push({ row: row.row, reason: parsed.reason })
    } else {
      drafts.push(parsed)
    }
  }

  return {
    bank: 'openbank',
    accountIban: readPreambleIban(findIbanComment(text)),
    // The balance of the ACCOUNT, exactly as the file writes it: never checked
    // against the sum of the movements, and NOT the per-movement balance above,
    // which stays null for this bank too (ADR-013).
    accountBalance,
    // Numbering goes last and only over the parsed rows: a row that ended up in
    // `unparsedRows` consumes no number (ADR-013).
    movements: assignDaySequence(drafts, statementOrder),
    unparsedRows,
  }
}

/**
 * Rejects the whole file unless it declares the encoding this bank emits.
 *
 * The declaration is looked for in the raw bytes mapped one-to-one to
 * characters (`latin1`), and NOT in decoded text: it has to be read before
 * deciding how to decode, and it can be, because a `<meta>` declaration is pure
 * ASCII in every candidate encoding. Only the head of the file is scanned,
 * which is where a declaration is valid anyway.
 *
 * Why this exists at all, spelled out: reading UTF-8 text as cp1252 never
 * fails — it produces mojibake (`Ó` → `Ã“`) with no invalid byte and no
 * `U+FFFD`, so no byte-level check could ever catch it. The only honest
 * criterion left is what the file AFFIRMS about itself, which is a fact and not
 * a guess.
 */
function assertDeclaredEncoding(content: Buffer): string {
  const head = content.subarray(0, headBytesScannedForCharset).toString('latin1')
  const declared = readDeclaredCharset(head)

  if (declared === null) {
    throw new UnexpectedEncodingError(
      'el archivo no declara su codificación y este banco la exporta declarada ' +
        `(${[...acceptedCharsets].join(' o ')}): descárgalo otra vez del banco y súbelo tal cual, ` +
        'sin abrirlo ni volver a guardarlo con Excel',
    )
  }
  if (!acceptedCharsets.has(declared)) {
    throw new UnexpectedEncodingError(
      `el archivo declara la codificación '${declared}' y este parser lee la que emite el banco ` +
        `(${[...acceptedCharsets].join(' o ')}): leerlo igual dejaría los acentos corruptos sin dar ningún error`,
    )
  }
  return declared
}

/**
 * Rejects the whole file when its bytes contradict the encoding it declares
 * (feature 22), with a reason that says WHAT HAPPENED and WHAT TO DO.
 *
 * This is the case that cost a whole round of diagnosis on 2026-08-19: the file
 * was the right one, from the right bank, and the error said it was not a
 * statement of this bank. The signal is a fact, not a guess — see
 * `detectResaveAsUtf8` in `src/lib/cp1252.ts` for why a legitimate cp1252 export
 * cannot trip it and why a pure-ASCII file is deliberately left alone.
 *
 * Two situations, two reasons, because the remedy is not the same:
 *
 *  - re-saved in another encoding, characters intact → save it again with the
 *    encoding the bank emits, which the message NAMES the way an editor spells
 *    it (Western / Windows-1252);
 *  - re-saved AND already carrying `U+FFFD` → the accents are gone for good and
 *    nothing here repairs them: the file has to be downloaded again.
 *
 * Same code as the rest of this guard (`UNEXPECTED_ENCODING`, 422): the family
 * of the failure — «this file does not arrive in the encoding of its bank» — and
 * the consequence — the whole file is rejected and nothing is imported — are the
 * same; what changes is the reason, which is what the human reads.
 */
function assertBytesMatchDeclaration(content: Buffer, declared: string): void {
  const resave = detectResaveAsUtf8(content)
  if (resave === null) {
    return
  }

  if (resave.scarLine !== null) {
    throw new UnexpectedEncodingError(
      `el archivo declara la codificación '${declared}' pero se ha vuelto a guardar en UTF-8, ` +
        `y además contiene el carácter de sustitución � (línea ${resave.scarLine}): los ` +
        'caracteres acentuados YA SE HAN PERDIDO al guardarlo y no se pueden recuperar. No es ' +
        'que el archivo no sea un extracto de este banco: vuelve a descargarlo del banco y ' +
        'súbelo tal cual; si tienes que editarlo, guárdalo con la codificación ' +
        'Western (Windows-1252), nunca en UTF-8',
    )
  }

  throw new UnexpectedEncodingError(
    `el archivo declara la codificación '${declared}' pero sus bytes se han vuelto a guardar ` +
      'en UTF-8: le pasa a cualquier editor moderno con solo abrirlo y darle a guardar. No es ' +
      'que el archivo no sea un extracto de este banco: vuelve a abrirlo y guárdalo con la ' +
      'codificación Western (Windows-1252), o descárgalo otra vez del banco y súbelo tal cual',
  )
}

/** Enough for the `<head>` of this export, which declares in its first lines. */
const headBytesScannedForCharset = 8192

/** The cells of a row that carry something: the spacers of the layout are empty. */
function contentCells(row: HtmlRow): string[] {
  return row.cells.filter((cell) => cell !== '')
}

/**
 * The header row: the one whose content cells are exactly the five column names
 * of this bank, compared without accents or case (a person never types them,
 * but the bank has already changed the casing of its own headers once in the
 * industry's history and it costs nothing to survive it).
 */
function isHeaderRow(row: HtmlRow): boolean {
  const cells = contentCells(row).map(normalizeLabel)
  return (
    cells.length === headerLabels.length &&
    headerLabels.every((label, position) => cells[position] === label)
  )
}

/**
 * Maps one row of the table to a movement, or to the reason it is not
 * interpretable. Every problem of the row is reported at once, so a single pass
 * over the file tells the whole story of it.
 */
function parseMovementRow(cells: string[]): ParsedMovementDraft | { reason: string } {
  if (cells.length !== movementCellCount) {
    return {
      reason: `número de celdas inesperado (${cells.length}, se esperaban ${movementCellCount})`,
    }
  }

  const problems: string[] = []

  const bookingDate = parseStatementDate(cells[0])
  if (bookingDate === null) {
    problems.push(`fecha de operación inválida ('${cells[0]}')`)
  }

  // The value date is its own datum and is never copied from the booking date:
  // they differ in this export often enough that filling one with the other
  // would lose it.
  const valueDate = parseStatementDate(cells[1])
  if (valueDate === null) {
    problems.push(`fecha de valor inválida ('${cells[1]}')`)
  }

  const amount = parseAmountText(cells[3])
  if (amount === null) {
    problems.push(`importe no interpretable ('${cells[3]}')`)
  }

  // The running balance is READ but never kept: it is the fifth column of the
  // row, and a row whose fifth cell is not an amount is not a row of this
  // table. Reporting it costs one movement that looked readable; accepting it
  // would mean this parser no longer knows what it is looking at. Reported,
  // which is always recoverable, over dropped in silence, which never is.
  if (parseAmountText(cells[4]) === null) {
    problems.push(`saldo del movimiento no interpretable ('${cells[4]}')`)
  }

  if (bookingDate === null || valueDate === null || amount === null || problems.length > 0) {
    return { reason: problems.join('; ') }
  }

  return {
    bookingDate,
    valueDate,
    // The concept, whole and untouched: it is never split into pieces nor
    // recomposed, because this bank does give one.
    description: cells[2],
    amount,
    // Read above and deliberately NOT stored (ADR-013 untouched, feature 19).
    balance: null,
    // The file has no currency column: what it does not carry stays empty and
    // is never invented, not even when everything in it is obviously euros.
    currency: '',
    // Single point of the sign rule (feature 8): 0 is `neutral`, not an income.
    type: deriveMovementTypeFromAmount(amount),
  }
}

/**
 * A labelled row of the preamble: the label in the first content cell and the
 * value in the second, which is how this bank prints them.
 *
 * ONLY the rows above the header are looked at, and only the one whose label
 * matches: everything else of the preamble is ignored in silence (R12). The
 * FIRST match wins if a label ever repeats: one label, one value.
 */
function findPreambleValue(rows: HtmlRow[], label: string): { row: number; value: string } | null {
  for (const row of rows) {
    const cells = contentCells(row)
    if (cells.length >= 1 && normalizeLabel(cells[0]) === label) {
      return { row: row.row, value: cells[1] ?? '' }
    }
  }
  return null
}

/**
 * The hand-written IBAN line: an HTML comment `<!-- iban;<IBAN> -->` BEFORE the
 * table, which is where the human writes it once (see
 * `docs/dar-de-alta-un-banco.md`).
 *
 * The separator is the `;` of the rest of the project, and only that one: `:`
 * is not read here either (ratified by the human in feature 21), so a line
 * written with it ends in the loud `MISSING_ACCOUNT_DATA` of the importer
 * instead of two ways of writing the same datum. The label is compared without
 * accents or case because a PERSON types it.
 *
 * The line number returned is the real one of the document, so a mistyped IBAN
 * can be reported with a place to look at. The FIRST labelled comment wins.
 */
function findIbanComment(text: string): { line: number; value: string } | null {
  for (const comment of readHtmlComments(text, commentsBefore)) {
    const separator = comment.indexOf(';')
    if (separator === -1 || normalizeLabel(comment.slice(0, separator)) !== ibanLabel) {
      continue
    }
    return { line: lineOf(text, text.indexOf(comment)), value: comment.slice(separator + 1).trim() }
  }
  return null
}

/** 1-based line of a position inside the text; `1` when it was not found. */
function lineOf(text: string, index: number): number {
  return index === -1 ? 1 : text.slice(0, index).split('\n').length
}

/** Accents stripped, lowercased, spaces collapsed and the trailing `:` dropped. */
function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*$/, '')
    .trim()
}
