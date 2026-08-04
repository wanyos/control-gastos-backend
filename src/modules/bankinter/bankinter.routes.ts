import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { parseLocalBankinterCopies } from './bankinter.service.js'

export interface BankinterRoutesOptions {
  /**
   * Where the drive-read feature dropped the local `.xlsx` copies. Injectable so
   * tests can point it at a temp dir. Defaults to `var/drive-read/` under the
   * process working directory.
   */
  sourceBaseDir?: string
  /**
   * Base dir for the JSON dumps of the parse result. Injectable for tests.
   * Defaults to `var/parsed/` under the process working directory (gitignored,
   * see `.gitignore`: no real bank data is ever versioned).
   */
  dumpBaseDir?: string
}

/**
 * HTTP layer for the Bankinter parser (parse + model only; no DB, no Drive move):
 *   POST /api/parser/bankinter -> parse the local `.xlsx` copies and dump JSON
 *
 * Registered under the `/api/parser` prefix (see `src/app.ts`). Read-only: it
 * never persists to a database nor moves anything in Drive. No new auth.
 */
export default async function bankinterRoutes(
  fastify: FastifyInstance,
  options: BankinterRoutesOptions = {},
) {
  const sourceBaseDir = options.sourceBaseDir ?? join(process.cwd(), 'var', 'drive-read')
  const dumpBaseDir = options.dumpBaseDir ?? join(process.cwd(), 'var', 'parsed')

  fastify.post('/bankinter', async () => {
    return parseLocalBankinterCopies(sourceBaseDir, dumpBaseDir)
  })
}
