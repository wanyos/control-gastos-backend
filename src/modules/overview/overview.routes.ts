import type { FastifyInstance } from 'fastify'

import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import { getOverviewSchema } from './overview.schema.js'
import { getOverview, overviewDb } from './overview.service.js'
import type { OverviewQuery } from './overview.types.js'

/**
 * HTTP layer of the money overview (feature 38). Registered under the
 * `/api/overview` prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/overview
 *
 * One read-only endpoint and nothing else: no POST, no PATCH, no DELETE. It
 * answers "how much money do I have, where is it, and what did I save this
 * month" by reusing the balance of feature 31 and the totals of feature 36 —
 * it owns no calculation. Investments stay out on purpose: they get their own
 * view (feature 39).
 */
export interface OverviewRoutesOptions {
  /**
   * Bank → deposit matcher registry (feature 57), the same one
   * `GET /api/movements` gets from `src/app.ts`: both totals follow one rule.
   */
  depositMaturityMatchers?: DepositMaturityMatcherRegistry
}

export default async function overviewRoutes(
  fastify: FastifyInstance,
  options: OverviewRoutesOptions = {},
) {
  const db = overviewDb(fastify)
  const depositMaturityMatchers = options.depositMaturityMatchers ?? []

  fastify.get<{ Querystring: OverviewQuery }>(
    '/',
    { schema: getOverviewSchema },
    async (request) => {
      return getOverview(db, request.query, depositMaturityMatchers)
    },
  )
}
