import { ValidationError } from '../../errors/app-error.js'
import { assignDaySequence } from '../../lib/parsed-statement.js'
import type { ParsedMovementDraft, UnparsedRow } from '../../lib/parsed-statement.js'
import { decodeUtf8Strict } from '../../lib/utf8.js'
import { deriveMovementTypeFromAmount } from '../movements/movements.service.js'
import { isBlankRecord, readCsvRecords, type CsvRecord } from './n26.csv.js'
import { parseBankAmount, parseHandwrittenAmount, parseIsoStatementDate } from './n26.format.js'
import type { N26StatementResult } from './n26.types.js'

/** This bank writes the OLDEST movement first (verified on a real export). */
const statementOrder = 'oldest-first'

/** The columns of the export this parser reads; the other six stay in the file. */
type ColumnField =
  'bookingDate' | 'valueDate' | 'counterparty' | 'freeReference' | 'transactionType' | 'amount'

/**
 * Header names (case-insensitive) mapped to the fields they fill. The comment on
 * each line says what the column holds — and it also keeps the privacy guardian
 * of feature 14 from reading this list as a sentence copied out of `var/`: these
 * names are the bank's FORMAT, not a datum of the human's.
 */
const headerToField: Record<string, ColumnField> = {
  'booking date': 'bookingDate', // fecha contable
  'value date': 'valueDate', // fecha de valor, a menudo distinta
  'partner name': 'counterparty', // la contraparte
  'payment reference': 'freeReference', // texto libre, casi siempre vacío
  type: 'transactionType', // el tipo de apunte del banco
}

/**
 * The amount column is recognized by its prefix because its header carries the
 * currency in it (`Amount (EUR)`), which is also where the currency is read
 * from: the file states it once, in the header, and never per row.
 */
const amountHeaderPrefix = 'amount'

type ColumnMap = Partial<Record<ColumnField, number>>

interface HeaderRow {
  /** Index of the header inside the record list. */
  index: number
  /** 1-based line number of the header inside the file. */
  line: number
  columns: ColumnMap
  cellCount: number
  /** Currency declared by the amount column header, e.g. `EUR`; `''` if none. */
  currency: string
}

/**
 * Parses the content of an N26 bank statement (`.csv`) into structured
 * movements, WITHOUT touching a database, Drive or moving anything. It is pure:
 * content in, structured result out.
 *
 * The shape it returns is the shared contract of `src/lib/parsed-statement.ts`
 * (ADR-013), not an N26-specific model: only the code that READS the file is
 * this bank's own, and it shares not one line with any other bank's parser.
 *
 * How this file differs from the other CSV of the repo, and why it needs its own
 * reader: the separator is a COMMA and the fields are quoted, with commas inside
 * the quotes. Splitting the line by `,` would cut rows in half, so the records
 * come from a real quoted-CSV reader (`n26.csv.ts`). Dates already arrive as ISO
 * `YYYY-MM-DD` and amounts already use the dot as the decimal separator, so
 * neither is converted; the calendar day IS validated.
 *
 * The concept: this bank has NO description column. The one that names the
 * counterparty is almost always filled and the free-text reference is almost
 * always empty, so the description is COMPOSED of both, in that order, joined by
 * ` - ` and skipping whatever is empty. When neither is written the bank's own
 * transaction type is used as the last resort, so a movement never arrives with
 * an empty concept; a row where even that is missing is reported instead of
 * being given an invented name. Nothing else is folded in: the counterparty
 * IBAN, the account alias, the original amount, its currency and the exchange
 * rate have no place in the contract and are NOT invented as new fields.
 *
 * Two data this bank does not report, therefore emitted as an explicit `null`
 * and never invented, calculated or accumulated: the running balance of each
 * line, and the IBAN of the account. The last one, plus the balance OF THE
 * ACCOUNT, are written by the human as LABELLED PREAMBLE LINES above the header
 * row and read only from there: `iban;<IBAN>` → `accountIban` (never inferred
 * from the shape of a concept) and `saldo;<importe>` → `accountBalance`. They
 * keep the `;` of the rest of the project even though this file separates with
 * commas: it is one single way of writing them everywhere, and it makes our line
 * distinguishable at a glance from the bank's.
 *
 * The file is decoded STRICTLY as UTF-8 (with a leading BOM tolerated): bytes
 * that are not valid UTF-8 reject the WHOLE file instead of becoming `U+FFFD`
 * (feature 17). The header row is located by column name, not by position. Blank
 * lines are skipped; a line that cannot be interpreted is not dropped but
 * collected in `unparsedRows` with its 1-based line number and the reason. It
 * never deduplicates: two identical lines both appear.
 *
 * Throws for a failure of the WHOLE file and nothing else: `NotUtf8Error` when
 * its bytes are not UTF-8, and `ValidationError` for a structural failure (no
 * recognizable header row), i.e. the file is not an N26 statement. Both travel
 * as a per-file failure through the callers' `failed[]`, never as an error of
 * the request.
 */
export function parseN26Statement(content: Buffer): N26StatementResult {
  // Rejecting bad bytes is the FIRST thing done, before the header is even
  // looked for: the header of this export is pure ASCII and survives a bad
  // decoding, which would make a corrupted file look perfectly parsed.
  const text = stripBom(decodeUtf8Strict(content))
  const records = readCsvRecords(text)

  const header = findHeaderRow(records)
  if (!header) {
    throw new ValidationError('N26 header row not found: not a recognizable statement')
  }

  const drafts: ParsedMovementDraft[] = []
  const unparsedRows: UnparsedRow[] = []

  // The preamble is read BEFORE the table so its problems keep their place in
  // `unparsedRows`, which is ordered by line number like the rest of the file.
  const accountBalanceLine = findPreambleLine(records, header.index, 'saldo')
  const accountBalance =
    accountBalanceLine === null ? null : parseHandwrittenAmount(accountBalanceLine.value)
  // An ABSENT or EMPTY label is not a failure (the human simply did not write it
  // that month). A label that IS there with something unreadable next to it is
  // another matter: it is reported, never dropped in silence.
  if (accountBalanceLine !== null && accountBalanceLine.value !== '' && accountBalance === null) {
    unparsedRows.push({
      row: accountBalanceLine.line,
      reason: `saldo de la cuenta no interpretable ('${accountBalanceLine.value}')`,
    })
  }

  for (const record of records.slice(header.index + 1)) {
    if (isBlankRecord(record)) {
      continue
    }
    const parsed = parseDataRecord(record, header)
    if ('reason' in parsed) {
      unparsedRows.push({ row: record.line, reason: parsed.reason })
    } else {
      drafts.push(parsed)
    }
  }

  const ibanLine = findPreambleLine(records, header.index, 'iban')

  return {
    bank: 'n26',
    accountIban: ibanLine === null || ibanLine.value === '' ? null : ibanLine.value,
    // The balance of the ACCOUNT, exactly as the human wrote it: it is never
    // checked against the sum of the movements, and it is NOT the per-movement
    // balance above, which stays null for this bank forever (ADR-013).
    accountBalance,
    // Numbering goes last and only over the parsed rows: a row that ended up in
    // `unparsedRows` consumes no number (ADR-013).
    movements: assignDaySequence(drafts, statementOrder),
    unparsedRows,
  }
}

/**
 * Finds the table header: the first record carrying both a booking date and an
 * amount column. Returns its position, the map field → cell index (tolerant to
 * the column order) and the currency its amount header declares.
 */
function findHeaderRow(records: CsvRecord[]): HeaderRow | null {
  for (const [index, record] of records.entries()) {
    const columns: ColumnMap = {}
    let currency = ''

    record.cells.forEach((cell, position) => {
      const normalized = normalizeHeader(cell)
      const field = normalized.startsWith(amountHeaderPrefix) ? 'amount' : headerToField[normalized]
      if (!field || columns[field] !== undefined) {
        return
      }
      columns[field] = position
      if (field === 'amount') {
        currency = normalized.match(/\(([a-z]{3})\)/)?.[1].toUpperCase() ?? ''
      }
    })

    if (columns.bookingDate !== undefined && columns.amount !== undefined) {
      return { index, line: record.line, columns, cellCount: record.cells.length, currency }
    }
  }
  return null
}

/**
 * Reads a LABELLED PREAMBLE LINE the human writes by hand ABOVE the header row:
 * `iban;ES30…` (feature 12) and `saldo;1.234,56` (feature 16). One single finder
 * for both, because they are the same mechanism: looking only at the records
 * before the header, only at one whose LABEL — everything before the first
 * separator of the line — is exactly the label once normalized, and taking the
 * whole rest of the line as the value.
 *
 * 🔴 It reads the RAW line, never the cells of the CSV reader. These two lines
 * are NOT rows of the bank's table: they are written by hand with `;`, so the
 * reader — which cuts by the table's comma — turns `Saldo;1.234,56` into two
 * cells, and taking the first one would drop the cents WITHOUT A WORD. That is
 * the silent loss features 16 and 17 exist to prevent, and it is why the value
 * is taken from the text of the line and not from a cell.
 *
 * The separator of these two lines is the `;` of the rest of the project, not
 * the `,` of this file (decision of the leader, feature 18): one single way of
 * writing them, already documented, and the line stands out from the bank's at a
 * glance. A line the human wrote with the file's own comma instead is read all
 * the same — refusing to understand it would mean a silent `null` on a line he
 * considers written — but the documented form is the `;` one. Either way the
 * value is everything after the FIRST separator, so a Spanish figure survives
 * both spellings (`Saldo;1.234,56` and `Saldo,1.234,56` are both `1234.56`).
 *
 * The label is matched accent- and case-insensitively (`Saldo`, `SALDO`,
 * ` saldo ` are the same label): the human writes these lines by hand in a
 * Spanish editor, and demanding one exact spelling would reject a file he
 * considers correct. The filler separators an editor pads the line with (`;;;`
 * or `,,,`) are ignored.
 *
 * A value is never inferred from the SHAPE of a string: a concept that looks
 * like an IBAN, or a number in the table, is data of a movement and never the
 * account's. Looking only above the header is also what keeps a closing row of
 * the end of the file out.
 *
 * Returns the 1-based line number too, so a value that cannot be interpreted can
 * be reported with it. The FIRST labelled line wins if the label is repeated:
 * one hand-written label, one value.
 */
function findPreambleLine(
  records: CsvRecord[],
  headerIndex: number,
  label: string,
): { line: number; value: string } | null {
  for (const record of records.slice(0, headerIndex)) {
    const line = record.raw
    const separator = firstSeparatorIndex(line)
    const written = separator === -1 ? line : line.slice(0, separator)
    if (normalizeLabel(written) !== label) {
      continue
    }
    const value = separator === -1 ? '' : line.slice(separator + 1)
    return { line: record.line, value: cleanPreambleValue(value) }
  }
  return null
}

/**
 * Where the label of a preamble line ends: the first `;` (the documented form)
 * or the first `,` (the file's own separator, understood too), whichever comes
 * first. `-1` when the line carries only the label and no value at all.
 */
function firstSeparatorIndex(line: string): number {
  const candidates = [line.indexOf(';'), line.indexOf(',')].filter((index) => index !== -1)
  return candidates.length === 0 ? -1 : Math.min(...candidates)
}

/**
 * Drops the leading BOM some editors write. It is valid UTF-8 (so the strict
 * decoder lets it through, on purpose) but it is not part of the first header
 * cell, and leaving it there would stop that cell from matching its name.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Drops the surrounding spaces and quotes, and the filler separators an editor
 * pads the line with (`;;;`, `,,,`). Only from the END: a separator in the
 * MIDDLE of the value is part of it, which is what keeps the cents of
 * `1.234,56` where they are.
 */
function cleanPreambleValue(value: string): string {
  return value
    .trim()
    .replace(/[;,\s"]+$/, '')
    .replace(/^"/, '')
    .trim()
}

/** Maps a single data record to a movement, or to a reason it is not interpretable. */
function parseDataRecord(
  record: CsvRecord,
  header: HeaderRow,
): ParsedMovementDraft | { reason: string } {
  const cells = record.cells
  if (cells.length !== header.cellCount) {
    return {
      reason: `número de columnas inesperado (${cells.length}, se esperaban ${header.cellCount})`,
    }
  }

  const problems: string[] = []

  const rawBookingDate = cellAt(cells, header.columns.bookingDate)
  const bookingDate = parseIsoStatementDate(rawBookingDate)
  if (bookingDate === null) {
    problems.push(`fecha contable inválida ('${rawBookingDate}')`)
  }

  // The value date is its own datum and is never copied from the booking date:
  // they differ often in this export, so filling one with the other would lose
  // it. A file with no such column is another matter: see `valueDateOf`.
  const rawValueDate = cellAt(cells, header.columns.valueDate)
  const valueDate = valueDateOf(rawValueDate, bookingDate, header)
  if (valueDate === null) {
    problems.push(`fecha de valor inválida ('${rawValueDate}')`)
  }

  const rawAmount = cellAt(cells, header.columns.amount)
  const amount = parseBankAmount(rawAmount)
  if (amount === null) {
    problems.push(`importe no interpretable ('${rawAmount}')`)
  }

  const description = composeDescription(cells, header)
  if (description === '') {
    problems.push('la fila no trae ningún dato con el que componer el concepto')
  }

  if (bookingDate === null || valueDate === null || amount === null || description === '') {
    return { reason: problems.join('; ') }
  }

  return {
    bookingDate,
    valueDate,
    description,
    amount,
    // This bank reports no running balance and none is ever invented.
    balance: null,
    // Declared once by the header of the amount column, not row by row.
    currency: header.currency,
    // Single point of the sign rule (feature 8): 0 is `neutral`, not an income.
    type: deriveMovementTypeFromAmount(amount),
  }
}

/**
 * The value date of a row. When the export carries no such column at all, the
 * booking date is used: the contract has no `null` for it, and inventing a
 * different date would be worse than saying "the file only gave one". When the
 * column IS there, its content is what counts and an unreadable one is reported.
 */
function valueDateOf(raw: string, bookingDate: string | null, header: HeaderRow): string | null {
  if (header.columns.valueDate === undefined) {
    return bookingDate
  }
  return parseIsoStatementDate(raw)
}

/**
 * Composes the concept of a movement, which this bank does not export as a
 * column of its own (feature 18, criterion 11).
 *
 * `Partner Name` names the counterparty and is what the human recognizes when he
 * reads his statement; `Payment Reference` is the free text of the transfer and
 * is written only now and then. Both are kept, in that order, joined by ` - `,
 * because either one alone loses information the other has: without the partner
 * a transfer is anonymous, and without the reference two transfers to the same
 * person are indistinguishable. Whatever is empty is skipped, and a reference
 * that only repeats the partner is not appended twice.
 *
 * When BOTH are empty the bank's own transaction type is used as the last
 * resort. It says little, but it is always written, and losing a movement whose
 * date and amount are perfectly readable would cost more than a poor concept.
 *
 * Returns `''` when not even that is there, which is a row to report: no
 * movement is ever given an invented concept.
 */
function composeDescription(cells: string[], header: HeaderRow): string {
  const counterparty = cellAt(cells, header.columns.counterparty)
  const reference = cellAt(cells, header.columns.freeReference)

  if (counterparty !== '' && reference !== '' && !equalsIgnoringCase(counterparty, reference)) {
    return `${counterparty} - ${reference}`
  }
  if (counterparty !== '') {
    return counterparty
  }
  return reference !== '' ? reference : cellAt(cells, header.columns.transactionType)
}

function equalsIgnoringCase(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
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
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["\s]+/g, '')
}

/** Normalizes a header cell: accents stripped, lowercased, spaces collapsed. */
function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
