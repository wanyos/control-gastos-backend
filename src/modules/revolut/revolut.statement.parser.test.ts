import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { InvalidIbanError, NotUtf8Error, ValidationError } from '../../errors/app-error.js'
import { mistypedIban } from '../../lib/iban.fixture.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import {
  buildRevolutCsv,
  documentationIban,
  revolutHeaders,
  revolutPreamble,
  revolutRow,
} from './revolut.fixture.js'
import { parseRevolutStatement } from './revolut.statement.parser.js'
import type { RevolutStatementResult } from './revolut.types.js'

const sample = () => parseRevolutStatement(buildRevolutCsv())

const parserSource = readFileSync(new URL('./revolut.statement.parser.ts', import.meta.url), 'utf8')
const typesSource = readFileSync(new URL('./revolut.types.ts', import.meta.url), 'utf8')

describe('parseRevolutStatement — the sample', () => {
  it('returns one movement per completed interpretable row, in file order', () => {
    const result = sample()

    expect(result.bank).toBe('revolut')
    expect(result.movements.map((movement) => movement.description)).toEqual([
      'Cafeteria Ficticia',
      'Tienda Inventada, S.L.',
      'Transferencia Inventada Recibida',
      'Ajuste A Cero',
      'Cambio Inventado',
      'Abono "Extra" Inventado',
    ])
  })

  it('fills every field of the first movement from its columns', () => {
    expect(sample().movements[0]).toEqual({
      bookingDate: '2026-07-01',
      valueDate: '2026-07-01',
      description: 'Cafeteria Ficticia',
      amount: -3.4,
      balance: 96.6,
      currency: 'EUR',
      type: 'expense',
      daySequence: 1,
    })
  })

  it('reports exactly the three rows that cannot enter, by line, and nothing else', () => {
    expect(sample().unparsedRows).toEqual([
      { row: 8, reason: "estado no importable ('PENDIENTE'): solo entra COMPLETADO" },
      { row: 10, reason: "importe no interpretable ('mil')" },
      {
        row: 11,
        reason:
          "fecha de finalización inválida ('2026-02-31 10:00:00'); " +
          "fecha de inicio inválida ('2026-02-31 10:00:00')",
      },
    ])
  })
})

// C1: its own module, not one line of another bank's format reading.
describe('parseRevolutStatement — one parser per bank (C1)', () => {
  it('imports only its own files, lib/, errors/ and the sign helper', () => {
    const specifiers = [...parserSource.matchAll(/from '([^']+)'/g)].map((match) => match[1])
    const allowed = ['./', '../../errors/', '../../lib/', '../movements/']

    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(
        allowed.some((prefix) => specifier.startsWith(prefix)),
        specifier,
      ).toBe(true)
    }
  })

  it('reads the CSV with the reader of its own folder, not with a shared one', () => {
    expect(parserSource).toContain("from './revolut.csv.js'")
    expect(parserSource).not.toContain('lib/csv')
  })
})

// C2: a real CSV.
describe('parseRevolutStatement — the file is read as a real CSV (C2)', () => {
  it('keeps a description with a comma inside its quotes in one piece', () => {
    const second = sample().movements[1]

    expect(second.description).toBe('Tienda Inventada, S.L.')
    expect(second.amount).toBe(-12.5)
    expect(sample().unparsedRows.map((row) => row.row)).not.toContain(3)
  })

  it('reads a doubled quotation mark inside a field as a single one', () => {
    expect(sample().movements[5].description).toBe('Abono "Extra" Inventado')
  })

  it('reads the file with \\r\\n line endings exactly like the one with \\n', () => {
    expect(parseRevolutStatement(buildRevolutCsv({ lineEnding: '\r\n' }))).toEqual(sample())
  })

  it('reports a row with an unexpected number of columns instead of guessing', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ rows: [['Tipo Inventado', '2026-07-01 10:00:00', 'CORTA']] }),
    )

    expect(result.movements).toEqual([])
    expect(result.unparsedRows).toEqual([
      { row: 2, reason: 'número de columnas inesperado (3, se esperaban 10)' },
    ])
  })

  it('finds the columns by name, whatever their order', () => {
    const reordered = [...revolutHeaders].reverse()
    const row = [...revolutRow({ description: 'Orden Cambiado', balance: '5.00' })].reverse()

    const result = parseRevolutStatement(buildRevolutCsv({ headers: reordered, rows: [row] }))

    expect(result.movements).toMatchObject([{ description: 'Orden Cambiado', balance: 5 }])
  })

  it('rejects the whole file when the header row of this bank is not there', () => {
    expect(() => parseRevolutStatement(Buffer.from('esto,no,es,un,extracto\n'))).toThrow(
      ValidationError,
    )
    // A header without the State column cannot tell a reversed row from a movement.
    const withoutState = revolutHeaders.filter((name) => name !== 'State')
    expect(() =>
      parseRevolutStatement(buildRevolutCsv({ headers: withoutState, rows: [] })),
    ).toThrow(ValidationError)
  })

  it('skips blank lines and tolerates a leading BOM and a missing trailing newline', () => {
    const result = parseRevolutStatement(buildRevolutCsv({ bom: true, trailingNewline: false }))

    expect(result).toEqual(sample())
  })
})

// C3: booking date from `Fecha de finalización`, value date from `Fecha de inicio`.
describe('parseRevolutStatement — dates (C3)', () => {
  it('takes bookingDate from the completion date and valueDate from the start date', () => {
    const second = sample().movements[1]

    expect(second.bookingDate).toBe('2026-07-01')
    expect(second.valueDate).toBe('2026-06-30')
  })

  it('emits both as AAAA-MM-DD with the time discarded', () => {
    for (const movement of sample().movements) {
      expect(movement.bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(movement.valueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('reports a completed row with no completion date instead of inventing one', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ rows: [revolutRow({ completedAt: '' })] }),
    )

    expect(result.movements).toEqual([])
    expect(result.unparsedRows).toEqual([{ row: 2, reason: "fecha de finalización inválida ('')" }])
  })
})

// C4: DEVUELTO is not a movement and is not reported; any other state is reported.
describe('parseRevolutStatement — states (C4)', () => {
  it('produces no movement and no unparsed row for a DEVUELTO row', () => {
    const result = sample()

    expect(result.movements.map((movement) => movement.description)).not.toContain(
      'Compra Devuelta Inventada',
    )
    expect(result.unparsedRows.map((row) => row.row)).not.toContain(4)
  })

  it('skips a DEVUELTO row even when its dates and balance are empty, whatever its case', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({
        rows: [revolutRow({ state: 'devuelto', completedAt: '', balance: '', amount: '-9.00' })],
      }),
    )

    expect(result).toMatchObject({ movements: [], unparsedRows: [] })
  })

  it('reports any other state with its line and the state as the reason', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({
        rows: [
          revolutRow({ state: 'PENDIENTE', completedAt: '', balance: '' }),
          revolutRow({ state: 'REVERTIDO' }),
          revolutRow({ state: '' }),
        ],
      }),
    )

    expect(result.movements).toEqual([])
    expect(result.unparsedRows).toEqual([
      { row: 2, reason: "estado no importable ('PENDIENTE'): solo entra COMPLETADO" },
      { row: 3, reason: "estado no importable ('REVERTIDO'): solo entra COMPLETADO" },
      { row: 4, reason: "estado no importable (''): solo entra COMPLETADO" },
    ])
  })

  it('does not let a skipped or reported row consume a daySequence', () => {
    const firstDay = sample().movements.filter((movement) => movement.bookingDate === '2026-07-01')

    expect(firstDay.map((movement) => movement.daySequence)).toEqual([1, 2, 3])
  })
})

// C5: the per-line balance goes to `balance`; no account balance, no `saldo;` line.
describe('parseRevolutStatement — balance (C5)', () => {
  it('emits the Saldo of every line in balance', () => {
    expect(sample().movements.map((movement) => movement.balance)).toEqual([
      96.6, 84.1, 1084.1, 1084.1, 1074.1, 1274.1,
    ])
  })

  it('keeps accountBalance null, and does not read a saldo; line written above the header', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ preamble: [...revolutPreamble(), 'saldo;1.234,56'] }),
    )

    expect(result.accountBalance).toBeNull()
    // Ignored, not reported: it is not a row of the table.
    expect(result.unparsedRows).toEqual(
      sample().unparsedRows.map((row) => ({ ...row, row: row.row + 2 })),
    )
    expect(result.movements).toEqual(sample().movements)
  })

  it('emits null for an empty Saldo on a completed row, and reports an unreadable one', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({
        rows: [
          revolutRow({ description: 'Sin Saldo Inventado', balance: '' }),
          revolutRow({ description: 'Saldo Ilegible Inventado', balance: 'n/a' }),
        ],
      }),
    )

    expect(result.movements).toMatchObject([{ description: 'Sin Saldo Inventado', balance: null }])
    expect(result.unparsedRows).toEqual([{ row: 3, reason: "saldo no interpretable ('n/a')" }])
  })

  it('keeps previous balance + amount = balance along the movements of the sample', () => {
    const movements = sample().movements
    for (let index = 1; index < movements.length; index += 1) {
      const previous = movements[index - 1].balance ?? Number.NaN
      const current = movements[index]
      expect((previous + current.amount).toFixed(2)).toBe(current.balance?.toFixed(2))
    }
  })
})

// C6: the fee column is not read.
describe('parseRevolutStatement — Comisión (C6)', () => {
  it('does not add a non-zero fee to the amount', () => {
    expect(sample().movements[4]).toMatchObject({ description: 'Cambio Inventado', amount: -10 })
  })

  it('does not even look at it: an unreadable fee does not make the row unparsed', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ rows: [revolutRow({ fee: 'no es un numero', amount: '-2.00' })] }),
    )

    expect(result.unparsedRows).toEqual([])
    expect(result.movements).toMatchObject([{ amount: -2 }])
  })

  it('does not name the fee column in the parser', () => {
    expect(parserSource.toLowerCase()).not.toMatch(/'comision'|fee:/)
  })
})

// C7: amount with dot and sign, type from the single helper, daySequence from assignDaySequence.
describe('parseRevolutStatement — amount, type and position in the day (C7)', () => {
  it('reads the sign from the amount and derives expense, income and neutral', () => {
    expect(sample().movements.map((movement) => [movement.amount, movement.type])).toEqual([
      [-3.4, 'expense'],
      [-12.5, 'expense'],
      [1000, 'income'],
      [0, 'neutral'],
      [-10, 'expense'],
      [200, 'income'],
    ])
  })

  it('numbers the day oldest first, as the file comes ordered by completion date', () => {
    expect(
      sample().movements.map((movement) => [movement.bookingDate, movement.daySequence]),
    ).toEqual([
      ['2026-07-01', 1],
      ['2026-07-01', 2],
      ['2026-07-01', 3],
      ['2026-07-02', 1],
      ['2026-07-02', 2],
      ['2026-07-03', 1],
    ])
  })

  it('uses the shared helpers and does not write the sign rule itself', () => {
    expect(parserSource).toContain('deriveMovementTypeFromAmount')
    expect(parserSource).toContain('assignDaySequence(drafts, statementOrder)')
    expect(parserSource).toContain("const statementOrder = 'oldest-first'")
    expect(parserSource).not.toMatch(/amount\s*[<>]=?\s*0\s*\?/)
  })

  it('does not deduplicate: two identical rows are two movements', () => {
    const row = revolutRow({ description: 'Suscripcion Inventada' })
    const result = parseRevolutStatement(buildRevolutCsv({ rows: [row, row] }))

    expect(result.movements).toHaveLength(2)
    expect(result.movements.map((movement) => movement.daySequence)).toEqual([1, 2])
  })
})

// C8: the optional `iban;` line.
describe('parseRevolutStatement — the iban line (C8)', () => {
  it('reads the iban written above the header with ;', () => {
    const result = parseRevolutStatement(buildRevolutCsv({ preamble: revolutPreamble() }))

    expect(result.accountIban).toBe(documentationIban)
    // The preamble moves the table one line down, and nothing else changes.
    expect(result.movements).toEqual(sample().movements)
  })

  it('is optional: with no line the iban is null and the movements are the same', () => {
    const result = sample()

    expect(result.accountIban).toBeNull()
    expect(result.movements).toHaveLength(6)
  })

  it('normalizes it and tolerates case, spaces and filler separators', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ preamble: [' IBAN ;es91 2100 0418 4502 0005 1332;;;'] }),
    )

    expect(result.accountIban).toBe(documentationIban)
  })

  it('also understands the comma of the file, and not the colon', () => {
    expect(
      parseRevolutStatement(buildRevolutCsv({ preamble: [`iban,${documentationIban}`] }))
        .accountIban,
    ).toBe(documentationIban)
    expect(
      parseRevolutStatement(buildRevolutCsv({ preamble: [`iban: ${documentationIban}`] }))
        .accountIban,
    ).toBeNull()
  })

  it('rejects the whole file when the written iban is mistyped', () => {
    const content = buildRevolutCsv({ preamble: [`iban;${mistypedIban(documentationIban)}`] })

    expect(() => parseRevolutStatement(content)).toThrow(InvalidIbanError)
  })

  it('never takes an iban-shaped description as the account iban', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ rows: [revolutRow({ description: documentationIban })] }),
    )

    expect(result.accountIban).toBeNull()
  })
})

// C9: strict UTF-8.
describe('parseRevolutStatement — encoding (C9)', () => {
  it('rejects the whole file when its bytes are not UTF-8', () => {
    const utf8 = buildRevolutCsv({ rows: [revolutRow({ description: 'Suscripción Inventada' })] })
    // The same file with the `ó` written as the single cp1252 byte 0xF3.
    const index = utf8.indexOf(Buffer.from('ó', 'utf8'))
    const cp1252 = Buffer.concat([
      utf8.subarray(0, index),
      Buffer.from([0xf3]),
      utf8.subarray(index + 2),
    ])

    expect(() => parseRevolutStatement(cp1252)).toThrow(NotUtf8Error)
  })

  it('keeps the accents of a UTF-8 file', () => {
    const result = parseRevolutStatement(
      buildRevolutCsv({ rows: [revolutRow({ description: 'Suscripción Año Inventada' })] }),
    )

    expect(result.movements[0].description).toBe('Suscripción Año Inventada')
  })

  it('decodes with decodeUtf8Strict and never with toString', () => {
    expect(parserSource).toContain('decodeUtf8Strict(content)')
    expect(parserSource).not.toContain("toString('utf8')")
    expect(parserSource).not.toMatch(/\.toString\(/)
  })
})

// C10: the common contract.
describe('parseRevolutStatement — the common contract (C10)', () => {
  it('returns ParsedStatement<revolut> and declares none of the contract types', () => {
    const result: ParsedStatement<'revolut'> = sample()
    const typed: RevolutStatementResult = result

    expect(Object.keys(typed).sort()).toEqual(
      ['accountBalance', 'accountIban', 'bank', 'movements', 'unparsedRows'].sort(),
    )
    expect(typesSource).toContain("export type RevolutStatementResult = ParsedStatement<'revolut'>")
    for (const source of [parserSource, typesSource]) {
      expect(source).not.toMatch(
        /(?:interface|type)\s+(ParsedMovement|UnparsedRow|ParsedMovementType)\b/,
      )
    }
  })
})
