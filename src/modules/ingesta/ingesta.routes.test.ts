import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ingestaRoutes from './ingesta.routes.js'
import type { AppConfig } from '../../config/env.js'
import type { AppDriveClient } from '../../lib/drive.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'

const folderMime = 'application/vnd.google-apps.folder'

// One bank with one pending file and an existing procesados/ under the year.
function driveDouble() {
  const list = vi.fn(async ({ q }: { q: string }) => {
    const parent = (q.match(/'([^']+)' in parents/) ?? [])[1] ?? ''
    if (q.includes(`mimeType != '${folderMime}'`)) {
      return {
        data: {
          files:
            parent === 'y-2026'
              ? [{ id: 'f1', name: 'movs.xlsx', mimeType: 'application/vnd.ms-excel' }]
              : [],
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
      root: [{ id: 'b-bankinter', name: 'bankinter' }],
      'b-bankinter': [{ id: 'y-2026', name: '2026' }],
    }
    return { data: { files: folders[parent] ?? [] } }
  })
  const get = vi.fn(async () => ({ data: Buffer.from('raw-bytes') }))
  const update = vi.fn().mockResolvedValue({ data: {} })
  const create = vi.fn().mockResolvedValue({ data: { id: 'created' } })
  return { client: { files: { list, get, update, create } } as unknown as AppDriveClient, update }
}

async function buildTestApp(drive: AppDriveClient, dumpBaseDir: string): Promise<FastifyInstance> {
  // buildApp() decorates `drive` with the real client and decorate cannot be
  // overridden, so the ingesta routes are exercised on a bare app with a double.
  const app = Fastify()
  app.decorate('config', { driveRootFolderId: 'root' } as unknown as AppConfig)
  app.decorate('drive', drive)
  app.register(errorHandlerPlugin)
  app.register(ingestaRoutes, { prefix: '/api/ingesta', dumpBaseDir })
  await app.ready()
  return app
}

let dumpDir: string

beforeEach(async () => {
  dumpDir = await mkdtemp(join(tmpdir(), 'drive-read-routes-'))
})

afterEach(async () => {
  await rm(dumpDir, { recursive: true, force: true })
})

describe('GET /api/ingesta/pending', () => {
  it('returns 200 with the pending detection', async () => {
    const { client } = driveDouble()
    const app = await buildTestApp(client, dumpDir)

    const response = await app.inject({ method: 'GET', url: '/api/ingesta/pending' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      totalPending: 1,
      banks: [
        {
          bank: 'bankinter',
          years: [
            { year: '2026', pendingCount: 1, pending: [{ fileId: 'f1', name: 'movs.xlsx' }] },
          ],
        },
      ],
    })

    await app.close()
  })

  it('returns 503 DRIVE_CONNECTION_ERROR when Drive is unreachable', async () => {
    const list = vi.fn(async () => {
      throw new Error('network down')
    })
    const client = { files: { list } } as unknown as AppDriveClient
    const app = await buildTestApp(client, dumpDir)

    const response = await app.inject({ method: 'GET', url: '/api/ingesta/pending' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ statusCode: 503, code: 'DRIVE_CONNECTION_ERROR' })

    await app.close()
  })
})

describe('POST /api/ingesta/process', () => {
  it('returns 200, writes the local copy and moves the original', async () => {
    const { client, update } = driveDouble()
    const app = await buildTestApp(client, dumpDir)

    const response = await app.inject({ method: 'POST', url: '/api/ingesta/process' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ processedCount: 1, failedCount: 0 })

    const copy = await readFile(join(dumpDir, 'bankinter', '2026', 'movs.xlsx'))
    expect(copy.equals(Buffer.from('raw-bytes'))).toBe(true)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].fileId).toBe('f1')

    await app.close()
  })
})
