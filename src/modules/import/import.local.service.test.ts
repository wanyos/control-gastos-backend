// Feature 25 `reimport-from-local-copy`: importing from the raw copy of
// `var/drive-read/`, with no Drive and with nothing moved or deleted.
//
// 🔒 Nothing here is real: the bank folders are unique `zz-local-…` slugs, the
// IBANs come from `syntheticIban()` and every copy is written into a temporary
// directory that is removed afterwards. The human's `var/` is never read.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import { importLocalCopies, type LocalImportSelection } from './import.local.service.js'
import type {
  AttemptedLocalFileReport,
  BankParserAdapter,
  LocalImportRunResult,
} from './import.types.js'

// ── Fixtures of the parsed contract ────────────────────────────────────────

function movement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
  return {
    bookingDate: '2026-07-24',
    valueDate: '2026-07-24',
    description: 'LOCAL REIMPORT TEST MOVEMENT',
    amount: -10,
    balance: null,
    currency: 'EUR',
    type: 'expense',
    daySequence: 1,
    ...overrides,
  }
}

function statement(bank: string, overrides: Partial<ParsedStatement> = {}): ParsedStatement {
  return {
    bank,
    accountIban: null,
    accountBalance: null,
    movements: [movement()],
    unparsedRows: [],
    ...overrides,
  }
}

/** A parser adapter declared HERE: the importer knows no bank, nor does its suite. */
function fakeAdapter(
  bank: string,
  parse: BankParserAdapter['parse'],
  extensions = ['.csv'],
): BankParserAdapter {
  return { bank, extensions, parse }
}

describe('importLocalCopies', () => {
  let app: FastifyInstance
  let rawCopyBaseDir: string
  const usedBanks: string[] = []
  let bankCounter = 0

  /** A bank slug of its own per test, so no test sees another test's accounts. */
  function uniqueBank(): string {
    bankCounter += 1
    const slug = `zz-local-${Date.now()}-${bankCounter}`
    usedBanks.push(slug)
    return slug
  }

  /** Writes one raw copy where the importer expects it: <bank>/<year>/<name>. */
  async function writeCopy(bank: string, year: string, name: string, content = 'raw-bytes') {
    await mkdir(join(rawCopyBaseDir, bank, year), { recursive: true })
    await writeFile(join(rawCopyBaseDir, bank, year, name), content)
  }

  function run(
    parsers: BankParserAdapter[],
    selection: LocalImportSelection = {},
  ): Promise<LocalImportRunResult> {
    return importLocalCopies({ prisma: app.prisma, rawCopyBaseDir, parsers, selection })
  }

  function attempted(report: LocalImportRunResult, index = 0): AttemptedLocalFileReport {
    const file = report.files[index]
    expect(file.status).not.toBe('skipped')
    return file as AttemptedLocalFileReport
  }

  function accountsOfTheBank(bank: string): Promise<number> {
    return app.prisma.account.count({ where: { bank: { equals: bank, mode: 'insensitive' } } })
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  beforeEach(async () => {
    rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-local-'))
  })

  afterEach(async () => {
    await rm(rawCopyBaseDir, { recursive: true, force: true })
    if (usedBanks.length > 0) {
      const accounts = await app.prisma.account.findMany({
        where: { OR: usedBanks.map((bank) => ({ bank: { equals: bank, mode: 'insensitive' } })) },
      })
      const ids = accounts.map((account) => account.id)
      await app.prisma.movement.deleteMany({ where: { accountId: { in: ids } } })
      await app.prisma.account.deleteMany({ where: { id: { in: ids } } })
      usedBanks.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  // ── C1: the copy is enough, Drive is not needed ──────────────────────────

  it('imports a file from its local copy with no Drive client at all (C1)', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()
    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          movements: [
            movement({ description: 'FIRST', amount: -10, daySequence: 1 }),
            movement({ description: 'SECOND', amount: -20, daySequence: 2 }),
          ],
        }),
      ),
    ]

    // No Drive client is even passed: this way in has no way to reach Drive.
    const result = await run(parsers, { bank, year: '2026', name: 'movs.csv' })

    const file = attempted(result)
    expect(file).toMatchObject({
      bank,
      year: '2026',
      name: 'movs.csv',
      status: 'imported',
      imported: 2,
      duplicates: 0,
      movedToProcessed: false,
    })
    expect(result.importedCount).toBe(2)
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(2)
  })

  it('hands the parser the bytes of the copy and reads the bank from the FOLDER (C1)', async () => {
    // The Drive folder is written in capitals, like a real one: the parser is
    // found through the normalized slug, never through the raw folder name.
    const bank = uniqueBank()
    const folder = bank.toUpperCase()
    await writeCopy(folder, '2026', 'movs.csv', 'the-exact-bytes-of-the-copy')
    const seen: string[] = []
    const parsers = [
      fakeAdapter(bank, (content) => {
        seen.push(content.toString('utf8'))
        return statement(bank, { accountIban: syntheticIban() })
      }),
    ]

    const result = await run(parsers)

    expect(seen).toEqual(['the-exact-bytes-of-the-copy'])
    // The report keeps the folder as it is on disk; the parser was chosen by slug.
    expect(attempted(result)).toMatchObject({ bank: folder, status: 'imported', imported: 1 })
  })

  it('reimports every copy on disk when nothing is asked for in particular (C1)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2025', 'old.csv')
    await writeCopy(bank, '2026', 'new.csv')
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: syntheticIban() }))]

    const result = await run(parsers)

    expect(result.files.map((file) => [file.year, file.name])).toEqual([
      ['2025', 'old.csv'],
      ['2026', 'new.csv'],
    ])
    expect(result.importedCount).toBe(2)
  })

  // ── C1 + C7: nothing is moved, deleted or rewritten ──────────────────────

  it('leaves every local copy exactly where it was, byte for byte (C1, C7)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv', 'untouched-content')
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: syntheticIban() }))]

    await run(parsers)

    const path = join(rawCopyBaseDir, bank, '2026', 'movs.csv')
    expect(await readFile(path, 'utf8')).toBe('untouched-content')
    expect(await readdir(join(rawCopyBaseDir, bank, '2026'))).toEqual(['movs.csv'])
    // And no `procesados/` folder was invented on disk either.
    expect(await readdir(join(rawCopyBaseDir, bank))).toEqual(['2026'])
  })

  it('reports movedToProcessed false for every file, whatever happened to it (C1)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'good.csv')
    await writeCopy(bank, '2026', 'broken.csv')
    await writeCopy(bank, '2026', 'product.json')
    const parsers = [
      fakeAdapter(bank, (content) => {
        if (content.toString('utf8').includes('broken')) {
          throw new Error('unreadable file')
        }
        return statement(bank, { accountIban: syntheticIban() })
      }),
    ]
    await writeFile(join(rawCopyBaseDir, bank, '2026', 'broken.csv'), 'broken')

    const result = await run(parsers)

    expect(result.files.map((file) => file.status)).toEqual(['failed', 'imported', 'skipped'])
    for (const file of result.files) {
      expect(file.movedToProcessed).toBe(false)
    }
  })

  // ── C2: twice is not twice ───────────────────────────────────────────────

  it('reports duplicates instead of importing again on a second pass (C2)', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()
    await writeCopy(bank, '2026', 'movs.csv')
    const parse = () =>
      statement(bank, {
        accountIban: iban,
        movements: [
          movement({ description: 'FIRST', amount: -10, daySequence: 1 }),
          movement({ description: 'SECOND', amount: -20, daySequence: 2 }),
        ],
      })
    const parsers = [fakeAdapter(bank, parse)]

    const first = await run(parsers)
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    const afterFirst = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })
    const second = await run(parsers)
    const afterSecond = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })

    expect(attempted(first)).toMatchObject({ imported: 2, duplicates: 0 })
    // The partial unique index `Movement_imported_dedup_key` does the dropping,
    // the same one the Drive way in leans on: nothing new was reinvented here.
    expect(attempted(second)).toMatchObject({ status: 'imported', imported: 0, duplicates: 2 })
    expect(second.duplicateCount).toBe(2)
    expect(second.importedCount).toBe(0)
    // Same rows, same ids, same values: the second pass added nothing at all.
    expect(afterSecond).toEqual(afterFirst)
    expect(await accountsOfTheBank(bank)).toBe(1)
  })

  // ── C5: a copy that is not there is answered by its name ─────────────────

  it('names the bank when there is no local copy of it (C5)', async () => {
    const bank = uniqueBank()
    const other = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')

    await expect(run([], { bank: other })).rejects.toMatchObject({
      code: 'LOCAL_COPY_NOT_FOUND',
      statusCode: 404,
    })
    await expect(run([], { bank: other })).rejects.toThrow(other)
    // And it says which ones DO have a copy, so the next call is the right one.
    await expect(run([], { bank: other })).rejects.toThrow(bank)
  })

  it('names the bank when its folder is there but holds no copy (C5)', async () => {
    const empty = uniqueBank()
    const other = uniqueBank()
    await mkdir(join(rawCopyBaseDir, empty, '2026'), { recursive: true })
    await writeCopy(other, '2026', 'movs.csv')

    const failure = run([], { bank: empty })

    await expect(failure).rejects.toMatchObject({
      code: 'LOCAL_COPY_NOT_FOUND',
      statusCode: 404,
    })
    // The bank asked for is named, and so are the ones that DO have a copy:
    // "there is no local copy yet" would be plainly false here.
    await expect(failure).rejects.toThrow(empty)
    await expect(failure).rejects.toThrow(other)
    // Positive, so it cannot pass by accident: the generic sentence is gone.
    await expect(failure).rejects.toThrow('no tiene ninguna copia dentro')
  })

  it('names the bank when its folder has no year folder inside either (C5)', async () => {
    const empty = uniqueBank()
    const other = uniqueBank()
    await mkdir(join(rawCopyBaseDir, empty), { recursive: true })
    await writeCopy(other, '2026', 'movs.csv')

    const failure = run([], { bank: empty })

    await expect(failure).rejects.toMatchObject({ code: 'LOCAL_COPY_NOT_FOUND' })
    await expect(failure).rejects.toThrow(empty)
    await expect(failure).rejects.toThrow(other)
  })

  it('names the year when the bank has a copy but not of that year (C5)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')

    const failure = run([], { bank, year: '2024' })

    await expect(failure).rejects.toMatchObject({ code: 'LOCAL_COPY_NOT_FOUND' })
    await expect(failure).rejects.toThrow('2024')
    await expect(failure).rejects.toThrow('2026')
  })

  it('names the file when the year has copies but not that one (C5)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')

    const failure = run([], { bank, year: '2026', name: 'el-que-no-esta.csv' })

    await expect(failure).rejects.toMatchObject({ code: 'LOCAL_COPY_NOT_FOUND' })
    await expect(failure).rejects.toThrow('el-que-no-esta.csv')
    // It says what IS there and where to look, instead of a silent empty run.
    await expect(failure).rejects.toThrow('movs.csv')
    await expect(failure).rejects.toThrow('var/drive-read/')
  })

  it('fails when there is no local copy at all, instead of reporting an empty run (C5)', async () => {
    const failure = run([])

    await expect(failure).rejects.toMatchObject({ code: 'LOCAL_COPY_NOT_FOUND' })
    // The point of the criterion: this is NEVER a run that reports zero files.
    await expect(failure).rejects.toThrow('no hay ninguna copia local')
  })

  it('refuses a name that is a path, before touching the filesystem (C5)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')

    await expect(run([], { bank, name: '../../etc/passwd' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  // ── C3/C4 through the local way in ───────────────────────────────────────

  it('fails a local copy that brings no movement, storing nothing (C3, C4)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [
      fakeAdapter(bank, () => statement(bank, { accountIban: syntheticIban(), movements: [] })),
    ]

    const result = await run(parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    expect(file.error?.code).toBe('EMPTY_STATEMENT')
    expect(result.importedCount).toBe(0)
    expect(result.failedCount).toBe(1)
    expect(await accountsOfTheBank(bank)).toBe(0)
  })

  // ── C6: the rules of the monthly import are the same rules ───────────────

  it('skips a copy whose bank has no parser, or whose extension it does not read (C6)', async () => {
    const bank = uniqueBank()
    const other = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')
    await writeCopy(bank, '2026', 'product.json')
    await writeCopy(other, '2026', 'movs.csv')
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: syntheticIban() }))]

    const result = await run(parsers)

    const byName = new Map(result.files.map((file) => [`${file.bank}/${file.name}`, file]))
    expect(byName.get(`${bank}/product.json`)).toMatchObject({
      status: 'skipped',
      reason: `extensión no soportada por el parser de ${bank}`,
    })
    expect(byName.get(`${other}/movs.csv`)).toMatchObject({
      status: 'skipped',
      reason: `no hay parser para el banco ${other}`,
    })
    expect(result.skippedCount).toBe(2)
    expect(result.importedCount).toBe(1)
  })

  it('isolates a failing copy and goes on with the rest (C6)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'a-broken.csv', 'broken')
    await writeCopy(bank, '2026', 'b-good.csv', 'good')
    const parsers = [
      fakeAdapter(bank, (content) => {
        if (content.toString('utf8') === 'broken') {
          throw new Error('unreadable file')
        }
        return statement(bank, { accountIban: syntheticIban() })
      }),
    ]

    const result = await run(parsers)

    expect(attempted(result, 0)).toMatchObject({ name: 'a-broken.csv', status: 'failed' })
    expect(attempted(result, 0).error?.message).toContain('unreadable file')
    expect(attempted(result, 1)).toMatchObject({ name: 'b-good.csv', status: 'imported' })
    expect(result.failedCount).toBe(1)
    expect(result.importedCount).toBe(1)
  })

  it('fails a copy with no iban whose bank has no account, creating nothing (C6)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: null }))]

    const result = await run(parsers)

    expect(attempted(result).error?.code).toBe('MISSING_ACCOUNT_DATA')
    expect(await accountsOfTheBank(bank)).toBe(0)
  })
})
