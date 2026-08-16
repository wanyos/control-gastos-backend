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
      daySequence: 1,
    })
    // Spanish text formats: amount '1.234,56' -> 1234.56, balance '6.159,06' -> 6159.06.
    const thousands = result.movements.find((m) => m.description === 'TRANSFERENCIA RECIBIDA')
    expect(thousands?.amount).toBe(1234.56)
    expect(thousands?.balance).toBe(6159.06)
    expect(thousands?.currency).toBe('EUR')
  })

  it('emits exactly the fields of the shared contract (no Bankinter-only field)', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    expect(Object.keys(result.movements[0]).sort()).toEqual([
      'amount',
      'balance',
      'bookingDate',
      'currency',
      'daySequence',
      'description',
      'type',
      'valueDate',
    ])
    expect(Object.keys(result).sort()).toEqual([
      'accountBalance',
      'accountIban',
      'bank',
      'movements',
      'unparsedRows',
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

  it('emits a zero amount as neutral, NOT as income (feature 11, deliberate change)', async () => {
    const buffer = await buildStatementXlsx({
      headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo', 'Divisa'],
      rows: [
        ['01/02/2026', '01/02/2026', 'REGULARIZACION SIN IMPORTE', 0, 100, 'EUR'],
        ['01/02/2026', '01/02/2026', 'COMISION CERO EN TEXTO', '0,00', 100, 'EUR'],
      ],
    })

    const result = await parseBankinterXlsx(buffer)

    expect(result.movements.map((m) => m.type)).toEqual(['neutral', 'neutral'])
    expect(result.movements.map((m) => m.amount)).toEqual([0, 0])
  })

  it('numbers every movement inside its day, counting from the oldest of the day', async () => {
    // The canonical fixture is written oldest-first on purpose (it predates this
    // feature and pins the non-regression); Bankinter's REAL order is checked in
    // the real-layout test below. Here what matters is that the two rows sharing
    // 2026-01-08 get 1 and 2, and that a day with a single row gets 1.
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    expect(result.movements.map((m) => [m.bookingDate, m.daySequence])).toEqual([
      ['2026-01-05', 1],
      ['2026-01-06', 1],
      ['2026-01-07', 1],
      ['2026-01-08', 2],
      ['2026-01-08', 1],
    ])
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

  it('parses the real Bankinter layout (native number amount and balance)', async () => {
    const buffer = await buildStatementXlsx({
      ibanLine: 'MOVIMIENTOS DE LA CUENTA ES9820385778983000760236',
      headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo', 'Divisa'],
      rows: [
        ['31/07/2026', '31/07/2026', 'RECIBO CUOTA GIMNASIO', -45.37, 9954.63, 'EUR'],
        ['31/07/2026', '31/07/2026', 'TRANSF NOMINA', 1500, 10000, 'EUR'],
      ],
    })

    const result = await parseBankinterXlsx(buffer)

    expect(result.accountIban).toBe('ES9820385778983000760236')
    expect(result.movements).toHaveLength(2)
    // Bankinter exports the most recent first: the balances prove it
    // (10000,00 − 45,37 = 9954,63), so the FIRST row of the file is the
    // LAST movement of the day and gets daySequence 2, not 1.
    expect(result.movements[0]).toEqual({
      bookingDate: '2026-07-31',
      valueDate: '2026-07-31',
      description: 'RECIBO CUOTA GIMNASIO',
      amount: -45.37,
      balance: 9954.63,
      currency: 'EUR',
      type: 'expense',
      daySequence: 2,
    })
    expect(result.movements[1].daySequence).toBe(1)
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

  it('returns a null IBAN when the preamble line is absent, and still parses the rows', async () => {
    const buffer = await buildStatementXlsx({
      headers: ['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo'],
      rows: [['01/02/2026', '01/02/2026', 'ALGO', 10, 100]],
    })

    const result = await parseBankinterXlsx(buffer)

    // `null`, never '': the contract distinguishes "not in the file" from a
    // value (feature 11). A statement without IBAN parses the same as one with.
    expect(result.accountIban).toBeNull()
    expect(result.accountIban).not.toBe('')
    expect(result.movements).toHaveLength(1)
    expect(result.movements[0].balance).toBe(100)
    // No Divisa column in this variant => currency defaults to ''.
    expect(result.movements[0].currency).toBe('')
  })

  // Non-regression pin (feature 11): the SAME file must still produce the same
  // movements, the same unparsed rows and the same values as before the shared
  // contract. Only two things are new here: `daySequence`, and the fact that a
  // zero amount would now be `neutral` (this fixture has no zero amount, so
  // every `type` below is literally the one feature 7 produced).
  it('produces exactly the same movements and values as before the shared contract', async () => {
    const buffer = await buildStatementXlsx(bankinterSampleFixture())

    const result = await parseBankinterXlsx(buffer)

    expect(result).toEqual({
      bank: 'bankinter',
      accountIban: 'ES9820385778983000760236',
      // Feature 16 added this field to the shared contract. This export carries
      // no balance-of-the-account line, so it is null; nothing else changed.
      accountBalance: null,
      movements: [
        {
          bookingDate: '2026-01-05',
          valueDate: '2026-01-05',
          description: 'TRANSF NOMINA EMPRESA',
          amount: 2500,
          balance: 5000,
          currency: 'EUR',
          type: 'income',
          daySequence: 1,
        },
        {
          bookingDate: '2026-01-06',
          valueDate: '2026-01-06',
          description: 'RECIBO LUZ IBERDROLA',
          amount: -75.5,
          balance: 4924.5,
          currency: 'EUR',
          type: 'expense',
          daySequence: 1,
        },
        {
          bookingDate: '2026-01-07',
          valueDate: '2026-01-07',
          description: 'TRANSFERENCIA RECIBIDA',
          amount: 1234.56,
          balance: 6159.06,
          currency: 'EUR',
          type: 'income',
          daySequence: 1,
        },
        {
          bookingDate: '2026-01-08',
          valueDate: '2026-01-08',
          description: 'PAGO TARJETA',
          amount: -10,
          balance: 6149.06,
          currency: 'EUR',
          type: 'expense',
          daySequence: 2,
        },
        {
          bookingDate: '2026-01-08',
          valueDate: '2026-01-08',
          description: 'PAGO TARJETA',
          amount: -10,
          balance: 6149.06,
          currency: 'EUR',
          type: 'expense',
          daySequence: 1,
        },
      ],
      unparsedRows: [{ row: 15, reason: expect.stringContaining('importe') }],
    })
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
    expect(parseSpanishAmount(-45.37)).toBe(-45.37)
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
