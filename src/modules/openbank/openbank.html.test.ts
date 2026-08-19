import { describe, expect, it } from 'vitest'

import {
  buildOpenbankStatementText,
  documentationIban,
  openbankHeaders,
} from './openbank.fixture.js'
import { readDeclaredCharset, readHtmlComments, readHtmlTableRows } from './openbank.html.js'

/**
 * Every document here is built in code (`openbank.fixture.ts`): nothing is
 * copied from the real file, which carries names of people (feature 14).
 */
describe('readHtmlTableRows — slicing the table (R5)', () => {
  it('returns one entry per <tr>, numbered 1-based, decorative rows included', () => {
    const rows = readHtmlTableRows(buildOpenbankStatementText())

    // 1 spacer + 4 preamble + 1 balance + 1 spacer + 1 header + 10 movements + 1 closing.
    expect(rows).toHaveLength(19)
    expect(rows[0].row).toBe(1)
    expect(rows.at(-1)?.row).toBe(19)
  })

  it('reads the text of a cell through its nested tags', () => {
    const rows = readHtmlTableRows(
      '<tr><td><font id="x"><b>Fecha Valor</b></font></td><td><i>17/08/2026</i></td></tr>',
    )

    expect(rows[0].cells).toEqual(['Fecha Valor', '17/08/2026'])
  })

  it('keeps the self-closed cells as empty ones, so the row shape is preserved', () => {
    const rows = readHtmlTableRows(
      '<tr><td id="TDSeparadorInicial" /><td><font>-19,84</font></td><td /></tr>',
    )

    expect(rows[0].cells).toEqual(['', '-19,84', ''])
  })

  it('collapses the whitespace of a cell written across several lines', () => {
    const rows = readHtmlTableRows('<tr><td>\n\t  COMPRA   TARJETA\n  INVENTADA\t</td></tr>')

    expect(rows[0].cells).toEqual(['COMPRA TARJETA INVENTADA'])
  })

  it('resolves the entities an export can carry, and &amp; last of all', () => {
    const rows = readHtmlTableRows(
      '<tr><td>TIENDA &amp; CIA</td><td>&lt;X&gt;</td><td>&quot;Y&quot;</td>' +
        '<td>&#65;&#x42;</td><td>&amp;lt;</td></tr>',
    )

    expect(rows[0].cells).toEqual(['TIENDA & CIA', '<X>', '"Y"', 'AB', '&lt;'])
  })

  it('gives the decorative rows of ten empty cells, which the parser then ignores', () => {
    const rows = readHtmlTableRows(buildOpenbankStatementText())
    const decorative = rows.filter((row) => row.cells.every((cell) => cell === ''))

    expect(decorative).toHaveLength(3)
    expect(decorative[0].cells).toHaveLength(10)
  })

  it('gives the header row its five names among the spacers of the real layout', () => {
    const rows = readHtmlTableRows(buildOpenbankStatementText())
    const header = rows.find((row) => row.cells.includes(openbankHeaders[0]))

    expect(header?.cells).toHaveLength(10)
    expect(header?.cells.filter((cell) => cell !== '')).toEqual(openbankHeaders)
  })

  it('returns nothing for a document with no table at all', () => {
    expect(readHtmlTableRows('<html><body><p>no hay tabla</p></body></html>')).toEqual([])
  })
})

describe('readDeclaredCharset — what the file says about itself (R3)', () => {
  it('reads the charset of the Content-Type meta this bank writes', () => {
    expect(readDeclaredCharset(buildOpenbankStatementText())).toBe('iso-8859-1')
  })

  it('reads the short HTML5 form too, lowercased', () => {
    expect(readDeclaredCharset('<head><meta charset="UTF-8"></head>')).toBe('utf-8')
  })

  it('returns null when the document declares nothing', () => {
    expect(readDeclaredCharset(buildOpenbankStatementText({ charset: null }))).toBeNull()
  })

  it('reports the charset actually declared when it is another one', () => {
    expect(readDeclaredCharset(buildOpenbankStatementText({ charset: 'utf-8' }))).toBe('utf-8')
  })
})

describe('readHtmlComments — where the human writes the IBAN (R11)', () => {
  it('reads the comment of the first line, before the table', () => {
    const comments = readHtmlComments(buildOpenbankStatementText(), '<table')

    expect(comments).toEqual([`iban;${documentationIban}`])
  })

  it('returns nothing when the file comes untouched from the bank', () => {
    expect(readHtmlComments(buildOpenbankStatementText({ iban: null }), '<table')).toEqual([])
  })

  it('ignores a comment written INSIDE the table, whatever it says', () => {
    const document = `<html><!-- iban;${documentationIban} --><table><tr><!-- iban;OTRO --></tr></table></html>`

    expect(readHtmlComments(document, '<table')).toEqual([`iban;${documentationIban}`])
  })

  it('keeps the order of several comments, so the first one can win', () => {
    const document = '<html><!-- iban;UNO --><!-- iban;DOS --><table></table></html>'

    expect(readHtmlComments(document, '<table')).toEqual(['iban;UNO', 'iban;DOS'])
  })
})
