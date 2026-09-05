import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { currentMonth } from '../overview/overview.service.js'
import type {
  DepositProductOverview,
  FluctuatingProductOverview,
  InvestmentsOverviewResponse,
  SavingsProductOverview,
} from './investments.types.js'

// Every figure in this file is invented (see docs/conventions.md §Tests):
// fixtures only need to be well formed, never true.
describe('GET /api/investments/overview', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []

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
    type?: 'fund' | 'etf' | 'managed_portfolio' | 'deposit' | 'savings_account'
    openedAt?: string
    closedAt?: string
    principal?: string
    interestRate?: string
    expectedGain?: string
    maturityDate?: string
  }

  async function createProduct(overrides: SeedProduct = {}) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'myinvestor',
        name: `Synthetic product ${suffix}`,
        type: overrides.type ?? 'fund',
        openedAt: toDate(overrides.openedAt ?? '2025-11-03'),
        closedAt: overrides.closedAt === undefined ? null : toDate(overrides.closedAt),
        principal: overrides.principal ?? null,
        interestRate: overrides.interestRate ?? null,
        expectedGain: overrides.expectedGain ?? null,
        maturityDate: overrides.maturityDate === undefined ? null : toDate(overrides.maturityDate),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  interface SeedValuation {
    invested?: string
    marketValue?: string
    gain?: string | null
    gainPercent?: string | null
    uninvestedCash?: string | null
  }

  function seedValuation(productId: number, date: string, amounts: SeedValuation = {}) {
    return app.prisma.valuation.create({
      data: {
        productId,
        date: toDate(date),
        invested: amounts.invested ?? '1000.00',
        marketValue: amounts.marketValue ?? '1000.00',
        gain: amounts.gain === undefined ? '0.00' : amounts.gain,
        gainPercent: amounts.gainPercent === undefined ? '0.00' : amounts.gainPercent,
        uninvestedCash: amounts.uninvestedCash === undefined ? null : amounts.uninvestedCash,
      },
    })
  }

  function seedSnapshot(productId: number, date: string, interest = '8.40') {
    return app.prisma.savingsSnapshot.create({
      data: {
        productId,
        date: toDate(date),
        openingBalance: '5000.00',
        moneyIn: '200.00',
        moneyOut: '0.00',
        interest,
        balance: '5208.40',
      },
    })
  }

  function toDate(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`)
  }

  async function getOverview(query = ''): Promise<InvestmentsOverviewResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/investments/overview${query}` })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  function findProduct<T>(overview: InvestmentsOverviewResponse, id: number): T {
    const product = overview.products.find((entry) => entry.id === id)
    expect(product).toBeDefined()
    return product as T
  }

  it('returns the stored photos verbatim and the change measured on gain, in euros and percent points', async () => {
    const fund = await createProduct({ type: 'fund' })
    // `gain` is ON PURPOSE not marketValue - invested (that would be 500.75):
    // the stored number must come back untouched, never re-derived.
    await seedValuation(fund.id, '2026-07-30', {
      invested: '12300.00',
      marketValue: '12800.75',
      gain: '500.50',
      gainPercent: '4.07',
      uninvestedCash: '10.25',
    })
    await seedValuation(fund.id, '2026-06-28', {
      invested: '12000.00',
      marketValue: '12380.00',
      gain: '380.00',
      gainPercent: '3.17',
      uninvestedCash: '10.25',
    })

    const overview = await getOverview('?month=2026-07')

    expect(overview.period).toEqual({ month: '2026-07', from: '2026-07-01', to: '2026-07-31' })
    const product = findProduct<FluctuatingProductOverview>(overview, fund.id)
    expect(product.type).toBe('fund')
    expect(product.openedAt).toBe('2025-11-03')
    expect(product.closedAt).toBeNull()
    expect(product.valuation).toEqual({
      date: '2026-07-30',
      invested: '12300.00',
      marketValue: '12800.75',
      gain: '500.50',
      gainPercent: '4.07',
      uninvestedCash: '10.25',
    })
    expect(product.previousValuation).toEqual({
      date: '2026-06-28',
      invested: '12000.00',
      marketValue: '12380.00',
      gain: '380.00',
      gainPercent: '3.17',
      uninvestedCash: '10.25',
    })
    // Euros = 500.50 - 380.00; points = 4.07 - 3.17. Never marketValue-based
    // (that would say 420.75 and count the monthly contribution as a rise).
    expect(product.change).toEqual({ amount: '120.50', percentPoints: '0.9' })
    expect(overview.periodGain).toEqual({
      total: '120.50',
      fluctuation: '120.50',
      interest: '0.00',
      excluded: [],
    })
  })

  it('counts the interest of a savings account in the month its photo was paid, added to the fluctuation', async () => {
    const fund = await createProduct({ type: 'etf' })
    await seedValuation(fund.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })
    await seedValuation(fund.id, '2026-06-28', { gain: '380.00', gainPercent: '3.17' })
    const savings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(savings.id, '2026-07-31', '8.40')
    // A photo of ANOTHER month must not leak into this period's interest.
    await seedSnapshot(savings.id, '2026-06-30', '99.99')

    const overview = await getOverview('?month=2026-07')

    const product = findProduct<SavingsProductOverview>(overview, savings.id)
    expect(product.snapshot).toEqual({
      date: '2026-07-31',
      openingBalance: '5000.00',
      moneyIn: '200.00',
      moneyOut: '0.00',
      interest: '8.40',
      balance: '5208.40',
    })
    expect(overview.periodGain).toEqual({
      total: '128.90',
      fluctuation: '120.50',
      interest: '8.40',
      excluded: [],
    })
  })

  it('returns a deposit with its four conditions and WITHOUT valuation, previousValuation or change', async () => {
    const deposit = await createProduct({
      type: 'deposit',
      principal: '10000.00',
      interestRate: '2.75',
      expectedGain: '275.00',
      maturityDate: '2027-03-02',
    })

    const overview = await getOverview('?month=2026-07')

    const product = findProduct<DepositProductOverview>(overview, deposit.id)
    expect(product.conditions).toEqual({
      principal: '10000.00',
      interestRate: '2.75',
      expectedGain: '275.00',
      maturityDate: '2027-03-02',
    })
    // The fields do not even exist on a deposit: a null here could be misread
    // as "its photo is missing", and a deposit has no photo to miss (ADR-012).
    expect(product).not.toHaveProperty('valuation')
    expect(product).not.toHaveProperty('previousValuation')
    expect(product).not.toHaveProperty('change')
    expect(product).not.toHaveProperty('snapshot')
    // And it is never "excluded": it has no series to be missing from.
    expect(overview.periodGain.excluded).toEqual([])
  })

  it('flags a product without a photo in the period instead of passing the previous one off as current', async () => {
    const fund = await createProduct({ type: 'fund' })
    await seedValuation(fund.id, '2026-06-28', { gain: '380.00', gainPercent: '3.17' })

    const overview = await getOverview('?month=2026-07')

    const product = findProduct<FluctuatingProductOverview>(overview, fund.id)
    expect(product.valuation).toBeNull()
    // The previous photo may show, but always under its own date.
    expect(product.previousValuation?.date).toBe('2026-06-28')
    expect(product.change).toBeNull()
    expect(overview.periodGain).toEqual({
      total: '0.00',
      fluctuation: '0.00',
      interest: '0.00',
      excluded: [{ productId: fund.id, name: fund.name, reason: 'no_photo_in_period' }],
    })
  })

  it('flags the first photo of a series: nothing to vary against', async () => {
    const fund = await createProduct({ type: 'managed_portfolio' })
    await seedValuation(fund.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })

    const overview = await getOverview('?month=2026-07')

    const product = findProduct<FluctuatingProductOverview>(overview, fund.id)
    expect(product.valuation?.date).toBe('2026-07-30')
    expect(product.previousValuation).toBeNull()
    expect(product.change).toBeNull()
    expect(overview.periodGain.fluctuation).toBe('0.00')
    expect(overview.periodGain.excluded).toEqual([
      { productId: fund.id, name: fund.name, reason: 'no_previous_photo' },
    ])
  })

  it('nulls exactly the component whose gain is missing, and excludes only when the euro sum is impossible', async () => {
    // Fund A: previous gain is NULL -> euros not computable -> excluded; the
    // percent points still are, and they come out.
    const fundA = await createProduct({ type: 'fund' })
    await seedValuation(fundA.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })
    await seedValuation(fundA.id, '2026-06-28', { gain: null, gainPercent: '3.17' })
    // Fund B: a gainPercent is NULL -> points not computable, but the euros
    // are, so it DOES enter the sum and is not excluded.
    const fundB = await createProduct({ type: 'fund' })
    await seedValuation(fundB.id, '2026-07-30', { gain: '150.00', gainPercent: null })
    await seedValuation(fundB.id, '2026-06-28', { gain: '100.00', gainPercent: '1.10' })

    const overview = await getOverview('?month=2026-07')

    const productA = findProduct<FluctuatingProductOverview>(overview, fundA.id)
    expect(productA.change).toEqual({ amount: null, percentPoints: '0.9' })
    const productB = findProduct<FluctuatingProductOverview>(overview, fundB.id)
    expect(productB.change).toEqual({ amount: '50.00', percentPoints: null })
    expect(overview.periodGain).toEqual({
      total: '50.00',
      fluctuation: '50.00',
      interest: '0.00',
      excluded: [{ productId: fundA.id, name: fundA.name, reason: 'gain_not_reported' }],
    })
  })

  it('flags a savings account without a photo in the period', async () => {
    const savings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(savings.id, '2026-06-30', '5.00')

    const overview = await getOverview('?month=2026-07')

    const product = findProduct<SavingsProductOverview>(overview, savings.id)
    expect(product.snapshot).toBeNull()
    expect(overview.periodGain.interest).toBe('0.00')
    expect(overview.periodGain.excluded).toEqual([
      { productId: savings.id, name: savings.name, reason: 'no_photo_in_period' },
    ])
  })

  it('answers a period with no photo at all with 200 and zeroed sums, never an error', async () => {
    const fund = await createProduct({ type: 'fund' })

    const overview = await getOverview('?month=2024-02')

    expect(overview.period).toEqual({ month: '2024-02', from: '2024-02-01', to: '2024-02-29' })
    const product = findProduct<FluctuatingProductOverview>(overview, fund.id)
    expect(product.valuation).toBeNull()
    expect(product.previousValuation).toBeNull()
    expect(overview.periodGain).toEqual({
      total: '0.00',
      fluctuation: '0.00',
      interest: '0.00',
      excluded: [{ productId: fund.id, name: fund.name, reason: 'no_photo_in_period' }],
    })
  })

  it('takes the LATEST photo of the period when a month holds two, and the earlier one as previous', async () => {
    const fund = await createProduct({ type: 'fund' })
    await seedValuation(fund.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })
    await seedValuation(fund.id, '2026-07-15', { gain: '450.00', gainPercent: '3.70' })

    const overview = await getOverview('?month=2026-07')

    const product = findProduct<FluctuatingProductOverview>(overview, fund.id)
    expect(product.valuation?.date).toBe('2026-07-30')
    expect(product.previousValuation?.date).toBe('2026-07-15')
    expect(product.change).toEqual({ amount: '50.50', percentPoints: '0.37' })
  })

  it('leaves a product closed before the period out, and keeps one closed inside it', async () => {
    const closedBefore = await createProduct({ type: 'fund', closedAt: '2026-06-15' })
    const closedInside = await createProduct({
      type: 'deposit',
      closedAt: '2026-07-10',
      principal: '10000.00',
      interestRate: '2.75',
      expectedGain: '275.00',
      maturityDate: '2026-07-10',
    })

    const july = await getOverview('?month=2026-07')
    expect(july.products.find((entry) => entry.id === closedBefore.id)).toBeUndefined()
    expect(july.products.find((entry) => entry.id === closedInside.id)).toBeDefined()
    // Not in any sum either: not even as an exclusion.
    expect(july.periodGain.excluded).toEqual([])

    // Asking a month the product was still alive in brings it back.
    const june = await getOverview('?month=2026-06')
    expect(june.products.find((entry) => entry.id === closedBefore.id)).toBeDefined()
  })

  it('limits products and periodGain to the productId asked for', async () => {
    const fund = await createProduct({ type: 'fund' })
    await seedValuation(fund.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })
    await seedValuation(fund.id, '2026-06-28', { gain: '380.00', gainPercent: '3.17' })
    const savings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(savings.id, '2026-07-31', '8.40')

    const overview = await getOverview(`?month=2026-07&productId=${fund.id}`)

    expect(overview.products.map((entry) => entry.id)).toEqual([fund.id])
    expect(overview.periodGain).toEqual({
      total: '120.50',
      fluctuation: '120.50',
      interest: '0.00',
      excluded: [],
    })
  })

  it('answers 404 NOT_FOUND for a productId that does not exist', async () => {
    const ghost = await createProduct({ type: 'fund' })
    await app.prisma.investmentProduct.delete({ where: { id: ghost.id } })

    const response = await app.inject({
      method: 'GET',
      url: `/api/investments/overview?productId=${ghost.id}`,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('filters by type, combinable with month', async () => {
    const fund = await createProduct({ type: 'fund' })
    await seedValuation(fund.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })
    await seedValuation(fund.id, '2026-06-28', { gain: '380.00', gainPercent: '3.17' })
    const deposit = await createProduct({ type: 'deposit', principal: '10000.00' })

    const deposits = await getOverview('?month=2026-07&type=deposit')
    expect(deposits.products.map((entry) => entry.id)).toEqual([deposit.id])
    expect(deposits.periodGain).toEqual({
      total: '0.00',
      fluctuation: '0.00',
      interest: '0.00',
      excluded: [],
    })

    const funds = await getOverview('?month=2026-07&type=fund')
    expect(funds.products.map((entry) => entry.id)).toEqual([fund.id])
    expect(funds.periodGain.fluctuation).toBe('120.50')
  })

  it('defaults to the current month when no month is sent', async () => {
    const fund = await createProduct({ type: 'fund' })
    const today = new Date().toISOString().slice(0, 10)
    await seedValuation(fund.id, today, { gain: '500.50', gainPercent: '4.07' })

    const overview = await getOverview()

    expect(overview.period.month).toBe(currentMonth())
    const product = findProduct<FluctuatingProductOverview>(overview, fund.id)
    expect(product.valuation?.date).toBe(today)
  })

  it('rejects a malformed month, a type outside the enum and a bad productId with 400 VALIDATION_ERROR', async () => {
    const malformed = [
      '?month=2026-13',
      '?month=july',
      '?month=2026-07-01',
      '?type=stocks',
      '?productId=abc',
      '?productId=0',
      '?productId=1.5',
    ]
    for (const query of malformed) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/investments/overview${query}`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
  })

  it('ignores an unknown querystring parameter, same as GET /api/overview', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/investments/overview?foo=bar' })

    expect(response.statusCode).toBe(200)
  })

  it('exposes no write surface: only GET /overview exists under /api/investments', async () => {
    expect(app.hasRoute({ method: 'GET', url: '/api/investments/overview' })).toBe(true)
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'] as const) {
      expect(app.hasRoute({ method, url: '/api/investments/overview' })).toBe(false)
      expect(app.hasRoute({ method, url: '/api/investments' })).toBe(false)
    }
    // And the accounts contract is untouched by this feature.
    expect(app.hasRoute({ method: 'GET', url: '/api/accounts' })).toBe(true)
  })

  it('writes nothing while answering: the three investment tables are byte-identical after the read', async () => {
    const fund = await createProduct({ type: 'fund' })
    await seedValuation(fund.id, '2026-07-30', { gain: '500.50', gainPercent: '4.07' })
    const savings = await createProduct({ type: 'savings_account' })
    await seedSnapshot(savings.id, '2026-07-31')

    const snapshotTables = async () => [
      await app.prisma.investmentProduct.findMany({ orderBy: { id: 'asc' } }),
      await app.prisma.valuation.findMany({ orderBy: { id: 'asc' } }),
      await app.prisma.savingsSnapshot.findMany({ orderBy: { id: 'asc' } }),
    ]

    const before = await snapshotTables()
    await getOverview('?month=2026-07')
    const after = await snapshotTables()

    expect(after).toEqual(before)
  })
})
