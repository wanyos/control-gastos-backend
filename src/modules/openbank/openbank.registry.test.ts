// How this bank is wired into the importer (feature 19). These three tests
// lived next to the tests of the route this bank had until feature 52; what
// they assert is about the registry of `src/app.ts`, so they stayed.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { normalizeBankName } from '../../lib/drive-structure.js'
import type { BankParserAdapter } from '../import/import.types.js'
import { buildOpenbankStatement } from './openbank.fixture.js'
import { parseOpenbankStatement } from './openbank.statement.parser.js'

describe('the Openbank parser in the importer registry', () => {
  it('is in the parser registry of the composition root, with the .xls extension', () => {
    // This single line is what makes `POST /api/import` stop reporting the files
    // of this bank as `skipped`; `src/app.ts` is the only file of `src/` allowed
    // to name a bank (ADR-015).
    const appSource = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')

    expect(appSource).toContain(
      "{ bank: 'openbank', extensions: ['.xls'], parse: parseOpenbankStatement }",
    )
  })

  it('leaves the account to the existing importer path when the IBAN is not written', () => {
    // No new path is written here: with no `<!-- iban;… -->` comment the
    // statement simply comes out with `accountIban: null`, which is the case the
    // importer already resolves (the single registered account of the bank, or
    // MISSING_ACCOUNT_DATA when there are none or several).
    const result = parseOpenbankStatement(buildOpenbankStatement({ iban: null }))

    expect(result.accountIban).toBeNull()
    expect(result.movements.length).toBeGreaterThan(0)
  })

  it('stops POST /api/import reporting this bank .xls as skipped', () => {
    // The importer decides with exactly two things (`selectAdapter`): the slug
    // of the Drive FOLDER and the extension of the file. Both are checked here,
    // against the very adapter the composition root registers. The importer's
    // own suite cannot do it: it is forbidden from naming a bank (ADR-015, and
    // a guardian of architecture.test.ts).
    const adapter: BankParserAdapter = {
      bank: 'openbank',
      extensions: ['.xls'],
      parse: parseOpenbankStatement,
    }

    expect(normalizeBankName('Openbank')).toBe(adapter.bank)
    expect(adapter.extensions).toContain(extname('movimientos-2026-08-17.xls').toLowerCase())
    expect(adapter.parse(buildOpenbankStatement())).toMatchObject({ bank: 'openbank' })
  })
})
