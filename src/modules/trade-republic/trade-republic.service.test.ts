import { describe, expect, it } from 'vitest'

import {
  buildAccountJson,
  buildSavingsAccount,
  buildSavingsAccountOffByEuros,
  buildSavingsAccountOffByOneCent,
  buildSavingsAccountWithMovements,
  tradeRepublicTemplate,
} from './trade-republic.fixture.js'
import { parseTradeRepublicProductFile } from './trade-republic.service.js'

// ── Feature 26: the same step, exported for the importer ────────────────────
//
// Every value below is invented (ADR-017). What these tests protect is the door
// the file goes through before the importer WRITES it into the database: strict
// decoding, every check of the parser, and the whole reason when it is wrong.
describe('parseTradeRepublicProductFile — the door the importer uses (F26 R8, R15)', () => {
  function parse(account: Record<string, unknown>, file = 'cuenta-remunerada.json') {
    return parseTradeRepublicProductFile(file, Buffer.from(buildAccountJson(account), 'utf8'))
  }

  it('returns the account with its five amounts when the file is good', () => {
    const parsed = parse(buildSavingsAccountWithMovements({ date: '2026-08-31' }))

    expect(parsed.type).toBe('savings_account')
    expect(parsed.date).toBe('2026-08-31')
    expect(parsed.openedAt).toBe('2025-03-10')
    expect(parsed.closedAt).toBeNull()
    expect(parsed.currency).toBe('EUR')
    expect({
      openingBalance: parsed.openingBalance,
      moneyIn: parsed.moneyIn,
      moneyOut: parsed.moneyOut,
      interest: parsed.interest,
      balance: parsed.balance,
    }).toEqual({
      openingBalance: 4000,
      moneyIn: 500,
      moneyOut: 120,
      interest: 6.4,
      balance: 4386.4,
    })
  })

  it('accepts the month the bank rounded by one cent', () => {
    expect(parse(buildSavingsAccountOffByOneCent()).balance).toBe(4006.41)
  })

  it('throws the WHOLE reason when the five amounts do not add up', () => {
    expect(() => parse(buildSavingsAccountOffByEuros())).toThrowError(
      /los importes no cuadran.*saldo inicial \+ entradas - salidas \+ intereses = saldo final/s,
    )
  })

  it('names every unsubstituted marker when the template is uploaded as is', () => {
    expect(() =>
      parseTradeRepublicProductFile('plantilla.json', Buffer.from(tradeRepublicTemplate, 'utf8')),
    ).toThrowError(/campos sin sustituir.*type.*name.*date/s)
  })

  it('rejects a file with a mandatory field missing, naming it', () => {
    const withoutName = buildSavingsAccount()
    delete withoutName.name

    expect(() => parse(withoutName)).toThrowError(/faltan campos obligatorios: name/)
  })

  it('rejects an amount written as text instead of a number', () => {
    expect(() => parse(buildSavingsAccount({ balance: '4006.40' }))).toThrowError(/balance/)
  })

  it('rejects an invalid date', () => {
    expect(() => parse(buildSavingsAccount({ date: '2026-02-30' }))).toThrowError(/date/)
  })

  it('rejects a key the template does not carry', () => {
    expect(() => parse(buildSavingsAccount({ iban: 'ES9121000418450200051332' }))).toThrowError(
      /iban/,
    )
  })

  it('rejects a type that is not savings_account', () => {
    expect(() => parse(buildSavingsAccount({ type: 'deposit' }))).toThrowError(
      /type: valor no admitido/,
    )
  })

  it('rejects bytes that are not UTF-8 instead of losing the accents in silence', () => {
    // The same file saved as cp1252: the accented byte is 0xF3 on its own.
    const latin1 = Buffer.from(
      buildAccountJson(buildSavingsAccount({ name: 'Cuenta Sintética' })),
      'latin1',
    )

    expect(() => parseTradeRepublicProductFile('cuenta.json', latin1)).toThrowError()
  })

  it('rejects a file that is not JSON at all', () => {
    expect(() =>
      parseTradeRepublicProductFile('cuenta.json', Buffer.from('no soy json', 'utf8')),
    ).toThrowError(/JSON inválido/)
  })
})
