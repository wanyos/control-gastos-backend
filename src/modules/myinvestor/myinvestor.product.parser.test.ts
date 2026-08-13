import { describe, expect, it } from 'vitest'

import {
  buildProductDeposit,
  buildProductFund,
  buildProductJson,
  buildProductPortfolio,
  type ProductFile,
} from './myinvestor.fixture.js'
import { parseMyinvestorProduct } from './myinvestor.product.parser.js'
import type { ParsedProduct } from './myinvestor.types.js'

function parse(product: ProductFile, file = 'producto.json'): ParsedProduct | { reason: string } {
  return parseMyinvestorProduct(file, buildProductJson(product))
}

/** Asserts the file parsed and returns the product. */
function parsedOk(result: ParsedProduct | { reason: string }): ParsedProduct {
  if ('reason' in result) {
    throw new Error(`expected a parsed product, got a failure: ${result.reason}`)
  }
  return result
}

/** Asserts the file failed and returns the accumulated reason. */
function failureReason(result: ParsedProduct | { reason: string }): string {
  if (!('reason' in result)) {
    throw new Error(`expected a failure, got the product ${result.name}`)
  }
  return result.reason
}

describe('parseMyinvestorProduct — the four product types (R21, R22, R33, R34, R35)', () => {
  it('parses a fund, an ETF and a managed portfolio with the same four figures', () => {
    for (const type of ['fund', 'etf', 'managed_portfolio'] as const) {
      const product = parsedOk(parse(buildProductFund({ type })))

      expect(product.type).toBe(type)
      expect(product.valuation).toEqual({
        invested: 800,
        marketValue: 947.25,
        gain: 147.25,
        gainPercent: 18.41,
        uninvestedCash: null,
      })
      expect(product.depositTerms).toBeNull()
    }
  })

  it('parses a deposit with its four conditions and no valuation at all (R35)', () => {
    const product = parsedOk(parse(buildProductDeposit()))

    expect(product.type).toBe('deposit')
    expect(product.depositTerms).toEqual({
      principal: 1200,
      interestRate: 1.5,
      expectedGain: 4.5,
      maturityDate: '2027-04-15',
    })
    expect(product.valuation).toBeNull()
  })

  it('rejects a deposit that carries valuation fields, which are not its own (R35)', () => {
    const reason = failureReason(
      parse(buildProductDeposit({ marketValue: 1204.5, uninvestedCash: 10 })),
    )

    expect(reason).toContain("claves no admitidas para el tipo 'deposit'")
    expect(reason).toContain('marketValue')
    expect(reason).toContain('uninvestedCash')
  })

  it('emits the whole product with its bank and its source file as provenance (R21)', () => {
    const product = parsedOk(parse(buildProductFund(), 'fondo-2026-08-31.json'))

    expect(product).toEqual({
      bank: 'myinvestor',
      file: 'fondo-2026-08-31.json',
      type: 'fund',
      name: 'Fondo Sintetico Global',
      date: '2026-08-31',
      currency: 'EUR',
      closedAt: null,
      valuation: {
        invested: 800,
        marketValue: 947.25,
        gain: 147.25,
        gainPercent: 18.41,
        uninvestedCash: null,
      },
      depositTerms: null,
    })
  })
})

describe('parseMyinvestorProduct — identity, dates and currency (R23, R24, R28, R29, R32)', () => {
  it('takes the name and the date from the contents (R23)', () => {
    const product = parsedOk(parse(buildProductFund({ name: 'Fondo A', date: '2026-08-31' })))

    expect(product.name).toBe('Fondo A')
    expect(product.date).toBe('2026-08-31')
  })

  it('never derives the name nor the date from the file name (R24)', () => {
    const product = parsedOk(
      parse(buildProductFund({ name: 'Fondo A', date: '2026-08-31' }), 'fondo-b-2020-01-01.json'),
    )

    expect(product.name).toBe('Fondo A')
    expect(product.date).toBe('2026-08-31')
    // The file name survives only as provenance.
    expect(product.file).toBe('fondo-b-2020-01-01.json')
  })

  it('assumes EUR when the currency is not written, and keeps it when it is (R32)', () => {
    expect(parsedOk(parse(buildProductFund())).currency).toBe('EUR')
    expect(parsedOk(parse(buildProductFund({ currency: null }))).currency).toBe('EUR')
    expect(parsedOk(parse(buildProductFund({ currency: 'USD' }))).currency).toBe('USD')
  })

  it('treats an absent optional field and a null one exactly the same (R32)', () => {
    const absent = parsedOk(parse(buildProductPortfolio({ uninvestedCash: undefined })))
    const nulled = parsedOk(parse(buildProductPortfolio({ uninvestedCash: null })))
    const present = parsedOk(parse(buildProductPortfolio({ uninvestedCash: 12.05 })))

    expect(absent.valuation?.uninvestedCash).toBeNull()
    expect(nulled).toEqual(absent)
    expect(present.valuation?.uninvestedCash).toBe(12.05)
  })

  it('reads the percentages as percentages, never as fractions (R29)', () => {
    const fund = parsedOk(parse(buildProductFund({ gainPercent: 2.75 })))
    const deposit = parsedOk(parse(buildProductDeposit({ interestRate: 2.75 })))

    expect(fund.valuation?.gainPercent).toBe(2.75)
    expect(deposit.depositTerms?.interestRate).toBe(2.75)
  })
})

describe('parseMyinvestorProduct — closing a product (R30, R31)', () => {
  it('keeps closedAt when it is written, in both shapes of product (R30)', () => {
    expect(parsedOk(parse(buildProductFund({ closedAt: '2027-04-15' }))).closedAt).toBe(
      '2027-04-15',
    )
    expect(parsedOk(parse(buildProductDeposit({ closedAt: '2027-04-15' }))).closedAt).toBe(
      '2027-04-15',
    )
  })

  it('reports a product with no closedAt as alive, never as closed (R30, R31)', () => {
    expect(parsedOk(parse(buildProductFund())).closedAt).toBeNull()
    expect(parsedOk(parse(buildProductFund({ closedAt: null }))).closedAt).toBeNull()
  })
})

describe('parseMyinvestorProduct — the numbers are written as native JSON (R26, R27, R38)', () => {
  it('accepts integers and decimals and keeps the exact value written (R26, R27)', () => {
    for (const [written, expected] of [
      [947.25, 947.25],
      [-3.47, -3.47],
      [31000, 31000],
      [147.25, 147.25],
      [947.2, 947.2],
      [947.255, 947.255],
    ] as const) {
      const product = parsedOk(parse(buildProductFund({ marketValue: written })))

      expect(product.valuation?.marketValue).toBe(expected)
    }
  })

  it('neither rounds nor fixes the number of decimals (R27)', () => {
    const product = parsedOk(parse(buildProductFund({ marketValue: 947.255, invested: 31000 })))

    // 947.255 is NOT rounded to 947.26, and 31000 is NOT reformatted to 31000.00.
    expect(product.valuation?.marketValue).toBe(947.255)
    expect(product.valuation?.invested).toBe(31000)
    expect(JSON.stringify(product.valuation)).toContain('31000')
    expect(JSON.stringify(product.valuation)).not.toContain('947.26')
  })

  it('keeps the negative sign of gain and gainPercent (R38)', () => {
    const product = parsedOk(parse(buildProductFund({ gain: -1234.56, gainPercent: -3.47 })))

    expect(product.valuation?.gain).toBe(-1234.56)
    expect(product.valuation?.gainPercent).toBe(-3.47)
  })

  it('does not import the statement number normalizer (R26)', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./myinvestor.product.parser.ts', import.meta.url), 'utf8'),
    )

    // Only the doc comment may name it (to explain why it is NOT used here).
    expect(source).not.toMatch(/import\s*\{[^}]*parseAmountText/)
  })
})

describe('parseMyinvestorProduct — it computes nothing and adds nothing up (R36, R39)', () => {
  it('emits the uninvested cash apart, never added into marketValue (R36)', () => {
    const product = parsedOk(
      parse(buildProductPortfolio({ marketValue: 3210.4, uninvestedCash: 12.05 })),
    )

    expect(product.valuation?.marketValue).toBe(3210.4)
    expect(product.valuation?.uninvestedCash).toBe(12.05)
    // No field anywhere holds the sum of the two.
    expect(JSON.stringify(product)).not.toContain('3222.45')
  })

  it('returns the gain as written even when it does not match the other figures (R39)', () => {
    const product = parsedOk(
      parse(buildProductFund({ invested: 1000, marketValue: 1100, gain: 80, gainPercent: 1 })),
    )

    expect(product.valuation?.gain).toBe(80)
    expect(product.valuation?.gainPercent).toBe(1)
  })
})

describe('parseMyinvestorProduct — a badly written file (R40-R45, R48, R77)', () => {
  it('reports a broken JSON with its reason instead of throwing (R45)', () => {
    const reason = failureReason(parseMyinvestorProduct('fondo.json', '{ "type": "fund",'))

    expect(reason).toContain('JSON inválido')
  })

  it('reports something that is not a single product object (R21)', () => {
    const reason = failureReason(parseMyinvestorProduct('fondo.json', '[]'))

    expect(reason).toContain('se espera un objeto con un solo producto')
  })

  it('names every missing mandatory field at once, not the first one (R40)', () => {
    const reason = failureReason(parse(buildProductFund({ invested: undefined, gain: undefined })))

    expect(reason).toContain('faltan campos obligatorios')
    expect(reason).toContain('invested')
    expect(reason).toContain('gain')
  })

  it('names the missing condition of a deposit (R34)', () => {
    const reason = failureReason(parse(buildProductDeposit({ maturityDate: undefined })))

    expect(reason).toContain('faltan campos obligatorios')
    expect(reason).toContain('maturityDate')
  })

  it('reports a numeric field that is not a JSON number, with the value received (R41)', () => {
    for (const [written, shown] of [
      [true, 'true'],
      [[], '[]'],
      [{ valor: 1 }, '{"valor":1}'],
    ] as [unknown, string][]) {
      const reason = failureReason(parse(buildProductFund({ marketValue: written })))

      expect(reason).toContain('marketValue: se espera un número')
      expect(reason).toContain(shown)
    }
  })

  it('rejects a numeric value written as text and never interprets it (R77)', () => {
    for (const written of ['3210.4', '3.210,40', '3.210,40 €']) {
      const result = parse(buildProductFund({ marketValue: written }))
      const reason = failureReason(result)

      expect(reason).toContain('marketValue: se espera un número sin comillas')
      expect(reason).toContain(written)
      // And the figure was NOT interpreted behind the scenes: there is no product.
      expect(result).not.toHaveProperty('valuation')
    }
  })

  it('lists the four admitted types when the type is another one (R42)', () => {
    const reason = failureReason(parse(buildProductFund({ type: 'acciones' })))

    expect(reason).toContain('type: valor no admitido "acciones"')
    for (const admitted of ['fund', 'etf', 'managed_portfolio', 'deposit']) {
      expect(reason).toContain(admitted)
    }
  })

  it('names the field and the expected format for a date in another shape (R43)', () => {
    for (const written of ['15/04/27', '15/04/2027', '2027-13-01']) {
      const reason = failureReason(parse(buildProductDeposit({ maturityDate: written })))

      expect(reason).toContain('maturityDate')
      expect(reason).toContain('AAAA-MM-DD')
      expect(reason).toContain(written)
    }
  })

  it('reports the photo date in the same way (R28, R43)', () => {
    const reason = failureReason(parse(buildProductFund({ date: '31/08/2026' })))

    expect(reason).toContain('date: fecha inválida')
    expect(reason).toContain('AAAA-MM-DD')
  })

  it('catches a silent typo as an unknown key, alongside the field it left missing (R44)', () => {
    const reason = failureReason(
      parse(buildProductFund({ marketValue: undefined, markeValue: 947.25 })),
    )

    expect(reason).toContain('markeValue')
    expect(reason).toContain('faltan campos obligatorios: marketValue')
  })

  it('rejects a second interest rate on a deposit as an unknown key (R37)', () => {
    const reason = failureReason(
      parse(
        buildProductDeposit({ interestRateWithoutPremium: 0.9, expectedGainWithoutPremium: 2.7 }),
      ),
    )

    expect(reason).toContain('interestRateWithoutPremium')
    expect(reason).toContain('expectedGainWithoutPremium')
  })

  it('ignores the keys that start with _, which are the human notes (R44)', () => {
    const product = parsedOk(
      parse(buildProductFund({ _nota: 'traspaso pendiente', _origen: 'web del banco' })),
    )

    expect(product.name).toBe('Fondo Sintetico Global')
    expect(product).not.toHaveProperty('_nota')
  })

  it('rejects the bank written inside the file: it comes from the folder (R44)', () => {
    const reason = failureReason(parse(buildProductFund({ bank: 'myinvestor' })))

    expect(reason).toContain('bank')
  })

  it('accumulates every problem of the same file into a single reason (R48)', () => {
    const reason = failureReason(
      parse(
        buildProductFund({
          invested: undefined,
          marketValue: true,
          date: '31/08/2026',
          sobra: 'clave que no existe',
        }),
      ),
    )

    expect(reason).toContain('faltan campos obligatorios: invested')
    expect(reason).toContain('marketValue: se espera un número')
    expect(reason).toContain('date: fecha inválida')
    expect(reason).toContain('sobra')
  })
})
