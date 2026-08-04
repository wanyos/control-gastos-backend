import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { detectPending, processPending } from './ingesta.service.js'

export interface IngestaRoutesOptions {
  /**
   * Base directory for the local copies of processed files. Injectable so tests
   * can point it at a temporary directory. Defaults to `var/drive-read/` under the
   * process working directory (gitignored, see `.gitignore`).
   */
  dumpBaseDir?: string
}

/**
 * HTTP layer for the Drive ingesta (first read, no parsing, no DB):
 *   GET  /api/ingesta/pending  -> non-destructive detection of pending files
 *   POST /api/ingesta/process  -> download as-is + local copy + move to procesados
 *
 * Registered under the `/api/ingesta` prefix (see `src/app.ts`). No new
 * authentication (consistent with the current contract).
 */
export default async function ingestaRoutes(
  fastify: FastifyInstance,
  options: IngestaRoutesOptions = {},
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
