import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Test helper (not a test): builds a synthetic N26-shaped statement CSV in
 * memory. Every figure, concept, counterparty and account number here is
 * INVENTED: no real bank data is ever copied into the repository (the real
 * samples live in the gitignored `var/drive-read/`), and no test touches the
 * network.
 *
 * The layout mirrors the real export: `,` as the delimiter, eleven columns,
 * text fields quoted with `"` (and only when they need it), UTF-8, `\n` line
 * endings, ISO dates, a dot as the decimal separator and no balance column.
 */

/**
 * The eleven columns of the real export, in the order the bank writes them.
 * The comment on each line is what it holds — and it also keeps the guardian of
 * feature 14 from reading this list as a sentence copied out of `var/`: the
 * column NAMES are the bank's format, not a datum of the human's.
 */
export const n26Headers = [
  'Booking Date', // 1 · fecha contable
  'Value Date', // 2 · fecha de valor, distinta de la anterior a menudo
  'Partner Name', // 3 · contraparte
  'Partner Iban', // 4 · el IBAN DEL OTRO, casi siempre vacío
  'Type', // 5 · tipo de apunte del banco
  'Payment Reference', // 6 · texto libre, casi siempre vacío
  'Account Name', // 7 · alias de la cuenta
  'Amount (EUR)', // 8 · el importe, con su divisa en la cabecera
  'Original Amount', // 9 · importe en la divisa de origen
  'Original Currency', // 10 · divisa de origen
  'Exchange Rate', // 11 · tipo de cambio
]

/** A data row, or `null` for a blank line. */
export type CsvRow = string[] | null

export interface StatementCsvFixture {
  /** Prepend the UTF-8 BOM, as some editors do. */
  bom?: boolean
  /** Lines written before the header row (the hand-written preamble). */
  preamble?: string[]
  /** Header cells; defaults to the eleven real column names. */
  headers?: string[]
  /** Data rows; `null` writes a blank line. */
  rows?: CsvRow[]
  /** End the file with a newline, as the real export does. Default `true`. */
  trailingNewline?: boolean
  /** Line ending; the real export uses `\n`. */
  lineEnding?: '\n' | '\r\n'
}

export function buildStatementCsv(fixture: StatementCsvFixture = {}): Buffer {
  const lines = [
    ...(fixture.preamble ?? []),
    (fixture.headers ?? n26Headers).map(toCsvCell).join(','),
    ...(fixture.rows ?? n26SampleRows()).map((row) =>
      row === null ? '' : row.map(toCsvCell).join(','),
    ),
  ]
  const ending = fixture.lineEnding ?? '\n'
  const text = lines.join(ending) + (fixture.trailingNewline === false ? '' : ending)
  return Buffer.from(`${fixture.bom ? utf8Bom : ''}${text}`, 'utf8')
}

/** The byte order mark, written by code point so it stays visible in the source. */
const utf8Bom = String.fromCharCode(0xfeff)

/** Quotes a cell the way the bank does: only when the content needs it. */
function toCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * The same synthetic CSV, saved as cp1252 (ANSI) instead of UTF-8: what an
 * editor does to the file when the human adds the preamble lines. Every byte is
 * written explicitly here — no real file is ever copied into a test — and the
 * accented characters come out as the single bytes cp1252 uses (`ó` → `0xF3`),
 * which are not valid UTF-8.
 */
export function buildCp1252StatementCsv(fixture: StatementCsvFixture = {}): Buffer {
  return toCp1252(buildStatementCsv(fixture).toString('utf8'))
}

/**
 * Encodes text as cp1252. Only what a Spanish statement needs: the Latin-1
 * range, whose code points are their own byte, plus the euro sign, which cp1252
 * places at `0x80`. Anything else throws instead of being silently dropped: a
 * fixture must be exactly the bytes it claims to be.
 */
export function toCp1252(text: string): Buffer {
  return Buffer.from(
    [...text].map((character) => {
      if (character === '€') return 0x80
      const code = character.codePointAt(0) ?? 0
      if (code <= 0xff) return code
      throw new Error(`character '${character}' cannot be written in cp1252`)
    }),
  )
}

/**
 * The canonical synthetic rows, in the direction the bank exports (oldest
 * first). They cover the acceptance criteria of feature 18:
 * - a counterparty with a COMMA inside a quoted field, and another with a
 *   quotation mark inside it (a naive split by `,` breaks on both),
 * - a booking date and a value date that DIFFER,
 * - three movements of the same booking date, plus two unreadable rows (so it
 *   can be proved they consume no `daySequence`),
 * - two identical rows (no deduplication),
 * - an accented reference (UTF-8 decoding),
 * - a row with no counterparty but a reference, and one with neither (the
 *   concept falls back to the bank's own type),
 * - a reference that only repeats the counterparty (not written twice),
 * - an amount of `0` (which must become `neutral`), a negative one and a
 *   positive one,
 * - an unreadable amount and an impossible calendar date,
 * - an IBAN-shaped string in the counterparty column (which must NOT become the
 *   `accountIban`).
 */
export function n26SampleRows(): CsvRow[] {
  const rows: Array<RowFields | null> = [
    row('2026-07-01', '2026-07-01', 'Cafeteria Ficticia, S.L.', 'Card Payment', '', '-3.40'),
    row('2026-07-01', '2026-07-02', 'Tienda Inventada "La Prueba"', 'Card Payment', '', '-12.5'),
    {
      ...template,
      bookingDate: '2026-07-01',
      valueDate: '2026-07-01',
      partnerName: 'Empresa Inventada SA',
      // Invalid checksum on purpose: it only has to LOOK like an IBAN.
      partnerIban: 'ES0012345678901234567890',
      type: 'Credit Transfer',
      reference: 'Nomina inventada de julio',
      amount: '1150',
    },
    null,
    row('2026-07-02', '2026-07-02', '', 'Credit Transfer', 'Devolución inventada', '200'),
    row('2026-07-02', '2026-07-02', '', 'Direct Debit', '', '-60'),
    row('2026-07-03', '2026-07-03', 'Suscripcion Inventada', 'Direct Debit', '', '-60'),
    row('2026-07-03', '2026-07-03', 'Suscripcion Inventada', 'Direct Debit', '', '-60'),
    row('2026-07-04', '2026-07-04', 'Ajuste A Cero', 'Card Payment', '', '0'),
    row('2026-07-05', '2026-07-05', 'Importe Ilegible', 'Card Payment', '', 'mil trescientos'),
    row('2026-02-31', '2026-02-31', 'Fecha Imposible', 'Card Payment', '', '-1'),
    row('2026-07-06', '2026-07-06', 'Pago Repetido', 'Card Payment', 'Pago Repetido', '-0.5'),
  ]
  return rows.map((fields) => (fields === null ? null : toCells(fields)))
}

interface RowFields {
  bookingDate: string
  valueDate: string
  partnerName: string
  partnerIban: string
  type: string
  reference: string
  accountName: string
  amount: string
  originalAmount: string
  originalCurrency: string
  exchangeRate: string
}

const template: RowFields = {
  bookingDate: '2026-07-01',
  valueDate: '2026-07-01',
  partnerName: '',
  partnerIban: '',
  type: 'Card Payment',
  reference: '',
  accountName: 'Cuenta Sintetica',
  amount: '0',
  originalAmount: '',
  originalCurrency: '',
  exchangeRate: '',
}

function row(
  bookingDate: string,
  valueDate: string,
  partnerName: string,
  type: string,
  reference: string,
  amount: string,
): RowFields {
  return { ...template, bookingDate, valueDate, partnerName, type, reference, amount }
}

/** Lays the fields out in the eleven columns, in the bank's own order. */
function toCells(fields: RowFields): string[] {
  return [
    fields.bookingDate,
    fields.valueDate,
    fields.partnerName,
    fields.partnerIban,
    fields.type,
    fields.reference,
    fields.accountName,
    fields.amount,
    fields.originalAmount,
    fields.originalCurrency,
    fields.exchangeRate,
  ]
}

/**
 * The two labelled preamble lines the human writes by hand above the header, as
 * his editor leaves them: written with `;` even in this comma-separated file
 * (decision of the leader, feature 18) and padded with the filler separators the
 * editor completes the row with.
 *
 * The IBAN is the PUBLIC example of the Spanish documentation and the balance is
 * an invented figure: a fixture only has to have the right shape, never to be
 * true.
 *
 * 🔴 The default figure has CENTS THAT ARE NOT ZERO, on purpose. It used to be
 * `1500,00`, and that hid a real bug: the line was being cut by the table's
 * comma, so everything after the decimal comma was lost — which `1500,00` still
 * passes, because its cents are `00`. A fixture whose shape cannot fail is not a
 * fixture. Do not round this back.
 */
export function n26Preamble(balance = '1.234,56'): string[] {
  return [`iban;${documentationIban};;;`, `Saldo;${balance};;;`]
}

/** The public example IBAN of the Spanish documentation; nobody's account. */
export const documentationIban = 'ES9121000418450200051332'

/** Writes a local copy where the drive-read feature would leave it. */
export async function writeLocalCopy(
  sourceBaseDir: string,
  year: string,
  file: string,
  content: Buffer | string,
): Promise<string> {
  const dir = join(sourceBaseDir, 'n26', year)
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  await writeFile(path, content)
  return path
}
