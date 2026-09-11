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
import { ValidationError } from '../../errors/app-error.js'
import type {
  ProductParserAdapter,
  SavingsSnapshotInput,
} from '../investments/investments.types.js'
import { importLocalCopies, type LocalImportSelection } from './import.local.service.js'
import type {
  AttemptedLocalFileReport,
  AttemptedLocalProductFileReport,
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

  // ── Feature 31: the local reimport is the path that fixes what is inside ──
  //
  // 🔒 Nothing real here either: the copies are written into the temporary
  // directory of this test, NEVER read from the human's `var/drive-read/`, and
  // every amount is invented (ADR-017).

  it('anchors the accounts and fills the missing balances without duplicating a row (R15)', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()

    // What the database looks like before: the account was created by an older
    // import, so it has no anchor, and one of its rows was stored with its
    // per-line balance empty (the hole the F19 left behind).
    const account = await app.prisma.account.create({
      data: { iban, bank, alias: `${bank} account`, type: 'checking' },
    })
    await app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'expense',
        bookingDate: new Date('2026-07-24T00:00:00.000Z'),
        valueDate: new Date('2026-07-24T00:00:00.000Z'),
        amount: '10.00',
        description: 'ALREADY STORED',
        balanceAfter: null,
        currency: 'EUR',
        daySequence: 1,
        origin: 'imported',
        status: 'pending_review',
      },
    })

    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          accountBalance: 1800.4,
          movements: [
            movement({
              bookingDate: '2026-07-24',
              daySequence: 1,
              amount: -10,
              description: 'ALREADY STORED',
              balance: 1810.4,
            }),
            movement({
              bookingDate: '2026-07-25',
              daySequence: 1,
              amount: -20,
              description: 'NOT STORED YET',
              balance: 1790.4,
            }),
          ],
        }),
      ),
    ]

    const result = await run(parsers)

    const file = attempted(result)
    expect(file.status).toBe('imported')
    // The row that was already there is a duplicate and stays one row; the new
    // one is stored; and the empty balance of the old one gets filled.
    expect(file).toMatchObject({ imported: 1, duplicates: 1, balancesFilled: 1, anchored: true })
    expect(file.movedToProcessed).toBe(false)
    // Feature 45: the same totals as the Drive way in, from the same `totals()`.
    expect(result).toMatchObject({
      anchoredCount: 1,
      balanceFilledCount: 1,
      importedProductCount: 0,
    })

    const stored = await app.prisma.account.findUniqueOrThrow({ where: { id: account.id } })
    expect(stored.balanceAnchor?.toFixed(2)).toBe('1800.40')
    expect(stored.balanceAnchorDate).toEqual(new Date('2026-07-25T00:00:00.000Z'))
    expect(stored.balanceAnchorDaySequence).toBe(1)

    const movements = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { bookingDate: 'asc' },
    })
    expect(movements).toHaveLength(2)
    expect(movements.map((row) => row.balanceAfter?.toFixed(2) ?? null)).toEqual([
      '1810.40',
      '1790.40',
    ])
  })

  it('leaves the account unanchored when its local copies bring no balance (R5, R15)', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()
    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, { accountIban: iban, accountBalance: null, movements: [movement()] }),
      ),
    ]

    const result = await run(parsers)

    expect(attempted(result)).toMatchObject({ imported: 1, anchored: false, balancesFilled: 0 })
    expect(result).toMatchObject({ anchoredCount: 0, balanceFilledCount: 0 })
    const stored = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(stored.balanceAnchor).toBeNull()
    expect(stored.balanceAnchorDate).toBeNull()
  })

  // ── Feature 32 `balance-reconciliation` (R11) ────────────────────────────
  //
  // The local way in shares `importStatement` and `totals` with the Drive one,
  // so it gains the descuadres without a line of its own. This test is here to
  // stop the two from drifting apart, and every amount in it is invented.

  it('reports the descuadres of each copy and the total of the run, as the Drive way does (R11)', async () => {
    const bank = uniqueBank()
    const broken = syntheticIban()
    const clean = syntheticIban()
    await writeCopy(bank, '2026', 'descuadra.csv', 'raw-descuadra')
    await writeCopy(bank, '2026', 'cuadra.csv', 'raw-cuadra')
    const parsers = [
      fakeAdapter(bank, (content) =>
        content.toString().includes('descuadra')
          ? statement(bank, {
              accountIban: broken,
              movements: [
                movement({ bookingDate: '2026-07-20', daySequence: 1, amount: -10, balance: 100 }),
                movement({ bookingDate: '2026-07-21', daySequence: 1, amount: -20, balance: 60 }),
              ],
            })
          : statement(bank, {
              accountIban: clean,
              movements: [
                movement({ bookingDate: '2026-07-20', daySequence: 1, amount: -10, balance: 100 }),
                movement({ bookingDate: '2026-07-21', daySequence: 1, amount: -20, balance: 80 }),
              ],
            }),
      ),
    ]

    const result = await run(parsers)

    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban: broken } })
    const files = result.files as AttemptedLocalFileReport[]
    const descuadra = files.find((file) => file.name === 'descuadra.csv')
    const cuadra = files.find((file) => file.name === 'cuadra.csv')

    expect(descuadra?.status).toBe('imported')
    expect(descuadra?.movedToProcessed).toBe(false)
    expect(descuadra?.balanceMismatches).toEqual([
      {
        accountId: account.id,
        accountAlias: account.alias,
        date: '2026-07-21',
        computed: '-40.00',
        fromFile: '-20.00',
        difference: '-20.00',
        check: 'per-line',
      },
    ])
    // A copy that adds up brings the empty array, never `undefined`: "nothing
    // was found" must not look like "nothing was checked".
    expect(cuadra?.status).toBe('imported')
    expect(cuadra?.balanceMismatches).toEqual([])
    expect(result.balanceMismatchCount).toBe(1)
  })
})

// ── Feature 26: the product files also come back from the local copy ─────────
//
// 🔒 Everything below is invented (ADR-017): unique `zz-local-product-…` bank
// slugs, generated account names and five amounts built by hand so they add up.
// Every copy lives in a temporary directory; the human's `var/` is never read.

type ProductFile = Record<string, unknown>

function productFile(overrides: ProductFile = {}): ProductFile {
  return {
    type: 'savings_account',
    name: 'Cuenta Sintetica Remunerada',
    date: '2026-08-31',
    openedAt: '2025-03-10',
    currency: 'EUR',
    openingBalance: 4000,
    moneyIn: 0,
    moneyOut: 0,
    interest: 6.4,
    balance: 4006.4,
    closedAt: null,
    ...overrides,
  }
}

/** A PRODUCT adapter declared HERE: this suite names no bank either. */
function fakeProductAdapter(bank: string, extensions = ['.json']): ProductParserAdapter {
  return {
    bank,
    extensions,
    parse(_fileName: string, content: Buffer): SavingsSnapshotInput {
      const raw = JSON.parse(content.toString('utf8')) as Record<string, number & string>
      const cents = (value: unknown) => Math.round(Number(value) * 100)
      const expected =
        cents(raw.openingBalance) + cents(raw.moneyIn) - cents(raw.moneyOut) + cents(raw.interest)
      if (Math.abs(cents(raw.balance) - expected) > 1) {
        throw new ValidationError('los importes no cuadran')
      }
      return {
        bank: 'never-this-one',
        name: raw.name,
        type: 'savings_account',
        currency: raw.currency,
        openedAt: raw.openedAt,
        closedAt: raw.closedAt ?? null,
        date: raw.date,
        openingBalance: Number(raw.openingBalance),
        moneyIn: Number(raw.moneyIn),
        moneyOut: Number(raw.moneyOut),
        interest: Number(raw.interest),
        balance: Number(raw.balance),
      }
    },
  }
}

describe('importLocalCopies: the product files (feature 26, R11)', () => {
  let app: FastifyInstance
  let rawCopyBaseDir: string
  const usedBanks: string[] = []
  let counter = 0

  function uniqueBank(): string {
    counter += 1
    const slug = `zz-local-product-${Date.now()}-${counter}`
    usedBanks.push(slug)
    return slug
  }

  function uniqueAccountName(): string {
    counter += 1
    return `Cuenta Sintetica ${Date.now()}-${counter}`
  }

  async function writeProductCopy(bank: string, year: string, name: string, file: ProductFile) {
    await mkdir(join(rawCopyBaseDir, bank, year), { recursive: true })
    await writeFile(join(rawCopyBaseDir, bank, year, name), `${JSON.stringify(file, null, 2)}\n`)
  }

  function run(productParsers: ProductParserAdapter[], selection: LocalImportSelection = {}) {
    return importLocalCopies({
      prisma: app.prisma,
      rawCopyBaseDir,
      parsers: [],
      productParsers,
      selection,
    })
  }

  function productReport(result: LocalImportRunResult, index = 0) {
    return result.files[index] as AttemptedLocalProductFileReport
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  beforeEach(async () => {
    rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-local-product-'))
  })

  afterEach(async () => {
    await rm(rawCopyBaseDir, { recursive: true, force: true })
    if (usedBanks.length > 0) {
      const products = await app.prisma.investmentProduct.findMany({
        where: { bank: { in: usedBanks } },
      })
      const ids = products.map((product) => product.id)
      await app.prisma.savingsSnapshot.deleteMany({ where: { productId: { in: ids } } })
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: ids } } })
      usedBanks.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  it('persists the copy without touching Drive and without moving anything (R11)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    await writeProductCopy(bank, '2026', 'cuenta-2026-08-31.json', productFile({ name }))

    const result = await run([fakeProductAdapter(bank)])

    const file = productReport(result)
    expect(file.status).toBe('imported')
    expect(file.movedToProcessed).toBe(false)
    expect(file.product).toMatchObject({ bank, name, created: true })
    expect(file.snapshot).toEqual({ date: '2026-08-31', created: true })
    // The copy is still exactly where it was: nothing is moved or deleted.
    expect(await readdir(join(rawCopyBaseDir, bank, '2026'))).toEqual(['cuenta-2026-08-31.json'])
    // Feature 45: the stored product shows up in its own total, and the
    // movement counters stay at zero because a product file brings none.
    expect(result).toMatchObject({ importedProductCount: 1, importedCount: 0, duplicateCount: 0 })
  })

  it('does not duplicate anything on a second pass of the same month (R11, R6)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    await writeProductCopy(bank, '2026', 'cuenta.json', productFile({ name }))

    await run([fakeProductAdapter(bank)])
    const second = await run([fakeProductAdapter(bank)])

    expect(productReport(second).product?.created).toBe(false)
    expect(productReport(second).snapshot?.created).toBe(false)
    expect(await app.prisma.investmentProduct.count({ where: { bank } })).toBe(1)
    expect(await app.prisma.savingsSnapshot.count({ where: { product: { bank } } })).toBe(1)
  })

  it('adds one row for the next month and keeps the same account (R11, R7)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    await writeProductCopy(
      bank,
      '2026',
      'cuenta-07.json',
      productFile({ name, date: '2026-07-31' }),
    )
    await writeProductCopy(
      bank,
      '2026',
      'cuenta-08.json',
      productFile({
        name,
        date: '2026-08-31',
        openingBalance: 4006.4,
        balance: 4012.9,
        interest: 6.5,
      }),
    )

    const result = await run([fakeProductAdapter(bank)])

    expect(result.files).toHaveLength(2)
    expect(productReport(result, 0).product?.created).toBe(true)
    expect(productReport(result, 1).product?.created).toBe(false)
    expect(result.importedProductCount).toBe(2)
    expect(await app.prisma.investmentProduct.count({ where: { bank } })).toBe(1)
    const photos = await app.prisma.savingsSnapshot.findMany({
      where: { product: { bank } },
      orderBy: { date: 'asc' },
    })
    expect(photos.map((photo) => photo.date.toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-08-31',
    ])
  })

  it('leaves no trace and moves nothing when the amounts do not add up (R8, R11)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    await writeProductCopy(bank, '2026', 'cuenta.json', productFile({ name, balance: 4106.4 }))

    const result = await run([fakeProductAdapter(bank)])

    const file = productReport(result)
    expect(file.status).toBe('failed')
    expect(result.failedCount).toBe(1)
    expect(result.importedProductCount).toBe(0)
    expect(file.error?.message).toContain('los importes no cuadran')
    expect(file.movedToProcessed).toBe(false)
    expect(await app.prisma.investmentProduct.count({ where: { bank } })).toBe(0)
  })
})

describe('importLocalCopies: the categorization run of the report (feature 43, R12)', () => {
  let app: FastifyInstance
  let rawCopyBaseDir: string
  const usedBanks: string[] = []
  const createdCategoryIds: number[] = []
  const createdRuleIds: number[] = []
  let counter = 0

  function uniqueBank(): string {
    counter += 1
    const slug = `zz-local-catrules-${Date.now()}-${counter}`
    usedBanks.push(slug)
    return slug
  }

  async function writeCopy(bank: string, year: string, name: string) {
    await mkdir(join(rawCopyBaseDir, bank, year), { recursive: true })
    await writeFile(join(rawCopyBaseDir, bank, year, name), 'raw-bytes')
  }

  async function createRule(matchText: string) {
    counter += 1
    const category = await app.prisma.category.create({
      data: { name: `Local import rules ${Date.now()}-${counter}`, kind: 'expense' },
    })
    createdCategoryIds.push(category.id)
    const rule = await app.prisma.categoryRule.create({
      data: { categoryId: category.id, matchText },
    })
    createdRuleIds.push(rule.id)
    return { category, rule }
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  beforeEach(async () => {
    rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-local-catrules-'))
  })

  afterEach(async () => {
    await rm(rawCopyBaseDir, { recursive: true, force: true })
    await app.prisma.categoryRule.deleteMany({ where: { id: { in: createdRuleIds } } })
    if (usedBanks.length > 0) {
      const accounts = await app.prisma.account.findMany({
        where: { OR: usedBanks.map((bank) => ({ bank: { equals: bank, mode: 'insensitive' } })) },
      })
      const ids = accounts.map((account) => account.id)
      await app.prisma.movement.deleteMany({ where: { accountId: { in: ids } } })
      await app.prisma.account.deleteMany({ where: { id: { in: ids } } })
      usedBanks.length = 0
    }
    await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
    createdRuleIds.length = 0
    createdCategoryIds.length = 0
  })

  afterAll(async () => {
    await app.close()
  })

  it('always carries the categorization result, with zeros when there is no rule (R12)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: syntheticIban() }))]

    const result = await importLocalCopies({
      prisma: app.prisma,
      rawCopyBaseDir,
      parsers,
      selection: {},
    })

    expect(result.categorization).toEqual({
      categorized: 0,
      conflictCount: 0,
      conflicts: [],
      unmatched: expect.any(Number),
    })
  })

  it('categorizes the movements this run just imported, after the detection (R12)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')
    const { category } = await createRule('sintetico importado')
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: syntheticIban(),
          movements: [movement({ description: 'PAGO SINTETICO IMPORTADO 7' })],
        }),
      ),
    ]

    const result = await importLocalCopies({
      prisma: app.prisma,
      rawCopyBaseDir,
      parsers,
      selection: {},
    })

    expect(result.importedCount).toBe(1)
    expect(result.categorization.categorized).toBeGreaterThanOrEqual(1)
    expect(result.categorization.error).toBeUndefined()
    const account = await app.prisma.account.findFirstOrThrow({
      where: { bank: { equals: bank, mode: 'insensitive' } },
    })
    const stored = await app.prisma.movement.findFirstOrThrow({
      where: { accountId: account.id },
    })
    expect(stored.categoryId).toBe(category.id)
    // The run writes NOTHING else: the movement stays pending, no transfer link.
    expect(stored.status).toBe('pending_review')
    expect(stored.transferId).toBeNull()
  })

  it('reports a categorization failure inside the report, with the import intact (R12)', async () => {
    const bank = uniqueBank()
    await writeCopy(bank, '2026', 'movs.csv')
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: syntheticIban() }))]
    // Fails ONLY the eligible-movements read of the categorization run (the one
    // that filters by `categoryId`); every other query passes through untouched.
    const real = app.prisma
    const bound = (holder: object, property: string | symbol): unknown => {
      const value = Reflect.get(holder, property)
      return typeof value === 'function' ? value.bind(holder) : value
    }
    const wrapped = new Proxy(real, {
      get(target, property) {
        if (property === 'movement') {
          const movementDelegate = target.movement
          return new Proxy(movementDelegate, {
            get(movementTarget, movementProperty) {
              if (movementProperty === 'findMany') {
                return (args: { where?: Record<string, unknown> }) => {
                  if (args?.where !== undefined && 'categoryId' in args.where) {
                    throw new Error('synthetic categorization failure')
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
    }) as typeof real

    const result = await importLocalCopies({
      prisma: wrapped,
      rawCopyBaseDir,
      parsers,
      selection: {},
    })

    // The import itself stands, and so does the transfer detection.
    expect(result.importedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.transfers.error).toBeUndefined()
    expect(result.categorization).toEqual({
      categorized: 0,
      conflictCount: 0,
      conflicts: [],
      unmatched: 0,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'synthetic categorization failure' },
    })
  })
})
