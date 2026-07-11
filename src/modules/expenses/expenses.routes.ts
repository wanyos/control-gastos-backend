import type { FastifyInstance } from 'fastify'

import { createExpenseSchema, expenseIdParamsSchema } from './expenses.schema.js'
import {
  createExpense,
  deleteExpense,
  expensesDb,
  getExpenseById,
  listExpenses,
} from './expenses.service.js'
import type { CreateExpenseBody, ExpenseIdParams } from './expenses.types.js'

/**
 * HTTP layer for expenses: validates with schemas, delegates to the service
 * and formats the response. Registered under the `/api/expenses` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET    /api/expenses
 *   POST   /api/expenses
 *   GET    /api/expenses/:id
 *   DELETE /api/expenses/:id
 */
export default async function expensesRoutes(fastify: FastifyInstance) {
  const db = expensesDb(fastify)

  fastify.get('/', async () => {
    return listExpenses(db)
  })

  fastify.get<{ Params: ExpenseIdParams }>(
    '/:id',
    { schema: expenseIdParamsSchema },
    async (request) => {
      return getExpenseById(db, request.params.id)
    },
  )

  fastify.post<{ Body: CreateExpenseBody }>(
    '/',
    { schema: createExpenseSchema },
    async (request, reply) => {
      const expense = await createExpense(db, request.body)
      return reply.status(201).send(expense)
    },
  )

  fastify.delete<{ Params: ExpenseIdParams }>(
    '/:id',
    { schema: expenseIdParamsSchema },
    async (request, reply) => {
      await deleteExpense(db, request.params.id)
      return reply.status(204).send()
    },
  )
}
