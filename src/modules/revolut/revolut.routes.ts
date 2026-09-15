import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { parseLocalRevolutCopies } from './revolut.service.js'

export interface RevolutRoutesOptions {
  /**
   * Where the drive-read feature dropped the local copies. Injectable so tests
   * can point it at a temp dir. Defaults to `var/drive-read/` under the process
   * working directory.
   */
  sourceBaseDir?: string
  /**
   * Base dir for the JSON dumps of the parse result. Injectable for tests.
   * Defaults to `var/parsed/` under the process working directory (gitignored).
   */
  dumpBaseDir?: string
}

/**
 * HTTP layer for the parser of this bank (parse + dump; no DB, no Drive move):
 *   POST /api/parser/revolut -> parse the local statement copies and dump JSON
 *
 * Registered under the `/api/parser` prefix (see `src/app.ts`). A per-file
 * failure does not change the status code: the response is 200 with the failure
 * inside.
 */
export default async function revolutRoutes(
  fastify: FastifyInstance,
  options: RevolutRoutesOptions = {},
) {
  const sourceBaseDir = options.sourceBaseDir ?? join(process.cwd(), 'var', 'drive-read')
  const dumpBaseDir = options.dumpBaseDir ?? join(process.cwd(), 'var', 'parsed')

  fastify.post('/revolut', async () => {
    return parseLocalRevolutCopies(sourceBaseDir, dumpBaseDir)
  })
}
