import type { FastifyInstance } from 'fastify'

import { todayInMadrid } from '../../lib/local-date.js'
import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import type { InvestmentPurchaseMatcherRegistry } from '../movements/movements.types.js'
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
  /**
   * Bank → investment purchase matcher registry (feature 71), the same one the
   * totals of `GET /api/overview` get: a purchase is an expense in neither.
   */
  investmentPurchaseMatchers?: InvestmentPurchaseMatcherRegistry
}

export default async function expensesByCategoryRoutes(
  fastify: FastifyInstance,
  options: ExpensesByCategoryRoutesOptions = {},
) {
  const db = expensesByCategoryDb(fastify)
  const depositMaturityMatchers = options.depositMaturityMatchers ?? []
  const investmentPurchaseMatchers = options.investmentPurchaseMatchers ?? []

  fastify.get<{ Querystring: ExpensesByCategoryQuery }>(
    '/',
    { schema: getExpensesByCategorySchema },
    async (request) => {
      return getExpensesByCategory(
        db,
        depositMaturityMatchers,
        request.query,
        todayInMadrid(),
        investmentPurchaseMatchers,
      )
    },
  )
}
