// A deposit movement counts in the totals of GET /api/movements only by its
// interest (feature 57). Every figure, concept and deposit number in this file
// is invented (see docs/conventions.md §Tests): fixtures only need to be well
// formed, never true. The texts are those MyInvestor writes, because the app
// is built with the real registry of `src/app.ts`.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ListedMovement, MovementListResponse } from './movements.types.js'

const OPENING = 'APERTURA DEP.: 880417'
const CANCELLATION = 'CANCELACION DEP:880417'
const MATURITY = 'INTERESES DEP.: 880417'

describe('deposit movements in GET /api/movements (feature 57)', () => {
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
    if (createdProductIds.length > 0) {
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function toDate(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`)
  }

  async function createAccount(bank = 'myinvestor') {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Deposit totals test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createDepositProduct(maturityDate: string, principal: string) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'myinvestor',
        name: `Synthetic deposit ${suffix}`,
        type: 'deposit',
        principal,
        interestRate: '2.3500',
        maturityDate: toDate(maturityDate),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  interface SeedMovement {
    type: 'expense' | 'income'
    amount: string
    date: string
    description: string
    daySequence?: number
    excludedFromTotals?: boolean
  }

  function seed(accountId: number, movement: SeedMovement) {
    const bookingDate = toDate(movement.date)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: movement.type,
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: movement.daySequence ?? 1,
        excludedFromTotals: movement.excludedFromTotals ?? false,
      },
    })
  }

  async function list(query: string): Promise<MovementListResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/movements?${query}` })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  function rowOf(response: MovementListResponse, id: number): ListedMovement {
    const row = response.movements.find((movement) => movement.id === id)
    expect(row).toBeDefined()
    return row as ListedMovement
  }

  it('counts a deposit opening and cancellation as zero in the totals', async () => {
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '2840.16',
      date: '2026-03-05',
      description: OPENING,
    })
    await seed(account.id, {
      type: 'income',
      amount: '2840.16',
      date: '2026-03-20',
      description: CANCELLATION,
    })
    await seed(account.id, {
      type: 'expense',
      amount: '52.37',
      date: '2026-03-21',
      description: 'SYNTHETIC CARD PAYMENT',
    })

    const response = await list(`accountId=${account.id}`)

    expect(response.totals).toEqual({ income: '0.00', expense: '52.37', net: '-52.37' })
  })

  it('counts a deposit maturity only by its interest over the principal of its product file', async () => {
    const account = await createAccount()
    await createDepositProduct('2026-06-02', '3815.40')
    const due = await seed(account.id, {
      type: 'income',
      amount: '3836.92',
      date: '2026-06-02',
      description: MATURITY,
    })

    const response = await list(`accountId=${account.id}`)

    expect(response.totals).toEqual({ income: '21.52', expense: '0.00', net: '21.52' })
    expect(rowOf(response, due.id).deposit).toEqual({
      kind: 'maturity',
      principal: '3815.40',
      countedAmount: '21.52',
      ambiguous: false,
      reason: null,
      candidateMovementIds: [],
    })
  })

  it('takes the principal of a maturity without product file from the earlier opening not yet returned', async () => {
    const account = await createAccount()
    const open = await seed(account.id, {
      type: 'expense',
      amount: '2593.71',
      date: '2026-01-10',
      description: OPENING,
    })
    const due = await seed(account.id, {
      type: 'income',
      amount: '2608.05',
      date: '2026-04-10',
      description: MATURITY,
    })
    // Same amount again, with no opening left: the first one was returned (R6).
    const second = await seed(account.id, {
      type: 'income',
      amount: '2608.05',
      date: '2026-07-10',
      description: MATURITY,
    })

    const response = await list(`accountId=${account.id}`)

    expect(rowOf(response, open.id).deposit).toMatchObject({
      kind: 'opening',
      countedAmount: '0.00',
    })
    expect(rowOf(response, due.id).deposit).toMatchObject({
      kind: 'maturity',
      principal: '2593.71',
      countedAmount: '14.34',
      ambiguous: false,
    })
    expect(rowOf(response, second.id).deposit).toMatchObject({
      ambiguous: true,
      reason: 'principal_not_found',
      countedAmount: '0.00',
    })
    expect(response.totals).toEqual({ income: '14.34', expense: '0.00', net: '14.34' })
  })

  it('counts a deposit maturity marked excludedFromTotals by its interest', async () => {
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '2593.71',
      date: '2026-01-10',
      description: OPENING,
      excludedFromTotals: true,
    })
    await seed(account.id, {
      type: 'income',
      amount: '2608.05',
      date: '2026-04-10',
      description: MATURITY,
      excludedFromTotals: true,
    })

    const response = await list(`accountId=${account.id}`)

    expect(response.totals).toEqual({ income: '14.34', expense: '0.00', net: '14.34' })
  })

  it('keeps the bank amount and type of every deposit movement in the listing', async () => {
    const account = await createAccount()
    const seeded = [
      await seed(account.id, {
        type: 'expense',
        amount: '2593.71',
        date: '2026-01-10',
        description: OPENING,
      }),
      await seed(account.id, {
        type: 'income',
        amount: '2608.05',
        date: '2026-04-10',
        description: MATURITY,
      }),
      await seed(account.id, {
        type: 'expense',
        amount: '1947.26',
        date: '2026-04-11',
        description: OPENING,
      }),
      await seed(account.id, {
        type: 'income',
        amount: '1947.26',
        date: '2026-05-02',
        description: CANCELLATION,
      }),
    ]

    const response = await list(`accountId=${account.id}`)

    for (const movement of seeded) {
      const row = rowOf(response, movement.id)
      expect(row.amount).toBe(movement.amount.toFixed(2))
      expect(row.type).toBe(movement.type)
      expect(row.deposit).not.toBeNull()
    }
    // And nothing was written: the database still holds the bank's figures.
    const stored = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })
    expect(stored.map((row) => [row.amount.toFixed(2), row.type])).toEqual(
      seeded.map((row) => [row.amount.toFixed(2), row.type]),
    )
  })

  it('marks a maturity whose principal is not certain as ambiguous counting zero with reason and candidates', async () => {
    const account = await createAccount()
    const first = await seed(account.id, {
      type: 'expense',
      amount: '2508.33',
      date: '2026-01-08',
      description: OPENING,
    })
    const second = await seed(account.id, {
      type: 'expense',
      amount: '2519.70',
      date: '2026-02-03',
      description: OPENING,
    })
    const due = await seed(account.id, {
      type: 'income',
      amount: '2533.12',
      date: '2026-06-03',
      description: MATURITY,
    })

    const response = await list(`accountId=${account.id}`)

    expect(rowOf(response, due.id).deposit).toEqual({
      kind: 'maturity',
      principal: null,
      countedAmount: '0.00',
      ambiguous: true,
      reason: 'several_principals',
      candidateMovementIds: [first.id, second.id].sort((a, b) => a - b),
    })
    expect(response.totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
  })

  it('returns deposit null on a movement that is not a deposit one', async () => {
    const myinvestor = await createAccount()
    const plain = await seed(myinvestor.id, {
      type: 'expense',
      amount: '52.37',
      date: '2026-03-21',
      description: 'SYNTHETIC CARD PAYMENT',
    })
    // A deposit text with the wrong type is not a deposit movement (R1)…
    const wrongType = await seed(myinvestor.id, {
      type: 'income',
      amount: '1311.08',
      date: '2026-03-22',
      description: OPENING,
    })
    // …nor is one of a bank without matcher.
    const otherBank = await createAccount('bankinter')
    const elsewhere = await seed(otherBank.id, {
      type: 'income',
      amount: '1622.54',
      date: '2026-03-23',
      description: MATURITY,
    })

    const response = await list('from=2026-03-21&to=2026-03-23')

    expect(rowOf(response, plain.id).deposit).toBeNull()
    expect(rowOf(response, wrongType.id).deposit).toBeNull()
    expect(rowOf(response, elsewhere.id).deposit).toBeNull()
    expect(response.totals).toEqual({ income: '2933.62', expense: '52.37', net: '2881.25' })
  })

  it('counts a deposit maturity added after the first read without any other action', async () => {
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '2593.71',
      date: '2026-01-10',
      description: OPENING,
    })

    const before = await list(`accountId=${account.id}`)
    expect(before.totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })

    // A later import brings the maturity: nothing else is done.
    await seed(account.id, {
      type: 'income',
      amount: '2608.05',
      date: '2026-04-10',
      description: MATURITY,
    })

    const after = await list(`accountId=${account.id}`)
    expect(after.totals).toEqual({ income: '14.34', expense: '0.00', net: '14.34' })
  })

  it('computes the deposit rule over the whole history and not only over the filtered month', async () => {
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '3462.19',
      date: '2026-09-17',
      description: OPENING,
    })
    const due = await seed(account.id, {
      type: 'income',
      amount: '3481.77',
      date: '2026-10-17',
      description: MATURITY,
    })

    const october = await list(`accountId=${account.id}&from=2026-10-01&to=2026-10-31`)

    expect(october.movements.map((row) => row.id)).toEqual([due.id])
    expect(rowOf(october, due.id).deposit).toMatchObject({
      principal: '3462.19',
      countedAmount: '19.58',
    })
    expect(october.totals).toEqual({ income: '19.58', expense: '0.00', net: '19.58' })
  })
})
