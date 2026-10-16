// 2026-10-16: `POST /api/movements/confirm-all` closes everything still open —
// a category for every movement without one, by type, and `confirmed` for every
// pending one — in a single transaction. It touches the WHOLE table, so the
// test database (ADR-027) is the only place it can run.
//
// 🔒 Everything here is synthetic: invented amounts and descriptions, and
// `syntheticIban()` accounts.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ConfirmAllMovementsResult } from './movements.types.js'

describe('POST /api/movements/confirm-all', () => {
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

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Confirm-all test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(kind: 'expense' | 'income') {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const category = await app.prisma.category.create({
      data: { name: `synthetic ${kind} ${suffix}`, kind },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  const bookingDate = new Date('2031-07-24T00:00:00.000Z')

  function seedMovement(
    accountId: number,
    overrides: {
      type?: 'expense' | 'income' | 'neutral'
      categoryId?: number
      status?: 'confirmed' | 'pending_review'
      transferId?: string
      daySequence?: number
    } = {},
  ) {
    return app.prisma.movement.create({
      data: {
        accountId,
        type: overrides.type ?? 'expense',
        amount: overrides.type === 'income' ? '120.00' : '34.15',
        description: 'SYNTHETIC CONFIRM ALL ROW',
        bookingDate,
        valueDate: bookingDate,
        daySequence: overrides.daySequence ?? 1,
        categoryId: overrides.categoryId ?? null,
        status: overrides.status ?? 'pending_review',
        transferId: overrides.transferId ?? null,
      },
    })
  }

  function confirmAll(body: unknown) {
    return app.inject({
      method: 'POST',
      url: '/api/movements/confirm-all',
      payload: body as object,
    })
  }

  it('gives every uncategorized expense and income its category, skips transfer legs, and confirms every pending one', async () => {
    const account = await createAccount()
    const other = await createAccount()
    const expenseCategory = await createCategory('expense')
    const incomeCategory = await createCategory('income')
    const alreadyCategorized = await createCategory('expense')

    const expense = await seedMovement(account.id, { daySequence: 1 })
    const income = await seedMovement(account.id, { type: 'income', daySequence: 2 })
    const neutral = await seedMovement(account.id, { type: 'neutral', daySequence: 3 })
    const keepsCategory = await seedMovement(account.id, {
      categoryId: alreadyCategorized.id,
      daySequence: 4,
    })
    const alreadyConfirmed = await seedMovement(account.id, { status: 'confirmed', daySequence: 5 })
    const legOut = await seedMovement(account.id, { transferId: 'synthetic-pair', daySequence: 6 })
    const legIn = await seedMovement(other.id, {
      type: 'income',
      transferId: 'synthetic-pair',
      daySequence: 1,
    })

    const response = await confirmAll({
      expenseCategoryId: expenseCategory.id,
      incomeCategoryId: incomeCategory.id,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<ConfirmAllMovementsResult>()
    // Counts are >= because the whole table is touched and another file of the
    // same worker could have left nothing — but never less than our own rows.
    expect(body.categorized.expense).toBeGreaterThanOrEqual(1)
    expect(body.categorized.income).toBeGreaterThanOrEqual(1)
    expect(body.confirmed).toBeGreaterThanOrEqual(6)

    const rows = await app.prisma.movement.findMany({
      where: {
        id: {
          in: [
            expense.id,
            income.id,
            neutral.id,
            keepsCategory.id,
            alreadyConfirmed.id,
            legOut.id,
            legIn.id,
          ],
        },
      },
      orderBy: { id: 'asc' },
    })
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get(expense.id)?.categoryId).toBe(expenseCategory.id)
    expect(byId.get(income.id)?.categoryId).toBe(incomeCategory.id)
    expect(byId.get(neutral.id)?.categoryId).toBeNull()
    expect(byId.get(keepsCategory.id)?.categoryId).toBe(alreadyCategorized.id)
    expect(byId.get(alreadyConfirmed.id)?.categoryId).toBe(expenseCategory.id)
    expect(byId.get(legOut.id)?.categoryId).toBeNull()
    expect(byId.get(legIn.id)?.categoryId).toBeNull()
    expect(rows.every((row) => row.status === 'confirmed')).toBe(true)
    // The bank fact never moves.
    expect(byId.get(expense.id)?.amount.toFixed(2)).toBe('34.15')
    expect(byId.get(legOut.id)?.transferId).toBe('synthetic-pair')
  })

  it('writes nothing when a category is of the wrong kind (400) or missing (404)', async () => {
    const account = await createAccount()
    const expenseCategory = await createCategory('expense')
    const incomeCategory = await createCategory('income')
    const row = await seedMovement(account.id)

    const swapped = await confirmAll({
      expenseCategoryId: incomeCategory.id,
      incomeCategoryId: expenseCategory.id,
    })
    expect(swapped.statusCode).toBe(400)
    expect(swapped.json()).toMatchObject({ code: 'VALIDATION_ERROR' })

    const missing = await confirmAll({
      expenseCategoryId: expenseCategory.id,
      incomeCategoryId: 999_999_999,
    })
    expect(missing.statusCode).toBe(404)

    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: row.id } })
    expect(stored.categoryId).toBeNull()
    expect(stored.status).toBe('pending_review')
  })

  it('rejects a body with a missing category, an unknown property or a list of ids (400)', async () => {
    const expenseCategory = await createCategory('expense')

    expect((await confirmAll({ expenseCategoryId: expenseCategory.id })).statusCode).toBe(400)
    expect(
      (await confirmAll({ expenseCategoryId: expenseCategory.id, incomeCategoryId: 1, ids: [1] }))
        .statusCode,
    ).toBe(400)
  })
})
