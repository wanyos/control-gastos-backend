import type { FastifyInstance } from 'fastify'

import { todayInMadrid } from '../../lib/local-date.js'
import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import { getExpensesByCategorySchema } from './expenses-by-category.schema.js'
import { expensesByCategoryDb, getExpensesByCategory } from './expenses-by-category.service.js'
import type { ExpensesByCategoryQuery } from './expenses-by-category.types.js'

/**
 * HTTP layer of the expense by category (feature 63). Registered under the
 * `/api/expenses-by-category` prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/expenses-by-category
 *
 * One read-only endpoint: no POST, no PATCH, no DELETE.
 */
export interface ExpensesByCategoryRoutesOptions {
  /**
   * Bank → deposit matcher registry (feature 57), the same one the totals of
   * `GET /api/overview` get from `src/app.ts`: an expense here is exactly an
   * expense there.
   */
  depositMaturityMatchers?: DepositMaturityMatcherRegistry
}

export default async function expensesByCategoryRoutes(
  fastify: FastifyInstance,
  options: ExpensesByCategoryRoutesOptions = {},
) {
  const db = expensesByCategoryDb(fastify)
  const depositMaturityMatchers = options.depositMaturityMatchers ?? []

  fastify.get<{ Querystring: ExpensesByCategoryQuery }>(
    '/',
    { schema: getExpensesByCategorySchema },
    async (request) => {
      return getExpensesByCategory(db, depositMaturityMatchers, request.query, todayInMadrid())
    },
  )
}
