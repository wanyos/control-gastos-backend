// Feature 44 `manual-transfer-marking`: the HTTP surface of the manual link
// (R1, R5, R6, R7, R9, R10) and the totals exclusion of a manual pair (R14).
// Since feature 49 `honest-totals`, also the list of pairs, the doubtful groups
// on request and the independence of the mark and the link (nested block below).
//
// 🔒 Everything here is synthetic: invented amounts, invented descriptions and
// `syntheticIban()` accounts, in the throwaway test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { detectTransfers } from './transfers.service.js'

describe('POST /api/transfers and DELETE /api/transfers/:transferId (F44)', () => {
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
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Transfer route test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    accountId: number
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    bookingDate?: string
    transferId?: string | null
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date(`${movement.bookingDate ?? '2031-03-10'}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount ?? '618.32',
        description: 'SYNTHETIC ROUTE TRANSFER LEG',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
        transferId: movement.transferId ?? null,
      },
    })
  }

  /** Two compatible legs in two fresh accounts, ready to link. */
  async function seedLinkablePair() {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })
    return { legOut, legIn }
  }

  it('answers 201 with { transferId, movements } and writes both legs (R1)', async () => {
    const { legOut, legIn } = await seedLinkablePair()

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [legOut.id, legIn.id] },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.transferId).toBeTruthy()
    expect(body.movements).toHaveLength(2)
    expect(body.movements.map((movement: { id: number }) => movement.id)).toEqual([
      legOut.id,
      legIn.id,
    ])
    expect(body.movements[0].transferId).toBe(body.transferId)
    expect(body.movements[1].transferId).toBe(body.transferId)
    // The undone-link memory is internal machinery: it never travels (design §2).
    expect(body.movements[0]).not.toHaveProperty('undoneTransferId')
  })

  it('answers 400 on a body that is not exactly two integer ids (R7)', async () => {
    for (const payload of [
      {},
      { movementIds: [] },
      { movementIds: [1] },
      { movementIds: [1, 2, 3] },
      { movementIds: [1, 'two'] },
      { movementIds: [0, 2] },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/transfers', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
  })

  it('answers 400 on an unknown body property, never a 201 that ignored it (R7)', async () => {
    const { legOut, legIn } = await seedLinkablePair()

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [legOut.id, legIn.id], transferId: 'made-up-by-the-client' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    expect(rows.every((row) => row.transferId === null)).toBe(true)
  })

  it('answers 400 on the same id twice (R7)', async () => {
    const source = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [legOut.id, legOut.id] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('answers 404 when one id does not exist (R6)', async () => {
    const source = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [legOut.id, legOut.id + 999_983] },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('answers 409 when one leg already belongs to a transfer (R5)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const linkedLeg = await seedMovement({
      accountId: source.id,
      type: 'expense',
      transferId: 'synthetic-route-existing-link',
    })
    const freeLeg = await seedMovement({ accountId: target.id, type: 'income' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [linkedLeg.id, freeLeg.id] },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  })

  it('undoes a pair with 204 and no body, writing the memory on both legs (R9)', async () => {
    const { legOut, legIn } = await seedLinkablePair()
    const linkResponse = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [legOut.id, legIn.id] },
    })
    const { transferId } = linkResponse.json()

    const response = await app.inject({ method: 'DELETE', url: `/api/transfers/${transferId}` })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    expect(rows.every((row) => row.transferId === null)).toBe(true)
    expect(rows.every((row) => row.undoneTransferId === transferId)).toBe(true)
  })

  it('answers 404 on a transferId no movement carries (R10)', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/transfers/synthetic-transfer-id-nobody-has',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('excludes a manually linked pair from the totals of GET /api/movements (R14)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense', amount: '618.32' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income', amount: '618.32' })
    // An ordinary expense that must keep counting after the link.
    await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '41.05',
      bookingDate: '2031-03-11',
    })

    const before = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${source.id}`,
    })
    expect(before.json().totals).toEqual({ income: '0.00', expense: '659.37', net: '-659.37' })

    const linkResponse = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [legOut.id, legIn.id] },
    })
    expect(linkResponse.statusCode).toBe(201)

    // Same exclusion as a detected pair: `transferId != null`, whoever wrote it.
    const sourceAfter = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${source.id}`,
    })
    expect(sourceAfter.json().totals).toEqual({
      income: '0.00',
      expense: '41.05',
      net: '-41.05',
    })
    const targetAfter = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${target.id}`,
    })
    expect(targetAfter.json().totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
    // And the listing itself still ships the movement, without the memory column.
    const listed = targetAfter.json().movements.find((m: { id: number }) => m.id === legIn.id)
    expect(listed.transferId).toBe(linkResponse.json().transferId)
    expect(listed).not.toHaveProperty('undoneTransferId')
  })

  // Feature 49 `honest-totals`: the list of pairs (R12, R13), the doubtful groups
  // on request (R14) and the independence of the mark and the link (R9). Same
  // synthetic accounts and descriptions as above; every amount is invented.
  describe('GET /api/transfers, GET /api/transfers/ambiguous and the mark (F49)', () => {
    interface PairListing {
      transferId: string
      movements: Array<{
        id: number
        type: string
        transferId: string | null
        excludedFromTotals: boolean
      }>
    }

    async function link(firstId: number, secondId: number): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/transfers',
        payload: { movementIds: [firstId, secondId] },
      })
      expect(response.statusCode).toBe(201)
      return response.json().transferId
    }

    async function listPairs(): Promise<PairListing[]> {
      const response = await app.inject({ method: 'GET', url: '/api/transfers' })
      expect(response.statusCode).toBe(200)
      return response.json().pairs
    }

    async function totalsOf(accountId: number) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/movements?accountId=${accountId}`,
      })
      expect(response.statusCode).toBe(200)
      return response.json().totals
    }

    async function setMark(id: number, excludedFromTotals: boolean) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/movements/${id}`,
        payload: { excludedFromTotals },
      })
      expect(response.statusCode).toBe(200)
      return response.json()
    }

    it('answers 200 with pairs: [] when no movement carries a transferId (R12)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/transfers' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ pairs: [] })
    })

    it('lists every pair newest first, the expense leg before the income leg (R12)', async () => {
      const source = await createAccount()
      const target = await createAccount()
      // Older pair: its most recent leg is the income of 2031-03-12.
      const olderOut = await seedMovement({
        accountId: source.id,
        type: 'expense',
        amount: '247.19',
        bookingDate: '2031-03-10',
      })
      const olderIn = await seedMovement({
        accountId: target.id,
        type: 'income',
        amount: '247.19',
        bookingDate: '2031-03-12',
      })
      // Newer pair: both legs on 2031-04-02.
      const newerOut = await seedMovement({
        accountId: target.id,
        type: 'expense',
        amount: '83.64',
        bookingDate: '2031-04-02',
      })
      const newerIn = await seedMovement({
        accountId: source.id,
        type: 'income',
        amount: '83.64',
        bookingDate: '2031-04-02',
      })
      // Linked with the income FIRST: the listing must reorder the legs anyway.
      const olderId = await link(olderIn.id, olderOut.id)
      const newerId = await link(newerIn.id, newerOut.id)

      const pairs = await listPairs()

      expect(pairs.map((pair) => pair.transferId)).toEqual([newerId, olderId])
      expect(pairs.map((pair) => pair.movements.map((movement) => movement.id))).toEqual([
        [newerOut.id, newerIn.id],
        [olderOut.id, olderIn.id],
      ])
      for (const pair of pairs) {
        expect(pair.movements.map((movement) => movement.type)).toEqual(['expense', 'income'])
        expect(pair.movements.map((movement) => movement.transferId)).toEqual([
          pair.transferId,
          pair.transferId,
        ])
        // Each leg is a whole serialized movement, like in GET /api/movements.
        expect(pair.movements[0]).toHaveProperty('excludedFromTotals', false)
        expect(pair.movements[0]).toHaveProperty('account')
        expect(pair.movements[0]).toHaveProperty('category')
        expect(pair.movements[0]).not.toHaveProperty('undoneTransferId')
      }
    })

    it('breaks a tie on the most recent date by transferId ascending (R12)', async () => {
      const source = await createAccount()
      const target = await createAccount()
      // Same date for all four legs; distinct amounts only to respect the
      // import dedup key of the table.
      for (const [transferId, amount] of [
        ['synthetic-tie-b', '312.77'],
        ['synthetic-tie-a', '46.09'],
      ] as const) {
        await seedMovement({ accountId: source.id, type: 'expense', amount, transferId })
        await seedMovement({ accountId: target.id, type: 'income', amount, transferId })
      }

      const pairs = await listPairs()

      expect(pairs.map((pair) => pair.transferId)).toEqual(['synthetic-tie-a', 'synthetic-tie-b'])
    })

    it('after DELETE the pair leaves the list and both legs count in the totals again (R13)', async () => {
      // Synthetic analogue of a false pair: an expense in one account and an
      // income of the same invented amount in another, three days apart.
      const payer = await createAccount()
      const payee = await createAccount()
      const legOut = await seedMovement({
        accountId: payer.id,
        type: 'expense',
        amount: '173.46',
        bookingDate: '2031-05-02',
      })
      const legIn = await seedMovement({
        accountId: payee.id,
        type: 'income',
        amount: '173.46',
        bookingDate: '2031-05-05',
      })
      const transferId = await link(legOut.id, legIn.id)
      expect((await listPairs()).map((pair) => pair.transferId)).toEqual([transferId])
      expect(await totalsOf(payer.id)).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
      expect(await totalsOf(payee.id)).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })

      const undo = await app.inject({ method: 'DELETE', url: `/api/transfers/${transferId}` })
      expect(undo.statusCode).toBe(204)

      expect(await listPairs()).toEqual([])
      expect(await totalsOf(payer.id)).toEqual({
        income: '0.00',
        expense: '173.46',
        net: '-173.46',
      })
      expect(await totalsOf(payee.id)).toEqual({
        income: '173.46',
        expense: '0.00',
        net: '173.46',
      })
    })

    it('lets a leg of a pair be marked and unmarked without touching its link (R9)', async () => {
      const { legOut, legIn } = await seedLinkablePair()
      const transferId = await link(legOut.id, legIn.id)

      const marked = await setMark(legIn.id, true)
      expect(marked).toMatchObject({ id: legIn.id, excludedFromTotals: true, transferId })

      const unmarked = await setMark(legIn.id, false)
      expect(unmarked).toMatchObject({ id: legIn.id, excludedFromTotals: false, transferId })
      expect((await listPairs()).map((pair) => pair.transferId)).toEqual([transferId])
    })

    it('links a marked movement, keeps its mark, and DELETE does not clear it (R9, R4)', async () => {
      const { legOut, legIn } = await seedLinkablePair()
      await setMark(legOut.id, true)

      const linkResponse = await app.inject({
        method: 'POST',
        url: '/api/transfers',
        payload: { movementIds: [legOut.id, legIn.id] },
      })
      expect(linkResponse.statusCode).toBe(201)
      const linked = linkResponse.json()
      // R4: POST /api/transfers ships the mark on both legs.
      expect(
        linked.movements.map((movement: PairListing['movements'][number]) => [
          movement.id,
          movement.excludedFromTotals,
        ]),
      ).toEqual([
        [legOut.id, true],
        [legIn.id, false],
      ])
      const [pair] = await listPairs()
      expect(pair?.movements.map((movement) => movement.excludedFromTotals)).toEqual([true, false])

      const undo = await app.inject({
        method: 'DELETE',
        url: `/api/transfers/${linked.transferId}`,
      })
      expect(undo.statusCode).toBe(204)

      const rows = await app.prisma.movement.findMany({
        where: { id: { in: [legOut.id, legIn.id] } },
        orderBy: { id: 'asc' },
      })
      expect(rows.map((row) => [row.id, row.transferId, row.excludedFromTotals])).toEqual([
        [legOut.id, null, true],
        [legIn.id, null, false],
      ])
      // The marked leg stays out of the sums even after the undo.
      expect(await totalsOf(legOut.accountId)).toEqual({
        income: '0.00',
        expense: '0.00',
        net: '0.00',
      })
    })

    it('a detection pass links a marked leg and leaves both marks as they were (R9)', async () => {
      const source = await createAccount()
      const target = await createAccount()
      const legOut = await seedMovement({ accountId: source.id, type: 'expense', amount: '529.08' })
      const legIn = await seedMovement({ accountId: target.id, type: 'income', amount: '529.08' })
      await setMark(legOut.id, true)

      const result = await detectTransfers(app.prisma)

      expect(result).toMatchObject({ pairsCreated: 1, ambiguousCount: 0 })
      const rows = await app.prisma.movement.findMany({
        where: { id: { in: [legOut.id, legIn.id] } },
        orderBy: { id: 'asc' },
      })
      expect(rows[0]?.transferId).not.toBeNull()
      expect(rows[0]?.transferId).toBe(rows[1]?.transferId)
      expect(rows.map((row) => row.excludedFromTotals)).toEqual([true, false])
    })

    it('answers { ambiguousCount: 0, ambiguous: [] } when nothing is doubtful (R14)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/transfers/ambiguous' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ambiguousCount: 0, ambiguous: [] })
    })

    /** Two expenses and one income of one invented amount: an uneven, doubtful group. */
    async function seedUnevenGroup() {
      const source = await createAccount()
      const target = await createAccount()
      const firstOut = await seedMovement({
        accountId: source.id,
        type: 'expense',
        amount: '58.17',
        bookingDate: '2031-06-01',
      })
      const secondOut = await seedMovement({
        accountId: source.id,
        type: 'expense',
        amount: '58.17',
        bookingDate: '2031-06-02',
      })
      const lonelyIn = await seedMovement({
        accountId: target.id,
        type: 'income',
        amount: '58.17',
        bookingDate: '2031-06-02',
      })
      return { source, target, firstOut, secondOut, lonelyIn }
    }

    it('returns an uneven group with the same shape as the import report (R14)', async () => {
      const { source, target, firstOut, secondOut, lonelyIn } = await seedUnevenGroup()
      const leg = (id: number, accountId: number, type: string, bookingDate: string) => ({
        id,
        accountId,
        accountAlias: 'Transfer route test account',
        type,
        bookingDate,
        description: 'SYNTHETIC ROUTE TRANSFER LEG',
      })

      const response = await app.inject({ method: 'GET', url: '/api/transfers/ambiguous' })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toEqual({
        ambiguousCount: 1,
        ambiguous: [
          {
            amount: '58.17',
            movements: [
              leg(firstOut.id, source.id, 'expense', '2031-06-01'),
              leg(secondOut.id, source.id, 'expense', '2031-06-02'),
              leg(lonelyIn.id, target.id, 'income', '2031-06-02'),
            ],
          },
        ],
      })
      // The very two fields the detection puts in the import report, same values.
      const detection = await detectTransfers(app.prisma)
      expect(detection.pairsCreated).toBe(0)
      expect(body).toEqual({
        ambiguousCount: detection.ambiguousCount,
        ambiguous: detection.ambiguous,
      })
    })

    it('reflects a manual link at once: the group disappears (R14)', async () => {
      const { firstOut, lonelyIn } = await seedUnevenGroup()
      const before = await app.inject({ method: 'GET', url: '/api/transfers/ambiguous' })
      expect(before.json().ambiguousCount).toBe(1)

      await link(firstOut.id, lonelyIn.id)

      // The remaining expense has no income left to pair with: no group at all.
      const after = await app.inject({ method: 'GET', url: '/api/transfers/ambiguous' })
      expect(after.statusCode).toBe(200)
      expect(after.json()).toEqual({ ambiguousCount: 0, ambiguous: [] })
    })

    it('writes nothing, not even a pair it could resolve (R14)', async () => {
      const { source, target } = await seedUnevenGroup()
      // A lone, unambiguous pair the detection WOULD link.
      const resolvableOut = await seedMovement({
        accountId: source.id,
        type: 'expense',
        amount: '91.33',
        bookingDate: '2031-06-20',
      })
      const resolvableIn = await seedMovement({
        accountId: target.id,
        type: 'income',
        amount: '91.33',
        bookingDate: '2031-06-21',
      })
      const snapshot = async () =>
        (await app.prisma.movement.findMany({ orderBy: { id: 'asc' } })).map((row) => ({
          id: row.id,
          transferId: row.transferId,
          undoneTransferId: row.undoneTransferId,
          excludedFromTotals: row.excludedFromTotals,
          updatedAt: row.updatedAt.toISOString(),
        }))
      const countBefore = await app.prisma.movement.count()
      const rowsBefore = await snapshot()

      const response = await app.inject({ method: 'GET', url: '/api/transfers/ambiguous' })

      expect(response.statusCode).toBe(200)
      expect(response.json().ambiguous.map((group: { amount: string }) => group.amount)).toEqual([
        '58.17',
      ])
      expect(await app.prisma.movement.count()).toBe(countBefore)
      expect(await snapshot()).toEqual(rowsBefore)
      const resolvable = await app.prisma.movement.findMany({
        where: { id: { in: [resolvableOut.id, resolvableIn.id] } },
      })
      expect(resolvable.map((row) => row.transferId)).toEqual([null, null])
    })
  })
})
