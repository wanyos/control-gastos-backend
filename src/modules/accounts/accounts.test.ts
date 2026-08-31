import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { mistypedIban, syntheticIban } from '../../lib/iban.fixture.js'
import { buildApp } from '../../app.js'
import { InvalidIbanError, MissingAccountDataError } from '../../errors/app-error.js'
import { AccountType } from '../../generated/prisma/client.js'
import { accountsDb, findOrCreateAccountFromMetadata } from './accounts.service.js'
import type { SerializedAccount } from './accounts.types.js'

/**
 * Unique IBAN per call: the column is the natural key, the DB is shared and
 * test files run in parallel (hence the random body, not just a counter).
 * WELL FORMED since feature 21: the door validates it, so a made-up string with
 * the wrong length and wrong check digits would now be rejected — rightly.
 */
function uniqueIban(): string {
  return syntheticIban()
}

describe('account routes and service', () => {
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

  async function postAccount(body: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/accounts', payload: body })
  }

  async function createAccount(body: Record<string, unknown>): Promise<SerializedAccount> {
    const response = await postAccount(body)
    expect(response.statusCode).toBe(201)
    const account = response.json<SerializedAccount>()
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    type: 'expense' | 'income' | 'neutral'
    amount: string
    description: string
    bookingDate: string
    daySequence: number | null
    balanceAfter?: string | null
    origin?: 'imported' | 'manual'
  }

  async function seedMovement(accountId: number, movement: SeedMovement) {
    return app.prisma.movement.create({
      data: {
        accountId,
        type: movement.type,
        amount: movement.amount,
        description: movement.description,
        bookingDate: new Date(`${movement.bookingDate}T00:00:00.000Z`),
        valueDate: new Date(`${movement.bookingDate}T00:00:00.000Z`),
        daySequence: movement.daySequence,
        balanceAfter: movement.balanceAfter ?? null,
        origin: movement.origin ?? 'imported',
      },
    })
  }

  /** Anchors an account the way the importer will (feature 31, R1/R2). */
  async function anchorAccount(
    accountId: number,
    anchor: { amount: string; date: string; daySequence: number | null },
  ) {
    return app.prisma.account.update({
      where: { id: accountId },
      data: {
        balanceAnchor: anchor.amount,
        balanceAnchorDate: new Date(`${anchor.date}T00:00:00.000Z`),
        balanceAnchorDaySequence: anchor.daySequence,
      },
    })
  }

  it('AccountType offers checking and savings only: there is no cash account (R1)', () => {
    expect(Object.keys(AccountType)).toEqual(['checking', 'savings'])
    expect(Object.keys(AccountType)).not.toContain('cash')
  })

  it('POST /api/accounts with a valid body returns 201 with the account (R1, R8)', async () => {
    const iban = uniqueIban()
    const account = await createAccount({ iban, bank: 'bankinter', initialBalance: 1500.5 })

    expect(account.id).toBeTypeOf('number')
    expect(account.iban).toBe(iban)
    expect(account.bank).toBe('bankinter')
    expect(account.type).toBe('checking')
    // Decimals travel as strings with 2 decimals (api-contract.md).
    expect(account.initialBalance).toBe('1500.50')
    expect(account.balance).toBe('1500.50')
    expect(account.alias).toBe(`bankinter ···${iban.slice(-4)}`)
    expect(new Date(account.createdAt).getTime()).not.toBeNaN()
    expect(new Date(account.updatedAt).getTime()).not.toBeNaN()
  })

  it('rejects a duplicated iban at the database level too (R1)', async () => {
    const iban = uniqueIban()
    const created = await createAccount({ iban, bank: 'bankinter' })

    await expect(
      app.prisma.account.create({ data: { iban, bank: 'banco-ejemplo', alias: 'clone' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(await app.prisma.account.count({ where: { iban } })).toBe(1)
    expect(created.iban).toBe(iban)
  })

  it('POST /api/accounts normalizes the iban and honours alias and type (R8)', async () => {
    const iban = uniqueIban()
    const account = await createAccount({
      iban: `  ${iban.toLowerCase()}  `,
      bank: 'bankinter',
      alias: 'Payroll account',
      type: 'savings',
    })

    expect(account.iban).toBe(iban)
    expect(account.alias).toBe('Payroll account')
    expect(account.type).toBe('savings')
    expect(account.initialBalance).toBe('0.00')
  })

  it('GET /api/accounts reads the balance from the latest statement line (R9)', async () => {
    const created = await createAccount({
      iban: uniqueIban(),
      bank: 'bankinter',
      initialBalance: 100,
    })

    await seedMovement(created.id, {
      type: 'income',
      amount: '1500.00',
      description: 'TRANSF NOMI /ACME SL',
      bookingDate: '2026-07-31',
      daySequence: 1,
      balanceAfter: '10000.00',
    })
    await seedMovement(created.id, {
      type: 'expense',
      amount: '45.37',
      description: 'RECIBO /Recibo luz',
      bookingDate: '2026-07-31',
      daySequence: 2,
      balanceAfter: '9954.63',
    })
    await seedMovement(created.id, {
      type: 'expense',
      amount: '850.00',
      description: 'TRANS INM/ OTRO BANCO',
      bookingDate: '2026-07-24',
      daySequence: 1,
      balanceAfter: '22000.00',
    })

    const response = await app.inject({ method: 'GET', url: '/api/accounts' })

    expect(response.statusCode).toBe(200)
    const account = response
      .json<SerializedAccount[]>()
      .find((candidate) => candidate.id === created.id)
    // Highest daySequence of the most recent bookingDate: no sum involved.
    expect(account?.balance).toBe('9954.63')
    expect(account?.initialBalance).toBe('100.00')
  })

  it('GET /api/accounts falls back to initialBalance +income -expense without statements (R9)', async () => {
    const created = await createAccount({
      iban: uniqueIban(),
      bank: 'bankinter',
      initialBalance: 100,
    })

    await seedMovement(created.id, {
      type: 'income',
      amount: '150.25',
      description: 'Cash deposit',
      bookingDate: '2026-07-10',
      daySequence: null,
      origin: 'manual',
    })
    await seedMovement(created.id, {
      type: 'expense',
      amount: '40.25',
      description: 'Cash payment',
      bookingDate: '2026-07-11',
      daySequence: null,
      origin: 'manual',
    })
    await seedMovement(created.id, {
      type: 'neutral',
      amount: '0.00',
      description: 'Zero amount line',
      bookingDate: '2026-07-12',
      daySequence: null,
      origin: 'manual',
    })

    const response = await app.inject({ method: 'GET', url: '/api/accounts' })

    const account = response
      .json<SerializedAccount[]>()
      .find((candidate) => candidate.id === created.id)
    expect(account?.balance).toBe('210.00')
  })

  it('GET /api/accounts/:id returns the account with its balance, 404 when unknown (R9)', async () => {
    const created = await createAccount({ iban: uniqueIban(), bank: 'bankinter' })

    const found = await app.inject({ method: 'GET', url: `/api/accounts/${created.id}` })
    expect(found.statusCode).toBe(200)
    expect(found.json<SerializedAccount>().id).toBe(created.id)
    expect(found.json<SerializedAccount>().balance).toBe('0.00')

    const missing = await app.inject({ method: 'GET', url: '/api/accounts/99999999' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND', message: 'Account not found' })
  })

  // ── Feature 31 `real-account-balance` ────────────────────────────────────
  //
  // The balance stops having two paths (the most recent `balanceAfter`, or a
  // sum as *fallback*) and has ONE: the amount of the effective anchor point
  // plus the net of everything strictly after it. What the file says still
  // wins where the file says something; what it no longer does is freeze the
  // balance on the day the statement ended.

  it('GET /api/accounts exposes the anchor of an anchored account and sums what came after it (R6, R10, R14)', async () => {
    const created = await createAccount({
      iban: uniqueIban(),
      bank: 'bankinter',
      initialBalance: 100,
    })
    await anchorAccount(created.id, { amount: '5000.00', date: '2026-07-31', daySequence: 3 })

    // Older than the anchor: the anchor amount already contained it (R9).
    await seedMovement(created.id, {
      type: 'expense',
      amount: '200.00',
      description: 'Older than the anchor',
      bookingDate: '2026-07-31',
      daySequence: 1,
    })
    await seedMovement(created.id, {
      type: 'income',
      amount: '300.50',
      description: 'After the anchor',
      bookingDate: '2026-08-05',
      daySequence: 1,
    })
    await seedMovement(created.id, {
      type: 'expense',
      amount: '100.25',
      description: 'After the anchor too',
      bookingDate: '2026-08-06',
      daySequence: 1,
    })

    const response = await app.inject({ method: 'GET', url: '/api/accounts' })

    expect(response.statusCode).toBe(200)
    const account = response
      .json<SerializedAccount[]>()
      .find((candidate) => candidate.id === created.id)
    expect(account?.balanceAnchor).toBe('5000.00')
    expect(account?.balanceAnchorDate).toBe('2026-07-31')
    // 5000.00 + 300.50 - 100.25; the 200.00 of the anchor day does NOT count.
    expect(account?.balance).toBe('5200.25')
    // `initialBalance` no longer takes part once the account is anchored.
    expect(account?.initialBalance).toBe('100.00')
  })

  it('GET /api/accounts reports a null anchor on an account that was never anchored (R14)', async () => {
    const created = await createAccount({
      iban: uniqueIban(),
      bank: 'bankinter',
      initialBalance: 100,
    })
    await seedMovement(created.id, {
      type: 'income',
      amount: '25.00',
      description: 'Cash deposit',
      bookingDate: '2026-07-10',
      daySequence: null,
      origin: 'manual',
    })

    const response = await app.inject({ method: 'GET', url: '/api/accounts' })

    const account = response
      .json<SerializedAccount[]>()
      .find((candidate) => candidate.id === created.id)
    expect(account?.balanceAnchor).toBeNull()
    expect(account?.balanceAnchorDate).toBeNull()
    // Without anchor and without a single per-line balance: exactly as before.
    expect(account?.balance).toBe('125.00')
  })

  it('GET /api/accounts moves the balance with movements newer than the last line that carries one (R7, R10)', async () => {
    const created = await createAccount({
      iban: uniqueIban(),
      bank: 'bankinter',
      initialBalance: 0,
    })

    await seedMovement(created.id, {
      type: 'expense',
      amount: '75.00',
      description: 'Last line of the statement',
      bookingDate: '2026-07-31',
      daySequence: 2,
      balanceAfter: '3000.00',
    })
    await seedMovement(created.id, {
      type: 'income',
      amount: '10.00',
      description: 'Older, with its own balance',
      bookingDate: '2026-07-20',
      daySequence: 1,
      balanceAfter: '2500.00',
    })
    // Newer than the statement and WITHOUT a per-line balance: before feature
    // 31 this one did not move the balance at all.
    await seedMovement(created.id, {
      type: 'expense',
      amount: '50.00',
      description: 'Newer than the statement',
      bookingDate: '2026-08-02',
      daySequence: 1,
    })

    const response = await app.inject({ method: 'GET', url: '/api/accounts' })

    const account = response
      .json<SerializedAccount[]>()
      .find((candidate) => candidate.id === created.id)
    expect(account?.balance).toBe('2950.00')
    expect(account?.balanceAnchor).toBeNull()
  })

  it('GET /api/accounts/:id starts from the stored anchor when it is newer than the statement line (R7, R14)', async () => {
    const created = await createAccount({
      iban: uniqueIban(),
      bank: 'bankinter',
      initialBalance: 0,
    })
    await anchorAccount(created.id, { amount: '4000.00', date: '2026-08-01', daySequence: 1 })

    await seedMovement(created.id, {
      type: 'income',
      amount: '15.00',
      description: 'Line of an older statement',
      bookingDate: '2026-07-20',
      daySequence: 1,
      balanceAfter: '9000.00',
    })
    // Between the per-line balance and the anchor: the anchor already has it.
    await seedMovement(created.id, {
      type: 'expense',
      amount: '600.00',
      description: 'Between the line and the anchor',
      bookingDate: '2026-07-25',
      daySequence: 1,
    })
    await seedMovement(created.id, {
      type: 'income',
      amount: '55.55',
      description: 'After the anchor',
      bookingDate: '2026-08-03',
      daySequence: 1,
    })

    const response = await app.inject({ method: 'GET', url: `/api/accounts/${created.id}` })

    expect(response.statusCode).toBe(200)
    const account = response.json<SerializedAccount>()
    expect(account.balanceAnchor).toBe('4000.00')
    expect(account.balanceAnchorDate).toBe('2026-08-01')
    expect(account.balance).toBe('4055.55')
  })

  it('POST /api/accounts returns a brand new account without anchor (R14)', async () => {
    const account = await createAccount({ iban: uniqueIban(), bank: 'bankinter' })

    expect(account.balanceAnchor).toBeNull()
    expect(account.balanceAnchorDate).toBeNull()
    expect(account.balance).toBe('0.00')
  })

  it('POST /api/accounts with a duplicated iban returns 409 CONFLICT (R10)', async () => {
    const iban = uniqueIban()
    await createAccount({ iban, bank: 'bankinter' })

    const duplicated = await postAccount({ iban, bank: 'banco-ejemplo' })

    expect(duplicated.statusCode).toBe(409)
    expect(duplicated.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' })

    const list = await app.inject({ method: 'GET', url: '/api/accounts' })
    const matches = list.json<SerializedAccount[]>().filter((account) => account.iban === iban)
    expect(matches).toHaveLength(1)
  })

  it('POST /api/accounts without iban returns 400 VALIDATION_ERROR (R11)', async () => {
    const response = await postAccount({ bank: 'bankinter' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('POST /api/accounts without bank returns 400 VALIDATION_ERROR (R11)', async () => {
    const response = await postAccount({ iban: uniqueIban() })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('POST /api/accounts with an empty iban returns 400 VALIDATION_ERROR (R11)', async () => {
    const response = await postAccount({ iban: '', bank: 'bankinter' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('findOrCreateAccountFromMetadata returns the existing account by iban (R30)', async () => {
    const iban = uniqueIban()
    const existing = await createAccount({ iban, bank: 'bankinter', alias: 'Payroll account' })

    const result = await findOrCreateAccountFromMetadata(accountsDb(app), {
      iban: iban.toLowerCase(),
      bank: 'bankinter',
    })

    expect(result.created).toBe(false)
    expect(result.account.id).toBe(existing.id)
    expect(result.account.alias).toBe('Payroll account')
    expect(result.appliedDefaults).toEqual({ alias: false, type: false })
  })

  it('findOrCreateAccountFromMetadata creates a new account with defaults (R30)', async () => {
    const iban = uniqueIban()

    const result = await findOrCreateAccountFromMetadata(accountsDb(app), {
      iban,
      bank: 'bankinter',
    })
    createdAccountIds.push(result.account.id)

    expect(result.created).toBe(true)
    expect(result.account.iban).toBe(iban)
    expect(result.account.bank).toBe('bankinter')
    expect(result.account.alias).toBe(`bankinter ···${iban.slice(-4)}`)
    expect(result.account.type).toBe('checking')
    expect(result.account.initialBalance.toFixed(2)).toBe('0.00')
    expect(result.appliedDefaults).toEqual({ alias: true, type: true })
  })

  it('findOrCreateAccountFromMetadata throws MissingAccountDataError without iban (R31)', async () => {
    // Scoped by an unrepeatable bank name: other test files write concurrently.
    const bank = `phantom-bank-${uniqueIban()}`

    await expect(findOrCreateAccountFromMetadata(accountsDb(app), { bank })).rejects.toThrowError(
      MissingAccountDataError,
    )
    await expect(findOrCreateAccountFromMetadata(accountsDb(app), { bank })).rejects.toThrowError(
      /iban/,
    )

    expect(await app.prisma.account.count({ where: { bank } })).toBe(0)
  })

  it('findOrCreateAccountFromMetadata throws MissingAccountDataError without bank (R31)', async () => {
    const iban = uniqueIban()

    const failure = await findOrCreateAccountFromMetadata(accountsDb(app), { iban }).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(MissingAccountDataError)
    expect((failure as MissingAccountDataError).message).toMatch(/bank/)
    expect((failure as MissingAccountDataError).code).toBe('MISSING_ACCOUNT_DATA')
    expect((failure as MissingAccountDataError).statusCode).toBe(422)
    expect(await app.prisma.account.count({ where: { iban } })).toBe(0)
  })
  // ── Feature 21 `iban-normalization` ──────────────────────────────────────
  //
  // Criterion C5: this door applies the SAME normalization and the SAME
  // validation as the bank files. Two doors with different rules for the same
  // datum is exactly how the same account ends up stored twice.
  it('POST /api/accounts stores the iban written with interior spaces as one string (C2, C5)', async () => {
    const iban = uniqueIban()
    const spaced = (iban.match(/.{1,4}/g) ?? []).join(' ')

    const account = await createAccount({ iban: spaced, bank: 'bankinter' })

    expect(spaced).toContain(' ')
    expect(account.iban).toBe(iban)
  })

  it('POST /api/accounts refuses to create a SECOND account for a spaced iban (C2, C5)', async () => {
    const iban = uniqueIban()
    await createAccount({ iban, bank: 'bankinter' })

    const duplicated = await postAccount({
      iban: (iban.toLowerCase().match(/.{1,4}/g) ?? []).join(' '),
      bank: 'bankinter',
    })

    expect(duplicated.statusCode).toBe(409)
    expect(duplicated.json()).toMatchObject({ code: 'CONFLICT' })
    expect(await app.prisma.account.count({ where: { iban } })).toBe(1)
  })

  it('POST /api/accounts with a mistyped digit returns 422 INVALID_IBAN and creates nothing (C4, C5)', async () => {
    const wrong = mistypedIban(uniqueIban())

    const response = await postAccount({ iban: wrong, bank: 'bankinter' })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      statusCode: 422,
      code: 'INVALID_IBAN',
      message: expect.stringContaining('el dígito de control no cuadra'),
    })
    expect(await app.prisma.account.count({ where: { iban: wrong } })).toBe(0)
  })

  it('POST /api/accounts with something that is not an iban says so by its name (C4, C5)', async () => {
    const response = await postAccount({ iban: 'mi cuenta de siempre', bank: 'bankinter' })

    expect(response.statusCode).toBe(422)
    expect(response.json().message).toContain('no tiene la forma de un iban')
  })

  it('findOrCreateAccountFromMetadata rejects a mistyped iban and creates nothing (C4)', async () => {
    const wrong = mistypedIban(uniqueIban())

    const failure = await findOrCreateAccountFromMetadata(accountsDb(app), {
      iban: wrong,
      bank: 'bankinter',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(InvalidIbanError)
    expect((failure as InvalidIbanError).code).toBe('INVALID_IBAN')
    expect(await app.prisma.account.count({ where: { iban: wrong } })).toBe(0)
  })

  it('findOrCreateAccountFromMetadata finds the account when the file writes the iban spaced (C2)', async () => {
    const iban = uniqueIban()
    const existing = await createAccount({ iban, bank: 'bankinter' })

    const result = await findOrCreateAccountFromMetadata(accountsDb(app), {
      iban: (iban.match(/.{1,4}/g) ?? []).join(' ').toLowerCase(),
      bank: 'bankinter',
    })

    expect(result.created).toBe(false)
    expect(result.account.id).toBe(existing.id)
  })
})
