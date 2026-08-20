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
import { persistSavingsSnapshot } from './investments.service.js'
import type { SavingsSnapshotInput } from './investments.types.js'

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
    expect(second.snapshot.created).toBe(false)
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
