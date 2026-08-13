import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildProductDeposit,
  buildProductFund,
  buildProductJson,
  buildProductPortfolio,
  buildStatementCsv,
  writeLocalCopy,
} from './myinvestor.fixture.js'
import { parseLocalMyinvestorCopies } from './myinvestor.service.js'
import type { MyinvestorProductsResult, MyinvestorStatementResult } from './myinvestor.types.js'

async function readProductsDump(dumpDir: string, year = '2026'): Promise<MyinvestorProductsResult> {
  return JSON.parse(
    await readFile(join(dumpDir, 'myinvestor', year, 'products.json'), 'utf8'),
  ) as MyinvestorProductsResult
}

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'myinvestor-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'myinvestor-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

describe('parseLocalMyinvestorCopies', () => {
  it('parses each local statement and writes a JSON dump per file (R52, R54)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'movimientos.csv', buildStatementCsv())

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.ignoredCount).toBe(0)
    expect(result.statements[0]).toEqual({
      bank: 'myinvestor',
      year: '2026',
      file: 'movimientos.csv',
      accountIban: null,
      movements: 8,
      unparsedRows: 2,
      dumpPath: 'myinvestor/2026/movimientos.csv.json',
    })
    // The relative dumpPath is logical: always '/', never an absolute path.
    expect(result.statements[0].dumpPath).not.toContain('\\')
    expect(result.statements[0].dumpPath).not.toContain(dumpDir)

    const dumped = JSON.parse(
      await readFile(join(dumpDir, 'myinvestor', '2026', 'movimientos.csv.json'), 'utf8'),
    ) as MyinvestorStatementResult
    expect(dumped.bank).toBe('myinvestor')
    expect(dumped.accountIban).toBeNull()
    expect(dumped.movements).toHaveLength(8)
    expect(dumped.movements.every((movement) => movement.balance === null)).toBe(true)
  })

  it('takes the bank and the year from the folder, not from the contents (R25)', async () => {
    await writeLocalCopy(sourceDir, '2025', 'extracto.csv', buildStatementCsv())

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.statements[0]).toMatchObject({ bank: 'myinvestor', year: '2025' })
    const dumped = JSON.parse(
      await readFile(join(dumpDir, 'myinvestor', '2025', 'extracto.csv.json'), 'utf8'),
    ) as MyinvestorStatementResult
    expect(dumped.bank).toBe('myinvestor')
  })

  it('isolates a broken file and parses the healthy ones all the same (R47)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'bueno-1.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'bueno-2.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'roto.csv', Buffer.from('esto;no;es;un;extracto\n'))

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(2)
    expect(result.failedCount).toBe(1)
    expect(result.statements.map((statement) => statement.file)).toEqual([
      'bueno-1.csv',
      'bueno-2.csv',
    ])
    expect(result.failed[0]).toMatchObject({
      bank: 'myinvestor',
      year: '2026',
      file: 'roto.csv',
    })
    expect(result.failed[0].reason).toMatch(/header row not found/i)
    // The broken file wrote no dump; the healthy ones did.
    await expect(
      readFile(join(dumpDir, 'myinvestor', '2026', 'roto.csv.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(join(dumpDir, 'myinvestor', '2026', 'bueno-1.csv.json'), 'utf8'),
    ).resolves.toContain('myinvestor')
  })

  it('reports the extensions it does not handle in ignored, not as failures (R49, R50)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'deposito.txt', 'notas copiadas de la web')
    await writeLocalCopy(sourceDir, '2026', 'hoja.xlsx', Buffer.from('PK'))
    // The product `.json` files are NOT here anymore: feature 13 routes them to
    // the product parser (R76). Only the extensions nobody reads land here.

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.ignoredCount).toBe(2)
    expect(result.ignored.map((entry) => entry.file)).toEqual(['deposito.txt', 'hoja.xlsx'])
    expect(result.ignored[0]).toMatchObject({ bank: 'myinvestor', year: '2026' })
    expect(result.ignored[0].reason).toContain('.txt')
    await expect(readdir(join(dumpDir, 'myinvestor', '2026'))).resolves.toEqual([
      'extracto.csv.json',
    ])
  })

  it('does not move, delete or modify any source file (R4)', async () => {
    const content = buildStatementCsv()
    const statementPath = await writeLocalCopy(sourceDir, '2026', 'extracto.csv', content)
    const notesPath = await writeLocalCopy(sourceDir, '2026', 'notas.txt', 'intacto')

    await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    await expect(readFile(statementPath)).resolves.toEqual(content)
    await expect(readFile(notesPath, 'utf8')).resolves.toBe('intacto')
    await expect(readdir(join(sourceDir, 'myinvestor', '2026'))).resolves.toEqual([
      'extracto.csv',
      'notas.txt',
    ])
  })

  it('produces byte-identical dumps on two consecutive runs (R55)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    const dumpFile = join(dumpDir, 'myinvestor', '2026', 'extracto.csv.json')

    const first = await parseLocalMyinvestorCopies(sourceDir, dumpDir)
    const firstDump = await readFile(dumpFile, 'utf8')
    const second = await parseLocalMyinvestorCopies(sourceDir, dumpDir)
    const secondDump = await readFile(dumpFile, 'utf8')

    expect(secondDump).toEqual(firstDump)
    expect(second).toEqual(first)
  })

  it('does nothing when there are no local copies (R56)', async () => {
    const empty = {
      parsedCount: 0,
      productCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      statements: [],
      products: [],
      failed: [],
      ignored: [],
    }

    // Source dir present but empty.
    await expect(parseLocalMyinvestorCopies(sourceDir, dumpDir)).resolves.toEqual(empty)
    // Source dir absent altogether.
    await expect(
      parseLocalMyinvestorCopies(join(sourceDir, 'no-existe'), dumpDir),
    ).resolves.toEqual(empty)
    await expect(readdir(dumpDir)).resolves.toEqual([])
  })
})

describe('parseLocalMyinvestorCopies — the product files of the same bank', () => {
  it('routes each entry by its extension and none through the other parser (R76)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'fondo.json', buildProductJson(buildProductFund()))
    await writeLocalCopy(
      sourceDir,
      '2026',
      'deposito.json',
      buildProductJson(buildProductDeposit()),
    )

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(1)
    expect(result.productCount).toBe(2)
    expect(result.failedCount).toBe(0)
    // A `.json` is no longer ignored: it has a parser now.
    expect(result.ignored).toEqual([])
    expect(result.products.map((product) => product.file)).toEqual(['deposito.json', 'fondo.json'])
    expect(result.products[1]).toEqual({
      bank: 'myinvestor',
      year: '2026',
      file: 'fondo.json',
      type: 'fund',
      name: 'Fondo Sintetico Global',
      date: '2026-08-31',
      dumpPath: 'myinvestor/2026/products.json',
    })
    // Neither file went through the parser of the other entry.
    expect(result.statements.map((statement) => statement.file)).toEqual(['extracto.csv'])
    const dumped = await readProductsDump(dumpDir)
    expect(dumped.products.map((product) => product.type)).toEqual(['deposit', 'fund'])
  })

  it('dumps every product of the year into a single products.json (R53)', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'cartera.json',
      buildProductJson(buildProductPortfolio()),
    )
    await writeLocalCopy(sourceDir, '2026', 'roto.json', '{ "type": "fund",')
    await writeLocalCopy(sourceDir, '2026', 'notas.txt', 'ruido')

    await parseLocalMyinvestorCopies(sourceDir, dumpDir)
    const dumped = await readProductsDump(dumpDir)

    expect(dumped.bank).toBe('myinvestor')
    expect(dumped.year).toBe('2026')
    expect(dumped.products).toHaveLength(1)
    expect(dumped.products[0]).toMatchObject({
      name: 'Cartera Sintetica',
      valuation: { marketValue: 947.25, uninvestedCash: 12.05 },
      depositTerms: null,
    })
    expect(dumped.failed).toEqual([
      {
        bank: 'myinvestor',
        year: '2026',
        file: 'roto.json',
        reason: expect.stringContaining('JSON inválido'),
      },
    ])
    expect(dumped.ignored.map((entry) => entry.file)).toEqual(['notas.txt'])
    // The opening date of the file reaches the dump of the year (feature 15).
    expect(dumped.products[0].openedAt).toBe('2025-01-15')
    // The year dump is the only product artifact: no `fondo.json.json`.
    await expect(readdir(join(dumpDir, 'myinvestor', '2026'))).resolves.toEqual(['products.json'])
  })

  it('isolates a broken product file and parses the healthy ones all the same (R47)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'a-bueno.json', buildProductJson(buildProductFund()))
    await writeLocalCopy(
      sourceDir,
      '2026',
      'b-roto.json',
      buildProductJson(buildProductFund({ name: 'Otro', marketValue: '3.210,40 €' })),
    )
    await writeLocalCopy(
      sourceDir,
      '2026',
      'c-bueno.json',
      buildProductJson(buildProductFund({ name: 'Fondo Sintetico Bonos' })),
    )

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.productCount).toBe(2)
    expect(result.products.map((product) => product.file)).toEqual(['a-bueno.json', 'c-bueno.json'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ file: 'b-roto.json' })
    expect(result.failed[0].reason).toContain('se espera un número sin comillas')
  })

  it('fails only the file that forgot openedAt and parses the rest of the batch (F15-C2)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'a-bueno.json', buildProductJson(buildProductFund()))
    await writeLocalCopy(
      sourceDir,
      '2026',
      'b-sin-apertura.json',
      buildProductJson(buildProductFund({ name: 'Fondo Sin Apertura', openedAt: undefined })),
    )
    await writeLocalCopy(
      sourceDir,
      '2026',
      'c-deposito.json',
      buildProductJson(buildProductDeposit()),
    )

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.products.map((product) => product.file)).toEqual([
      'a-bueno.json',
      'c-deposito.json',
    ])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ file: 'b-sin-apertura.json' })
    expect(result.failed[0].reason).toContain('openedAt')
  })

  it('keeps the first file alphabetically when two declare the same product and date (R46)', async () => {
    const sameProduct = buildProductFund({ name: 'Fondo A', date: '2026-08-31' })
    await writeLocalCopy(sourceDir, '2026', 'a.json', buildProductJson(sameProduct))
    await writeLocalCopy(sourceDir, '2026', 'b.json', buildProductJson(sameProduct))
    // The same product on ANOTHER date is the normal case and never clashes.
    await writeLocalCopy(
      sourceDir,
      '2026',
      'c.json',
      buildProductJson(buildProductFund({ name: 'Fondo A', date: '2026-09-30' })),
    )

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.products.map((product) => product.file)).toEqual(['a.json', 'c.json'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ file: 'b.json' })
    expect(result.failed[0].reason).toContain('a.json')
    expect(result.failed[0].reason).toContain('Fondo A')
  })

  it('does not close a product that stopped being written, nor report it missing (R31)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'fondo.json', buildProductJson(buildProductFund()))
    await writeLocalCopy(
      sourceDir,
      '2026',
      'deposito.json',
      buildProductJson(buildProductDeposit()),
    )

    const first = await parseLocalMyinvestorCopies(sourceDir, dumpDir)
    expect(first.productCount).toBe(2)

    await rm(join(sourceDir, 'myinvestor', '2026', 'deposito.json'))
    const second = await parseLocalMyinvestorCopies(sourceDir, dumpDir)
    const dumped = await readProductsDump(dumpDir)

    expect(second.productCount).toBe(1)
    expect(second.products.map((product) => product.file)).toEqual(['fondo.json'])
    expect(second.failed).toEqual([])
    expect(dumped.products.every((product) => product.closedAt === null)).toBe(true)
    // The result holds the products that are there, and nothing about the absent one.
    expect(JSON.stringify(second)).not.toContain('deposito.json')
    expect(JSON.stringify(dumped)).not.toContain('Deposito Sintetico')
  })

  it('produces byte-identical product dumps on two consecutive runs (R55)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'fondo.json', buildProductJson(buildProductFund()))
    await writeLocalCopy(sourceDir, '2026', 'roto.json', '{ "type": "fund",')
    const dumpFile = join(dumpDir, 'myinvestor', '2026', 'products.json')

    const first = await parseLocalMyinvestorCopies(sourceDir, dumpDir)
    const firstDump = await readFile(dumpFile, 'utf8')
    const second = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(await readFile(dumpFile, 'utf8')).toEqual(firstDump)
    expect(second).toEqual(first)
  })

  it('does not move, delete or modify any product file (R4)', async () => {
    const content = buildProductJson(buildProductFund())
    const path = await writeLocalCopy(sourceDir, '2026', 'fondo.json', content)

    await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    await expect(readFile(path, 'utf8')).resolves.toBe(content)
  })

  it('writes no products.json for a year that has no product file (R56)', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())

    const result = await parseLocalMyinvestorCopies(sourceDir, dumpDir)

    expect(result.products).toEqual([])
    await expect(readdir(join(dumpDir, 'myinvestor', '2026'))).resolves.toEqual([
      'extracto.csv.json',
    ])
  })
})
