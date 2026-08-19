import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { normalizeBankName } from '../../lib/drive-structure.js'
import type { BankParserAdapter } from '../import/import.types.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import { buildOpenbankStatement, documentationIban, writeLocalCopy } from './openbank.fixture.js'
import openbankRoutes from './openbank.routes.js'
import { parseOpenbankStatement } from './openbank.statement.parser.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'openbank-routes-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'openbank-routes-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.register(errorHandlerPlugin)
  app.register(openbankRoutes, {
    prefix: '/api/parser',
    sourceBaseDir: sourceDir,
    dumpBaseDir: dumpDir,
  })
  await app.ready()
  return app
}

describe('POST /api/parser/openbank (R15)', () => {
  it('returns 200 with the parse summary', async () => {
    await writeLocalCopy(sourceDir, '2026', 'movimientos.xls', buildOpenbankStatement())
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/openbank' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      parsedCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'openbank',
          year: '2026',
          file: 'movimientos.xls',
          accountIban: documentationIban,
          accountBalance: 1234.56,
          movements: 8,
          unparsedRows: 2,
          dumpPath: 'openbank/2026/movimientos.xls.json',
        },
      ],
      failed: [],
      ignored: [],
    })

    await app.close()
  })

  it('never exposes an absolute machine path in the body', async () => {
    await writeLocalCopy(sourceDir, '2026', 'movimientos.xls', buildOpenbankStatement())
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/openbank' })

    expect(response.body).not.toContain(dumpDir)
    expect(response.body).not.toContain(sourceDir)
    expect(response.body).not.toContain(process.cwd())

    await app.close()
  })

  it('still returns 200 when a file fails, with the failure isolated', async () => {
    await writeLocalCopy(sourceDir, '2026', 'bueno.xls', buildOpenbankStatement())
    await writeLocalCopy(sourceDir, '2026', 'roto.xls', Buffer.from('<html>nada</html>', 'latin1'))
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/openbank' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ parsedCount: 1, failedCount: 1 })

    await app.close()
  })

  it('returns 200 with an empty summary when there are no local copies', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/openbank' })

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

  it('is in the parser registry of the composition root, with the .xls extension', () => {
    // This single line is what makes `POST /api/import` stop reporting the files
    // of this bank as `skipped`; `src/app.ts` is the only file of `src/` allowed
    // to name a bank (ADR-015).
    const appSource = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')

    expect(appSource).toContain(
      "{ bank: 'openbank', extensions: ['.xls'], parse: parseOpenbankStatement }",
    )
  })

  it('leaves the account to the existing importer path when the IBAN is not written', () => {
    // No new path is written here: with no `<!-- iban;… -->` comment the
    // statement simply comes out with `accountIban: null`, which is the case the
    // importer already resolves (the single registered account of the bank, or
    // MISSING_ACCOUNT_DATA when there are none or several).
    const result = parseOpenbankStatement(buildOpenbankStatement({ iban: null }))

    expect(result.accountIban).toBeNull()
    expect(result.movements.length).toBeGreaterThan(0)
  })

  it('stops POST /api/import reporting this bank .xls as skipped', () => {
    // The importer decides with exactly two things (`selectAdapter`): the slug
    // of the Drive FOLDER and the extension of the file. Both are checked here,
    // against the very adapter the composition root registers. The importer's
    // own suite cannot do it: it is forbidden from naming a bank (ADR-015, and
    // a guardian of architecture.test.ts).
    const adapter: BankParserAdapter = {
      bank: 'openbank',
      extensions: ['.xls'],
      parse: parseOpenbankStatement,
    }

    expect(normalizeBankName('Openbank')).toBe(adapter.bank)
    expect(adapter.extensions).toContain(extname('movimientos-2026-08-17.xls').toLowerCase())
    expect(adapter.parse(buildOpenbankStatement())).toMatchObject({ bank: 'openbank' })
  })

  it('is registered in the real app under the /api/parser prefix', async () => {
    // The route is only asserted as registered, never invoked here: the real app
    // would read `var/drive-read/` of this machine, which holds real bank data.
    const app = buildApp()
    await app.ready()

    expect(app.hasRoute({ method: 'POST', url: '/api/parser/openbank' })).toBe(true)

    await app.close()
  })
})
