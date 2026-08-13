import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import * as prismaEnums from '../../generated/prisma/enums.js'
import {
  CategoryKind,
  MovementOrigin,
  MovementStatus,
  MovementType,
  PaymentMethod,
} from '../../generated/prisma/client.js'
import {
  computeAccountBalance,
  computeTotals,
  deriveMovementTypeFromAmount,
} from './movements.service.js'
import type { BalanceMovement, SerializedMovement, TotalsMovement } from './movements.types.js'

function balanceMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    type: 'expense',
    amount: '10.00',
    balanceAfter: null,
    bookingDate: new Date('2026-07-01T00:00:00.000Z'),
    daySequence: 1,
    ...overrides,
  }
}

describe('deriveMovementTypeFromAmount', () => {
  it('maps a negative amount to expense', () => {
    expect(deriveMovementTypeFromAmount(-5)).toBe('expense')
  })

  it('maps a positive amount to income', () => {
    expect(deriveMovementTypeFromAmount(5)).toBe('income')
  })

  it('maps a zero amount to neutral', () => {
    expect(deriveMovementTypeFromAmount(0)).toBe('neutral')
  })
})

describe('computeAccountBalance', () => {
  it('returns the balanceAfter of the most recent movement, without summing anything', () => {
    const movements = [
      balanceMovement({
        type: 'income',
        amount: '1500.00',
        balanceAfter: '10000.00',
        bookingDate: new Date('2026-07-31T00:00:00.000Z'),
        daySequence: 1,
      }),
      balanceMovement({
        type: 'expense',
        amount: '45.37',
        balanceAfter: '9954.63',
        bookingDate: new Date('2026-07-31T00:00:00.000Z'),
        daySequence: 2,
      }),
      balanceMovement({
        type: 'expense',
        amount: '1000.00',
        balanceAfter: '22800.11',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        daySequence: 3,
      }),
    ]

    // initialBalance is deliberately absurd and the sum does not add up:
    // neither must influence the result (R9).
    const balance = computeAccountBalance('999999.99', movements)

    expect(balance.toFixed(2)).toBe('9954.63')
  })

  it('breaks a same-day tie with the highest daySequence, not the array order', () => {
    const movements = [
      balanceMovement({
        balanceAfter: '100.00',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        daySequence: 3,
      }),
      balanceMovement({
        balanceAfter: '300.00',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        daySequence: 1,
      }),
      balanceMovement({
        balanceAfter: '200.00',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        daySequence: 2,
      }),
    ]

    expect(computeAccountBalance('0', movements).toFixed(2)).toBe('100.00')
  })

  it('ignores movements without balanceAfter when the statement provides one', () => {
    const statement = balanceMovement({
      type: 'expense',
      amount: '50.00',
      balanceAfter: '1000.00',
      bookingDate: new Date('2026-07-10T00:00:00.000Z'),
      daySequence: 1,
    })
    const withoutBalance = balanceMovement({
      type: 'expense',
      amount: '20.00',
      balanceAfter: null,
      bookingDate: new Date('2026-07-20T00:00:00.000Z'),
      daySequence: null,
    })

    expect(computeAccountBalance('0', [statement]).toFixed(2)).toBe('1000.00')
    expect(computeAccountBalance('0', [statement, withoutBalance]).toFixed(2)).toBe('1000.00')
  })

  it('falls back to initialBalance + income - expense when no movement carries a balance', () => {
    const movements = [
      balanceMovement({ type: 'income', amount: '150.25', balanceAfter: null }),
      balanceMovement({ type: 'expense', amount: '40.25', balanceAfter: null }),
      balanceMovement({ type: 'neutral', amount: '0.00', balanceAfter: null }),
    ]

    expect(computeAccountBalance('100.00', movements).toFixed(2)).toBe('210.00')
  })

  it('returns initialBalance for an account with no movements at all', () => {
    expect(computeAccountBalance('75.50', []).toFixed(2)).toBe('75.50')
  })

  it('reads the balance of both transfer legs from the statement, with no special branch', () => {
    const sourceLeg = balanceMovement({
      type: 'expense',
      amount: '500.00',
      balanceAfter: '1500.00',
      bookingDate: new Date('2026-07-15T00:00:00.000Z'),
      daySequence: 1,
    })
    const targetLeg = balanceMovement({
      type: 'income',
      amount: '500.00',
      balanceAfter: '2500.00',
      bookingDate: new Date('2026-07-15T00:00:00.000Z'),
      daySequence: 1,
    })

    expect(computeAccountBalance('0', [sourceLeg]).toFixed(2)).toBe('1500.00')
    expect(computeAccountBalance('0', [targetLeg]).toFixed(2)).toBe('2500.00')
  })
})

describe('computeTotals', () => {
  const dataset: TotalsMovement[] = [
    { type: 'expense', amount: '45.90', transferId: null },
    { type: 'income', amount: '1200.00', transferId: null },
    { type: 'expense', amount: '500.00', transferId: 'transfer-1' },
    { type: 'income', amount: '500.00', transferId: 'transfer-1' },
    { type: 'neutral', amount: '0.00', transferId: null },
  ]

  it('excludes transfer legs and neutral movements from the global totals', () => {
    const totals = computeTotals(dataset)

    expect(totals.expense.toFixed(2)).toBe('45.90')
    expect(totals.income.toFixed(2)).toBe('1200.00')
  })

  it('returns zero totals for an empty dataset', () => {
    const totals = computeTotals([])

    expect(totals.expense.toFixed(2)).toBe('0.00')
    expect(totals.income.toFixed(2)).toBe('0.00')
  })
})

describe('movement routes (read-only) and database indexes', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []
  let ibanCounter = 0

  function uniqueIban(): string {
    ibanCounter += 1
    return `ES${Date.now()}${ibanCounter}${Math.floor(Math.random() * 1_000_000)}`
  }

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
    if (createdCategoryIds.length > 0) {
      await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
      createdCategoryIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount(initialBalance = 0) {
    const account = await app.prisma.account.create({
      data: { iban: uniqueIban(), bank: 'bankinter', alias: 'Test account', initialBalance },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(name: string) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const category = await app.prisma.category.create({
      data: { name: `${name}-${suffix}`, kind: 'expense' },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  interface SeedMovement {
    accountId: number
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    description?: string
    bookingDate?: string
    daySequence?: number | null
    balanceAfter?: string | null
    origin?: 'imported' | 'manual'
    transferId?: string | null
    categoryId?: number | null
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date(`${movement.bookingDate ?? '2026-07-24'}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount ?? '850.00',
        description: movement.description ?? 'TRANS INM/ OTRO BANCO',
        bookingDate,
        valueDate: bookingDate,
        daySequence: movement.daySequence === undefined ? 1 : movement.daySequence,
        balanceAfter: movement.balanceAfter ?? null,
        origin: movement.origin ?? 'imported',
        transferId: movement.transferId ?? null,
        categoryId: movement.categoryId ?? null,
      },
    })
  }

  it('GET /api/movements lists newest first with account and category embedded (R13)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')

    const older = await seedMovement({
      accountId: account.id,
      description: 'RECIBO /Recibo GIMNASIO',
      amount: '34.15',
      bookingDate: '2026-07-10',
      daySequence: 1,
      categoryId: category.id,
    })
    const newer = await seedMovement({
      accountId: account.id,
      description: 'PAGO TARJETA',
      amount: '15.00',
      bookingDate: '2026-07-31',
      daySequence: 1,
    })

    const response = await app.inject({ method: 'GET', url: '/api/movements' })

    expect(response.statusCode).toBe(200)
    const own = response
      .json<SerializedMovement[]>()
      .filter((movement) => movement.accountId === account.id)

    expect(own.map((movement) => movement.id)).toEqual([newer.id, older.id])
    expect(own[0]?.bookingDate).toBe('2026-07-31')
    expect(own[0]?.amount).toBe('15.00')
    expect(own[0]?.account.iban).toBe(account.iban)
    expect(own[0]?.category).toBeNull()
    expect(own[1]?.category).toMatchObject({ id: category.id, kind: 'expense' })
    // Columns the importer will fill later: present in the contract, empty today.
    expect(own[0]?.transferId).toBeNull()
    expect(own[0]?.daySequence).toBe(1)
    expect(own[0]?.origin).toBe('imported')
    expect(own[0]?.status).toBe('pending_review')
  })

  it('GET /api/movements orders the same day by daySequence descending (R13, R3b)', async () => {
    const account = await createAccount()

    const first = await seedMovement({
      accountId: account.id,
      bookingDate: '2026-07-24',
      daySequence: 1,
      description: 'First of the day',
    })
    const second = await seedMovement({
      accountId: account.id,
      bookingDate: '2026-07-24',
      daySequence: 2,
      description: 'Second of the day',
    })

    const response = await app.inject({ method: 'GET', url: '/api/movements' })
    const own = response
      .json<SerializedMovement[]>()
      .filter((movement) => movement.accountId === account.id)

    expect(own.map((movement) => movement.id)).toEqual([second.id, first.id])
  })

  it('keeps both legs of a transfer linked by transferId, with their type intact (R18)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const transferId = `transfer-${Date.now()}`

    await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '500.00',
      description: 'TRANS INM/ own account',
      bookingDate: '2026-07-15',
      daySequence: 1,
      balanceAfter: '1500.00',
      transferId,
    })
    await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '500.00',
      description: 'TRANS INM/ own account',
      bookingDate: '2026-07-15',
      daySequence: 1,
      balanceAfter: '2500.00',
      transferId,
    })

    const legs = await app.prisma.movement.findMany({
      where: { transferId },
      orderBy: { accountId: 'asc' },
    })

    expect(legs).toHaveLength(2)
    expect(legs.map((leg) => leg.type)).toEqual(['expense', 'income'])
    expect(legs.map((leg) => leg.accountId)).toEqual([source.id, target.id])
    expect(legs.every((leg) => leg.transferId === transferId)).toBe(true)
  })

  it('GET /api/accounts reports each transfer leg balance from the statement (R19)', async () => {
    const source = await createAccount(9999)
    const target = await createAccount(9999)
    const transferId = `transfer-${Date.now()}`

    await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '500.00',
      bookingDate: '2026-07-15',
      daySequence: 1,
      balanceAfter: '1500.00',
      transferId,
    })
    await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '500.00',
      bookingDate: '2026-07-15',
      daySequence: 1,
      balanceAfter: '2500.00',
      transferId,
    })

    const response = await app.inject({ method: 'GET', url: '/api/accounts' })
    const accounts = response.json<Array<{ id: number; balance: string }>>()

    expect(accounts.find((account) => account.id === source.id)?.balance).toBe('1500.00')
    expect(accounts.find((account) => account.id === target.id)?.balance).toBe('2500.00')
  })

  it('rejects a second imported movement with the same dedup key (R6)', async () => {
    const account = await createAccount()
    const movement = {
      accountId: account.id,
      bookingDate: '2026-07-24',
      daySequence: 1,
      amount: '850.00',
      description: 'TRANS INM/ OTRO BANCO',
    }

    await seedMovement(movement)

    await expect(seedMovement(movement)).rejects.toMatchObject({ code: 'P2002' })
    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(1)
  })

  it('stores three identical statement lines that differ only in daySequence (R6, R3b)', async () => {
    const account = await createAccount()
    const line = {
      accountId: account.id,
      bookingDate: '2026-07-24',
      amount: '850.00',
      description: 'TRANS INM/ OTRO BANCO',
    }

    await seedMovement({ ...line, daySequence: 1 })
    await seedMovement({ ...line, daySequence: 2 })
    await seedMovement({ ...line, daySequence: 3 })

    const stored = await app.prisma.movement.findMany({ where: { accountId: account.id } })
    expect(stored).toHaveLength(3)
    expect(stored.map((movement) => movement.daySequence).sort()).toEqual([1, 2, 3])
  })

  it('persists a Movement with every field and no direction column (R3)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')

    const created = await app.prisma.movement.create({
      data: {
        type: 'expense',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        valueDate: new Date('2026-07-25T00:00:00.000Z'),
        amount: '34.15',
        description: 'RECIBO /Recibo GIMNASIO',
        balanceAfter: '22800.11',
        currency: 'USD',
        note: 'checked against the receipt',
        accountId: account.id,
        categoryId: category.id,
        paymentMethod: 'direct_debit',
        origin: 'manual',
        status: 'confirmed',
        transferId: 'transfer-full-shape',
        daySequence: 4,
      },
    })

    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: created.id } })

    expect(stored.type).toBe('expense')
    expect(stored.bookingDate.toISOString().slice(0, 10)).toBe('2026-07-24')
    expect(stored.valueDate.toISOString().slice(0, 10)).toBe('2026-07-25')
    expect(stored.amount.toFixed(2)).toBe('34.15')
    expect(stored.description).toBe('RECIBO /Recibo GIMNASIO')
    expect(stored.balanceAfter?.toFixed(2)).toBe('22800.11')
    expect(stored.currency).toBe('USD')
    expect(stored.note).toBe('checked against the receipt')
    expect(stored.accountId).toBe(account.id)
    expect(stored.categoryId).toBe(category.id)
    expect(stored.paymentMethod).toBe('direct_debit')
    expect(stored.origin).toBe('manual')
    expect(stored.status).toBe('confirmed')
    expect(stored.transferId).toBe('transfer-full-shape')
    expect(stored.daySequence).toBe(4)
    expect(stored.createdAt).toBeInstanceOf(Date)
    expect(stored.updatedAt).toBeInstanceOf(Date)
    // The `type` already says whether it adds or subtracts: no `direction`.
    expect(Object.keys(stored)).not.toContain('direction')
  })

  it('applies the imported / pending_review / EUR defaults (R3)', async () => {
    const account = await createAccount()

    const created = await app.prisma.movement.create({
      data: {
        type: 'income',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        valueDate: new Date('2026-07-24T00:00:00.000Z'),
        amount: '10.00',
        description: 'Bare minimum movement',
        accountId: account.id,
      },
    })

    expect(created.origin).toBe('imported')
    expect(created.status).toBe('pending_review')
    expect(created.currency).toBe('EUR')
    expect(created.balanceAfter).toBeNull()
    expect(created.categoryId).toBeNull()
    expect(created.paymentMethod).toBeNull()
    expect(created.transferId).toBeNull()
    expect(created.daySequence).toBeNull()
    expect(created.note).toBeNull()
  })

  it('accepts every value of the movement enums (R4)', async () => {
    const account = await createAccount()
    const paymentMethods = Object.values(PaymentMethod)
    const types = Object.values(MovementType)
    const origins = Object.values(MovementOrigin)
    const statuses = Object.values(MovementStatus)

    let daySequence = 0
    for (const paymentMethod of paymentMethods) {
      for (const type of types) {
        daySequence += 1
        const created = await app.prisma.movement.create({
          data: {
            type,
            bookingDate: new Date('2026-06-01T00:00:00.000Z'),
            valueDate: new Date('2026-06-01T00:00:00.000Z'),
            amount: '1.00',
            description: `enum matrix ${paymentMethod}`,
            accountId: account.id,
            paymentMethod,
            origin: origins[daySequence % origins.length],
            status: statuses[daySequence % statuses.length],
            daySequence,
          },
        })
        expect(created.paymentMethod).toBe(paymentMethod)
        expect(created.type).toBe(type)
      }
    }

    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(
      paymentMethods.length * types.length,
    )
  })

  it('does not impose uniqueness on manual movements: the index is partial (R6)', async () => {
    const account = await createAccount()
    const movement: SeedMovement = {
      accountId: account.id,
      bookingDate: '2026-07-24',
      daySequence: 1,
      amount: '3.50',
      description: 'Coffee',
      origin: 'manual',
    }

    await seedMovement(movement)
    await seedMovement(movement)

    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(2)
  })
})

describe('flow enums generated from the schema (R4)', () => {
  it('MovementType is expense | income | neutral, with no transfer value', () => {
    expect(Object.keys(MovementType)).toEqual(['expense', 'income', 'neutral'])
    expect(Object.keys(MovementType)).not.toContain('transfer')
  })

  it('does not define a MovementDirection enum', () => {
    // A transfer is two ordinary movements linked by transferId: the `type` the
    // bank reported already says whether it subtracts or adds.
    expect(Object.keys(prismaEnums)).not.toContain('MovementDirection')
  })

  it('CategoryKind, PaymentMethod, MovementOrigin and MovementStatus hold their values', () => {
    expect(Object.keys(CategoryKind)).toEqual(['expense', 'income'])
    expect(Object.keys(PaymentMethod)).toEqual(['card', 'cash', 'bank_transfer', 'direct_debit'])
    expect(Object.keys(MovementOrigin)).toEqual(['imported', 'manual'])
    expect(Object.keys(MovementStatus)).toEqual(['confirmed', 'pending_review'])
  })
})
