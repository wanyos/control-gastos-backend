// How this bank is wired into the importer (feature 18). These two tests lived
// next to the tests of the route this bank had until feature 52; what they
// assert is about the registry of `src/app.ts`, so they stayed.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildStatementCsv } from './n26.fixture.js'
import { parseN26Statement } from './n26.statement.parser.js'

describe('the N26 parser in the importer registry', () => {
  it('is in the parser registry of the composition root, with the .csv extension (C12)', () => {
    // This single line is what makes `POST /api/import` stop reporting the files
    // of this bank as `skipped`; `src/app.ts` is the only file of `src/` allowed
    // to name a bank (ADR-015).
    const appSource = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')

    expect(appSource).toContain("{ bank: 'n26', extensions: ['.csv'], parse: parseN26Statement }")
  })

  it('leaves the account to the existing importer path when the iban is not written (C8)', () => {
    // No new path is written here: with no `iban;` line the statement simply
    // comes out with `accountIban: null`, which is the case the importer already
    // resolves (the single registered account of the bank, or
    // MISSING_ACCOUNT_DATA when there are none or several).
    const result = parseN26Statement(buildStatementCsv())

    expect(result.accountIban).toBeNull()
    expect(result.movements.length).toBeGreaterThan(0)
  })
})
