// Feature 44 `manual-transfer-marking`: the HTTP surface of the manual link
// (R1, R5, R6, R7, R9, R10) and the totals exclusion of a manual pair (R14).
//
// 🔒 Everything here is synthetic: invented amounts, invented descriptions and
// `syntheticIban()` accounts, in the throwaway test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'

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
})
