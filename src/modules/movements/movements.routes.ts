import type { FastifyInstance } from 'fastify'

import { listMovements, movementsDb, serializeMovement } from './movements.service.js'

/**
 * HTTP layer for movements. Registered under the `/api/movements` prefix
 * (see `src/app.ts`), so the only route resolves to:
 *   GET /api/movements
 *
 * READ-ONLY on purpose: a movement that does not come from the bank must not
 * exist, so there is no create nor delete endpoint (and no transfer endpoint:
 * both legs of a transfer already arrive in their statements). The importer
 * writes the table (see specs/data-model/design.md §5 and §2.1).
 */
export default async function movementsRoutes(fastify: FastifyInstance) {
  const db = movementsDb(fastify)

  fastify.get('/', async () => {
    const movements = await listMovements(db)
    return movements.map(serializeMovement)
  })
}
