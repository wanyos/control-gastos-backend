import type { FastifyInstance } from 'fastify'

import { todayInMadridAsDate } from '../../lib/local-date.js'
import { getLastImportsSchema } from './last-imports.schema.js'
import { getLastImports, lastImportsDb } from './last-imports.service.js'

/**
 * HTTP layer of the last imports (feature 69). Registered under the
 * `/api/last-imports` prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/last-imports
 *
 * One read-only endpoint, no parameters: it answers for today in Madrid. It
 * writes nothing (R15); what it reads is written by the importer.
 */
export default async function lastImportsRoutes(fastify: FastifyInstance) {
  const db = lastImportsDb(fastify)

  fastify.get('/', { schema: getLastImportsSchema }, async () => {
    return getLastImports(db, todayInMadridAsDate())
  })
}
