import { describe, expect, it } from 'vitest'

import { parseBankinterXlsx, parseSpanishAmount, parseSpanishDate } from './bankinter.parser.js'
import { bankinterSampleFixture, buildStatementXlsx } from './bankinter.fixture.js'
import { ValidationError } from '../../errors/app-error.js'

describe('parseBankinterXlsx', () => {
  it('skips the preamble, locates the header and extracts the account IBAN', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    expect(result.bank).toBe('bankinter')
    expect(result.accountIban).toBe('ES9820385778983000760236')
    // 6 data rows, one of them non-parseable => 5 movements + 1 unrecognized.
    expect(result.movements).toHaveLength(5)
    expect(result.unparsedRows).toHaveLength(1)
  })

  it('maps every real column (incl. balance/currency) and interprets Spanish dates and amounts', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    // First data row, native-number amount and balance. toEqual pins the exact
    // shape, so it also proves there is no leftover concepto/tipoMovimiento.
    expect(result.movements[0]).toEqual({
      bookingDate: '2026-01-05',
      valueDate: '2026-01-05',
      description: 'TRANSF NOMINA EMPRESA',
      amount: 2500,
      balance: 5000,
      currency: 'EUR',
      type: 'income',
    })
    // Spanish text formats: amount '1.234,56' -> 1234.56, balance '6.159,06' -> 6159.06.
    const thousands = result.movements.find((m) => m.description === 'TRANSFERENCIA RECIBIDA')
    expect(thousands?.amount).toBe(1234.56)
    expect(thousands?.balance).toBe(6159.06)
    expect(thousands?.currency).toBe('EUR')
  })

  it('drops the removed concepto/tipoMovimiento fields from the model', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    expect(Object.keys(result.movements[0]).sort()).toEqual([
      'amount',
      'balance',
      'bookingDate',
      'currency',
      'description',
      'type',
      'valueDate',
    ])
  })

  it('derives type from the sign of the amount', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    const income = result.movements.find((m) => m.amount === 2500)
    const expense = result.movements.find((m) => m.amount === -75.5)
    expect(income?.type).toBe('income')
    expect(expense?.type).toBe('expense')
  })

  it('does NOT deduplicate: two identical rows are both returned', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    const repeated = result.movements.filter(
      (m) => m.description === 'PAGO TARJETA' && m.amount === -10,
    )
    expect(repeated).toHaveLength(2)
  })

  it('collects a non-interpretable row in unparsedRows with row number and reason, parsing the rest', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    expect(result.unparsedRows).toEqual([{ row: 15, reason: expect.stringContaining('importe') }])
    // The healthy rows around the broken one are still parsed.
    expect(result.movements).toHaveLength(5)
    expect(result.movements.some((m) => m.description === 'IMPORTE ILEGIBLE')).toBe(false)
  })

  it('parses the exact real Bankinter layout (native number amount and balance)', async () => {
    const buffer = await buildStatementXlsx({
      ibanLine: 'MOVIMIENTOS DE LA CUENTA ES1501280074010100032314',
      headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo', 'Divisa'],
      rows: [
        ['31/07/2026', '31/07/2026', 'RECIBO VISA CLASICA', -188.67, 24627.49, 'EUR'],
        ['31/07/2026', '31/07/2026', 'TRANSF NOMINA', 2197.72, 24816.16, 'EUR'],
      ],
    })

    const result = await parseBankinterXlsx(buffer)

    expect(result.accountIban).toBe('ES1501280074010100032314')
    expect(result.movements).toHaveLength(2)
    expect(result.movements[0]).toEqual({
      bookingDate: '2026-07-31',
      valueDate: '2026-07-31',
      description: 'RECIBO VISA CLASICA',
      amount: -188.67,
      balance: 24627.49,
      currency: 'EUR',
      type: 'expense',
    })
  })

  it('reports a row with a non-numeric balance as an unparsed row (balance is required)', async () => {
    const buffer = await buildStatementXlsx({
      headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo', 'Divisa'],
      rows: [['01/02/2026', '01/02/2026', 'SALDO ROTO', 10, 'no-num', 'EUR']],
    })

    const result = await parseBankinterXlsx(buffer)

    expect(result.movements).toHaveLength(0)
    expect(result.unparsedRows).toEqual([{ row: 10, reason: expect.stringContaining('saldo') }])
  })

  it('returns an empty IBAN when the preamble line is absent and defaults currency to empty', async () => {
    const buffer = await buildStatementXlsx({
      headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo'],
      rows: [['01/02/2026', '01/02/2026', 'ALGO', 10, 100]],
    })

    const result = await parseBankinterXlsx(buffer)

    expect(result.accountIban).toBe('')
    expect(result.movements).toHaveLength(1)
    // No Divisa column in this variant => currency defaults to ''.
    expect(result.movements[0].currency).toBe('')
  })

  it('throws ValidationError when there is no recognizable header row', async () => {
    const buffer = await buildStatementXlsx({
      headers: ['Columna A', 'Columna B', 'Columna C'],
      rows: [['x', 'y', 'z']],
    })

    await expect(parseBankinterXlsx(buffer)).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('parseSpanishAmount', () => {
  it('returns a native number unchanged (as the real export stores it)', () => {
    expect(parseSpanishAmount(-188.67)).toBe(-188.67)
    expect(parseSpanishAmount(2500)).toBe(2500)
  })

  it('parses Spanish text amounts with thousands and decimals', () => {
    expect(parseSpanishAmount('1.234,56')).toBe(1234.56)
    expect(parseSpanishAmount('-2.000,00')).toBe(-2000)
    expect(parseSpanishAmount('0,00')).toBe(0)
  })

  it('returns null for non-numeric text', () => {
    expect(parseSpanishAmount('abc')).toBeNull()
    expect(parseSpanishAmount('')).toBeNull()
    expect(parseSpanishAmount(null)).toBeNull()
  })
})

describe('parseSpanishDate', () => {
  it('converts dd/mm/yyyy to ISO YYYY-MM-DD', () => {
    expect(parseSpanishDate('05/05/2026')).toBe('2026-05-05')
    expect(parseSpanishDate('31/12/2026')).toBe('2026-12-31')
  })

  it('returns null for an invalid or malformed date', () => {
    expect(parseSpanishDate('32/01/2026')).toBeNull()
    expect(parseSpanishDate('2026-01-05')).toBeNull()
    expect(parseSpanishDate('not a date')).toBeNull()
  })
})
