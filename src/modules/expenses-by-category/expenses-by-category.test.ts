// GET /api/expenses-by-category (feature 63). Every figure, concept and name in
// this file is invented (see docs/conventions.md §Tests): fixtures only need to
// be well formed, never true. The holder «Ana Pérez Gil» is invented too. It
// runs in the throwaway test database, never in the human's.
import { readFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Prisma } from '../../generated/prisma/client.js'

import { buildApp, depositMaturityMatchers } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { OverviewResponse } from '../overview/overview.types.js'
import { getExpensesByCategory, resolvePeriods } from './expenses-by-category.service.js'
import type {
  ExpensesByCategoryGroup,
  ExpensesByCategoryLine,
  ExpensesByCategoryResponse,
} from './expenses-by-category.types.js'

describe('GET /api/expenses-by-category', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []
  const createdProductIds: number[] = []
  const createdOwnAccountIds: number[] = []
  let daySequence = 1

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
    if (createdCategoryIds.length > 0) {
      await app.prisma.categoryRule.deleteMany({
        where: { categoryId: { in: createdCategoryIds } },
      })
      // Children first: the self-relation restricts deleting a parent in use.
      await app.prisma.category.deleteMany({
        where: { id: { in: createdCategoryIds }, parentId: { not: null } },
      })
      await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
      createdCategoryIds.length = 0
    }
    if (createdProductIds.length > 0) {
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function suffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  }

  async function createAccount(bank = 'bankinter') {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Expenses by category test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(name: string, options: { parentId?: number } = {}) {
    const category = await app.prisma.category.create({
      data: { name: `${name} ${suffix()}`, kind: 'expense', parentId: options.parentId ?? null },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  /** The mark goes through the API, as the human sets it. */
  async function markFixed(categoryId: number) {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${categoryId}`,
      payload: { isFixed: true },
    })
    expect(response.statusCode).toBe(200)
  }

  interface SeedMovement {
    date: string
    amount: string
    description: string
    type?: 'expense' | 'income' | 'neutral'
    categoryId?: number | null
    transferId?: string | null
    productId?: number | null
    excludedFromTotals?: boolean
    daySequence?: number | null
  }

  function seed(accountId: number, movement: SeedMovement) {
    const bookingDate = new Date(`${movement.date}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: movement.daySequence === undefined ? daySequence++ : movement.daySequence,
        categoryId: movement.categoryId ?? null,
        transferId: movement.transferId ?? null,
        productId: movement.productId ?? null,
        excludedFromTotals: movement.excludedFromTotals ?? false,
      },
    })
  }

  async function query(search: string): Promise<ExpensesByCategoryResponse> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/expenses-by-category?${search}`,
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  function lineOf(group: ExpensesByCategoryGroup, categoryId: number | null) {
    const line = group.lines.find((entry) => (entry.category?.id ?? null) === categoryId)
    expect(line, `line ${categoryId}`).toBeDefined()
    return line as ExpensesByCategoryLine
  }

  function lineIds(group: ExpensesByCategoryGroup): Array<number | null> {
    return group.lines.map((line) => line.category?.id ?? null)
  }

  it('a month lists each category with its amount, the previous month and the difference', async () => {
    const account = await createAccount()
    const groceries = await createCategory('Synthetic groceries')
    const fuel = await createCategory('Synthetic fuel')
    const pharmacy = await createCategory('Synthetic pharmacy')
    const booksA = await createCategory('Synthetic A books')
    const musicB = await createCategory('Synthetic B music')
    await seed(account.id, {
      date: '2025-03-04',
      amount: '84.37',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })
    await seed(account.id, {
      date: '2025-03-27',
      amount: '23.18',
      description: 'FRUTERIA INVENTADA NORTE',
      categoryId: groceries.id,
    })
    await seed(account.id, {
      date: '2025-02-11',
      amount: '96.42',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })
    await seed(account.id, {
      date: '2025-03-15',
      amount: '61.29',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })
    await seed(account.id, {
      date: '2025-02-20',
      amount: '74.86',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })
    await seed(account.id, {
      date: '2025-03-09',
      amount: '61.29',
      description: 'FARMACIA FICTICIA PLAZA',
      categoryId: pharmacy.id,
    })
    await seed(account.id, {
      date: '2025-02-01',
      amount: '12.53',
      description: 'FARMACIA FICTICIA PLAZA',
      categoryId: pharmacy.id,
    })
    await seed(account.id, {
      date: '2025-03-22',
      amount: '9.47',
      description: 'LIBRERIA INVENTADA SUR',
      categoryId: booksA.id,
    })
    await seed(account.id, {
      date: '2025-03-23',
      amount: '9.47',
      description: 'TIENDA DISCOS FICTICIA',
      categoryId: musicB.id,
    })
    // Outside both months.
    await seed(account.id, {
      date: '2025-01-31',
      amount: '38.61',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })
    await seed(account.id, {
      date: '2025-04-01',
      amount: '27.94',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })

    const response = await query('month=2025-03')

    expect(response.period).toEqual({
      month: '2025-03',
      year: null,
      from: '2025-03-01',
      to: '2025-03-31',
      months: 1,
    })
    expect(response.compared).toEqual({ from: '2025-02-01', to: '2025-02-28', months: 1 })
    expect(response.compare).toBe('previous-month')
    // 107.55 + 61.29 + 61.29 + 9.47 + 9.47 and 96.42 + 74.86 + 12.53.
    expect(response.amount).toBe('249.07')
    expect(response.comparedAmount).toBe('183.81')
    expect(response.difference).toBe('65.26')
    expect(response.fixed).toEqual({
      amount: '0.00',
      comparedAmount: '0.00',
      difference: '0.00',
      lines: [],
    })

    const groceriesLine = lineOf(response.variable, groceries.id)
    expect(groceriesLine).toMatchObject({
      category: { id: groceries.id, name: groceries.name, parentId: null, isFixed: false },
      amount: '107.55',
      comparedAmount: '96.42',
      difference: '11.13',
      change: null,
      monthlyAmount: null,
    })
    expect(lineOf(response.variable, fuel.id)).toMatchObject({
      amount: '61.29',
      comparedAmount: '74.86',
      difference: '-13.57',
    })
    // Amount desc; on a tie, compared desc; on a tie of both, by name.
    expect(lineIds(response.variable)).toEqual([
      groceries.id,
      fuel.id,
      pharmacy.id,
      booksA.id,
      musicB.id,
    ])

    // `compare=previous-month` is the default.
    const explicit = await query('month=2025-03&compare=previous-month')
    expect(explicit).toEqual(response)
  })

  it('compares a month with the same month of the previous year', async () => {
    const account = await createAccount()
    const leisure = await createCategory('Synthetic leisure')
    await seed(account.id, {
      date: '2025-03-14',
      amount: '42.68',
      description: 'CINE FICTICIO CENTRO',
      categoryId: leisure.id,
    })
    await seed(account.id, {
      date: '2024-03-02',
      amount: '18.71',
      description: 'CINE FICTICIO CENTRO',
      categoryId: leisure.id,
    })
    await seed(account.id, {
      date: '2024-03-31',
      amount: '11.08',
      description: 'TEATRO INVENTADO',
      categoryId: leisure.id,
    })
    // The previous month is not the compared one now.
    await seed(account.id, {
      date: '2025-02-17',
      amount: '57.39',
      description: 'CINE FICTICIO CENTRO',
      categoryId: leisure.id,
    })

    const response = await query('month=2025-03&compare=same-month-last-year')

    expect(response.compare).toBe('same-month-last-year')
    expect(response.compared).toEqual({ from: '2024-03-01', to: '2024-03-31', months: 1 })
    expect(response.variable.lines).toHaveLength(1)
    expect(lineOf(response.variable, leisure.id)).toMatchObject({
      amount: '42.68',
      comparedAmount: '29.79',
      difference: '12.89',
      change: null,
    })
    expect(response.comparedAmount).toBe('29.79')
  })

  it('a closed year compares with the whole previous year and divides by twelve', async () => {
    const account = await createAccount()
    const insurance = await createCategory('Synthetic insurance')
    await seed(account.id, {
      date: '2024-01-01',
      amount: '517.83',
      description: 'SEGURO HOGAR FICTICIO',
      categoryId: insurance.id,
    })
    await seed(account.id, {
      date: '2024-12-31',
      amount: '228.41',
      description: 'SEGURO COCHE INVENTADO',
      categoryId: insurance.id,
    })
    await seed(account.id, {
      date: '2023-06-18',
      amount: '693.17',
      description: 'SEGURO HOGAR FICTICIO',
      categoryId: insurance.id,
    })
    // Outside both years.
    await seed(account.id, {
      date: '2022-12-31',
      amount: '401.26',
      description: 'SEGURO HOGAR FICTICIO',
      categoryId: insurance.id,
    })
    await seed(account.id, {
      date: '2025-01-01',
      amount: '532.94',
      description: 'SEGURO HOGAR FICTICIO',
      categoryId: insurance.id,
    })

    const response = await query('year=2024')

    expect(response.period).toEqual({
      month: null,
      year: '2024',
      from: '2024-01-01',
      to: '2024-12-31',
      months: 12,
    })
    expect(response.compared).toEqual({ from: '2023-01-01', to: '2023-12-31', months: 12 })
    expect(response.compare).toBe('previous-year')
    expect(lineOf(response.variable, insurance.id)).toMatchObject({
      amount: '746.24',
      comparedAmount: '693.17',
      difference: '53.07',
      // 746.24 / 12 = 62.1866…
      monthlyAmount: '62.19',
    })
    expect(response.amount).toBe('746.24')
  })

  it('the year in progress compares with the same months of the previous year', async () => {
    const account = await createAccount()
    const utilities = await createCategory('Synthetic utilities')
    await seed(account.id, {
      date: '2025-01-09',
      amount: '73.58',
      description: 'SUMINISTRO GAS FICTICIO',
      categoryId: utilities.id,
    })
    await seed(account.id, {
      date: '2025-04-30',
      amount: '61.17',
      description: 'ELECTRICIDAD INVENTADA',
      categoryId: utilities.id,
    })
    // After the month of today: outside the year in progress.
    await seed(account.id, {
      date: '2025-05-02',
      amount: '58.43',
      description: 'ELECTRICIDAD INVENTADA',
      categoryId: utilities.id,
    })
    await seed(account.id, {
      date: '2024-04-30',
      amount: '66.29',
      description: 'ELECTRICIDAD INVENTADA',
      categoryId: utilities.id,
    })
    // After the same month of the previous year: outside the compared months.
    await seed(account.id, {
      date: '2024-05-01',
      amount: '49.82',
      description: 'ELECTRICIDAD INVENTADA',
      categoryId: utilities.id,
    })
    await seed(account.id, {
      date: '2024-12-15',
      amount: '84.13',
      description: 'SUMINISTRO GAS FICTICIO',
      categoryId: utilities.id,
    })

    const response = await getExpensesByCategory(
      app.prisma,
      depositMaturityMatchers,
      { year: '2025' },
      '2025-04-17',
    )

    expect(response.period).toEqual({
      month: null,
      year: '2025',
      from: '2025-01-01',
      to: '2025-04-30',
      months: 4,
    })
    expect(response.compared).toEqual({ from: '2024-01-01', to: '2024-04-30', months: 4 })
    expect(lineOf(response.variable, utilities.id)).toMatchObject({
      amount: '134.75',
      comparedAmount: '66.29',
      difference: '68.46',
      // 134.75 / 4 = 33.6875
      monthlyAmount: '33.69',
    })

    // A leap February: the compared range ends on the 28th.
    expect(resolvePeriods({ year: '2024' }, '2024-02-10')).toMatchObject({
      period: { from: '2024-01-01', to: '2024-02-29', months: 2 },
      compared: { from: '2023-01-01', to: '2023-02-28', months: 2 },
    })
    // A year after today is read as a closed one.
    expect(resolvePeriods({ year: '2026' }, '2025-04-17')).toMatchObject({
      period: { from: '2026-01-01', to: '2026-12-31', months: 12 },
      compared: { from: '2025-01-01', to: '2025-12-31', months: 12 },
    })
  })

  it('marks a category as new or gone against the compared period', async () => {
    const account = await createAccount()
    const fresh = await createCategory('Synthetic hobby')
    const gone = await createCategory('Synthetic gym')
    const both = await createCategory('Synthetic transport')
    await seed(account.id, {
      date: '2025-06-12',
      amount: '35.62',
      description: 'TIENDA MANUALIDADES INVENTADA',
      categoryId: fresh.id,
    })
    await seed(account.id, {
      date: '2025-05-03',
      amount: '29.95',
      description: 'GIMNASIO FICTICIO',
      categoryId: gone.id,
    })
    await seed(account.id, {
      date: '2025-06-05',
      amount: '14.38',
      description: 'TRANSPORTES URBANOS INVENTADOS',
      categoryId: both.id,
    })
    await seed(account.id, {
      date: '2025-05-21',
      amount: '17.06',
      description: 'TRANSPORTES URBANOS INVENTADOS',
      categoryId: both.id,
    })

    const response = await query('month=2025-06')

    expect(lineOf(response.variable, fresh.id)).toMatchObject({
      amount: '35.62',
      comparedAmount: '0.00',
      difference: '35.62',
      change: 'new',
    })
    expect(lineOf(response.variable, gone.id)).toMatchObject({
      amount: '0.00',
      comparedAmount: '29.95',
      difference: '-29.95',
      change: 'gone',
      movements: [],
    })
    expect(lineOf(response.variable, both.id).change).toBeNull()
  })

  it('splits the lines into fixed and variable by the category mark', async () => {
    const account = await createAccount()
    const rent = await createCategory('Synthetic rent')
    const phone = await createCategory('Synthetic phone')
    const leisure = await createCategory('Synthetic leisure')
    await markFixed(rent.id)
    await markFixed(phone.id)
    await seed(account.id, {
      date: '2025-07-01',
      amount: '642.37',
      description: 'ALQUILER VIVIENDA FICTICIA',
      categoryId: rent.id,
    })
    await seed(account.id, {
      date: '2025-06-01',
      amount: '642.37',
      description: 'ALQUILER VIVIENDA FICTICIA',
      categoryId: rent.id,
    })
    await seed(account.id, {
      date: '2025-07-08',
      amount: '21.49',
      description: 'TELEFONIA FICTICIA NORTE',
      categoryId: phone.id,
    })
    await seed(account.id, {
      date: '2025-06-08',
      amount: '19.66',
      description: 'TELEFONIA FICTICIA NORTE',
      categoryId: phone.id,
    })
    await seed(account.id, {
      date: '2025-07-19',
      amount: '48.15',
      description: 'RESTAURANTE INVENTADO',
      categoryId: leisure.id,
    })

    const response = await query('month=2025-07')

    expect(lineIds(response.fixed)).toEqual([rent.id, phone.id])
    expect(lineOf(response.fixed, rent.id).category?.isFixed).toBe(true)
    expect(response.fixed).toMatchObject({
      amount: '663.86',
      comparedAmount: '662.03',
      difference: '1.83',
    })
    expect(lineIds(response.variable)).toEqual([leisure.id])
    expect(response.variable).toMatchObject({
      amount: '48.15',
      comparedAmount: '0.00',
      difference: '48.15',
    })
    expect(response).toMatchObject({
      amount: '712.01',
      comparedAmount: '662.03',
      difference: '49.98',
    })
  })

  it('each line carries the counted movements of the period', async () => {
    const account = await createAccount()
    const groceries = await createCategory('Synthetic groceries')
    const late = await seed(account.id, {
      date: '2025-08-20',
      amount: '31.59',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
      daySequence: 2,
    })
    const early = await seed(account.id, {
      date: '2025-08-20',
      amount: '12.09',
      description: 'PANADERIA INVENTADA',
      categoryId: groceries.id,
      daySequence: 1,
    })
    const noSequence = await seed(account.id, {
      date: '2025-08-20',
      amount: '6.83',
      description: 'FRUTERIA INVENTADA NORTE',
      categoryId: groceries.id,
      daySequence: null,
    })
    const older = await seed(account.id, {
      date: '2025-08-03',
      amount: '44.52',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })
    // Same category and month, excluded by the human: it does not count.
    await seed(account.id, {
      date: '2025-08-10',
      amount: '73.41',
      description: 'COMPRA EXCLUIDA FICTICIA',
      categoryId: groceries.id,
      excludedFromTotals: true,
    })
    // The compared month: in the compared amount, never in the movements.
    await seed(account.id, {
      date: '2025-07-25',
      amount: '27.38',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })

    const response = await query('month=2025-08')

    const line = lineOf(response.variable, groceries.id)
    expect(line.amount).toBe('95.03')
    expect(line.comparedAmount).toBe('27.38')
    expect(line.movements).toEqual([
      {
        id: late.id,
        bookingDate: '2025-08-20',
        description: 'SUPERMERCADO FICTICIO CENTRO',
        amount: '31.59',
        accountId: account.id,
      },
      {
        id: early.id,
        bookingDate: '2025-08-20',
        description: 'PANADERIA INVENTADA',
        amount: '12.09',
        accountId: account.id,
      },
      {
        id: noSequence.id,
        bookingDate: '2025-08-20',
        description: 'FRUTERIA INVENTADA NORTE',
        amount: '6.83',
        accountId: account.id,
      },
      {
        id: older.id,
        bookingDate: '2025-08-03',
        description: 'SUPERMERCADO FICTICIO CENTRO',
        amount: '44.52',
        accountId: account.id,
      },
    ])
    // The same order as GET /api/movements.
    const listing = await app.inject({
      method: 'GET',
      url: `/api/movements?categoryId=${groceries.id}&from=2025-08-01&to=2025-08-31&excluded=none`,
    })
    expect(listing.statusCode, listing.body).toBe(200)
    expect(listing.json().movements.map((movement: { id: number }) => movement.id)).toEqual(
      line.movements.map((movement) => movement.id),
    )
  })

  it('the month and the year add up to the expense of GET /api/overview', async () => {
    const account = await createAccount()
    const other = await createAccount()
    const depositAccount = await createAccount('myinvestor')
    const fund = await app.prisma.investmentProduct.create({
      data: { bank: 'myinvestor', name: `Fondo ficticio ${suffix()}`, type: 'fund' },
    })
    createdProductIds.push(fund.id)
    const deposit = await app.prisma.investmentProduct.create({
      data: {
        bank: 'myinvestor',
        name: `Deposito inventado ${suffix()}`,
        type: 'deposit',
        principal: '2947.60',
        interestRate: '2.1500',
        maturityDate: new Date('2025-09-04T00:00:00.000Z'),
      },
    })
    createdProductIds.push(deposit.id)
    const groceries = await createCategory('Synthetic groceries')
    const savings = await createCategory('Synthetic savings')

    const counted = await seed(account.id, {
      date: '2025-09-12',
      amount: '47.83',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })
    const transferId = `synthetic-transfer-${suffix()}`
    await seed(account.id, {
      date: '2025-09-05',
      amount: '350.62',
      description: 'TRANSF CUENTA PROPIA INVENTADA',
      transferId,
      categoryId: savings.id,
    })
    await seed(other.id, {
      type: 'income',
      date: '2025-09-05',
      amount: '350.62',
      description: 'TRANSF CUENTA PROPIA INVENTADA',
      transferId,
    })
    await seed(account.id, {
      date: '2025-09-14',
      amount: '74.19',
      description: 'COMPRA EXCLUIDA FICTICIA',
      categoryId: groceries.id,
      excludedFromTotals: true,
    })
    await seed(depositAccount.id, {
      date: '2025-09-04',
      amount: '2615.37',
      description: 'APERTURA DEP.: 731905',
      categoryId: savings.id,
    })
    await seed(depositAccount.id, {
      type: 'income',
      date: '2025-09-04',
      amount: '2963.18',
      description: 'INTERESES DEP.: 562093',
    })
    await seed(account.id, {
      date: '2025-09-18',
      amount: '120.48',
      description: 'APORTACION FONDO FICTICIO',
      productId: fund.id,
      categoryId: savings.id,
    })
    const own = await seed(account.id, {
      date: '2025-09-20',
      amount: '118.36',
      description: 'TRANSF /Ana Perez Gil',
    })
    const doubtful = await seed(account.id, {
      date: '2025-09-22',
      amount: '96.47',
      description: 'TRANSF /TRADE REPUBLIC',
    })
    await seed(account.id, {
      type: 'income',
      date: '2025-09-25',
      amount: '43.17',
      description: 'DEVOLUCION COMPRA FICTICIA',
    })
    await seed(account.id, {
      type: 'neutral',
      date: '2025-09-26',
      amount: '12.84',
      description: 'COMPRA NEUTRA INVENTADA',
    })
    // Another month of the same year.
    await seed(account.id, {
      date: '2025-02-07',
      amount: '63.95',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })

    const holderNames = await app.inject({
      method: 'PUT',
      url: '/api/own-accounts/holder-names',
      payload: { names: ['Ana Pérez Gil'] },
    })
    expect(holderNames.statusCode).toBe(200)
    const ownAccount = await app.inject({
      method: 'POST',
      url: '/api/own-accounts',
      payload: {
        name: 'Cuenta inventada',
        bank: 'Trade Republic',
        type: 'checking',
        texts: ['Trade Republic'],
      },
    })
    expect(ownAccount.statusCode).toBe(201)
    createdOwnAccountIds.push(ownAccount.json().id)

    async function overviewExpense(month: string): Promise<string> {
      const response = await app.inject({ method: 'GET', url: `/api/overview?month=${month}` })
      expect(response.statusCode).toBe(200)
      return response.json<OverviewResponse>().period.totals.expense
    }

    const month = await query('month=2025-09')
    expect(month.amount).toBe(await overviewExpense('2025-09'))
    // 47.83 + 96.47 (doubtful still counts): nothing else is an expense.
    expect(month.amount).toBe('144.30')
    expect(lineIds(month.variable).sort()).toEqual([groceries.id, null].sort())
    expect(lineOf(month.variable, groceries.id).movements.map((m) => m.id)).toEqual([counted.id])
    expect(lineOf(month.variable, null).movements.map((m) => m.id)).toEqual([doubtful.id])
    expect(lineOf(month.variable, null).movements.map((m) => m.id)).not.toContain(own.id)
    // The previous month adds up the same way.
    expect(month.comparedAmount).toBe(await overviewExpense('2025-08'))

    const year = await query('year=2025')
    let yearExpense = new Prisma.Decimal(0)
    for (let index = 1; index <= 12; index += 1) {
      yearExpense = yearExpense.plus(
        await overviewExpense(`2025-${String(index).padStart(2, '0')}`),
      )
    }
    expect(year.amount).toBe(yearExpense.toFixed(2))
    expect(year.amount).toBe('208.25')
  })

  it('puts counted expenses without category in their own line', async () => {
    const account = await createAccount()
    const rent = await createCategory('Synthetic rent')
    await markFixed(rent.id)
    await seed(account.id, {
      date: '2025-10-06',
      amount: '642.37',
      description: 'ALQUILER VIVIENDA FICTICIA',
      categoryId: rent.id,
    })
    const loose = await seed(account.id, {
      date: '2025-10-14',
      amount: '5.73',
      description: 'COMPRA SIN CATEGORIA INVENTADA',
    })
    await seed(account.id, {
      date: '2025-09-14',
      amount: '8.26',
      description: 'COMPRA SIN CATEGORIA FICTICIA',
    })

    const response = await query('month=2025-10')

    expect(lineIds(response.fixed)).toEqual([rent.id])
    expect(lineOf(response.variable, null)).toEqual({
      category: null,
      amount: '5.73',
      comparedAmount: '8.26',
      difference: '-2.53',
      change: null,
      monthlyAmount: null,
      movements: [
        {
          id: loose.id,
          bookingDate: '2025-10-14',
          description: 'COMPRA SIN CATEGORIA INVENTADA',
          amount: '5.73',
          accountId: account.id,
        },
      ],
    })
    expect(response.amount).toBe('648.10')
  })

  it('leaves out a category whose movements count nothing', async () => {
    const account = await createAccount()
    const depositAccount = await createAccount('myinvestor')
    const savings = await createCategory('Synthetic savings')
    const groceries = await createCategory('Synthetic groceries')
    await seed(depositAccount.id, {
      date: '2025-11-04',
      amount: '3184.25',
      description: 'APERTURA DEP.: 640218',
      categoryId: savings.id,
    })
    await seed(account.id, {
      date: '2025-10-17',
      amount: '57.91',
      description: 'COMPRA EXCLUIDA FICTICIA',
      categoryId: savings.id,
      excludedFromTotals: true,
    })
    await seed(account.id, {
      date: '2025-11-09',
      amount: '22.64',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })

    const response = await query('month=2025-11')

    expect(lineIds(response.variable)).toEqual([groceries.id])
    expect(response.fixed.lines).toEqual([])
    expect(response.amount).toBe('22.64')
  })

  it('a subcategory is its own line', async () => {
    const account = await createAccount()
    const home = await createCategory('Synthetic home')
    const mortgage = await createCategory('Synthetic mortgage', { parentId: home.id })
    await markFixed(mortgage.id)
    await seed(account.id, {
      date: '2025-05-02',
      amount: '587.46',
      description: 'CUOTA PRESTAMO FICTICIO',
      categoryId: mortgage.id,
    })
    await seed(account.id, {
      date: '2025-05-16',
      amount: '36.92',
      description: 'FERRETERIA INVENTADA',
      categoryId: home.id,
    })

    const response = await query('month=2025-05')

    expect(lineOf(response.fixed, mortgage.id)).toMatchObject({
      category: { id: mortgage.id, name: mortgage.name, parentId: home.id, isFixed: true },
      amount: '587.46',
    })
    expect(lineIds(response.fixed)).toEqual([mortgage.id])
    // The parent keeps only its own expense, in the group of its own mark.
    expect(lineOf(response.variable, home.id)).toMatchObject({
      category: { id: home.id, parentId: null, isFixed: false },
      amount: '36.92',
    })
    expect(lineIds(response.variable)).toEqual([home.id])
  })

  it('rejects a malformed period with 400 and writes nothing', async () => {
    const account = await createAccount()
    await seed(account.id, {
      date: '2025-03-14',
      amount: '19.37',
      description: 'LIBRERIA INVENTADA SUR',
    })
    const before = await app.prisma.movement.aggregate({ _count: true, _max: { updatedAt: true } })

    for (const search of [
      '',
      'month=2025-03&year=2025',
      'month=2025-13',
      'year=25',
      'year=2025&compare=previous-month',
      'month=2025-03&compare=next-month',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/expenses-by-category?${search}`,
      })
      expect(response.statusCode, search).toBe(400)
      expect(response.json().code, search).toBe('VALIDATION_ERROR')
    }

    expect(
      await app.prisma.movement.aggregate({ _count: true, _max: { updatedAt: true } }),
    ).toEqual(before)
  })

  it('writes nothing in the database', async () => {
    const account = await createAccount()
    const category = await createCategory('Synthetic leisure')
    await markFixed(category.id)
    await app.prisma.categoryRule.create({
      data: { categoryId: category.id, matchText: `cine ficticio ${suffix()}` },
    })
    await seed(account.id, {
      date: '2025-04-11',
      amount: '16.43',
      description: 'PLATAFORMA INVENTADA',
    })
    await seed(account.id, {
      date: '2025-03-12',
      amount: '9.37',
      description: 'CINE FICTICIO CENTRO',
      categoryId: category.id,
    })

    async function snapshot() {
      const [movements, accounts, rules, categories] = await Promise.all([
        app.prisma.movement.aggregate({ _count: true, _max: { updatedAt: true } }),
        app.prisma.account.aggregate({ _count: true, _max: { updatedAt: true } }),
        app.prisma.categoryRule.aggregate({ _count: true, _max: { updatedAt: true } }),
        // `Category` has no `updatedAt`: every row is compared instead.
        app.prisma.category.findMany({ orderBy: { id: 'asc' } }),
      ])
      return { movements, accounts, rules, categories }
    }

    const before = await snapshot()
    const month = await query('month=2025-04')
    const year = await query('year=2025')
    const after = await snapshot()

    expect(month.amount).toBe('16.43')
    expect(year.amount).toBe('25.80')
    expect(after).toEqual(before)

    const source = readFileSync(
      new URL('./expenses-by-category.service.ts', import.meta.url),
      'utf8',
    )
    for (const write of ['create', 'update', 'delete', 'upsert', '$executeRaw']) {
      expect(source.toLowerCase(), write).not.toContain(write.toLowerCase())
    }
  })
})
