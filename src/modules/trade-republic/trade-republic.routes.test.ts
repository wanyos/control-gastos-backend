import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bankParsers, buildApp, productParsers } from '../../app.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import {
  buildAccountJson,
  buildSavingsAccount,
  buildSavingsAccountOffByEuros,
  writeLocalCopy,
} from './trade-republic.fixture.js'
import tradeRepublicRoutes from './trade-republic.routes.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'trade-republic-routes-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'trade-republic-routes-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.register(errorHandlerPlugin)
  app.register(tradeRepublicRoutes, {
    prefix: '/api/parser',
    sourceBaseDir: sourceDir,
    dumpBaseDir: dumpDir,
  })
  await app.ready()
  return app
}

describe('POST /api/parser/trade-republic (R16)', () => {
  it('returns 200 with the parse summary', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'cuenta-remunerada-2026-08-31.json',
      buildAccountJson(buildSavingsAccount()),
    )
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/trade-republic' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      productCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      products: [
        {
          bank: 'trade-republic',
          year: '2026',
          file: 'cuenta-remunerada-2026-08-31.json',
          type: 'savings_account',
          name: 'Cuenta Sintetica Remunerada',
          date: '2026-08-31',
          dumpPath: 'trade-republic/2026/products.json',
        },
      ],
      failed: [],
      ignored: [],
    })

    await app.close()
  })

  it('still returns 200 when a file inside failed, with the failure in the body', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'rota.json',
      buildAccountJson(buildSavingsAccountOffByEuros()),
    )
    await writeLocalCopy(sourceDir, '2026', 'extracto.pdf', 'no se abre nunca')
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/trade-republic' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      productCount: 0,
      failedCount: 1,
      ignoredCount: 1,
    })
    expect(response.json().failed[0].reason).toContain('los importes no cuadran')

    await app.close()
  })

  it('never exposes an absolute machine path in the body', async () => {
    await writeLocalCopy(sourceDir, '2026', 'cuenta.json', buildAccountJson(buildSavingsAccount()))
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: '/api/parser/trade-republic' })

    expect(response.body).not.toContain(dumpDir)
    expect(response.body).not.toContain(sourceDir)

    await app.close()
  })

  it('is registered in the real app, under the same prefix as the other banks', async () => {
    const app = buildApp()
    await app.ready()

    // Only the routing is asserted here: the real app points at `var/`, which
    // does not exist on a fresh machine, and an empty walk is a 200 with zeros.
    const response = await app.inject({ method: 'POST', url: '/api/parser/trade-republic' })

    expect(response.statusCode).toBe(200)

    await app.close()
  })

  it('is NOT in the STATEMENT registry: it has no statement to import (R16)', () => {
    expect(bankParsers.map((adapter) => adapter.bank)).not.toContain('trade-republic')
    // And the registry is the real one, not an empty list that would pass by
    // accident: the other banks are in it.
    expect(bankParsers.map((adapter) => adapter.bank)).toContain('bankinter')
  })

  it('IS in the PRODUCT registry, reading only its .json (feature 26, R10)', () => {
    // Feature 26 gave the importer a second registry. The `.pdf` of this bank
    // is still read by nobody: only the hand-written `.json` enters.
    expect(productParsers.map((adapter) => adapter.bank)).toEqual(['trade-republic'])
    expect(productParsers[0]?.extensions).toEqual(['.json'])
  })
})
