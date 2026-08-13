import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { MissingAccountDataError } from '../../errors/app-error.js'
import { AccountType } from '../../generated/prisma/client.js'
import { accountsDb, findOrCreateAccountFromMetadata } from './accounts.service.js'
import type { SerializedAccount } from './accounts.types.js'

let ibanCounter = 0

/**
 * Unique IBAN per call: the column is the natural key, the DB is shared and
 * test files run in parallel (hence the random suffix, not just a counter).
 */
function uniqueIban(): string {
  ibanCounter += 1
  return `ES${Date.now()}${ibanCounter}${Math.floor(Math.random() * 1_000_000)}`
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
})
