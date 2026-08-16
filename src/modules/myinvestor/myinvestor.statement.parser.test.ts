import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { NotUtf8Error, ValidationError } from '../../errors/app-error.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import {
  buildCp1252StatementCsv,
  buildStatementCsv,
  documentationIban,
  myinvestorHeaders,
  myinvestorPreamble,
  myinvestorSampleRows,
} from './myinvestor.fixture.js'
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
      amount: -60,
      balance: null,
      currency: 'EUR',
      type: 'expense',
      daySequence: 3,
    })
  })

  it('satisfies the shared contract type (R70)', () => {
    const result: ParsedStatement = sample() satisfies MyinvestorStatementResult

    expect(Object.keys(result).sort()).toEqual([
      'accountBalance',
      'accountIban',
      'bank',
      'movements',
      'unparsedRows',
    ])
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

describe('parseMyinvestorStatement — a file that is not UTF-8 (feature 17)', () => {
  const preamble = ['iban;ES9121000418450200051332']

  it('rejects the whole file and tells the human to save it again as UTF-8', () => {
    const content = buildCp1252StatementCsv({ preamble })

    expect(() => parseMyinvestorStatement(content)).toThrow(NotUtf8Error)
    try {
      parseMyinvestorStatement(content)
    } catch (error) {
      expect((error as NotUtf8Error).code).toBe('NOT_UTF8')
      expect((error as NotUtf8Error).message).toContain('no está guardado en UTF-8')
      // The first offending byte of this file: the `ó` of the header
      // «Fecha de operación», which cp1252 writes as the single byte 0xF3.
      expect((error as NotUtf8Error).message).toContain('0xF3')
      expect((error as NotUtf8Error).message).toContain('vuelve a guardarlo')
    }
  })

  it('rejects it whole: no movement, no unparsedRows, nothing partial comes back', () => {
    const parse = () => parseMyinvestorStatement(buildCp1252StatementCsv({ preamble }))

    // A rejection, never a partial result: the encoding is a property of the
    // file, so half of it cannot be trusted either.
    expect(parse).toThrow(NotUtf8Error)
  })

  it('never decodes it as cp1252: the accent is not recovered, the file is refused', () => {
    const content = buildCp1252StatementCsv({ preamble })

    expect(() => parseMyinvestorStatement(content)).toThrow(NotUtf8Error)
    // And this is what used to happen instead, silently (the reason the guard
    // exists): the header still matched by its ASCII prefix and the concept
    // came back mangled, with no error at all.
    expect(content.toString('utf8')).toContain('SUSCRIPCI�N')
  })

  it('parses the very same statement, saved properly, exactly as before', () => {
    // Same bytes as the rejected one, only saved in UTF-8: nothing about the
    // healthy path changes (same movements, same row numbers, same reasons).
    expect(parseMyinvestorStatement(buildStatementCsv())).toEqual(sample())

    const withIban = parseMyinvestorStatement(buildStatementCsv({ preamble }))
    expect(withIban.accountIban).toBe('ES9121000418450200051332')
    expect(withIban.movements[1].description).toBe('SUSCRIPCIÓN AÑO PREMIUM €')
  })

  it('lets no replacement character reach any parsed field', () => {
    const result = parseMyinvestorStatement(buildStatementCsv({ preamble }))

    expect(JSON.stringify(result)).not.toContain('�')
  })
})

describe('parseMyinvestorStatement — header location (R7)', () => {
  it('finds the header on the 3rd line and with the columns in another order', () => {
    const content = buildStatementCsv({
      preamble: ['Extracto de cuenta', 'Generado el 15/03/2026'],
      headers: ['Divisa', 'Concepto', 'Importe', 'Fecha de valor', 'Fecha de operación'],
      rows: [['EUR', 'COMPRA FONDO FICTICIO', '-60', '12/03/2026', '12/03/2026']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.movements).toEqual([
      {
        bookingDate: '2026-03-12',
        valueDate: '2026-03-12',
        description: 'COMPRA FONDO FICTICIO',
        amount: -60,
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
      rows: [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR']],
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
      -60, -9.49, -31000, 12345.67, -4200, -4200, 0, -12.34,
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
      (movement) => movement.description === 'PAGO DUPLICADO PRUEBA' && movement.amount === -4200,
    )

    expect(duplicates).toHaveLength(2)
  })

  it('ignores blank lines instead of reporting them as unparsable', () => {
    const content = buildStatementCsv({
      rows: [
        ['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR'],
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
      rows: [['12/03/2026', '12/03/2026', 'CONCEPTO CON ; DENTRO', '-60', 'EUR']],
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

    expect(Object.keys(result).sort()).toEqual([
      'accountBalance',
      'accountIban',
      'bank',
      'movements',
      'unparsedRows',
    ])
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

// Feature 12 (R18): the human writes the IBAN once, as a labelled preamble line
// above the header. It is read ONLY from there; the R20 restriction above stays
// untouched (nothing is ever inferred from an IBAN-shaped string).
//
// The IBAN below is the PUBLIC example IBAN of the Spanish documentation (valid
// checksum, nobody's account). A real IBAN never enters the repository, not even
// the owner's own and not even one he pasted himself in a conversation: a test
// file is versioned, shared and read by tools, and a fixture only has to be
// well-formed, never true.
describe('parseMyinvestorStatement — the labelled iban preamble line (F12 R18)', () => {
  it('reads the iban from the labelled preamble line', () => {
    const content = buildStatementCsv({
      preamble: ['iban;ES9121000418450200051332'],
      rows: [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.accountIban).toBe('ES9121000418450200051332')
    expect(result.movements).toHaveLength(1)
  })

  it('tolerates trailing semicolons, spaces and casing in the iban line', () => {
    const content = buildStatementCsv({
      preamble: [' IBAN ; ES9121000418450200051332 ;;;;'],
      rows: [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR']],
    })

    expect(parseMyinvestorStatement(content).accountIban).toBe('ES9121000418450200051332')
  })

  it('returns null when the iban line is absent, empty or below the header', () => {
    const absent = buildStatementCsv({ preamble: ['Extracto de cuenta'] })
    const empty = buildStatementCsv({ preamble: ['iban;'] })
    const empty2 = buildStatementCsv({ preamble: ['iban'] })
    // A line that arrives AFTER the header is data, not preamble: it is never
    // read as the account IBAN (it lands in unparsedRows like any bad row).
    const below = buildStatementCsv({ rows: [['iban', 'ES9121000418450200051332']] })

    for (const content of [absent, empty, empty2, below]) {
      expect(parseMyinvestorStatement(content).accountIban).toBeNull()
    }
  })

  it('does not let the iban line reach unparsedRows nor the movements', () => {
    const content = buildStatementCsv({
      preamble: ['iban;ES9121000418450200051332'],
      rows: [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.unparsedRows).toEqual([])
    expect(result.movements.map((m) => m.description)).toEqual(['COMPRA FONDO FICTICIO'])
  })

  it('reads the iban of a file written with the UTF-8 BOM Excel adds', () => {
    const content = buildStatementCsv({
      bom: true,
      preamble: ['iban;ES9121000418450200051332'],
      rows: [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR']],
    })

    expect(parseMyinvestorStatement(content).accountIban).toBe('ES9121000418450200051332')
  })
})

// Feature 16: the SECOND labelled preamble line the human writes by hand, next
// to the `iban;` one — `saldo;<importe>` — carrying the balance OF THE ACCOUNT
// at the date of the statement. Every figure below is invented and round: a
// fixture only has to have the right shape, never to be true.
describe('parseMyinvestorStatement — the labelled saldo preamble line (feature 16)', () => {
  const oneRow = [['12/03/2026', '12/03/2026', 'COMPRA FONDO FICTICIO', '-60', 'EUR']]

  it('reads the balance of the account from the labelled line, next to the iban (C1)', () => {
    const content = buildStatementCsv({ preamble: myinvestorPreamble(), rows: oneRow })

    const result = parseMyinvestorStatement(content)

    expect(result.accountBalance).toBe(1500)
    expect(result.accountIban).toBe(documentationIban)
    expect(result.movements).toHaveLength(1)
  })

  it('recognizes the label whatever its casing, accents or padding (C2)', () => {
    // His real file already says `Saldo;…` with a capital S: demanding lowercase
    // would reject a file he considers correct.
    const spellings = [
      'Saldo;1500,00;;;',
      'SALDO;1500,00',
      ' sáldo ; 1500,00 ;;;;',
      'saldo;1500,00',
    ]

    for (const line of spellings) {
      const content = buildStatementCsv({ preamble: [line], rows: oneRow })

      expect(parseMyinvestorStatement(content).accountBalance).toBe(1500)
    }
  })

  it('interprets the number with the same normalizer as the amounts (C3)', () => {
    const cases: Array<[string, number]> = [
      // Spanish comma decimal, thousands separator, sign and the euro sign, all
      // of which `parseAmountText` already handles for the Importe column.
      ['1500,00', 1500],
      ['12.345,67', 12345.67],
      ['-2.000', -2000],
      ['-60,50', -60.5],
      ['1500,00 €', 1500],
    ]

    for (const [written, expected] of cases) {
      const content = buildStatementCsv({ preamble: [`saldo;${written}`], rows: oneRow })

      expect(parseMyinvestorStatement(content).accountBalance).toBe(expected)
    }
  })

  it('parses the file all the same when the line is absent or empty (C4)', () => {
    const absent = buildStatementCsv({ preamble: ['iban;ES9121000418450200051332'], rows: oneRow })
    const emptyValue = buildStatementCsv({ preamble: ['saldo;'], rows: oneRow })
    const noValueCell = buildStatementCsv({ preamble: ['saldo'], rows: oneRow })

    for (const content of [absent, emptyValue, noValueCell]) {
      const result = parseMyinvestorStatement(content)

      // Its absence is NOT a failure: same movements, nothing reported.
      expect(result.accountBalance).toBeNull()
      expect(result.movements).toHaveLength(1)
      expect(result.unparsedRows).toEqual([])
    }
  })

  it('changes nothing about the movements, their numbering or unparsedRows (C5)', () => {
    const withBalance = parseMyinvestorStatement(
      buildStatementCsv({ preamble: myinvestorPreamble() }),
    )
    const asBefore = sample()

    // The preamble grew by two lines, so the row numbers of the table shift with
    // the file, as they always have; everything else is identical.
    expect(withBalance.movements).toEqual(asBefore.movements)
    expect(withBalance.unparsedRows.map((row) => row.reason)).toEqual(
      asBefore.unparsedRows.map((row) => row.reason),
    )
    expect(withBalance.unparsedRows.map((row) => row.row)).toEqual([5, 13])
  })

  it('does not let the saldo line reach unparsedRows nor the movements (C5)', () => {
    const content = buildStatementCsv({ preamble: myinvestorPreamble(), rows: oneRow })

    const result = parseMyinvestorStatement(content)

    expect(result.unparsedRows).toEqual([])
    expect(result.movements.map((m) => m.description)).toEqual(['COMPRA FONDO FICTICIO'])
  })

  it('is NOT the per-movement balance: that one stays null on every line (C6)', () => {
    const content = buildStatementCsv({ preamble: myinvestorPreamble() })

    const result = parseMyinvestorStatement(content)

    expect(result.accountBalance).toBe(1500)
    for (const movement of result.movements) {
      expect(movement.balance).toBeNull()
    }
    // Two different data, two different names: the account's balance is a field
    // of the STATEMENT and no movement carries a field with that name.
    expect(Object.keys(result)).toContain('accountBalance')
    expect(Object.keys(result.movements[0])).not.toContain('accountBalance')
    expect(Object.keys(result)).not.toContain('balance')
  })

  it('does not learn to read the closing Saldo row at the END of the file (C7)', () => {
    // The row he used to have at the bottom. It is preamble or nothing: below the
    // header it is data, and data it stays — reported like any unreadable row.
    const content = buildStatementCsv({
      preamble: ['iban;ES9121000418450200051332'],
      rows: [...oneRow, null, ['Saldo', '1500,00', '', '', '']],
    })

    const result = parseMyinvestorStatement(content)

    expect(result.accountBalance).toBeNull()
    expect(result.unparsedRows).toEqual([
      { row: 5, reason: expect.stringContaining('fecha de operación inválida') },
    ])
  })

  it('emits the balance exactly as written, without cuadrar it against anything (C8)', () => {
    const content = buildStatementCsv({ preamble: ['saldo;1500,00'] })

    const result = parseMyinvestorStatement(content)
    const sumOfAmounts = result.movements.reduce((total, movement) => total + movement.amount, 0)

    expect(result.accountBalance).toBe(1500)
    expect(result.accountBalance).not.toBe(sumOfAmounts)
    // A zero balance is a real balance and is emitted as 0, never as null.
    expect(
      parseMyinvestorStatement(buildStatementCsv({ preamble: ['saldo;0'] })).accountBalance,
    ).toBe(0)
    // Nothing is rounded nor re-formatted on the way out.
    expect(
      parseMyinvestorStatement(buildStatementCsv({ preamble: ['saldo;-0,01'] })).accountBalance,
    ).toBe(-0.01)
  })

  it('reports the line, instead of dropping it, when the figure is unreadable (delegated)', () => {
    const content = buildStatementCsv({
      preamble: ['iban;ES9121000418450200051332', 'saldo;mil quinientos'],
      rows: oneRow,
    })

    const result = parseMyinvestorStatement(content)

    expect(result.accountBalance).toBeNull()
    expect(result.unparsedRows).toEqual([
      { row: 2, reason: "saldo de la cuenta no interpretable ('mil quinientos')" },
    ])
    // And the file is parsed all the same: one bad preamble line is not a file
    // that has to be rejected whole (that is only the encoding, feature 17).
    expect(result.movements).toHaveLength(1)
  })

  it('keeps the first labelled line when it is written twice (delegated)', () => {
    const content = buildStatementCsv({
      preamble: ['saldo;1500,00', 'saldo;-2.000'],
      rows: oneRow,
    })

    const result = parseMyinvestorStatement(content)

    // Same rule the iban has had since feature 12: one hand-written label, one
    // value, and the first one wins. The second line is not data either, so it
    // does not reach unparsedRows.
    expect(result.accountBalance).toBe(1500)
    expect(result.unparsedRows).toEqual([])
  })

  it('reads the balance of a file written with the UTF-8 BOM his editor adds (C9)', () => {
    const content = buildStatementCsv({ bom: true, preamble: myinvestorPreamble(), rows: oneRow })

    const result = parseMyinvestorStatement(content)

    expect(result.accountBalance).toBe(1500)
    expect(result.accountIban).toBe(documentationIban)
  })

  it('never reaches the balance of a file that is not UTF-8: the guard acts first (C9)', () => {
    const content = buildCp1252StatementCsv({ preamble: myinvestorPreamble() })

    // Feature 17 still rejects the whole file BEFORE any preamble line is read.
    expect(() => parseMyinvestorStatement(content)).toThrow(NotUtf8Error)
  })

  it('reads both labelled lines with a single finder, not two near-copies (C1)', () => {
    const source = readFileSync(
      new URL('./myinvestor.statement.parser.ts', import.meta.url),
      'utf8',
    )

    // The mechanism of feature 12 was extended, not duplicated: one finder, and
    // the label is what tells the two lines apart.
    expect(source).toContain("findPreambleLine(lines, header.line, 'saldo')")
    expect(source).toContain("findPreambleLine(lines, header.line, 'iban')")
    expect(source).not.toContain('findIbanLine')
    expect(source.match(/function findPreambleLine/g)).toHaveLength(1)
    // And the figure goes through the normalizer this bank already had.
    expect(source).toContain('parseAmountText(accountBalanceLine.value)')
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
