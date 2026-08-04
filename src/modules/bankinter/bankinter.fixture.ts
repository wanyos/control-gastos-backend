import ExcelJS from 'exceljs'

/**
 * Test helper (not a test): builds a synthetic Bankinter-shaped `.xlsx` in
 * memory with exceljs. All data is invented — no real bank data, no network.
 * The layout mirrors the real export: an IBAN preamble line, a few filter rows,
 * then the table header (default at row 9) and the data rows below it, so the
 * parser must skip the preamble and locate the header robustly.
 */
export interface StatementFixture {
  /** Full preamble line, e.g. `MOVIMIENTOS DE LA CUENTA ES..`. Omit to leave it out. */
  ibanLine?: string
  /** Extra `label | value` filter rows placed in the preamble (rows 4+). */
  preamble?: Array<[string, string]>
  /** Header row cells. */
  headers: string[]
  /** Data rows; `null` leaves a cell empty. */
  rows: Array<Array<string | number | null>>
  /** 1-based row the header is written to (data starts right below). Default 9. */
  headerRowNumber?: number
}

export async function buildStatementXlsx(fixture: StatementFixture): Promise<Buffer> {
  const headerRowNumber = fixture.headerRowNumber ?? 9
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Movimientos')

  if (fixture.ibanLine) {
    worksheet.getCell(1, 1).value = fixture.ibanLine
  }
  worksheet.getCell(3, 1).value = 'MOVIMIENTOS'

  let preambleRow = 4
  for (const [label, value] of fixture.preamble ?? []) {
    worksheet.getCell(preambleRow, 1).value = label
    worksheet.getCell(preambleRow, 2).value = value
    preambleRow++
  }

  fixture.headers.forEach((header, index) => {
    worksheet.getCell(headerRowNumber, index + 1).value = header
  })

  fixture.rows.forEach((cells, rowIndex) => {
    cells.forEach((value, colIndex) => {
      if (value !== null) {
        worksheet.getCell(headerRowNumber + 1 + rowIndex, colIndex + 1).value = value
      }
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as ArrayBuffer)
}

/**
 * The canonical synthetic fixture used across the tests. Header carries the six
 * REAL Bankinter columns (`Fecha contable | Fecha valor | Descripción | Importe |
 * Saldo | Divisa`) and the data covers every acceptance criterion:
 * - an income (positive) and an expense (negative),
 * - two identical rows (to prove no deduplication),
 * - a Spanish thousands amount as text (`1.234,56`),
 * - a native-number amount and a text saldo (both formats),
 * - a non-parseable row (unreadable amount) for `noReconocidas`.
 */
export function bankinterSampleFixture(): StatementFixture {
  return {
    ibanLine: 'MOVIMIENTOS DE LA CUENTA ES9820385778983000760236',
    preamble: [
      ['Concepto', '-'],
      ['Fecha', '01/01/2026 - 31/01/2026'],
      ['Tipo de movimiento', '-'],
      ['Importe', 'Desde 0,00 hasta -'],
    ],
    headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo', 'Divisa'],
    rows: [
      ['05/01/2026', '05/01/2026', 'TRANSF NOMINA EMPRESA', 2500, 5000, 'EUR'],
      ['06/01/2026', '06/01/2026', 'RECIBO LUZ IBERDROLA', -75.5, 4924.5, 'EUR'],
      ['07/01/2026', '07/01/2026', 'TRANSFERENCIA RECIBIDA', '1.234,56', '6.159,06', 'EUR'],
      ['08/01/2026', '08/01/2026', 'PAGO TARJETA', -10, 6149.06, 'EUR'],
      ['08/01/2026', '08/01/2026', 'PAGO TARJETA', -10, 6149.06, 'EUR'],
      ['09/01/2026', '09/01/2026', 'IMPORTE ILEGIBLE', 'abc', 6149.06, 'EUR'],
    ],
  }
}
