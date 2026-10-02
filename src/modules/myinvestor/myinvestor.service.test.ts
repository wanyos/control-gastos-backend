import { describe, expect, it } from 'vitest'

import {
  buildProductDeposit,
  buildProductFund,
  buildProductJson,
  buildProductPortfolio,
} from './myinvestor.fixture.js'
import { parseMyinvestorProductFile } from './myinvestor.service.js'

// ── Feature 29: the entry of these files into the IMPORTER ──────────────────
//
// 🔒 Everything below is built from the synthetic fixtures of feature 13
// (ADR-017): invented names, invented amounts, not one datum of the owner.
describe('parseMyinvestorProductFile: the adapter of the product registry (feature 29)', () => {
  function bytes(file: Record<string, unknown>): Buffer {
    return Buffer.from(buildProductJson(file), 'utf8')
  }

  it('returns a product that fluctuates with its valuation attached (C1)', () => {
    const file = buildProductFund({ closedAt: null })

    const result = parseMyinvestorProductFile('fondo.json', bytes(file))

    expect(result).toEqual({
      bank: 'myinvestor',
      name: file.name,
      type: 'fund',
      currency: 'EUR',
      openedAt: file.openedAt,
      closedAt: null,
      date: file.date,
      valuation: {
        invested: 800,
        marketValue: 947.25,
        gain: 147.25,
        gainPercent: 18.41,
        uninvestedCash: null,
      },
    })
  })

  it('carries the uninvested cash of a managed portfolio apart (C1)', () => {
    const result = parseMyinvestorProductFile('cartera.json', bytes(buildProductPortfolio()))

    expect(result.type).toBe('managed_portfolio')
    expect(result).toHaveProperty('valuation.uninvestedCash', 12.05)
  })

  it('returns a deposit with its four conditions and NO valuation (C2)', () => {
    const file = buildProductDeposit()

    const result = parseMyinvestorProductFile('deposito.json', bytes(file))

    expect(result.type).toBe('deposit')
    expect(result).not.toHaveProperty('valuation')
    expect(result).toHaveProperty('depositTerms', {
      principal: 1200,
      interestRate: 1.5,
      expectedGain: 4.5,
      maturityDate: '2027-04-15',
    })
  })

  it('reads an ETF as its own type (C1)', () => {
    const result = parseMyinvestorProductFile('etf.json', bytes(buildProductFund({ type: 'etf' })))

    expect(result.type).toBe('etf')
  })

  it('demands not one field more than the template already asks for (C7)', () => {
    // The three fixtures are the ones feature 13 wrote, untouched: if this
    // feature had needed a new field, they would fail here.
    for (const file of [buildProductFund(), buildProductPortfolio(), buildProductDeposit()]) {
      expect(() => parseMyinvestorProductFile('producto.json', bytes(file))).not.toThrow()
    }
  })

  it('adds no interpretation of its own: it returns what the parser read (C6)', () => {
    // `gain` does not match `marketValue - invested` here on purpose. The
    // adapter is a shape change, never a second reading of the file.
    const file = buildProductFund({ gain: 1, gainPercent: 0.5 })

    const result = parseMyinvestorProductFile('fondo.json', bytes(file))

    expect(result).toHaveProperty('valuation.gain', 1)
    expect(result).toHaveProperty('valuation.gainPercent', 0.5)
  })

  it('throws the WHOLE reason of a badly written file, and stores nothing (C5)', () => {
    const file = buildProductFund({ uninvestedcash: 5 })
    delete file.marketValue

    expect(() => parseMyinvestorProductFile('fondo.json', bytes(file))).toThrow(
      /marketValue.*uninvestedcash|uninvestedcash.*marketValue/s,
    )
  })

  it('rejects a file that is not valid UTF-8 instead of storing a broken name (C5)', () => {
    const broken = Buffer.concat([
      Buffer.from('{"type":"fund","name":"Fondo ', 'utf8'),
      Buffer.from([0xff]),
      Buffer.from('"}', 'utf8'),
    ])

    expect(() => parseMyinvestorProductFile('fondo.json', broken)).toThrow()
  })
})

// ── Feature 30: the marker of the template never reaches the database ────────
//
// The adapter is the door the IMPORTER goes through (`src/app.ts` registry), so
// this is where it is proved that the rejection of the parser stops the write:
// it throws with the reason, `importDriveFile` fails the file and it is neither
// stored nor moved to `procesados/` (ADR-025).
describe('parseMyinvestorProductFile: a marker of the template (feature 30)', () => {
  function bytes(file: Record<string, unknown>): Buffer {
    return Buffer.from(buildProductJson(file), 'utf8')
  }

  it('throws instead of creating a product named after the placeholder (F30-1)', () => {
    const file = buildProductFund({
      name: '<nombre del producto, tal y como lo llamas siempre>',
    })

    expect(() => parseMyinvestorProductFile('fondo.json', bytes(file))).toThrow(
      /campos sin sustituir.*name/s,
    )
  })

  it('throws on a half-erased marker too, naming the field (F30-4)', () => {
    const file = buildProductDeposit({ name: '<nombre del depósito' })

    expect(() => parseMyinvestorProductFile('deposito.json', bytes(file))).toThrow(
      /A MEDIO SUSTITUIR.*name/s,
    )
  })

  it('keeps letting the four types through, untouched (F30-5)', () => {
    for (const file of [
      buildProductFund(),
      buildProductFund({ type: 'etf', name: 'ETF Sintetico' }),
      buildProductPortfolio(),
      buildProductDeposit(),
    ]) {
      expect(() => parseMyinvestorProductFile('producto.json', bytes(file))).not.toThrow()
    }
  })
})
