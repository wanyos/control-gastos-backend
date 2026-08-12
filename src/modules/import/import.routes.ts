import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { importDb, importPending } from './import.service.js'
import type { BankParserRegistry } from './import.types.js'

export interface ImportRoutesOptions {
  /**
   * Bank → parser registry, injected from the composition root (`src/app.ts`)
   * so this module knows no bank at all. Empty means every file is skipped.
   */
  parsers?: BankParserRegistry
  /**
   * Base directory for the raw copy of each downloaded file. Injectable so tests
   * can point it at a temporary directory. Defaults to `var/drive-read/` under
   * the process working directory (gitignored, see `.gitignore`), the same dump
   * the ingestion endpoint writes.
   */
  rawCopyBaseDir?: string
}

/**
 * HTTP layer of the importer:
 *   POST /api/import  -> download + parse + store + move to procesados/
 *
 * Registered under the `/api/import` prefix (see `src/app.ts`). No request body
 * and no new authentication (consistent with the current contract). A per-file
 * failure does NOT change the status code: it travels inside the 200 report.
 */
export default async function importRoutes(
  fastify: FastifyInstance,
  options: ImportRoutesOptions = {},
) {
  const prisma = importDb(fastify)
  const rootFolderId = fastify.config.driveRootFolderId
  const rawCopyBaseDir = options.rawCopyBaseDir ?? join(process.cwd(), 'var', 'drive-read')
  const parsers = options.parsers ?? []

  fastify.post('/', async () => {
    return importPending({
      client: fastify.drive,
      prisma,
      rootFolderId,
      rawCopyBaseDir,
      parsers,
    })
  })
}
