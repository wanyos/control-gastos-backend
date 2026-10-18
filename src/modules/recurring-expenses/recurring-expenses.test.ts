// GET /api/recurring-expenses (feature 58). Every figure, concept and name in
// this file is invented (see docs/conventions.md §Tests): fixtures only need to
// be well formed, never true. Dates are relative to the current month in
// Madrid, so the 12 months of the period always contain them.
import { readFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { currentMonthInMadrid } from '../../lib/local-date.js'
import { monthRange } from '../overview/overview.service.js'
import { billKey, billPeriodicity } from './recurring-expenses.service.js'
import type {
  RecurringBill,
  RecurringCategoryGroup,
  RecurringExpensesResponse,
} from './recurring-expenses.types.js'

/** The `YYYY-MM` that is `monthsAgo` months before the current one in Madrid. */
function monthAgo(monthsAgo: number): string {
  const [year, month] = currentMonthInMadrid().split('-').map(Number)
  const index = year * 12 + (month - 1) - monthsAgo
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** A day of the month `monthsAgo` months before the current one. */
function dayAgo(monthsAgo: number, day = 15): string {
  return `${monthAgo(monthsAgo)}-${String(day).padStart(2, '0')}`
}

describe('billKey', () => {
  it('drops the bill words and the words with digits and keeps the first two', () => {
    expect(billKey('RECIBO /AGUAS MUNICIPALES SINTETICAS S.A.')).toBe('aguas municipales')
    expect(billKey('RECIB. AGUAS MUNICIPALES 2025-0417')).toBe('aguas municipales')
    expect(billKey('RECIBO RECIBO AGUAS MUNICIPALES, SA')).toBe('aguas municipales')
  })

  it('separates two providers whose second word differs', () => {
    expect(billKey('RECIBO /AGUAS RIO INVENTADO')).toBe('aguas rio')
  })

  it('falls back to the bill word when nothing else is left', () => {
    expect(billKey('TRIBUTO 4471-0093')).toBe('tributo')
  })

  it('ignores accents and case', () => {
    expect(billKey('Recibo Teléfono Ficticio')).toBe('telefono ficticio')
  })
})

describe('billPeriodicity', () => {
  it('reads one month with a charge as once', () => {
    expect(billPeriodicity(['2025-03-14'])).toBe('once')
  })

  it('reads consecutive months with one charge each as monthly', () => {
    expect(billPeriodicity(['2025-01-08', '2025-02-08', '2025-03-08', '2025-03-27'])).toBe(
      'monthly',
    )
  })

  it('reads gaps of three months as every three months', () => {
    expect(billPeriodicity(['2025-01-05', '2025-04-05', '2025-07-05'])).toBe('every_three_months')
  })

  it('reads two charges a year as every six months', () => {
    expect(billPeriodicity(['2024-06-30', '2024-11-05', '2025-06-30', '2025-11-05'])).toBe(
      'every_six_months',
    )
  })

  it('takes the lower median of the gaps', () => {
    // Gaps 1, 2, 2, 12: the lower median of four is the second, 2.
    expect(
      billPeriodicity(['2023-01-10', '2024-01-10', '2024-03-10', '2024-05-10', '2024-06-10']),
    ).toBe('every_two_months')
  })
})

describe('GET /api/recurring-expenses', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []
  const createdProductIds: number[] = []
  let daySequence = 1

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdCategoryIds.length > 0) {
      await app.prisma.categoryRule.deleteMany({
        where: { categoryId: { in: createdCategoryIds } },
      })
    }
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
    if (createdCategoryIds.length > 0) {
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
      data: { iban: syntheticIban(), bank, alias: 'Recurring expenses test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(name: string) {
    const category = await app.prisma.category.create({
      data: { name: `${name} ${suffix()}`, kind: 'expense' },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  /**
   * A root expense category with an exact seed name (feature 59). The suite
   * database may already have it; only the one this test creates is deleted.
   */
  async function seedCategory(name: string) {
    const existing = await app.prisma.category.findFirst({
      where: { name, kind: 'expense', parentId: null },
    })
    if (existing) return existing
    const category = await app.prisma.category.create({ data: { name, kind: 'expense' } })
    createdCategoryIds.push(category.id)
    return category
  }

  async function createProduct() {
    const product = await app.prisma.investmentProduct.create({
      data: { bank: 'myinvestor', name: `Synthetic recurring fund ${suffix()}`, type: 'fund' },
    })
    createdProductIds.push(product.id)
    return product
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
        daySequence: daySequence++,
        categoryId: movement.categoryId ?? null,
        transferId: movement.transferId ?? null,
        productId: movement.productId ?? null,
        excludedFromTotals: movement.excludedFromTotals ?? false,
      },
    })
  }

  async function getRecurring(): Promise<RecurringExpensesResponse> {
    const response = await app.inject({ method: 'GET', url: '/api/recurring-expenses' })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  function billOf(response: RecurringExpensesResponse, key: string): RecurringBill {
    const bill = response.bills.find((entry) => entry.key === key)
    expect(bill, `bill ${key}`).toBeDefined()
    return bill as RecurringBill
  }

  function variableOf(
    response: RecurringExpensesResponse,
    categoryId: number | null,
  ): RecurringCategoryGroup {
    const entry = response.variable.find((group) => (group.category?.id ?? null) === categoryId)
    expect(entry, `variable entry ${categoryId}`).toBeDefined()
    return entry as RecurringCategoryGroup
  }

  function monthAmountOf(months: { month: string; amount: string }[], month: string): string {
    return months.find((entry) => entry.month === month)?.amount ?? 'missing'
  }

  it('lists a bill on its own by its concept even when it was charged once', async () => {
    const account = await createAccount()
    const once = await seed(account.id, {
      date: dayAgo(2, 9),
      amount: '38.47',
      description: 'RECIBO /ACADEMIA IDIOMAS INVENTADA',
    })
    await seed(account.id, {
      date: dayAgo(2, 3),
      amount: '19.66',
      description: 'RECIBO /TELEFONIA FICTICIA NORTE',
    })
    await seed(account.id, {
      date: dayAgo(1, 3),
      amount: '19.66',
      description: 'RECIBO /TELEFONIA FICTICIA NORTE',
    })

    const response = await getRecurring()

    expect(response.bills).toHaveLength(2)
    const bill = billOf(response, 'academia idiomas')
    expect(bill).toEqual({
      key: 'academia idiomas',
      name: 'RECIBO /ACADEMIA IDIOMAS INVENTADA',
      periodicity: 'once',
      usualAmount: '38.47',
      count: 1,
      lastDate: dayAgo(2, 9),
      lastMonth: monthAgo(2),
      lastMonthAmount: '38.47',
      previousMonth: null,
      previousMonthAmount: null,
      change: null,
      hasIncreased: false,
      // 38.47 / 12 = 3.2058…
      monthlyCost: '3.21',
      movements: [
        {
          id: once.id,
          accountId: account.id,
          bookingDate: dayAgo(2, 9),
          amount: '38.47',
          description: 'RECIBO /ACADEMIA IDIOMAS INVENTADA',
        },
      ],
    })
    expect(billOf(response, 'telefonia ficticia').count).toBe(2)
    // A bill is never counted twice: it is not in the other two groups.
    expect(response.variable).toEqual([])
    expect(response.transfersToPeople.movements).toEqual([])
  })

  it('groups the charges of one bill whose concept changes only in digits or after its second word', async () => {
    const account = await createAccount()
    await seed(account.id, {
      date: dayAgo(5),
      amount: '27.38',
      description: 'RECIBO /AGUAS MUNICIPALES SINTETICAS S.A.',
    })
    await seed(account.id, {
      date: dayAgo(3),
      amount: '29.14',
      description: 'RECIB. AGUAS MUNICIPALES 2025-0417',
    })
    await seed(account.id, {
      date: dayAgo(1),
      amount: '28.06',
      description: 'RECIBO RECIBO AGUAS MUNICIPALES, SA',
    })
    await seed(account.id, {
      date: dayAgo(1, 20),
      amount: '33.91',
      description: 'RECIBO /AGUAS RIO INVENTADO',
    })

    const response = await getRecurring()

    expect(response.bills.map((bill) => bill.key).sort()).toEqual([
      'aguas municipales',
      'aguas rio',
    ])
    const water = billOf(response, 'aguas municipales')
    expect(water.count).toBe(3)
    expect(water.movements.map((movement) => movement.amount)).toEqual(['28.06', '29.14', '27.38'])
    expect(water.name).toBe('RECIBO RECIBO AGUAS MUNICIPALES, SA')
    expect(water.periodicity).toBe('every_two_months')
    // Lower median of 27.38, 28.06 and 29.14.
    expect(water.usualAmount).toBe('28.06')
    expect(billOf(response, 'aguas rio').count).toBe(1)
  })

  it('classifies a bill charged once a year as annual', async () => {
    const account = await createAccount()
    for (const monthsAgo of [28, 16, 4]) {
      await seed(account.id, {
        date: dayAgo(monthsAgo, 22),
        amount: '317.84',
        description: 'TRIBUTO IMPUESTO VEHICULOS INVENTADO',
      })
    }

    const response = await getRecurring()

    const bill = billOf(response, 'impuesto vehiculos')
    expect(bill.periodicity).toBe('annual')
    expect(bill.count).toBe(3)
  })

  it('classifies a bill charged twice a month as twice monthly', async () => {
    const account = await createAccount()
    for (const monthsAgo of [4, 3, 2, 1]) {
      await seed(account.id, {
        date: dayAgo(monthsAgo, 2),
        amount: '24.95',
        description: 'RECIBO /GIMNASIO INVENTADO',
      })
      if (monthsAgo !== 4) {
        await seed(account.id, {
          date: dayAgo(monthsAgo, 2),
          amount: '9.85',
          description: 'RECIBO /GIMNASIO INVENTADO',
        })
      }
    }

    const response = await getRecurring()

    const bill = billOf(response, 'gimnasio inventado')
    expect(bill.periodicity).toBe('twice_monthly')
    expect(bill.count).toBe(7)
    // The two fees of a month are compared as one total: no change at all.
    expect(bill.lastMonthAmount).toBe('34.80')
    expect(bill.change).toBe('0.00')
    expect(bill.hasIncreased).toBe(false)
  })

  it('classifies a bill charged every two months as every two months', async () => {
    const account = await createAccount()
    for (const monthsAgo of [7, 5, 3, 1]) {
      await seed(account.id, {
        date: dayAgo(monthsAgo, 11),
        amount: '41.73',
        description: 'RECIBO /SUMINISTRO GAS FICTICIO',
      })
    }

    const response = await getRecurring()

    expect(billOf(response, 'suministro gas').periodicity).toBe('every_two_months')
  })

  it('marks a bill as increased when its last month is one cent above the previous one', async () => {
    const account = await createAccount()
    await seed(account.id, {
      date: dayAgo(3),
      amount: '61.42',
      description: 'RECIBO /ELECTRICIDAD INVENTADA',
    })
    await seed(account.id, {
      date: dayAgo(2),
      amount: '61.38',
      description: 'RECIBO /ELECTRICIDAD INVENTADA',
    })
    await seed(account.id, {
      date: dayAgo(1),
      amount: '61.39',
      description: 'RECIBO /ELECTRICIDAD INVENTADA',
    })
    await seed(account.id, {
      date: dayAgo(2),
      amount: '15.27',
      description: 'RECIBO /SEGURO HOGAR FICTICIO',
    })
    await seed(account.id, {
      date: dayAgo(1),
      amount: '15.26',
      description: 'RECIBO /SEGURO HOGAR FICTICIO',
    })

    const response = await getRecurring()

    const up = billOf(response, 'electricidad inventada')
    expect(up).toMatchObject({
      lastMonth: monthAgo(1),
      lastMonthAmount: '61.39',
      previousMonth: monthAgo(2),
      previousMonthAmount: '61.38',
      change: '0.01',
      hasIncreased: true,
    })
    const down = billOf(response, 'seguro hogar')
    expect(down).toMatchObject({ change: '-0.01', hasIncreased: false })
  })

  it('puts transfers and bizum to people in their own group and in the monthly total', async () => {
    const account = await createAccount()
    const bizum = await seed(account.id, {
      date: dayAgo(1, 6),
      amount: '23.65',
      description: 'BIZUM PERSONA INVENTADA',
    })
    const transfer = await seed(account.id, {
      date: dayAgo(2, 19),
      amount: '112.40',
      description: 'TRANSFERENCIA PERSONA FICTICIA',
    })
    // `TRANSPORTES` is not a transfer word: it stays in the variable expense.
    await seed(account.id, {
      date: dayAgo(1, 8),
      amount: '6.29',
      description: 'TRANSPORTES URBANOS INVENTADOS',
    })
    // The current month is outside the period.
    await seed(account.id, {
      date: `${currentMonthInMadrid()}-01`,
      amount: '18.20',
      description: 'BIZUM OTRA PERSONA',
    })

    const response = await getRecurring()

    const group = response.transfersToPeople
    expect(group.movements.map((movement) => movement.id)).toEqual([bizum.id, transfer.id])
    expect(group.months).toHaveLength(12)
    expect(monthAmountOf(group.months, monthAgo(1))).toBe('23.65')
    expect(monthAmountOf(group.months, monthAgo(2))).toBe('112.40')
    expect(monthAmountOf(group.months, monthAgo(3))).toBe('0.00')
    // (23.65 + 112.40) / 12 = 11.3375
    expect(group.monthlyCost).toBe('11.34')
    // 6.29 / 12 = 0.5241…
    expect(variableOf(response, null).monthlyCost).toBe('0.52')
    expect(response.monthlyTotal).toBe('11.86')
  })

  it('keeps a transfer categorized Otros gastos in the transfers to people group', async () => {
    const account = await createAccount()
    const otherExpenses = await seedCategory('Otros gastos')
    const transfer = await seed(account.id, {
      date: dayAgo(3, 11),
      amount: '64.85',
      description: 'TRANSFERENCIA PERSONA INVENTADA',
      categoryId: otherExpenses.id,
    })
    const bizum = await seed(account.id, {
      date: dayAgo(2, 17),
      amount: '12.40',
      description: 'BIZUM AMIGA FICTICIA',
      categoryId: otherExpenses.id,
    })

    const response = await getRecurring()

    expect(response.transfersToPeople.movements.map((movement) => movement.id)).toEqual([
      bizum.id,
      transfer.id,
    ])
    // (64.85 + 12.40) / 12 = 6.4375
    expect(response.transfersToPeople.monthlyCost).toBe('6.44')
    expect(response.variable).toEqual([])
  })

  it('keeps a transfer categorized Transferencias a personas in the transfers to people group', async () => {
    const account = await createAccount()
    const toPeople = await seedCategory('Transferencias a personas')
    const transfer = await seed(account.id, {
      date: dayAgo(4, 2),
      amount: '150.30',
      description: 'TRANSF FAMILIAR FICTICIO',
      categoryId: toPeople.id,
    })
    const bizum = await seed(account.id, {
      date: dayAgo(1, 21),
      amount: '8.75',
      description: 'BIZUM COMPANERO INVENTADO',
      categoryId: toPeople.id,
    })

    const response = await getRecurring()

    expect(response.transfersToPeople.movements.map((movement) => movement.id)).toEqual([
      bizum.id,
      transfer.id,
    ])
    expect(monthAmountOf(response.transfersToPeople.months, monthAgo(4))).toBe('150.30')
    expect(monthAmountOf(response.transfersToPeople.months, monthAgo(1))).toBe('8.75')
    expect(response.variable).toEqual([])
  })

  it('moves a transfer with any other category to the variable expense under that category', async () => {
    const account = await createAccount()
    const workshop = await createCategory('Synthetic vehicle workshop')
    const toPeople = await seedCategory('Transferencias a personas')
    const garage = await seed(account.id, {
      date: dayAgo(2, 9),
      amount: '238.64',
      description: 'TRANSFERENCIA TALLER MECANICO INVENTADO',
      categoryId: workshop.id,
    })
    const shop = await seed(account.id, {
      date: dayAgo(5, 14),
      amount: '19.95',
      description: 'BIZUM TIENDA RECAMBIOS FICTICIA',
      categoryId: workshop.id,
    })
    // A card expense of the same category: the transfers sum with it.
    const card = await seed(account.id, {
      date: dayAgo(2, 27),
      amount: '31.18',
      description: 'COMPRA RECAMBIOS FICTICIOS',
      categoryId: workshop.id,
    })
    const person = await seed(account.id, {
      date: dayAgo(1, 5),
      amount: '42.00',
      description: 'BIZUM HERMANO INVENTADO',
      categoryId: toPeople.id,
    })

    const response = await getRecurring()

    const workshopGroup = variableOf(response, workshop.id)
    expect(workshopGroup.category).toEqual({
      id: workshop.id,
      name: workshop.name,
      parentId: null,
    })
    expect(workshopGroup.movements.map((movement) => movement.id)).toEqual([
      card.id,
      garage.id,
      shop.id,
    ])
    expect(monthAmountOf(workshopGroup.months, monthAgo(2))).toBe('269.82')
    expect(monthAmountOf(workshopGroup.months, monthAgo(5))).toBe('19.95')
    // (238.64 + 19.95 + 31.18) / 12 = 24.1475
    expect(workshopGroup.monthlyCost).toBe('24.15')
    // Only the transfer whose category is a people one stays in the group.
    expect(response.transfersToPeople.movements.map((movement) => movement.id)).toEqual([person.id])
    expect(response.variable.map((entry) => entry.category?.id ?? null)).toEqual([workshop.id])
  })

  it('keeps a transfer in the monthly total within one cent when it changes group', async () => {
    // The total adds the parts already rounded (ADR-037, decision 6), so moving
    // a transfer may change it by one cent and never more (accepted by the
    // human on 2026-10-17). These amounts are chosen so the cent DOES show:
    // 12.87 / 12 = 1.0725 and 9.03 / 12 = 0.7525 each round down, while
    // their sum 21.90 / 12 = 1.825 rounds up.
    const account = await createAccount()
    const workshop = await createCategory('Synthetic vehicle workshop')
    const otherExpenses = await seedCategory('Otros gastos')
    const transfer = await seed(account.id, {
      date: dayAgo(3, 16),
      amount: '12.87',
      description: 'TRANSFERENCIA TALLER CHAPA FICTICIO',
      categoryId: otherExpenses.id,
    })
    const bizum = await seed(account.id, {
      date: dayAgo(1, 12),
      amount: '9.03',
      description: 'BIZUM PERSONA INVENTADA',
      categoryId: otherExpenses.id,
    })

    const before = await getRecurring()
    expect(before.transfersToPeople.movements.map((movement) => movement.id)).toEqual([
      bizum.id,
      transfer.id,
    ])
    expect(before.transfersToPeople.monthlyCost).toBe('1.83')
    expect(before.monthlyTotal).toBe('1.83')

    // The human gives the transfer a category of his own.
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/movements/${transfer.id}`,
      payload: { categoryId: workshop.id },
    })
    expect(patched.statusCode).toBe(200)
    const after = await getRecurring()

    // It left the group and still counts, now under its category.
    expect(after.transfersToPeople.movements.map((movement) => movement.id)).toEqual([bizum.id])
    expect(after.transfersToPeople.monthlyCost).toBe('0.75')
    const workshopGroup = variableOf(after, workshop.id)
    expect(workshopGroup.movements.map((movement) => movement.id)).toEqual([transfer.id])
    expect(workshopGroup.monthlyCost).toBe('1.07')
    expect(after.monthlyTotal).toBe('1.82')
    // At most one cent apart, never the amount of the transfer.
    const drift = Math.abs(
      Math.round(Number(after.monthlyTotal) * 100) - Math.round(Number(before.monthlyTotal) * 100),
    )
    expect(drift).toBeLessThanOrEqual(1)
  })

  it('groups the variable expense by its category summed per month', async () => {
    const account = await createAccount()
    const fuel = await createCategory('Synthetic fuel')
    const groceries = await createCategory('Synthetic groceries')
    const first = await seed(account.id, {
      date: dayAgo(1, 4),
      amount: '14.27',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })
    const second = await seed(account.id, {
      date: dayAgo(1, 23),
      amount: '8.91',
      description: 'ESTACION SERVICIO FICTICIA',
      categoryId: fuel.id,
    })
    const third = await seed(account.id, {
      date: dayAgo(2, 12),
      amount: '30.05',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })
    // Outside the period on both sides.
    await seed(account.id, {
      date: dayAgo(13, 12),
      amount: '26.48',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })
    await seed(account.id, {
      date: `${currentMonthInMadrid()}-01`,
      amount: '11.12',
      description: 'ESTACION SERVICIO INVENTADA',
      categoryId: fuel.id,
    })
    await seed(account.id, {
      date: dayAgo(1, 10),
      amount: '52.18',
      description: 'SUPERMERCADO FICTICIO CENTRO',
      categoryId: groceries.id,
    })
    await seed(account.id, {
      date: dayAgo(4, 10),
      amount: '5.73',
      description: 'COMPRA SIN CATEGORIA INVENTADA',
    })
    const categoriesBefore = await app.prisma.category.count()

    const response = await getRecurring()

    expect(response.variable).toHaveLength(3)
    const fuelGroup = variableOf(response, fuel.id)
    expect(fuelGroup.category).toEqual({ id: fuel.id, name: fuel.name, parentId: null })
    expect(fuelGroup.months.map((entry) => entry.month)).toEqual(response.period.months)
    expect(monthAmountOf(fuelGroup.months, monthAgo(1))).toBe('23.18')
    expect(monthAmountOf(fuelGroup.months, monthAgo(2))).toBe('30.05')
    expect(monthAmountOf(fuelGroup.months, monthAgo(3))).toBe('0.00')
    expect(fuelGroup.movements.map((movement) => movement.id)).toEqual([
      second.id,
      first.id,
      third.id,
    ])
    // (14.27 + 8.91 + 30.05) / 12 = 4.4358…
    expect(fuelGroup.monthlyCost).toBe('4.44')
    const groceriesGroup = variableOf(response, groceries.id)
    expect(monthAmountOf(groceriesGroup.months, monthAgo(1))).toBe('52.18')
    expect(groceriesGroup.monthlyCost).toBe('4.35')
    expect(variableOf(response, null).monthlyCost).toBe('0.48')
    // Ordered by monthly cost, the movements with no category at the end.
    expect(response.variable.map((entry) => entry.category?.id ?? null)).toEqual([
      fuel.id,
      groceries.id,
      null,
    ])
    // No category was invented.
    expect(await app.prisma.category.count()).toBe(categoriesBefore)
  })

  it('counts an annual bill as one twelfth of its amount in the monthly total', async () => {
    const account = await createAccount()
    await seed(account.id, {
      date: dayAgo(17, 3),
      amount: '486.30',
      description: 'RECIBO /SEGURO COCHE INVENTADO',
    })
    await seed(account.id, {
      date: dayAgo(5, 3),
      amount: '486.30',
      description: 'RECIBO /SEGURO COCHE INVENTADO',
    })
    await seed(account.id, {
      date: dayAgo(1, 9),
      amount: '25.18',
      description: 'LIBRERIA FICTICIA PLAZA',
    })

    const response = await getRecurring()

    const bill = billOf(response, 'seguro coche')
    expect(bill.periodicity).toBe('annual')
    // 486.30 / 12 = 40.525, half up.
    expect(bill.monthlyCost).toBe('40.53')
    // 25.18 / 12 = 2.0983…
    expect(variableOf(response, null).monthlyCost).toBe('2.10')
    expect(response.monthlyTotal).toBe('42.63')
  })

  it('leaves out paired transfers, movements excluded from totals and deposit movements', async () => {
    const account = await createAccount()
    const other = await createAccount()
    const depositAccount = await createAccount('myinvestor')
    const product = await createProduct()
    const transferId = `synthetic-transfer-${suffix()}`
    await seed(account.id, {
      date: dayAgo(1),
      amount: '350.62',
      description: 'TRANSF CUENTA PROPIA INVENTADA',
      transferId,
    })
    await seed(other.id, {
      type: 'income',
      date: dayAgo(1),
      amount: '350.62',
      description: 'TRANSF CUENTA PROPIA INVENTADA',
      transferId,
    })
    await seed(account.id, {
      date: dayAgo(2),
      amount: '74.19',
      description: 'RECIBO /CUOTA EXCLUIDA FICTICIA',
      excludedFromTotals: true,
    })
    await seed(depositAccount.id, {
      date: dayAgo(3),
      amount: '2615.37',
      description: 'APERTURA DEP.: 731905',
    })
    await seed(account.id, {
      date: dayAgo(1, 25),
      amount: '120.48',
      description: 'APORTACION FONDO FICTICIO',
      productId: product.id,
    })
    await seed(account.id, {
      type: 'income',
      date: dayAgo(2, 25),
      amount: '43.17',
      description: 'RECIBO /DEVOLUCION FICTICIA',
    })
    await seed(account.id, {
      type: 'neutral',
      date: dayAgo(2, 26),
      amount: '12.84',
      description: 'COMPRA NEUTRA INVENTADA',
    })

    const response = await getRecurring()

    expect(response.bills).toEqual([])
    expect(response.variable).toEqual([])
    expect(response.transfersToPeople.movements).toEqual([])
    expect(response.monthlyTotal).toBe('0.00')
  })

  it('writes nothing in the database while answering', async () => {
    const account = await createAccount()
    const category = await createCategory('Synthetic leisure')
    await app.prisma.categoryRule.create({
      data: { categoryId: category.id, matchText: `cine ficticio ${suffix()}` },
    })
    await seed(account.id, {
      date: dayAgo(1),
      amount: '16.43',
      description: 'RECIBO /PLATAFORMA INVENTADA',
    })
    await seed(account.id, {
      date: dayAgo(2),
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
    const response = await getRecurring()
    const after = await snapshot()

    expect(response.bills).toHaveLength(1)
    expect(after).toEqual(before)

    const source = readFileSync(new URL('./recurring-expenses.service.ts', import.meta.url), 'utf8')
    for (const write of ['create', 'update', 'delete', 'upsert', '$executeRaw']) {
      expect(source.toLowerCase(), write).not.toContain(write.toLowerCase())
    }
  })

  it('answers an empty database with empty groups and a zero total', async () => {
    const response = await getRecurring()

    expect(response.bills).toEqual([])
    expect(response.variable).toEqual([])
    expect(response.transfersToPeople).toEqual({
      months: response.period.months.map((month) => ({ month, amount: '0.00' })),
      monthlyCost: '0.00',
      movements: [],
    })
    expect(response.transfersToPeople.months).toHaveLength(12)
    expect(response.monthlyTotal).toBe('0.00')
  })

  it('lists a bill with no charge in the period with a monthly cost of zero', async () => {
    const account = await createAccount()
    await seed(account.id, {
      date: dayAgo(15, 7),
      amount: '12.91',
      description: 'RECIBO /REVISTA FICTICIA',
    })
    await seed(account.id, {
      date: dayAgo(14, 7),
      amount: '12.91',
      description: 'RECIBO /REVISTA FICTICIA',
    })

    const response = await getRecurring()

    const bill = billOf(response, 'revista ficticia')
    expect(bill.monthlyCost).toBe('0.00')
    expect(bill.periodicity).toBe('monthly')
    expect(bill.movements).toHaveLength(2)
    expect(response.monthlyTotal).toBe('0.00')
  })

  it('excludes the current month from the period', async () => {
    const account = await createAccount()
    await seed(account.id, {
      date: `${currentMonthInMadrid()}-01`,
      amount: '57.62',
      description: 'RECIBO /COMUNIDAD VECINOS FICTICIA',
    })
    await seed(account.id, {
      date: `${currentMonthInMadrid()}-01`,
      amount: '21.84',
      description: 'FLORISTERIA INVENTADA SUR',
    })

    const response = await getRecurring()

    const expectedMonths = Array.from({ length: 12 }, (_, index) => monthAgo(12 - index))
    expect(response.period).toEqual({
      from: `${monthAgo(12)}-01`,
      to: monthRange(monthAgo(1)).to,
      months: expectedMonths,
    })
    expect(response.period.months).not.toContain(currentMonthInMadrid())
    // The bill is still listed (its whole history), but costs nothing this period.
    expect(billOf(response, 'comunidad vecinos').monthlyCost).toBe('0.00')
    expect(response.variable).toEqual([])
    expect(response.monthlyTotal).toBe('0.00')
  })
})
