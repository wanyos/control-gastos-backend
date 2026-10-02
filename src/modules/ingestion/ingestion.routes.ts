import type { FastifyInstance } from 'fastify'

import { detectPending } from './ingestion.service.js'

/**
 * HTTP layer for the Drive ingestion (no download, no parsing, no DB):
 *   GET /api/ingestion/pending  -> non-destructive detection of pending files
 *
 * Registered under the `/api/ingestion` prefix (see `src/app.ts`). No new
 * authentication (consistent with the current contract).
 *
 * Downloading a file and moving it to `procesados/` belong to the importer
 * (`POST /api/import`), because a file is only processed once its movements are
 * stored (feature 12).
 */
export default async function ingestionRoutes(fastify: FastifyInstance) {
  const rootFolderId = fastify.config.driveRootFolderId

  fastify.get('/pending', async () => {
    return detectPending(fastify.drive, rootFolderId)
  })
}
