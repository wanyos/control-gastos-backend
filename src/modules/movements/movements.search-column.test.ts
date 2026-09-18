// Feature 47 (R14): `Movement.descriptionSearch` is a column GENERATED ALWAYS ...
// STORED (see prisma/migrations/20260918140000_movement_description_search).
// PostgreSQL derives it from `description`; no application code writes it or
// keeps it in sync, and these tests are what proves both halves of that claim.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'

describe('Movement.descriptionSearch (generated column)', () => {
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
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  const bookingDate = new Date('2026-07-24T00:00:00.000Z')

  it('fills it in lowercase and without diacritics from a create that never mentions it', async () => {
    const account = await createAccount()

    const created = await app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: '12.34',
        description: 'PELUQUERÍA ÑOÑA JOSÉ 50% _AÜX',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
      },
    })

    // `ñ` loses its tilde too: `normalize('NFD')` in TypeScript does the same,
    // so both sides of the search agree (design.md §3).
    expect(created.descriptionSearch).toBe('peluqueria nona jose 50% _aux')
  })

  it('re-derives it when the description changes, with nothing updating it', async () => {
    const account = await createAccount()
    const created = await app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: '12.34',
        description: 'CAFETERÍA DEL PUERTO',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
      },
    })
    expect(created.descriptionSearch).toBe('cafeteria del puerto')

    const updated = await app.prisma.movement.update({
      where: { id: created.id },
      data: { description: 'GASÓLEO ÁVILA' },
    })

    expect(updated.descriptionSearch).toBe('gasoleo avila')
  })

  it('is rejected by PostgreSQL if a write mentions it, so no code can keep its own copy', async () => {
    const account = await createAccount()

    const write = app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: '12.34',
        description: 'CAFETERÍA DEL PUERTO',
        descriptionSearch: 'something else entirely',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
      },
    })

    await expect(write).rejects.toThrow(/descriptionSearch/)
    expect(await app.prisma.movement.count({ where: { accountId: account.id } })).toBe(0)
  })
})
