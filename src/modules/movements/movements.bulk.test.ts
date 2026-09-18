// Feature 47: `PATCH /api/movements` changes the category and/or the status of
// SEVERAL movements in one request, and it is all or nothing — every test of a
// rejection re-reads the rows, because a 400 that still wrote something would
// look exactly the same from the status code alone.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { bulkUpdateMovementsMaxIds } from './movements.schema.js'
import type { BulkUpdateMovementsResult } from './movements.types.js'

describe('PATCH /api/movements — category and status of several movements (feature 47)', () => {
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
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(name: string, kind: 'expense' | 'income' = 'expense') {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const category = await app.prisma.category.create({ data: { name: `${name}-${suffix}`, kind } })
    createdCategoryIds.push(category.id)
    return category
  }

  const bookingDate = new Date('2026-07-24T00:00:00.000Z')

  async function seedMovement(
    accountId: number,
    overrides: {
      type?: 'expense' | 'income' | 'neutral'
      amount?: string
      daySequence?: number
      description?: string
    } = {},
  ) {
    return app.prisma.movement.create({
      data: {
        accountId,
        type: overrides.type ?? 'expense',
        amount: overrides.amount ?? '34.15',
        description: overrides.description ?? 'RECIBO /Recibo GIMNASIO',
        bookingDate,
        valueDate: bookingDate,
        daySequence: overrides.daySequence ?? 1,
      },
    })
  }

  function bulkPatch(body: unknown) {
    return app.inject({ method: 'PATCH', url: '/api/movements', payload: body as object })
  }

  function storedRows(ids: number[]) {
    return app.prisma.movement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    })
  }

  it('confirms every movement of the list and answers how many changed (R8)', async () => {
    const account = await createAccount()
    const first = await seedMovement(account.id, { daySequence: 1 })
    const second = await seedMovement(account.id, { daySequence: 2 })
    const untouched = await seedMovement(account.id, { daySequence: 3 })

    const response = await bulkPatch({ ids: [first.id, second.id], status: 'confirmed' })

    expect(response.statusCode).toBe(200)
    const body = response.json<BulkUpdateMovementsResult>()
    expect(body.updated).toBe(2)
    expect(body.movements.map((movement) => movement.id).sort()).toEqual(
      [first.id, second.id].sort(),
    )
    expect(body.movements.every((movement) => movement.status === 'confirmed')).toBe(true)

    const stored = await storedRows([first.id, second.id, untouched.id])
    expect(stored.map((movement) => movement.status)).toEqual([
      'confirmed',
      'confirmed',
      'pending_review',
    ])
  })

  it('assigns one category to every movement of the list and embeds it (R8)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const first = await seedMovement(account.id, { daySequence: 1 })
    const second = await seedMovement(account.id, { daySequence: 2 })

    const response = await bulkPatch({ ids: [first.id, second.id], categoryId: category.id })

    expect(response.statusCode).toBe(200)
    const body = response.json<BulkUpdateMovementsResult>()
    expect(body.updated).toBe(2)
    expect(body.movements.every((movement) => movement.category?.id === category.id)).toBe(true)

    const stored = await storedRows([first.id, second.id])
    expect(stored.map((movement) => movement.categoryId)).toEqual([category.id, category.id])
  })

  it('applies category and status in the same request (R8)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id)

    const response = await bulkPatch({
      ids: [movement.id],
      categoryId: category.id,
      status: 'confirmed',
    })

    expect(response.statusCode).toBe(200)
    const [stored] = await storedRows([movement.id])
    expect(stored?.categoryId).toBe(category.id)
    expect(stored?.status).toBe('confirmed')
  })

  it('removes the category of every movement with categoryId: null (R8)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const first = await seedMovement(account.id, { daySequence: 1 })
    const second = await seedMovement(account.id, { daySequence: 2 })
    await bulkPatch({ ids: [first.id, second.id], categoryId: category.id })

    const response = await bulkPatch({ ids: [first.id, second.id], categoryId: null })

    expect(response.statusCode).toBe(200)
    const stored = await storedRows([first.id, second.id])
    expect(stored.map((movement) => movement.categoryId)).toEqual([null, null])
  })

  it('answers 404 when one id does not exist, and changes NOT ONE of the others (R9)', async () => {
    const account = await createAccount()
    const first = await seedMovement(account.id, { daySequence: 1 })
    const second = await seedMovement(account.id, { daySequence: 2 })
    const gone = await seedMovement(account.id, { daySequence: 3 })
    await app.prisma.movement.delete({ where: { id: gone.id } })

    const response = await bulkPatch({ ids: [first.id, second.id, gone.id], status: 'confirmed' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(response.json<{ message: string }>().message).toContain(String(gone.id))

    const stored = await storedRows([first.id, second.id])
    expect(stored.map((movement) => movement.status)).toEqual(['pending_review', 'pending_review'])
  })

  it('answers 404 for a category that does not exist, without touching a row (R9)', async () => {
    const account = await createAccount()
    const first = await seedMovement(account.id, { daySequence: 1 })
    const second = await seedMovement(account.id, { daySequence: 2 })

    const response = await bulkPatch({
      ids: [first.id, second.id],
      categoryId: 99999999,
      status: 'confirmed',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })

    const stored = await storedRows([first.id, second.id])
    expect(stored.map((movement) => movement.categoryId)).toEqual([null, null])
    expect(stored.map((movement) => movement.status)).toEqual(['pending_review', 'pending_review'])
  })

  it('answers 400 when the category kind does not match ONE movement, and none changes (R10)', async () => {
    const account = await createAccount()
    const expenseCategory = await createCategory('Sport', 'expense')
    const first = await seedMovement(account.id, { daySequence: 1, type: 'expense' })
    const second = await seedMovement(account.id, { daySequence: 2, type: 'expense' })
    // The only income of the batch: it alone makes the whole request fail.
    const income = await seedMovement(account.id, { daySequence: 3, type: 'income' })

    const response = await bulkPatch({
      ids: [first.id, second.id, income.id],
      categoryId: expenseCategory.id,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    expect(response.json<{ message: string }>().message).toContain(String(income.id))

    const stored = await storedRows([first.id, second.id, income.id])
    expect(stored.map((movement) => movement.categoryId)).toEqual([null, null, null])
  })

  it('answers 400 when ONE movement is neutral, and none changes (R10)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const expense = await seedMovement(account.id, { daySequence: 1 })
    const neutral = await seedMovement(account.id, {
      daySequence: 2,
      type: 'neutral',
      amount: '0.00',
    })

    const response = await bulkPatch({ ids: [expense.id, neutral.id], categoryId: category.id })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    expect(response.json<{ message: string }>().message).toContain(String(neutral.id))

    const stored = await storedRows([expense.id, neutral.id])
    expect(stored.map((movement) => movement.categoryId)).toEqual([null, null])
  })

  it('lets a status-only request through for a neutral movement (R8)', async () => {
    const account = await createAccount()
    const neutral = await seedMovement(account.id, { type: 'neutral', amount: '0.00' })

    const response = await bulkPatch({ ids: [neutral.id], status: 'confirmed' })

    expect(response.statusCode).toBe(200)
    const [stored] = await storedRows([neutral.id])
    expect(stored?.status).toBe('confirmed')
  })

  it('rejects an empty ids list with 400 (R11)', async () => {
    const response = await bulkPatch({ ids: [], status: 'confirmed' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('rejects a repeated id with 400 and does not change it (R11)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)

    const response = await bulkPatch({ ids: [movement.id, movement.id], status: 'confirmed' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    const [stored] = await storedRows([movement.id])
    expect(stored?.status).toBe('pending_review')
  })

  it(`rejects more than ${bulkUpdateMovementsMaxIds} ids with 400, and takes exactly that many (R11)`, async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)
    const tooMany = Array.from({ length: bulkUpdateMovementsMaxIds + 1 }, (_, index) => index + 1)

    const overTheTop = await bulkPatch({ ids: tooMany, status: 'confirmed' })
    expect(overTheTop.statusCode).toBe(400)
    expect(overTheTop.json()).toMatchObject({ code: 'VALIDATION_ERROR' })

    // The tope itself is accepted: it fails later, on the ids that do not exist,
    // which is a 404 and not a 400 about the size of the list.
    const atTheTop = await bulkPatch({
      ids: [
        movement.id,
        ...Array.from(
          { length: bulkUpdateMovementsMaxIds - 1 },
          (_, index) => movement.id + index + 1_000_000,
        ),
      ],
      status: 'confirmed',
    })
    expect(atTheTop.statusCode).toBe(404)
  })

  it('rejects an id that is not a positive integer with 400 (R11)', async () => {
    const byZero = await bulkPatch({ ids: [0], status: 'confirmed' })
    const byText = await bulkPatch({ ids: ['abc'], status: 'confirmed' })

    for (const response of [byZero, byText]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
  })

  it('rejects an unknown body property with 400 instead of ignoring it (R12, R13)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)

    const response = await bulkPatch({
      ids: [movement.id],
      status: 'confirmed',
      amount: '0.01',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const [stored] = await storedRows([movement.id])
    expect(stored?.status).toBe('pending_review')
    expect(stored?.amount.toFixed(2)).toBe('34.15')
  })

  it('rejects a body with neither categoryId nor status with 400 (R12)', async () => {
    const account = await createAccount()
    const movement = await seedMovement(account.id)

    const response = await bulkPatch({ ids: [movement.id] })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const [stored] = await storedRows([movement.id])
    expect(stored?.status).toBe('pending_review')
  })

  it('rejects a body without ids and an unknown status with 400 (R11, R12)', async () => {
    const noIds = await bulkPatch({ status: 'confirmed' })
    const badStatus = await bulkPatch({ ids: [1], status: 'whatever' })

    for (const response of [noIds, badStatus]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
  })

  it('leaves amount, dates and description exactly as they were (R13)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const first = await seedMovement(account.id, { daySequence: 1 })
    const second = await seedMovement(account.id, { daySequence: 2, description: 'PAGO TARJETA' })
    const before = await storedRows([first.id, second.id])

    const response = await bulkPatch({
      ids: [first.id, second.id],
      categoryId: category.id,
      status: 'confirmed',
    })
    expect(response.statusCode).toBe(200)

    const after = await storedRows([first.id, second.id])
    expect(
      after.map((movement) => ({
        amount: movement.amount.toFixed(2),
        bookingDate: movement.bookingDate.toISOString(),
        valueDate: movement.valueDate.toISOString(),
        description: movement.description,
        type: movement.type,
        origin: movement.origin,
        daySequence: movement.daySequence,
        balanceAfter: movement.balanceAfter,
        transferId: movement.transferId,
        note: movement.note,
        currency: movement.currency,
        accountId: movement.accountId,
      })),
    ).toEqual(
      before.map((movement) => ({
        amount: movement.amount.toFixed(2),
        bookingDate: movement.bookingDate.toISOString(),
        valueDate: movement.valueDate.toISOString(),
        description: movement.description,
        type: movement.type,
        origin: movement.origin,
        daySequence: movement.daySequence,
        balanceAfter: movement.balanceAfter,
        transferId: movement.transferId,
        note: movement.note,
        currency: movement.currency,
        accountId: movement.accountId,
      })),
    )
  })

  it('keeps PATCH /api/movements/:id working exactly as before (feature 37)', async () => {
    const account = await createAccount()
    const category = await createCategory('Sport')
    const movement = await seedMovement(account.id)

    const single = await app.inject({
      method: 'PATCH',
      url: `/api/movements/${movement.id}`,
      payload: { categoryId: category.id },
    })

    expect(single.statusCode).toBe(200)
    expect(single.json<{ categoryId: number }>().categoryId).toBe(category.id)
    // And its body still refuses what the bulk endpoint accepts: no `ids` there.
    const withIds = await app.inject({
      method: 'PATCH',
      url: `/api/movements/${movement.id}`,
      payload: { ids: [movement.id], status: 'confirmed' },
    })
    expect(withIds.statusCode).toBe(400)
  })
})
