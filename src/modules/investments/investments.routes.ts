import type { FastifyInstance } from 'fastify'

import { getInvestmentsOverviewSchema } from './investments.schema.js'
import { getInvestmentsOverview, investmentsDb } from './investments.service.js'
import type { InvestmentsOverviewQuery } from './investments.types.js'

/**
 * HTTP layer of the investments view (feature 39). Registered under the
 * `/api/investments` prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/investments/overview
 *
 * One read-only endpoint and nothing else: no POST, no PATCH, no DELETE (R15).
 * The data enters the system through the importer only (features 26 and 29);
 * this route is the first thing that READS it.
 */
export default async function investmentsRoutes(fastify: FastifyInstance) {
  const db = investmentsDb(fastify)

  fastify.get<{ Querystring: InvestmentsOverviewQuery }>(
    '/overview',
    { schema: getInvestmentsOverviewSchema },
    async (request) => {
      return getInvestmentsOverview(db, request.query)
    },
  )
}
