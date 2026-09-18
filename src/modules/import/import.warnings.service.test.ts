// Feature 48 `import-warnings-persistence`: the single writer and the two
// readers of the warning tables, against the throwaway test database.
//
// 🔒 Everything here is synthetic: a made-up bank slug, a made-up file name,
// invented amounts and a `syntheticIban()` account. Nothing of the owner's own
// files reaches this repository (ADR-017).
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { AppError } from '../../errors/app-error.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { UnparsedRow } from '../../lib/parsed-statement.js'
import type { BalanceMismatch } from './import.balance.service.js'
import {
  listPendingImportWarnings,
  persistImportWarnings,
  reviewBalanceMismatch,
} from './import.warnings.service.js'
import type { ImportWarningsInput, WarningFileRef } from './import.warnings.types.js'

const bank = 'test-warnings-bank'

const file: WarningFileRef = { bank, year: '2026', name: 'extracto-sintetico.xlsx' }
const otherFile: WarningFileRef = { bank, year: '2026', name: 'otro-extracto-sintetico.xlsx' }

describe('import warnings service (feature 48)', () => {
  let app: FastifyInstance
  let accountId: number
  let accountAlias: string

  function unparsed(overrides: Partial<UnparsedRow> = {}): UnparsedRow {
    return { row: 14, reason: 'importe vacío', ...overrides }
  }

  function mismatch(overrides: Partial<BalanceMismatch> = {}): BalanceMismatch {
    return {
      accountId,
      accountAlias,
      date: '2026-09-14',
      computed: '100.00',
      fromFile: '90.00',
      difference: '10.00',
      check: 'per-line',
      ...overrides,
    }
  }

  function warnings(overrides: Partial<ImportWarningsInput> = {}): ImportWarningsInput {
    return { unparsedRows: [], balanceMismatches: [], ...overrides }
  }

  // The two tables are emptied around every test because the listing is global
  // (it has no filter): a leftover row of another case would change `counts`.
  async function emptyWarningTables() {
    await app.prisma.importBalanceMismatch.deleteMany({})
    await app.prisma.importUnparsedRow.deleteMany({})
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: `${bank} ···0000` },
    })
    accountId = account.id
    accountAlias = account.alias
  })

  beforeEach(emptyWarningTables)
  afterEach(emptyWarningTables)

  afterAll(async () => {
    await emptyWarningTables()
    await app.prisma.account.delete({ where: { id: accountId } })
    await app.close()
  })

  it('stores one row per unreadable row, with its file, its number and its reason (R1)', async () => {
    await persistImportWarnings(
      app.prisma,
      file,
      warnings({
        unparsedRows: [unparsed({ row: 14 }), unparsed({ row: 22, reason: 'fecha ilegible' })],
      }),
    )

    const stored = await app.prisma.importUnparsedRow.findMany({ orderBy: { rowNumber: 'asc' } })
    expect(stored).toHaveLength(2)
    expect(stored[0]).toMatchObject({
      bank: file.bank,
      year: file.year,
      fileName: file.name,
      rowNumber: 14,
      reason: 'importe vacío',
    })
    expect(stored[1]).toMatchObject({ rowNumber: 22, reason: 'fecha ilegible' })
  })

  it('stores one row per descuadre with the account, the date, the two amounts and the check (R2)', async () => {
    await persistImportWarnings(
      app.prisma,
      file,
      warnings({
        balanceMismatches: [
          mismatch({ check: 'per-line', computed: '100.00', fromFile: '90.00' }),
          mismatch({
            check: 'statement-balance',
            date: '2026-09-15',
            computed: '250.50',
            fromFile: '250.00',
            difference: '0.50',
          }),
        ],
      }),
    )

    const stored = await app.prisma.importBalanceMismatch.findMany({ orderBy: { id: 'asc' } })
    expect(stored).toHaveLength(2)
    expect(stored[0]).toMatchObject({
      bank: file.bank,
      year: file.year,
      fileName: file.name,
      accountId,
      check: 'per-line',
      status: 'pending',
      note: null,
      reviewedAt: null,
    })
    expect(stored[0]?.bookingDate.toISOString().slice(0, 10)).toBe('2026-09-14')
    expect(stored[0]?.computed.toFixed(2)).toBe('100.00')
    expect(stored[0]?.fromFile.toFixed(2)).toBe('90.00')
    expect(stored[1]).toMatchObject({ check: 'statement-balance' })
    expect(stored[1]?.computed.toFixed(2)).toBe('250.50')
  })

  it('writes nothing at all when the file left no warning (R8)', async () => {
    await persistImportWarnings(app.prisma, file, warnings())

    expect(await app.prisma.importUnparsedRow.count()).toBe(0)
    expect(await app.prisma.importBalanceMismatch.count()).toBe(0)
    const report = await listPendingImportWarnings(app.prisma)
    expect(report.counts).toEqual({ unparsedRows: 0, balanceMismatches: 0 })
  })

  it('reimporting the same file updates the same warnings instead of duplicating them (R6)', async () => {
    const input = warnings({
      unparsedRows: [unparsed({ row: 14 })],
      balanceMismatches: [mismatch()],
    })
    await persistImportWarnings(app.prisma, file, input)
    const firstRow = await app.prisma.importUnparsedRow.findFirstOrThrow()
    const firstMismatch = await app.prisma.importBalanceMismatch.findFirstOrThrow()

    await persistImportWarnings(app.prisma, file, {
      unparsedRows: [unparsed({ row: 14, reason: 'importe vacío (motivo nuevo)' })],
      balanceMismatches: [mismatch()],
    })

    expect(await app.prisma.importUnparsedRow.count()).toBe(1)
    expect(await app.prisma.importBalanceMismatch.count()).toBe(1)
    const rowAfter = await app.prisma.importUnparsedRow.findFirstOrThrow()
    expect(rowAfter.id).toBe(firstRow.id)
    expect(rowAfter.reason).toBe('importe vacío (motivo nuevo)')
    const mismatchAfter = await app.prisma.importBalanceMismatch.findFirstOrThrow()
    expect(mismatchAfter.id).toBe(firstMismatch.id)
    expect(mismatchAfter.updatedAt.getTime()).toBeGreaterThanOrEqual(
      firstMismatch.updatedAt.getTime(),
    )
  })

  it('tells two warnings of DIFFERENT files apart even with the same contents (R6)', async () => {
    const input = warnings({
      unparsedRows: [unparsed({ row: 14 })],
      balanceMismatches: [mismatch()],
    })
    await persistImportWarnings(app.prisma, file, input)
    await persistImportWarnings(app.prisma, otherFile, input)

    expect(await app.prisma.importUnparsedRow.count()).toBe(2)
    expect(await app.prisma.importBalanceMismatch.count()).toBe(2)
  })

  it('reimporting does NOT resurrect a descuadre already reviewed, and keeps its note (R7)', async () => {
    await persistImportWarnings(app.prisma, file, warnings({ balanceMismatches: [mismatch()] }))
    const stored = await app.prisma.importBalanceMismatch.findFirstOrThrow()
    await reviewBalanceMismatch(app.prisma, stored.id, {
      status: 'reviewed',
      note: 'lo miré en la web del banco',
    })

    await persistImportWarnings(app.prisma, file, warnings({ balanceMismatches: [mismatch()] }))

    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.status).toBe('reviewed')
    expect(after.note).toBe('lo miré en la web del banco')
    expect(after.reviewedAt).not.toBeNull()
    const report = await listPendingImportWarnings(app.prisma)
    expect(report.balanceMismatches).toEqual([])
    expect(report.counts.balanceMismatches).toBe(0)
  })

  it('lists the two kinds serialized as the report already writes them (R9)', async () => {
    await persistImportWarnings(
      app.prisma,
      file,
      warnings({ unparsedRows: [unparsed({ row: 14 })], balanceMismatches: [mismatch()] }),
    )

    const report = await listPendingImportWarnings(app.prisma)

    expect(report.counts).toEqual({ unparsedRows: 1, balanceMismatches: 1 })
    expect(report.unparsedRows[0]).toMatchObject({
      file: { bank: file.bank, year: file.year, name: file.name },
      row: 14,
      reason: 'importe vacío',
    })
    expect(report.unparsedRows[0]?.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
    expect(report.balanceMismatches[0]).toMatchObject({
      file: { bank: file.bank, year: file.year, name: file.name },
      accountId,
      accountAlias,
      date: '2026-09-14',
      computed: '100.00',
      fromFile: '90.00',
      // Derived when serializing, never stored: 100.00 − 90.00.
      difference: '10.00',
      check: 'per-line',
      status: 'pending',
      note: null,
    })
  })

  it('lists the most recent warning first (R9)', async () => {
    await persistImportWarnings(
      app.prisma,
      file,
      warnings({ unparsedRows: [unparsed({ row: 14 })] }),
    )
    await persistImportWarnings(
      app.prisma,
      otherFile,
      warnings({ unparsedRows: [unparsed({ row: 7, reason: 'fecha ilegible' })] }),
    )

    const report = await listPendingImportWarnings(app.prisma)

    expect(report.unparsedRows.map((row) => row.file.name)).toEqual([otherFile.name, file.name])
  })

  it('leaves a reviewed descuadre out of the list and out of its counter (R10)', async () => {
    await persistImportWarnings(
      app.prisma,
      file,
      warnings({
        balanceMismatches: [
          mismatch({ date: '2026-09-14' }),
          mismatch({ date: '2026-09-15', computed: '80.00', fromFile: '70.00' }),
        ],
      }),
    )
    const first = await app.prisma.importBalanceMismatch.findFirstOrThrow({
      where: { bookingDate: new Date('2026-09-14T00:00:00.000Z') },
    })
    const second = await app.prisma.importBalanceMismatch.findFirstOrThrow({
      where: { bookingDate: new Date('2026-09-15T00:00:00.000Z') },
    })

    await reviewBalanceMismatch(app.prisma, first.id, { status: 'reviewed' })

    const report = await listPendingImportWarnings(app.prisma)
    expect(report.counts.balanceMismatches).toBe(1)
    expect(report.balanceMismatches.map((item) => item.id)).toEqual([second.id])
  })

  it('marks a descuadre reviewed with its note and returns it serialized (R11)', async () => {
    await persistImportWarnings(app.prisma, file, warnings({ balanceMismatches: [mismatch()] }))
    const stored = await app.prisma.importBalanceMismatch.findFirstOrThrow()

    const result = await reviewBalanceMismatch(app.prisma, stored.id, {
      status: 'reviewed',
      note: 'cuadra con el extracto en papel',
    })

    expect(result).toMatchObject({
      id: stored.id,
      status: 'reviewed',
      note: 'cuadra con el extracto en papel',
      computed: '100.00',
      fromFile: '90.00',
      difference: '10.00',
      accountAlias,
    })
    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.reviewedAt).not.toBeNull()
  })

  it('puts a reviewed descuadre back to pending keeping its note (R12)', async () => {
    await persistImportWarnings(app.prisma, file, warnings({ balanceMismatches: [mismatch()] }))
    const stored = await app.prisma.importBalanceMismatch.findFirstOrThrow()
    await reviewBalanceMismatch(app.prisma, stored.id, { status: 'reviewed', note: 'nota mía' })

    const result = await reviewBalanceMismatch(app.prisma, stored.id, { status: 'pending' })

    expect(result.status).toBe('pending')
    expect(result.note).toBe('nota mía')
    const report = await listPendingImportWarnings(app.prisma)
    expect(report.counts.balanceMismatches).toBe(1)
  })

  it('throws NOT_FOUND when the id is of no stored descuadre (R13)', async () => {
    await expect(
      reviewBalanceMismatch(app.prisma, 999_999_999, { status: 'reviewed' }),
    ).rejects.toThrow(AppError)
    await expect(
      reviewBalanceMismatch(app.prisma, 999_999_999, { status: 'reviewed' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
