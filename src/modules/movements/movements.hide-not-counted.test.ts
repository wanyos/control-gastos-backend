// Feature 68: `hideNotCounted=true` in GET /api/movements leaves out what is
// marked or paired, except the deposit movements that add something to the
// totals. Every figure, concept, name and deposit number here is invented (see
// docs/conventions.md §Tests). The texts are those MyInvestor writes, because
// the app is built with the real registry of `src/app.ts`. It runs in the
// throwaway test database, never in the human's.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ListedMovement, MovementListResponse } from './movements.types.js'

const OPENING = 'APERTURA DEP.: 640923'
const CANCELLATION = 'CANCELACION DEP:640923'
const MATURITY = 'INTERESES DEP.: 640923'
const HOLDER = 'Marta Lozano Ruiz'

// A month nobody else seeds, so the month-wide counts only see this file's rows.
const MONTH = 'from=2024-11-01&to=2024-11-30'

describe('hideNotCounted in GET /api/movements (feature 68)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdProductIds: number[] = []
  const createdOwnAccountIds: number[] = []
  let daySequence = 1
  let pairCounter = 0

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdOwnAccountIds.length > 0) {
      await app.prisma.ownAccount.deleteMany({ where: { id: { in: createdOwnAccountIds } } })
      createdOwnAccountIds.length = 0
    }
    await app.prisma.accountHolderName.deleteMany({})
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

  async function createAccount(bank = 'myinvestor') {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Hide not counted test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createFund() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const product = await app.prisma.investmentProduct.create({
      data: { bank: 'myinvestor', name: `Synthetic fund ${suffix}`, type: 'fund' },
    })
    createdProductIds.push(product.id)
    return product
  }

  function newTransferId(): string {
    pairCounter += 1
    return `f68-pair-${Date.now()}-${pairCounter}`
  }

  interface SeedMovement {
    type: 'expense' | 'income' | 'neutral'
    amount: string
    date: string
    description: string
    excludedFromTotals?: boolean
    paired?: boolean
    productId?: number
    ownershipDecision?: 'mine' | 'not_mine'
  }

  function seed(accountId: number, movement: SeedMovement) {
    const bookingDate = toDate(movement.date)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: movement.type,
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: daySequence++,
        excludedFromTotals: movement.excludedFromTotals ?? false,
        transferId: movement.paired === true ? newTransferId() : null,
        productId: movement.productId ?? null,
        ownershipDecision: movement.ownershipDecision ?? null,
      },
    })
  }

  /** An opening in its own account, and the maturity that returns it with interest. */
  async function maturityWithInterest(
    flags: { excludedFromTotals?: boolean; paired?: boolean },
    dates = { opening: '2024-08-04', maturity: '2024-11-04' },
  ) {
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '3127.48',
      date: dates.opening,
      description: OPENING,
    })
    const maturity = await seed(account.id, {
      type: 'income',
      amount: '3146.93',
      date: dates.maturity,
      description: MATURITY,
      ...flags,
    })
    return { account, maturity }
  }

  async function list(query: string): Promise<MovementListResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/movements?${query}` })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  function ids(response: MovementListResponse): number[] {
    return response.movements.map((movement) => movement.id).sort((a, b) => a - b)
  }

  function sorted(values: number[]): number[] {
    return [...values].sort((a, b) => a - b)
  }

  function rowOf(response: MovementListResponse, id: number): ListedMovement {
    const row = response.movements.find((movement) => movement.id === id)
    expect(row, `movement ${id} in the listing`).toBeDefined()
    return row as ListedMovement
  }

  async function addOwnAccount(payload: object) {
    const response = await app.inject({ method: 'POST', url: '/api/own-accounts', payload })
    expect(response.statusCode).toBe(201)
    createdOwnAccountIds.push(response.json().id)
    return response.json()
  }

  async function setHolderNames(names: string[]) {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/own-accounts/holder-names',
      payload: { names },
    })
    expect(response.statusCode).toBe(200)
  }

  it('keeps a marked maturity with interest and counts its interest', async () => {
    const { account, maturity } = await maturityWithInterest({ excludedFromTotals: true })

    const hidden = await list(`accountId=${account.id}&${MONTH}&hideNotCounted=true`)

    expect(ids(hidden)).toEqual([maturity.id])
    expect(rowOf(hidden, maturity.id).deposit).toMatchObject({
      kind: 'maturity',
      countedAmount: '19.45',
    })
    expect(hidden.pagination).toMatchObject({ total: 1, totalPages: 1 })
    expect(hidden.totals).toEqual({ income: '19.45', expense: '0.00', net: '19.45' })
  })

  it('keeps a paired maturity with interest and counts its interest', async () => {
    const paired = await maturityWithInterest({ paired: true })
    const both = await maturityWithInterest({ paired: true, excludedFromTotals: true })

    for (const { account, maturity } of [paired, both]) {
      const hidden = await list(`accountId=${account.id}&${MONTH}&hideNotCounted=true`)

      expect(ids(hidden)).toEqual([maturity.id])
      expect(hidden.pagination).toMatchObject({ total: 1, totalPages: 1 })
      expect(hidden.totals).toEqual({ income: '19.45', expense: '0.00', net: '19.45' })
    }
  })

  it('hides a normal movement that is marked or paired', async () => {
    const account = await createAccount('bankinter')
    const marked = await seed(account.id, {
      type: 'expense',
      amount: '47.83',
      date: '2024-11-08',
      description: 'SYNTHETIC GROCERY STORE',
      excludedFromTotals: true,
    })
    const paired = await seed(account.id, {
      type: 'income',
      amount: '615.29',
      date: '2024-11-09',
      description: 'TRANSF SYNTHETIC SAVINGS',
      paired: true,
    })
    const plain = await seed(account.id, {
      type: 'expense',
      amount: '23.61',
      date: '2024-11-10',
      description: 'SYNTHETIC BAKERY',
    })

    const all = await list(`accountId=${account.id}`)
    const hidden = await list(`accountId=${account.id}&hideNotCounted=true`)

    expect(ids(all)).toEqual(sorted([marked.id, paired.id, plain.id]))
    expect(ids(hidden)).toEqual([plain.id])
    expect(hidden.pagination).toMatchObject({ total: 1, totalPages: 1 })
    expect(hidden.totals).toEqual({ income: '0.00', expense: '23.61', net: '-23.61' })
  })

  it('hides a doubtful maturity that is marked or paired', async () => {
    // No opening and no product file: the principal cannot be known, so it adds 0.
    const markedAccount = await createAccount()
    const marked = await seed(markedAccount.id, {
      type: 'income',
      amount: '2871.36',
      date: '2024-11-12',
      description: MATURITY,
      excludedFromTotals: true,
    })
    const pairedAccount = await createAccount()
    const paired = await seed(pairedAccount.id, {
      type: 'income',
      amount: '2871.36',
      date: '2024-11-12',
      description: MATURITY,
      paired: true,
    })

    for (const [account, maturity] of [
      [markedAccount, marked],
      [pairedAccount, paired],
    ] as const) {
      const all = await list(`accountId=${account.id}`)
      expect(rowOf(all, maturity.id).deposit).toMatchObject({
        kind: 'maturity',
        ambiguous: true,
        countedAmount: '0.00',
      })

      const hidden = await list(`accountId=${account.id}&hideNotCounted=true`)
      expect(hidden.movements).toEqual([])
      expect(hidden.pagination.total).toBe(0)
    }
  })

  it('hides a deposit opening or cancellation that is marked or paired', async () => {
    const account = await createAccount()
    const markedOpening = await seed(account.id, {
      type: 'expense',
      amount: '1984.52',
      date: '2024-11-05',
      description: OPENING,
      excludedFromTotals: true,
    })
    const pairedCancellation = await seed(account.id, {
      type: 'income',
      amount: '1984.52',
      date: '2024-11-20',
      description: CANCELLATION,
      paired: true,
    })
    const pairedOpening = await seed(account.id, {
      type: 'expense',
      amount: '2215.07',
      date: '2024-11-21',
      description: OPENING,
      paired: true,
    })
    const markedCancellation = await seed(account.id, {
      type: 'income',
      amount: '2215.07',
      date: '2024-11-26',
      description: CANCELLATION,
      excludedFromTotals: true,
    })

    const all = await list(`accountId=${account.id}`)
    expect(rowOf(all, markedOpening.id).deposit).toMatchObject({ kind: 'opening' })
    expect(rowOf(all, pairedOpening.id).deposit).toMatchObject({ kind: 'opening' })
    expect(rowOf(all, pairedCancellation.id).deposit).toMatchObject({ kind: 'cancellation' })
    expect(rowOf(all, markedCancellation.id).deposit).toMatchObject({ kind: 'cancellation' })

    const hidden = await list(`accountId=${account.id}&hideNotCounted=true`)
    expect(hidden.movements).toEqual([])
    expect(hidden.pagination.total).toBe(0)
  })

  it('hides a maturity whose interest is exactly zero when marked', async () => {
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '2750.62',
      date: '2024-08-14',
      description: OPENING,
    })
    const maturity = await seed(account.id, {
      type: 'income',
      amount: '2750.62',
      date: '2024-11-14',
      description: MATURITY,
      excludedFromTotals: true,
    })

    const all = await list(`accountId=${account.id}&${MONTH}`)
    expect(rowOf(all, maturity.id).deposit).toMatchObject({
      kind: 'maturity',
      principal: '2750.62',
      ambiguous: false,
      countedAmount: '0.00',
    })

    const hidden = await list(`accountId=${account.id}&${MONTH}&hideNotCounted=true`)
    expect(hidden.movements).toEqual([])
    expect(hidden.pagination.total).toBe(0)
  })

  it('keeps everything that is neither marked nor paired', async () => {
    await setHolderNames([HOLDER])
    const fund = await createFund()
    const account = await createAccount()
    const own = await seed(account.id, {
      type: 'expense',
      amount: '350.18',
      date: '2024-11-03',
      description: `TRANSF /${HOLDER}`,
    })
    const neutral = await seed(account.id, {
      type: 'neutral',
      amount: '0.00',
      date: '2024-11-06',
      description: 'SYNTHETIC ZERO ADJUSTMENT',
    })
    const toProduct = await seed(account.id, {
      type: 'expense',
      amount: '275.44',
      date: '2024-11-07',
      description: 'SYNTHETIC FUND SUBSCRIPTION',
      productId: fund.id,
    })
    const opening = await seed(account.id, {
      type: 'expense',
      amount: '1693.27',
      date: '2024-11-11',
      description: OPENING,
    })

    const hidden = await list(`accountId=${account.id}&hideNotCounted=true`)

    expect(ids(hidden)).toEqual(sorted([own.id, neutral.id, toProduct.id, opening.id]))
    expect(rowOf(hidden, own.id).ownership?.status).toBe('own')
    expect(rowOf(hidden, opening.id).deposit).toMatchObject({ kind: 'opening' })
    expect(hidden.pagination.total).toBe(4)
  })

  it('keeps a maturity whose opening is before the requested range', async () => {
    const { account, maturity } = await maturityWithInterest(
      { excludedFromTotals: true },
      { opening: '2024-10-17', maturity: '2024-11-17' },
    )

    const november = await list(`accountId=${account.id}&${MONTH}&hideNotCounted=true`)

    expect(ids(november)).toEqual([maturity.id])
    expect(rowOf(november, maturity.id).deposit).toMatchObject({
      principal: '3127.48',
      countedAmount: '19.45',
    })
    expect(november.totals).toEqual({ income: '19.45', expense: '0.00', net: '19.45' })
  })

  /**
   * One month with every case of this file, spread over several accounts.
   * Returns the ids that `hideNotCounted=true` has to leave out.
   */
  async function seedWholeMonth(): Promise<number[]> {
    await setHolderNames([HOLDER])
    const fund = await createFund()
    const hiddenIds: number[] = []

    await maturityWithInterest({ excludedFromTotals: true })
    await maturityWithInterest({ paired: true })
    await maturityWithInterest({ paired: true, excludedFromTotals: true })

    const main = await createAccount()
    await seed(main.id, {
      type: 'income',
      amount: '1842.67',
      date: '2024-11-01',
      description: 'SYNTHETIC PAYROLL',
    })
    await seed(main.id, {
      type: 'expense',
      amount: '61.39',
      date: '2024-11-02',
      description: 'SYNTHETIC PHARMACY',
    })
    hiddenIds.push(
      (
        await seed(main.id, {
          type: 'expense',
          amount: '47.83',
          date: '2024-11-08',
          description: 'SYNTHETIC GROCERY STORE',
          excludedFromTotals: true,
        })
      ).id,
      (
        await seed(main.id, {
          type: 'income',
          amount: '615.29',
          date: '2024-11-09',
          description: 'TRANSF SYNTHETIC SAVINGS',
          paired: true,
        })
      ).id,
      // Own money, marked; and a «mine» decision, paired.
      (
        await seed(main.id, {
          type: 'expense',
          amount: '412.56',
          date: '2024-11-13',
          description: `TRANSF /${HOLDER}`,
          excludedFromTotals: true,
        })
      ).id,
      (
        await seed(main.id, {
          type: 'income',
          amount: '188.74',
          date: '2024-11-15',
          description: 'TRASPASO SYNTHETIC',
          paired: true,
          ownershipDecision: 'mine',
        })
      ).id,
    )
    // Not marked nor paired, and adding nothing: they stay.
    await seed(main.id, {
      type: 'expense',
      amount: '350.18',
      date: '2024-11-03',
      description: `TRANSF /${HOLDER}`,
    })
    await seed(main.id, {
      type: 'expense',
      amount: '275.44',
      date: '2024-11-07',
      description: 'SYNTHETIC FUND SUBSCRIPTION',
      productId: fund.id,
    })

    const doubtful = await createAccount()
    hiddenIds.push(
      (
        await seed(doubtful.id, {
          type: 'income',
          amount: '2871.36',
          date: '2024-11-12',
          description: MATURITY,
          excludedFromTotals: true,
        })
      ).id,
    )

    const zero = await createAccount()
    await seed(zero.id, {
      type: 'expense',
      amount: '2750.62',
      date: '2024-08-14',
      description: OPENING,
    })
    hiddenIds.push(
      (
        await seed(zero.id, {
          type: 'income',
          amount: '2750.62',
          date: '2024-11-14',
          description: MATURITY,
          excludedFromTotals: true,
        })
      ).id,
    )

    const openings = await createAccount()
    hiddenIds.push(
      (
        await seed(openings.id, {
          type: 'expense',
          amount: '1984.52',
          date: '2024-11-05',
          description: OPENING,
          excludedFromTotals: true,
        })
      ).id,
      (
        await seed(openings.id, {
          type: 'income',
          amount: '1984.52',
          date: '2024-11-20',
          description: CANCELLATION,
          paired: true,
        })
      ).id,
    )
    return hiddenIds
  }

  it('gives the same totals with and without hideNotCounted', async () => {
    await seedWholeMonth()

    const without = await list(MONTH)
    const withIt = await list(`${MONTH}&hideNotCounted=true`)
    const oldCheckbox = await list(`${MONTH}&excluded=none&transfer=none`)

    expect(withIt.totals).toEqual(without.totals)
    // Payroll + three maturities of 19.45 each; pharmacy only.
    expect(without.totals).toEqual({ income: '1901.02', expense: '61.39', net: '1839.63' })
    // What the old checkbox loses: the interest of the three marked or paired maturities.
    expect(oldCheckbox.totals).toEqual({ income: '1842.67', expense: '61.39', net: '1781.28' })
  })

  it('what it shows plus what it hides is every movement of the month', async () => {
    const hiddenIds = await seedWholeMonth()

    const shown = await list(`${MONTH}&hideNotCounted=true`)
    // The frontend's second request: same filter without the parameter, one row.
    const everything = await list(`${MONTH}&pageSize=1`)

    expect(everything.pagination.total - shown.pagination.total).toBe(hiddenIds.length)
    expect(hiddenIds).toHaveLength(8)
    const all = await list(`${MONTH}&pageSize=200`)
    expect(ids(all)).toEqual(sorted([...ids(shown), ...hiddenIds]))
  })

  it('hideNotCounted=false or absent does not filter', async () => {
    await seedWholeMonth()

    const absent = await list(MONTH)
    const off = await list(`${MONTH}&hideNotCounted=false`)
    const on = await list(`${MONTH}&hideNotCounted=true`)

    expect(off).toEqual(absent)
    expect(on.pagination.total).toBeLessThan(absent.pagination.total)
  })

  it('rejects a hideNotCounted that is not true or false', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/movements?hideNotCounted=yes',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('combines hideNotCounted with excluded, transfer and ownership', async () => {
    const markedMaturity = await maturityWithInterest({ excludedFromTotals: true })
    const pairedMaturity = await maturityWithInterest({ paired: true })
    const account = await createAccount()
    await seed(account.id, {
      type: 'expense',
      amount: '47.83',
      date: '2024-11-08',
      description: 'SYNTHETIC GROCERY STORE',
      excludedFromTotals: true,
    })
    await seed(account.id, {
      type: 'expense',
      amount: '1984.52',
      date: '2024-11-05',
      description: OPENING,
      excludedFromTotals: true,
    })
    const plain = await seed(account.id, {
      type: 'expense',
      amount: '61.39',
      date: '2024-11-02',
      description: 'SYNTHETIC PHARMACY',
    })
    await seed(account.id, {
      type: 'income',
      amount: '615.29',
      date: '2024-11-09',
      description: 'TRANSF SYNTHETIC SAVINGS',
      paired: true,
    })
    await addOwnAccount({
      name: 'Cuenta inventada',
      bank: 'Trade Republic',
      type: 'checking',
      texts: ['Trade Republic'],
    })
    const doubtful = await seed(account.id, {
      type: 'expense',
      amount: '96.47',
      date: '2024-11-16',
      description: 'TRANSF /TRADE REPUBLIC',
    })

    const onlyMarked = await list(`${MONTH}&excluded=only&hideNotCounted=true`)
    expect(ids(onlyMarked)).toEqual([markedMaturity.maturity.id])
    expect(onlyMarked.totals).toEqual({ income: '19.45', expense: '0.00', net: '19.45' })

    const notPaired = await list(`${MONTH}&transfer=none&hideNotCounted=true`)
    expect(ids(notPaired)).toEqual(sorted([markedMaturity.maturity.id, plain.id, doubtful.id]))

    const onlyPaired = await list(`${MONTH}&transfer=only&hideNotCounted=true`)
    expect(ids(onlyPaired)).toEqual([pairedMaturity.maturity.id])

    const onlyDoubtful = await list(`${MONTH}&ownership=doubtful&hideNotCounted=true`)
    expect(ids(onlyDoubtful)).toEqual([doubtful.id])
    expect(rowOf(onlyDoubtful, doubtful.id).ownership?.status).toBe('doubtful')
  })
})
