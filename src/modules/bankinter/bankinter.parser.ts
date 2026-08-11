import ExcelJS from 'exceljs'

import { ValidationError } from '../../errors/app-error.js'
import { assignDaySequence } from '../../lib/parsed-statement.js'
import type { ParsedMovementDraft, UnparsedRow } from '../../lib/parsed-statement.js'
import { deriveMovementTypeFromAmount } from '../movements/movements.service.js'
import type { BankinterParseResult } from './bankinter.types.js'

/** Bankinter writes the most recent movement first (verified on a real export). */
const statementOrder = 'newest-first'

/** Header names (accent/case-insensitive) mapped to the movement fields. */
type ColumnField = 'bookingDate' | 'valueDate' | 'description' | 'amount' | 'balance' | 'currency'

const headerToField: Record<string, ColumnField> = {
  'fecha contable': 'bookingDate',
  'fecha valor': 'valueDate',
  descripcion: 'description',
  importe: 'amount',
  saldo: 'balance',
  divisa: 'currency',
}

type ColumnMap = Partial<Record<ColumnField, number>>

interface SheetRow {
  rowNumber: number
  cells: unknown[]
}

/**
 * Parses the content of a Bankinter `.xlsx` bank statement into structured
 * movements plus the account IBAN, WITHOUT touching a database, Drive or moving
 * anything. It is pure: content in, structured result out.
 *
 * The shape it returns is the shared contract of `src/lib/parsed-statement.ts`,
 * not a Bankinter-specific model: only the code that READS the `.xlsx` is
 * Bankinter's own. Bankinter exports the most recent movement first, so that
 * (bank-specific) knowledge is what it passes to `assignDaySequence`.
 *
 * It skips the metadata preamble, locates the header row robustly (by column
 * name, not a fixed position) and maps each following data row to a
 * `ParsedMovement`. It never deduplicates: two identical rows both appear. A
 * row that cannot be interpreted is not dropped but collected in `unparsedRows`
 * with its 1-based sheet row number and the reason.
 *
 * Throws `ValidationError` only for a structural failure (no recognizable header
 * row), i.e. the buffer is not a Bankinter statement.
 */
export async function parseBankinterXlsx(content: Buffer): Promise<BankinterParseResult> {
  const workbook = new ExcelJS.Workbook()
  // exceljs types `load` as its own `Buffer extends ArrayBuffer`, which a Node
  // Buffer does not satisfy structurally; the runtime accepts the Node Buffer.
  await workbook.xlsx.load(content as unknown as ArrayBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new ValidationError('Bankinter statement has no worksheet')
  }

  const rows = collectRows(worksheet)
  const accountIban = findIban(rows)

  const header = findHeaderRow(rows)
  if (!header) {
    throw new ValidationError('Bankinter header row not found: not a recognizable statement')
  }

  const drafts: ParsedMovementDraft[] = []
  const unparsedRows: UnparsedRow[] = []

  for (const row of rows) {
    if (row.rowNumber <= header.rowNumber) {
      continue
    }
    if (isEmptyRow(row)) {
      continue
    }
    const parsed = parseDataRow(row, header.columns)
    if ('reason' in parsed) {
      unparsedRows.push({ row: row.rowNumber, reason: parsed.reason })
    } else {
      drafts.push(parsed)
    }
  }

  return {
    bank: 'bankinter',
    accountIban,
    movements: assignDaySequence(drafts, statementOrder),
    unparsedRows,
  }
}

/** Reads every non-empty row into a `{ rowNumber, cells[] }` (1-based cells). */
function collectRows(worksheet: ExcelJS.Worksheet): SheetRow[] {
  const columnCount = Math.max(worksheet.columnCount, 1)
  const rows: SheetRow[] = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: unknown[] = []
    for (let c = 1; c <= columnCount; c++) {
      cells[c] = row.getCell(c).value
    }
    rows.push({ rowNumber, cells })
  })
  return rows
}

/**
 * Extracts the account IBAN from the preamble line `MOVIMIENTOS DE LA CUENTA
 * <IBAN>`. Returns `null` when no such line is present: the contract says an
 * absent datum is `null`, never an empty string. Spaces inside the IBAN are
 * removed and the token is validated to look like an IBAN (2 letters + 2 digits).
 */
function findIban(rows: SheetRow[]): string | null {
  for (const row of rows) {
    for (const cell of row.cells) {
      const text = cellToString(cell)
      const match = text.match(/MOVIMIENTOS DE LA CUENTA\s+(.+)/i)
      if (!match) {
        continue
      }
      const candidate = match[1].replace(/\s+/g, '').toUpperCase()
      if (/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(candidate)) {
        return candidate
      }
    }
  }
  return null
}

/**
 * Finds the table header row: the first row that carries both a `Fecha contable`
 * and an `Importe` cell. Returns the row number and a map field → column index.
 */
function findHeaderRow(rows: SheetRow[]): { rowNumber: number; columns: ColumnMap } | null {
  for (const row of rows) {
    const columns: ColumnMap = {}
    for (let c = 1; c < row.cells.length; c++) {
      const field = headerToField[normalizeHeader(row.cells[c])]
      if (field && columns[field] === undefined) {
        columns[field] = c
      }
    }
    if (columns.bookingDate !== undefined && columns.amount !== undefined) {
      return { rowNumber: row.rowNumber, columns }
    }
  }
  return null
}

/** Maps a single data row to a movement, or to a reason it is not interpretable. */
function parseDataRow(row: SheetRow, columns: ColumnMap): ParsedMovementDraft | { reason: string } {
  const problems: string[] = []

  const rawBookingDate = cellAt(row, columns.bookingDate)
  const bookingDate = parseSpanishDate(rawBookingDate)
  if (bookingDate === null) {
    problems.push(`fecha contable inválida ('${cellToString(rawBookingDate)}')`)
  }

  const rawValueDate = cellAt(row, columns.valueDate)
  const valueDate = parseSpanishDate(rawValueDate)
  if (valueDate === null) {
    problems.push(`fecha valor inválida ('${cellToString(rawValueDate)}')`)
  }

  const rawAmount = cellAt(row, columns.amount)
  const amount = parseSpanishAmount(rawAmount)
  if (amount === null) {
    problems.push(`importe no numérico ('${cellToString(rawAmount)}')`)
  }

  const rawBalance = cellAt(row, columns.balance)
  const balance = parseSpanishAmount(rawBalance)
  if (balance === null) {
    problems.push(`saldo no numérico ('${cellToString(rawBalance)}')`)
  }

  if (bookingDate === null || valueDate === null || amount === null || balance === null) {
    return { reason: problems.join('; ') }
  }

  return {
    bookingDate,
    valueDate,
    description: cellToString(cellAt(row, columns.description)),
    amount,
    balance,
    currency: cellToString(cellAt(row, columns.currency)),
    // Single point of the sign rule (feature 8): 0 is `neutral`, not an income.
    type: deriveMovementTypeFromAmount(amount),
  }
}

function cellAt(row: SheetRow, column: number | undefined): unknown {
  return column === undefined ? null : row.cells[column]
}

/** A row is empty when none of its cells hold any text. */
function isEmptyRow(row: SheetRow): boolean {
  return row.cells.every((cell) => cellToString(cell) === '')
}

/**
 * Parses a Spanish date `dd/mm/yyyy` into ISO `YYYY-MM-DD`, validating it is a
 * real calendar date. Returns `null` for anything else. A native `Date` (some
 * exports/readers auto-convert) is formatted from its UTC parts.
 */
export function parseSpanishDate(value: unknown): string | null {
  if (value instanceof Date) {
    return toIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  const text = cellToString(value)
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) {
    return null
  }
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return toIsoDate(year, month, day)
}

/**
 * Parses a Spanish amount into a signed number. A native number is returned
 * as-is (the real Bankinter export stores the amount as a number). A string in
 * Spanish format (`.` thousands, `,` decimal, e.g. `1.234,56` → `1234.56`,
 * `-2.000,00` → `-2000`) is normalized. Returns `null` when not a number.
 */
export function parseSpanishAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  let text = value.trim().replace(/[€\s]/g, '')
  if (text === '') {
    return null
  }
  if (text.includes(',')) {
    // Spanish: '.' groups thousands, ',' is the decimal separator.
    text = text.replace(/\./g, '').replace(',', '.')
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return null
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Normalizes a header cell: string, accents stripped, lowercased, collapsed. */
function normalizeHeader(value: unknown): string {
  return cellToString(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Coerces any ExcelJS cell value to a trimmed string. */
function cellToString(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) =>
          typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .join('')
        .trim()
    }
    if ('result' in record) {
      return cellToString(record.result)
    }
    if (typeof record.text === 'string') {
      return record.text.trim()
    }
  }
  return ''
}
