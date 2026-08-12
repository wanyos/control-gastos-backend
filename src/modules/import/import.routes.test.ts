import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadConfig } from '../../config/env.js'
import type { AppDriveClient } from '../../lib/drive.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import prismaPlugin from '../../plugins/prisma.js'
import movementsRoutes from '../movements/movements.routes.js'
import importRoutes from './import.routes.js'
import type { ImportRunResult } from './import.types.js'

const folderMime = 'application/vnd.google-apps.folder'
const bank = `zz-import-routes-${Date.now()}`
const iban = `ES${Date.now()}${Math.floor(Math.random() * 1_000_000)}`

/** One bank folder, one year, one pending file, with its `procesados/` present. */
function driveDouble() {
  const list = vi.fn(async ({ q }: { q: string }) => {
    const parent = (q.match(/'([^']+)' in parents/) ?? [])[1] ?? ''
    if (q.includes(`mimeType != '${folderMime}'`)) {
      return {
        data: {
          files: parent === 'y-2026' ? [{ id: 'f1', name: 'movs.csv', mimeType: 'text/csv' }] : [],
        },
      }
    }
    if (q.includes("name = 'procesados'")) {
      return {
        data: {
          files:
            parent === 'y-2026'
              ? [{ id: 'proc-2026', name: 'procesados', createdTime: '2020-01-01T00:00:00Z' }]
              : [],
        },
      }
    }
    const folders: Record<string, Array<{ id: string; name: string }>> = {
      root: [{ id: 'b-bank', name: bank }],
      'b-bank': [{ id: 'y-2026', name: '2026' }],
    }
    return { data: { files: folders[parent] ?? [] } }
  })
  const get = vi.fn(async () => ({ data: Buffer.from('raw-bytes') }))
  const update = vi.fn(async () => ({ data: {} }))
  const create = vi.fn(async () => ({ data: { id: 'created' } }))
  return { client: { files: { list, get, update, create } } as unknown as AppDriveClient, update }
}

/** Two movements of the same day, the second one the most recent of that day. */
function statement(): ParsedStatement {
  return {
    bank,
    accountIban: iban,
    movements: [
      {
        bookingDate: '2026-07-24',
        valueDate: '2026-07-24',
        description: 'OLDEST OF THE DAY',
        amount: -10,
        balance: null,
        currency: 'EUR',
        type: 'expense',
        daySequence: 1,
      },
      {
        bookingDate: '2026-07-31',
        valueDate: '2026-07-31',
        description: 'MOST RECENT',
        amount: 25.5,
        balance: 1000,
        currency: 'EUR',
        type: 'income',
        daySequence: 1,
      },
    ],
    unparsedRows: [{ row: 9, reason: 'importe no interpretable' }],
  }
}

async function buildTestApp(drive: AppDriveClient, rawCopyBaseDir: string) {
  // buildApp() decorates `drive` with the real client and a decoration cannot be
  // overridden, so the importer is exercised on a bare app with a double, over
  // the same real database.
  const app = Fastify()
  app.decorate('config', { ...loadConfig(), driveRootFolderId: 'root' })
  app.decorate('drive', drive)
  app.register(errorHandlerPlugin)
  app.register(prismaPlugin)
  app.register(movementsRoutes, { prefix: '/api/movements' })
  app.register(importRoutes, {
    prefix: '/api/import',
    rawCopyBaseDir,
    parsers: [{ bank, extensions: ['.csv'], parse: () => statement() }],
  })
  await app.ready()
  return app
}

let rawCopyBaseDir: string
let app: FastifyInstance

beforeEach(async () => {
  rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-routes-'))
})

afterEach(async () => {
  const accounts = await app.prisma.account.findMany({ where: { bank } })
  const ids = accounts.map((account) => account.id)
  await app.prisma.movement.deleteMany({ where: { accountId: { in: ids } } })
  await app.prisma.account.deleteMany({ where: { id: { in: ids } } })
  await app.close()
  await rm(rawCopyBaseDir, { recursive: true, force: true })
})

describe('POST /api/import', () => {
  it('returns 200 with the report of every file (R2)', async () => {
    const { client, update } = driveDouble()
    app = await buildTestApp(client, rawCopyBaseDir)

    const response = await app.inject({ method: 'POST', url: '/api/import' })

    expect(response.statusCode).toBe(200)
    const body = response.json<ImportRunResult>()
    expect(body).toMatchObject({
      importedCount: 2,
      duplicateCount: 0,
      unparsedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    })
    expect(body.files).toHaveLength(1)
    expect(body.files[0]).toMatchObject({
      bank,
      year: '2026',
      fileId: 'f1',
      name: 'movs.csv',
      status: 'imported',
      account: { iban, bank, created: true, appliedDefaults: { alias: true, type: true } },
      imported: 2,
      duplicates: 0,
      unparsedCount: 1,
      unparsedRows: [{ row: 9, reason: 'importe no interpretable' }],
      movedToProcessed: true,
    })
    expect(update).toHaveBeenCalledOnce()
  })

  it('lists the imported movements most recent first (R3)', async () => {
    const { client } = driveDouble()
    app = await buildTestApp(client, rawCopyBaseDir)

    await app.inject({ method: 'POST', url: '/api/import' })
    const response = await app.inject({ method: 'GET', url: '/api/movements' })

    expect(response.statusCode).toBe(200)
    const own = response
      .json<Array<{ description: string; account: { iban: string } }>>()
      .filter((movement) => movement.account.iban === iban)

    expect(own.map((movement) => movement.description)).toEqual([
      'MOST RECENT',
      'OLDEST OF THE DAY',
    ])
  })

  it('exposes no way to create or delete a movement by API (R16)', async () => {
    const { client } = driveDouble()
    app = await buildTestApp(client, rawCopyBaseDir)

    const created = await app.inject({
      method: 'POST',
      url: '/api/movements',
      payload: { description: 'by hand', amount: 1 },
    })
    const deleted = await app.inject({ method: 'DELETE', url: '/api/movements/1' })

    expect(created.statusCode).toBe(404)
    expect(deleted.statusCode).toBe(404)
  })
})
