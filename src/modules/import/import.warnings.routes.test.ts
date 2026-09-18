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
