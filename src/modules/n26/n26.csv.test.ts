import { describe, expect, it } from 'vitest'

import { isBlankRecord, readCsvRecords } from './n26.csv.js'

// Criterion 2 of feature 18: the file is read as a REAL CSV. Splitting a line by
// `,` is a failure of the feature, and these are the cases that prove it.
describe('readCsvRecords — quoted fields (criterion 2)', () => {
  it('does not split a row on a comma that is inside a quoted field', () => {
    const records = readCsvRecords('2026-07-01,"Cafeteria Ficticia, S.L.",-3.40\n')

    expect(records).toEqual([
      {
        line: 1,
        cells: ['2026-07-01', 'Cafeteria Ficticia, S.L.', '-3.40'],
        raw: '2026-07-01,"Cafeteria Ficticia, S.L.",-3.40',
      },
    ])
  })

  it('reads a doubled quote inside a quoted field as a single quote', () => {
    const records = readCsvRecords('"Tienda ""La Prueba""",ok\n')

    expect(records[0].cells).toEqual(['Tienda "La Prueba"', 'ok'])
  })

  it('keeps a newline that lives inside a quoted field, without ending the record', () => {
    const records = readCsvRecords('"dos\nlineas",ok\nsegunda,fila\n')

    expect(records).toEqual([
      { line: 1, cells: ['dos\nlineas', 'ok'], raw: '"dos\nlineas",ok' },
      { line: 3, cells: ['segunda', 'fila'], raw: 'segunda,fila' },
    ])
  })

  it('trims nothing and drops nothing: empty cells and spaces survive', () => {
    const records = readCsvRecords('a, b ,,"",\n')

    expect(records[0].cells).toEqual(['a', ' b ', '', '', ''])
  })
})

// The two preamble lines are NOT rows of the table: they are hand-written with
// `;`, so whoever reads them needs the line as it is written, not the cells this
// reader cut by the table's comma (regression of the review of 2026-08-17).
describe('readCsvRecords — the raw line', () => {
  it('gives back each record exactly as written, undoing nothing', () => {
    const records = readCsvRecords('Saldo;1.234,56;;;\na,"b,c"\n')

    expect(records[0].raw).toBe('Saldo;1.234,56;;;')
    // Nothing is unquoted, unescaped or trimmed in `raw`.
    expect(records[1].raw).toBe('a,"b,c"')
    // And the cells still are what the CSV reader read.
    expect(records[0].cells).toEqual(['Saldo;1.234', '56;;;'])
  })

  it('leaves the line terminator out, `\\r\\n` included', () => {
    expect(readCsvRecords('a,b\r\nc,d\r\n').map((record) => record.raw)).toEqual(['a,b', 'c,d'])
    expect(readCsvRecords('a,b').map((record) => record.raw)).toEqual(['a,b'])
  })
})

describe('readCsvRecords — records and line numbers', () => {
  it('numbers each record with the 1-based line it starts on', () => {
    const records = readCsvRecords('cabecera\nuna\n\ndos\n')

    expect(records.map((record) => record.line)).toEqual([1, 2, 3, 4])
  })

  it('reads \\r\\n and \\n as the same line ending', () => {
    const crlf = readCsvRecords('a,b\r\nc,d\r\n')

    expect(crlf).toEqual(readCsvRecords('a,b\nc,d\n'))
  })

  it('reads the last row of a file that does not end with a newline', () => {
    const records = readCsvRecords('a,b\nc,d')

    expect(records).toHaveLength(2)
    expect(records[1].cells).toEqual(['c', 'd'])
  })

  it('adds no phantom record for the trailing newline', () => {
    expect(readCsvRecords('a,b\n')).toHaveLength(1)
    expect(readCsvRecords('')).toEqual([])
  })

  it('returns an unterminated quoted field as read, instead of swallowing it', () => {
    const records = readCsvRecords('a,"sin cerrar\nb,c\n')

    // It is not silently dropped: the caller reports it like any bad row.
    expect(records).toHaveLength(1)
    expect(records[0].cells[1]).toContain('sin cerrar')
  })
})

describe('isBlankRecord', () => {
  it('recognizes an empty line and a line of only separators', () => {
    expect(isBlankRecord(readCsvRecords('\n')[0])).toBe(true)
    expect(isBlankRecord(readCsvRecords(',,,\n')[0])).toBe(true)
    expect(isBlankRecord(readCsvRecords('   \n')[0])).toBe(true)
  })

  it('does not call a row with content blank', () => {
    expect(isBlankRecord(readCsvRecords('a,,\n')[0])).toBe(false)
  })
})
