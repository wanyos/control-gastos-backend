/**
 * The CSV reader of THIS bank, and of nobody else.
 *
 * This bank exports a comma-separated file whose fields are quoted with `"`
 * whenever they need it, so a comma INSIDE a quoted field is part of the text
 * and must not split the row. Splitting the line by `,` is therefore not an
 * option here (feature 18, criterion 2).
 *
 * It lives inside `modules/n26/` on purpose, even though the algorithm is
 * generic: `docs/conventions.md` §Parsers de banco shares the SHAPE of the
 * output, never the code that READS a format. A format changes without notice,
 * and a shared reader turns one bank's change into everyone's regression. The
 * next bank that exports quoted CSV writes its own; what it may reuse is the
 * idea, not the module.
 *
 * What it implements (RFC 4180, as the export actually uses it):
 * - `,` separates fields, `"` quotes a field.
 * - Inside a quoted field: `""` is a literal quote, and `,` and newlines are
 *   plain text.
 * - `\r\n` and `\n` both end a record; a `\r` inside a quoted field survives.
 * - Nothing is trimmed and nothing is dropped: an empty line is a record with a
 *   single empty cell, so the caller decides what an empty line means.
 *
 * Every record carries the 1-BASED LINE where it starts, which is what a report
 * of an unreadable row shows the human. A record that spans several lines
 * (possible only through a quoted newline) keeps the line it started on.
 */

export interface CsvRecord {
  /** 1-based number of the line where the record starts. */
  line: number
  cells: string[]
  /**
   * The record EXACTLY as it is written in the file, terminator excluded and
   * nothing undone: quotes, separators and spaces are all still there.
   *
   * It exists because not every line of this file is a row of the bank's table.
   * The two preamble lines are written BY HAND with `;`, so cutting them by the
   * table's comma destroys them — `Saldo;1.234,56` would end up as two cells and
   * whoever read only the first would silently lose the cents. Whoever reads
   * something that is not the bank's table reads it from here.
   */
  raw: string
}

const delimiter = ','
const quote = '"'

export function readCsvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let recordStart = 0

  const endCell = () => {
    cells.push(cell)
    cell = ''
  }
  /** `end` is the offset of the terminator, or the end of the text. */
  const endRecord = (end: number, nextStart: number) => {
    endCell()
    records.push({
      line: recordLine,
      cells,
      raw: text.slice(recordStart, end).replace(/\r$/, ''),
    })
    cells = []
    recordLine = line
    recordStart = nextStart
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index]

    if (inQuotes) {
      if (character === quote) {
        // A doubled quote is a literal one; a single one closes the field.
        if (text[index + 1] === quote) {
          cell += quote
          index++
        } else {
          inQuotes = false
        }
        continue
      }
      if (character === '\n') line++
      cell += character
      continue
    }

    if (character === quote) {
      inQuotes = true
      continue
    }
    if (character === delimiter) {
      endCell()
      continue
    }
    if (character === '\r' && text[index + 1] === '\n') {
      continue
    }
    if (character === '\n' || character === '\r') {
      line++
      endRecord(index, index + 1)
      continue
    }
    cell += character
  }

  // A trailing newline closes the last record and starts nothing: only a file
  // that does NOT end with one leaves content behind here. An unterminated
  // quote also lands here, and its record is returned as read instead of being
  // swallowed, so it can be reported like any other unreadable row.
  if (cell !== '' || cells.length > 0 || inQuotes) {
    endRecord(text.length, text.length)
  }

  return records
}

/** `true` when the record is an empty line (one empty cell and nothing else). */
export function isBlankRecord(record: CsvRecord): boolean {
  return record.cells.every((value) => value.trim() === '')
}
