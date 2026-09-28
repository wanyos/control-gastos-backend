// Feature 49: a movement can be marked `excludedFromTotals` — it stops counting
// in the income/expense totals and nothing else about it changes — and the
// listing can be filtered by "is a transfer leg" and by "is marked". Every test
// of a rejection re-reads the rows: a 400 that still wrote something would look
// exactly the same from the status code alone.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { SerializedAccount } from '../accounts/accounts.types.js'
import type {
  BulkUpdateMovementsResult,
  MovementListResponse,
  SerializedMovement,
} from './movements.types.js'

describe('excludedFromTotals and the transfer/excluded filters (feature 49)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'myinvestor', alias: 'Exclusion test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    bookingDate?: string
    daySequence?: number
    description?: string
    balanceAfter?: string | null
    transferId?: string | null
    undoneTransferId?: string | null
    excludedFromTotals?: boolean
  }

  function seedMovement(accountId: number, overrides: SeedMovement = {}) {
    const bookingDate = new Date(`${overrides.bookingDate ?? '2026-07-24'}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: overrides.type ?? 'expense',
        amount: overrides.amount ?? '34.15',
        description: overrides.description ?? 'SYNTHETIC DEPOSIT OPENING',
        bookingDate,
        valueDate: bookingDate,
        daySequence: overrides.daySequence ?? 1,
        balanceAfter: overrides.balanceAfter ?? null,
        transferId: overrides.transferId ?? null,
        undoneTransferId: overrides.undoneTransferId ?? null,
        ...(overrides.excludedFromTotals === undefined
          ? {}
          : { excludedFromTotals: overrides.excludedFromTotals }),
      },
    })
  }

  function patchOne(id: number, body: unknown) {
    return app.inject({ method: 'PATCH', url: `/api/movements/${id}`, payload: body as object })
  }

  function patchMany(body: unknown) {
    return app.inject({ method: 'PATCH', url: '/api/movements', payload: body as object })
  }

  async function list(query: string): Promise<MovementListResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/movements?${query}` })
    expect(response.statusCode).toBe(200)
    return response.json<MovementListResponse>()
  }

  async function storedMarks(ids: number[]): Promise<boolean[]> {
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
      select: { excludedFromTotals: true },
    })
    return rows.map((row) => row.excludedFromTotals)
  }

  async function accountBalance(accountId: number): Promise<string | undefined> {
    const response = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(response.statusCode).toBe(200)
    return response.json<SerializedAccount[]>().find((account) => account.id === accountId)?.balance
  }

  function ids(movements: SerializedMovement[]): number[] {
    return movements.map((movement) => movement.id).sort((a, b) => a - b)
  }

  // ---------------------------------------------------------------- the mark

  describe('writing the mark', () => {
    it('marks and unmarks one movement with PATCH /api/movements/:id (R1)', async () => {
      const account = await createAccount()
      const movement = await seedMovement(account.id)

      const marked = await patchOne(movement.id, { excludedFromTotals: true })

      expect(marked.statusCode).toBe(200)
      expect(marked.json<SerializedMovement>().excludedFromTotals).toBe(true)
      expect(await storedMarks([movement.id])).toEqual([true])

      const unmarked = await patchOne(movement.id, { excludedFromTotals: false })

      expect(unmarked.statusCode).toBe(200)
      expect(unmarked.json<SerializedMovement>().excludedFromTotals).toBe(false)
      expect(await storedMarks([movement.id])).toEqual([false])
    })

    it('marks a transfer leg and a neutral movement too: no domain rule forbids it (R1)', async () => {
      const account = await createAccount()
      const leg = await seedMovement(account.id, { transferId: 'exclusion-test-leg' })
      const neutral = await seedMovement(account.id, {
        type: 'neutral',
        amount: '0.00',
        daySequence: 2,
      })

      expect((await patchOne(leg.id, { excludedFromTotals: true })).statusCode).toBe(200)
      expect((await patchOne(neutral.id, { excludedFromTotals: true })).statusCode).toBe(200)
      expect(await storedMarks([leg.id, neutral.id])).toEqual([true, true])
    })

    it('marks several movements with PATCH /api/movements carrying only the mark (R2)', async () => {
      const account = await createAccount()
      const first = await seedMovement(account.id, { daySequence: 1 })
      const second = await seedMovement(account.id, { daySequence: 2 })
      const untouched = await seedMovement(account.id, { daySequence: 3 })

      const response = await patchMany({ ids: [first.id, second.id], excludedFromTotals: true })

      expect(response.statusCode).toBe(200)
      const body = response.json<BulkUpdateMovementsResult>()
      expect(body.updated).toBe(2)
      expect(ids(body.movements)).toEqual([first.id, second.id].sort((a, b) => a - b))
      expect(body.movements.every((movement) => movement.excludedFromTotals)).toBe(true)
      expect(await storedMarks([first.id, second.id, untouched.id])).toEqual([true, true, false])

      const back = await patchMany({ ids: [first.id, second.id], excludedFromTotals: false })

      expect(back.statusCode).toBe(200)
      expect(await storedMarks([first.id, second.id, untouched.id])).toEqual([false, false, false])
    })

    it('writes the mark together with status in the same bulk request (R2)', async () => {
      const account = await createAccount()
      const first = await seedMovement(account.id, { daySequence: 1 })
      const second = await seedMovement(account.id, { daySequence: 2 })

      const response = await patchMany({
        ids: [first.id, second.id],
        excludedFromTotals: true,
        status: 'confirmed',
      })

      expect(response.statusCode).toBe(200)
      const stored = await app.prisma.movement.findMany({
        where: { id: { in: [first.id, second.id] } },
        orderBy: { id: 'asc' },
      })
      expect(stored.map((row) => [row.excludedFromTotals, row.status])).toEqual([
        [true, 'confirmed'],
        [true, 'confirmed'],
      ])
    })

    it('answers 404 when one id of the bulk does not exist and marks NOT ONE of the others (R2)', async () => {
      const account = await createAccount()
      const first = await seedMovement(account.id, { daySequence: 1 })
      const second = await seedMovement(account.id, { daySequence: 2 })
      const missingId = 2_147_483_000

      const response = await patchMany({
        ids: [first.id, missingId, second.id],
        excludedFromTotals: true,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(await storedMarks([first.id, second.id])).toEqual([false, false])
    })

    it.each([
      ['null', null],
      ['the string "true"', 'true'],
      ['the string "false"', 'false'],
      ['the number 1', 1],
      ['the number 0', 0],
    ])(
      'rejects %s as excludedFromTotals with 400 on both PATCH, writing nothing (R3)',
      async (_label, value) => {
        const account = await createAccount()
        const marked = await seedMovement(account.id, { daySequence: 1, excludedFromTotals: true })
        const unmarked = await seedMovement(account.id, { daySequence: 2 })

        for (const response of [
          await patchOne(marked.id, { excludedFromTotals: value }),
          await patchOne(unmarked.id, { excludedFromTotals: value }),
          await patchMany({ ids: [marked.id, unmarked.id], excludedFromTotals: value }),
          // Also when it travels next to a valid field: nothing of the request lands.
          await patchMany({
            ids: [marked.id, unmarked.id],
            status: 'confirmed',
            excludedFromTotals: value,
          }),
        ]) {
          expect(response.statusCode).toBe(400)
          expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
        }

        const stored = await app.prisma.movement.findMany({
          where: { id: { in: [marked.id, unmarked.id] } },
          orderBy: { id: 'asc' },
        })
        expect(stored.map((row) => [row.excludedFromTotals, row.status])).toEqual([
          [true, 'pending_review'],
          [false, 'pending_review'],
        ])
      },
    )

    it('ships excludedFromTotals on every movement of GET /api/movements, false by default (R4)', async () => {
      const account = await createAccount()
      // Created without mentioning the column: the database default decides.
      const fresh = await seedMovement(account.id, { daySequence: 1 })
      const marked = await seedMovement(account.id, { daySequence: 2, excludedFromTotals: true })

      expect(fresh.excludedFromTotals).toBe(false)

      const body = await list(`accountId=${account.id}`)

      const byId = new Map(body.movements.map((movement) => [movement.id, movement]))
      expect(byId.get(fresh.id)?.excludedFromTotals).toBe(false)
      expect(byId.get(marked.id)?.excludedFromTotals).toBe(true)
    })
  })

  // ---------------------------------------------------------------- the sums

  describe('the totals', () => {
    it('leaves a marked movement out of the totals and puts it back when unmarked (R5, R8)', async () => {
      const account = await createAccount()
      await seedMovement(account.id, { type: 'expense', amount: '45.90', daySequence: 1 })
      await seedMovement(account.id, { type: 'income', amount: '1200.00', daySequence: 2 })
      const deposit = await seedMovement(account.id, {
        type: 'expense',
        amount: '3000.00',
        daySequence: 3,
      })
      const maturity = await seedMovement(account.id, {
        type: 'income',
        amount: '3050.00',
        daySequence: 4,
      })

      const before = (await list(`accountId=${account.id}`)).totals
      expect(before).toEqual({ income: '4250.00', expense: '3045.90', net: '1204.10' })

      await patchMany({ ids: [deposit.id, maturity.id], excludedFromTotals: true })
      const marked = (await list(`accountId=${account.id}`)).totals
      expect(marked).toEqual({ income: '1200.00', expense: '45.90', net: '1154.10' })

      await patchOne(deposit.id, { excludedFromTotals: false })
      await patchOne(maturity.id, { excludedFromTotals: false })
      const unmarked = (await list(`accountId=${account.id}`)).totals
      expect(unmarked).toEqual(before)
    })

    it('changes neither the bank fact of the movement nor the balance of its account (R7)', async () => {
      const account = await createAccount()
      await seedMovement(account.id, {
        type: 'income',
        amount: '5000.00',
        balanceAfter: '5000.00',
        bookingDate: '2026-07-01',
      })
      const movement = await seedMovement(account.id, {
        type: 'expense',
        amount: '3000.00',
        balanceAfter: '2000.00',
        bookingDate: '2026-07-02',
        description: 'SYNTHETIC DEPOSIT OPENING 0001',
        transferId: 'exclusion-test-transfer',
        undoneTransferId: 'exclusion-test-undone',
      })

      const factOf = async () => {
        const row = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
        return {
          amount: row.amount.toFixed(2),
          type: row.type,
          bookingDate: row.bookingDate.toISOString(),
          valueDate: row.valueDate.toISOString(),
          description: row.description,
          balanceAfter: row.balanceAfter?.toFixed(2) ?? null,
          transferId: row.transferId,
          undoneTransferId: row.undoneTransferId,
        }
      }

      const factBefore = await factOf()
      const balanceBefore = await accountBalance(account.id)
      expect(balanceBefore).toBe('2000.00')

      await patchOne(movement.id, { excludedFromTotals: true })
      expect(await factOf()).toEqual(factBefore)
      expect(await accountBalance(account.id)).toBe(balanceBefore)

      await patchMany({ ids: [movement.id], excludedFromTotals: false })
      expect(await factOf()).toEqual(factBefore)
      expect(await accountBalance(account.id)).toBe(balanceBefore)
    })
  })

  // ---------------------------------------------------------------- the filters

  describe('the transfer and excluded filters', () => {
    /**
     * Four movements, one per combination of "linked" × "marked", plus one more
     * of each unlinked kind so the pagination has something to cut.
     */
    async function seedMatrix() {
      const account = await createAccount()
      const plain = await seedMovement(account.id, {
        type: 'expense',
        amount: '10.00',
        bookingDate: '2026-07-01',
      })
      const plainIncome = await seedMovement(account.id, {
        type: 'income',
        amount: '20.00',
        bookingDate: '2026-07-02',
      })
      const markedOnly = await seedMovement(account.id, {
        type: 'expense',
        amount: '3000.00',
        bookingDate: '2026-07-03',
        excludedFromTotals: true,
      })
      const leg = await seedMovement(account.id, {
        type: 'expense',
        amount: '500.00',
        bookingDate: '2026-07-04',
        transferId: 'exclusion-test-matrix-a',
      })
      const markedLeg = await seedMovement(account.id, {
        type: 'income',
        amount: '700.00',
        bookingDate: '2026-07-05',
        transferId: 'exclusion-test-matrix-b',
        excludedFromTotals: true,
      })
      const outOfRange = await seedMovement(account.id, {
        type: 'expense',
        amount: '99.00',
        bookingDate: '2026-08-15',
      })
      return { account, plain, plainIncome, markedOnly, leg, markedLeg, outOfRange }
    }

    it('transfer=only returns only linked legs and transfer=none only the rest (R10)', async () => {
      const m = await seedMatrix()

      const only = await list(`accountId=${m.account.id}&transfer=only`)
      expect(ids(only.movements)).toEqual([m.leg.id, m.markedLeg.id])
      expect(only.pagination.total).toBe(2)
      // Every linked leg is out of the sums by construction.
      expect(only.totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })

      const none = await list(`accountId=${m.account.id}&transfer=none`)
      expect(ids(none.movements)).toEqual(
        [m.plain.id, m.plainIncome.id, m.markedOnly.id, m.outOfRange.id].sort((a, b) => a - b),
      )
      expect(none.pagination.total).toBe(4)
      expect(none.totals).toEqual({ income: '20.00', expense: '109.00', net: '-89.00' })
    })

    it('excluded=only returns only marked movements and excluded=none only the unmarked (R16)', async () => {
      const m = await seedMatrix()

      const only = await list(`accountId=${m.account.id}&excluded=only`)
      expect(ids(only.movements)).toEqual([m.markedOnly.id, m.markedLeg.id])
      expect(only.pagination.total).toBe(2)
      expect(only.totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })

      const none = await list(`accountId=${m.account.id}&excluded=none`)
      expect(ids(none.movements)).toEqual(
        [m.plain.id, m.plainIncome.id, m.leg.id, m.outOfRange.id].sort((a, b) => a - b),
      )
      expect(none.pagination.total).toBe(4)
      expect(none.totals).toEqual({ income: '20.00', expense: '109.00', net: '-89.00' })
    })

    it('combines transfer and excluded with each other (R10, R16)', async () => {
      const m = await seedMatrix()

      const cases: [string, number[]][] = [
        ['transfer=only&excluded=only', [m.markedLeg.id]],
        ['transfer=only&excluded=none', [m.leg.id]],
        ['transfer=none&excluded=only', [m.markedOnly.id]],
        [
          'transfer=none&excluded=none',
          [m.plain.id, m.plainIncome.id, m.outOfRange.id].sort((a, b) => a - b),
        ],
      ]
      for (const [query, expected] of cases) {
        const body = await list(`accountId=${m.account.id}&${query}`)
        expect(ids(body.movements), query).toEqual(expected)
        expect(body.pagination.total, query).toBe(expected.length)
      }
    })

    it('combines both filters with accountId, dates and pagination: total and totals come from the filtered set (R10, R16)', async () => {
      const m = await seedMatrix()
      // A second account with a movement that matches every other filter: the
      // accountId must keep it out.
      const other = await createAccount()
      await seedMovement(other.id, { type: 'expense', amount: '1.00', bookingDate: '2026-07-02' })

      const query =
        `accountId=${m.account.id}&from=2026-07-01&to=2026-07-31` +
        '&transfer=none&excluded=none&pageSize=1'

      const first = await list(`${query}&page=1`)
      const second = await list(`${query}&page=2`)

      // In range, unlinked and unmarked: only `plain` and `plainIncome`
      // (`outOfRange` falls outside the dates, `markedOnly` is marked).
      expect(first.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 })
      expect(second.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 })
      expect(ids([...first.movements, ...second.movements])).toEqual(
        [m.plain.id, m.plainIncome.id].sort((a, b) => a - b),
      )
      // The totals are of the whole filtered set, the same on every page.
      const expectedTotals = { income: '20.00', expense: '10.00', net: '10.00' }
      expect(first.totals).toEqual(expectedTotals)
      expect(second.totals).toEqual(expectedTotals)
    })

    it.each([
      ['transfer', 'yes'],
      ['transfer', 'true'],
      ['transfer', 'ONLY'],
      ['excluded', 'yes'],
      ['excluded', 'false'],
      ['excluded', ''],
    ])('rejects %s=%s with 400 VALIDATION_ERROR (R11)', async (parameter, value) => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/movements?${parameter}=${value}`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    })
  })
})
