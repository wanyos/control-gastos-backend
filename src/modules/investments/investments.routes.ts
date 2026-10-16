import type { FastifyInstance } from 'fastify'

import { todayInMadridAsDate } from '../../lib/local-date.js'
import { getDepositEarningsSchema, getInvestmentsOverviewSchema } from './investments.schema.js'
import { getDepositEarnings, getInvestmentsOverview, investmentsDb } from './investments.service.js'
import type {
  DepositMaturityMatcherRegistry,
  InvestmentsOverviewQuery,
} from './investments.types.js'

export interface InvestmentsRoutesOptions {
  /**
   * Bank → deposit-maturity matcher registry (feature 50), injected from the
   * composition root (`src/app.ts`) so this module knows no bank. Empty means
   * no maturity is ever recognized: every due deposit is `maturity_not_found`.
   */
  depositMaturityMatchers?: DepositMaturityMatcherRegistry
}

/**
 * HTTP layer of the investments views. Registered under the `/api/investments`
 * prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/investments/overview   (feature 39)
 *   GET /api/investments/deposits   (feature 50)
 *
 * Read-only endpoints and nothing else: no POST, no PATCH, no DELETE. The data
 * enters the system through the importer only (features 26 and 29).
 */
export default async function investmentsRoutes(
  fastify: FastifyInstance,
  options: InvestmentsRoutesOptions = {},
) {
  const db = investmentsDb(fastify)
  const depositMaturityMatchers = options.depositMaturityMatchers ?? []

  fastify.get<{ Querystring: InvestmentsOverviewQuery }>(
    '/overview',
    { schema: getInvestmentsOverviewSchema },
    async (request) => {
      return getInvestmentsOverview(db, request.query)
    },
  )

  fastify.get('/deposits', { schema: getDepositEarningsSchema }, async () => {
    // Today in the Madrid calendar, as date-only midnight UTC -- the same clock
    // as `bookingDate` and net worth (see `src/lib/local-date.ts`).
    const today = todayInMadridAsDate()
    return getDepositEarnings(db, depositMaturityMatchers, today)
  })
}
