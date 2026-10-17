import type { FastifyInstance } from 'fastify'

import { todayInMadrid } from '../../lib/local-date.js'
import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import { getRecurringExpensesSchema } from './recurring-expenses.schema.js'
import { getRecurringExpenses, recurringExpensesDb } from './recurring-expenses.service.js'

/**
 * HTTP layer of the recurring expenses (feature 58). Registered under the
 * `/api/recurring-expenses` prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/recurring-expenses
 *
 * One read-only endpoint: no POST, no PATCH, no DELETE. Everything is
 * computed on each request; nothing is stored.
 */
export interface RecurringExpensesRoutesOptions {
  /**
   * Bank → deposit matcher registry (feature 57), the same one the totals of
   * `GET /api/movements` get from `src/app.ts`: an expense here is exactly an
   * expense there.
   */
  depositMaturityMatchers?: DepositMaturityMatcherRegistry
}

export default async function recurringExpensesRoutes(
  fastify: FastifyInstance,
  options: RecurringExpensesRoutesOptions = {},
) {
  const db = recurringExpensesDb(fastify)
  const depositMaturityMatchers = options.depositMaturityMatchers ?? []

  fastify.get('/', { schema: getRecurringExpensesSchema }, async () => {
    return getRecurringExpenses(db, depositMaturityMatchers, todayInMadrid())
  })
}
