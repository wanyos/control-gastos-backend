import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import type { ProductParserRegistry } from '../investments/investments.types.js'
import { importLocalCopies, type LocalImportSelection } from './import.local.service.js'
import { localImportSchema } from './import.schema.js'
import { importDb, importPending } from './import.service.js'
import type { BankParserRegistry } from './import.types.js'

export interface ImportRoutesOptions {
  /**
   * Bank → parser registry, injected from the composition root (`src/app.ts`)
   * so this module knows no bank at all. Empty means every file is skipped.
   */
  parsers?: BankParserRegistry
  /**
   * Bank → PRODUCT parser registry (feature 26), injected from the same
   * composition root. Consulted only for a file no statement parser reads, so
   * an empty registry leaves the importer behaving exactly as before.
   */
  productParsers?: ProductParserRegistry
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
 *   POST /api/import        -> download + parse + store + move to procesados/
 *   POST /api/import/local  -> parse + store from the local copy, Drive untouched
 *
 * Registered under the `/api/import` prefix (see `src/app.ts`). No new
 * authentication (consistent with the current contract), and a per-file failure
 * does NOT change the status code: it travels inside the 200 report.
 *
 * The two ways in differ in ONE thing and it is deliberate: the monthly one
 * reads what is pending in Drive and moves what it stores; the local one reads
 * what is already on this machine and moves NOTHING, which is what makes a file
 * that already reached `procesados/` importable again (feature 25).
 */
export default async function importRoutes(
  fastify: FastifyInstance,
  options: ImportRoutesOptions = {},
) {
  const prisma = importDb(fastify)
  const rootFolderId = fastify.config.driveRootFolderId
  const rawCopyBaseDir = options.rawCopyBaseDir ?? join(process.cwd(), 'var', 'drive-read')
  const parsers = options.parsers ?? []
  const productParsers = options.productParsers ?? []

  fastify.post('/', async () => {
    return importPending({
      client: fastify.drive,
      prisma,
      rootFolderId,
      rawCopyBaseDir,
      parsers,
      productParsers,
    })
  })

  // Reimport from the local copy. Optional body `{ bank?, year?, name? }`: with
  // none of the three it walks every copy on disk. Asking for something that is
  // not there is a 404 LOCAL_COPY_NOT_FOUND, never an empty 200.
  fastify.post('/local', { schema: localImportSchema }, async (request) => {
    const selection = (request.body ?? {}) as LocalImportSelection
    return importLocalCopies({ prisma, rawCopyBaseDir, parsers, productParsers, selection })
  })
}
