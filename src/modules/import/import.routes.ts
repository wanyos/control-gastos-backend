import type { FastifyInstance } from 'fastify'

import { ConflictError } from '../../errors/app-error.js'
import type { ProductParserRegistry } from '../investments/investments.types.js'
import { importDb, importPending } from './import.service.js'
import type { BankParserRegistry } from './import.types.js'
import importWarningsRoutes from './import.warnings.routes.js'

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
}

/**
 * HTTP layer of the importer:
 *   POST /api/import  -> download + parse + store + move to procesados/
 *
 * The three routes of what an import leaves unresolved (features 48 and 54) hang
 * from this same prefix and live in their own plugin, registered at the bottom:
 *   GET   /api/import/warnings
 *   PATCH /api/import/warnings/balance-mismatches/:id
 *   PATCH /api/import/warnings/unparsed-rows/:id
 *
 * Registered under the `/api/import` prefix (see `src/app.ts`). No new
 * authentication (consistent with the current contract), and a per-file failure
 * does NOT change the status code: it travels inside the 200 report.
 *
 * It is the only way in since feature 52: a file that already reached
 * `procesados/` is imported again by putting it back in its year folder.
 */
export default async function importRoutes(
  fastify: FastifyInstance,
  options: ImportRoutesOptions = {},
) {
  const prisma = importDb(fastify)
  const rootFolderId = fastify.config.driveRootFolderId
  const parsers = options.parsers ?? []
  const productParsers = options.productParsers ?? []

  // One import at a time (2026-10-16). Two runs at once are not protected
  // below this line: both could try to create the same account (unique IBAN)
  // and both would move the same file to `procesados/`. The second call gets a
  // 409 and nothing of its own starts; the flag lives in this closure, so it
  // belongs to this server process and resets with it.
  let importInProgress = false

  fastify.post('/', async () => {
    if (importInProgress) {
      throw new ConflictError('An import is already running; wait for it to finish')
    }
    importInProgress = true
    try {
      return await importPending({
        client: fastify.drive,
        prisma,
        rootFolderId,
        parsers,
        productParsers,
      })
    } finally {
      importInProgress = false
    }
  })

  // Reading and closing the warnings of past imports: no Drive, no parser and no
  // option of its own, so it takes none of the injections above (feature 48).
  await fastify.register(importWarningsRoutes)
}
