// What each deposit with a product file earned (feature 50). Every figure,
// concept and deposit number in this file is invented (see docs/conventions.md
// §Tests): fixtures only need to be well formed, never true.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { isMyinvestorDepositMaturity } from '../myinvestor/myinvestor.deposit-maturity.js'
import type { SerializedAccount } from '../accounts/accounts.types.js'
import { getDepositEarnings } from './investments.service.js'
import type {
  DepositEarningsEntry,
  DepositEarningsResponse,
  DepositMaturityMatcherRegistry,
} from './investments.types.js'

const TODAY = '2026-06-15'

// A fake bank with a fake matcher, and MyInvestor with the real one.
const matchers: DepositMaturityMatcherRegistry = [
  { bank: 'synthbank', isDepositMaturity: (text) => text.startsWith('SYNTH MATURITY') },
  { bank: 'myinvestor', isDepositMaturity: isMyinvestorDepositMaturity },
]

describe('deposit earnings (feature 50)', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []
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
    if (createdProductIds.length > 0) {
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function toDate(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`)
  }

  interface SeedDeposit {
    bank?: string
    openedAt?: string | null
    closedAt?: string | null
    principal?: string | null
    expectedGain?: string | null
    maturityDate?: string | null
  }

  async function createDeposit(overrides: SeedDeposit = {}) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const openedAt = overrides.openedAt === undefined ? '2026-03-02' : overrides.openedAt
    const maturityDate =
      overrides.maturityDate === undefined ? '2026-06-02' : overrides.maturityDate
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: overrides.bank ?? 'synthbank',
        name: `Synthetic deposit ${suffix}`,
        type: 'deposit',
        openedAt: openedAt === null ? null : toDate(openedAt),
        closedAt: overrides.closedAt == null ? null : toDate(overrides.closedAt),
        principal: overrides.principal === undefined ? '4000.00' : overrides.principal,
        interestRate: '2.1500',
        expectedGain: overrides.expectedGain === undefined ? '21.50' : overrides.expectedGain,
        maturityDate: maturityDate === null ? null : toDate(maturityDate),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  async function createAccount(bank = 'synthbank') {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Deposit earnings test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    bookingDate?: string
    description?: string
    excludedFromTotals?: boolean
    daySequence?: number
  }

  function seedMovement(accountId: number, overrides: SeedMovement = {}) {
    const bookingDate = toDate(overrides.bookingDate ?? '2026-06-02')
    return app.prisma.movement.create({
      data: {
        accountId,
        type: overrides.type ?? 'income',
        amount: overrides.amount ?? '4021.37',
        description: overrides.description ?? 'SYNTH MATURITY 777001',
        bookingDate,
        valueDate: bookingDate,
        daySequence: overrides.daySequence ?? 1,
        ...(overrides.excludedFromTotals === undefined
          ? {}
          : { excludedFromTotals: overrides.excludedFromTotals }),
      },
    })
  }

  function read(today = TODAY, registry = matchers): Promise<DepositEarningsResponse> {
    return getDepositEarnings(app.prisma, registry, toDate(today))
  }

  function entryOf(response: DepositEarningsResponse, id: number): DepositEarningsEntry {
    const entry = response.deposits.find((deposit) => deposit.id === id)
    expect(entry).toBeDefined()
    return entry as DepositEarningsEntry
  }

  // ------------------------------------------------------- list and shape (T6)

  describe('the list and its shape', () => {
    it('answers an empty list and a zero total when there is no deposit (R1, R9)', async () => {
      const response = await read()

      expect(response).toEqual({ asOf: TODAY, deposits: [], total: '0.00' })
    })

    it('lists every deposit, live, matured or closed long ago, by maturityDate desc then id desc (R1)', async () => {
      const closedLongAgo = await createDeposit({
        openedAt: '2025-01-10',
        maturityDate: '2025-04-10',
        closedAt: '2025-04-10',
      })
      const alive = await createDeposit({ maturityDate: '2026-09-02' })
      const maturedA = await createDeposit({ maturityDate: '2026-06-02' })
      const maturedB = await createDeposit({ maturityDate: '2026-06-02' })
      // A fund is not a deposit: never listed here.
      const fund = await app.prisma.investmentProduct.create({
        data: { bank: 'synthbank', name: `Synthetic fund ${Date.now()}`, type: 'fund' },
      })
      createdProductIds.push(fund.id)

      const response = await read()

      expect(response.deposits.map((deposit) => deposit.id)).toEqual([
        alive.id,
        maturedB.id,
        maturedA.id,
        closedLongAgo.id,
      ])
    })

    it('carries the conditions of each product exactly as stored (R2)', async () => {
      const product = await createDeposit({
        openedAt: '2026-01-05',
        closedAt: '2026-07-05',
        principal: '2500.00',
        expectedGain: '18.40',
        maturityDate: '2026-07-05',
      })
      const bare = await createDeposit({
        openedAt: null,
        expectedGain: null,
        maturityDate: '2026-08-20',
      })

      const response = await read()

      expect(entryOf(response, product.id)).toMatchObject({
        id: product.id,
        bank: 'synthbank',
        name: product.name,
        openedAt: '2026-01-05',
        closedAt: '2026-07-05',
        principal: '2500.00',
        expectedGain: '18.40',
        maturityDate: '2026-07-05',
      })
      expect(entryOf(response, bare.id)).toMatchObject({
        openedAt: null,
        closedAt: null,
        expectedGain: null,
      })
    })

    it('reports the injected today as asOf (R1)', async () => {
      const response = await read('2026-02-28')

      expect(response.asOf).toBe('2026-02-28')
    })
  })

  // -------------------------------------------------------------- status (T7)

  describe('the status and the figure of each deposit', () => {
    it('keeps a live deposit active with no figure, even with a maturity seeded on its future date (R3)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ maturityDate: '2026-09-02', closedAt: '2026-09-02' })
      await seedMovement(account.id, { bookingDate: '2026-09-02', amount: '4021.37' })

      const entry = entryOf(await read(), product.id)

      expect(entry).toMatchObject({
        status: 'active',
        earned: null,
        maturity: null,
        candidateMovementIds: [],
      })
    })

    it('gives a matured deposit amount minus principal, with the linked movement (R4)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ principal: '4000.00', maturityDate: '2026-06-02' })
      const movement = await seedMovement(account.id, {
        bookingDate: '2026-06-02',
        amount: '4021.37',
      })

      const response = await read()

      expect(entryOf(response, product.id)).toMatchObject({
        status: 'matured',
        earned: '21.37',
        maturity: { movementId: movement.id, date: '2026-06-02', amount: '4021.37' },
        candidateMovementIds: [],
      })
      expect(response.total).toBe('21.37')
    })

    it('looks for the maturity of a deposit that matures today (R4)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ principal: '4000.00', maturityDate: TODAY })
      await seedMovement(account.id, { bookingDate: TODAY, amount: '4009.12' })

      const entry = entryOf(await read(), product.id)

      expect(entry.status).toBe('matured')
      expect(entry.earned).toBe('9.12')
    })

    it('says maturity_not_found when no candidate exists, never a zero (R5)', async () => {
      const product = await createDeposit({ maturityDate: '2026-06-02' })

      const response = await read()

      expect(entryOf(response, product.id)).toMatchObject({
        status: 'maturity_not_found',
        earned: null,
        maturity: null,
        candidateMovementIds: [],
      })
      expect(response.total).toBe('0.00')
    })

    it('says ambiguous with the candidate ids ascending when two candidates exist (R6)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ maturityDate: '2026-06-02' })
      const first = await seedMovement(account.id, { amount: '4021.37', daySequence: 1 })
      const second = await seedMovement(account.id, { amount: '4033.90', daySequence: 2 })

      const response = await read()

      expect(entryOf(response, product.id)).toMatchObject({
        status: 'ambiguous',
        earned: null,
        maturity: null,
        candidateMovementIds: [first.id, second.id].sort((a, b) => a - b),
      })
      expect(response.total).toBe('0.00')
    })

    it('says cancelled when closedAt is before maturityDate, even with a candidate (R7)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ maturityDate: '2026-06-02', closedAt: '2026-04-20' })
      await seedMovement(account.id, { bookingDate: '2026-06-02', amount: '4021.37' })

      const response = await read()

      expect(entryOf(response, product.id)).toMatchObject({
        status: 'cancelled',
        earned: null,
        maturity: null,
        candidateMovementIds: [],
      })
      expect(response.total).toBe('0.00')
    })

    it('says below_principal and shows the movement when it brings less than the principal (R8)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ principal: '4000.00', maturityDate: '2026-06-02' })
      const movement = await seedMovement(account.id, { amount: '17.64' })

      const response = await read()

      expect(entryOf(response, product.id)).toMatchObject({
        status: 'below_principal',
        earned: null,
        maturity: { movementId: movement.id, date: '2026-06-02', amount: '17.64' },
        candidateMovementIds: [],
      })
      expect(response.total).toBe('0.00')
    })

    it('gives no figure to a due deposit whose principal is NULL (defensive)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ principal: null, maturityDate: '2026-06-02' })
      await seedMovement(account.id)

      const entry = entryOf(await read(), product.id)

      expect(entry).toMatchObject({ status: 'maturity_not_found', earned: null, maturity: null })
    })

    it('gives no figure to a deposit whose maturityDate is NULL (defensive)', async () => {
      const product = await createDeposit({ maturityDate: null })

      const entry = entryOf(await read(), product.id)

      expect(entry).toMatchObject({ status: 'maturity_not_found', earned: null, maturity: null })
    })
  })

  // ---------------------------------------------------------------- link (T8)

  describe('how a maturity is linked to its deposit', () => {
    it('ignores a movement of another bank, an expense, another date or a non-maturity text', async () => {
      const ownBank = await createAccount('synthbank')
      const otherBank = await createAccount('otherbank')
      const product = await createDeposit({ maturityDate: '2026-06-02' })
      await seedMovement(otherBank.id, { amount: '4021.37' })
      await seedMovement(ownBank.id, { type: 'expense', amount: '4021.37', daySequence: 1 })
      await seedMovement(ownBank.id, { bookingDate: '2026-06-03', amount: '4021.37' })
      await seedMovement(ownBank.id, {
        description: 'SYNTH OPENING 777001',
        amount: '4021.37',
        daySequence: 2,
      })

      const entry = entryOf(await read(), product.id)

      expect(entry.status).toBe('maturity_not_found')
    })

    it('ignores an opening or a cancellation with the real MyInvestor matcher (R11)', async () => {
      const account = await createAccount('myinvestor')
      const product = await createDeposit({ bank: 'myinvestor', maturityDate: '2026-06-02' })
      await seedMovement(account.id, {
        description: 'APERTURA DEP.: 777001',
        amount: '4021.37',
        daySequence: 1,
      })
      await seedMovement(account.id, {
        description: 'CANCELACION DEP:777001',
        amount: '4021.37',
        daySequence: 2,
      })

      const entry = entryOf(await read(), product.id)

      expect(entry.status).toBe('maturity_not_found')
    })

    it('finds nothing for a bank with no registered matcher', async () => {
      const account = await createAccount('nomatcherbank')
      const product = await createDeposit({ bank: 'nomatcherbank', maturityDate: '2026-06-02' })
      await seedMovement(account.id)

      const entry = entryOf(await read(), product.id)

      expect(entry.status).toBe('maturity_not_found')
    })

    it('links each deposit only to the maturity on its own date, whatever the number says (R12)', async () => {
      const account = await createAccount()
      const early = await createDeposit({ principal: '4000.00', maturityDate: '2026-05-04' })
      const late = await createDeposit({ principal: '3000.00', maturityDate: '2026-06-02' })
      const earlyMovement = await seedMovement(account.id, {
        bookingDate: '2026-05-04',
        amount: '4015.26',
        description: 'SYNTH MATURITY 777009',
      })
      const lateMovement = await seedMovement(account.id, {
        bookingDate: '2026-06-02',
        amount: '3011.48',
        description: 'SYNTH MATURITY 777009',
      })

      const response = await read()

      expect(entryOf(response, early.id)).toMatchObject({
        status: 'matured',
        earned: '15.26',
        maturity: { movementId: earlyMovement.id },
      })
      expect(entryOf(response, late.id)).toMatchObject({
        status: 'matured',
        earned: '11.48',
        maturity: { movementId: lateMovement.id },
      })
    })

    it('finds a candidate whether excludedFromTotals is true or false (R13)', async () => {
      const account = await createAccount()
      const marked = await createDeposit({ principal: '4000.00', maturityDate: '2026-05-04' })
      const unmarked = await createDeposit({ principal: '4000.00', maturityDate: '2026-06-02' })
      await seedMovement(account.id, {
        bookingDate: '2026-05-04',
        amount: '4013.05',
        excludedFromTotals: true,
      })
      await seedMovement(account.id, {
        bookingDate: '2026-06-02',
        amount: '4007.81',
        excludedFromTotals: false,
      })

      const response = await read()

      expect(entryOf(response, marked.id)).toMatchObject({ status: 'matured', earned: '13.05' })
      expect(entryOf(response, unmarked.id)).toMatchObject({ status: 'matured', earned: '7.81' })
    })

    it('leaves out a maturity whose deposit has no product file, and still answers (R10)', async () => {
      const account = await createAccount()
      const product = await createDeposit({ principal: '4000.00', maturityDate: '2026-06-02' })
      await seedMovement(account.id, { bookingDate: '2026-06-02', amount: '4021.37' })
      // An old deposit with no product file: its maturity has nobody to link to.
      await seedMovement(account.id, { bookingDate: '2026-02-11', amount: '2503.19' })

      const response = await read()

      expect(response.deposits.map((deposit) => deposit.id)).toEqual([product.id])
      expect(response.total).toBe('21.37')
    })

    it('sums only the matured entries into total (R9)', async () => {
      const account = await createAccount()
      await createDeposit({ principal: '4000.00', maturityDate: '2026-06-02' })
      await createDeposit({ principal: '3000.00', maturityDate: '2026-05-04' })
      await createDeposit({ principal: '4000.00', maturityDate: '2026-04-06' }) // below principal
      await createDeposit({ maturityDate: '2026-03-09' }) // not found
      await createDeposit({ maturityDate: '2026-09-02' }) // active
      await createDeposit({ maturityDate: '2026-06-09', closedAt: '2026-05-20' }) // cancelled
      await seedMovement(account.id, { bookingDate: '2026-06-02', amount: '4021.37' })
      await seedMovement(account.id, { bookingDate: '2026-05-04', amount: '3011.48' })
      await seedMovement(account.id, { bookingDate: '2026-04-06', amount: '12.30' })
      await seedMovement(account.id, { bookingDate: '2026-06-09', amount: '4050.00' })

      const response = await read()

      expect(response.deposits.map((deposit) => deposit.status).sort()).toEqual([
        'active',
        'below_principal',
        'cancelled',
        'matured',
        'matured',
        'maturity_not_found',
      ])
      expect(response.total).toBe('32.85')
    })
  })

  // ------------------------------------------------------ read only (T9, R14)

  it('writes nothing while answering (R14)', async () => {
    const account = await createAccount()
    await createDeposit({ principal: '4000.00', maturityDate: '2026-06-02' })
    await createDeposit({ maturityDate: '2026-09-02' })
    const seeded = [
      await seedMovement(account.id, { amount: '4021.37', excludedFromTotals: true }),
      await seedMovement(account.id, { bookingDate: '2026-05-04', amount: '28.60' }),
    ]

    const movementFields = () =>
      app.prisma.movement.findMany({
        where: { id: { in: seeded.map((movement) => movement.id) } },
        orderBy: { id: 'asc' },
        select: {
          amount: true,
          excludedFromTotals: true,
          productId: true,
          transferId: true,
          updatedAt: true,
        },
      })
    const balance = async () => {
      const response = await app.inject({ method: 'GET', url: '/api/accounts' })
      return response.json<SerializedAccount[]>().find((row) => row.id === account.id)?.balance
    }
    const products = () =>
      app.prisma.investmentProduct.findMany({
        where: { id: { in: createdProductIds } },
        orderBy: { id: 'asc' },
      })

    const before = [await movementFields(), await balance(), await products()]
    await read()
    const route = await app.inject({ method: 'GET', url: '/api/investments/deposits' })
    const after = [await movementFields(), await balance(), await products()]

    expect(route.statusCode).toBe(200)
    expect(after).toEqual(before)
  })

  // ---------------------------------------------------------- the route (T6, T10)

  describe('GET /api/investments/deposits', () => {
    it('is registered as a GET only', () => {
      expect(app.hasRoute({ method: 'GET', url: '/api/investments/deposits' })).toBe(true)
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'] as const) {
        expect(app.hasRoute({ method, url: '/api/investments/deposits' })).toBe(false)
      }
    })

    it('answers asOf with today in UTC', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/investments/deposits' })

      expect(response.statusCode).toBe(200)
      expect(response.json<DepositEarningsResponse>().asOf).toBe(
        new Date().toISOString().slice(0, 10),
      )
    })

    it('ignores an unknown querystring parameter, same as the other investment views', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/investments/deposits?foo=bar',
      })

      expect(response.statusCode).toBe(200)
    })

    it('links a real MyInvestor maturity through the registry of app.ts (R4, R11)', async () => {
      const account = await createAccount('myinvestor')
      const product = await createDeposit({
        bank: 'myinvestor',
        principal: '4000.00',
        maturityDate: '2026-06-02',
      })
      const movement = await seedMovement(account.id, {
        bookingDate: '2026-06-02',
        amount: '4021.37',
        description: 'INTERESES DEP.: 777001',
      })

      const response = await app.inject({ method: 'GET', url: '/api/investments/deposits' })

      expect(response.statusCode).toBe(200)
      const body = response.json<DepositEarningsResponse>()
      expect(entryOf(body, product.id)).toMatchObject({
        status: 'matured',
        earned: '21.37',
        maturity: { movementId: movement.id, date: '2026-06-02', amount: '4021.37' },
      })
      expect(body.total).toBe('21.37')
    })
  })
})
