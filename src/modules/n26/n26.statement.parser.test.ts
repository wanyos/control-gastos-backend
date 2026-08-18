import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { NotUtf8Error, ValidationError } from '../../errors/app-error.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import {
  buildCp1252StatementCsv,
  buildStatementCsv,
  documentationIban,
  n26Headers,
  n26Preamble,
  n26SampleRows,
} from './n26.fixture.js'
import { parseN26Statement } from './n26.statement.parser.js'
import type { N26StatementResult } from './n26.types.js'

const sample = () => parseN26Statement(buildStatementCsv())

const parserSource = readFileSync(new URL('./n26.statement.parser.ts', import.meta.url), 'utf8')

describe('parseN26Statement — order and count', () => {
  it('returns one movement per interpretable line, in file order', () => {
    const result = sample()

    expect(result.bank).toBe('n26')
    expect(result.movements).toHaveLength(9)
    expect(result.movements.map((movement) => movement.description)).toEqual([
      'Cafeteria Ficticia, S.L.',
      'Tienda Inventada "La Prueba"',
      'Empresa Inventada SA - Nomina inventada de julio',
      'Devolución inventada',
      'Direct Debit',
      'Suscripcion Inventada',
      'Suscripcion Inventada',
      'Ajuste A Cero',
      'Pago Repetido',
    ])
  })

  it('fills every field of the first data line from its columns', () => {
    const result = sample()

    expect(result.movements[0]).toEqual({
      bookingDate: '2026-07-01',
      valueDate: '2026-07-01',
      description: 'Cafeteria Ficticia, S.L.',
      amount: -3.4,
      balance: null,
      currency: 'EUR',
      type: 'expense',
      daySequence: 1,
    })
  })
})

// Criterion 1: this bank has its OWN module and inherits not one line from the
// parser of any other bank. The whole-tree guardian is `architecture.test.ts`;
// this is the part that can be checked from here.
describe('parseN26Statement — one parser per bank (criterion 1)', () => {
  it('imports no other bank module: only its own files, lib/, errors/ and the sign helper', () => {
    const specifiers = [...parserSource.matchAll(/from '([^']+)'/g)].map((match) => match[1])
    const allowed = ['./', '../../errors/', '../../lib/', '../movements/']

    for (const specifier of specifiers) {
      expect(allowed.some((prefix) => specifier.startsWith(prefix))).toBe(true)
      expect(specifier).not.toContain('../bankinter/')
    }
  })

  it('reads the format with its own reader, not with a shared one', () => {
    expect(parserSource).toContain("from './n26.csv.js'")
    // The reader of this bank lives in this bank's folder, never in `lib/`.
    expect(parserSource).not.toContain('lib/csv')
  })
})

// Criterion 2: a comma inside a quoted field must not break the row.
describe('parseN26Statement — the file is read as a real CSV (criterion 2)', () => {
  it('keeps a counterparty that carries a comma inside its quotes in one piece', () => {
    const result = sample()

    expect(result.movements[0].description).toBe('Cafeteria Ficticia, S.L.')
    expect(result.movements[0].amount).toBe(-3.4)
    // And no row was cut in half by the comma: nothing landed unparsed for it.
    expect(result.unparsedRows.map((row) => row.row)).not.toContain(2)
  })

  it('reads a doubled quotation mark inside a field as a single one', () => {
    expect(sample().movements[1].description).toBe('Tienda Inventada "La Prueba"')
  })

  it('reports a row with an unexpected number of columns instead of guessing', () => {
    const content = buildStatementCsv({ rows: [['2026-07-01', '2026-07-01', 'CORTA']] })

    const result = parseN26Statement(content)

    expect(result.movements).toEqual([])
    expect(result.unparsedRows).toEqual([
      { row: 2, reason: expect.stringContaining('número de columnas inesperado') },
    ])
  })
})

// Criterion 3: ISO dates, read without conversion, and the two date columns are
// filled SEPARATELY.
describe('parseN26Statement — dates (criterion 3)', () => {
  it('reads the ISO dates as they come', () => {
    expect(sample().movements[0].bookingDate).toBe('2026-07-01')
  })

  it('fills the value date from its own column, never copying the booking date', () => {
    const differing = sample().movements[1]

    expect(differing.bookingDate).toBe('2026-07-01')
    expect(differing.valueDate).toBe('2026-07-02')
  })

  it('reports an impossible calendar day instead of rolling it into March', () => {
    expect(sample().unparsedRows).toContainEqual({
      row: 12,
      reason: expect.stringContaining('fecha contable inválida'),
    })
  })
})

// Criterion 4: dot decimal, sign inside, and the type derived in a single place.
describe('parseN26Statement — amounts and the sign (criterion 4)', () => {
  it('reads the amounts with their dot decimal and their sign', () => {
    expect(sample().movements.map((movement) => movement.amount)).toEqual([
      -3.4, -12.5, 1150, 200, -60, -60, -60, 0, -0.5,
    ])
  })

  it('makes an expense of a negative amount and an income of a positive one', () => {
    const types = new Map(sample().movements.map((m) => [m.description, m.type]))

    expect(types.get('Cafeteria Ficticia, S.L.')).toBe('expense')
    expect(types.get('Empresa Inventada SA - Nomina inventada de julio')).toBe('income')
    expect(types.get('Ajuste A Cero')).toBe('neutral')
  })

  it('takes the sign decision in the single shared place, without re-implementing it', () => {
    expect(parserSource).toContain('deriveMovementTypeFromAmount')
    expect(parserSource).not.toMatch(/amount\s*[<>]=?\s*0\s*\?/)
  })

  it('reads the currency of the movements from the header of the amount column', () => {
    for (const movement of sample().movements) {
      expect(movement.currency).toBe('EUR')
    }

    const inDollars = parseN26Statement(
      buildStatementCsv({ headers: n26Headers.map((header) => header.replace('(EUR)', '(USD)')) }),
    )
    expect(inDollars.movements[0].currency).toBe('USD')
  })
})

// Criteria 5, 6 and 7: the two hand-written preamble lines.
describe('parseN26Statement — the labelled preamble lines (criteria 5-7)', () => {
  const oneRow = [n26SampleRows()[0] as string[]]

  it('reads the iban and the balance written with `;` in this comma-separated file (C5)', () => {
    const content = buildStatementCsv({ preamble: n26Preamble(), rows: oneRow })

    const result = parseN26Statement(content)

    expect(result.accountIban).toBe(documentationIban)
    // The default figure of the fixture has cents: see the note in n26.fixture.ts.
    expect(result.accountBalance).toBe(1234.56)
    expect(result.movements).toHaveLength(1)
    // And neither line reaches the table.
    expect(result.unparsedRows).toEqual([])
  })

  // 🔴 The regression of the review of 2026-08-17: the preamble line is NOT a row
  // of the table, so cutting it by the table's comma dropped everything after the
  // decimal one — `Saldo;1.234,56` came out as `1234`, and in SILENCE. Every case
  // here has cents that are not zero on purpose: with `1500,00` the bug passes.
  it('keeps the cents of a balance written the Spanish way, with `;` (C5)', () => {
    const cases: Array<[string, number]> = [
      ['Saldo;1.234,56', 1234.56],
      ['Saldo;250,75', 250.75],
      ['Saldo;1.234,56;;;', 1234.56],
      ['saldo;-2.000,05', -2000.05],
      // And the way this very file writes its own numbers, which also has cents.
      ['Saldo;1234.56', 1234.56],
    ]

    for (const [line, expected] of cases) {
      const result = parseN26Statement(buildStatementCsv({ preamble: [line], rows: oneRow }))

      expect(result.accountBalance).toBe(expected)
      // Nothing was lost in silence either: no report, and the file parses.
      expect(result.unparsedRows).toEqual([])
      expect(result.movements).toHaveLength(1)
    }
  })

  it('recognizes the labels whatever their casing, accents or filler padding (C6)', () => {
    const spellings = [
      ['iban;ES9121000418450200051332', 'Saldo;1.234,56;;;'],
      ['IBAN;ES9121000418450200051332;;;;', 'SALDO;1.234,56'],
      [' Iban ; ES9121000418450200051332 ', ' sáldo ; 1.234,56 ;;;'],
    ]

    for (const preamble of spellings) {
      const result = parseN26Statement(buildStatementCsv({ preamble, rows: oneRow }))

      expect(result.accountIban).toBe(documentationIban)
      expect(result.accountBalance).toBe(1234.56)
    }
  })

  it('also understands the line if he wrote it with the comma of this file (C6)', () => {
    // The documented form is the `;` one. Understanding the other costs nothing
    // and avoids a silent `null` on a line he considers written — and it keeps
    // its cents too: the value is everything after the FIRST separator.
    const content = buildStatementCsv({
      preamble: [`iban,${documentationIban},,,`, 'Saldo,1.234,56'],
      rows: oneRow,
    })

    const result = parseN26Statement(content)

    expect(result.accountIban).toBe(documentationIban)
    expect(result.accountBalance).toBe(1234.56)
  })

  it('parses the file all the same when a line is absent or empty (C7)', () => {
    const absent = buildStatementCsv({ rows: oneRow })
    const emptyValue = buildStatementCsv({ preamble: ['iban;', 'saldo;'], rows: oneRow })
    const noValueCell = buildStatementCsv({ preamble: ['iban', 'saldo'], rows: oneRow })

    for (const content of [absent, emptyValue, noValueCell]) {
      const result = parseN26Statement(content)

      expect(result.accountIban).toBeNull()
      expect(result.accountBalance).toBeNull()
      expect(result.movements).toHaveLength(1)
      expect(result.unparsedRows).toEqual([])
    }
  })

  it('reports an unreadable balance with its line number, and parses the rest (C7)', () => {
    const content = buildStatementCsv({
      preamble: [`iban;${documentationIban}`, 'saldo;mil quinientos'],
      rows: oneRow,
    })

    const result = parseN26Statement(content)

    expect(result.accountBalance).toBeNull()
    expect(result.unparsedRows).toEqual([
      { row: 2, reason: "saldo de la cuenta no interpretable ('mil quinientos')" },
    ])
    expect(result.movements).toHaveLength(1)
    expect(result.accountIban).toBe(documentationIban)
  })

  it('keeps the first line when a label is written twice (C7)', () => {
    const content = buildStatementCsv({
      preamble: ['saldo;1.234,56', 'saldo;-2.000,05'],
      rows: oneRow,
    })

    const result = parseN26Statement(content)

    expect(result.accountBalance).toBe(1234.56)
    expect(result.unparsedRows).toEqual([])
  })

  it('reads only ABOVE the header: a labelled row below it is data (C5)', () => {
    const belowHeader = [...oneRow, ['saldo', '1.234,56', '', '', '', '', '', '', '', '', '']]

    const result = parseN26Statement(buildStatementCsv({ rows: belowHeader }))

    expect(result.accountBalance).toBeNull()
    expect(result.unparsedRows).toEqual([
      { row: 3, reason: expect.stringContaining('fecha contable inválida') },
    ])
  })

  it('never infers the account iban from an IBAN-shaped string of the table', () => {
    // The export carries the IBAN of the COUNTERPARTY, which is not the
    // account's, and the canonical fixture has one in that column.
    expect(sample().accountIban).toBeNull()

    // Not even when it is written inside a concept, where it looks the same.
    const withIbanInConcept = parseN26Statement(
      buildStatementCsv({
        rows: [
          [
            '2026-07-01',
            '2026-07-01',
            'TRANSFERENCIA A ES0012345678901234567890',
            '',
            'Credit Transfer',
            '',
            'C',
            '-1',
            '',
            '',
            '',
          ],
        ],
      }),
    )

    expect(withIbanInConcept.accountIban).toBeNull()
    expect(withIbanInConcept.movements[0].description).toContain('ES0012345678901234567890')
  })

  it('reads both labelled lines with a single finder, not two near-copies', () => {
    expect(parserSource).toContain("findPreambleLine(records, header.index, 'saldo')")
    expect(parserSource).toContain("findPreambleLine(records, header.index, 'iban')")
    expect(parserSource.match(/function findPreambleLine/g)).toHaveLength(1)
  })

  it('reads the preamble of a file written with the UTF-8 BOM an editor adds', () => {
    const content = buildStatementCsv({ bom: true, preamble: n26Preamble(), rows: oneRow })

    const result = parseN26Statement(content)

    expect(result.accountIban).toBe(documentationIban)
    expect(result.accountBalance).toBe(1234.56)
    expect(result.movements).toHaveLength(1)
  })
})

// Criterion 9: strict UTF-8 decoding, never `toString('utf8')`.
describe('parseN26Statement — a file that is not UTF-8 (criterion 9)', () => {
  it('rejects the whole file and tells the human to save it again as UTF-8', () => {
    const content = buildCp1252StatementCsv({ preamble: n26Preamble() })

    expect(() => parseN26Statement(content)).toThrow(NotUtf8Error)
    try {
      parseN26Statement(content)
    } catch (error) {
      expect((error as NotUtf8Error).code).toBe('NOT_UTF8')
      expect((error as NotUtf8Error).message).toContain('no está guardado en UTF-8')
      // The first offending byte: the `ó` of an accented reference, which cp1252
      // writes as the single byte 0xF3.
      expect((error as NotUtf8Error).message).toContain('0xF3')
      expect((error as NotUtf8Error).message).toContain('vuelve a guardarlo')
    }
  })

  it('decodes with the strict guard, never with toString(utf8)', () => {
    expect(parserSource).toContain('decodeUtf8Strict')
    expect(parserSource).not.toContain("toString('utf8')")
  })

  it('recovers an accented concept intact when the file IS UTF-8', () => {
    expect(sample().movements[3].description).toBe('Devolución inventada')
    expect(JSON.stringify(sample())).not.toContain('�')
  })

  it('reads the same result with and without the BOM', () => {
    expect(parseN26Statement(buildStatementCsv({ bom: true }))).toEqual(sample())
  })
})

// Criterion 10: the shared contract, the null balance and assignDaySequence.
describe('parseN26Statement — the shared contract (criterion 10)', () => {
  it('satisfies the shared contract type and its five keys', () => {
    const result: ParsedStatement = sample() satisfies N26StatementResult

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
  })

  it('declares no second copy of the contract types', () => {
    const types = readFileSync(new URL('./n26.types.ts', import.meta.url), 'utf8')

    expect(types).not.toMatch(/(?:interface|type)\s+ParsedMovement\b/)
    expect(types).not.toMatch(/(?:interface|type)\s+UnparsedRow\b/)
    expect(types).not.toMatch(/(?:interface|type)\s+ParsedMovementType\b/)
    expect(types).toContain("ParsedStatement<'n26'>")
  })

  it('emits balance present and null on every movement, never 0, and never accumulates it', () => {
    const result = sample()

    for (const movement of result.movements) {
      expect(movement).toHaveProperty('balance')
      expect(movement.balance).toBeNull()
    }
    // The source holds no accumulation at all: `balance` appears in its code
    // exactly once, as the literal null of the contract.
    const codeLines = parserSource
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('*') && !line.startsWith('//'))
    expect(codeLines.filter((line) => line.includes('balance'))).toEqual(['balance: null,'])
  })

  it('invents no field for the columns that have no place in the contract', () => {
    const serialized = JSON.stringify(sample())

    for (const absent of ['partnerIban', 'accountName', 'originalAmount', 'exchangeRate']) {
      expect(serialized).not.toContain(absent)
    }
  })

  it('numbers each day from the oldest, knowing this bank exports oldest-first', () => {
    const result = sample()

    expect(result.movements.map((m) => [m.bookingDate, m.daySequence])).toEqual([
      ['2026-07-01', 1],
      ['2026-07-01', 2],
      ['2026-07-01', 3],
      ['2026-07-02', 1],
      ['2026-07-02', 2],
      ['2026-07-03', 1],
      ['2026-07-03', 2],
      ['2026-07-04', 1],
      ['2026-07-06', 1],
    ])
    expect(parserSource).toContain("const statementOrder = 'oldest-first'")
    expect(parserSource).toContain('assignDaySequence(drafts, statementOrder)')
  })

  it('does not let an unparsable row consume a number of its day', () => {
    const content = buildStatementCsv({
      rows: [
        ['2026-07-01', '2026-07-01', 'PRIMERA', '', 'Card Payment', '', 'C', '-1', '', '', ''],
        ['2026-07-01', '2026-07-01', 'ILEGIBLE', '', 'Card Payment', '', 'C', 'abc', '', '', ''],
        ['2026-07-01', '2026-07-01', 'SEGUNDA', '', 'Card Payment', '', 'C', '-2', '', '', ''],
      ],
    })

    const result = parseN26Statement(content)

    expect(result.movements.map((m) => m.daySequence)).toEqual([1, 2])
    expect(result.unparsedRows).toHaveLength(1)
  })
})

// Criterion 11: the concept, which this bank does not export as a column.
describe('parseN26Statement — the composed concept (criterion 11)', () => {
  it('uses the counterparty when it is the only thing written', () => {
    expect(sample().movements[0].description).toBe('Cafeteria Ficticia, S.L.')
  })

  it('joins the counterparty and the free reference when both are written', () => {
    expect(sample().movements[2].description).toBe(
      'Empresa Inventada SA - Nomina inventada de julio',
    )
  })

  it('uses the reference alone when there is no counterparty', () => {
    expect(sample().movements[3].description).toBe('Devolución inventada')
  })

  it('falls back to the bank type when neither is written, rather than losing the row', () => {
    expect(sample().movements[4].description).toBe('Direct Debit')
  })

  it('does not write the reference twice when it only repeats the counterparty', () => {
    expect(sample().movements[8].description).toBe('Pago Repetido')
  })

  it('never emits an empty concept: a row with nothing to compose it is reported', () => {
    const content = buildStatementCsv({
      rows: [['2026-07-01', '2026-07-01', '', '', '', '', '', '-1', '', '', '']],
    })

    const result = parseN26Statement(content)

    expect(result.movements).toEqual([])
    expect(result.unparsedRows).toEqual([{ row: 2, reason: expect.stringContaining('concepto') }])
  })

  it('copies what it composes verbatim, without splitting anything out of it', () => {
    const content = buildStatementCsv({
      rows: [
        [
          '2026-07-01',
          '2026-07-01',
          'CONTRAPARTE  CON  DOBLES  ESPACIOS',
          '',
          'Card Payment',
          '',
          'C',
          '-1',
          '',
          '',
          '',
        ],
      ],
    })

    expect(parseN26Statement(content).movements[0].description).toBe(
      'CONTRAPARTE  CON  DOBLES  ESPACIOS',
    )
  })
})

describe('parseN26Statement — fidelity to the file', () => {
  it('does not deduplicate: two identical lines produce two movements', () => {
    const duplicates = sample().movements.filter(
      (movement) => movement.description === 'Suscripcion Inventada',
    )

    expect(duplicates).toHaveLength(2)
  })

  it('ignores blank lines instead of reporting them as unparsable', () => {
    // The canonical fixture carries one between its rows.
    expect(sample().unparsedRows.map((row) => row.row)).toEqual([11, 12])
  })

  it('collects an unreadable line with its 1-based line number and reason', () => {
    expect(sample().unparsedRows).toEqual([
      { row: 11, reason: expect.stringContaining("importe no interpretable ('mil trescientos')") },
      { row: 12, reason: expect.stringContaining('fecha contable inválida') },
    ])
  })

  it('finds the header by name even below a preamble and with the columns reordered', () => {
    const content = buildStatementCsv({
      preamble: ['Extracto exportado del banco'],
      headers: ['Amount (EUR)', 'Partner Name', 'Value Date', 'Booking Date'],
      rows: [['-3.40', 'Cafeteria Ficticia', '2026-07-01', '2026-07-01']],
    })

    const result = parseN26Statement(content)

    expect(result.movements).toEqual([
      {
        bookingDate: '2026-07-01',
        valueDate: '2026-07-01',
        description: 'Cafeteria Ficticia',
        amount: -3.4,
        balance: null,
        currency: 'EUR',
        type: 'expense',
        daySequence: 1,
      },
    ])
  })

  it('throws a ValidationError when the file has no recognizable header', () => {
    const content = Buffer.from('esto,no,es,un,extracto\n1,2,3,4,5\n', 'utf8')

    expect(() => parseN26Statement(content)).toThrow(ValidationError)
    expect(() => parseN26Statement(content)).toThrow(/header row not found/i)
  })
})

describe('the fixture stays synthetic (criterion 13)', () => {
  it('builds the CSV in code, with the real column names and invented data', () => {
    expect(n26Headers).toHaveLength(11)
    expect(n26SampleRows().filter(Boolean).length).toBeGreaterThan(0)
    // Quoted only where it is needed, exactly like the real export.
    expect(buildStatementCsv().toString('utf8')).toContain('"Cafeteria Ficticia, S.L."')
  })
})
