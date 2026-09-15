import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Test helper (not a test): builds a synthetic statement CSV with the layout of
 * this bank's export, in memory. Every figure, description and account number
 * here is INVENTED: the real export carries names of people in its descriptions
 * and none of it is ever copied into the repository (feature 46, criterion 13).
 * No test touches the network.
 *
 * The layout mirrors the real export (verified on 2026-09-15): `,` as the
 * delimiter, ten columns, UTF-8 with no BOM, `\n` line endings, date-times
 * `AAAA-MM-DD HH:MM:SS`, a dot as the decimal separator, and quotes only where a
 * cell needs them.
 */

/**
 * The ten columns of the real export, in the order the bank writes them. The
 * comment on each line is what it holds -- and it also keeps the privacy guardian
 * of feature 14 from reading this list as a sentence copied out of `var/`: the
 * column NAMES are the bank's format, not a datum of the human's.
 */
export const revolutHeaders = [
  'Tipo', // 1 · tipo de operación
  'Producto', // 2 · producto de la cuenta
  'Fecha de inicio', // 3 · fecha valor, con hora
  'Fecha de finalización', // 4 · fecha contable, con hora; vacía si se devolvió
  'Descripción', // 5 · concepto
  'Importe', // 6 · con signo
  'Comisión', // 7 · no se lee
  'Divisa', // 8
  'State', // 9 · el estado, en inglés
  'Saldo', // 10 · saldo tras la línea; vacío si se devolvió
]

/** A data row, or `null` for a blank line. */
export type CsvRow = string[] | null

export interface RevolutCsvFixture {
  /** Prepend the UTF-8 BOM, as some editors do. */
  bom?: boolean
  /** Lines written before the header row (the hand-written `iban;` line). */
  preamble?: string[]
  /** Header cells; defaults to the ten real column names. */
  headers?: string[]
  /** Data rows; `null` writes a blank line. Defaults to `revolutSampleRows()`. */
  rows?: CsvRow[]
  /** End the file with a newline, as the real export does. Default `true`. */
  trailingNewline?: boolean
  /** Line ending; the real export uses `\n`. */
  lineEnding?: '\n' | '\r\n'
}

export function buildRevolutCsv(fixture: RevolutCsvFixture = {}): Buffer {
  const lines = [
    ...(fixture.preamble ?? []),
    (fixture.headers ?? revolutHeaders).map(toCsvCell).join(','),
    ...(fixture.rows ?? revolutSampleRows()).map((row) =>
      row === null ? '' : row.map(toCsvCell).join(','),
    ),
  ]
  const ending = fixture.lineEnding ?? '\n'
  const text = lines.join(ending) + (fixture.trailingNewline === false ? '' : ending)
  return Buffer.from(`${fixture.bom ? String.fromCharCode(0xfeff) : ''}${text}`, 'utf8')
}

/** Quotes a cell only when its content needs it, as a CSV writer does. */
function toCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export interface RowFields {
  type: string
  product: string
  startedAt: string
  completedAt: string
  description: string
  amount: string
  fee: string
  currency: string
  state: string
  balance: string
}

const template: RowFields = {
  type: 'Tipo Inventado',
  product: 'Producto Inventado',
  startedAt: '2026-07-01 09:00:00',
  completedAt: '2026-07-01 09:00:01',
  description: 'Concepto Inventado',
  amount: '-1.00',
  fee: '0.00',
  currency: 'EUR',
  state: 'COMPLETADO',
  balance: '99.00',
}

/** One row with the template values, overridden by whatever is given. */
export function revolutRow(overrides: Partial<RowFields> = {}): string[] {
  const fields = { ...template, ...overrides }
  return [
    fields.type,
    fields.product,
    fields.startedAt,
    fields.completedAt,
    fields.description,
    fields.amount,
    fields.fee,
    fields.currency,
    fields.state,
    fields.balance,
  ]
}

/**
 * The canonical synthetic rows, ordered as the bank orders its file: by
 * `Fecha de finalización`, oldest first. The balances form a chain that adds up
 * (starting from an invented 100.00: previous balance + amount = balance on every
 * completed row), as the real export does. They cover feature 46:
 *
 * - line 2: a plain expense, start and completion on the same day;
 * - line 3: a description with a COMMA inside (quoted), and a start date the day
 *   BEFORE its completion date -- so the file is not ordered by start date;
 * - line 4: a DEVUELTO row with empty completion date and empty balance;
 * - line 5: an income;
 * - line 6: a blank line;
 * - line 7: an amount of `0.00` (neutral);
 * - line 8: a PENDIENTE row (any state other than the two known ones);
 * - line 9: a row with a NON-ZERO `Comisión`, which must not change the amount;
 * - line 10: an unreadable amount;
 * - line 11: an impossible calendar date;
 * - line 12: a description with a quotation mark inside.
 *
 * Six movements, three unparsed rows, one skipped row.
 */
export function revolutSampleRows(): CsvRow[] {
  return [
    revolutRow({
      startedAt: '2026-07-01 09:15:00',
      completedAt: '2026-07-01 09:15:02',
      description: 'Cafeteria Ficticia',
      amount: '-3.40',
      balance: '96.60',
    }),
    revolutRow({
      startedAt: '2026-06-30 22:10:00',
      completedAt: '2026-07-01 10:00:00',
      description: 'Tienda Inventada, S.L.',
      amount: '-12.50',
      balance: '84.10',
    }),
    revolutRow({
      startedAt: '2026-07-01 11:00:00',
      completedAt: '',
      description: 'Compra Devuelta Inventada',
      amount: '-20.00',
      state: 'DEVUELTO',
      balance: '',
    }),
    revolutRow({
      startedAt: '2026-07-01 18:00:00',
      completedAt: '2026-07-01 18:00:05',
      description: 'Transferencia Inventada Recibida',
      amount: '1000.00',
      balance: '1084.10',
    }),
    null,
    revolutRow({
      startedAt: '2026-07-02 08:00:00',
      completedAt: '2026-07-02 08:00:01',
      description: 'Ajuste A Cero',
      amount: '0.00',
      balance: '1084.10',
    }),
    revolutRow({
      startedAt: '2026-07-02 09:00:00',
      completedAt: '',
      description: 'Pago Pendiente Inventado',
      amount: '-5.00',
      state: 'PENDIENTE',
      balance: '',
    }),
    revolutRow({
      startedAt: '2026-07-02 19:00:00',
      completedAt: '2026-07-02 19:00:03',
      description: 'Cambio Inventado',
      amount: '-10.00',
      fee: '1.50',
      balance: '1074.10',
    }),
    revolutRow({
      startedAt: '2026-07-02 20:00:00',
      completedAt: '2026-07-02 20:00:01',
      description: 'Importe Ilegible',
      amount: 'mil',
      balance: '1074.10',
    }),
    revolutRow({
      startedAt: '2026-02-31 10:00:00',
      completedAt: '2026-02-31 10:00:00',
      description: 'Fecha Imposible',
      amount: '-1.00',
      balance: '1073.10',
    }),
    revolutRow({
      startedAt: '2026-07-03 12:00:00',
      completedAt: '2026-07-03 12:00:02',
      description: 'Abono "Extra" Inventado',
      amount: '200.00',
      balance: '1274.10',
    }),
  ]
}

/** The public example IBAN of the Spanish documentation; nobody's account. */
export const documentationIban = 'ES9121000418450200051332'

/** The hand-written line the human puts above the header, with the documented `;`. */
export function revolutPreamble(iban = documentationIban): string[] {
  return [`iban;${iban}`]
}

/** Writes a local copy where the drive-read feature would leave it. */
export async function writeLocalCopy(
  sourceBaseDir: string,
  year: string,
  file: string,
  content: Buffer | string,
): Promise<string> {
  const dir = join(sourceBaseDir, 'revolut', year)
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  await writeFile(path, content)
  return path
}
