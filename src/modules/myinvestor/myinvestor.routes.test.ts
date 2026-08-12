import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import {
  buildProductDeposit,
  buildProductFund,
  buildProductJson,
  buildStatementCsv,
  writeLocalCopy,
} from './myinvestor.fixture.js'
import myinvestorRoutes from './myinvestor.routes.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'myinvestor-routes-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'myinvestor-routes-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.register(errorHandlerPlugin)
  app.register(myinvestorRoutes, {
    prefix: '/api/parser',
    sourceBaseDir: sourceDir,
    dumpBaseDir: dumpDir,
  })
  await app.ready()
  return app
}

describe('POST /api/parser/myinvestor', () => {
  it('returns 200 with the parse summary and writes the JSON dump (R51)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/myinvestor' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      parsedCount: 1,
      productCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'myinvestor',
          year: '2026',
          file: 'extracto.csv',
          accountIban: null,
          movements: 8,
          unparsedRows: 2,
          dumpPath: 'myinvestor/2026/extracto.csv.json',
        },
      ],
      products: [],
      failed: [],
      ignored: [],
    })
    await expect(
      readFile(join(dumpDir, 'myinvestor', '2026', 'extracto.csv.json'), 'utf8'),
    ).resolves.toContain('myinvestor')

    await app.close()
  })

  it('never exposes an absolute machine path in the body (R54)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/myinvestor' })

    expect(response.body).not.toContain(dumpDir)
    expect(response.body).not.toContain(sourceDir)
    expect(response.body).not.toContain(process.cwd())
    expect(response.json().statements[0].dumpPath).toBe('myinvestor/2026/extracto.csv.json')

    await app.close()
  })

  it('still returns 200 when a file fails, with the failure isolated (R57)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'bueno.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'roto.csv', Buffer.from('esto;no;es;un;extracto\n'))
    await writeLocalCopy(sourceDir, '2026', 'notas.txt', 'ruido')
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/myinvestor' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      parsedCount: 1,
      failedCount: 1,
      ignoredCount: 1,
      failed: [{ bank: 'myinvestor', year: '2026', file: 'roto.csv' }],
    })

    await app.close()
  })

  it('returns 200 with an empty summary when there are no local copies (R56)', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/myinvestor' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      parsedCount: 0,
      productCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      statements: [],
      products: [],
      failed: [],
      ignored: [],
    })

    await app.close()
  })

  it('returns the products of the same bank in the same call (R76)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'fondo.json', buildProductJson(buildProductFund()))
    await writeLocalCopy(
      sourceDir,
      '2026',
      'deposito.json',
      buildProductJson(buildProductDeposit()),
    )
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/myinvestor' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      parsedCount: 1,
      productCount: 2,
      failedCount: 0,
      ignoredCount: 0,
      products: [
        {
          bank: 'myinvestor',
          year: '2026',
          file: 'deposito.json',
          type: 'deposit',
          name: 'Deposito Sintetico 3 meses',
          date: '2026-08-31',
          dumpPath: 'myinvestor/2026/products.json',
        },
        { file: 'fondo.json', type: 'fund', dumpPath: 'myinvestor/2026/products.json' },
      ],
    })
    // The dump path stays relative: no absolute machine path in the body.
    expect(response.body).not.toContain(dumpDir)
    await expect(
      readFile(join(dumpDir, 'myinvestor', '2026', 'products.json'), 'utf8'),
    ).resolves.toContain('Fondo Sintetico Global')

    await app.close()
  })

  it('is registered in the real app under the /api/parser prefix', async () => {
    // The route is only asserted as registered, never invoked here: the real app
    // would read `var/drive-read/` of this machine, which holds real bank data.
    const app = buildApp()
    await app.ready()

    expect(app.hasRoute({ method: 'POST', url: '/api/parser/myinvestor' })).toBe(true)

    await app.close()
  })
})
