import { describe, expect, it } from 'vitest'

import {
  buildAccountJson,
  buildSavingsAccount,
  buildSavingsAccountFloatingPoint,
  buildSavingsAccountOffByEuros,
  buildSavingsAccountOffByOneCent,
  buildSavingsAccountWithMovements,
  mandatoryKeys,
  tradeRepublicTemplate,
  type AccountFile,
} from './trade-republic.fixture.js'
import { checkBalanceEquation, parseTradeRepublicProduct } from './trade-republic.product.parser.js'

/** Parses a fixture object as if it were the file the human wrote. */
function parse(account: AccountFile, file = 'cuenta-remunerada-2026-08-31.json') {
  return parseTradeRepublicProduct(file, buildAccountJson(account))
}

/** The reason of a rejected file; fails loudly if it was accepted. */
function reasonOf(result: ReturnType<typeof parse>): string {
  if (!('reason' in result)) {
    throw new Error('expected the file to be rejected, but it was parsed')
  }
  return result.reason
}

describe('parseTradeRepublicProduct — a well written account file (R7)', () => {
  it('returns the nine mandatory fields exactly as written', () => {
    const result = parse(buildSavingsAccountWithMovements())

    expect(result).toEqual({
      bank: 'trade-republic',
      file: 'cuenta-remunerada-2026-08-31.json',
      type: 'savings_account',
      name: 'Cuenta Sintetica Remunerada',
      date: '2026-08-31',
      openedAt: '2025-03-10',
      currency: 'EUR',
      openingBalance: 4000,
      moneyIn: 500,
      moneyOut: 120,
      interest: 6.4,
      balance: 4386.4,
      closedAt: null,
    })
  })

  it('neither rounds nor reformats a number, and computes nothing', () => {
    const result = parse(
      buildSavingsAccount({
        openingBalance: 4000.005,
        moneyIn: 0,
        moneyOut: 0,
        interest: 6.4,
        balance: 4006.405,
      }),
    )

    expect(result).toMatchObject({ openingBalance: 4000.005, balance: 4006.405, interest: 6.4 })
  })

  it('assumes EUR when the currency is not written, and keeps it when it is', () => {
    expect(parse(buildSavingsAccount())).toMatchObject({ currency: 'EUR' })
    expect(parse(buildSavingsAccount({ currency: 'USD' }))).toMatchObject({ currency: 'USD' })
  })

  it('reads a closed account: closedAt is the day it was closed, not a flag', () => {
    expect(parse(buildSavingsAccount({ closedAt: '2026-08-31' }))).toMatchObject({
      closedAt: '2026-08-31',
    })
  })
})

describe('the template copied without filling it in (R2)', () => {
  it('is rejected, naming EVERY field still carrying its marker', () => {
    const result = parseTradeRepublicProduct('plantilla.json', tradeRepublicTemplate)
    const reason = reasonOf(result)

    for (const key of [...mandatoryKeys, 'closedAt']) {
      expect(reason).toContain(key)
    }
    expect(reason).toContain('campos sin sustituir')
  })

  it('returns no product at all, not one named after the placeholder', () => {
    const result = parseTradeRepublicProduct('plantilla.json', tradeRepublicTemplate)

    expect('reason' in result).toBe(true)
    expect(result).not.toHaveProperty('name')
  })

  it('rejects a single field left as a marker, even one that looks like valid text', () => {
    // `name` is the trap: a marker IS a non-empty string, so nothing but this
    // check catches it, and the account would enter named `<cómo llamas…>`.
    const reason = reasonOf(parse(buildSavingsAccount({ name: '<cómo llamas tú a esta cuenta>' })))

    expect(reason).toContain('campos sin sustituir')
    expect(reason).toContain('name')
  })

  it('does not report a mismatch on top of the markers: the amounts were never read', () => {
    const reason = reasonOf(parseTradeRepublicProduct('plantilla.json', tradeRepublicTemplate))

    expect(reason).not.toContain('no cuadran')
  })
})

describe('missing mandatory fields (R8)', () => {
  it('names ALL the ones missing, not the first', () => {
    const account = buildSavingsAccount()
    delete account.name
    delete account.openedAt
    delete account.moneyOut

    const reason = reasonOf(parse(account))

    expect(reason).toContain('faltan campos obligatorios')
    expect(reason).toContain('name')
    expect(reason).toContain('openedAt')
    expect(reason).toContain('moneyOut')
  })

  it('treats an explicit null as absent', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ interest: null })))

    expect(reason).toContain('faltan campos obligatorios: interest')
  })

  it('names the three amounts of the equation when the whole block is missing', () => {
    const account = buildSavingsAccount()
    delete account.openingBalance
    delete account.moneyIn
    delete account.moneyOut

    expect(reasonOf(parse(account))).toContain(
      'faltan campos obligatorios: openingBalance, moneyIn, moneyOut',
    )
  })

  it('reports a missing type with the only admitted value', () => {
    const account = buildSavingsAccount()
    delete account.type

    const reason = reasonOf(parse(account))

    expect(reason).toContain('type: campo obligatorio ausente')
    expect(reason).toContain('savings_account')
  })
})

describe('values that do not meet what their field expects (R9)', () => {
  it('rejects a number written as text and never interprets it', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ balance: '4006.40' })))

    expect(reason).toContain('balance: se espera un número sin comillas, recibido "4006.40"')
  })

  it('rejects a number written with a decimal comma (the case he named)', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ openingBalance: '1.234,56' })))

    expect(reason).toContain(
      'openingBalance: se espera un número sin comillas, recibido "1.234,56"',
    )
  })

  it('rejects a value that is not a number at all, saying what it received', () => {
    expect(reasonOf(parse(buildSavingsAccount({ moneyIn: true })))).toContain(
      'moneyIn: se espera un número, recibido true',
    )
    expect(reasonOf(parse(buildSavingsAccount({ moneyOut: [] })))).toContain(
      'moneyOut: se espera un número, recibido []',
    )
    expect(reasonOf(parse(buildSavingsAccount({ interest: {} })))).toContain(
      'interest: se espera un número, recibido {}',
    )
  })

  it('rejects a date outside AAAA-MM-DD, naming the expected format', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ date: '31/08/2026' })))

    expect(reason).toContain('date: fecha inválida, se espera el formato AAAA-MM-DD')
    expect(reason).toContain('"31/08/2026"')
  })

  it('rejects a date that is well formed but does not exist on the calendar', () => {
    expect(reasonOf(parse(buildSavingsAccount({ openedAt: '2026-02-31' })))).toContain(
      'openedAt: fecha inválida',
    )
  })

  it('rejects a type that is not savings_account, with the value and the admitted one', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ type: 'fund' })))

    expect(reason).toContain('type: valor no admitido "fund"')
    expect(reason).toContain('valores admitidos: savings_account')
  })

  it('rejects a name that is empty text', () => {
    expect(reasonOf(parse(buildSavingsAccount({ name: '   ' })))).toContain(
      'name: se espera un texto no vacío',
    )
  })

  it('rejects a file that is not a JSON object', () => {
    expect(reasonOf(parseTradeRepublicProduct('x.json', '[]'))).toContain(
      'se espera un objeto con una sola cuenta',
    )
    expect(reasonOf(parseTradeRepublicProduct('x.json', '{ roto'))).toContain('JSON inválido')
  })
})

describe('unknown keys (R11)', () => {
  it('rejects them by name', () => {
    const reason = reasonOf(
      parse(buildSavingsAccount({ iban: 'ES9121000418450200051332', interestRate: 2.5 })),
    )

    expect(reason).toContain('claves no admitidas: iban, interestRate')
  })

  it('catches the silent typo of a real key', () => {
    const account = buildSavingsAccount({ moneyin: 0 })
    delete account.moneyIn

    const reason = reasonOf(parse(account))

    expect(reason).toContain('claves no admitidas: moneyin')
    expect(reason).toContain('faltan campos obligatorios: moneyIn')
  })

  it('ignores the keys starting with _ : they are his notes', () => {
    const result = parse(buildSavingsAccount({ _nota: 'el mes que subí la aportación' }))

    expect(result).toMatchObject({ name: 'Cuenta Sintetica Remunerada' })
    expect(result).not.toHaveProperty('_nota')
  })
})

describe('several problems at once (R12)', () => {
  it('reports them ALL in a single reason, so fixing the file is one trip', () => {
    const account = buildSavingsAccount({
      type: 'deposit',
      date: '31/08/2026',
      interest: '6,40',
      sobrante: 1,
    })
    delete account.openedAt

    const reason = reasonOf(parse(account))

    expect(reason).toContain('faltan campos obligatorios: openedAt')
    expect(reason).toContain('type: valor no admitido "deposit"')
    expect(reason).toContain('date: fecha inválida')
    expect(reason).toContain('interest: se espera un número sin comillas')
    expect(reason).toContain('claves no admitidas: sobrante')
    // One reason, not five files' worth of trips.
    expect(reason.split('; ').length).toBeGreaterThanOrEqual(5)
  })
})

describe('the file checks itself: the arithmetic mismatch (R17, R18)', () => {
  it('(a) accepts the month that adds up, with no mismatch in sight', () => {
    const result = parse(buildSavingsAccountWithMovements())

    expect('reason' in result).toBe(false)
  })

  it('(b) REJECTS a mismatch of euros, saying the deviation and the five amounts', () => {
    const reason = reasonOf(parse(buildSavingsAccountOffByEuros()))

    expect(reason).toContain('los importes no cuadran')
    // The deviation, signed: the written balance is 100 € above the expected one.
    expect(reason).toContain('se desvía +100.00 €')
    expect(reason).toContain('saldo final esperado 4006.40, escrito 4106.40')
    for (const key of ['openingBalance', 'moneyIn', 'moneyOut', 'interest', 'balance']) {
      expect(reason).toContain(key)
    }
    expect(reason).toContain('saldo inicial + entradas - salidas + intereses = saldo final')
  })

  it('(b bis) says the deviation with a MINUS sign when the balance falls short', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ balance: 3906.4 })))

    expect(reason).toContain('se desvía -100.00 €')
  })

  it('(c) accepts a deviation of exactly one cent: that is the bank rounding', () => {
    const result = parse(buildSavingsAccountOffByOneCent())

    expect('reason' in result).toBe(false)
    // And the balance comes out AS WRITTEN: the tolerance forgives, never fixes.
    expect(result).toMatchObject({ balance: 4006.41 })
  })

  it('(c bis) rejects two cents: the tolerance is one, not "about right"', () => {
    expect(reasonOf(parse(buildSavingsAccount({ balance: 4006.42 })))).toContain(
      'los importes no cuadran',
    )
  })

  it('(d) accepts amounts that do not add up in raw floating point', () => {
    // The proof the comparison is in whole cents: this is false in `number`.
    expect(1000.1 + 0.2).not.toBe(1000.3)

    expect('reason' in parse(buildSavingsAccountFloatingPoint())).toBe(false)
  })

  it('(e) does NOT add a mismatch on top of a missing amount', () => {
    const account = buildSavingsAccount()
    delete account.moneyOut

    const reason = reasonOf(parse(account))

    expect(reason).toBe('faltan campos obligatorios: moneyOut')
    expect(reason).not.toContain('no cuadran')
  })

  it('(e bis) does NOT add a mismatch on top of an amount written as text', () => {
    const reason = reasonOf(parse(buildSavingsAccount({ moneyIn: '0' })))

    expect(reason).toContain('se espera un número sin comillas')
    expect(reason).not.toContain('no cuadran')
  })

  it('counts moneyIn WITHOUT the interest: counting it twice would fail a good month', () => {
    // The same month as the canonical fixture, but with the interest also inside
    // `moneyIn`, which is what copying the statement summary blindly produces.
    const reason = reasonOf(parse(buildSavingsAccount({ moneyIn: 6.4 })))

    expect(reason).toContain('se desvía -6.40 €')
  })
})

describe('checkBalanceEquation on its own (R17, R18)', () => {
  const balanced = {
    openingBalance: 4000,
    moneyIn: 0,
    moneyOut: 0,
    interest: 6.4,
    balance: 4006.4,
  }

  it('returns null when it adds up', () => {
    expect(checkBalanceEquation(balanced)).toBeNull()
  })

  it('forgives one cent in either direction and no more', () => {
    expect(checkBalanceEquation({ ...balanced, balance: 4006.41 })).toBeNull()
    expect(checkBalanceEquation({ ...balanced, balance: 4006.39 })).toBeNull()
    expect(checkBalanceEquation({ ...balanced, balance: 4006.42 })).not.toBeNull()
    expect(checkBalanceEquation({ ...balanced, balance: 4006.38 })).not.toBeNull()
  })

  it('subtracts what went out', () => {
    expect(checkBalanceEquation({ ...balanced, moneyOut: 1000, balance: 3006.4 })).toBeNull()
  })
})
