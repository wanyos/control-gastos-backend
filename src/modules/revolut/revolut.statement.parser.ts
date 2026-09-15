import { ValidationError } from '../../errors/app-error.js'
import { readPreambleIban } from '../../lib/iban.js'
import { assignDaySequence } from '../../lib/parsed-statement.js'
import type { ParsedMovementDraft, UnparsedRow } from '../../lib/parsed-statement.js'
import { decodeUtf8Strict } from '../../lib/utf8.js'
import { deriveMovementTypeFromAmount } from '../movements/movements.service.js'
import { isBlankRecord, readCsvRecords, type CsvRecord } from './revolut.csv.js'
import { parseAmount, parseDateTimeAsDay } from './revolut.format.js'
import type { RevolutStatementResult } from './revolut.types.js'

/**
 * This bank writes its file ordered by `Fecha de finalización`, the OLDEST first
 * (verified on the export of 2026-09-15: in that order, previous balance + amount
 * = balance on every completed row). That column is the booking date, so inside a
 * day the file order is the order of the movements.
 */
const statementOrder = 'oldest-first'

/** The only state that becomes a movement. */
const completedState = 'COMPLETADO'

/**
 * A state that is NOT a movement and is not a broken row either (decision of the
 * leader, approved by the human, feature 46): the operation was reversed, it has
 * no completion date and no balance, and it does not take part in the balance
 * chain. It is skipped without a report. Any OTHER state goes to `unparsedRows`.
 */
const reversedState = 'DEVUELTO'

/** The columns this parser reads. `Tipo`, `Producto` and `Comisión` are not read. */
type ColumnField =
  'valueDate' | 'bookingDate' | 'description' | 'amount' | 'currency' | 'state' | 'balance'

/**
 * Header names (accents stripped, lowercased) mapped to the field they fill. The
 * comment on each line says what the column holds -- and it also keeps the privacy
 * guardian of feature 14 from reading this list as a sentence copied out of
 * `var/`: these names are the bank's FORMAT, not a datum of the human's.
 */
const headerToField: Record<string, ColumnField> = {
  'fecha de inicio': 'valueDate', // cuando empezó la operación
  'fecha de finalizacion': 'bookingDate', // cuando se completó; vacía si se devolvió
  descripcion: 'description', // el concepto
  importe: 'amount', // con signo y punto decimal
  divisa: 'currency', // la divisa del importe
  state: 'state', // el estado, con el nombre de la columna en inglés
  saldo: 'balance', // saldo tras esa línea; vacío si se devolvió
}

const requiredFields = Object.values(headerToField)

type ColumnMap = Record<ColumnField, number>

interface HeaderRow {
  /** Index of the header inside the record list. */
  index: number
  columns: ColumnMap
  cellCount: number
}

/**
 * Parses the content of the `.csv` statement this bank exports into structured
 * movements, WITHOUT touching a database, Drive or moving anything. It is pure:
 * content in, structured result out.
 *
 * The shape it returns is the shared contract of `src/lib/parsed-statement.ts`
 * (ADR-013). Only the code that READS the file is this bank's own.
 *
 * How the file is read (feature 46):
 * - Decoded STRICTLY as UTF-8 (a leading BOM tolerated): bytes that are not
 *   UTF-8 reject the WHOLE file (`NotUtf8Error`).
 * - As a real CSV of commas with optional quotes (`revolut.csv.ts`).
 * - The header row is located by column NAME, not by position, and has to carry
 *   the seven columns this parser reads; otherwise the file is not a statement of
 *   this bank and the whole file is rejected (`ValidationError`).
 * - Above the header, only the hand-written `iban;<IBAN>` line is read. It is
 *   optional. No `saldo;` line is read: the file carries the balance on every
 *   line, so `accountBalance` is always `null`.
 * - Each data row is decided by its `State` FIRST: `COMPLETADO` becomes a movement,
 *   `DEVUELTO` is skipped with no report, and any other state is reported in
 *   `unparsedRows` with the state as the reason, so it never enters as settled nor
 *   disappears in silence.
 * - `bookingDate` is the day of `Fecha de finalización` and `valueDate` the day of
 *   `Fecha de inicio`; the time is discarded.
 * - `balance` is the `Saldo` of the line. An EMPTY `Saldo` on a completed row is
 *   `null` (not in the file); a written one that is not a number is reported.
 * - `Comisión` is never read nor added to the amount.
 *
 * Blank lines are skipped; a row that cannot be interpreted is collected in
 * `unparsedRows` with its 1-based line number and the reason. It never
 * deduplicates: two identical lines both appear.
 */
export function parseRevolutStatement(content: Buffer): RevolutStatementResult {
  // Rejecting bad bytes goes FIRST: the header is pure ASCII except for two
  // accents and would survive a bad decoding of the rest.
  const text = stripBom(decodeUtf8Strict(content))
  const records = readCsvRecords(text)

  const header = findHeaderRow(records)
  if (!header) {
    throw new ValidationError('Revolut header row not found: not a recognizable statement')
  }

  const drafts: ParsedMovementDraft[] = []
  const unparsedRows: UnparsedRow[] = []

  for (const record of records.slice(header.index + 1)) {
    if (isBlankRecord(record)) {
      continue
    }
    const parsed = parseDataRecord(record, header)
    if (parsed === null) {
      continue
    }
    if ('reason' in parsed) {
      unparsedRows.push({ row: record.line, reason: parsed.reason })
    } else {
      drafts.push(parsed)
    }
  }

  return {
    bank: 'revolut',
    // `null` when the line is absent or empty; when it IS written, normalized and
    // validated by the single shared reader, which rejects the whole file if what
    // is next to the label is not an IBAN (feature 21).
    accountIban: readPreambleIban(findIbanLine(records, header.index)),
    // The file carries the balance on every line; no account balance is read.
    accountBalance: null,
    // Numbering goes last and only over the parsed rows: a skipped or unparsed row
    // consumes no number (ADR-013).
    movements: assignDaySequence(drafts, statementOrder),
    unparsedRows,
  }
}

/** Finds the table header: the first record that carries the seven columns read. */
function findHeaderRow(records: CsvRecord[]): HeaderRow | null {
  for (const [index, record] of records.entries()) {
    const columns: Partial<ColumnMap> = {}
    record.cells.forEach((cell, position) => {
      const field = headerToField[normalizeHeader(cell)]
      if (field !== undefined && columns[field] === undefined) {
        columns[field] = position
      }
    })
    if (requiredFields.every((field) => columns[field] !== undefined)) {
      return { index, columns: columns as ColumnMap, cellCount: record.cells.length }
    }
  }
  return null
}

/**
 * Finds the hand-written `iban;<IBAN>` line ABOVE the header. It reads the RAW
 * line, never the CSV cells: it is not a row of the bank's table. The label is
 * everything before the first separator -- the documented `;`, or the comma of
 * this file, which is understood too (`docs/conventions.md` §Parsers de banco) --
 * and is matched ignoring case, accents and spaces. The value is the rest of the
 * line, without the filler separators an editor pads it with. The FIRST such line
 * wins. `:` is not a separator.
 */
function findIbanLine(
  records: CsvRecord[],
  headerIndex: number,
): { line: number; value: string } | null {
  for (const record of records.slice(0, headerIndex)) {
    const line = record.raw
    const separators = [line.indexOf(';'), line.indexOf(',')].filter((index) => index !== -1)
    const separator = separators.length === 0 ? -1 : Math.min(...separators)
    const label = separator === -1 ? line : line.slice(0, separator)
    if (normalizeLabel(label) !== 'iban') {
      continue
    }
    const value = separator === -1 ? '' : line.slice(separator + 1)
    return { line: record.line, value: cleanPreambleValue(value) }
  }
  return null
}

/**
 * Maps one data record to a movement, to a reason it is not interpretable, or to
 * `null` when the row is a reversed operation that is skipped on purpose.
 */
function parseDataRecord(
  record: CsvRecord,
  header: HeaderRow,
): ParsedMovementDraft | { reason: string } | null {
  const cells = record.cells
  if (cells.length !== header.cellCount) {
    return {
      reason: `número de columnas inesperado (${cells.length}, se esperaban ${header.cellCount})`,
    }
  }

  // The state decides first: a reversed row has no completion date and no
  // balance, so validating those before would report it as broken.
  const state = cellAt(cells, header.columns.state).toUpperCase()
  if (state === reversedState) {
    return null
  }
  if (state !== completedState) {
    return { reason: `estado no importable ('${state}'): solo entra ${completedState}` }
  }

  const problems: string[] = []

  const rawBookingDate = cellAt(cells, header.columns.bookingDate)
  const bookingDate = parseDateTimeAsDay(rawBookingDate)
  if (bookingDate === null) {
    problems.push(`fecha de finalización inválida ('${rawBookingDate}')`)
  }

  const rawValueDate = cellAt(cells, header.columns.valueDate)
  const valueDate = parseDateTimeAsDay(rawValueDate)
  if (valueDate === null) {
    problems.push(`fecha de inicio inválida ('${rawValueDate}')`)
  }

  const rawAmount = cellAt(cells, header.columns.amount)
  const amount = parseAmount(rawAmount)
  if (amount === null) {
    problems.push(`importe no interpretable ('${rawAmount}')`)
  }

  const rawBalance = cellAt(cells, header.columns.balance)
  const balance = rawBalance === '' ? null : parseAmount(rawBalance)
  if (rawBalance !== '' && balance === null) {
    problems.push(`saldo no interpretable ('${rawBalance}')`)
  }

  const description = cellAt(cells, header.columns.description)
  if (description === '') {
    problems.push('la fila no trae descripción')
  }

  if (problems.length > 0 || bookingDate === null || valueDate === null || amount === null) {
    return { reason: problems.join('; ') }
  }

  return {
    bookingDate,
    valueDate,
    description,
    amount,
    balance,
    currency: cellAt(cells, header.columns.currency),
    // Single point of the sign rule (feature 8): 0 is `neutral`, not an income.
    type: deriveMovementTypeFromAmount(amount),
  }
}

function cellAt(cells: string[], position: number): string {
  return (cells[position] ?? '').trim()
}

/** Drops the leading BOM some editors write; it is not part of the first cell. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Drops surrounding spaces and quotes and the filler separators an editor pads
 * the line with (`;;;`, `,,,`), only from the END of the value.
 */
function cleanPreambleValue(value: string): string {
  return value
    .trim()
    .replace(/[;,\s"]+$/, '')
    .replace(/^"/, '')
    .trim()
}

/** Normalizes the label of a hand-written line: no accents, lowercase, no spaces. */
function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["\s]+/g, '')
}

/** Normalizes a header cell: no accents, lowercase, spaces collapsed. */
function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
