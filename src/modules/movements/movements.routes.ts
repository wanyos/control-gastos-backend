import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  listMovementsSchema,
  updateMovementBodyProperties,
  updateMovementSchema,
} from './movements.schema.js'
import { listMovements, movementsDb, updateMovement } from './movements.service.js'
import type { MovementIdParams, MovementListQuery, UpdateMovementBody } from './movements.types.js'

/**
 * HTTP layer for movements. Registered under the `/api/movements` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET   /api/movements
 *   PATCH /api/movements/:id
 *
 * The bank fact is read-only: a movement that does not come from the bank must
 * not exist, so there is still no create nor delete endpoint (and no transfer
 * endpoint: both legs of a transfer already arrive in their statements). The
 * importer writes the table (see specs/08-data-model/design.md §5 and §2.1).
 * What CAN be edited (feature 37) are the two annotation fields of an existing
 * movement — `categoryId` and `status` — and nothing else: the PATCH schema
 * rejects any other property.
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

  fastify.patch<{ Params: MovementIdParams; Body: UpdateMovementBody }>(
    '/:id',
    {
      schema: updateMovementSchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts):
      // a PATCH carrying `amount` must be a 400, never a 200 that ignored it.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, updateMovementBodyProperties)
      },
    },
    async (request) => {
      return updateMovement(db, request.params.id, request.body)
    },
  )
}
