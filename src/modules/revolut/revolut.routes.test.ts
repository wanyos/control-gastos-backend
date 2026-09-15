import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bankParsers, buildApp } from '../../app.js'
import { normalizeBankName } from '../../lib/drive-structure.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import { buildRevolutCsv, revolutPreamble, writeLocalCopy } from './revolut.fixture.js'
import revolutRoutes from './revolut.routes.js'
import { parseRevolutStatement } from './revolut.statement.parser.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'revolut-routes-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'revolut-routes-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.register(errorHandlerPlugin)
  app.register(revolutRoutes, {
    prefix: '/api/parser',
    sourceBaseDir: sourceDir,
    dumpBaseDir: dumpDir,
  })
  await app.ready()
  return app
}

// C11: the endpoint exists, with the same shape as the other banks'.
describe('POST /api/parser/revolut (C11)', () => {
  it('returns 200 with the parse summary', async () => {
    await writeLocalCopy(
      sourceDir,
      '2025',
      'extracto.csv',
      buildRevolutCsv({ preamble: revolutPreamble() }),
    )
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/revolut' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      parsedCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'revolut',
          year: '2025',
          file: 'extracto.csv',
          accountIban: 'ES9121000418450200051332',
          accountBalance: null,
          movements: 6,
          unparsedRows: 3,
          dumpPath: 'revolut/2025/extracto.csv.json',
        },
      ],
      failed: [],
      ignored: [],
    })

    await app.close()
  })

  it('never exposes an absolute machine path in the body', async () => {
    await writeLocalCopy(sourceDir, '2025', 'extracto.csv', buildRevolutCsv())
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/revolut' })

    expect(response.body).not.toContain(dumpDir)
    expect(response.body).not.toContain(sourceDir)
    expect(response.body).not.toContain(process.cwd())

    await app.close()
  })

  it('still returns 200 when a file fails, with the failure isolated', async () => {
    await writeLocalCopy(sourceDir, '2025', 'bueno.csv', buildRevolutCsv())
    await writeLocalCopy(sourceDir, '2025', 'roto.csv', Buffer.from('esto,no,es,un,extracto\n'))
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/revolut' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ parsedCount: 1, failedCount: 1 })

    await app.close()
  })

  it('is in the parser registry of the composition root, with the .csv extension', () => {
    // This single line is what makes `POST /api/import` stop reporting the files
    // of this bank as `skipped`; `src/app.ts` is the only file of `src/` allowed
    // to name a bank (ADR-015).
    const appSource = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')

    expect(appSource).toContain(
      "{ bank: 'revolut', extensions: ['.csv'], parse: parseRevolutStatement }",
    )
  })

  it('is chosen by the importer for a .csv in the revolut folder, with this very parser', () => {
    // The importer decides with the slug of the Drive FOLDER and the extension.
    // Checked against the REAL registry the composition root exports.
    const adapter = bankParsers.find((candidate) => candidate.bank === normalizeBankName('Revolut'))

    expect(adapter).toBeDefined()
    expect(adapter?.extensions).toContain(extname('revolut-2025.CSV').toLowerCase())
    expect(adapter?.parse).toBe(parseRevolutStatement)
  })

  it('is registered in the real app under the /api/parser prefix', async () => {
    // Only asserted as registered, never invoked: the real app would read
    // `var/drive-read/` of this machine, which holds real bank data.
    const app = buildApp()
    await app.ready()

    expect(app.hasRoute({ method: 'POST', url: '/api/parser/revolut' })).toBe(true)

    await app.close()
  })
})
