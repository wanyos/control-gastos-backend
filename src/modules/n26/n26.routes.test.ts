import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import { buildStatementCsv, n26Preamble, writeLocalCopy } from './n26.fixture.js'
import n26Routes from './n26.routes.js'
import { parseN26Statement } from './n26.statement.parser.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'n26-routes-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'n26-routes-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.register(errorHandlerPlugin)
  app.register(n26Routes, { prefix: '/api/parser', sourceBaseDir: sourceDir, dumpBaseDir: dumpDir })
  await app.ready()
  return app
}

// Criterion 12: the endpoint exists, with the same shape as the other banks'.
describe('POST /api/parser/n26 (criterion 12)', () => {
  it('returns 200 with the parse summary', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'extracto.csv',
      buildStatementCsv({ preamble: n26Preamble() }),
    )
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/n26' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      parsedCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'n26',
          year: '2026',
          file: 'extracto.csv',
          accountIban: 'ES9121000418450200051332',
          accountBalance: 1234.56,
          movements: 9,
          unparsedRows: 2,
          dumpPath: 'n26/2026/extracto.csv.json',
        },
      ],
      failed: [],
      ignored: [],
    })

    await app.close()
  })

  it('never exposes an absolute machine path in the body', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/n26' })

    expect(response.body).not.toContain(dumpDir)
    expect(response.body).not.toContain(sourceDir)
    expect(response.body).not.toContain(process.cwd())

    await app.close()
  })

  it('still returns 200 when a file fails, with the failure isolated', async () => {
    await writeLocalCopy(sourceDir, '2026', 'bueno.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'roto.csv', Buffer.from('esto,no,es,un,extracto\n'))
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/n26' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ parsedCount: 1, failedCount: 1 })

    await app.close()
  })

  it('returns 200 with an empty summary when there are no local copies', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/n26' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      parsedCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      statements: [],
      failed: [],
      ignored: [],
    })

    await app.close()
  })

  it('is in the parser registry of the composition root, with the .csv extension (C12)', () => {
    // This single line is what makes `POST /api/import` stop reporting the files
    // of this bank as `skipped`; `src/app.ts` is the only file of `src/` allowed
    // to name a bank (ADR-015).
    const appSource = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')

    expect(appSource).toContain("{ bank: 'n26', extensions: ['.csv'], parse: parseN26Statement }")
  })

  it('leaves the account to the existing importer path when the iban is not written (C8)', () => {
    // No new path is written here: with no `iban;` line the statement simply
    // comes out with `accountIban: null`, which is the case the importer already
    // resolves (the single registered account of the bank, or
    // MISSING_ACCOUNT_DATA when there are none or several).
    const result = parseN26Statement(buildStatementCsv())

    expect(result.accountIban).toBeNull()
    expect(result.movements.length).toBeGreaterThan(0)
  })

  it('is registered in the real app under the /api/parser prefix', async () => {
    // The route is only asserted as registered, never invoked here: the real app
    // would read `var/drive-read/` of this machine, which holds real bank data.
    const app = buildApp()
    await app.ready()

    expect(app.hasRoute({ method: 'POST', url: '/api/parser/n26' })).toBe(true)

    await app.close()
  })
})
