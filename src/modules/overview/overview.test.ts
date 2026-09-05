import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { SerializedAccount } from '../accounts/accounts.types.js'
import { currentMonth, monthRange } from './overview.service.js'
import type { OverviewResponse } from './overview.types.js'

describe('monthRange', () => {
  it('returns the first and last day of a 31-day month', () => {
    expect(monthRange('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('returns the 29th as last day of February in a leap year', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('returns the 28th as last day of February in a common year', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('handles December without spilling into the next year', () => {
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('GET /api/overview', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdProductIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
    // After the movements pointing at them are gone.
    if (createdProductIds.length > 0) {
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  interface SeedAccount {
    initialBalance?: string
    balanceAnchor?: string
    balanceAnchorDate?: string
    balanceAnchorDaySequence?: number
  }

  async function createAccount(overrides: SeedAccount = {}) {
    const account = await app.prisma.account.create({
      data: {
        iban: syntheticIban(),
        bank: 'bankinter',
        alias: 'Overview test account',
        initialBalance: overrides.initialBalance ?? '0.00',
        ...(overrides.balanceAnchor === undefined
          ? {}
          : {
              balanceAnchor: overrides.balanceAnchor,
              balanceAnchorDate: new Date(`${overrides.balanceAnchorDate}T00:00:00.000Z`),
              balanceAnchorDaySequence: overrides.balanceAnchorDaySequence ?? null,
            }),
      },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    accountId: number
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    bookingDate?: string
    daySequence?: number | null
    transferId?: string | null
    productId?: number | null
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date(`${movement.bookingDate ?? '2026-06-15'}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount ?? '10.00',
        description: 'OVERVIEW TEST MOVEMENT',
        bookingDate,
        valueDate: bookingDate,
        daySequence: movement.daySequence === undefined ? 1 : movement.daySequence,
        transferId: movement.transferId ?? null,
        productId: movement.productId ?? null,
      },
    })
  }

  async function createProduct() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const product = await app.prisma.investmentProduct.create({
      data: { bank: 'myinvestor', name: `Synthetic overview fund ${suffix}`, type: 'fund' },
    })
    createdProductIds.push(product.id)
    return product
  }

  async function getOverview(query = ''): Promise<OverviewResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/overview${query}` })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  it('returns the total and the per-account breakdown with the SAME balance as GET /api/accounts', async () => {
    // Anchored account (feature 31): the anchor plus what comes strictly after
    // it; the movement older than the anchor must NOT move the balance.
    const anchored = await createAccount({
      balanceAnchor: '1000.00',
      balanceAnchorDate: '2026-07-15',
      balanceAnchorDaySequence: 1,
    })
    await seedMovement({
      accountId: anchored.id,
      type: 'income',
      amount: '200.00',
      bookingDate: '2026-07-20',
    })
    await seedMovement({
      accountId: anchored.id,
      type: 'expense',
      amount: '999.99',
      bookingDate: '2026-07-01',
    })
    // Unanchored account: initialBalance plus everything.
    const plain = await createAccount({ initialBalance: '50.00' })
    await seedMovement({
      accountId: plain.id,
      type: 'income',
      amount: '25.50',
      bookingDate: '2026-07-10',
    })

    const overview = await getOverview()

    const byId = new Map(overview.accounts.map((account) => [account.id, account]))
    expect(byId.get(anchored.id)?.balance).toBe('1200.00')
    expect(byId.get(plain.id)?.balance).toBe('75.50')
    expect(overview.totalBalance).toBe('1275.50')

    // The proof it is ONE calculation and not a second copy: GET /api/accounts
    // must say the exact same numbers for the same rows.
    const accountsResponse = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(accountsResponse.statusCode).toBe(200)
    const published: SerializedAccount[] = accountsResponse.json()
    for (const account of overview.accounts) {
      expect(published.find((entry) => entry.id === account.id)?.balance).toBe(account.balance)
    }
  })

  it('returns income, expense and net (income − expense) of the month asked for', async () => {
    const account = await createAccount()
    await seedMovement({
      accountId: account.id,
      type: 'income',
      amount: '1500.00',
      bookingDate: '2026-06-01',
    })
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '400.25',
      bookingDate: '2026-06-30', // last day: both ends of the month are inclusive
      daySequence: 2,
    })
    // A movement of ANOTHER month must not leak into the totals.
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '77.77',
      bookingDate: '2026-07-01',
      daySequence: 3,
    })

    const overview = await getOverview('?month=2026-06')

    expect(overview.period).toEqual({
      month: '2026-06',
      from: '2026-06-01',
      to: '2026-06-30',
      totals: { income: '1500.00', expense: '400.25', net: '1099.75' },
    })
  })

  it('defaults to the current month when no month is sent', async () => {
    const account = await createAccount()
    const today = new Date().toISOString().slice(0, 10)
    await seedMovement({
      accountId: account.id,
      type: 'income',
      amount: '300.00',
      bookingDate: today,
    })

    const overview = await getOverview()

    expect(overview.period.month).toBe(currentMonth())
    expect(overview.period.totals.income).toBe('300.00')
  })

  it('answers a month with no movements with zeros and 200, never an error', async () => {
    await createAccount({ initialBalance: '10.00' })

    const overview = await getOverview('?month=2024-02')

    expect(overview.period).toEqual({
      month: '2024-02',
      from: '2024-02-01',
      to: '2024-02-29',
      totals: { income: '0.00', expense: '0.00', net: '0.00' },
    })
    // The balances do not depend on the month: the money is still there.
    expect(overview.totalBalance).toBe('10.00')
  })

  it('leaves transfer legs, product contributions and neutrals out of the period totals', async () => {
    const account = await createAccount()
    const other = await createAccount()
    const product = await createProduct()

    // The only movement that counts.
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '60.00',
      bookingDate: '2026-06-10',
    })
    // Both legs of a transfer between own accounts: excluded (feature 36 / 40).
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '500.00',
      bookingDate: '2026-06-12',
      transferId: 'overview-test-transfer',
    })
    await seedMovement({
      accountId: other.id,
      type: 'income',
      amount: '500.00',
      bookingDate: '2026-06-12',
      transferId: 'overview-test-transfer',
    })
    // A contribution to an investment product: excluded too.
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '250.00',
      bookingDate: '2026-06-15',
      daySequence: 2,
      productId: product.id,
    })
    // A neutral (zero) movement moves nothing.
    await seedMovement({
      accountId: account.id,
      type: 'neutral',
      amount: '0.00',
      bookingDate: '2026-06-20',
      daySequence: 3,
    })

    const overview = await getOverview('?month=2026-06')

    expect(overview.period.totals).toEqual({ income: '0.00', expense: '60.00', net: '-60.00' })
  })

  it('rejects a malformed month with 400 VALIDATION_ERROR instead of guessing one', async () => {
    for (const month of ['2026-13', 'june', '2026-06-01']) {
      const response = await app.inject({ method: 'GET', url: `/api/overview?month=${month}` })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
  })

  it('ignores an unknown querystring parameter, same as GET /api/movements', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/overview?foo=bar' })

    expect(response.statusCode).toBe(200)
  })

  it('exposes no write surface: only GET exists under /api/overview', async () => {
    expect(app.hasRoute({ method: 'GET', url: '/api/overview' })).toBe(true)
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'] as const) {
      expect(app.hasRoute({ method, url: '/api/overview' })).toBe(false)
    }
  })
})
