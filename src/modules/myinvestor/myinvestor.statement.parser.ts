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
 * each line. The IBAN is not reported by the bank either, but the human writes
 * it once as a labelled `iban;<IBAN>` preamble line; it is read ONLY from that
 * line and never inferred from the shape of a concept.
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

  return {
    bank: 'myinvestor',
    accountIban: findIbanLine(lines, header.line),
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
 * Reads the IBAN from the labelled preamble line the human writes once:
 * `iban;ES30…` ABOVE the header row. It looks ONLY at the lines before the
 * header and ONLY at a line whose first cell is exactly `iban` once normalized
 * (trimmed, lowercased, spaces removed); the value is its second cell, trimmed.
 * Trailing filler cells Excel may add are ignored.
 *
 * It is never inferred from the shape of a string: a concept holding something
 * that looks like an IBAN is a movement description, not the account (F10 R20).
 */
function findIbanLine(lines: string[], headerLine: number): string | null {
  for (let index = 0; index < headerLine - 1; index++) {
    const cells = lines[index].split(delimiter)
    if (cells[0].toLowerCase().replace(/\s+/g, '') !== 'iban') {
      continue
    }
    const value = (cells[1] ?? '').trim()
    return value.length > 0 ? value : null
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

/** Normalizes a header cell: accents stripped, lowercased, spaces collapsed. */
function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
