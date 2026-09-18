import type { FastifyInstance } from 'fastify'

import { ValidationError } from '../../errors/app-error.js'
import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  bulkUpdateMovementsBodyProperties,
  bulkUpdateMovementsSchema,
  bulkUpdateMovementsWritableProperties,
  listMovementsSchema,
  updateMovementBodyProperties,
  updateMovementSchema,
} from './movements.schema.js'
import {
  bulkUpdateMovements,
  listMovements,
  movementsDb,
  updateMovement,
} from './movements.service.js'
import type {
  BulkUpdateMovementsBody,
  MovementIdParams,
  MovementListQuery,
  UpdateMovementBody,
} from './movements.types.js'

/**
 * `ids` alone is a request that asks for nothing: `minProperties` cannot say it
 * because `ids` is always there, so the rule lives here (R12).
 */
function assertSomethingToWrite(body: unknown): void {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return

  const keys = Object.keys(body)
  if (!bulkUpdateMovementsWritableProperties.some((property) => keys.includes(property))) {
    throw new ValidationError(
      `Nothing to update: send at least one of ${bulkUpdateMovementsWritableProperties.join(', ')}`,
    )
  }
}

/**
 * HTTP layer for movements. Registered under the `/api/movements` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET   /api/movements
 *   PATCH /api/movements
 *   PATCH /api/movements/:id
 *
 * The bank fact is read-only: a movement that does not come from the bank must
 * not exist, so there is still no create nor delete endpoint — both legs of a
 * transfer already arrive in their statements; what F44 added under
 * `/api/transfers` writes only the LINK between two existing movements, never
 * a movement. The importer writes the table (see specs/08-data-model/design.md
 * §5 and §2.1).
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

  // Feature 47: the same two fields over a list of movements, all or nothing.
  // Registered before `/:id` only for readability — Fastify tells the two apart
  // by their path, not by their order.
  fastify.patch<{ Body: BulkUpdateMovementsBody }>(
    '/',
    {
      schema: bulkUpdateMovementsSchema,
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, bulkUpdateMovementsBodyProperties)
        assertSomethingToWrite(request.body)
      },
    },
    async (request) => {
      return bulkUpdateMovements(db, request.body)
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
