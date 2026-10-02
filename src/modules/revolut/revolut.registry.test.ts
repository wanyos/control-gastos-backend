// How this bank is wired into the importer (feature 46). These two tests lived
// next to the tests of the route this bank had until feature 52; what they
// assert is about the registry of `src/app.ts`, so they stayed.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { bankParsers } from '../../app.js'
import { normalizeBankName } from '../../lib/drive-structure.js'
import { parseRevolutStatement } from './revolut.statement.parser.js'

describe('the Revolut parser in the importer registry', () => {
  it('is in the parser registry of the composition root, with the .csv extension', () => {
    // This single line is what makes `POST /api/import` stop reporting the files
    // of this bank as `skipped`; `src/app.ts` is the only file of `src/` allowed
    // to name a bank (ADR-015).
    const appSource = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')

    expect(appSource).toContain(
      "{ bank: 'revolut', extensions: ['.csv'], parse: parseRevolutStatement }",
    )
  })

  it('is chosen by the importer for a .csv in the revolut folder, with this very parser', () => {
    // The importer decides with the slug of the Drive FOLDER and the extension.
    // Checked against the REAL registry the composition root exports.
    const adapter = bankParsers.find((candidate) => candidate.bank === normalizeBankName('Revolut'))

    expect(adapter).toBeDefined()
    expect(adapter?.extensions).toContain(extname('revolut-2025.CSV').toLowerCase())
    expect(adapter?.parse).toBe(parseRevolutStatement)
  })
})
