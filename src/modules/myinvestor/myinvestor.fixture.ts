import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Test helper (not a test): builds a synthetic MyInvestor-shaped statement CSV
 * in memory. Every figure, concept and account number here is INVENTED: no real
 * bank data is ever copied into the repository (the real samples live in the
 * gitignored `var/drive-read/`), and no test touches the network.
 *
 * The layout mirrors the real export: `;` as the delimiter, five columns, UTF-8,
 * `\n` line endings and no balance column.
 */

/** The five columns of the real export, in the order the bank writes them. */
export const myinvestorHeaders = [
  'Fecha de operación',
  'Fecha de valor',
  'Concepto',
  'Importe',
  'Divisa',
]

/** A data row, or `null` for a blank line. */
export type CsvRow = string[] | null

export interface StatementCsvFixture {
  /** Prepend the UTF-8 BOM, as some re-exports do. */
  bom?: boolean
  /** Lines written before the header row (to move the header off line 1). */
  preamble?: string[]
  /** Header cells; defaults to the five real column names. */
  headers?: string[]
  /** Data rows; `null` writes a blank line. */
  rows?: CsvRow[]
  /** End the file with a newline, as the real export does. Default `true`. */
  trailingNewline?: boolean
}

export function buildStatementCsv(fixture: StatementCsvFixture = {}): Buffer {
  const lines = [
    ...(fixture.preamble ?? []),
    (fixture.headers ?? myinvestorHeaders).join(';'),
    ...(fixture.rows ?? myinvestorSampleRows()).map((row) => (row === null ? '' : row.join(';'))),
  ]
  const text = lines.join('\n') + (fixture.trailingNewline === false ? '' : '\n')
  return Buffer.from(`${fixture.bom ? '\uFEFF' : ''}${text}`, 'utf8')
}

/**
 * The same synthetic CSV, saved as cp1252 (ANSI) instead of UTF-8: exactly what
 * an editor does to the file when the human adds the `iban;` line (measured on
 * 2026-08-15, feature 17). Every byte is written explicitly here — no real file
 * is ever copied into a test — and the accented characters come out as the
 * single bytes cp1252 uses (`Ó` → `0xD3`), which are not valid UTF-8.
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
 * The canonical synthetic rows used across the tests, in the direction the bank
 * exports (most recent first). They cover every acceptance criterion:
 * - the five numeric shapes that coexist in one file (`-60`, `-9,49`, `-4200`,
 *   `-31.000`, `12.345,67`),
 * - three movements of the SAME booking date, plus a fourth unreadable row of
 *   that same day (so it can be proved it consumes no `daySequence`),
 * - two identical rows (no deduplication),
 * - an accented concept with `€` (UTF-8 decoding),
 * - a concept with a contract number and double spaces (copied verbatim),
 * - an amount of `0` (which must become `neutral`),
 * - an impossible calendar date (`31/02`),
 * - a concept holding an IBAN-shaped string (which must NOT become the
 *   `accountIban`).
 */
export function myinvestorSampleRows(): CsvRow[] {
  return [
    ['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR'],
    ['12/03/2026', '12/03/2026', 'IMPORTE ILEGIBLE', 'mil trescientos', 'EUR'],
    ['12/03/2026', '13/03/2026', 'SUSCRIPCIÓN AÑO PREMIUM €', '-9,49', 'EUR'],
    ['12/03/2026', '12/03/2026', 'TRASPASO  0000000000000  ORDEN', '-31.000', 'EUR'],
    null,
    ['10/03/2026', '10/03/2026', 'ABONO NOMINA FICTICIA', '12.345,67', 'EUR'],
    ['09/03/2026', '09/03/2026', 'PAGO DUPLICADO PRUEBA', '-4200', 'EUR'],
    ['09/03/2026', '09/03/2026', 'PAGO DUPLICADO PRUEBA', '-4200', 'EUR'],
    ['08/03/2026', '08/03/2026', 'AJUSTE A CERO', '0', 'EUR'],
    ['07/03/2026', '31/02/2026', 'FECHA IMPOSIBLE', '-1', 'EUR'],
    ['06/03/2026', '06/03/2026', 'TRANSFERENCIA A ES0012345678901234567890', '-12,34', 'EUR'],
  ]
}

/** The canonical fixture: header on line 1, the sample rows below it. */
export function myinvestorSampleFixture(): StatementCsvFixture {
  return { rows: myinvestorSampleRows() }
}

/**
 * Synthetic product files (feature 13). Same rule as the CSV above and one step
 * stricter: NOTHING here is real. Product names, FIGURES, rates and dates are
 * invented, and no real file of `var/drive-read/` is ever copied into a test.
 *
 * A figure is a personal datum on its own: an invented product name next to a
 * real amount still discloses the position. So the numbers below are round,
 * of a different order of magnitude, and match no real holding; what they keep
 * from the real files is only the SHAPE (decimals, signs, a percentage below
 * ten, a cash remainder much smaller than the market value).
 *
 * `Record<string, unknown>` on purpose: the tests need to build files that are
 * WRONG (an unknown key, a number written as text, a date in another format),
 * which a `ParsedProduct` would not let them express.
 */
export type ProductFile = Record<string, unknown>

/** A fund/ETF/managed-portfolio file, with every field of the template. */
export function buildProductFund(overrides: ProductFile = {}): ProductFile {
  return {
    type: 'fund',
    name: 'Fondo Sintetico Global',
    date: '2026-08-31',
    // Mandatory since feature 15, on the four types.
    openedAt: '2025-01-15',
    invested: 800,
    marketValue: 947.25,
    gain: 147.25,
    gainPercent: 18.41,
    ...overrides,
  }
}

/** A managed portfolio, the only type that usually carries uninvested cash. */
export function buildProductPortfolio(overrides: ProductFile = {}): ProductFile {
  return buildProductFund({
    type: 'managed_portfolio',
    name: 'Cartera Sintetica',
    uninvestedCash: 12.05,
    ...overrides,
  })
}

/** A deposit file, with the four conditions and no valuation field. */
export function buildProductDeposit(overrides: ProductFile = {}): ProductFile {
  return {
    type: 'deposit',
    name: 'Deposito Sintetico 3 meses',
    date: '2026-08-31',
    // Mandatory since feature 15, on the four types.
    openedAt: '2026-01-15',
    principal: 1200,
    interestRate: 1.5,
    expectedGain: 4.5,
    maturityDate: '2027-04-15',
    ...overrides,
  }
}

/** Serializes a product file the way the human would write it. */
export function buildProductJson(product: ProductFile): string {
  return `${JSON.stringify(product, null, 2)}\n`
}

/** Writes a local copy where the drive-read feature would leave it. */
export async function writeLocalCopy(
  sourceBaseDir: string,
  year: string,
  file: string,
  content: Buffer | string,
): Promise<string> {
  const dir = join(sourceBaseDir, 'myinvestor', year)
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  await writeFile(path, content)
  return path
}
