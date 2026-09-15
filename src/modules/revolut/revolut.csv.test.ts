import { describe, expect, it } from 'vitest'

import { isBlankRecord, readCsvRecords } from './revolut.csv.js'

// Criterion 2 of feature 46: the file is read as a REAL CSV. A comma inside a
// quoted field does not split the row.
describe('readCsvRecords — quoted fields (C2)', () => {
  it('does not split a row on a comma that is inside a quoted field', () => {
    const records = readCsvRecords('2026-07-01 10:00:00,"Tienda Inventada, S.L.",-12.50\n')

    expect(records).toEqual([
      {
        line: 1,
        cells: ['2026-07-01 10:00:00', 'Tienda Inventada, S.L.', '-12.50'],
        raw: '2026-07-01 10:00:00,"Tienda Inventada, S.L.",-12.50',
      },
    ])
  })

  it('reads a doubled quote inside a quoted field as a single quote', () => {
    expect(readCsvRecords('"Abono ""Extra""",ok\n')[0].cells).toEqual(['Abono "Extra"', 'ok'])
  })

  it('keeps a newline inside a quoted field without ending the record', () => {
    expect(readCsvRecords('"dos\nlineas",ok\nsegunda,fila\n')).toEqual([
      { line: 1, cells: ['dos\nlineas', 'ok'], raw: '"dos\nlineas",ok' },
      { line: 3, cells: ['segunda', 'fila'], raw: 'segunda,fila' },
    ])
  })

  it('reads an unquoted line by commas, as the sample of the bank comes', () => {
    expect(readCsvRecords('a,b,,d\n')[0].cells).toEqual(['a', 'b', '', 'd'])
  })

  it('trims nothing: spaces and empty cells survive', () => {
    expect(readCsvRecords('a, b ,,"",\n')[0].cells).toEqual(['a', ' b ', '', '', ''])
  })
})

describe('readCsvRecords — lines and raw text', () => {
  it('numbers each record with the 1-based line it starts on', () => {
    expect(readCsvRecords('uno\ndos\n\ntres\n').map((record) => record.line)).toEqual([1, 2, 3, 4])
  })

  it('reads \\r\\n and \\n as the same line ending, leaving it out of raw', () => {
    expect(readCsvRecords('a,b\r\nc,d\r\n')).toEqual(readCsvRecords('a,b\nc,d\n'))
    expect(readCsvRecords('a,b\r\n')[0].raw).toBe('a,b')
  })

  it('keeps the hand-written line exactly as written in raw', () => {
    expect(readCsvRecords('iban;ES00 1234;;;\n')[0].raw).toBe('iban;ES00 1234;;;')
  })

  it('reads the last row of a file with no trailing newline, and adds no phantom one', () => {
    expect(readCsvRecords('a,b\nc,d')).toHaveLength(2)
    expect(readCsvRecords('a,b\n')).toHaveLength(1)
    expect(readCsvRecords('')).toEqual([])
  })

  it('returns an unterminated quoted field as read, instead of swallowing it', () => {
    const records = readCsvRecords('a,"sin cerrar\nb,c\n')

    expect(records).toHaveLength(1)
    expect(records[0].cells[1]).toContain('sin cerrar')
  })
})

describe('isBlankRecord', () => {
  it('recognizes an empty line and a line of only separators or spaces', () => {
    expect(isBlankRecord(readCsvRecords('\n')[0])).toBe(true)
    expect(isBlankRecord(readCsvRecords(',,,\n')[0])).toBe(true)
    expect(isBlankRecord(readCsvRecords('   \n')[0])).toBe(true)
  })

  it('does not call a row with content blank', () => {
    expect(isBlankRecord(readCsvRecords('a,,\n')[0])).toBe(false)
  })
})
