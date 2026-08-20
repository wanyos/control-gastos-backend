import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../app.js'
import { InvalidIbanError, NotUtf8Error } from '../../errors/app-error.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { AppDriveClient } from '../../lib/drive.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import { ValidationError } from '../../errors/app-error.js'
import type {
  ProductParserAdapter,
  SavingsSnapshotInput,
} from '../investments/investments.types.js'
import { importPending, toMovementRows } from './import.service.js'
import type {
  AttemptedFileReport,
  AttemptedProductFileReport,
  BankParserAdapter,
} from './import.types.js'

const folderMime = 'application/vnd.google-apps.folder'

// ── Fixtures of the parsed contract ────────────────────────────────────────

function movement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
  return {
    bookingDate: '2026-07-24',
    valueDate: '2026-07-24',
    description: 'IMPORT TEST MOVEMENT',
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
    // The statement balance of feature 16 is parser-only: the importer neither
    // reads it nor persists it, so every double here leaves it as the contract
    // says a file without that line looks.
    accountBalance: null,
    movements: [movement()],
    unparsedRows: [],
    ...overrides,
  }
}

/**
 * A parser adapter declared HERE, in the test: the importer knows no bank, so
 * its own suite must not name one either (guarded by architecture.test.ts).
 */
function fakeAdapter(
  bank: string,
  parse: BankParserAdapter['parse'],
  extensions = ['.csv'],
): BankParserAdapter {
  return { bank, extensions, parse }
}

// ── Drive double ───────────────────────────────────────────────────────────

interface DriveTree {
  folders: Record<string, Array<{ id: string; name: string; createdTime?: string }>>
  files: Record<string, Array<{ id: string; name: string; mimeType: string }>>
}

interface DriveOverrides {
  get?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
}

function buildDrive(tree: DriveTree, overrides: DriveOverrides = {}) {
  const list = vi.fn(async ({ q }: { q: string }) => {
    const parent = (q.match(/'([^']+)' in parents/) ?? [])[1] ?? ''
    if (q.includes(`mimeType != '${folderMime}'`)) {
      return { data: { files: tree.files[parent] ?? [] } }
    }
    if (q.includes("name = 'procesados'")) {
      const matches = (tree.folders[parent] ?? []).filter((folder) => folder.name === 'procesados')
      return { data: { files: matches } }
    }
    return { data: { files: tree.folders[parent] ?? [] } }
  })
  const get =
    overrides.get ??
    vi.fn(async ({ fileId }: { fileId: string }) => ({ data: Buffer.from(`content-of-${fileId}`) }))
  const update = overrides.update ?? vi.fn(async () => ({ data: {} }))
  const create = vi.fn(async () => ({ data: { id: 'created-folder' } }))
  const client = { files: { list, get, update, create } } as unknown as AppDriveClient
  return { client, list, get, update, create }
}

/** One bank folder, one year, the given files, with its `procesados/` present. */
function treeWith(
  bankSlug: string,
  files: Array<{ id: string; name: string }>,
  year = '2026',
): DriveTree {
  return {
    folders: {
      root: [{ id: `b-${bankSlug}`, name: bankSlug }],
      [`b-${bankSlug}`]: [{ id: `y-${bankSlug}`, name: year }],
      [`y-${bankSlug}`]: [
        { id: `proc-${bankSlug}`, name: 'procesados', createdTime: '2020-01-01T00:00:00Z' },
      ],
    },
    files: {
      [`y-${bankSlug}`]: files.map((file) => ({
        ...file,
        mimeType: 'text/csv',
      })),
    },
  }
}

// ── Pure mapping ───────────────────────────────────────────────────────────

describe('toMovementRows (mapping of specs/data-model/design.md §9)', () => {
  it('maps a parsed movement to a movement row of its account', () => {
    const [row] = toMovementRows(
      [
        movement({
          bookingDate: '2026-07-24',
          valueDate: '2026-07-25',
          description: 'RECIBO /Recibo GIMNASIO',
          amount: -34.15,
          balance: 22800.11,
          currency: 'USD',
          daySequence: 4,
        }),
      ],
      77,
    )

    expect(row).toEqual({
      accountId: 77,
      type: 'expense',
      bookingDate: new Date('2026-07-24T00:00:00.000Z'),
      valueDate: new Date('2026-07-25T00:00:00.000Z'),
      // Always positive: the sign lives in `type`. And a string, so no floating
      // point can reach a Decimal(10,2).
      amount: '34.15',
      description: 'RECIBO /Recibo GIMNASIO',
      balanceAfter: '22800.11',
      currency: 'USD',
      daySequence: 4,
      origin: 'imported',
      status: 'pending_review',
      categoryId: null,
      paymentMethod: null,
      transferId: null,
      productId: null,
      note: null,
    })
  })

  it('re-derives the type from the sign, with 0 becoming neutral', () => {
    const rows = toMovementRows(
      [
        // The `type` of the contract is deliberately wrong here: the importer
        // re-derives it, so the sign rule lives in a single place.
        movement({ amount: 150.25, type: 'expense' }),
        movement({ amount: 0, type: 'expense' }),
        movement({ amount: -1.5, type: 'income' }),
      ],
      1,
    )

    expect(rows.map((row) => [row.type, row.amount])).toEqual([
      ['income', '150.25'],
      ['neutral', '0.00'],
      ['expense', '1.50'],
    ])
  })

  it('keeps a balance the file does not carry as null and defaults an empty currency', () => {
    const [row] = toMovementRows([movement({ balance: null, currency: '' })], 1)

    expect(row.balanceAfter).toBeNull()
    expect(row.currency).toBe('EUR')
  })

  it('returns no rows for a statement with no movements', () => {
    expect(toMovementRows([], 1)).toEqual([])
  })
})

// ── The importer against the real database ─────────────────────────────────

describe('importPending', () => {
  let app: FastifyInstance
  let rawCopyBaseDir: string
  const usedBanks: string[] = []
  let bankCounter = 0

  /** A bank slug of its own per test, so no test sees another test's accounts. */
  function uniqueBank(): string {
    bankCounter += 1
    const slug = `zz-import-${Date.now()}-${bankCounter}`
    usedBanks.push(slug)
    return slug
  }

  function uniqueIban(): string {
    return syntheticIban()
  }

  /**
   * How many accounts exist for THIS test's bank. Always scoped to its own slug:
   * the suite runs in parallel, so a global count would read other tests' rows.
   */
  function accountsOfTheBank(bank: string): Promise<number> {
    return app.prisma.account.count({ where: { bank: { equals: bank, mode: 'insensitive' } } })
  }

  function run(
    client: AppDriveClient,
    parsers: BankParserAdapter[],
    rootFolderId = 'root',
  ): ReturnType<typeof importPending> {
    return importPending({ client, prisma: app.prisma, rootFolderId, rawCopyBaseDir, parsers })
  }

  function attempted(report: { files: unknown[] }, index = 0): AttemptedFileReport {
    const file = report.files[index] as AttemptedFileReport
    expect(file.status).not.toBe('skipped')
    return file
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  beforeEach(async () => {
    rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-raw-'))
  })

  afterEach(async () => {
    await rm(rawCopyBaseDir, { recursive: true, force: true })
    if (usedBanks.length > 0) {
      const accounts = await app.prisma.account.findMany({
        // Case-insensitive: one test registers its account with the bank name in
        // upper case, on purpose.
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

  it('creates the account from the iban of the file and reports the defaults used (R4)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () => statement(bank, { accountIban: iban, movements: [movement()] })),
    ]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('imported')
    expect(file.account).toMatchObject({
      iban,
      bank,
      alias: `${bank} ···${iban.slice(-4)}`,
      type: 'checking',
      created: true,
      appliedDefaults: { alias: true, type: true },
    })
    expect(file.imported).toBe(1)
    expect(file.movedToProcessed).toBe(true)
    expect(update).toHaveBeenCalledOnce()

    const stored = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(await app.prisma.movement.count({ where: { accountId: stored.id } })).toBe(1)
  })

  it('stores every field of the mapping, ordered and enriched by nobody (R1, R12, R16)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          movements: [
            movement({
              bookingDate: '2026-07-31',
              valueDate: '2026-08-01',
              description: 'ABONO NOMINA',
              amount: 1500,
              balance: 10000,
              currency: '',
              daySequence: 1,
            }),
            movement({
              bookingDate: '2026-07-24',
              description: 'PAGO SIN SALDO',
              amount: -15,
              balance: null,
              daySequence: 2,
            }),
          ],
        }),
      ),
    ]

    await run(client, parsers)

    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    const stored = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: [{ bookingDate: 'desc' }, { daySequence: 'desc' }],
    })

    expect(stored).toHaveLength(2)
    expect(stored[0].type).toBe('income')
    expect(stored[0].amount.toFixed(2)).toBe('1500.00')
    expect(stored[0].bookingDate.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(stored[0].valueDate.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(stored[0].balanceAfter?.toFixed(2)).toBe('10000.00')
    expect(stored[0].currency).toBe('EUR')
    // The balance the file does not carry is never invented (R12).
    expect(stored[1].balanceAfter).toBeNull()
    expect(stored[1].type).toBe('expense')
    expect(stored[1].amount.toFixed(2)).toBe('15.00')
    for (const row of stored) {
      expect(row.origin).toBe('imported')
      expect(row.status).toBe('pending_review')
      expect(row.categoryId).toBeNull()
      expect(row.paymentMethod).toBeNull()
      expect(row.transferId).toBeNull()
      expect(row.productId).toBeNull()
      expect(row.note).toBeNull()
    }

    // The balance of the account is READ from the statement, never summed (R12).
    const [withBalance] = await app.prisma.account.findMany({ where: { id: account.id } })
    expect(withBalance.initialBalance.toFixed(2)).toBe('0.00')
  })

  it('creates no InvestmentProduct nor Valuation while importing (R17)', async () => {
    const bank = uniqueBank()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: uniqueIban() }))]
    const productsBefore = await app.prisma.investmentProduct.count({ where: { bank } })

    await run(client, parsers)

    // Scoped to this test's own bank: the suite runs in parallel, so a global
    // count would be reading other tests' rows.
    expect(productsBefore).toBe(0)
    expect(await app.prisma.investmentProduct.count({ where: { bank } })).toBe(0)
    expect(await app.prisma.valuation.count({ where: { product: { bank } } })).toBe(0)
  })

  it('uses the single account already registered for the bank when the file has no iban (R5)', async () => {
    const bank = uniqueBank()
    const existing = await app.prisma.account.create({
      data: { iban: uniqueIban(), bank: bank.toUpperCase(), alias: 'already there' },
    })
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: null }))]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('imported')
    expect(file.account).toMatchObject({ id: existing.id, created: false })
    expect(await accountsOfTheBank(bank)).toBe(1)
    expect(await app.prisma.movement.count({ where: { accountId: existing.id } })).toBe(1)
  })

  it('fails with MISSING_ACCOUNT_DATA and creates no account when the bank has none (R6, R19)', async () => {
    const bank = uniqueBank()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: null }))]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    expect(result.failedCount).toBe(1)
    expect(file.error?.code).toBe('MISSING_ACCOUNT_DATA')
    expect(file.error?.message).toContain('iban;<IBAN>')
    expect(file.account).toBeNull()
    expect(file.imported).toBe(0)
    // Nothing was created and the file stays pending in Drive.
    expect(await accountsOfTheBank(bank)).toBe(0)
    expect(file.movedToProcessed).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('never creates an account without iban, whatever the file brings (R19)', async () => {
    const bank = uniqueBank()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    // An empty string is "no iban", exactly like null: it never creates anything.
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: '   ' }))]

    const result = await run(client, parsers)

    expect(attempted(result).error?.code).toBe('MISSING_ACCOUNT_DATA')
    expect(await accountsOfTheBank(bank)).toBe(0)
    expect(await app.prisma.account.count({ where: { iban: '' } })).toBe(0)
  })

  it('fails with MISSING_ACCOUNT_DATA when the bank has more than one account (R6)', async () => {
    const bank = uniqueBank()
    await app.prisma.account.create({ data: { iban: uniqueIban(), bank, alias: 'one' } })
    await app.prisma.account.create({ data: { iban: uniqueIban(), bank, alias: 'two' } })
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: null }))]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    expect(file.error?.code).toBe('MISSING_ACCOUNT_DATA')
    expect(file.error?.message).toContain('2 accounts registered')
    expect(update).not.toHaveBeenCalled()
  })

  it('reimports the same file without duplicating anything, and reports what it dropped (R7, R13)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const parse = () =>
      statement(bank, {
        accountIban: iban,
        movements: [
          movement({ description: 'FIRST', amount: -10, daySequence: 1 }),
          movement({ description: 'SECOND', amount: -20, daySequence: 2 }),
        ],
      })
    const first = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))

    const firstRun = await run(first.client, [fakeAdapter(bank, parse)])
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    const afterFirst = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })

    // The human put the file back in the year folder and imported it again.
    const second = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const secondRun = await run(second.client, [fakeAdapter(bank, parse)])

    expect(attempted(firstRun)).toMatchObject({ imported: 2, duplicates: 0 })
    expect(attempted(secondRun)).toMatchObject({ status: 'imported', imported: 0, duplicates: 2 })
    expect(secondRun.duplicateCount).toBe(2)
    // Case 3 of the zero-movements decision (feature 25): `imported: 0` because
    // every row was ALREADY stored is a healthy import, so the file still moves.
    expect(attempted(secondRun).movedToProcessed).toBe(true)

    const afterSecond = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })
    // Same rows, same ids, same values: the second run added nothing.
    expect(afterSecond).toEqual(afterFirst)
  })

  it('stores three identical lines of the same day as three movements (R8)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const identical = { description: 'PAGO DUPLICADO', amount: -50, bookingDate: '2026-07-24' }
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          movements: [
            movement({ ...identical, daySequence: 1 }),
            movement({ ...identical, daySequence: 2 }),
            movement({ ...identical, daySequence: 3 }),
          ],
        }),
      ),
    ]

    const result = await run(client, parsers)

    expect(attempted(result)).toMatchObject({ imported: 3, duplicates: 0 })
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    const stored = await app.prisma.movement.findMany({ where: { accountId: account.id } })
    expect(stored).toHaveLength(3)
    expect(stored.map((row) => row.daySequence).sort()).toEqual([1, 2, 3])
  })

  it('moves the file to procesados only after its movements are stored (R9)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const tag = `MOVED-AFTER-${Date.now()}`
    let storedWhenMoved = -1
    const update = vi.fn(
      async (args: { fileId: string; addParents: string; removeParents: string }) => {
        storedWhenMoved = await app.prisma.movement.count({
          where: { description: { startsWith: tag } },
        })
        return { data: { id: args.fileId } }
      },
    )
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]), { update })
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          movements: [
            movement({ description: `${tag}-1`, daySequence: 1 }),
            movement({ description: `${tag}-2`, daySequence: 2 }),
          ],
        }),
      ),
    ]

    const result = await run(client, parsers)

    // At the very moment of the move, both movements were already in the table.
    expect(storedWhenMoved).toBe(2)
    expect(attempted(result).movedToProcessed).toBe(true)
    expect(update.mock.calls[0][0]).toMatchObject({
      fileId: 'f1',
      addParents: `proc-${bank}`,
      removeParents: `y-${bank}`,
    })
  })

  it('does not move a file whose import failed and goes on with the rest (R10)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client, update } = buildDrive(
      treeWith(bank, [
        { id: 'bad', name: 'broken.csv' },
        { id: 'good', name: 'ok.csv' },
      ]),
    )
    const parsers = [
      fakeAdapter(bank, (content) => {
        if (content.toString('utf8').includes('bad')) {
          throw new Error('unreadable file')
        }
        return statement(bank, { accountIban: iban })
      }),
    ]

    const result = await run(client, parsers)

    const broken = attempted(result, 0)
    const ok = attempted(result, 1)
    expect(broken).toMatchObject({ fileId: 'bad', status: 'failed', movedToProcessed: false })
    expect(broken.error?.message).toContain('unreadable file')
    expect(ok).toMatchObject({ fileId: 'good', status: 'imported', movedToProcessed: true })
    // Only the healthy one moved; the broken one stays pending and retryable.
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].fileId).toBe('good')
    expect(result.failedCount).toBe(1)
    expect(result.importedCount).toBe(1)
  })

  it('reports a file its parser refuses for not being UTF-8 with NOT_UTF8, and does not move it (feature 17)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client, update } = buildDrive(
      treeWith(bank, [
        { id: 'bad', name: 'ansi.csv' },
        { id: 'good', name: 'ok.csv' },
      ]),
    )
    // Any parser may reject the bytes of its file: the importer knows no bank,
    // it only propagates the per-file failure.
    const parsers = [
      fakeAdapter(bank, (content) => {
        if (content.toString('utf8').includes('bad')) {
          throw new NotUtf8Error('el archivo no está guardado en UTF-8 (byte 0xD3 …)')
        }
        return statement(bank, { accountIban: iban })
      }),
    ]

    const result = await run(client, parsers)

    const rejected = attempted(result, 0)
    expect(rejected).toMatchObject({ fileId: 'bad', status: 'failed', movedToProcessed: false })
    expect(rejected.error?.code).toBe('NOT_UTF8')
    expect(rejected.error?.message).toContain('UTF-8')
    expect(rejected.imported).toBe(0)
    // The rest of the batch is imported all the same, and only it moves.
    expect(attempted(result, 1)).toMatchObject({ fileId: 'good', status: 'imported' })
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].fileId).toBe('good')
    expect(result.failedCount).toBe(1)
    expect(result.importedCount).toBe(1)
  })

  it('sanitizes a download failure instead of leaking the token (R10)', async () => {
    const bank = uniqueBank()
    const get = vi.fn(async () => {
      throw new Error('download failed for token 1//fake-token-value')
    })
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]), { get })
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: uniqueIban() }))]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    expect(file.error?.code).toBe('DRIVE_CONNECTION_ERROR')
    expect(JSON.stringify(file)).not.toContain('1//fake-token-value')
    expect(update).not.toHaveBeenCalled()
  })

  it('saves the good rows of a partial import, counts the unparsed ones and moves it anyway (R2, R11)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          movements: [movement({ description: 'GOOD ONE' })],
          unparsedRows: [
            { row: 42, reason: 'importe no interpretable' },
            { row: 43, reason: 'fecha de valor inválida' },
          ],
        }),
      ),
    ]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file).toMatchObject({ status: 'imported', imported: 1, unparsedCount: 2 })
    expect(file.unparsedRows).toEqual([
      { row: 42, reason: 'importe no interpretable' },
      { row: 43, reason: 'fecha de valor inválida' },
    ])
    expect(result.unparsedCount).toBe(2)
    // A row nobody could read is reported, never a reason to hold the file back.
    expect(file.movedToProcessed).toBe(true)
    expect(update).toHaveBeenCalledOnce()
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(1)
  })

  it('skips a file with no parser or an unsupported extension, importing and moving nothing (R14)', async () => {
    const bank = uniqueBank()
    const other = uniqueBank()
    const tree = treeWith(bank, [
      { id: 'f1', name: 'movs.csv' },
      { id: 'f2', name: 'fondo-indexado.json' },
    ])
    // A second bank folder whose bank has no parser at all.
    tree.folders.root.push({ id: `b-${other}`, name: other })
    tree.folders[`b-${other}`] = [{ id: `y-${other}`, name: '2026' }]
    tree.files[`y-${other}`] = [{ id: 'f3', name: 'extracto.csv', mimeType: 'text/csv' }]

    const { client, update, create } = buildDrive(tree)
    // The readable file brings a movement on purpose: since feature 25 a file
    // that parses to zero movements is a failure and does NOT move.
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, { accountIban: uniqueIban(), movements: [movement()] }),
      ),
    ]

    const result = await run(client, parsers)

    const byId = new Map(result.files.map((file) => [file.fileId, file]))
    expect(byId.get('f2')).toEqual({
      bank,
      year: '2026',
      fileId: 'f2',
      name: 'fondo-indexado.json',
      status: 'skipped',
      reason: `extensión no soportada por el parser de ${bank}`,
      movedToProcessed: false,
    })
    expect(byId.get('f3')).toMatchObject({
      status: 'skipped',
      reason: `no hay parser para el banco ${other}`,
      movedToProcessed: false,
    })
    expect(result.skippedCount).toBe(2)
    // Only the readable file moved, and no procesados/ was created for the bank
    // whose files were all skipped.
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].fileId).toBe('f1')
    expect(create).not.toHaveBeenCalled()
  })

  it('writes the raw copy of the downloaded file before parsing it', async () => {
    const bank = uniqueBank()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: uniqueIban() }))]

    await run(client, parsers)

    const copy = await readFile(join(rawCopyBaseDir, bank, '2026', 'movs.csv'))
    expect(copy.equals(Buffer.from('content-of-f1'))).toBe(true)
  })

  it('reports nothing and touches nothing when there is no pending file', async () => {
    const bank = uniqueBank()
    const tree = treeWith(bank, [])
    const { client, get, update, create } = buildDrive(tree)

    const result = await run(client, [fakeAdapter(bank, () => statement(bank))])

    expect(result).toEqual({
      importedCount: 0,
      duplicateCount: 0,
      unparsedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      files: [],
    })
    expect(get).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('propagates a top-level Drive failure (it cannot even list the banks)', async () => {
    const list = vi.fn(async () => {
      throw new Error('network down')
    })
    const client = { files: { list } } as unknown as AppDriveClient

    await expect(run(client, [])).rejects.toMatchObject({ code: 'DRIVE_CONNECTION_ERROR' })
  })
  // ── Feature 25 `reimport-from-local-copy`: the zero-movements rule ───────
  //
  // The hole the diagnosis of 2026-08-20 left alive (its section 1.4): a file
  // nothing enters from used to be reported as `imported` and moved to
  // `procesados/` all the same, which is a one-way door.
  it('fails a file that parses with no error and brings no movement, and does NOT move it (C3, C4)', async () => {
    const bank = uniqueBank()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, { accountIban: uniqueIban(), movements: [], unparsedRows: [] }),
      ),
    ]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    expect(file.error?.code).toBe('EMPTY_STATEMENT')
    expect(file.error?.message).toContain('no trae ni una línea de movimiento')
    expect(file.imported).toBe(0)
    expect(result.importedCount).toBe(0)
    expect(result.failedCount).toBe(1)
    // The two halves of the hole: it is not counted as imported AND it stays
    // pending in Drive, so it can be retried.
    expect(file.movedToProcessed).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('creates no account for a file that brings no movement (C3)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: iban, movements: [] }))]

    const result = await run(client, parsers)

    expect(attempted(result).account).toBeNull()
    // The check runs before the account is resolved: an empty file cannot even
    // leave an account behind.
    expect(await accountsOfTheBank(bank)).toBe(0)
    expect(await app.prisma.account.findUnique({ where: { iban } })).toBeNull()
  })

  it('fails a file whose rows could ALL not be read with its own code, and does NOT move it (C4)', async () => {
    const bank = uniqueBank()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: uniqueIban(),
          movements: [],
          unparsedRows: [
            { row: 2, reason: 'importe no interpretable' },
            { row: 3, reason: 'importe no interpretable' },
          ],
        }),
      ),
    ]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    // A different case from the empty one, so a different code: a full file
    // nobody can read is a format that changed.
    expect(file.error?.code).toBe('ALL_ROWS_UNPARSED')
    expect(file.error?.message).toContain('ninguna de las 2 líneas')
    expect(file.unparsedCount).toBe(2)
    expect(file.unparsedRows).toHaveLength(2)
    expect(file.movedToProcessed).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps moving a file where SOME rows were read: the rule is about zero, not about partial (C6)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [
      fakeAdapter(bank, () =>
        statement(bank, {
          accountIban: iban,
          movements: [movement({ description: 'THE ONE GOOD ROW' })],
          unparsedRows: [{ row: 7, reason: 'fecha de valor inválida' }],
        }),
      ),
    ]

    const result = await run(client, parsers)

    expect(attempted(result)).toMatchObject({
      status: 'imported',
      imported: 1,
      unparsedCount: 1,
      movedToProcessed: true,
    })
    expect(update).toHaveBeenCalledOnce()
  })

  // ── Feature 21 `iban-normalization` ──────────────────────────────────────
  //
  // Criteria C2, C4 and C8 at the seam: the importer is where an IBAN becomes
  // an account, so it is where the same account written two ways used to become
  // two accounts.
  it('lands the file on the SAME account when the iban is written with spaces (C2, C8)', async () => {
    const bank = uniqueBank()
    const iban = uniqueIban()
    const spaced = (iban.match(/.{1,4}/g) ?? []).join(' ').toLowerCase()
    await app.prisma.account.create({ data: { iban, bank, alias: 'the one and only' } })
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: spaced }))]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('imported')
    expect(file.account).toMatchObject({ iban, created: false })
    // The whole point of the feature: ONE account, not two.
    expect(await accountsOfTheBank(bank)).toBe(1)
    const stored = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(await app.prisma.movement.count({ where: { accountId: stored.id } })).toBe(1)
  })

  it('fails the file and creates NO account when its iban is not valid (C4)', async () => {
    const bank = uniqueBank()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    // What a bank parser does with a mistyped IBAN since feature 21: it rejects
    // the file, the same way it rejects one that is not UTF-8.
    const parsers = [
      fakeAdapter(bank, () => {
        throw new InvalidIbanError(
          'el iban de la línea 2 no es válido: el dígito de control no cuadra',
        )
      }),
    ]

    const result = await run(client, parsers)

    const file = attempted(result)
    expect(file.status).toBe('failed')
    expect(file.error?.code).toBe('INVALID_IBAN')
    expect(file.error?.message).toContain('el dígito de control no cuadra')
    expect(file.imported).toBe(0)
    expect(await accountsOfTheBank(bank)).toBe(0)
    // And the file stays pending in Drive, so fixing the line and re-running is
    // all it takes: nothing was half-imported (C8).
    expect(file.movedToProcessed).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})

// ── Feature 26: the SECOND registry, the product files ──────────────────────
//
// 🔒 Nothing here is real (ADR-017): the bank slugs are unique `zz-product-…`,
// the account names are generated and the five amounts are built by hand so
// they add up. The importer knows no bank and neither does its suite: the
// product adapter below is declared HERE, in the test.

/** The account file as the human writes it, wrong values included. */
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

function productBytes(file: ProductFile): Buffer {
  return Buffer.from(`${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

/**
 * A PRODUCT parser adapter declared HERE, like `fakeAdapter` above. It repeats
 * the ONE rule this feature must not weaken -- the five amounts have to add up,
 * checked in whole cents -- because that check has to happen BEFORE anything is
 * written, and that is what these tests exercise.
 */
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
        throw new ValidationError(
          `los importes no cuadran: saldo final esperado ${(expected / 100).toFixed(2)}, ` +
            `escrito ${Number(raw.balance).toFixed(2)}`,
        )
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

describe('importPending: the product files (feature 26)', () => {
  let app: FastifyInstance
  let rawCopyBaseDir: string
  const usedBanks: string[] = []
  let bankCounter = 0

  function uniqueBank(): string {
    bankCounter += 1
    const slug = `zz-product-${Date.now()}-${bankCounter}`
    usedBanks.push(slug)
    return slug
  }

  function uniqueAccountName(): string {
    bankCounter += 1
    return `Cuenta Sintetica ${Date.now()}-${bankCounter}`
  }

  function run(
    client: AppDriveClient,
    parsers: BankParserAdapter[],
    productParsers: ProductParserAdapter[],
  ) {
    return importPending({
      client,
      prisma: app.prisma,
      rootFolderId: 'root',
      rawCopyBaseDir,
      parsers,
      productParsers,
    })
  }

  function productReport(report: { files: unknown[] }, index = 0): AttemptedProductFileReport {
    return report.files[index] as AttemptedProductFileReport
  }

  function productsOfTheBank(bank: string) {
    return app.prisma.investmentProduct.findMany({ where: { bank } })
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  beforeEach(async () => {
    rawCopyBaseDir = await mkdtemp(join(tmpdir(), 'import-product-'))
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
      const accounts = await app.prisma.account.findMany({
        where: { OR: usedBanks.map((bank) => ({ bank: { equals: bank, mode: 'insensitive' } })) },
      })
      const accountIds = accounts.map((account) => account.id)
      await app.prisma.movement.deleteMany({ where: { accountId: { in: accountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } })
      usedBanks.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  it('stops reporting the .json as skipped: it persists it and moves it (R10, R12, R13)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    const { client, update } = buildDrive(
      treeWith(bank, [{ id: 'f1', name: 'cuenta-remunerada-2026-08-31.json' }]),
      { get: vi.fn(async () => ({ data: productBytes(productFile({ name })) })) },
    )

    const result = await run(client, [], [fakeProductAdapter(bank)])

    const file = productReport(result)
    expect(file.status).toBe('imported')
    expect(result.skippedCount).toBe(0)
    expect(file.product).toMatchObject({ bank, name, type: 'savings_account', created: true })
    expect(file.snapshot).toEqual({ date: '2026-08-31', created: true })
    // The move is a CONSEQUENCE of storing: the row is there and only then the
    // original travels to `procesados/` (ADR-025).
    expect(file.movedToProcessed).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)

    const [product] = await productsOfTheBank(bank)
    expect(product.name).toBe(name)
    const photos = await app.prisma.savingsSnapshot.findMany({ where: { productId: product.id } })
    expect(photos).toHaveLength(1)
    expect(photos[0]?.balance.toFixed(2)).toBe('4006.40')
    expect(photos[0]?.interest.toFixed(2)).toBe('6.40')
  })

  it('takes the bank from the FOLDER and never from what the parser claims (R4)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'cuenta.json' }]), {
      get: vi.fn(async () => ({ data: productBytes(productFile({ name })) })),
    })

    await run(client, [], [fakeProductAdapter(bank)])

    // The double returns `bank: 'never-this-one'` on purpose.
    expect(await app.prisma.investmentProduct.count({ where: { bank: 'never-this-one' } })).toBe(0)
    expect((await productsOfTheBank(bank))[0]?.bank).toBe(bank)
  })

  it('leaves NO trace when the five amounts do not add up (R8, R9, R12)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'cuenta.json' }]), {
      // A mistyped digit: 4106.40 where 4006.40 was due.
      get: vi.fn(async () => ({ data: productBytes(productFile({ name, balance: 4106.4 })) })),
    })

    const result = await run(client, [], [fakeProductAdapter(bank)])

    const file = productReport(result)
    expect(file.status).toBe('failed')
    expect(result.failedCount).toBe(1)
    expect(file.error?.message).toContain('los importes no cuadran')
    expect(file.error?.message).toContain('4106.40')
    expect(file.product).toBeNull()
    expect(file.snapshot).toBeNull()
    // Not the product, not the photo, and not the move: the file stays pending
    // in Drive so it can be fixed and uploaded again.
    expect(file.movedToProcessed).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(await productsOfTheBank(bank)).toEqual([])
    expect(await app.prisma.savingsSnapshot.count({ where: { product: { bank } } })).toBe(0)
  })

  it('reports created:false on the second pass of the same month (R6, R13)', async () => {
    const bank = uniqueBank()
    const name = uniqueAccountName()
    const drive = () =>
      buildDrive(treeWith(bank, [{ id: 'f1', name: 'cuenta.json' }]), {
        get: vi.fn(async () => ({ data: productBytes(productFile({ name, balance: 4006.41 })) })),
      })

    const first = await run(drive().client, [], [fakeProductAdapter(bank)])
    const second = await run(drive().client, [], [fakeProductAdapter(bank)])

    expect(productReport(first).product?.created).toBe(true)
    expect(productReport(first).snapshot?.created).toBe(true)
    expect(productReport(second).product?.created).toBe(false)
    expect(productReport(second).snapshot?.created).toBe(false)
    expect(await productsOfTheBank(bank)).toHaveLength(1)
    expect(await app.prisma.savingsSnapshot.count({ where: { product: { bank } } })).toBe(1)
  })

  it('keeps a file no registry reads as skipped, with the statement reason (R14)', async () => {
    const bank = uniqueBank()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'extracto.pdf' }]))

    const result = await run(client, [], [fakeProductAdapter(bank)])

    const file = result.files[0] as { status: string; reason: string; movedToProcessed: boolean }
    expect(file.status).toBe('skipped')
    expect(result.skippedCount).toBe(1)
    expect(file.reason).toBe(`no hay parser para el banco ${bank}`)
    expect(file.movedToProcessed).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('imports a statement exactly as before while the product registry is wired (R14)', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()
    const { client, update } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'movs.csv' }]))
    const parsers = [fakeAdapter(bank, () => statement(bank, { accountIban: iban }))]

    const result = await run(client, parsers, [fakeProductAdapter(bank)])

    const file = result.files[0] as AttemptedFileReport
    expect(file.status).toBe('imported')
    expect(result.importedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(file.account?.iban).toBe(iban)
    expect(file.movedToProcessed).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    // And not one investment row came out of a statement.
    expect(await productsOfTheBank(bank)).toEqual([])
  })

  it('writes no Account and no Movement when a product file is imported (R14)', async () => {
    const bank = uniqueBank()
    const accountsBefore = await app.prisma.account.count()
    const movementsBefore = await app.prisma.movement.count()
    const { client } = buildDrive(treeWith(bank, [{ id: 'f1', name: 'cuenta.json' }]), {
      get: vi.fn(async () => ({ data: productBytes(productFile({ name: uniqueAccountName() })) })),
    })

    await run(client, [], [fakeProductAdapter(bank)])

    expect(await app.prisma.account.count()).toBe(accountsBefore)
    expect(await app.prisma.movement.count()).toBe(movementsBefore)
  })
})
