/**
 * The CSV reader of THIS bank, and of nobody else.
 *
 * The export of this bank separates by COMMA. The sample of 2026-09-15 carries no
 * quotes at all, but a description is free text written by a merchant or by a
 * person, and the day one of them carries a comma the export has to quote it, so
 * the file is read as a real CSV from the first day: a comma INSIDE a quoted field
 * is part of the text and does not split the row (feature 46, criterion 2).
 *
 * It lives inside `modules/revolut/` on purpose, even though the algorithm is
 * generic: `docs/conventions.md` §Parsers de banco shares the SHAPE of the output,
 * never the code that READS a format. The pattern is copied, the module is not.
 *
 * What it implements (RFC 4180):
 * - `,` separates fields, `"` quotes a field.
 * - Inside a quoted field: `""` is a literal quote, and `,` and newlines are
 *   plain text.
 * - `\r\n` and `\n` both end a record; a `\r` inside a quoted field survives.
 * - Nothing is trimmed and nothing is dropped: an empty line is a record with a
 *   single empty cell, so the caller decides what an empty line means.
 *
 * Every record carries the 1-BASED LINE where it starts, which is what a report
 * of an unreadable row shows the human, and the RAW text of the line, which is
 * what the hand-written `iban;` line is read from (it is not a row of the bank's
 * table, and cutting it by the table's comma is not how it is written).
 */

export interface CsvRecord {
  /** 1-based number of the line where the record starts. */
  line: number
  cells: string[]
  /** The record exactly as written in the file, line terminator excluded. */
  raw: string
}

const delimiter = ','
const quote = '"'

export function readCsvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let currentLine = 1
  let recordLine = 1
  let recordStart = 0

  const closeCell = () => {
    cells.push(cell)
    cell = ''
  }
  /** `end` is the offset of the terminator (or the end of the text). */
  const closeRecord = (end: number, nextStart: number) => {
    closeCell()
    records.push({ line: recordLine, cells, raw: text.slice(recordStart, end).replace(/\r$/, '') })
    cells = []
    recordLine = currentLine
    recordStart = nextStart
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index]

    if (inQuotes) {
      if (character === quote && text[index + 1] === quote) {
        cell += quote
        index++
      } else if (character === quote) {
        inQuotes = false
      } else {
        if (character === '\n') currentLine++
        cell += character
      }
      continue
    }

    if (character === quote) {
      inQuotes = true
    } else if (character === delimiter) {
      closeCell()
    } else if (character === '\r' && text[index + 1] === '\n') {
      // The `\n` that follows closes the record.
    } else if (character === '\n' || character === '\r') {
      currentLine++
      closeRecord(index, index + 1)
    } else {
      cell += character
    }
  }

  // Only a file that does NOT end with a newline leaves content here. An
  // unterminated quote lands here too, and its record is returned as read so the
  // caller reports it instead of it disappearing.
  if (cell !== '' || cells.length > 0 || inQuotes) {
    closeRecord(text.length, text.length)
  }

  return records
}

/** `true` when every cell of the record is empty or whitespace. */
export function isBlankRecord(record: CsvRecord): boolean {
  return record.cells.every((value) => value.trim() === '')
}
