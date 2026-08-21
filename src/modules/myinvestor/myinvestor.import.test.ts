// End-to-end of feature 29: the `.json` product files of this bank stop being
// reported as «skipped» and reach the database, through the REAL registry of
// `src/app.ts` and the shared importer -- not through a double.
//
// 🔒 Nothing here is real (ADR-017): every product name is generated on the
// spot and every amount comes from the synthetic fixtures of feature 13. The
// suite runs against a throwaway database (ADR-027), never the owner's.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { bankParsers, buildApp, productParsers } from '../../app.js'
import type { AppDriveClient } from '../../lib/drive.js'
import { importLocalCopies } from '../import/import.local.service.js'
import { importPending } from '../import/import.service.js'
import type { LocalFileReport } from '../import/import.types.js'
import {
  buildProductDeposit,
  buildProductFund,
  buildProductJson,
  buildProductPortfolio,
  type ProductFile,
} from './myinvestor.fixture.js'

const bank = 'myinvestor'
const folderMime = 'application/vnd.google-apps.folder'

let app: FastifyInstance
let rawCopyBaseDir: string
let counter = 0

/** A name nothing else in the suite (or in his database) can collide with. */
function uniqueName(): string {
  counter += 1
  return `Producto Sintetico ${Date.now()}-${counter}-${Math.floor(Math.random() * 1_000_000)}`
}

/** Writes a local copy where the download step leaves it: `<base>/<bank>/<year>/`. */
async function localCopy(name: string, file: ProductFile, year = '2026'): Promise<void> {
  const dir = join(rawCopyBaseDir, bank, year)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), buildProductJson(file), 'utf8')
}

function run(name?: string) {
  return importLocalCopies({
    prisma: app.prisma,
    rawCopyBaseDir,
    parsers: bankParsers,
    productParsers,
    selection: name === undefined ? { bank } : { bank, year: '2026', name },
  })
}

function reportOf(result: { files: LocalFileReport[] }, name: string): LocalFileReport {
  const file = result.files.find((candidate) => candidate.name === name)
  if (file === undefined) {
    throw new Error(`no report for ${name}`)
  }
  return file
}

/** Products of this bank whose name this test file generated. */
function productsNamed(names: string[]) {
  return app.prisma.investmentProduct.findMany({ where: { bank, name: { in: names } } })
}

const createdNames: string[] = []

/** Registers a generated name so the cleanup finds it whatever the test did. */
function trackedName(): string {
  const name = uniqueName()
  createdNames.push(name)
  return name
}

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})

beforeEach(async () => {
  rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'myinvestor-import-'))
})

afterEach(async () => {
  await rm(rawCopyBaseDir, { recursive: true, force: true })
  if (createdNames.length > 0) {
    const products = await productsNamed(createdNames)
    const ids = products.map((product) => product.id)
    await app.prisma.valuation.deleteMany({ where: { productId: { in: ids } } })
    await app.prisma.savingsSnapshot.deleteMany({ where: { productId: { in: ids } } })
    await app.prisma.investmentProduct.deleteMany({ where: { id: { in: ids } } })
    createdNames.length = 0
  }
})

afterAll(async () => {
  await app.close()
})

describe('the product files of MyInvestor entering the database (feature 29)', () => {
  it('stores the four types instead of reporting them as skipped (C1)', async () => {
    const names = {
      fund: trackedName(),
      etf: trackedName(),
      managed_portfolio: trackedName(),
      deposit: trackedName(),
    }
    await localCopy('fondo.json', buildProductFund({ name: names.fund }))
    await localCopy('etf.json', buildProductFund({ type: 'etf', name: names.etf }))
    await localCopy('cartera.json', buildProductPortfolio({ name: names.managed_portfolio }))
    await localCopy('deposito.json', buildProductDeposit({ name: names.deposit }))

    const result = await run()

    expect(result.files.map((file) => file.status)).toEqual([
      'imported',
      'imported',
      'imported',
      'imported',
    ])
    expect(result.skippedCount).toBe(0)
    const stored = await productsNamed(Object.values(names))
    expect(Object.fromEntries(stored.map((product) => [product.name, product.type]))).toEqual({
      [names.fund]: 'fund',
      [names.etf]: 'etf',
      [names.managed_portfolio]: 'managed_portfolio',
      [names.deposit]: 'deposit',
    })
  })

  it('gives every product that fluctuates one valuation per date (C2)', async () => {
    const name = trackedName()
    await localCopy('fondo.json', buildProductFund({ name, date: '2026-08-31' }))

    await run()

    const [product] = await productsNamed([name])
    const rows = await app.prisma.valuation.findMany({ where: { productId: product.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.date.toISOString().slice(0, 10)).toBe('2026-08-31')
    expect(rows[0]?.marketValue.toFixed(2)).toBe('947.25')
    expect(await app.prisma.savingsSnapshot.count({ where: { productId: product.id } })).toBe(0)
  })

  it('gives a deposit its conditions on the product and NO valuation (C2)', async () => {
    const name = trackedName()
    await localCopy('deposito.json', buildProductDeposit({ name }))

    const result = await run()

    const [product] = await productsNamed([name])
    expect(product.principal?.toFixed(2)).toBe('1200.00')
    expect(product.interestRate?.toFixed(4)).toBe('1.5000')
    expect(product.expectedGain?.toFixed(2)).toBe('4.50')
    expect(product.maturityDate?.toISOString().slice(0, 10)).toBe('2027-04-15')
    expect(await app.prisma.valuation.count({ where: { productId: product.id } })).toBe(0)
    const file = reportOf(result, 'deposito.json')
    expect(file).toMatchObject({ status: 'imported', snapshot: null })
  })

  it('does not duplicate anything when the same month is uploaded twice (C4)', async () => {
    const name = trackedName()
    await localCopy('fondo.json', buildProductFund({ name }))

    const first = await run()
    const second = await run()

    expect(reportOf(first, 'fondo.json')).toMatchObject({
      product: { created: true },
      snapshot: { created: true },
    })
    expect(reportOf(second, 'fondo.json')).toMatchObject({
      product: { created: false },
      snapshot: { created: false },
    })
    const stored = await productsNamed([name])
    expect(stored).toHaveLength(1)
    expect(await app.prisma.valuation.count({ where: { productId: stored[0].id } })).toBe(1)
  })

  it('adds a valuation for the next month without creating a product (C4)', async () => {
    const name = trackedName()
    await localCopy('julio.json', buildProductFund({ name, date: '2026-07-31' }))
    await run('julio.json')
    await localCopy('agosto.json', buildProductFund({ name, date: '2026-08-31' }))

    const second = await run('agosto.json')

    expect(reportOf(second, 'agosto.json')).toMatchObject({
      product: { created: false },
      snapshot: { date: '2026-08-31', created: true },
    })
    const stored = await productsNamed([name])
    expect(stored).toHaveLength(1)
    const rows = await app.prisma.valuation.findMany({
      where: { productId: stored[0].id },
      orderBy: { date: 'asc' },
    })
    expect(rows.map((row) => row.date.toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-08-31',
    ])
  })

  it('leaves nothing behind when the file is wrong, and says the whole reason (C5)', async () => {
    const name = trackedName()
    const broken = buildProductFund({ name, uninvestedcash: 5 })
    delete broken.marketValue
    await localCopy('roto.json', broken)

    const result = await run()

    const file = reportOf(result, 'roto.json')
    expect(file.status).toBe('failed')
    expect(file).toMatchObject({ product: null, snapshot: null })
    expect('error' in file ? file.error?.message : '').toMatch(/marketValue/)
    expect('error' in file ? file.error?.message : '').toMatch(/uninvestedcash/)
    expect(await productsNamed([name])).toEqual([])
  })

  it('does not move a wrong file to procesados/, and does move a good one (C5)', async () => {
    // The Drive half is generic since feature 26 (`importDriveFile`): the move is
    // a CONSEQUENCE of storing. This checks that the rule still holds for the
    // files of THIS bank, now that they are stored by another writer.
    const good = trackedName()
    const bad = trackedName()
    const broken = buildProductFund({ name: bad })
    delete broken.openedAt
    const contents: Record<string, ProductFile> = {
      'f-good': buildProductFund({ name: good }),
      'f-bad': broken,
    }
    const update = vi.fn(async () => ({ data: {} }))
    const client = {
      files: {
        list: vi.fn(async ({ q }: { q: string }) => {
          const parent = (q.match(/'([^']+)' in parents/) ?? [])[1] ?? ''
          if (q.includes(`mimeType != '${folderMime}'`)) {
            return {
              data: {
                files:
                  parent === 'y'
                    ? [
                        { id: 'f-good', name: 'bueno.json', mimeType: 'application/json' },
                        { id: 'f-bad', name: 'malo.json', mimeType: 'application/json' },
                      ]
                    : [],
              },
            }
          }
          if (q.includes("name = 'procesados'")) {
            return { data: { files: [{ id: 'proc', name: 'procesados' }] } }
          }
          if (parent === 'root') {
            return { data: { files: [{ id: 'b', name: bank }] } }
          }
          if (parent === 'b') {
            return { data: { files: [{ id: 'y', name: '2026' }] } }
          }
          return { data: { files: [] } }
        }),
        get: vi.fn(async ({ fileId }: { fileId: string }) => ({
          data: Buffer.from(buildProductJson(contents[fileId]), 'utf8'),
        })),
        update,
        create: vi.fn(async () => ({ data: { id: 'proc' } })),
      },
    } as unknown as AppDriveClient

    const result = await importPending({
      client,
      prisma: app.prisma,
      rootFolderId: 'root',
      rawCopyBaseDir,
      parsers: bankParsers,
      productParsers,
    })

    const reports = Object.fromEntries(result.files.map((file) => [file.name, file]))
    expect(reports['bueno.json']).toMatchObject({ status: 'imported', movedToProcessed: true })
    expect(reports['malo.json']).toMatchObject({ status: 'failed', movedToProcessed: false })
    expect(update).toHaveBeenCalledTimes(1)
    expect((await productsNamed([good, bad])).map((product) => product.name)).toEqual([good])
  })

  it('writes no Account and no Movement (C8)', async () => {
    const accountsBefore = await app.prisma.account.count()
    const movementsBefore = await app.prisma.movement.count()
    await localCopy('fondo.json', buildProductFund({ name: trackedName() }))
    await localCopy('deposito.json', buildProductDeposit({ name: trackedName() }))

    await run()

    expect(await app.prisma.account.count()).toBe(accountsBefore)
    expect(await app.prisma.movement.count()).toBe(movementsBefore)
  })

  it('still sends anything that is not a .csv or a .json nowhere (C1)', async () => {
    const dir = join(rawCopyBaseDir, bank, '2026')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'extracto.pdf'), 'not a product', 'utf8')

    const result = await run()

    const file = reportOf(result, 'extracto.pdf')
    expect(file.status).toBe('skipped')
    expect('reason' in file ? file.reason : '').toBe(
      `extensión no soportada por el parser de ${bank}`,
    )
  })
})
