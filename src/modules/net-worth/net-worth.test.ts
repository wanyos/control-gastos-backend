// Integration tests of GET /api/net-worth (feature 42).
//
// 🔒 Every value here is invented (ADR-017): synthetic IBANs, generated product
// names and amounts built by hand.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { SerializedAccount } from '../accounts/accounts.types.js'
import type { NetWorthResponse } from './net-worth.types.js'

describe('GET /api/net-worth', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdProductIds: number[] = []
  let counter = 0

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

  function uniqueName(): string {
    counter += 1
    return `Producto NetWorth ${Date.now()}-${counter}-${Math.floor(Math.random() * 1_000_000)}`
  }

  async function createAccount(initialBalance: string) {
    const account = await app.prisma.account.create({
      data: {
        iban: syntheticIban(),
        bank: 'bankinter',
        alias: 'Net worth test account',
        initialBalance,
      },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createDeposit(principal: string) {
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'zz-net-worth-endpoint-bank',
        name: uniqueName(),
        type: 'deposit',
        principal,
        // Far in the future: this deposit is alive and not matured.
        maturityDate: new Date('2030-01-01T00:00:00.000Z'),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  async function getNetWorth(query = ''): Promise<NetWorthResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/net-worth${query}` })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  it('answers 200 with asOf (today, UTC), total and the two blocks (R1)', async () => {
    const body = await getNetWorth()

    expect(body.asOf).toBe(new Date().toISOString().slice(0, 10))
    expect(typeof body.total).toBe('string')
    expect(body.total).toMatch(/^-?\d+\.\d{2}$/)
    expect(body.accounts).toMatchObject({ total: expect.any(String) })
    expect(Array.isArray(body.accounts.accounts)).toBe(true)
    expect(body.investments).toMatchObject({ total: expect.any(String) })
    expect(Array.isArray(body.investments.products)).toBe(true)
    expect(Array.isArray(body.investments.issues)).toBe(true)
  })

  it('shows each account with the SAME balance as GET /api/accounts, and their sum (R2)', async () => {
    const first = await createAccount('100.10')
    const second = await createAccount('200.20')
    await app.prisma.movement.create({
      data: {
        accountId: first.id,
        type: 'income',
        amount: '50.00',
        description: 'NET WORTH TEST MOVEMENT',
        bookingDate: new Date('2026-08-10T00:00:00.000Z'),
        valueDate: new Date('2026-08-10T00:00:00.000Z'),
        daySequence: 1,
      },
    })

    const body = await getNetWorth()

    // The proof it is ONE formula and not a second copy: GET /api/accounts in
    // the same pass must say the exact same numbers for the same rows.
    const accountsResponse = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(accountsResponse.statusCode).toBe(200)
    const published: SerializedAccount[] = accountsResponse.json()

    const byId = new Map(body.accounts.accounts.map((account) => [account.id, account]))
    expect(byId.get(first.id)?.balance).toBe('150.10')
    expect(byId.get(second.id)?.balance).toBe('200.20')
    for (const account of body.accounts.accounts) {
      expect(published.find((entry) => entry.id === account.id)?.balance).toBe(account.balance)
    }
    expect(body.accounts.total).toBe('350.30')
  })

  it('publishes total = accounts.total + investments.total, two decimals (R10)', async () => {
    await createAccount('1000.15')
    await createDeposit('500.25')

    const body = await getNetWorth()

    expect(body.accounts.total).toBe('1000.15')
    expect(body.investments.total).toBe('500.25')
    expect(body.total).toBe('1500.40')
  })

  it('ignores an unknown querystring parameter: the endpoint has none (R11)', async () => {
    await createAccount('10.00')

    const withParams = await getNetWorth('?date=2026-01-01&foo=bar')
    const without = await getNetWorth()

    // Same answer: the schema discards what it does not know, including a
    // would-be date — the endpoint answers only for today.
    expect(withParams).toEqual(without)
  })

  it('exposes no write surface: only GET exists under /api/net-worth (R12)', async () => {
    expect(app.hasRoute({ method: 'GET', url: '/api/net-worth' })).toBe(true)
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'] as const) {
      expect(app.hasRoute({ method, url: '/api/net-worth' })).toBe(false)
    }
  })
})
