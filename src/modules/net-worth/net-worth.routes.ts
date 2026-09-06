import type { FastifyInstance } from 'fastify'

import { getNetWorthSchema } from './net-worth.schema.js'
import { getNetWorth, netWorthDb } from './net-worth.service.js'

/**
 * HTTP layer of the net worth (feature 42). Registered under the
 * `/api/net-worth` prefix (see `src/app.ts`), so it resolves to:
 *   GET /api/net-worth
 *
 * One read-only endpoint and nothing else: no POST, no PATCH, no DELETE
 * (R12). No parameters either — it answers only for today, and any unknown
 * querystring parameter is discarded by the schema before the handler (R11).
 * `GET /api/overview` and `GET /api/investments/overview` stay exactly as
 * they were: this is the third view, on top of the other two, not a
 * replacement (R13).
 */
export default async function netWorthRoutes(fastify: FastifyInstance) {
  const db = netWorthDb(fastify)

  fastify.get('/', { schema: getNetWorthSchema }, async () => {
    return getNetWorth(db)
  })
}
