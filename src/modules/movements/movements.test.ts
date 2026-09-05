import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { syntheticIban } from '../../lib/iban.fixture.js'
import { buildApp } from '../../app.js'
import * as prismaEnums from '../../generated/prisma/enums.js'
import {
  CategoryKind,
  MovementOrigin,
  MovementStatus,
  MovementType,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client.js'
import { detectTransfers } from '../transfers/transfers.service.js'
import {
  computeAccountBalance,
  computeTotals,
  deriveMovementTypeFromAmount,
  serializeTotals,
  isAfter,
  netOf,
  readAnchor,
  resolveAnchorPoint,
} from './movements.service.js'
import type {
  BalanceAnchor,
  BalanceMovement,
  MovementListResponse,
  SerializedMovement,
  TotalsMovement,
} from './movements.types.js'

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

  // Feature 31 split this case in two. Until then it claimed that a movement
  // without a per-line balance NEVER moved the result; that is only true of a
  // movement OLDER than the anchor point. A newer one does move it: the
  // statement is what the account is anchored to, not the last word (R9, R10).
  it('ignores a movement without balanceAfter that is older than the statement one', () => {
    const statement = balanceMovement({
      type: 'expense',
      amount: '50.00',
      balanceAfter: '1000.00',
      bookingDate: new Date('2026-07-20T00:00:00.000Z'),
      daySequence: 1,
    })
    const olderWithoutBalance = balanceMovement({
      type: 'expense',
      amount: '20.00',
      balanceAfter: null,
      bookingDate: new Date('2026-07-10T00:00:00.000Z'),
      daySequence: null,
    })

    expect(computeAccountBalance('0', [statement]).toFixed(2)).toBe('1000.00')
    expect(computeAccountBalance('0', [statement, olderWithoutBalance]).toFixed(2)).toBe('1000.00')
  })

  it('adds a movement without balanceAfter that is newer than the statement one', () => {
    const statement = balanceMovement({
      type: 'expense',
      amount: '50.00',
      balanceAfter: '1000.00',
      bookingDate: new Date('2026-07-10T00:00:00.000Z'),
      daySequence: 1,
    })
    const newerExpense = balanceMovement({
      type: 'expense',
      amount: '20.00',
      balanceAfter: null,
      bookingDate: new Date('2026-07-20T00:00:00.000Z'),
      daySequence: null,
    })
    const newerIncome = balanceMovement({
      type: 'income',
      amount: '5.50',
      balanceAfter: null,
      bookingDate: new Date('2026-07-21T00:00:00.000Z'),
      daySequence: 1,
    })

    expect(computeAccountBalance('0', [statement, newerExpense]).toFixed(2)).toBe('980.00')
    expect(computeAccountBalance('0', [statement, newerExpense, newerIncome]).toFixed(2)).toBe(
      '985.50',
    )
  })

  it('adds a same-day movement only when its daySequence is higher', () => {
    const statement = balanceMovement({
      type: 'expense',
      amount: '50.00',
      balanceAfter: '1000.00',
      bookingDate: new Date('2026-07-20T00:00:00.000Z'),
      daySequence: 2,
    })
    const sameDayBefore = balanceMovement({
      type: 'expense',
      amount: '30.00',
      balanceAfter: null,
      bookingDate: new Date('2026-07-20T00:00:00.000Z'),
      daySequence: 1,
    })
    const sameDayAfter = balanceMovement({
      type: 'expense',
      amount: '30.00',
      balanceAfter: null,
      bookingDate: new Date('2026-07-20T00:00:00.000Z'),
      daySequence: 3,
    })

    expect(computeAccountBalance('0', [statement, sameDayBefore]).toFixed(2)).toBe('1000.00')
    expect(computeAccountBalance('0', [statement, sameDayAfter]).toFixed(2)).toBe('970.00')
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

describe('isAfter', () => {
  const point = { bookingDate: new Date('2026-07-20T00:00:00.000Z'), daySequence: 2 }

  it('orders by bookingDate first', () => {
    expect(
      isAfter({ bookingDate: new Date('2026-07-21T00:00:00.000Z'), daySequence: 1 }, point),
    ).toBe(true)
    expect(
      isAfter({ bookingDate: new Date('2026-07-19T00:00:00.000Z'), daySequence: 9 }, point),
    ).toBe(false)
  })

  it('breaks a same-day tie with daySequence and is never true for an equal point', () => {
    expect(isAfter({ ...point, daySequence: 3 }, point)).toBe(true)
    expect(isAfter({ ...point, daySequence: 1 }, point)).toBe(false)
    expect(isAfter(point, point)).toBe(false)
  })

  it('reads a missing daySequence as zero', () => {
    expect(isAfter({ ...point, daySequence: null }, { ...point, daySequence: 1 })).toBe(false)
    expect(isAfter({ ...point, daySequence: 1 }, { ...point, daySequence: null })).toBe(true)
  })
})

describe('readAnchor', () => {
  it('reads the three columns of an anchored account', () => {
    const anchor = readAnchor({
      balanceAnchor: '2410.75',
      balanceAnchorDate: new Date('2026-07-31T00:00:00.000Z'),
      balanceAnchorDaySequence: 4,
    })

    expect(anchor?.amount).toBe('2410.75')
    expect(anchor?.bookingDate.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(anchor?.daySequence).toBe(4)
  })

  it('returns null for an account that was never anchored', () => {
    expect(
      readAnchor({ balanceAnchor: null, balanceAnchorDate: null, balanceAnchorDaySequence: null }),
    ).toBeNull()
  })

  it('keeps an anchor whose amount is zero: zero is a real balance (R4)', () => {
    const anchor = readAnchor({
      balanceAnchor: '0.00',
      balanceAnchorDate: new Date('2026-07-31T00:00:00.000Z'),
      balanceAnchorDaySequence: null,
    })

    expect(anchor).not.toBeNull()
    expect(anchor?.daySequence).toBeNull()
  })
})

describe('resolveAnchorPoint', () => {
  const storedAnchor: BalanceAnchor = {
    amount: '500.00',
    bookingDate: new Date('2026-07-10T00:00:00.000Z'),
    daySequence: 1,
  }

  it('takes the per-line balance when it is the more recent of the two (R7)', () => {
    const withBalance = balanceMovement({
      balanceAfter: '640.00',
      bookingDate: new Date('2026-07-25T00:00:00.000Z'),
      daySequence: 2,
    })

    expect(resolveAnchorPoint(storedAnchor, [withBalance])?.amount).toBe('640.00')
  })

  it('keeps the stored anchor when no movement carries a per-line balance', () => {
    const point = resolveAnchorPoint(storedAnchor, [balanceMovement({ balanceAfter: null })])

    expect(point?.amount).toBe('500.00')
  })

  it('keeps the stored anchor when it is the more recent of the two', () => {
    const older = balanceMovement({
      balanceAfter: '120.00',
      bookingDate: new Date('2026-07-01T00:00:00.000Z'),
      daySequence: 1,
    })

    expect(resolveAnchorPoint(storedAnchor, [older])?.amount).toBe('500.00')
  })

  it('prefers the stored anchor on an exact tie: the header outranks a line', () => {
    const samepoint = balanceMovement({
      balanceAfter: '120.00',
      bookingDate: storedAnchor.bookingDate,
      daySequence: storedAnchor.daySequence,
    })

    expect(resolveAnchorPoint(storedAnchor, [samepoint])?.amount).toBe('500.00')
  })

  it('returns null when there is neither an anchor nor a per-line balance (R8)', () => {
    expect(resolveAnchorPoint(null, [balanceMovement({ balanceAfter: null })])).toBeNull()
  })
})

describe('computeAccountBalance with an anchor', () => {
  const anchor: BalanceAnchor = {
    amount: '1200.00',
    bookingDate: new Date('2026-07-15T00:00:00.000Z'),
    daySequence: 2,
  }

  it('sums only what came after the anchor, ignoring initialBalance (R6)', () => {
    const movements = [
      balanceMovement({
        type: 'expense',
        amount: '200.00',
        bookingDate: new Date('2026-07-20T00:00:00.000Z'),
        daySequence: 1,
      }),
      balanceMovement({
        type: 'income',
        amount: '75.25',
        bookingDate: new Date('2026-07-22T00:00:00.000Z'),
        daySequence: 1,
      }),
    ]

    expect(computeAccountBalance('999999.99', movements, anchor).toFixed(2)).toBe('1075.25')
  })

  it('does not move the balance with a movement older than the anchor (R9)', () => {
    const older = balanceMovement({
      type: 'expense',
      amount: '300.00',
      bookingDate: new Date('2026-07-01T00:00:00.000Z'),
      daySequence: 1,
    })

    expect(computeAccountBalance('0', [older], anchor).toFixed(2)).toBe('1200.00')
  })

  it('returns the anchor amount for an account with no movements after it', () => {
    expect(computeAccountBalance('0', [], anchor).toFixed(2)).toBe('1200.00')
  })

  it('treats an anchor of zero as a real balance, not as "no anchor" (R4)', () => {
    const zeroAnchor: BalanceAnchor = { ...anchor, amount: '0.00' }
    const newer = balanceMovement({
      type: 'income',
      amount: '40.00',
      bookingDate: new Date('2026-07-18T00:00:00.000Z'),
      daySequence: 1,
    })

    expect(computeAccountBalance('850.00', [], zeroAnchor).toFixed(2)).toBe('0.00')
    expect(computeAccountBalance('850.00', [newer], zeroAnchor).toFixed(2)).toBe('40.00')
  })

  it('lets the statement balance win when it is newer, and still adds what came after it (R7, R10)', () => {
    const fromStatement = balanceMovement({
      type: 'expense',
      amount: '10.00',
      balanceAfter: '2000.00',
      bookingDate: new Date('2026-07-28T00:00:00.000Z'),
      daySequence: 1,
    })
    const afterTheStatement = balanceMovement({
      type: 'expense',
      amount: '30.00',
      balanceAfter: null,
      bookingDate: new Date('2026-08-02T00:00:00.000Z'),
      daySequence: 1,
    })

    expect(computeAccountBalance('0', [fromStatement], anchor).toFixed(2)).toBe('2000.00')
    expect(computeAccountBalance('0', [fromStatement, afterTheStatement], anchor).toFixed(2)).toBe(
      '1970.00',
    )
  })

  it('behaves exactly as before when the anchor is undefined or null (R8)', () => {
    const movements = [
      balanceMovement({ type: 'income', amount: '150.25', balanceAfter: null }),
      balanceMovement({ type: 'expense', amount: '40.25', balanceAfter: null }),
    ]

    expect(computeAccountBalance('100.00', movements).toFixed(2)).toBe('210.00')
    expect(computeAccountBalance('100.00', movements, null).toFixed(2)).toBe('210.00')
  })
})

describe('netOf (exported for the reconciliation checks, feature 32)', () => {
  it('adds an income, subtracts an expense and leaves a neutral alone', () => {
    const movements = [
      balanceMovement({ type: 'income', amount: '200.00' }),
      balanceMovement({ type: 'expense', amount: '50.00' }),
      balanceMovement({ type: 'neutral', amount: '0.00' }),
    ]

    expect(netOf(movements, new Prisma.Decimal('1000.00')).toFixed(2)).toBe('1150.00')
  })

  it('returns the starting amount untouched for an empty set', () => {
    expect(netOf([], new Prisma.Decimal('1000.00')).toFixed(2)).toBe('1000.00')
  })

  it('is the SAME sum the balance formula uses: one rule, one place', () => {
    const movements = [
      balanceMovement({ type: 'income', amount: '200.00' }),
      balanceMovement({ type: 'expense', amount: '50.00' }),
    ]
    const anchor: BalanceAnchor = {
      amount: '1000.00',
      bookingDate: new Date('2026-06-30T00:00:00.000Z'),
      daySequence: 1,
    }

    expect(computeAccountBalance('0.00', movements, anchor).toFixed(2)).toBe(
      netOf(movements, new Prisma.Decimal('1000.00')).toFixed(2),
    )
  })
})

describe('computeTotals', () => {
  const dataset: TotalsMovement[] = [
    { type: 'expense', amount: '45.90', transferId: null, productId: null },
    { type: 'income', amount: '1200.00', transferId: null, productId: null },
    { type: 'expense', amount: '500.00', transferId: 'transfer-1', productId: null },
    { type: 'income', amount: '500.00', transferId: 'transfer-1', productId: null },
    { type: 'neutral', amount: '0.00', transferId: null, productId: null },
  ]

  it('excludes transfer legs and neutral movements from the totals', () => {
    const totals = computeTotals(dataset)

    expect(totals.expense.toFixed(2)).toBe('45.90')
    expect(totals.income.toFixed(2)).toBe('1200.00')
  })

  // Feature 36 (roadmap loose end 8): a contribution to an investment product
  // is not an expense — the money is still yours (docs/data-model.md §Totales).
  it('excludes movements with a productId from the totals', () => {
    const totals = computeTotals([
      ...dataset,
      { type: 'expense', amount: '3000.00', transferId: null, productId: 7 },
      { type: 'income', amount: '150.00', transferId: null, productId: 7 },
    ])

    expect(totals.expense.toFixed(2)).toBe('45.90')
    expect(totals.income.toFixed(2)).toBe('1200.00')
  })

  it('excludes a movement carrying BOTH transferId and productId exactly once', () => {
    const totals = computeTotals([
      { type: 'expense', amount: '10.00', transferId: null, productId: null },
      { type: 'expense', amount: '99.00', transferId: 'transfer-2', productId: 3 },
    ])

    expect(totals.expense.toFixed(2)).toBe('10.00')
    expect(totals.income.toFixed(2)).toBe('0.00')
  })

  it('returns zero totals for an empty dataset', () => {
    const totals = computeTotals([])

    expect(totals.expense.toFixed(2)).toBe('0.00')
    expect(totals.income.toFixed(2)).toBe('0.00')
  })
})

describe('serializeTotals', () => {
  it('ships decimal strings with net = income minus expense', () => {
    const totals = computeTotals([
      { type: 'income', amount: '1200.00', transferId: null, productId: null },
      { type: 'expense', amount: '45.90', transferId: null, productId: null },
    ])

    expect(serializeTotals(totals)).toEqual({
      income: '1200.00',
      expense: '45.90',
      net: '1154.10',
    })
  })

  it('ships a negative net when more went out than came in', () => {
    const totals = computeTotals([
      { type: 'income', amount: '100.00', transferId: null, productId: null },
      { type: 'expense', amount: '250.50', transferId: null, productId: null },
    ])

    expect(serializeTotals(totals).net).toBe('-150.50')
  })
})

describe('movement routes (read-only) and database indexes', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []
  const createdProductIds: number[] = []
  // Well formed since feature 21: an IBAN is validated wherever it enters.
  function uniqueIban(): string {
    return syntheticIban()
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
    // After the movements pointing at them are gone (feature 36 totals tests).
    if (createdProductIds.length > 0) {
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
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
    productId?: number | null
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
        productId: movement.productId ?? null,
      },
    })
  }

  async function createProduct() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const product = await app.prisma.investmentProduct.create({
      data: { bank: 'myinvestor', name: `Synthetic fund ${suffix}`, type: 'fund' },
    })
    createdProductIds.push(product.id)
    return product
  }

  function listUrl(params: Record<string, string | number>): string {
    const search = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    )
    return `/api/movements?${search.toString()}`
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
      .json<MovementListResponse>()
      .movements.filter((movement) => movement.accountId === account.id)

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
      .json<MovementListResponse>()
      .movements.filter((movement) => movement.accountId === account.id)

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

  it('leaves both legs out of the totals once detectTransfers pairs them (feature 40, R12)', async () => {
    // End to end: the detection writes the mark, and the totals of feature 36
    // exclude what carries it. The two features are proved together on purpose.
    const source = await createAccount()
    const target = await createAccount()
    await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '640.00',
      description: 'TRANS INM/ own pocket',
      bookingDate: '2033-01-12',
    })
    await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '640.00',
      description: 'TRANSFERENCIA RECIBIDA',
      bookingDate: '2033-01-13',
    })
    await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '18.35',
      description: 'REAL SPEND',
      bookingDate: '2033-01-14',
    })

    const detection = await detectTransfers(app.prisma)
    expect(detection.pairsCreated).toBe(1)
    expect(detection.error).toBeUndefined()

    const response = await app.inject({
      method: 'GET',
      url: listUrl({ from: '2033-01-10', to: '2033-01-20' }),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<MovementListResponse>().totals).toEqual({
      income: '0.00',
      expense: '18.35',
      net: '-18.35',
    })
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

  // ── Feature 36: filters, pagination and totals of the filter ──────────────

  it('GET /api/movements?accountId= returns only the movements of that account', async () => {
    const mine = await createAccount()
    const other = await createAccount()
    await seedMovement({ accountId: mine.id, description: 'Mine', daySequence: 1 })
    await seedMovement({ accountId: other.id, description: 'Not mine', daySequence: 1 })

    const response = await app.inject({ method: 'GET', url: listUrl({ accountId: mine.id }) })

    expect(response.statusCode).toBe(200)
    const body = response.json<MovementListResponse>()
    expect(body.movements).toHaveLength(1)
    expect(body.movements[0]?.description).toBe('Mine')
    expect(body.pagination.total).toBe(1)
  })

  it('GET /api/movements?from=&to= keeps both extreme days and drops the rest', async () => {
    const account = await createAccount()
    await seedMovement({ accountId: account.id, bookingDate: '2026-07-31', description: 'Before' })
    await seedMovement({
      accountId: account.id,
      bookingDate: '2026-08-01',
      description: 'First day',
    })
    await seedMovement({
      accountId: account.id,
      bookingDate: '2026-08-31',
      description: 'Last day',
    })
    await seedMovement({ accountId: account.id, bookingDate: '2026-09-01', description: 'After' })

    const response = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, from: '2026-08-01', to: '2026-08-31' }),
    })

    const body = response.json<MovementListResponse>()
    expect(body.movements.map((movement) => movement.description)).toEqual([
      'Last day',
      'First day',
    ])
    expect(body.pagination.total).toBe(2)
  })

  it('GET /api/movements?type=expense returns not a single income', async () => {
    const account = await createAccount()
    await seedMovement({ accountId: account.id, type: 'expense', daySequence: 1 })
    await seedMovement({ accountId: account.id, type: 'income', daySequence: 2 })

    const response = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, type: 'expense' }),
    })

    const body = response.json<MovementListResponse>()
    expect(body.movements).toHaveLength(1)
    expect(body.movements.every((movement) => movement.type === 'expense')).toBe(true)
  })

  it('GET /api/movements combines account, range, type and status in one filter', async () => {
    const account = await createAccount()
    const other = await createAccount()
    const inRange = { bookingDate: '2026-08-10', type: 'expense' as const }
    // The one row that matches everything:
    const match = await seedMovement({ accountId: account.id, ...inRange, daySequence: 1 })
    // Each of these fails exactly ONE of the four conditions:
    await seedMovement({ accountId: other.id, ...inRange, daySequence: 2 })
    await seedMovement({ accountId: account.id, ...inRange, bookingDate: '2026-09-10' })
    await seedMovement({ accountId: account.id, ...inRange, type: 'income', daySequence: 3 })
    const confirmed = await seedMovement({ accountId: account.id, ...inRange, daySequence: 4 })
    await app.prisma.movement.update({
      where: { id: confirmed.id },
      data: { status: 'confirmed' },
    })

    const response = await app.inject({
      method: 'GET',
      url: listUrl({
        accountId: account.id,
        from: '2026-08-01',
        to: '2026-08-31',
        type: 'expense',
        status: 'pending_review',
      }),
    })

    const body = response.json<MovementListResponse>()
    expect(body.movements.map((movement) => movement.id)).toEqual([match.id])
    expect(body.pagination.total).toBe(1)
  })

  it('paginates keeping the order and reporting the total of ALL matches', async () => {
    const account = await createAccount()
    const first = await seedMovement({ accountId: account.id, daySequence: 1 })
    const second = await seedMovement({ accountId: account.id, daySequence: 2 })
    const third = await seedMovement({ accountId: account.id, daySequence: 3 })

    const pageOne = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, page: 1, pageSize: 2 }),
    })
    const pageTwo = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, page: 2, pageSize: 2 }),
    })

    const one = pageOne.json<MovementListResponse>()
    const two = pageTwo.json<MovementListResponse>()
    expect(one.movements.map((movement) => movement.id)).toEqual([third.id, second.id])
    expect(one.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 })
    expect(two.movements.map((movement) => movement.id)).toEqual([first.id])
    expect(two.pagination).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 })
  })

  it('answers without any filter, paginated with the defaults (page 1, 50 per page)', async () => {
    const account = await createAccount()
    await seedMovement({ accountId: account.id })

    const response = await app.inject({ method: 'GET', url: '/api/movements' })

    expect(response.statusCode).toBe(200)
    const body = response.json<MovementListResponse>()
    expect(Array.isArray(body)).toBe(false)
    expect(body.pagination.page).toBe(1)
    expect(body.pagination.pageSize).toBe(50)
    expect(body.movements.length).toBeLessThanOrEqual(50)
    expect(body.totals).toMatchObject({ income: expect.any(String), expense: expect.any(String) })
  })

  it('computes the totals over the FILTER, every page of it, not the whole table', async () => {
    const account = await createAccount()
    const other = await createAccount()
    await seedMovement({ accountId: account.id, type: 'expense', amount: '30.00', daySequence: 1 })
    await seedMovement({ accountId: account.id, type: 'expense', amount: '20.00', daySequence: 2 })
    await seedMovement({ accountId: account.id, type: 'income', amount: '100.00', daySequence: 3 })
    // Noise in another account: must not enter the totals.
    await seedMovement({ accountId: other.id, type: 'expense', amount: '999.00', daySequence: 1 })

    // pageSize 1: the page shows one movement, the totals still sum the three.
    const response = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, pageSize: 1 }),
    })

    const body = response.json<MovementListResponse>()
    expect(body.movements).toHaveLength(1)
    expect(body.totals).toEqual({ income: '100.00', expense: '50.00', net: '50.00' })
  })

  it('leaves transfer legs and product contributions out of the response totals', async () => {
    const account = await createAccount()
    const product = await createProduct()
    await seedMovement({ accountId: account.id, type: 'expense', amount: '45.90', daySequence: 1 })
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '500.00',
      daySequence: 2,
      transferId: `transfer-${Date.now()}`,
    })
    await seedMovement({
      accountId: account.id,
      type: 'expense',
      amount: '3000.00',
      daySequence: 3,
      productId: product.id,
    })

    const response = await app.inject({ method: 'GET', url: listUrl({ accountId: account.id }) })

    const body = response.json<MovementListResponse>()
    // The rows themselves are listed — only the totals leave them out.
    expect(body.pagination.total).toBe(3)
    expect(body.totals).toEqual({ income: '0.00', expense: '45.90', net: '-45.90' })
  })

  it('keeps the serialized shape of each movement exactly as it was (feature 36)', async () => {
    const account = await createAccount()
    await seedMovement({ accountId: account.id })

    const response = await app.inject({ method: 'GET', url: listUrl({ accountId: account.id }) })

    const [movement] = response.json<MovementListResponse>().movements
    expect(Object.keys(movement ?? {}).sort()).toEqual(
      [
        'id',
        'type',
        'bookingDate',
        'valueDate',
        'amount',
        'description',
        'balanceAfter',
        'currency',
        'note',
        'accountId',
        'categoryId',
        'paymentMethod',
        'origin',
        'status',
        'transferId',
        'daySequence',
        'createdAt',
        'updatedAt',
        'account',
        'category',
      ].sort(),
    )
  })

  it('rejects a date that is not a date with 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/movements?from=31-08-2026',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('rejects an unknown type and an unknown status with 400 VALIDATION_ERROR', async () => {
    const byType = await app.inject({ method: 'GET', url: '/api/movements?type=transfer' })
    const byStatus = await app.inject({ method: 'GET', url: '/api/movements?status=whatever' })

    expect(byType.statusCode).toBe(400)
    expect(byType.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(byStatus.statusCode).toBe(400)
    expect(byStatus.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('rejects page 0, a non-numeric accountId and an oversized pageSize with 400', async () => {
    const byPage = await app.inject({ method: 'GET', url: '/api/movements?page=0' })
    const byAccount = await app.inject({ method: 'GET', url: '/api/movements?accountId=abc' })
    const bySize = await app.inject({ method: 'GET', url: '/api/movements?pageSize=500' })

    for (const response of [byPage, byAccount, bySize]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
  })

  it('rejects a range with from after to with 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/movements?from=2026-08-31&to=2026-08-01',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('answers 404 NOT_FOUND for an accountId that does not exist', async () => {
    const account = await createAccount()
    await app.prisma.account.delete({ where: { id: account.id } })
    createdAccountIds.length = 0

    const response = await app.inject({ method: 'GET', url: listUrl({ accountId: account.id }) })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('rejects a page past the last one with 400, never an empty 200', async () => {
    const account = await createAccount()
    await seedMovement({ accountId: account.id })

    const response = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, page: 5, pageSize: 50 }),
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('answers an empty page with zero totals for an account with nothing in range', async () => {
    const account = await createAccount()
    await seedMovement({ accountId: account.id, bookingDate: '2026-07-10' })

    const response = await app.inject({
      method: 'GET',
      url: listUrl({ accountId: account.id, from: '2026-08-01', to: '2026-08-31' }),
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<MovementListResponse>()
    expect(body.movements).toEqual([])
    expect(body.pagination).toEqual({ page: 1, pageSize: 50, total: 0, totalPages: 0 })
    expect(body.totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
  })
})

describe('PATCH /api/movements/:id — category and status of a movement (feature 37)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []

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
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Test account', initialBalance },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(name: string, kind: 'expense' | 'income' = 'expense') {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const category = await app.prisma.category.create({
      data: { name: `${name}-${suffix}`, kind },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  async function seedMovement(
    accountId: number,
    overrides: { type?: 'expense' | 'income' | 'neutral'; amount?: string } = {},
  ) {
    const bookingDate = new Date('2026-07-24T00:00:00.000Z')
    return app.prisma.movement.create({
      data: {
        accountId,
        type: overrides.type ?? 'expense',
        amount: overrides.amount ?? '34.15',
        description: 'RECIBO /Recibo GIMNASIO',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
      },
    })
  }

  function patchMovement(id: number | string, body: unknown) {
    return app.inject({ method: 'PATCH', url: `/api/movements/${id}`, payload: body as object })
  }

  it('assigns a compatible category and embeds it in the response (R7)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id)

    const response = await patchMovement(movement.id, { categoryId: category.id })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedMovement>()
    expect(body.id).toBe(movement.id)
    expect(body.categoryId).toBe(category.id)
    expect(body.category).toEqual({
      id: category.id,
      name: category.name,
      kind: 'expense',
      parentId: null,
    })
  })

  it('removes the category with categoryId: null (R8)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id)
    await patchMovement(movement.id, { categoryId: category.id })

    const response = await patchMovement(movement.id, { categoryId: null })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedMovement>()
    expect(body.categoryId).toBeNull()
    expect(body.category).toBeNull()
  })

  it('answers 404 for a categoryId that does not exist, without modifying (R11)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)

    const response = await patchMovement(movement.id, { categoryId: 99999999 })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBeNull()
  })

  it('answers 404 for a movement that does not exist (R11)', async () => {
    const response = await patchMovement(99999999, { status: 'confirmed' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('rejects an income category on an expense movement with 400 (R9)', async () => {
    const account = await createAccount()
    const incomeCategory = await createCategory('Payroll', 'income')
    const movement = await seedMovement(account.id, { type: 'expense' })

    const response = await patchMovement(movement.id, { categoryId: incomeCategory.id })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBeNull()
  })

  it('rejects any category on a neutral movement with 400 (R9)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id, { type: 'neutral', amount: '0.00' })

    const response = await patchMovement(movement.id, { categoryId: category.id })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('confirms a movement and takes it back to pending_review (R10)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)
    expect(movement.status).toBe('pending_review')

    const confirmed = await patchMovement(movement.id, { status: 'confirmed' })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json<SerializedMovement>().status).toBe('confirmed')

    const reverted = await patchMovement(movement.id, { status: 'pending_review' })
    expect(reverted.statusCode).toBe(200)
    expect(reverted.json<SerializedMovement>().status).toBe('pending_review')
  })

  it('takes categoryId and status together in one request (R7, R10)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id)

    const response = await patchMovement(movement.id, {
      categoryId: category.id,
      status: 'confirmed',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedMovement>()
    expect(body.categoryId).toBe(category.id)
    expect(body.status).toBe('confirmed')
  })

  it('rejects an empty body and an unknown status with 400 (R12)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)

    const empty = await patchMovement(movement.id, {})
    const badStatus = await patchMovement(movement.id, { status: 'reviewed' })
    const badCategory = await patchMovement(movement.id, { categoryId: 0 })

    for (const response of [empty, badStatus, badCategory]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
  })

  it('rejects amount or any other property of the bank fact with 400 (R12, R15)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)

    const withAmount = await patchMovement(movement.id, { amount: '1.00', status: 'confirmed' })
    const withDescription = await patchMovement(movement.id, { description: 'edited' })

    for (const response of [withAmount, withDescription]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.amount.toFixed(2)).toBe('34.15')
    expect(stored.status).toBe('pending_review')
  })

  it('changes nothing else: fields, account balance and totals stay identical (R15)', async () => {
    const account = await createAccount(1000)
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id)

    async function snapshot() {
      const accountResponse = await app.inject({
        method: 'GET',
        url: `/api/accounts/${account.id}`,
      })
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/movements?accountId=${account.id}`,
      })
      return {
        balance: accountResponse.json<{ balance: string }>().balance,
        totals: listResponse.json<MovementListResponse>().totals,
        movement: listResponse.json<MovementListResponse>().movements[0],
      }
    }

    const before = await snapshot()
    const patched = await patchMovement(movement.id, {
      categoryId: category.id,
      status: 'confirmed',
    })
    expect(patched.statusCode).toBe(200)
    const after = await snapshot()

    expect(after.balance).toBe(before.balance)
    expect(after.totals).toEqual(before.totals)
    // Every field except the two written ones (and updatedAt) is untouched.
    const untouched = (full: SerializedMovement | undefined) => {
      if (!full) throw new Error('movement missing from the listing')
      const { categoryId: _c, category: _e, status: _s, updatedAt: _u, ...rest } = full
      return rest
    }
    expect(untouched(after.movement)).toEqual(untouched(before.movement))
    expect(after.movement?.categoryId).toBe(category.id)
    expect(after.movement?.status).toBe('confirmed')
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
