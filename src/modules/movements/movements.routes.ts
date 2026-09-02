import type { FastifyInstance } from 'fastify'

import { listMovementsSchema } from './movements.schema.js'
import { listMovements, movementsDb } from './movements.service.js'
import type { MovementListQuery } from './movements.types.js'

/**
 * HTTP layer for movements. Registered under the `/api/movements` prefix
 * (see `src/app.ts`), so the only route resolves to:
 *   GET /api/movements
 *
 * READ-ONLY on purpose: a movement that does not come from the bank must not
 * exist, so there is no create nor delete endpoint (and no transfer endpoint:
 * both legs of a transfer already arrive in their statements). The importer
 * writes the table (see specs/08-data-model/design.md §5 and §2.1).
 *
 * Since feature 36 the listing takes combinable filters (account, date range,
 * type, status), is always paginated, and ships the totals of the filter.
 */
export default async function movementsRoutes(fastify: FastifyInstance) {
  const db = movementsDb(fastify)

  fastify.get<{ Querystring: MovementListQuery }>(
    '/',
    { schema: listMovementsSchema },
    async (request) => {
      return listMovements(db, request.query)
    },
  )
}
