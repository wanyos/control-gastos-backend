import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import bankinterRoutes from './bankinter.routes.js'
import { bankinterSampleFixture, buildStatementXlsx } from './bankinter.fixture.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'bankinter-routes-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'bankinter-routes-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.register(errorHandlerPlugin)
  app.register(bankinterRoutes, {
    prefix: '/api/parser',
    sourceBaseDir: sourceDir,
    dumpBaseDir: dumpDir,
  })
  await app.ready()
  return app
}

describe('POST /api/parser/bankinter', () => {
  it('returns 200 with the parse summary and writes the JSON dump', async () => {
    const dir = join(sourceDir, 'bankinter', '2026')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'movs.xlsx'), await buildStatementXlsx(bankinterSampleFixture()))
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/bankinter' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      parsedCount: 1,
      failedCount: 0,
      parsed: [
        {
          bank: 'bankinter',
          year: '2026',
          file: 'movs.xlsx',
          accountIban: 'ES9820385778983000760236',
          movements: 5,
          unparsedRows: 1,
          dumpPath: 'bankinter/2026/movs.xlsx.json',
        },
      ],
    })
    await expect(
      readFile(join(dumpDir, 'bankinter', '2026', 'movs.xlsx.json'), 'utf8'),
    ).resolves.toContain('ES9820385778983000760236')

    await app.close()
  })

  it('returns 200 with an empty summary when there are no local copies', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/bankinter' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ parsedCount: 0, failedCount: 0, parsed: [], failed: [] })

    await app.close()
  })
})
