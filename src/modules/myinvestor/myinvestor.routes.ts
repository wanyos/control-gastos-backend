import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { parseLocalMyinvestorCopies } from './myinvestor.service.js'

export interface MyinvestorRoutesOptions {
  /**
   * Where the drive-read feature dropped the local copies. Injectable so tests
   * can point it at a temp dir. Defaults to `var/drive-read/` under the process
   * working directory.
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
 * HTTP layer for the MyInvestor parser (parse + model only; no DB, no Drive move):
 *   POST /api/parser/myinvestor -> parse the local statement copies and dump JSON
 *
 * Registered under the `/api/parser` prefix (see `src/app.ts`). Read-only: it
 * never persists to a database nor moves anything in Drive. A per-file failure
 * does not change the status code: the response is 200 with the failure inside.
 */
export default async function myinvestorRoutes(
  fastify: FastifyInstance,
  options: MyinvestorRoutesOptions = {},
) {
  const sourceBaseDir = options.sourceBaseDir ?? join(process.cwd(), 'var', 'drive-read')
  const dumpBaseDir = options.dumpBaseDir ?? join(process.cwd(), 'var', 'parsed')

  fastify.post('/myinvestor', async () => {
    return parseLocalMyinvestorCopies(sourceBaseDir, dumpBaseDir)
  })
}
