import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'

interface ExpenseResponse {
  id: number
  description: string
  amount: string
  date: string
  categoryId: number | null
}

describe('expense routes', () => {
  let app: FastifyInstance
  // Ids created during a test; removed in afterEach to leave the DB as it was.
  const createdIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdIds.length > 0) {
      await app.prisma.expense.deleteMany({ where: { id: { in: createdIds } } })
      createdIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createExpense(body: Record<string, unknown>): Promise<ExpenseResponse> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      payload: body,
    })
    expect(response.statusCode).toBe(201)
    const expense = response.json<ExpenseResponse>()
    createdIds.push(expense.id)
    return expense
  }

  it('POST /api/expenses with a valid body returns 201 with the resource', async () => {
    const expense = await createExpense({ description: 'Weekly groceries', amount: 45.9 })

    expect(expense.id).toBeTypeOf('number')
    expect(expense.description).toBe('Weekly groceries')
    // Prisma Decimal serializes to a JSON string.
    expect(Number(expense.amount)).toBe(45.9)
    expect(new Date(expense.date).getTime()).not.toBeNaN()
    expect(expense.categoryId).toBeNull()
  })

  it('GET /api/expenses includes a previously created expense', async () => {
    const created = await createExpense({ description: 'Bus ticket', amount: 2.5 })

    const response = await app.inject({ method: 'GET', url: '/api/expenses' })

    expect(response.statusCode).toBe(200)
    const expenses = response.json<ExpenseResponse[]>()
    const found = expenses.find((expense) => expense.id === created.id)
    expect(found).toBeDefined()
    expect(found?.description).toBe('Bus ticket')
  })

  it('GET /api/expenses/:id returns 200 with the expense', async () => {
    const created = await createExpense({ description: 'Coffee', amount: 1.8 })

    const response = await app.inject({ method: 'GET', url: `/api/expenses/${created.id}` })

    expect(response.statusCode).toBe(200)
    const expense = response.json<ExpenseResponse>()
    expect(expense.id).toBe(created.id)
    expect(expense.description).toBe('Coffee')
  })

  it('POST /api/expenses without amount returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      payload: { description: 'Missing amount' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('GET /api/expenses/99999 returns 404 with "Expense not found"', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/expenses/99999' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ message: 'Expense not found' })
  })

  it('GET /api/expenses/99999 returns the shared error body shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/expenses/99999' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Expense not found',
    })
  })

  it('POST /api/expenses without amount returns 400 with code VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      payload: { description: 'Missing amount' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('GET /api/expenses/abc returns 400 with code VALIDATION_ERROR', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/expenses/abc' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('DELETE /api/expenses/:id returns 204 and removes it from the list', async () => {
    const created = await createExpense({ description: 'To be deleted', amount: 10 })

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/expenses/${created.id}`,
    })
    expect(deleteResponse.statusCode).toBe(204)

    const listResponse = await app.inject({ method: 'GET', url: '/api/expenses' })
    expect(listResponse.statusCode).toBe(200)
    const expenses = listResponse.json<ExpenseResponse[]>()
    expect(expenses.some((expense) => expense.id === created.id)).toBe(false)
  })
})
