import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAccountJson,
  buildSavingsAccount,
  buildSavingsAccountOffByEuros,
  writeLocalCopy,
} from './trade-republic.fixture.js'
import { parseLocalTradeRepublicCopies } from './trade-republic.service.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'trade-republic-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'trade-republic-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

function run() {
  return parseLocalTradeRepublicCopies(sourceDir, dumpDir)
}

async function readDump(year: string) {
  return JSON.parse(
    await readFile(join(dumpDir, 'trade-republic', year, 'products.json'), 'utf8'),
  ) as Record<string, unknown>
}

describe('parseLocalTradeRepublicCopies — the walk and the year dump (R13)', () => {
  it('parses the .json files of a year and writes ONE products.json for it', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'cuenta-remunerada-2026-07-31.json',
      buildAccountJson(buildSavingsAccount({ date: '2026-07-31' })),
    )
    await writeLocalCopy(
      sourceDir,
      '2026',
      'cuenta-remunerada-2026-08-31.json',
      buildAccountJson(buildSavingsAccount({ date: '2026-08-31' })),
    )

    const result = await run()

    expect(result.productCount).toBe(2)
    expect(result.failed).toEqual([])
    expect(result.products.map((product) => product.dumpPath)).toEqual([
      'trade-republic/2026/products.json',
      'trade-republic/2026/products.json',
    ])
    expect(result.products[0]).toEqual({
      bank: 'trade-republic',
      year: '2026',
      file: 'cuenta-remunerada-2026-07-31.json',
      type: 'savings_account',
      name: 'Cuenta Sintetica Remunerada',
      date: '2026-07-31',
      dumpPath: 'trade-republic/2026/products.json',
    })

    const dump = await readDump('2026')
    expect(dump).toMatchObject({ bank: 'trade-republic', year: '2026' })
    expect((dump.products as unknown[]).length).toBe(2)
  })

  it('keeps each year in its own dump and walks them in order', async () => {
    await writeLocalCopy(
      sourceDir,
      '2025',
      'cuenta.json',
      buildAccountJson(buildSavingsAccount({ date: '2025-12-31' })),
    )
    await writeLocalCopy(sourceDir, '2026', 'cuenta.json', buildAccountJson(buildSavingsAccount()))

    const result = await run()

    expect(result.products.map((product) => product.year)).toEqual(['2025', '2026'])
    expect((await readDump('2025')).year).toBe('2025')
    expect((await readDump('2026')).year).toBe('2026')
  })

  it('is deterministic: two runs over the same input write the same bytes', async () => {
    await writeLocalCopy(sourceDir, '2026', 'b.json', buildAccountJson(buildSavingsAccount()))
    await writeLocalCopy(
      sourceDir,
      '2026',
      'a.json',
      buildAccountJson(buildSavingsAccount({ date: '2026-07-31' })),
    )

    await run()
    const first = await readFile(join(dumpDir, 'trade-republic', '2026', 'products.json'), 'utf8')
    await run()
    const second = await readFile(join(dumpDir, 'trade-republic', '2026', 'products.json'), 'utf8')

    expect(second).toBe(first)
  })

  it('does nothing when there are no local copies at all', async () => {
    const result = await run()

    expect(result).toEqual({
      productCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      products: [],
      failed: [],
      ignored: [],
    })
  })

  it('rejects a file that is not saved as UTF-8, whole, saying so (ADR-018)', async () => {
    // The same file his editor would leave in cp1252: `ó` as the single byte 0xF3.
    const cp1252 = Buffer.concat([
      Buffer.from('{"type":"savings_account","name":"Cuenta '),
      Buffer.from([0xf3]),
      Buffer.from('ptima"}'),
    ])
    await writeLocalCopy(sourceDir, '2026', 'cuenta.json', cp1252)

    const result = await run()

    expect(result.failedCount).toBe(1)
    expect(result.failed[0].reason).toContain('UTF-8')
  })
})

describe('what is ignored and what is a failure (R14, R15)', () => {
  it('lists the .pdf of the statement as IGNORED, never as a failure', async () => {
    await writeLocalCopy(sourceDir, '2026', 'cuenta.json', buildAccountJson(buildSavingsAccount()))
    await writeLocalCopy(sourceDir, '2026', 'extracto-2026.pdf', 'no se abre nunca')

    const result = await run()

    expect(result.failed).toEqual([])
    expect(result.ignored).toEqual([
      {
        bank: 'trade-republic',
        year: '2026',
        file: 'extracto-2026.pdf',
        reason: "extensión no soportada por este parser ('.pdf')",
      },
    ])
    expect(result.productCount).toBe(1)
  })

  it('isolates a broken .json in failed[] and parses the rest just the same', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'a-rota.json',
      buildAccountJson(buildSavingsAccountOffByEuros()),
    )
    await writeLocalCopy(
      sourceDir,
      '2026',
      'b-buena.json',
      buildAccountJson(buildSavingsAccount({ date: '2026-07-31' })),
    )

    const result = await run()

    expect(result.productCount).toBe(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({
      bank: 'trade-republic',
      year: '2026',
      file: 'a-rota.json',
    })
    expect(result.failed[0].reason).toContain('los importes no cuadran')
    // The failure travels INSIDE the year dump too, next to what did work.
    const dump = await readDump('2026')
    expect((dump.failed as unknown[]).length).toBe(1)
  })

  it('keeps the first alphabetically when two files declare the same account and date', async () => {
    const account = buildSavingsAccount()
    await writeLocalCopy(sourceDir, '2026', 'cuenta.json', buildAccountJson(account))
    await writeLocalCopy(sourceDir, '2026', 'cuenta (1).json', buildAccountJson(account))

    const result = await run()

    expect(result.productCount).toBe(1)
    expect(result.products[0].file).toBe('cuenta (1).json')
    expect(result.failed[0].file).toBe('cuenta.json')
    expect(result.failed[0].reason).toContain("misma cuenta y fecha que 'cuenta (1).json'")
  })

  it('writes no dump for a year that only carries the .pdf', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.pdf', 'no se abre nunca')

    const result = await run()

    expect(result.ignoredCount).toBe(1)
    await expect(readDump('2026')).rejects.toThrow()
  })
})
