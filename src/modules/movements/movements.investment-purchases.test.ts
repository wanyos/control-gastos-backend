// Feature 71 `myinvestor-investment-purchases`: an investment purchase of a
// MyInvestor account counts in none of the three sums — the `totals` of
// GET /api/movements, the `period.totals` of GET /api/overview and what
// GET /api/expenses-by-category counts as an expense — without any mark, and
// the listing says it (`investmentPurchase`).
//
// The statements enter through `importPending` and the REAL registries of
// `src/app.ts`, as `own-accounts.totals.test.ts` does. "As it counted before"
// is measured, not assumed: the same three sums are read again through the
// services with an EMPTY purchase registry, which is exactly the backend
// before this feature.
//
// 🔒 Everything here is invented: the purchase concepts (`ETC INVENTADO METAL`,
// `FONDO INVENTADO GLOBAL INDX`…), the amounts, the deposit numbers and the
// IBANs. The six fixed concepts are the bank's own labels. It runs in the
// throwaway test database, never in the human's.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Prisma } from '../../generated/prisma/client.js'

import {
  bankParsers,
  buildApp,
  depositMaturityMatchers,
  investmentPurchaseMatchers,
  productParsers,
} from '../../app.js'
import { driveWithPendingFiles } from '../../lib/drive.fixture.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { currentMonthInMadrid, todayInMadrid } from '../../lib/local-date.js'
import { getExpensesByCategory } from '../expenses-by-category/expenses-by-category.service.js'
import type { ExpensesByCategoryResponse } from '../expenses-by-category/expenses-by-category.types.js'
import { importPending } from '../import/import.service.js'
import { myinvestorHeaders } from '../myinvestor/myinvestor.fixture.js'
import { getOverview } from '../overview/overview.service.js'
import type { OverviewResponse } from '../overview/overview.types.js'
import { readInvestmentPurchases } from './movements.investment-purchases.js'
import { listMovements } from './movements.service.js'
import type {
  ListedMovement,
  MovementListResponse,
  SerializedMovementTotals,
} from './movements.types.js'

/** The `YYYY-MM` two months before the current one: a closed month, in the past. */
function testMonth(): string {
  const [year, month] = currentMonthInMadrid().split('-').map(Number)
  const index = year * 12 + (month - 1) - 2
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** `DD/MM/YYYY` of a day of the test month, as the MyInvestor statement writes it. */
function statementDate(day: number): string {
  const [year, month] = testMonth().split('-')
  return `${String(day).padStart(2, '0')}/${month}/${year}`
}

/** One line of the statement: day of the test month, concept and signed amount. */
interface StatementLine {
  day: number
  description: string
  /** Signed, as the bank writes it: `-218,47` is an expense. */
  amount: string
}

interface ThreeSums {
  movements: SerializedMovementTotals
  overview: SerializedMovementTotals
  byCategory: { amount: string; ids: Set<number> }
}

function idsOf(body: ExpensesByCategoryResponse): Set<number> {
  return new Set<number>(
    [...body.fixed.lines, ...body.variable.lines].flatMap((line) =>
      line.movements.map((movement) => movement.id),
    ),
  )
}

function minus(a: string, b: string): string {
  return new Prisma.Decimal(a).minus(b).toFixed(2)
}

describe('MyInvestor investment purchases in the three sums (F71)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdProductIds: number[] = []
  const createdOwnAccountIds: number[] = []
  let fileCounter = 0
  let daySequence = 1

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.ownAccount.deleteMany({ where: { id: { in: createdOwnAccountIds } } })
    createdOwnAccountIds.length = 0
    if (createdAccountIds.length > 0) {
      await app.prisma.importBalanceMismatch.deleteMany({
        where: { accountId: { in: createdAccountIds } },
      })
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

  /**
   * Imports a MyInvestor statement with these lines through the real importer
   * and a Drive double, and returns its account. The lines are written most
   * recent first, as the bank exports them.
   */
  async function importMyinvestorStatement(lines: StatementLine[], balance?: string) {
    const iban = syntheticIban()
    fileCounter += 1
    const rows = [...lines]
      .sort((a, b) => b.day - a.day)
      .map((line) => {
        const date = statementDate(line.day)
        return [date, date, line.description, line.amount, 'EUR'].join(';')
      })
    const preamble = [`iban;${iban};;;`, ...(balance === undefined ? [] : [`Saldo;${balance};;;`])]
    const content = Buffer.from(
      [...preamble, myinvestorHeaders.join(';'), ...rows].join('\n') + '\n',
      'utf8',
    )
    const result = await importPending({
      client: driveWithPendingFiles('myinvestor', '2026', [
        { name: `extracto-inventado-${Date.now()}-${fileCounter}.csv`, content },
      ]).client,
      prisma: app.prisma,
      rootFolderId: 'root',
      parsers: bankParsers,
      productParsers,
    })
    const account = await app.prisma.account.findUnique({ where: { iban } })
    expect(account, JSON.stringify(result.files)).not.toBeNull()
    createdAccountIds.push(account!.id)
    expect(account!.bank).toBe('myinvestor')
    return account!
  }

  async function createAccount(bank: string) {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Investment purchases test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  function seed(
    accountId: number,
    movement: { type: 'expense' | 'income'; amount: string; description: string; day: number },
  ) {
    const bookingDate = new Date(
      `${testMonth()}-${String(movement.day).padStart(2, '0')}T00:00:00.000Z`,
    )
    return app.prisma.movement.create({
      data: {
        accountId,
        type: movement.type,
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: daySequence++,
      },
    })
  }

  /** The movement of an account with exactly this description. */
  function movementNamed(accountId: number, description: string) {
    return app.prisma.movement.findFirstOrThrow({ where: { accountId, description } })
  }

  async function list(accountId: number): Promise<MovementListResponse> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${accountId}&pageSize=100`,
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  function rowOf(response: MovementListResponse, id: number): ListedMovement {
    const row = response.movements.find((movement) => movement.id === id)
    expect(row, `movement ${id} in the listing`).toBeDefined()
    return row as ListedMovement
  }

  /** The three sums as the API answers them: one account's listing, the month and its expense. */
  async function threeSums(accountId: number): Promise<ThreeSums> {
    const overview = await app.inject({ method: 'GET', url: `/api/overview?month=${testMonth()}` })
    expect(overview.statusCode).toBe(200)
    const byCategory = await app.inject({
      method: 'GET',
      url: `/api/expenses-by-category?month=${testMonth()}`,
    })
    expect(byCategory.statusCode).toBe(200)
    const body = byCategory.json<ExpensesByCategoryResponse>()
    return {
      movements: (await list(accountId)).totals,
      overview: overview.json<OverviewResponse>().period.totals,
      byCategory: { amount: body.amount, ids: idsOf(body) },
    }
  }

  /**
   * The same three sums with NO investment purchase registry: what the backend
   * answered before feature 71, over the same rows.
   */
  async function threeSumsWithoutTheRule(accountId: number): Promise<ThreeSums> {
    const movements = await listMovements(
      app.prisma,
      { accountId, page: 1, pageSize: 100 },
      depositMaturityMatchers,
      [],
    )
    const overview = await getOverview(
      app.prisma,
      { month: testMonth() },
      depositMaturityMatchers,
      [],
    )
    const byCategory = await getExpensesByCategory(
      app.prisma,
      depositMaturityMatchers,
      { month: testMonth() },
      todayInMadrid(),
      [],
    )
    return {
      movements: movements.totals,
      overview: overview.period.totals,
      byCategory: { amount: byCategory.amount, ids: idsOf(byCategory) },
    }
  }

  /** Both readings agree: the rule changes nothing on these rows. */
  async function expectCountsAsBefore(accountId: number) {
    const now = await threeSums(accountId)
    const before = await threeSumsWithoutTheRule(accountId)
    expect(now.movements).toEqual(before.movements)
    expect(now.overview).toEqual(before.overview)
    expect(now.byCategory.amount).toBe(before.byCategory.amount)
    expect([...now.byCategory.ids].sort()).toEqual([...before.byCategory.ids].sort())
    return now
  }

  async function overviewAndCategoryBaseline() {
    const overview = await app.inject({ method: 'GET', url: `/api/overview?month=${testMonth()}` })
    const byCategory = await app.inject({
      method: 'GET',
      url: `/api/expenses-by-category?month=${testMonth()}`,
    })
    return {
      overview: overview.json<OverviewResponse>().period.totals,
      byCategory: byCategory.json<ExpensesByCategoryResponse>().amount,
    }
  }

  it('an imported MyInvestor purchase with shares in its concept counts in none of the three sums without any mark', async () => {
    const baseline = await overviewAndCategoryBaseline()

    const account = await importMyinvestorStatement([
      { day: 6, description: 'ETC INVENTADO METAL @ 3', amount: '-218,47' },
      { day: 7, description: 'SUSCRIPCION PREMIUM', amount: '-8,27' },
    ])
    const purchase = await movementNamed(account.id, 'ETC INVENTADO METAL @ 3')
    const premium = await movementNamed(account.id, 'SUSCRIPCION PREMIUM')
    // Nobody marked it and the own accounts table recognizes nothing.
    expect(purchase.excludedFromTotals).toBe(false)
    expect(purchase.ownershipDecision).toBeNull()
    expect(purchase.transferId).toBeNull()

    const after = await threeSums(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '8.27', net: '-8.27' })
    // Only the subscription entered the month.
    expect(minus(after.overview.expense, baseline.overview.expense)).toBe('8.27')
    expect(minus(after.byCategory.amount, baseline.byCategory)).toBe('8.27')
    expect(after.byCategory.ids).toContain(premium.id)
    expect(after.byCategory.ids).not.toContain(purchase.id)

    // Without the rule the purchase would have counted in all three.
    const without = await threeSumsWithoutTheRule(account.id)
    expect(without.movements).toEqual({ income: '0.00', expense: '226.74', net: '-226.74' })
    expect(minus(without.overview.expense, after.overview.expense)).toBe('218.47')
    expect(minus(without.byCategory.amount, after.byCategory.amount)).toBe('218.47')
    expect(without.byCategory.ids).toContain(purchase.id)

    expect(rowOf(await list(account.id), purchase.id).investmentPurchase).toEqual({
      certain: true,
    })
  })

  it('an imported MyInvestor purchase of a product never seen counts in none of the three sums with the own accounts table empty', async () => {
    // Nothing in the own accounts table and no product of that name anywhere.
    expect(await app.prisma.ownAccount.count()).toBe(0)
    expect(await app.prisma.accountHolderName.count()).toBe(0)
    expect(
      await app.prisma.investmentProduct.count({
        where: { name: { contains: 'INVENTADO', mode: 'insensitive' } },
      }),
    ).toBe(0)
    const baseline = await overviewAndCategoryBaseline()

    const account = await importMyinvestorStatement([
      { day: 9, description: 'FONDO INVENTADO GLOBAL INDX', amount: '-350,62' },
    ])
    const purchase = await movementNamed(account.id, 'FONDO INVENTADO GLOBAL INDX')
    expect(purchase.excludedFromTotals).toBe(false)

    const after = await threeSums(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
    expect(after.overview).toEqual(baseline.overview)
    expect(after.byCategory.amount).toBe(baseline.byCategory)
    expect(after.byCategory.ids).not.toContain(purchase.id)

    const row = rowOf(await list(account.id), purchase.id)
    expect(row.investmentPurchase).toEqual({ certain: false })
    expect(row.ownership).toBeNull()
    expect(row.deposit).toBeNull()
  })

  it('the MyInvestor premium subscription, its VAT and the premium withholding still count as expense in the three sums', async () => {
    const baseline = await overviewAndCategoryBaseline()

    const account = await importMyinvestorStatement([
      { day: 3, description: 'Suscripción Premium', amount: '-8,27' },
      { day: 3, description: 'IVA SUSCRIPCION PREMIUM', amount: '-1,74' },
      { day: 4, description: 'RET. REMUNERACION PREMIUM', amount: '-0,63' },
    ])
    const ids = await Promise.all(
      ['Suscripción Premium', 'IVA SUSCRIPCION PREMIUM', 'RET. REMUNERACION PREMIUM'].map(
        async (description) => (await movementNamed(account.id, description)).id,
      ),
    )

    const after = await expectCountsAsBefore(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '10.64', net: '-10.64' })
    expect(minus(after.overview.expense, baseline.overview.expense)).toBe('10.64')
    expect(minus(after.byCategory.amount, baseline.byCategory)).toBe('10.64')
    const listed = await list(account.id)
    for (const id of ids) {
      expect(after.byCategory.ids).toContain(id)
      expect(rowOf(listed, id).investmentPurchase).toBeNull()
    }
  })

  it('MyInvestor deposit openings, cancellations and maturities add up as they did before', async () => {
    const maturityDay = 20
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'myinvestor',
        name: `Deposito inventado ${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        type: 'deposit',
        principal: '2741.30',
        interestRate: '2.4500',
        maturityDate: new Date(
          `${testMonth()}-${String(maturityDay).padStart(2, '0')}T00:00:00.000Z`,
        ),
      },
    })
    createdProductIds.push(product.id)

    const account = await importMyinvestorStatement([
      { day: 2, description: 'APERTURA DEP.: 663918', amount: '-2741,30' },
      { day: 5, description: 'APERTURA DEP.: 552871', amount: '-1503,27' },
      { day: 12, description: 'CANCELACION DEP.: 552871', amount: '1503,27' },
      { day: maturityDay, description: 'INTERESES DEP.: 663918', amount: '2759,04' },
    ])

    const after = await expectCountsAsBefore(account.id)
    // The openings and the cancellation add nothing; the maturity, its interest.
    expect(after.movements).toEqual({ income: '17.74', expense: '0.00', net: '17.74' })
    const listed = await list(account.id)
    expect(listed.movements).toHaveLength(4)
    for (const row of listed.movements) {
      expect(row.deposit, row.description).not.toBeNull()
      expect(row.investmentPurchase, row.description).toBeNull()
    }
  })

  it('a purchase marked by hand or recognized by the own accounts table still counts in no sum and keeps its mark', async () => {
    const account = await importMyinvestorStatement([
      { day: 8, description: 'ETC INVENTADO METAL @ 5', amount: '-364,12' },
      { day: 9, description: 'FONDO INVENTADO RENTA FIJA', amount: '-275,48' },
    ])
    const marked = await movementNamed(account.id, 'ETC INVENTADO METAL @ 5')
    const recognized = await movementNamed(account.id, 'FONDO INVENTADO RENTA FIJA')

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/movements/${marked.id}`,
      payload: { excludedFromTotals: true },
    })
    expect(patch.statusCode).toBe(200)
    const own = await app.inject({
      method: 'POST',
      url: '/api/own-accounts',
      payload: {
        name: 'Fondo inventado de renta fija',
        bank: 'MyInvestor',
        type: 'investment',
        texts: ['Fondo Inventado Renta Fija'],
      },
    })
    expect(own.statusCode).toBe(201)
    createdOwnAccountIds.push(own.json().id)

    const after = await threeSums(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
    expect(after.byCategory.ids).not.toContain(marked.id)
    expect(after.byCategory.ids).not.toContain(recognized.id)
    // And neither did they count before this feature: nothing changes for them.
    const without = await threeSumsWithoutTheRule(account.id)
    expect(after.overview).toEqual(without.overview)
    expect(after.byCategory.amount).toBe(without.byCategory.amount)

    const listed = await list(account.id)
    expect(rowOf(listed, marked.id)).toMatchObject({
      excludedFromTotals: true,
      investmentPurchase: { certain: true },
    })
    expect(rowOf(listed, recognized.id)).toMatchObject({
      excludedFromTotals: false,
      ownershipDecision: null,
      investmentPurchase: { certain: false },
    })
    expect(rowOf(listed, recognized.id).ownership?.status).toBe('own')
    // Stored as the human left them.
    const stored = await app.prisma.movement.findMany({
      where: { id: { in: [marked.id, recognized.id] } },
      orderBy: { id: 'asc' },
    })
    expect(stored.map((row) => [row.excludedFromTotals, row.ownershipDecision])).toEqual(
      marked.id < recognized.id
        ? [
            [true, null],
            [false, null],
          ]
        : [
            [false, null],
            [true, null],
          ],
    )
  })

  it('recognizing a purchase writes nothing: mark, ownership decision, own account texts, amount, type and balance stay the same', async () => {
    const account = await importMyinvestorStatement(
      [
        { day: 10, description: 'ETC INVENTADO METAL @ 4', amount: '-291,36' },
        { day: 11, description: 'FONDO INVENTADO GLOBAL INDX', amount: '-187,59' },
        { day: 11, description: 'SUSCRIPCION PREMIUM', amount: '-8,27' },
      ],
      '4812,93',
    )

    async function snapshot() {
      const accounts = await app.inject({ method: 'GET', url: '/api/accounts' })
      expect(accounts.statusCode).toBe(200)
      return {
        movements: await app.prisma.movement.findMany({
          where: { accountId: account.id },
          orderBy: { id: 'asc' },
        }),
        account: await app.prisma.account.findUniqueOrThrow({ where: { id: account.id } }),
        listedAccount: (accounts.json() as { id: number }[]).find((row) => row.id === account.id),
        ownAccounts: await app.prisma.ownAccount.findMany({ orderBy: { id: 'asc' } }),
        ownAccountTexts: await app.prisma.ownAccountText.findMany({ orderBy: { id: 'asc' } }),
        holderNames: await app.prisma.accountHolderName.findMany({ orderBy: { id: 'asc' } }),
      }
    }

    const before = await snapshot()
    expect(before.listedAccount).toBeDefined()

    // Every read that recognizes the purchases, twice.
    for (let round = 0; round < 2; round += 1) {
      const listed = await list(account.id)
      expect(listed.movements.filter((row) => row.investmentPurchase !== null)).toHaveLength(2)
      await threeSums(account.id)
    }

    const after = await snapshot()
    expect(after).toEqual(before)
    for (const row of after.movements) {
      expect(row.excludedFromTotals).toBe(false)
      expect(row.ownershipDecision).toBeNull()
      expect(row.type).toBe('expense')
    }
    expect(after.movements.map((row) => row.amount.toFixed(2)).sort()).toEqual(
      ['187.59', '291.36', '8.27'].sort(),
    )
  })

  it('lists the purchase with the bank amount and type and investmentPurchase certain true or false', async () => {
    const account = await importMyinvestorStatement([
      { day: 13, description: 'ETC INVENTADO METAL @ 2,5', amount: '-97,36' },
      { day: 14, description: 'FONDO INVENTADO GLOBAL INDX', amount: '-452,18' },
      { day: 14, description: 'APORTACION A MI CARTERA', amount: '-125,40' },
    ])
    const certain = await movementNamed(account.id, 'ETC INVENTADO METAL @ 2,5')
    const uncertain = await movementNamed(account.id, 'FONDO INVENTADO GLOBAL INDX')
    const contribution = await movementNamed(account.id, 'APORTACION A MI CARTERA')

    const listed = await list(account.id)
    expect(listed.movements).toHaveLength(3)
    expect(rowOf(listed, certain.id)).toMatchObject({
      type: 'expense',
      amount: '97.36',
      investmentPurchase: { certain: true },
    })
    expect(rowOf(listed, uncertain.id)).toMatchObject({
      type: 'expense',
      amount: '452.18',
      investmentPurchase: { certain: false },
    })
    expect(rowOf(listed, contribution.id)).toMatchObject({
      type: 'expense',
      amount: '125.40',
      investmentPurchase: null,
    })
    // Only the contribution to the portfolio counts.
    expect(listed.totals).toEqual({ income: '0.00', expense: '125.40', net: '-125.40' })
  })

  it('the same concept in an account of another bank is not a purchase and counts as before', async () => {
    const baseline = await overviewAndCategoryBaseline()
    const account = await createAccount('bankinter')
    const etc = await seed(account.id, {
      type: 'expense',
      amount: '218.47',
      description: 'ETC INVENTADO METAL @ 3',
      day: 6,
    })
    const fund = await seed(account.id, {
      type: 'expense',
      amount: '350.62',
      description: 'FONDO INVENTADO GLOBAL INDX',
      day: 9,
    })

    const after = await expectCountsAsBefore(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '569.09', net: '-569.09' })
    expect(minus(after.overview.expense, baseline.overview.expense)).toBe('569.09')
    expect(minus(after.byCategory.amount, baseline.byCategory)).toBe('569.09')
    const listed = await list(account.id)
    expect(rowOf(listed, etc.id).investmentPurchase).toBeNull()
    expect(rowOf(listed, fund.id).investmentPurchase).toBeNull()
    expect(after.byCategory.ids).toContain(etc.id)
    expect(after.byCategory.ids).toContain(fund.id)
  })

  it('a MyInvestor income is never a purchase and counts as before', async () => {
    const account = await importMyinvestorStatement([
      { day: 15, description: 'FONDO INVENTADO GLOBAL INDX', amount: '412,58' },
      { day: 16, description: 'REEMBOLSO ETC INVENTADO METAL @ 3', amount: '120,44' },
      { day: 17, description: 'INTERESES CUENTA INVENTADA', amount: '3,17' },
    ])

    const after = await expectCountsAsBefore(account.id)
    expect(after.movements).toEqual({ income: '536.19', expense: '0.00', net: '536.19' })
    const listed = await list(account.id)
    expect(listed.movements).toHaveLength(3)
    for (const row of listed.movements) {
      expect(row.type).toBe('income')
      expect(row.investmentPurchase).toBeNull()
    }
  })

  it('a leg of a paired transfer is not a purchase', async () => {
    const account = await importMyinvestorStatement([
      { day: 18, description: 'FONDO INVENTADO GLOBAL INDX', amount: '-623,19' },
    ])
    const out = await movementNamed(account.id, 'FONDO INVENTADO GLOBAL INDX')
    // Before pairing, it is a purchase.
    expect(rowOf(await list(account.id), out.id).investmentPurchase).toEqual({ certain: false })

    const other = await createAccount('bankinter')
    const into = await seed(other.id, {
      type: 'income',
      amount: '623.19',
      description: 'TRANSFERENCIA RECIBIDA INVENTADA',
      day: 18,
    })
    const pair = await app.inject({
      method: 'POST',
      url: '/api/transfers',
      payload: { movementIds: [out.id, into.id] },
    })
    expect(pair.statusCode).toBe(201)

    expect(
      (await readInvestmentPurchases(app.prisma, investmentPurchaseMatchers)).has(out.id),
    ).toBe(false)
    const listed = await list(account.id)
    expect(rowOf(listed, out.id).transferId).not.toBeNull()
    expect(rowOf(listed, out.id).investmentPurchase).toBeNull()
    // A paired leg adds nothing, as before.
    const after = await expectCountsAsBefore(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
  })
})
