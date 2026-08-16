import { ValidationError } from '../../errors/app-error.js'
import { assignDaySequence } from '../../lib/parsed-statement.js'
import type { ParsedMovementDraft, UnparsedRow } from '../../lib/parsed-statement.js'
import { decodeUtf8Strict } from '../../lib/utf8.js'
import { deriveMovementTypeFromAmount } from '../movements/movements.service.js'
import { parseAmountText, parseStatementDate } from './myinvestor.format.js'
import type { MyinvestorStatementResult } from './myinvestor.types.js'

/** MyInvestor writes the most recent movement first (verified on a real export). */
const statementOrder = 'newest-first'

const delimiter = ';'

/** Header names (accent/case-insensitive) mapped to the movement fields. */
type ColumnField = 'bookingDate' | 'valueDate' | 'description' | 'amount' | 'currency'

const headerToField: Record<string, ColumnField> = {
  'fecha de valor': 'valueDate',
  concepto: 'description',
  importe: 'amount',
  divisa: 'currency',
}

/**
 * The only accented column. It is recognized by its ASCII prefix so it survives
 * a re-export whose accent arrived mangled (`fecha de operaci?n`).
 */
const bookingDatePrefix = 'fecha de operaci'

type ColumnMap = Partial<Record<ColumnField, number>>

interface HeaderRow {
  /** 1-based line number of the header inside the file. */
  line: number
  columns: ColumnMap
  cellCount: number
}

/**
 * Parses the content of a MyInvestor bank statement (`.csv`) into structured
 * movements, WITHOUT touching a database, Drive or moving anything. It is pure:
 * content in, structured result out.
 *
 * The shape it returns is the shared contract of `src/lib/parsed-statement.ts`
 * (ADR-013), not a MyInvestor-specific model: only the code that READS the file
 * is this bank's own.
 *
 * One datum this bank simply does not report, therefore emitted as an explicit
 * `null` and never invented, calculated or accumulated: the running balance of
 * each line. Two data the bank does not report either, but that the human writes
 * by hand as LABELLED PREAMBLE LINES above the header row, read only from there:
 * `iban;<IBAN>` → `accountIban` (never inferred from the shape of a concept) and
 * `saldo;<importe>` → `accountBalance`, the balance OF THE ACCOUNT at the date of
 * the statement (feature 16). That last one is not the per-line `balance`: it is
 * the whole file's datum and it keeps its own name so the two can never be added
 * together. The closing `Saldo` row some exports carry AT THE END of the file is
 * deliberately NOT read: there is one single way of writing it.
 *
 * The file is decoded STRICTLY as UTF-8 (with a leading BOM tolerated): bytes
 * that are not valid UTF-8 reject the WHOLE file instead of becoming `U+FFFD`
 * (feature 17). The header row is located by column name, not by position. Blank
 * lines are
 * skipped; a line that cannot be interpreted is not dropped but collected in
 * `unparsedRows` with its 1-based line number (the header being line 1 of the
 * table) and the reason. It never deduplicates: two identical lines both appear.
 *
 * Throws for a failure of the WHOLE file and nothing else: `NotUtf8Error` when
 * its bytes are not UTF-8, and `ValidationError` for a structural failure (no
 * recognizable header row), i.e. the file is not a MyInvestor statement. Both
 * travel as a per-file failure through the callers' `failed[]`, never as an
 * error of the request.
 */
export function parseMyinvestorStatement(content: Buffer): MyinvestorStatementResult {
  // Rejecting bad bytes is the FIRST thing done, before the header is even
  // looked for: the header survives a bad decoding (it is matched by its ASCII
  // prefix) and would make a corrupted file look perfectly parsed.
  const lines = decodeUtf8Strict(content)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)

  const header = findHeaderRow(lines)
  if (!header) {
    throw new ValidationError('MyInvestor header row not found: not a recognizable statement')
  }

  const drafts: ParsedMovementDraft[] = []
  const unparsedRows: UnparsedRow[] = []

  // The preamble is read BEFORE the table so its problems keep their place in
  // `unparsedRows`, which is ordered by line number like the rest of the file.
  const accountBalanceLine = findPreambleLine(lines, header.line, 'saldo')
  const accountBalance =
    accountBalanceLine === null ? null : parseAmountText(accountBalanceLine.value)
  // An ABSENT or EMPTY label is not a failure (the human simply did not write it
  // that month), exactly as with the IBAN. A label that IS there with something
  // unreadable next to it is another matter: it is reported, never dropped in
  // silence, the same doctrine every unreadable line of this parser follows.
  if (accountBalanceLine !== null && accountBalanceLine.value !== '' && accountBalance === null) {
    unparsedRows.push({
      row: accountBalanceLine.line,
      reason: `saldo de la cuenta no interpretable ('${accountBalanceLine.value}')`,
    })
  }

  for (let index = header.line; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim() === '') {
      continue
    }
    const parsed = parseDataLine(line, header)
    if ('reason' in parsed) {
      unparsedRows.push({ row: index + 1, reason: parsed.reason })
    } else {
      drafts.push(parsed)
    }
  }

  const ibanLine = findPreambleLine(lines, header.line, 'iban')

  return {
    bank: 'myinvestor',
    accountIban: ibanLine === null || ibanLine.value === '' ? null : ibanLine.value,
    // The balance of the ACCOUNT, exactly as the human wrote it: it is never
    // checked against the sum of the movements, and it is NOT the per-movement
    // `balance` above, which stays null for this bank forever (ADR-013).
    accountBalance,
    // Numbering goes last and only over the parsed rows: a row that ended up in
    // `unparsedRows` consumes no number (ADR-013).
    movements: assignDaySequence(drafts, statementOrder),
    unparsedRows,
  }
}

/**
 * Finds the table header: the first line carrying both a concept and an amount
 * column (both pure ASCII, so they survive a bad decoding). Returns its 1-based
 * line number and the map field → cell index, tolerant to the column order.
 */
function findHeaderRow(lines: string[]): HeaderRow | null {
  for (let index = 0; index < lines.length; index++) {
    const cells = lines[index].split(delimiter)
    const columns: ColumnMap = {}
    cells.forEach((cell, position) => {
      const normalized = normalizeHeader(cell)
      const field = normalized.startsWith(bookingDatePrefix)
        ? 'bookingDate'
        : headerToField[normalized]
      if (field && columns[field] === undefined) {
        columns[field] = position
      }
    })
    if (columns.description !== undefined && columns.amount !== undefined) {
      return { line: index + 1, columns, cellCount: cells.length }
    }
  }
  return null
}

/**
 * Reads a LABELLED PREAMBLE LINE the human writes by hand ABOVE the header row:
 * `iban;ES30…` (feature 12) and `saldo;1.234,56` (feature 16). One single finder
 * for both, because they are the same mechanism: looking only at the lines before
 * the header, only at a line whose FIRST cell is exactly the label once
 * normalized, and taking its second cell, trimmed, as the value. Trailing filler
 * cells Excel adds (`;;;`) are ignored.
 *
 * The label is matched accent- and case-insensitively (`Saldo`, `SALDO`, ` saldo `
 * are the same label): the human writes these lines by hand in a Spanish editor,
 * and demanding one exact spelling would reject a file he considers correct.
 *
 * A value is never inferred from the SHAPE of a string: a concept that looks like
 * an IBAN, or a number in the table, is data of a movement and never the
 * account's (F10 R20). Looking only above the header is also what keeps the
 * closing `Saldo` row of the end of the file out (feature 16).
 *
 * Returns the 1-based line number too, so a value that cannot be interpreted can
 * be reported with it. The FIRST labelled line wins if the label is repeated, the
 * same rule the IBAN has had since feature 12: one hand-written label, one value.
 */
function findPreambleLine(
  lines: string[],
  headerLine: number,
  label: string,
): { line: number; value: string } | null {
  for (let index = 0; index < headerLine - 1; index++) {
    const cells = lines[index].split(delimiter)
    if (normalizeLabel(cells[0]) !== label) {
      continue
    }
    return { line: index + 1, value: (cells[1] ?? '').trim() }
  }
  return null
}

/** Maps a single data line to a movement, or to a reason it is not interpretable. */
function parseDataLine(line: string, header: HeaderRow): ParsedMovementDraft | { reason: string } {
  const cells = line.split(delimiter)
  if (cells.length !== header.cellCount) {
    return {
      reason: `número de columnas inesperado (${cells.length}, se esperaban ${header.cellCount})`,
    }
  }

  const problems: string[] = []

  const rawBookingDate = cellAt(cells, header.columns.bookingDate)
  const bookingDate = parseStatementDate(rawBookingDate)
  if (bookingDate === null) {
    problems.push(`fecha de operación inválida ('${rawBookingDate}')`)
  }

  const rawValueDate = cellAt(cells, header.columns.valueDate)
  const valueDate = parseStatementDate(rawValueDate)
  if (valueDate === null) {
    problems.push(`fecha de valor inválida ('${rawValueDate}')`)
  }

  const rawAmount = cellAt(cells, header.columns.amount)
  const amount = parseAmountText(rawAmount)
  if (amount === null) {
    problems.push(`importe no interpretable ('${rawAmount}')`)
  }

  if (bookingDate === null || valueDate === null || amount === null) {
    return { reason: problems.join('; ') }
  }

  return {
    bookingDate,
    valueDate,
    // The concept is copied whole: nothing is split out of it, ever.
    description: cellAt(cells, header.columns.description),
    amount,
    // This bank reports no running balance and none is ever invented (R17, R19).
    balance: null,
    currency: cellAt(cells, header.columns.currency),
    // Single point of the sign rule (feature 8): 0 is `neutral`, not an income.
    type: deriveMovementTypeFromAmount(amount),
  }
}

function cellAt(cells: string[], position: number | undefined): string {
  return position === undefined ? '' : (cells[position] ?? '').trim()
}

/**
 * Normalizes the label cell of a preamble line: accents stripped, lowercased and
 * ALL whitespace removed (a header cell only collapses it, because a column name
 * has words inside; a label does not).
 */
function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '')
}

/** Normalizes a header cell: accents stripped, lowercased, spaces collapsed. */
function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
