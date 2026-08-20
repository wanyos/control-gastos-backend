import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAccountJson,
  buildSavingsAccount,
  buildSavingsAccountOffByEuros,
  buildSavingsAccountOffByOneCent,
  buildSavingsAccountWithMovements,
  tradeRepublicTemplate,
  writeLocalCopy,
} from './trade-republic.fixture.js'
import {
  parseLocalTradeRepublicCopies,
  parseTradeRepublicProductFile,
} from './trade-republic.service.js'

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

// ── Feature 26: the same step, exported for the importer ────────────────────
//
// Every value below is invented (ADR-017). What these tests protect is that the
// file the importer is about to WRITE into the database went through exactly the
// same door as the dry run of `var/parsed/`: same decoding, same checks, same
// whole reason.
describe('parseTradeRepublicProductFile — the door the importer uses (F26 R8, R15)', () => {
  function parse(account: Record<string, unknown>, file = 'cuenta-remunerada.json') {
    return parseTradeRepublicProductFile(file, Buffer.from(buildAccountJson(account), 'utf8'))
  }

  it('returns the account with its five amounts when the file is good', () => {
    const parsed = parse(buildSavingsAccountWithMovements({ date: '2026-08-31' }))

    expect(parsed.type).toBe('savings_account')
    expect(parsed.date).toBe('2026-08-31')
    expect(parsed.openedAt).toBe('2025-03-10')
    expect(parsed.closedAt).toBeNull()
    expect(parsed.currency).toBe('EUR')
    expect({
      openingBalance: parsed.openingBalance,
      moneyIn: parsed.moneyIn,
      moneyOut: parsed.moneyOut,
      interest: parsed.interest,
      balance: parsed.balance,
    }).toEqual({
      openingBalance: 4000,
      moneyIn: 500,
      moneyOut: 120,
      interest: 6.4,
      balance: 4386.4,
    })
  })

  it('accepts the month the bank rounded by one cent', () => {
    expect(parse(buildSavingsAccountOffByOneCent()).balance).toBe(4006.41)
  })

  it('throws the WHOLE reason when the five amounts do not add up', () => {
    expect(() => parse(buildSavingsAccountOffByEuros())).toThrowError(
      /los importes no cuadran.*saldo inicial \+ entradas - salidas \+ intereses = saldo final/s,
    )
  })

  it('names every unsubstituted marker when the template is uploaded as is', () => {
    expect(() =>
      parseTradeRepublicProductFile('plantilla.json', Buffer.from(tradeRepublicTemplate, 'utf8')),
    ).toThrowError(/campos sin sustituir.*type.*name.*date/s)
  })

  it('rejects a file with a mandatory field missing, naming it', () => {
    const withoutName = buildSavingsAccount()
    delete withoutName.name

    expect(() => parse(withoutName)).toThrowError(/faltan campos obligatorios: name/)
  })

  it('rejects an amount written as text instead of a number', () => {
    expect(() => parse(buildSavingsAccount({ balance: '4006.40' }))).toThrowError(/balance/)
  })

  it('rejects an invalid date', () => {
    expect(() => parse(buildSavingsAccount({ date: '2026-02-30' }))).toThrowError(/date/)
  })

  it('rejects a key the template does not carry', () => {
    expect(() => parse(buildSavingsAccount({ iban: 'ES9121000418450200051332' }))).toThrowError(
      /iban/,
    )
  })

  it('rejects a type that is not savings_account', () => {
    expect(() => parse(buildSavingsAccount({ type: 'deposit' }))).toThrowError(
      /type: valor no admitido/,
    )
  })

  it('rejects bytes that are not UTF-8 instead of losing the accents in silence', () => {
    // The same file saved as cp1252: the accented byte is 0xF3 on its own.
    const latin1 = Buffer.from(
      buildAccountJson(buildSavingsAccount({ name: 'Cuenta Sintética' })),
      'latin1',
    )

    expect(() => parseTradeRepublicProductFile('cuenta.json', latin1)).toThrowError()
  })

  it('rejects a file that is not JSON at all', () => {
    expect(() =>
      parseTradeRepublicProductFile('cuenta.json', Buffer.from('no soy json', 'utf8')),
    ).toThrowError(/JSON inválido/)
  })
})

describe('the dry run keeps its job: parse and dump, never persist (F26 R15)', () => {
  it('writes the year dump and mentions no database at all', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'cuenta-remunerada-2026-08-31.json',
      buildAccountJson(buildSavingsAccount({ date: '2026-08-31' })),
    )

    const result = await run()

    expect(result.productCount).toBe(1)
    expect(result.products[0]?.dumpPath).toBe('trade-republic/2026/products.json')
    const dump = await readDump('2026')
    expect(Array.isArray(dump.products)).toBe(true)
    // The module's own source is the evidence that nothing here writes: the
    // whole-tree guardian of architecture.test.ts checks the same thing for
    // every file of the module.
    const source = await readFile(new URL('./trade-republic.service.ts', import.meta.url), 'utf8')
    expect(source.toLowerCase()).not.toContain('prisma')
    expect(source).not.toContain('persistSavingsSnapshot')
  })
})
