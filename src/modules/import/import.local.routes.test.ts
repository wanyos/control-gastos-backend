// Feature 25 `reimport-from-local-copy`, HTTP layer: how a reimport is asked
// for, and what comes back when the local copy is not there.
//
// 🔒 Everything is synthetic and lives in a temporary directory; the Drive
// double is here only to PROVE it is never called.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadConfig } from '../../config/env.js'
import type { AppDriveClient } from '../../lib/drive.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ParsedStatement } from '../../lib/parsed-statement.js'
import { createPrismaClient, type AppPrismaClient } from '../../lib/prisma.js'
import errorHandlerPlugin from '../../plugins/error-handler.js'
import prismaPlugin from '../../plugins/prisma.js'
import importRoutes from './import.routes.js'
import type { AttemptedLocalFileReport, LocalImportRunResult } from './import.types.js'

const bank = `zz-local-routes-${Date.now()}`
const iban = syntheticIban()

/** Two movements of the same day; the file itself is never read by the parser. */
function statement(): ParsedStatement {
  return {
    bank,
    accountIban: iban,
    accountBalance: null,
    movements: [
      {
        bookingDate: '2026-07-24',
        valueDate: '2026-07-24',
        description: 'LOCAL ROUTE FIRST',
        amount: -10,
        balance: null,
        currency: 'EUR',
        type: 'expense',
        daySequence: 1,
      },
      {
        bookingDate: '2026-07-31',
        valueDate: '2026-07-31',
        description: 'LOCAL ROUTE SECOND',
        amount: 25.5,
        balance: null,
        currency: 'EUR',
        type: 'income',
        daySequence: 1,
      },
    ],
    unparsedRows: [],
  }
}

/** Every Drive call is a spy that must never fire on this route. */
function driveSpy() {
  const list = vi.fn()
  const get = vi.fn()
  const update = vi.fn()
  const create = vi.fn()
  return {
    client: { files: { list, get, update, create } } as unknown as AppDriveClient,
    calls: { list, get, update, create },
  }
}

let rawCopyBaseDir: string
let app: FastifyInstance

async function buildTestApp(drive: AppDriveClient, prismaOverride?: AppPrismaClient) {
  const instance = Fastify()
  instance.decorate('config', { ...loadConfig(), driveRootFolderId: 'root' })
  instance.decorate('drive', drive)
  instance.register(errorHandlerPlugin)
  if (prismaOverride === undefined) {
    instance.register(prismaPlugin)
  } else {
    // A test that needs to fail ONE query decorates its own wrapped client.
    instance.decorate('prisma', prismaOverride)
    instance.addHook('onClose', async () => {
      await prismaOverride.$disconnect()
    })
  }
  instance.register(importRoutes, {
    prefix: '/api/import',
    rawCopyBaseDir,
    parsers: [{ bank, extensions: ['.csv'], parse: () => statement() }],
  })
  await instance.ready()
  return instance
}

beforeEach(async () => {
  rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-local-routes-'))
  await mkdir(join(rawCopyBaseDir, bank, '2026'), { recursive: true })
  await writeFile(join(rawCopyBaseDir, bank, '2026', 'movs.csv'), 'raw-bytes')
})

afterEach(async () => {
  const accounts = await app.prisma.account.findMany({ where: { bank } })
  const ids = accounts.map((account) => account.id)
  await app.prisma.movement.deleteMany({ where: { accountId: { in: ids } } })
  await app.prisma.account.deleteMany({ where: { id: { in: ids } } })
  await app.close()
  await rm(rawCopyBaseDir, { recursive: true, force: true })
})

describe('POST /api/import/local', () => {
  it('reimports the copy named by bank, year and name, without touching Drive (C1)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/local',
      payload: { bank, year: '2026', name: 'movs.csv' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<LocalImportRunResult>()
    expect(body).toMatchObject({
      importedCount: 2,
      duplicateCount: 0,
      unparsedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      // Feature 40: always present, with zeros and [] when nothing pairs.
      transfers: { pairsCreated: 0, ambiguousCount: 0, ambiguous: [] },
    })
    expect(body.files).toHaveLength(1)
    expect(body.files[0]).toMatchObject({
      bank,
      year: '2026',
      name: 'movs.csv',
      status: 'imported',
      account: { iban, bank, created: true },
      imported: 2,
      duplicates: 0,
      movedToProcessed: false,
    })
    // The report of a local file carries no Drive id, because there is none.
    expect(body.files[0]).not.toHaveProperty('fileId')
    // And not one Drive call was made: nothing was listed, moved or deleted.
    for (const call of Object.values(drive.calls)) {
      expect(call).not.toHaveBeenCalled()
    }
  })

  it('accepts a call with no body at all and walks every local copy (C5)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)

    const response = await app.inject({ method: 'POST', url: '/api/import/local' })

    expect(response.statusCode).toBe(200)
    expect(response.json<LocalImportRunResult>().files).toHaveLength(1)
  })

  it('does not duplicate anything when the same call is made twice (C2)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)
    const call = () =>
      app.inject({ method: 'POST', url: '/api/import/local', payload: { bank, name: 'movs.csv' } })

    const first = await call()
    const second = await call()

    expect(first.json<LocalImportRunResult>().importedCount).toBe(2)
    const body = second.json<LocalImportRunResult>()
    expect(body).toMatchObject({ importedCount: 0, duplicateCount: 2 })
    expect((body.files[0] as AttemptedLocalFileReport).status).toBe('imported')
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(2)
  })

  it('answers 404 LOCAL_COPY_NOT_FOUND naming the file that is not on disk (C5)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/local',
      payload: { bank, year: '2026', name: 'el-que-no-esta.csv' },
    })

    expect(response.statusCode).toBe(404)
    const body = response.json<{ code: string; message: string }>()
    expect(body.code).toBe('LOCAL_COPY_NOT_FOUND')
    // It says WHAT is missing, WHAT is there and WHERE copies live: never a
    // 200 that reads as "there was nothing to import".
    expect(body.message).toContain('el-que-no-esta.csv')
    expect(body.message).toContain('movs.csv')
    expect(body.message).toContain('var/drive-read/')
  })

  it('rejects a name that is a path, with 400 and no filesystem access (C5)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/local',
      payload: { bank, name: '../secrets.csv' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json<{ code: string }>().code).toBe('VALIDATION_ERROR')
  })

  it('pairs the imported leg with its stored mirror, and a reimport changes nothing (feature 40, R1, R8)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)
    const mirrorAccount = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Mirror account' },
    })
    const mirror = await app.prisma.movement.create({
      data: {
        accountId: mirrorAccount.id,
        type: 'income',
        amount: '10.00',
        description: 'TRANSFERENCIA RECIBIDA',
        bookingDate: new Date('2026-07-25T00:00:00.000Z'),
        valueDate: new Date('2026-07-25T00:00:00.000Z'),
        daySequence: 1,
        origin: 'imported',
      },
    })
    const call = () => app.inject({ method: 'POST', url: '/api/import/local' })

    const first = await call()

    expect(first.statusCode).toBe(200)
    expect(first.json<LocalImportRunResult>().transfers).toMatchObject({
      pairsCreated: 1,
      ambiguousCount: 0,
      ambiguous: [],
    })
    const legsAfterFirst = await app.prisma.movement.findMany({
      where: { OR: [{ id: mirror.id }, { description: 'LOCAL ROUTE FIRST' }] },
      orderBy: { id: 'asc' },
    })
    expect(legsAfterFirst).toHaveLength(2)
    expect(legsAfterFirst[0]?.transferId).toBeTruthy()
    expect(legsAfterFirst[0]?.transferId).toBe(legsAfterFirst[1]?.transferId)

    // Reimporting the same copy re-runs the detection and changes NOTHING:
    // the linked legs are no candidates anymore (R8).
    const second = await call()
    expect(second.json<LocalImportRunResult>().transfers).toMatchObject({ pairsCreated: 0 })
    const legsAfterSecond = await app.prisma.movement.findMany({
      where: { id: { in: legsAfterFirst.map((leg) => leg.id) } },
      orderBy: { id: 'asc' },
    })
    expect(legsAfterSecond.map((leg) => leg.transferId)).toEqual(
      legsAfterFirst.map((leg) => leg.transferId),
    )
  })

  it('links nobody when two mirrors compete, and lists the group in the report (feature 40, R5, R6)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)
    for (const day of ['2026-07-24', '2026-07-25']) {
      const account = await app.prisma.account.create({
        data: { iban: syntheticIban(), bank, alias: `Mirror of ${day}` },
      })
      await app.prisma.movement.create({
        data: {
          accountId: account.id,
          type: 'income',
          amount: '10.00',
          description: 'TRANSFERENCIA RECIBIDA',
          bookingDate: new Date(`${day}T00:00:00.000Z`),
          valueDate: new Date(`${day}T00:00:00.000Z`),
          daySequence: 1,
          origin: 'imported',
        },
      })
    }

    const response = await app.inject({ method: 'POST', url: '/api/import/local' })

    expect(response.statusCode).toBe(200)
    const transfers = response.json<LocalImportRunResult>().transfers
    expect(transfers.pairsCreated).toBe(0)
    expect(transfers.ambiguousCount).toBe(1)
    expect(transfers.ambiguous[0]?.amount).toBe('10.00')
    expect(transfers.ambiguous[0]?.movements).toHaveLength(3)
    expect(transfers.ambiguous[0]?.movements.map((movement) => movement.description)).toContain(
      'LOCAL ROUTE FIRST',
    )
    // Nobody was linked: the doubtful case stays unmarked on purpose.
    const marked = await app.prisma.movement.count({
      where: { transferId: { not: null }, account: { bank } },
    })
    expect(marked).toBe(0)
  })

  it('reports a detection failure inside the 200, with the import intact (feature 40, R15)', async () => {
    const real = createPrismaClient(process.env.DATABASE_URL ?? '')
    // Fails ONLY the read of the detection (the one that filters by
    // `transferId`); every query of the import itself passes through.
    const bound = (holder: object, property: string | symbol): unknown => {
      const value = Reflect.get(holder, property)
      return typeof value === 'function' ? value.bind(holder) : value
    }
    const wrapped = new Proxy(real, {
      get(target, property) {
        if (property === 'movement') {
          const movement = target.movement
          return new Proxy(movement, {
            get(movementTarget, movementProperty) {
              if (movementProperty === 'findMany') {
                return (args: { where?: Record<string, unknown> }) => {
                  if (args?.where !== undefined && 'transferId' in args.where) {
                    throw new Error('synthetic detection failure')
                  }
                  return movementTarget.findMany(args)
                }
              }
              return bound(movementTarget, movementProperty)
            },
          })
        }
        return bound(target, property)
      },
    }) as AppPrismaClient
    const drive = driveSpy()
    app = await buildTestApp(drive.client, wrapped)

    const response = await app.inject({ method: 'POST', url: '/api/import/local' })

    // The HTTP status and the per-file report do not change: the movements are
    // stored and only the detection reports its own failure.
    expect(response.statusCode).toBe(200)
    const body = response.json<LocalImportRunResult>()
    expect(body.importedCount).toBe(2)
    expect(body.failedCount).toBe(0)
    expect((body.files[0] as AttemptedLocalFileReport).status).toBe('imported')
    expect(body.transfers).toEqual({
      pairsCreated: 0,
      ambiguousCount: 0,
      ambiguous: [],
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'synthetic detection failure' },
    })
  })

  it('drops an unknown field and behaves as if nothing had been asked for (C5)', async () => {
    const drive = driveSpy()
    app = await buildTestApp(drive.client)

    // Fastify's ajv REMOVES what the schema does not declare (its default
    // `removeAdditional`), so a misspelt field never narrows the walk in
    // silence: it is simply not there, and the run is the full one.
    const response = await app.inject({
      method: 'POST',
      url: '/api/import/local',
      payload: { banco: bank },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<LocalImportRunResult>().files).toHaveLength(1)
  })
})
