// Tests of the single writer of the investments layer (feature 26, ADR-026).
//
// EVERY value here is invented (ADR-017): the account names are generated, the
// amounts are built by hand and they add up by construction. Nothing of the
// owner's own file -- not his account name, not one of his figures -- appears in
// this repository.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import {
  getInvestmentsNetWorth,
  persistDeposit,
  persistProductSnapshot,
  persistSavingsSnapshot,
  persistValuation,
} from './investments.service.js'
import type {
  DepositInput,
  ProductFileInput,
  SavingsSnapshotInput,
  ValuationInput,
} from './investments.types.js'

const bank = 'trade-republic-test-bank'

describe('persistSavingsSnapshot: the two upserts of a product file', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []
  let uniqueCounter = 0

  function uniqueName(): string {
    uniqueCounter += 1
    return `Cuenta Sintetica ${Date.now()}-${uniqueCounter}-${Math.floor(Math.random() * 1_000_000)}`
  }

  function input(overrides: Partial<SavingsSnapshotInput> = {}): SavingsSnapshotInput {
    return {
      bank,
      name: uniqueName(),
      type: 'savings_account',
      currency: 'EUR',
      openedAt: '2025-03-10',
      closedAt: null,
      date: '2026-08-31',
      openingBalance: 4000,
      moneyIn: 0,
      moneyOut: 0,
      interest: 6.4,
      balance: 4006.4,
      ...overrides,
    }
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdProductIds.length > 0) {
      await app.prisma.savingsSnapshot.deleteMany({
        where: { productId: { in: createdProductIds } },
      })
      await app.prisma.valuation.deleteMany({ where: { productId: { in: createdProductIds } } })
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function persist(value: SavingsSnapshotInput) {
    const result = await persistSavingsSnapshot(app.prisma, value)
    createdProductIds.push(result.product.id)
    return result
  }

  it('creates the product with the type, currency and dates of the file (R4)', async () => {
    const value = input({ openedAt: '2025-03-10', closedAt: null, currency: 'EUR' })

    const result = await persist(value)

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: result.product.id },
    })
    expect(stored.bank).toBe(bank)
    expect(stored.name).toBe(value.name)
    expect(stored.type).toBe('savings_account')
    expect(stored.currency).toBe('EUR')
    expect(stored.openedAt?.toISOString().slice(0, 10)).toBe('2025-03-10')
    expect(stored.closedAt).toBeNull()
    expect(result.product.created).toBe(true)
  })

  it('takes the bank from the folder and never from the contents (R4)', async () => {
    // The input carries the slug of the FOLDER; there is no bank field in the
    // file at all, and this is what says the service does not invent one.
    const result = await persist(input())

    expect(result.product.bank).toBe(bank)
  })

  it('stores the closing date when the file carries one (R4)', async () => {
    const result = await persist(input({ closedAt: '2026-08-31' }))

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: result.product.id },
    })
    expect(stored.closedAt?.toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('stores the five amounts exactly as written, computing nothing (R5)', async () => {
    // 1200.10 + 340.55 - 90.25 + 3.70 = 1454.10 by construction, but what is
    // checked is that each column carries its own number back unchanged.
    const value = input({
      date: '2026-07-31',
      openingBalance: 1200.1,
      moneyIn: 340.55,
      moneyOut: 90.25,
      interest: 3.7,
      balance: 1454.1,
    })

    const result = await persist(value)

    const stored = await app.prisma.savingsSnapshot.findUniqueOrThrow({
      where: {
        productId_date: {
          productId: result.product.id,
          date: new Date('2026-07-31T00:00:00.000Z'),
        },
      },
    })
    expect(stored.openingBalance.toFixed(2)).toBe('1200.10')
    expect(stored.moneyIn.toFixed(2)).toBe('340.55')
    expect(stored.moneyOut.toFixed(2)).toBe('90.25')
    expect(stored.interest.toFixed(2)).toBe('3.70')
    expect(stored.balance.toFixed(2)).toBe('1454.10')
    expect(stored.date.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(result.snapshot).toEqual({ date: '2026-07-31', created: true })
  })

  it('stores the amounts the bank rounded by one cent without correcting them (R5)', async () => {
    // 4000 + 0 - 0 + 6.40 would be 4006.40; the file says 4006.41 (the bank's
    // own rounding) and the file wins: nothing here recomputes a balance.
    const result = await persist(input({ balance: 4006.41 }))

    const stored = await app.prisma.savingsSnapshot.findFirstOrThrow({
      where: { productId: result.product.id },
    })
    expect(stored.balance.toFixed(2)).toBe('4006.41')
    expect(stored.balance.toFixed(2)).not.toBe('4006.40')
  })

  it('leaves one product and one photo when the same month is loaded twice (R6)', async () => {
    const value = input()

    const first = await persist(value)
    const second = await persist({ ...value, balance: 4009.9, interest: 9.9 })

    expect(second.product.id).toBe(first.product.id)
    expect(second.product.created).toBe(false)
    expect(second.snapshot).not.toBeNull()
    expect(second.snapshot?.created).toBe(false)
    expect(await app.prisma.investmentProduct.count({ where: { bank, name: value.name } })).toBe(1)
    const photos = await app.prisma.savingsSnapshot.findMany({
      where: { productId: first.product.id },
    })
    expect(photos).toHaveLength(1)
    expect(photos[0]?.balance.toFixed(2)).toBe('4009.90')
    expect(photos[0]?.interest.toFixed(2)).toBe('9.90')
  })

  it('reuses the product and adds one row for the next month (R7)', async () => {
    const value = input({ date: '2026-07-31', balance: 4006.4 })

    const first = await persist(value)
    const second = await persist({
      ...value,
      date: '2026-08-31',
      openingBalance: 4006.4,
      interest: 6.5,
      balance: 4012.9,
    })

    expect(second.product.id).toBe(first.product.id)
    expect(second.product.created).toBe(false)
    expect(second.snapshot).toEqual({ date: '2026-08-31', created: true })
    expect(await app.prisma.investmentProduct.count({ where: { bank, name: value.name } })).toBe(1)
    const series = await app.prisma.savingsSnapshot.findMany({
      where: { productId: first.product.id },
      orderBy: { date: 'asc' },
    })
    expect(series.map((photo) => photo.date.toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-08-31',
    ])
    expect(series.map((photo) => photo.balance.toFixed(2))).toEqual(['4006.40', '4012.90'])
  })

  it('writes no Valuation row for a savings account (R3)', async () => {
    const result = await persist(input())

    expect(await app.prisma.valuation.count({ where: { productId: result.product.id } })).toBe(0)
    expect(
      await app.prisma.savingsSnapshot.count({ where: { productId: result.product.id } }),
    ).toBe(1)
  })

  it('refuses to hang a photo on a product of another type instead of converting it (R3)', async () => {
    const name = uniqueName()
    const fund = await app.prisma.investmentProduct.create({
      data: { bank, name, type: 'fund' },
    })
    createdProductIds.push(fund.id)

    await expect(persistSavingsSnapshot(app.prisma, input({ name }))).rejects.toThrow(/'fund'/)

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({ where: { id: fund.id } })
    expect(stored.type).toBe('fund')
    expect(await app.prisma.savingsSnapshot.count({ where: { productId: fund.id } })).toBe(0)
  })

  it('rejects an input whose type is not savings_account before touching the database (R3, R8)', async () => {
    const value = { ...input(), type: 'deposit' } as unknown as SavingsSnapshotInput

    await expect(persistSavingsSnapshot(app.prisma, value)).rejects.toThrow(/savings_account/)

    expect(await app.prisma.investmentProduct.count({ where: { bank, name: value.name } })).toBe(0)
  })

  it('leaves neither product nor photo when the write is rejected (R8)', async () => {
    // A date the database cannot store: the transaction has already upserted the
    // product when it blows up, so this is what proves the two writes are one.
    const value = input({ date: 'not-a-date' })

    await expect(persistSavingsSnapshot(app.prisma, value)).rejects.toThrow()

    expect(await app.prisma.investmentProduct.count({ where: { bank, name: value.name } })).toBe(0)
  })

  it('touches neither Account nor Movement (R14)', async () => {
    // Scoped to a bank of its own: the suite runs in parallel, so a GLOBAL count
    // would read the rows other test files create and delete meanwhile.
    const flowBank = `zz-investments-${Date.now()}-${(uniqueCounter += 1)}`
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: flowBank, alias: 'Investments flow guard' },
    })
    await app.prisma.movement.create({
      data: {
        type: 'expense',
        bookingDate: new Date('2026-08-01T00:00:00.000Z'),
        valueDate: new Date('2026-08-01T00:00:00.000Z'),
        amount: '10.00',
        description: 'SYNTHETIC FLOW ROW',
        accountId: account.id,
        daySequence: 1,
      },
    })

    try {
      await persist(input())

      expect(await app.prisma.account.count({ where: { bank: flowBank } })).toBe(1)
      expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(1)
      // And the row of the flow keeps its own shape: nothing links it to the
      // product this run just created.
      const movement = await app.prisma.movement.findFirstOrThrow({
        where: { accountId: account.id },
      })
      expect(movement.productId).toBeNull()
    } finally {
      await app.prisma.movement.deleteMany({ where: { accountId: account.id } })
      await app.prisma.account.delete({ where: { id: account.id } })
    }
  })
})

// ── Feature 29: the twins of the writer, for the other four types ───────────
//
// 🔒 Every value here is invented (ADR-017): unique generated product names, a
// bank slug of its own, and amounts built by hand.

describe('persistValuation: a product that fluctuates (feature 29)', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []
  let counter = 0

  const bank29 = 'zz-myinvestor-test-bank'

  function uniqueName(): string {
    counter += 1
    return `Producto Sintetico ${Date.now()}-${counter}-${Math.floor(Math.random() * 1_000_000)}`
  }

  function fund(overrides: Partial<ValuationInput> = {}): ValuationInput {
    return {
      bank: bank29,
      name: uniqueName(),
      type: 'fund',
      currency: 'EUR',
      openedAt: '2025-01-15',
      closedAt: null,
      date: '2026-08-31',
      valuation: {
        invested: 800,
        marketValue: 947.25,
        gain: 147.25,
        gainPercent: 18.4063,
        uninvestedCash: null,
      },
      ...overrides,
    }
  }

  function deposit(overrides: Partial<DepositInput> = {}): DepositInput {
    return {
      bank: bank29,
      name: uniqueName(),
      type: 'deposit',
      currency: 'EUR',
      openedAt: '2026-01-15',
      closedAt: null,
      date: '2026-08-31',
      depositTerms: {
        principal: 1200,
        interestRate: 1.5,
        expectedGain: 4.5,
        maturityDate: '2027-04-15',
      },
      ...overrides,
    }
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdProductIds.length > 0) {
      await app.prisma.valuation.deleteMany({ where: { productId: { in: createdProductIds } } })
      await app.prisma.savingsSnapshot.deleteMany({
        where: { productId: { in: createdProductIds } },
      })
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function persist(value: ProductFileInput) {
    const result = await persistProductSnapshot(app.prisma, value)
    createdProductIds.push(result.product.id)
    return result
  }

  it('creates the product with its type, currency and dates (C1)', async () => {
    const value = fund({ type: 'etf', closedAt: '2026-09-30' })

    const result = await persist(value)

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: result.product.id },
    })
    expect(stored.bank).toBe(bank29)
    expect(stored.name).toBe(value.name)
    expect(stored.type).toBe('etf')
    expect(stored.currency).toBe('EUR')
    expect(stored.openedAt?.toISOString().slice(0, 10)).toBe('2025-01-15')
    expect(stored.closedAt?.toISOString().slice(0, 10)).toBe('2026-09-30')
    expect(result.product.created).toBe(true)
  })

  it('stores the three types that fluctuate, each with its own row (C1)', async () => {
    for (const type of ['fund', 'etf', 'managed_portfolio'] as const) {
      const result = await persist(fund({ type }))

      const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
        where: { id: result.product.id },
      })
      expect(stored.type).toBe(type)
      expect(await app.prisma.valuation.count({ where: { productId: stored.id } })).toBe(1)
    }
  })

  it('stores the five numbers as written, computing nothing (C1)', async () => {
    // On purpose, `gain` does NOT match `marketValue - invested`: what the file
    // says is what is stored, and no column is recomputed here.
    const value = fund({
      valuation: {
        invested: 800,
        marketValue: 947.25,
        gain: 100,
        gainPercent: 12.5,
        uninvestedCash: 12.05,
      },
    })

    const result = await persist(value)

    const row = await app.prisma.valuation.findFirstOrThrow({
      where: { productId: result.product.id },
    })
    expect(row.invested.toFixed(2)).toBe('800.00')
    expect(row.marketValue.toFixed(2)).toBe('947.25')
    expect(row.gain?.toFixed(2)).toBe('100.00')
    expect(row.gainPercent?.toFixed(4)).toBe('12.5000')
    expect(row.uninvestedCash?.toFixed(2)).toBe('12.05')
  })

  it('leaves the cash column NULL when the file carries none (C1)', async () => {
    const result = await persist(fund())

    const row = await app.prisma.valuation.findFirstOrThrow({
      where: { productId: result.product.id },
    })
    expect(row.uninvestedCash).toBeNull()
  })

  it('writes no SavingsSnapshot for a product that fluctuates (C2)', async () => {
    const result = await persist(fund())

    expect(
      await app.prisma.savingsSnapshot.count({ where: { productId: result.product.id } }),
    ).toBe(0)
    expect(await app.prisma.valuation.count({ where: { productId: result.product.id } })).toBe(1)
  })

  it('leaves one product and one row when the same date is loaded twice (C4)', async () => {
    const value = fund()

    const first = await persist(value)
    const second = await persist({
      ...value,
      valuation: { ...value.valuation, marketValue: 950.1 },
    })

    expect(second.product.id).toBe(first.product.id)
    expect(second.product.created).toBe(false)
    expect(second.snapshot).not.toBeNull()
    expect(second.snapshot?.created).toBe(false)
    expect(
      await app.prisma.investmentProduct.count({ where: { bank: bank29, name: value.name } }),
    ).toBe(1)
    const rows = await app.prisma.valuation.findMany({ where: { productId: first.product.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.marketValue.toFixed(2)).toBe('950.10')
  })

  it('reuses the product and adds a row for the next date (C4)', async () => {
    const value = fund({ date: '2026-07-31' })

    const first = await persist(value)
    const second = await persist({ ...value, date: '2026-08-31' })

    expect(second.product.id).toBe(first.product.id)
    expect(second.product.created).toBe(false)
    expect(second.snapshot?.created).toBe(true)
    expect(
      await app.prisma.investmentProduct.count({ where: { bank: bank29, name: value.name } }),
    ).toBe(1)
    const rows = await app.prisma.valuation.findMany({
      where: { productId: first.product.id },
      orderBy: { date: 'asc' },
    })
    expect(rows.map((row) => row.date.toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-08-31',
    ])
  })

  it('refuses to hang a row on a product of another type (C2)', async () => {
    const name = uniqueName()
    const other = await app.prisma.investmentProduct.create({
      data: { bank: bank29, name, type: 'savings_account' },
    })
    createdProductIds.push(other.id)

    await expect(persistValuation(app.prisma, fund({ name }))).rejects.toThrow(/'savings_account'/)

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: other.id },
    })
    expect(stored.type).toBe('savings_account')
    expect(await app.prisma.valuation.count({ where: { productId: other.id } })).toBe(0)
  })

  it('rejects an input whose type has no Valuation, before touching anything (C3)', async () => {
    const value = { ...fund(), type: 'deposit' } as unknown as ValuationInput

    await expect(persistValuation(app.prisma, value)).rejects.toThrow(/Valuation/)

    expect(
      await app.prisma.investmentProduct.count({ where: { bank: bank29, name: value.name } }),
    ).toBe(0)
  })

  it('leaves neither product nor row when the write is rejected (C5)', async () => {
    // A date the database cannot store: the product has already been upserted
    // when it blows up, so this is what proves the two writes are one.
    const value = fund({ date: 'not-a-date' })

    await expect(persistValuation(app.prisma, value)).rejects.toThrow()

    expect(
      await app.prisma.investmentProduct.count({ where: { bank: bank29, name: value.name } }),
    ).toBe(0)
  })

  it('stores the four conditions of a deposit on the product itself (C2)', async () => {
    const value = deposit()

    const result = await persist(value)

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: result.product.id },
    })
    expect(stored.type).toBe('deposit')
    expect(stored.principal?.toFixed(2)).toBe('1200.00')
    expect(stored.interestRate?.toFixed(4)).toBe('1.5000')
    expect(stored.expectedGain?.toFixed(2)).toBe('4.50')
    expect(stored.maturityDate?.toISOString().slice(0, 10)).toBe('2027-04-15')
  })

  it('gives a deposit no Valuation and no SavingsSnapshot at all (C2)', async () => {
    const result = await persist(deposit())

    expect(await app.prisma.valuation.count({ where: { productId: result.product.id } })).toBe(0)
    expect(
      await app.prisma.savingsSnapshot.count({ where: { productId: result.product.id } }),
    ).toBe(0)
    // And it says so instead of reporting a photo that does not exist.
    expect(result.snapshot).toBeNull()
  })

  it('does not duplicate a deposit loaded twice (C4)', async () => {
    const value = deposit()

    const first = await persist(value)
    const second = await persist({
      ...value,
      depositTerms: { ...value.depositTerms, expectedGain: 4.75 },
    })

    expect(second.product.id).toBe(first.product.id)
    expect(second.product.created).toBe(false)
    expect(
      await app.prisma.investmentProduct.count({ where: { bank: bank29, name: value.name } }),
    ).toBe(1)
    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: first.product.id },
    })
    expect(stored.expectedGain?.toFixed(2)).toBe('4.75')
  })

  it('leaves the four deposit columns NULL on a product that fluctuates (C2)', async () => {
    const result = await persist(fund())

    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { id: result.product.id },
    })
    expect(stored.principal).toBeNull()
    expect(stored.interestRate).toBeNull()
    expect(stored.expectedGain).toBeNull()
    expect(stored.maturityDate).toBeNull()
  })

  it('rejects a deposit input whose type is not deposit (C3)', async () => {
    const value = { ...deposit(), type: 'fund' } as unknown as DepositInput

    await expect(persistDeposit(app.prisma, value)).rejects.toThrow(/deposit/)

    expect(
      await app.prisma.investmentProduct.count({ where: { bank: bank29, name: value.name } }),
    ).toBe(0)
  })

  it('sends each type to its own writer and leaves the F26 one untouched (C3)', async () => {
    // The dispatcher is the ONLY thing that reads `type` to choose a writer.
    // `persistSavingsSnapshot` still refuses anything else, exactly as F26 left
    // it: that is what "nothing already proved is re-proved" means here.
    const savings: SavingsSnapshotInput = {
      bank: bank29,
      name: uniqueName(),
      type: 'savings_account',
      currency: 'EUR',
      openedAt: '2025-03-10',
      closedAt: null,
      date: '2026-08-31',
      openingBalance: 4000,
      moneyIn: 0,
      moneyOut: 0,
      interest: 6.4,
      balance: 4006.4,
    }

    const viaSavings = await persist(savings)
    const viaValuation = await persist(fund())
    const viaDeposit = await persist(deposit())

    expect(
      await app.prisma.savingsSnapshot.count({ where: { productId: viaSavings.product.id } }),
    ).toBe(1)
    expect(await app.prisma.valuation.count({ where: { productId: viaSavings.product.id } })).toBe(
      0,
    )
    expect(
      await app.prisma.valuation.count({ where: { productId: viaValuation.product.id } }),
    ).toBe(1)
    expect(viaDeposit.snapshot).toBeNull()

    await expect(
      persistSavingsSnapshot(app.prisma, { ...savings, type: 'fund' } as never),
    ).rejects.toThrow(/savings_account/)
  })

  it('touches neither Account nor Movement (C8)', async () => {
    const accountsBefore = await app.prisma.account.count()
    const movementsBefore = await app.prisma.movement.count()

    await persist(fund())
    await persist(deposit())

    expect(await app.prisma.account.count()).toBe(accountsBefore)
    expect(await app.prisma.movement.count()).toBe(movementsBefore)
  })
})

// ── Feature 42: the valuation of every live product for GET /api/net-worth ──
//
// 🔒 Every value here is invented (ADR-017): unique generated product names, a
// bank slug of its own, and amounts built by hand. The clock is FIXED through
// the `today` parameter, never read from the wall.

describe('getInvestmentsNetWorth: what every live product is worth today (feature 42)', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []
  let counter = 0

  const bank42 = 'zz-net-worth-test-bank'
  // Date-only midnight UTC, like every photo date. staleBefore derives from
  // it: first day of the month before September = 2026-08-01.
  const today = new Date('2026-09-15T00:00:00.000Z')

  function uniqueName(): string {
    counter += 1
    return `Producto Patrimonio ${Date.now()}-${counter}-${Math.floor(Math.random() * 1_000_000)}`
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdProductIds.length > 0) {
      await app.prisma.valuation.deleteMany({ where: { productId: { in: createdProductIds } } })
      await app.prisma.savingsSnapshot.deleteMany({
        where: { productId: { in: createdProductIds } },
      })
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  interface SeedProduct {
    type: 'fund' | 'etf' | 'managed_portfolio' | 'deposit' | 'savings_account'
    closedAt?: string | null
    principal?: string
    expectedGain?: string
    maturityDate?: string
  }

  async function createProduct(seed: SeedProduct) {
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: bank42,
        name: uniqueName(),
        type: seed.type,
        closedAt: seed.closedAt == null ? null : new Date(`${seed.closedAt}T00:00:00.000Z`),
        principal: seed.principal ?? null,
        expectedGain: seed.expectedGain ?? null,
        maturityDate:
          seed.maturityDate === undefined ? null : new Date(`${seed.maturityDate}T00:00:00.000Z`),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  interface SeedValuation {
    productId: number
    date: string
    marketValue: string
    uninvestedCash?: string | null
  }

  function seedValuation(seed: SeedValuation) {
    return app.prisma.valuation.create({
      data: {
        productId: seed.productId,
        date: new Date(`${seed.date}T00:00:00.000Z`),
        invested: '100.00',
        marketValue: seed.marketValue,
        gain: null,
        gainPercent: null,
        uninvestedCash: seed.uninvestedCash ?? null,
      },
    })
  }

  function seedSnapshot(productId: number, date: string, balance: string) {
    return app.prisma.savingsSnapshot.create({
      data: {
        productId,
        date: new Date(`${date}T00:00:00.000Z`),
        openingBalance: '0.00',
        moneyIn: '0.00',
        moneyOut: '0.00',
        interest: '0.00',
        balance,
      },
    })
  }

  it('values a fluctuating product as marketValue + uninvestedCash of its most recent photo (R3)', async () => {
    const fund = await createProduct({ type: 'fund' })
    // An older photo AND a photo later than today: neither may be the one used.
    await seedValuation({ productId: fund.id, date: '2026-07-31', marketValue: '900.00' })
    await seedValuation({
      productId: fund.id,
      date: '2026-08-31',
      marketValue: '1000.40',
      uninvestedCash: '12.10',
    })
    await seedValuation({ productId: fund.id, date: '2026-09-30', marketValue: '9999.99' })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    const entry = result.products.find((product) => product.id === fund.id)
    expect(entry).toMatchObject({
      type: 'fund',
      value: '1012.50',
      marketValue: '1000.40',
      uninvestedCash: '12.10',
      valuedAt: '2026-08-31',
      stale: false,
    })
    expect(result.total).toBe('1012.50')
    expect(result.issues).toEqual([])
  })

  it('adds only marketValue when the photo carries no uninvestedCash — no invented zero (R3)', async () => {
    const etf = await createProduct({ type: 'etf' })
    await seedValuation({
      productId: etf.id,
      date: '2026-08-31',
      marketValue: '500.25',
      uninvestedCash: null,
    })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    const entry = result.products.find((product) => product.id === etf.id)
    expect(entry).toMatchObject({ value: '500.25', marketValue: '500.25', uninvestedCash: null })
    expect(result.total).toBe('500.25')
  })

  it('values a live deposit by its principal, without adding expectedGain (R4)', async () => {
    const deposit = await createProduct({
      type: 'deposit',
      principal: '3000.00',
      expectedGain: '82.50',
      maturityDate: '2027-03-01',
    })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    const entry = result.products.find((product) => product.id === deposit.id)
    expect(entry).toMatchObject({
      type: 'deposit',
      value: '3000.00',
      principal: '3000.00',
      expectedGain: '82.50',
      maturityDate: '2027-03-01',
      matured: false,
    })
    expect(result.total).toBe('3000.00')
    expect(result.issues).toEqual([])
  })

  it('values a savings account by the balance of its most recent snapshot (R5)', async () => {
    const savings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(savings.id, '2026-07-31', '4000.00')
    await seedSnapshot(savings.id, '2026-08-31', '4006.40')

    const result = await getInvestmentsNetWorth(app.prisma, today)

    const entry = result.products.find((product) => product.id === savings.id)
    expect(entry).toMatchObject({
      type: 'savings_account',
      value: '4006.40',
      valuedAt: '2026-08-31',
      stale: false,
    })
    expect(result.total).toBe('4006.40')
  })

  it('neither lists nor sums a closed product (R6)', async () => {
    const closed = await createProduct({ type: 'fund', closedAt: '2026-08-15' })
    await seedValuation({ productId: closed.id, date: '2026-07-31', marketValue: '700.00' })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    expect(result.products.find((product) => product.id === closed.id)).toBeUndefined()
    expect(result.issues.find((issue) => issue.productId === closed.id)).toBeUndefined()
    expect(result.total).toBe('0.00')
  })

  it('lists a product without any photo as a null gap, out of the sum, with its reason (R7)', async () => {
    const fund = await createProduct({ type: 'fund' })
    const savings = await createProduct({ type: 'savings_account' })
    const funded = await createProduct({ type: 'etf' })
    await seedValuation({ productId: funded.id, date: '2026-08-31', marketValue: '100.00' })
    // A photo LATER than today is not a photo of today: still a gap.
    await seedValuation({ productId: fund.id, date: '2026-10-31', marketValue: '888.88' })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    expect(result.products.find((product) => product.id === fund.id)).toMatchObject({
      value: null,
      marketValue: null,
      uninvestedCash: null,
      valuedAt: null,
      stale: false,
    })
    expect(result.products.find((product) => product.id === savings.id)).toMatchObject({
      value: null,
      valuedAt: null,
      stale: false,
    })
    expect(result.total).toBe('100.00')
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { productId: fund.id, name: fund.name, reason: 'no_valuation', valuedAt: null },
        { productId: savings.id, name: savings.name, reason: 'no_valuation', valuedAt: null },
      ]),
    )
    expect(result.issues).toHaveLength(2)
  })

  it('still sums a photo older than the first day of last month, but warns with its date (R8)', async () => {
    // today = 2026-09-15 → staleBefore = 2026-08-01. A 2026-07-31 photo is
    // stale; a 2026-08-01 photo is not (the threshold is strict `<`).
    const staleFund = await createProduct({ type: 'fund' })
    await seedValuation({ productId: staleFund.id, date: '2026-07-31', marketValue: '250.00' })
    const freshSavings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(freshSavings.id, '2026-08-01', '100.00')
    const staleSavings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(staleSavings.id, '2026-06-30', '50.00')

    const result = await getInvestmentsNetWorth(app.prisma, today)

    expect(result.products.find((product) => product.id === staleFund.id)).toMatchObject({
      value: '250.00',
      valuedAt: '2026-07-31',
      stale: true,
    })
    expect(result.products.find((product) => product.id === freshSavings.id)).toMatchObject({
      stale: false,
    })
    expect(result.products.find((product) => product.id === staleSavings.id)).toMatchObject({
      value: '50.00',
      stale: true,
    })
    // The old values STILL sum: the warning marks them, it never hides money.
    expect(result.total).toBe('400.00')
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          productId: staleFund.id,
          name: staleFund.name,
          reason: 'stale_valuation',
          valuedAt: '2026-07-31',
        },
        {
          productId: staleSavings.id,
          name: staleSavings.name,
          reason: 'stale_valuation',
          valuedAt: '2026-06-30',
        },
      ]),
    )
    expect(result.issues).toHaveLength(2)
  })

  it('keeps summing a matured deposit that is still open, and warns about it (R9)', async () => {
    const matured = await createProduct({
      type: 'deposit',
      principal: '2000.00',
      expectedGain: '30.00',
      maturityDate: '2026-08-31',
    })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    expect(result.products.find((product) => product.id === matured.id)).toMatchObject({
      value: '2000.00',
      matured: true,
    })
    expect(result.total).toBe('2000.00')
    expect(result.issues).toEqual([
      {
        productId: matured.id,
        name: matured.name,
        reason: 'matured_not_closed',
        valuedAt: '2026-08-31',
      },
    ])
  })

  it('serializes every amount exactly as stored and sums in Decimal, rounding nothing (R10)', async () => {
    // Amounts chosen so a float sum would drift: 0.1 + 0.2 style cents.
    const fund = await createProduct({ type: 'fund' })
    await seedValuation({
      productId: fund.id,
      date: '2026-08-31',
      marketValue: '1000.10',
      uninvestedCash: '0.20',
    })
    const savings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(savings.id, '2026-08-31', '2000.30')
    const deposit = await createProduct({
      type: 'deposit',
      principal: '3000.40',
      maturityDate: '2027-01-01',
    })

    const result = await getInvestmentsNetWorth(app.prisma, today)

    expect(result.products.find((product) => product.id === fund.id)).toMatchObject({
      marketValue: '1000.10',
      uninvestedCash: '0.20',
      value: '1000.30',
    })
    expect(result.products.find((product) => product.id === savings.id)).toMatchObject({
      value: '2000.30',
    })
    expect(result.products.find((product) => product.id === deposit.id)).toMatchObject({
      value: '3000.40',
    })
    expect(result.total).toBe('6001.00')
  })
})
