import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ValidationError } from '../../errors/app-error.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import { buildStatementCsv, myinvestorHeaders, myinvestorSampleRows } from './myinvestor.fixture.js'
import { parseMyinvestorStatement } from './myinvestor.statement.parser.js'
import type { MyinvestorStatementResult } from './myinvestor.types.js'

const sample = () => parseMyinvestorStatement(buildStatementCsv())

describe('parseMyinvestorStatement — order and count (R5)', () => {
  it('returns one movement per interpretable line, in file order', () => {
    const result = sample()

    expect(result.bank).toBe('myinvestor')
    expect(result.movements).toHaveLength(8)
    expect(result.movements.map((movement) => movement.description)).toEqual([
      'COMPRA FONDO FICTICIO',
      'SUSCRIPCIÓN AÑO PREMIUM €',
      'TRASPASO  0000000000000  ORDEN',
      'ABONO NOMINA FICTICIA',
      'PAGO DUPLICADO PRUEBA',
      'PAGO DUPLICADO PRUEBA',
      'AJUSTE A CERO',
      'TRANSFERENCIA A ES0012345678901234567890',
    ])
  })

  it('fills every field of the first data line from its five columns (R8)', () => {
    const result = sample()

    expect(result.movements[0]).toEqual({
      bookingDate: '2026-03-12',
      valueDate: '2026-03-12',
      description: 'COMPRA FONDO FICTICIO',
      amount: -50,
      balance: null,
      currency: 'EUR',
      type: 'expense',
      daySequence: 3,
    })
  })

  it('satisfies the shared contract type (R70)', () => {
    const result: ParsedStatement = sample() satisfies MyinvestorStatementResult

    expect(Object.keys(result).sort()).toEqual(['accountIban', 'bank', 'movements', 'unparsedRows'])
  })
})

describe('parseMyinvestorStatement — decoding (R6)', () => {
  it('reads the same result with and without the UTF-8 BOM', () => {
    const withBom = parseMyinvestorStatement(buildStatementCsv({ bom: true }))

    expect(withBom).toEqual(sample())
  })

  it('recovers accented characters and the euro sign intact', () => {
    const result = parseMyinvestorStatement(buildStatementCsv({ bom: true }))

    expect(result.movements[1].description).toBe('SUSCRIPCIÓN AÑO PREMIUM €')
  })
})

describe('parseMyinvestorStatement — header location (R7)', () => {
  it('finds the header on the 3rd line and with the columns in another order', () => {
    const content = buildStatementCsv({
      preamble: ['Extracto de cuenta', 'Generado el 15/03/2026'],
      headers: ['Divisa', 'Concepto', 'Importe', 'Fecha de valor', 'Fecha de operación'],
      rows: [['EUR', 'COMPRA FONDO FICTICIO', '-50', '12/03/2026', '12/03/2026']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.movements).toEqual([
      {
        bookingDate: '2026-03-12',
        valueDate: '2026-03-12',
        description: 'COMPRA FONDO FICTICIO',
        amount: -50,
        balance: null,
        currency: 'EUR',
        type: 'expense',
        daySequence: 1,
      },
    ])
  })

  it('still recognizes the accented column when its accent arrives mangled', () => {
    const content = buildStatementCsv({
      headers: ['Fecha de operaci?n', 'Fecha de valor', 'Concepto', 'Importe', 'Divisa'],
      rows: [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-50', 'EUR']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.movements[0].bookingDate).toBe('2026-03-12')
    expect(result.unparsedRows).toEqual([])
  })
})

describe('parseMyinvestorStatement — amounts and dates (R9, R10, R11)', () => {
  it('interprets the five numeric shapes that coexist in the same file', () => {
    const result = sample()

    expect(result.movements.map((movement) => movement.amount)).toEqual([
      -50, -7.99, -25000, 25149.95, -5000, -5000, 0, -12.34,
    ])
  })

  it('converts dd/mm/yyyy dates and rejects a day that does not exist', () => {
    const result = sample()

    expect(result.movements[1].valueDate).toBe('2026-03-13')
    expect(result.unparsedRows).toContainEqual({
      row: 11,
      reason: expect.stringContaining('fecha de valor inválida'),
    })
  })

  it('derives the type from the sign, with an amount of 0 becoming neutral', () => {
    const result = sample()
    const types = new Map(result.movements.map((m) => [m.description, m.type]))

    expect(types.get('COMPRA FONDO FICTICIO')).toBe('expense')
    expect(types.get('ABONO NOMINA FICTICIA')).toBe('income')
    expect(types.get('AJUSTE A CERO')).toBe('neutral')
  })
})

describe('parseMyinvestorStatement — fidelity to the file (R12, R13, R15)', () => {
  it('copies the concept whole, keeping its contract number and double spaces', () => {
    const result = sample()

    expect(result.movements[2].description).toBe('TRASPASO  0000000000000  ORDEN')
    expect(Object.keys(result.movements[2])).not.toContain('contract')
  })

  it('does not deduplicate: two identical lines produce two movements', () => {
    const duplicates = sample().movements.filter(
      (movement) => movement.description === 'PAGO DUPLICADO PRUEBA' && movement.amount === -5000,
    )

    expect(duplicates).toHaveLength(2)
  })

  it('ignores blank lines instead of reporting them as unparsable', () => {
    const content = buildStatementCsv({
      rows: [
        ['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-50', 'EUR'],
        null,
        ['11/03/2026', '11/03/2026', 'OTRA COMPRA FICTICIA', '-10', 'EUR'],
      ],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.movements).toHaveLength(2)
    expect(result.unparsedRows).toEqual([])
  })
})

describe('parseMyinvestorStatement — unparsable lines (R14, R16)', () => {
  it('collects an unreadable line with its 1-based line number and reason, and goes on', () => {
    const result = sample()

    expect(result.unparsedRows).toEqual([
      { row: 3, reason: expect.stringContaining("importe no interpretable ('mil trescientos')") },
      { row: 11, reason: expect.stringContaining('fecha de valor inválida') },
    ])
    // The good lines around it are parsed all the same.
    expect(result.movements.map((m) => m.description)).toContain('COMPRA FONDO FICTICIO')
    expect(result.movements.map((m) => m.description)).toContain('SUSCRIPCIÓN AÑO PREMIUM €')
  })

  it('reports a line with an unexpected number of columns instead of guessing', () => {
    const content = buildStatementCsv({
      rows: [['12/03/2026', '12/03/2026', 'CONCEPTO CON ; DENTRO', '-50', 'EUR']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.movements).toEqual([])
    expect(result.unparsedRows).toEqual([
      { row: 2, reason: expect.stringContaining('número de columnas inesperado') },
    ])
  })

  it('throws a ValidationError when the file has no recognizable header', () => {
    const content = Buffer.from('esto;no;es;un;extracto\n1;2;3;4;5\n', 'utf8')

    expect(() => parseMyinvestorStatement(content)).toThrow(ValidationError)
    expect(() => parseMyinvestorStatement(content)).toThrow(/header row not found/i)
  })
})

describe('parseMyinvestorStatement — the balance and the IBAN this bank does not give', () => {
  it('emits balance present and null on every movement, never 0 (R17)', () => {
    const result = sample()

    for (const movement of result.movements) {
      expect(movement).toHaveProperty('balance')
      expect(movement.balance).toBeNull()
    }
  })

  it('emits exactly the four keys of the contract, with no providesBalance (R18)', () => {
    const result = sample()

    expect(Object.keys(result).sort()).toEqual(['accountIban', 'bank', 'movements', 'unparsedRows'])
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
    expect(JSON.stringify(result)).not.toContain('providesBalance')
  })

  it('never accumulates a balance from the amounts (R19)', () => {
    const result = sample()
    const total = result.movements.reduce((sum, movement) => sum + movement.amount, 0)

    expect(JSON.stringify(result)).not.toContain(String(total))
    // And the parser source holds no accumulation at all: `balance` appears in
    // its code exactly once, as the literal null of the contract.
    const source = readFileSync(
      new URL('./myinvestor.statement.parser.ts', import.meta.url),
      'utf8',
    )
    const codeLines = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('*') && !line.startsWith('//'))

    expect(codeLines.filter((line) => line.includes('balance'))).toEqual(['balance: null,'])
  })

  it('emits accountIban null without inferring it from an IBAN-shaped concept (R20)', () => {
    const result = sample()

    expect(result.accountIban).toBeNull()
    expect(result.movements.some((m) => m.description.includes('ES00123'))).toBe(true)
  })
})

describe('parseMyinvestorStatement — daySequence (R68, R69)', () => {
  it('numbers each day from the oldest, knowing the bank exports newest-first', () => {
    const content = buildStatementCsv({
      rows: [
        ['12/03/2026', '12/03/2026', 'LA MAS RECIENTE DEL DIA', '-30', 'EUR'],
        ['12/03/2026', '12/03/2026', 'LA DEL MEDIO', '-20', 'EUR'],
        ['12/03/2026', '12/03/2026', 'LA MAS ANTIGUA DEL DIA', '-10', 'EUR'],
      ],
    })

    const result = parseMyinvestorStatement(content)

    // File order is preserved; only the number is added.
    expect(result.movements.map((m) => [m.description, m.daySequence])).toEqual([
      ['LA MAS RECIENTE DEL DIA', 3],
      ['LA DEL MEDIO', 2],
      ['LA MAS ANTIGUA DEL DIA', 1],
    ])
  })

  it('does not let an unparsable row of that day consume a number', () => {
    const content = buildStatementCsv({
      rows: [
        ['12/03/2026', '12/03/2026', 'LA MAS RECIENTE DEL DIA', '-30', 'EUR'],
        ['12/03/2026', '12/03/2026', 'ILEGIBLE', 'mil trescientos', 'EUR'],
        ['12/03/2026', '12/03/2026', 'LA DEL MEDIO', '-20', 'EUR'],
        ['12/03/2026', '12/03/2026', 'LA MAS ANTIGUA DEL DIA', '-10', 'EUR'],
      ],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.movements.map((m) => m.daySequence)).toEqual([3, 2, 1])
    expect(result.unparsedRows).toHaveLength(1)
  })

  it('declares the export direction as a module constant', () => {
    const source = readFileSync(
      new URL('./myinvestor.statement.parser.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain("const statementOrder = 'newest-first'")
    expect(source).toContain('assignDaySequence(drafts, statementOrder)')
  })
})

describe('the fixture stays synthetic (R59)', () => {
  it('builds the CSV in code, with the five real column names and invented data', () => {
    expect(myinvestorHeaders).toEqual([
      'Fecha de operación',
      'Fecha de valor',
      'Concepto',
      'Importe',
      'Divisa',
    ])
    expect(buildStatementCsv().toString('utf8').split('\n')[0]).toBe(myinvestorHeaders.join(';'))
    expect(myinvestorSampleRows().length).toBeGreaterThan(0)
  })
})
