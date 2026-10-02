// Feature 48 `import-warnings-persistence`: the two HTTP routes of the warnings,
// through the REAL app (`buildApp()` + `app.inject()`) against the throwaway test
// database.
//
// 🔒 Everything here is synthetic: a made-up bank slug, a made-up file name,
// invented amounts and a `syntheticIban()` account. Nothing of the owner's own
// files reaches this repository (ADR-017).
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { BalanceMismatch } from './import.balance.service.js'
import { persistImportWarnings } from './import.warnings.service.js'
import type {
  ImportWarningsReport,
  SerializedBalanceMismatch,
  SerializedUnparsedRow,
  WarningFileRef,
} from './import.warnings.types.js'

const bank = 'zz-warnings-routes-bank'
const file: WarningFileRef = { bank, year: '2026', name: 'extracto-sintetico.xlsx' }

const warningsUrl = '/api/import/warnings'
const mismatchUrl = (id: number) => `${warningsUrl}/balance-mismatches/${id}`

describe('import warnings routes (feature 48)', () => {
  let app: FastifyInstance
  let accountId: number
  let accountAlias: string

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

  /** The stored descuadre of `mismatch()`, with the id the database gave it. */
  async function seedOneMismatch(overrides: Partial<BalanceMismatch> = {}) {
    await persistImportWarnings(app.prisma, file, {
      unparsedRows: [],
      balanceMismatches: [mismatch(overrides)],
    })
    return app.prisma.importBalanceMismatch.findFirstOrThrow({ orderBy: { id: 'desc' } })
  }

  // The listing is global (it has no filter), so a leftover row of another case
  // would change `counts`: the two tables are emptied around every test.
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

  it('registers the two routes under the /api/import prefix of the real app (R9, R11)', () => {
    expect(app.hasRoute({ method: 'GET', url: warningsUrl })).toBe(true)
    expect(app.hasRoute({ method: 'PATCH', url: `${warningsUrl}/balance-mismatches/:id` })).toBe(
      true,
    )
  })

  it('answers 200 with the two lists and their counts (R9)', async () => {
    await persistImportWarnings(app.prisma, file, {
      unparsedRows: [{ row: 14, reason: 'importe vacío' }],
      balanceMismatches: [mismatch()],
    })

    const response = await app.inject({ method: 'GET', url: warningsUrl })

    expect(response.statusCode).toBe(200)
    const body = response.json<ImportWarningsReport>()
    expect(body.counts).toEqual({ unparsedRows: 1, balanceMismatches: 1 })
    expect(body.unparsedRows[0]).toMatchObject({
      file: { bank: file.bank, year: file.year, name: file.name },
      row: 14,
      reason: 'importe vacío',
    })
    expect(body.balanceMismatches[0]).toMatchObject({
      file: { bank: file.bank, year: file.year, name: file.name },
      accountId,
      accountAlias,
      date: '2026-09-14',
      computed: '100.00',
      fromFile: '90.00',
      difference: '10.00',
      check: 'per-line',
      status: 'pending',
      note: null,
    })
    expect(body.balanceMismatches[0]?.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
    expect(body.balanceMismatches[0]?.lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('answers 200 with two empty lists when there is nothing open (R9)', async () => {
    const response = await app.inject({ method: 'GET', url: warningsUrl })

    expect(response.statusCode).toBe(200)
    expect(response.json<ImportWarningsReport>()).toEqual({
      unparsedRows: [],
      balanceMismatches: [],
      counts: { unparsedRows: 0, balanceMismatches: 0 },
    })
  })

  it('leaves a reviewed descuadre out of the listing and out of its counter (R10)', async () => {
    const reviewed = await seedOneMismatch()
    const stillOpen = await seedOneMismatch({
      date: '2026-09-15',
      computed: '80.00',
      fromFile: '70.00',
    })
    await app.inject({
      method: 'PATCH',
      url: mismatchUrl(reviewed.id),
      payload: { status: 'reviewed' },
    })

    const response = await app.inject({ method: 'GET', url: warningsUrl })

    expect(response.statusCode).toBe(200)
    const body = response.json<ImportWarningsReport>()
    expect(body.counts.balanceMismatches).toBe(1)
    expect(body.balanceMismatches.map((item) => item.id)).toEqual([stillOpen.id])
  })

  it('marks a descuadre reviewed with its note and returns it serialized (R11)', async () => {
    const stored = await seedOneMismatch()

    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: { status: 'reviewed', note: 'cuadra con el extracto en papel' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<SerializedBalanceMismatch>()).toMatchObject({
      id: stored.id,
      status: 'reviewed',
      note: 'cuadra con el extracto en papel',
      computed: '100.00',
      fromFile: '90.00',
      difference: '10.00',
      accountId,
      accountAlias,
      check: 'per-line',
    })
    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.status).toBe('reviewed')
    expect(after.reviewedAt).not.toBeNull()
  })

  it('puts a reviewed descuadre back to pending keeping its note (R12)', async () => {
    const stored = await seedOneMismatch()
    await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: { status: 'reviewed', note: 'nota mía' },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: { status: 'pending' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedBalanceMismatch>()
    expect(body.status).toBe('pending')
    expect(body.note).toBe('nota mía')
    const listed = await app.inject({ method: 'GET', url: warningsUrl })
    expect(listed.json<ImportWarningsReport>().counts.balanceMismatches).toBe(1)
  })

  it('answers 404 NOT_FOUND when the id is of no stored descuadre (R13)', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(999_999_999),
      payload: { status: 'reviewed' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('answers 400 VALIDATION_ERROR to an empty body, changing nothing (R14)', async () => {
    const stored = await seedOneMismatch()

    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.status).toBe('pending')
    expect(after.note).toBeNull()
  })

  it('answers 400 VALIDATION_ERROR to a property that is not admitted, changing nothing (R14)', async () => {
    const stored = await seedOneMismatch()

    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: { status: 'reviewed', computed: '0.00' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.status).toBe('pending')
    expect(after.computed.toFixed(2)).toBe('100.00')
  })

  it('answers 400 VALIDATION_ERROR to a status outside the enumeration (R14)', async () => {
    const stored = await seedOneMismatch()

    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: { status: 'closed' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.status).toBe('pending')
  })

  it('answers 400 VALIDATION_ERROR to a note longer than the 500 characters allowed (R14)', async () => {
    const stored = await seedOneMismatch()

    const response = await app.inject({
      method: 'PATCH',
      url: mismatchUrl(stored.id),
      payload: { note: 'a'.repeat(501) },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    const after = await app.prisma.importBalanceMismatch.findUniqueOrThrow({
      where: { id: stored.id },
    })
    expect(after.note).toBeNull()
  })

  it('answers 400 VALIDATION_ERROR to an id that is not a number (R14)', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `${warningsUrl}/balance-mismatches/not-a-number`,
      payload: { status: 'reviewed' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })
})

// Feature 54 `unparsed-row-review`: the route that gives an unreadable row for
// reviewed, and what the listing answers once one is. Synthetic data only.
describe('unreadable row review routes (feature 54)', () => {
  let app: FastifyInstance

  const reviewFile: WarningFileRef = {
    bank: 'zz-row-review-routes-bank',
    year: '2026',
    name: 'extracto-inventado-revision.csv',
  }
  const unparsedRowUrl = (id: number | string) => `${warningsUrl}/unparsed-rows/${id}`
  const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  const serializedRowFields = [
    'id',
    'file',
    'row',
    'reason',
    'status',
    'note',
    'reviewedAt',
    'detectedAt',
  ]

  async function emptyUnparsedRows() {
    await app.prisma.importUnparsedRow.deleteMany({})
  }

  /** One stored unreadable row, with the id the database gave it. */
  async function seedRow(row: number, reason = 'importe vacío') {
    await persistImportWarnings(app.prisma, reviewFile, {
      unparsedRows: [{ row, reason }],
      balanceMismatches: [],
    })
    return app.prisma.importUnparsedRow.findFirstOrThrow({ where: { rowNumber: row } })
  }

  function patch(id: number | string, payload: Record<string, unknown>) {
    return app.inject({ method: 'PATCH', url: unparsedRowUrl(id), payload })
  }

  function storedRow(id: number) {
    return app.prisma.importUnparsedRow.findUniqueOrThrow({ where: { id } })
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  beforeEach(emptyUnparsedRows)
  afterEach(emptyUnparsedRows)

  afterAll(async () => {
    await app.close()
  })

  it('registers the unreadable-row review route under the /api/import prefix', () => {
    expect(app.hasRoute({ method: 'PATCH', url: `${warningsUrl}/unparsed-rows/:id` })).toBe(true)
  })

  it('marks an unreadable row reviewed with its note and returns it serialized', async () => {
    const stored = await seedRow(58)
    const before = Date.now()

    const response = await patch(stored.id, {
      status: 'reviewed',
      note: 'es la fila de totales, no un movimiento',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedUnparsedRow>()
    expect(Object.keys(body)).toEqual(serializedRowFields)
    expect(body).toMatchObject({
      id: stored.id,
      file: { bank: reviewFile.bank, year: reviewFile.year, name: reviewFile.name },
      row: 58,
      reason: 'importe vacío',
      status: 'reviewed',
      note: 'es la fila de totales, no un movimiento',
      detectedAt: stored.createdAt.toISOString(),
    })
    expect(Object.keys(body.file)).toEqual(['bank', 'year', 'name'])
    expect(body.reviewedAt).toMatch(isoUtc)
    // The moment of THIS request, not any other date of the row.
    const reviewedAt = new Date(body.reviewedAt ?? '').getTime()
    expect(reviewedAt).toBeGreaterThanOrEqual(before)
    expect(reviewedAt).toBeLessThanOrEqual(Date.now())
    // Reviewing never deletes the row (R10).
    expect(await app.prisma.importUnparsedRow.count()).toBe(1)
    const after = await storedRow(stored.id)
    expect(after.status).toBe('reviewed')
    expect(after.note).toBe('es la fila de totales, no un movimiento')
    expect(after.reviewedAt?.toISOString()).toBe(body.reviewedAt)
  })

  it('marks an unreadable row reviewed without any note', async () => {
    const stored = await seedRow(58)

    const response = await patch(stored.id, { status: 'reviewed' })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedUnparsedRow>()
    expect(body.status).toBe('reviewed')
    expect(body.note).toBeNull()
    expect(body.reviewedAt).toMatch(isoUtc)
  })

  it('puts a reviewed unreadable row back to pending keeping its note', async () => {
    const stored = await seedRow(58)
    await patch(stored.id, { status: 'reviewed', note: 'la marqué sin querer' })

    const response = await patch(stored.id, { status: 'pending' })

    expect(response.statusCode).toBe(200)
    const body = response.json<SerializedUnparsedRow>()
    expect(Object.keys(body)).toEqual(serializedRowFields)
    expect(body.status).toBe('pending')
    expect(body.reviewedAt).toBeNull()
    expect(body.note).toBe('la marqué sin querer')
    const after = await storedRow(stored.id)
    expect(after.status).toBe('pending')
    expect(after.reviewedAt).toBeNull()
    expect(after.note).toBe('la marqué sin querer')
  })

  it('stores only the note of an unreadable row without touching its status', async () => {
    const pending = await seedRow(58)
    const reviewed = await seedRow(61, 'fecha ilegible')
    const reviewResponse = await patch(reviewed.id, { status: 'reviewed' })
    const reviewedAt = reviewResponse.json<SerializedUnparsedRow>().reviewedAt
    expect(reviewedAt).toMatch(isoUtc)

    const onPending = await patch(pending.id, { note: 'pendiente de mirar con calma' })
    const onReviewed = await patch(reviewed.id, { note: 'cabecera repetida a mitad de archivo' })

    expect(onPending.statusCode).toBe(200)
    expect(onPending.json<SerializedUnparsedRow>()).toMatchObject({
      status: 'pending',
      note: 'pendiente de mirar con calma',
      reviewedAt: null,
    })
    expect(onReviewed.statusCode).toBe(200)
    expect(onReviewed.json<SerializedUnparsedRow>()).toMatchObject({
      status: 'reviewed',
      note: 'cabecera repetida a mitad de archivo',
      reviewedAt,
    })

    // `null` clears the note, and still touches neither status nor date.
    const cleared = await patch(reviewed.id, { note: null })

    expect(cleared.statusCode).toBe(200)
    expect(cleared.json<SerializedUnparsedRow>()).toMatchObject({
      status: 'reviewed',
      note: null,
      reviewedAt,
    })
    const after = await storedRow(reviewed.id)
    expect(after.status).toBe('reviewed')
    expect(after.note).toBeNull()
    expect(after.reviewedAt?.toISOString()).toBe(reviewedAt)
  })

  it('answers 404 NOT_FOUND when the id is of no stored unreadable row', async () => {
    const response = await patch(999_999_999, { status: 'reviewed' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('answers 400 VALIDATION_ERROR to a bad body or id of the unreadable-row route, changing nothing', async () => {
    const stored = await seedRow(58)
    const untouched = await storedRow(stored.id)

    const badRequests: Array<[string, number | string, Record<string, unknown>]> = [
      ['an empty body', stored.id, {}],
      ['a property that is not admitted', stored.id, { status: 'reviewed', reason: 'otro' }],
      ['a status outside the enumeration', stored.id, { status: 'closed' }],
      ['a note longer than 500 characters', stored.id, { note: 'a'.repeat(501) }],
      ['an id that is not an integer >= 1', 0, { status: 'reviewed' }],
      ['an id that is not a number', 'not-a-number', { status: 'reviewed' }],
    ]

    for (const [what, id, payload] of badRequests) {
      const response = await patch(id, payload)

      expect(response.statusCode, what).toBe(400)
      expect(response.json(), what).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
      expect(await storedRow(stored.id), what).toEqual(untouched)
    }
    expect(await app.prisma.importUnparsedRow.count()).toBe(1)
  })

  it('lists a reviewed unreadable row as reviewed, with its note and when it was reviewed', async () => {
    const reviewed = await seedRow(58)
    const stillPending = await seedRow(61, 'fecha ilegible')
    const reviewResponse = await patch(reviewed.id, {
      status: 'reviewed',
      note: 'línea en blanco con un espacio',
    })
    const reviewedAt = reviewResponse.json<SerializedUnparsedRow>().reviewedAt

    const response = await app.inject({ method: 'GET', url: warningsUrl })

    expect(response.statusCode).toBe(200)
    const body = response.json<ImportWarningsReport>()
    // Both are listed, in the order the listing already had: newest first.
    expect(body.unparsedRows.map((row) => row.id)).toEqual([stillPending.id, reviewed.id])
    for (const row of body.unparsedRows) {
      expect(Object.keys(row)).toEqual(serializedRowFields)
    }
    expect(reviewedAt).toMatch(isoUtc)
    expect(body.unparsedRows[1]).toMatchObject({
      id: reviewed.id,
      row: 58,
      status: 'reviewed',
      note: 'línea en blanco con un espacio',
      reviewedAt,
    })
    expect(body.unparsedRows[0]).toMatchObject({
      id: stillPending.id,
      row: 61,
      status: 'pending',
      note: null,
      reviewedAt: null,
    })
  })

  it('counts only the unreadable rows still pending', async () => {
    const reviewed = await seedRow(58)
    await seedRow(61, 'fecha ilegible')
    await patch(reviewed.id, { status: 'reviewed' })

    const response = await app.inject({ method: 'GET', url: warningsUrl })

    expect(response.statusCode).toBe(200)
    const body = response.json<ImportWarningsReport>()
    expect(body.counts.unparsedRows).toBe(1)
    expect(body.unparsedRows).toHaveLength(2)
    expect(body.counts.balanceMismatches).toBe(0)
  })
})
