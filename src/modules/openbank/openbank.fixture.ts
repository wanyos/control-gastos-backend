import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Test helper (not a test): builds a synthetic Openbank-shaped statement in
 * memory. Every concept, account number, holder name AND FIGURE here is
 * INVENTED, and this file is the reason it can stay that way: the real export
 * of this bank carries THE NAME OF ITS HOLDER, the names of third parties inside
 * the concepts and, on every row, an amount and a running balance of a real
 * account. None of them is ever copied into the repository (the real samples
 * live in the gitignored `var/drive-read/`). No test touches the network.
 *
 * 🔴 THE FIGURES ARE THE EASY ONE TO GET WRONG, and this file already did once
 * (review of feature 19): the concepts and the names were invented from the
 * start, and the amounts had been taken from the real file while writing the
 * fixture — one row with its balance included, and the rest in the same relative
 * order as the first rows of the real export. Copied figures are a leak exactly
 * like a copied name, the ADR-017 is about financial data and not only about
 * people, and no guardian catches it today for this bank (its file is `.xls` and
 * the comparison layer does not read that extension). So, when a figure is
 * touched here: invent it, never «perturb» a real one, keep the neighbouring
 * (amount, balance) pairs invented too, and check the new value against the
 * gitignored sample before committing.
 *
 * The layout mirrors the real file, which is what makes the fixture worth
 * anything: an XHTML page with a `charset=iso-8859-1` declaration and ONE table
 * whose every row carries ten cells — five decorative spacers, self-closed and
 * empty, alternating with the five that hold the content. The bytes are written
 * in cp1252, the encoding the bank emits.
 */

/**
 * The five column names of the real header, which is what the parser looks for.
 *
 * Each one on its own line with a comment, on purpose: written as a plain
 * sequence they reproduce a run of words of the real file and the privacy
 * guardian of feature 14 reads them as copied data (it happened for real with
 * the previous bank). They are the FORMAT of the bank, not a datum of the
 * human.
 */
export const openbankHeaders = [
  'Fecha Operación', // 1 · fecha contable
  'Fecha Valor', // 2 · fecha de valor, a veces distinta de la anterior
  'Concepto', // 3 · el concepto, entero y sin trocear
  'Importe', // 4 · el importe con su signo delante
  'Saldo', // 5 · el saldo TRAS el movimiento, que se lee y no se guarda
]

/** A row of the preamble: a label and its value, as the bank prints them. */
export interface PreambleRow {
  label: string
  value: string
}

export interface OpenbankStatementFixture {
  /**
   * The hand-written IBAN comment of the first line. `null` writes no comment
   * at all (the file as the bank gives it, before the human touches it).
   */
  iban?: string | null
  /** What the `<meta>` declares. `null` writes no `<meta>` at all. */
  charset?: string | null
  /** Rows of the preamble; `undefined` uses the synthetic default. */
  preamble?: PreambleRow[]
  /** Value of the `Saldo:` row of the preamble; `null` omits that row. */
  balance?: string | null
  /** Header cells; defaults to the five real column names. */
  headers?: string[]
  /** Movement rows (five cells each, normally); defaults to the sample below. */
  rows?: string[][]
  /** How the bytes are written. The bank emits cp1252; `utf8` is for R3. */
  encoding?: 'cp1252' | 'utf8'
}

export function buildOpenbankStatement(fixture: OpenbankStatementFixture = {}): Buffer {
  const text = buildOpenbankStatementText(fixture)
  return fixture.encoding === 'utf8' ? Buffer.from(text, 'utf8') : toCp1252(text)
}

/** The same document as text, for the tests of the HTML reader itself. */
export function buildOpenbankStatementText(fixture: OpenbankStatementFixture = {}): string {
  const iban = fixture.iban === undefined ? documentationIban : fixture.iban
  const charset = fixture.charset === undefined ? 'iso-8859-1' : fixture.charset
  const balance = fixture.balance === undefined ? '1.234,56 EUR' : fixture.balance

  const preambleRows = (fixture.preamble ?? syntheticPreamble()).map((entry) =>
    tableRow([entry.label, entry.value, '', '', '']),
  )
  const balanceRow = balance === null ? [] : [tableRow(['Saldo:', balance, '', '', ''])]
  const meta =
    charset === null
      ? ''
      : `<meta http-equiv="Content-Type" content="text/html; charset=${charset}" />`

  return [
    iban === null ? '' : `<!-- iban;${iban} -->`,
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">',
    '<html xml:lang="es" lang="es"><head>',
    meta,
    '</head><body><table>',
    decorativeRow(),
    ...preambleRows,
    ...balanceRow,
    decorativeRow(),
    tableRow(fixture.headers ?? openbankHeaders, 'CuerpoDetalleTitulo'),
    ...(fixture.rows ?? openbankSampleRows()).map((row) => tableRow(row)),
    decorativeRow(),
    '</table></body></html>',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * A row as the bank writes it: ten cells, the odd ones being self-closed
 * spacers with no content and the even ones carrying the text wrapped in a
 * `<font>` (and in a `<b>` when it is the header). A content cell with nothing
 * inside is written self-closed too, exactly as the real file does.
 */
function tableRow(cells: string[], fontId = 'CuerpoDetalle'): string {
  const html = cells
    .map((cell) => {
      const spacer = '<td id="TDSeparadorInicial" />'
      const text = fontId === 'CuerpoDetalleTitulo' ? `<b>${cell}</b>` : cell
      const content =
        cell === ''
          ? '<td id="TDListadoBorderBottom" />'
          : `<td id="TDListadoBorderBottom" width="95" align="left"><font id="${fontId}">${text}</font></td>`
      return `${spacer}${content}`
    })
    .join('')
  return `<tr>${html}</tr>`
}

/** A row of ten empty cells: the separators the export pads its layout with. */
function decorativeRow(): string {
  return tableRow(['', '', '', '', ''])
}

/**
 * The preamble rows that are NOT the balance: download date, account number
 * (a CCC, never an IBAN), product description and holder. All invented, and all
 * of them must be ignored IN SILENCE by the parser.
 */
export function syntheticPreamble(): PreambleRow[] {
  return [
    { label: 'Fecha de descarga:', value: '19/08/2026 10:15' },
    { label: 'Número de Cuenta:', value: '0000 0000 00 0000000000' },
    { label: 'Descripción:', value: 'CUENTA SINTETICA DE PRUEBA' },
    { label: 'Titular:', value: 'PERSONA INVENTADA DE PRUEBA' },
  ]
}

/**
 * The canonical synthetic movements, in the direction the bank exports them
 * (MOST RECENT FIRST, measured on the real file). Between them they cover:
 *
 * - three movements sharing a booking date, so `daySequence` can be checked to
 *   number the oldest of the day as `1` even though the file lists it last,
 * - a booking date and a value date that differ,
 * - an amount with thousands, a negative one, a positive one and a `0` (which
 *   must come out `neutral`, never an income),
 * - two identical rows (nothing is ever deduplicated),
 * - an accented concept, which only survives if the file is decoded as cp1252,
 * - an unreadable amount and an impossible calendar date (both reported, both
 *   consuming no `daySequence`),
 * - an IBAN-shaped string inside a concept, which must NOT become the
 *   `accountIban`,
 * - and a movement of two years back, because the whole history enters.
 */
export function openbankSampleRows(): string[][] {
  return [
    ['17/08/2026', '16/08/2026', 'COMPRA TARJETA TIENDA INVENTADA', '-37,49', '12.409,31'],
    ['17/08/2026', '17/08/2026', 'RECIBO SUSCRIPCIÓN INVENTADA', '-482,13', '12.446,80'],
    [
      '17/08/2026',
      '17/08/2026',
      'TRANSFERENCIA A ES0012345678901234567890',
      '-2.615,08',
      '12.928,93',
    ],
    ['27/07/2026', '27/07/2026', 'NOMINA INVENTADA DE JULIO', '947,62', '15.544,01'],
    ['26/07/2026', '26/07/2026', 'AJUSTE A CERO', '0,00', '14.596,39'],
    ['25/07/2026', '25/07/2026', 'PAGO REPETIDO INVENTADO', '-88,77', '14.596,39'],
    ['25/07/2026', '25/07/2026', 'PAGO REPETIDO INVENTADO', '-88,77', '14.685,16'],
    ['24/07/2026', '24/07/2026', 'IMPORTE ILEGIBLE', 'mil trescientos', '14.773,93'],
    ['31/02/2026', '31/02/2026', 'FECHA IMPOSIBLE', '-6,23', '14.773,93'],
    ['28/08/2024', '28/08/2024', 'INGRESO INICIAL INVENTADO', '8.253,47', '14.780,16'],
  ]
}

/** The public example IBAN of the Spanish documentation; the account of nobody. */
export const documentationIban = 'ES9121000418450200051332'

/**
 * Encodes text as cp1252, which is what this bank emits. Only what a Spanish
 * statement needs: the latin-1 range, whose code points are their own byte,
 * plus the euro sign at `0x80`. Anything else throws instead of being silently
 * dropped: a fixture must be exactly the bytes it claims to be.
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

/** Writes a local copy where the drive-read feature would leave it. */
export async function writeLocalCopy(
  sourceBaseDir: string,
  year: string,
  file: string,
  content: Buffer | string,
): Promise<string> {
  const dir = join(sourceBaseDir, 'openbank', year)
  await mkdir(dir, { recursive: true })
  const path = join(dir, file)
  await writeFile(path, content)
  return path
}

/**
 * A month-sized statement: `count` movement rows, all readable, ALL INVENTED by
 * construction — every figure is computed from the index here and no value of
 * this function was ever read from a real file (feature 14).
 *
 * It exists for the no-regression test of feature 22: a legitimate export has to
 * keep entering whole (200 movements, 0 `unparsedRows`) after adding a guard
 * that rejects files. Every row carries an accent, which is the point: those are
 * the bytes that make a genuine cp1252 file invalid UTF-8, and the guard must
 * read that as «the file backs its declaration up», never as a reason to reject.
 */
export function openbankManyRows(count: number): string[][] {
  return Array.from({ length: count }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0')
    const month = String((index % 12) + 1).padStart(2, '0')
    const cents = String((index * 7) % 100).padStart(2, '0')
    const amount = `-${(index % 89) + 1},${cents}`
    const balance = `${1000 + index},${cents}`
    return [
      `${day}/${month}/2026`,
      `${day}/${month}/2026`,
      `GESTIÓN SINTÉTICA NÚMERO ${index}`,
      amount,
      balance,
    ]
  })
}

/**
 * Exactly what Visual Studio Code did to the real statement on 2026-08-19, and
 * the reason feature 22 exists: it read the cp1252 bytes AS UTF-8 (where they
 * are invalid), replaced each of them with `U+FFFD`, and saved the result back
 * **as UTF-8** — leaving the `<meta charset=iso-8859-1>` of the file untouched.
 *
 * Reproduced here as a transformation of the bytes, not as a copy of anything:
 * the non-fatal decoder is the same one every editor uses.
 */
export function resaveInUtf8AsAnEditorWould(cp1252Bytes: Buffer): Buffer {
  const misread = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(cp1252Bytes)
  return Buffer.from(misread, 'utf8')
}
