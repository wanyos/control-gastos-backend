import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { detectPending, processPending } from './ingestion.service.js'

export interface IngestionRoutesOptions {
  /**
   * Base directory for the local copies of downloaded files. Injectable so tests
   * can point it at a temporary directory. Defaults to `var/drive-read/` under the
   * process working directory (gitignored, see `.gitignore`).
   */
  dumpBaseDir?: string
}

/**
 * HTTP layer for the Drive ingestion (first read, no parsing, no DB):
 *   GET  /api/ingestion/pending  -> non-destructive detection of pending files
 *   POST /api/ingestion/process  -> download as-is + local copy, WITHOUT moving
 *
 * Registered under the `/api/ingestion` prefix (see `src/app.ts`). No new
 * authentication (consistent with the current contract).
 *
 * Moving a file to `procesados/` belongs to the importer (`POST /api/import`),
 * because a file is only processed once its movements are stored (feature 12).
 */
export default async function ingestionRoutes(
  fastify: FastifyInstance,
  options: IngestionRoutesOptions = {},
) {
  const rootFolderId = fastify.config.driveRootFolderId
  const dumpBaseDir = options.dumpBaseDir ?? join(process.cwd(), 'var', 'drive-read')

  fastify.get('/pending', async () => {
    return detectPending(fastify.drive, rootFolderId)
  })

  fastify.post('/process', async () => {
    return processPending(fastify.drive, rootFolderId, dumpBaseDir)
  })
}
