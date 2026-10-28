// Feature 62 `own-accounts`: what the own accounts table does to the three sums
// — the `totals` of GET /api/movements, the `period.totals` of GET /api/overview
// and what GET /api/expenses-by-category counts as an expense — and to the
// listing (R5–R7, R9–R14). Until feature 64 the third sum was the monthly cost
// of GET /api/recurring-expenses, retired then; GET /api/expenses-by-category
// replaced it and reads the same rule. Each test measures the sums BEFORE filling the table and
// after, so the other rows of the test database never change the answer.
//
// 🔒 Everything here is invented: the holder «Ana Pérez Gil», the other person
// «Lucía Pérez Sanz», the account names, texts, amounts and the deposit number.
// Bank names alone are fine (docs/conventions.md §Tests). It runs in the
// throwaway test database, never in the human's.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Prisma } from '../../generated/prisma/client.js'

import { bankParsers, buildApp, productParsers } from '../../app.js'
import { driveWithPendingFiles } from '../../lib/drive.fixture.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { currentMonthInMadrid } from '../../lib/local-date.js'
import { importPending } from '../import/import.service.js'
import type { ExpensesByCategoryResponse } from '../expenses-by-category/expenses-by-category.types.js'
import type { ListedMovement, MovementListResponse } from '../movements/movements.types.js'
import type { OverviewResponse } from '../overview/overview.types.js'
import { buildRevolutCsv, revolutRow } from '../revolut/revolut.fixture.js'
import { detectTransfers } from '../transfers/transfers.service.js'

/** The `YYYY-MM` two months before the current one: a closed month, in the past. */
function testMonth(): string {
  const [year, month] = currentMonthInMadrid().split('-').map(Number)
  const index = year * 12 + (month - 1) - 2
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

const HOLDER = 'Ana Pérez Gil'

describe('own accounts in the three sums (F62)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdProductIds: number[] = []
  const createdOwnAccountIds: number[] = []
  let daySequence = 1

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.ownAccount.deleteMany({ where: { id: { in: createdOwnAccountIds } } })
    await app.prisma.accountHolderName.deleteMany({})
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

  async function createAccount(bank = 'bankinter') {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Own accounts totals test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    type?: 'expense' | 'income'
    amount: string
    description: string
    date?: string
    excludedFromTotals?: boolean
    balanceAfter?: string
  }

  function seed(accountId: number, movement: SeedMovement) {
    const bookingDate = new Date(`${movement.date ?? `${testMonth()}-15`}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: daySequence++,
        excludedFromTotals: movement.excludedFromTotals ?? false,
        balanceAfter: movement.balanceAfter ?? null,
      },
    })
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

  async function list(query: string): Promise<MovementListResponse> {
    const response = await app.inject({ method: 'GET', url: `/api/movements?${query}` })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  function rowOf(response: MovementListResponse, id: number): ListedMovement {
    const row = response.movements.find((movement) => movement.id === id)
    expect(row, `movement ${id} in the listing`).toBeDefined()
    return row as ListedMovement
  }

  async function overviewTotals(month = testMonth()) {
    const response = await app.inject({ method: 'GET', url: `/api/overview?month=${month}` })
    expect(response.statusCode).toBe(200)
    return response.json<OverviewResponse>().period.totals
  }

  async function byCategory(month = testMonth()): Promise<{ amount: string; ids: Set<number> }> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/expenses-by-category?month=${month}`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json<ExpensesByCategoryResponse>()
    const ids = new Set<number>(
      [...body.fixed.lines, ...body.variable.lines].flatMap((line) =>
        line.movements.map((movement) => movement.id),
      ),
    )
    return { amount: body.amount, ids }
  }

  /** The three sums at once: the listing of one account, the month and its expense by category. */
  async function threeSums(accountId: number) {
    return {
      movements: (await list(`accountId=${accountId}`)).totals,
      overview: await overviewTotals(),
      byCategory: await byCategory(),
    }
  }

  function minus(a: string, b: string): string {
    return new Prisma.Decimal(a).minus(b).toFixed(2)
  }

  it('a movement naming an own account or the holder counts in none of the three sums', async () => {
    const account = await createAccount()
    const byHolder = await seed(account.id, {
      amount: '120.00',
      description: 'TRANSF /Ana Perez Gil',
    })
    const byProduct = await seed(account.id, {
      amount: '240.00',
      description: 'APORTACION FONDO GLOBAL INVENTADO',
    })
    const incomeByHolder = await seed(account.id, {
      type: 'income',
      amount: '360.00',
      description: 'TRANSFERENCIA DE ANA_PEREZ_GIL',
    })
    const ordinary = await seed(account.id, { amount: '57.34', description: 'Mercado Ficticio' })

    const before = await threeSums(account.id)
    expect(before.movements).toEqual({ income: '360.00', expense: '417.34', net: '-57.34' })

    await setHolderNames([HOLDER])
    // A product inside the same bank as the account the money leaves from.
    const fund = await addOwnAccount({
      name: 'Fondo inventado',
      bank: 'Bankinter',
      type: 'investment',
      texts: ['Fondo Global Inventado'],
    })

    const after = await threeSums(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '57.34', net: '-57.34' })
    expect(minus(before.overview.expense, after.overview.expense)).toBe('360.00')
    expect(minus(before.overview.income, after.overview.income)).toBe('360.00')
    // The two expenses of the month out of the expense by category: 120.00 + 240.00.
    expect(minus(before.byCategory.amount, after.byCategory.amount)).toBe('360.00')
    expect(before.byCategory.ids).toContain(byHolder.id)
    expect(before.byCategory.ids).toContain(byProduct.id)
    expect(after.byCategory.ids).not.toContain(byHolder.id)
    expect(after.byCategory.ids).not.toContain(byProduct.id)
    expect(after.byCategory.ids).toContain(ordinary.id)

    const listed = await list(`accountId=${account.id}`)
    expect(rowOf(listed, byHolder.id).ownership).toEqual({
      status: 'own',
      ownAccountId: null,
      ownAccountName: null,
      matchedText: HOLDER,
    })
    expect(rowOf(listed, incomeByHolder.id).ownership?.status).toBe('own')
    expect(rowOf(listed, byProduct.id).ownership).toEqual({
      status: 'own',
      ownAccountId: fund.id,
      ownAccountName: 'Fondo inventado',
      matchedText: 'Fondo Global Inventado',
    })
    expect(rowOf(listed, ordinary.id).ownership).toBeNull()
  })

  it('a transfer to another person counts even when its bank is in the own accounts table', async () => {
    const account = await createAccount()
    const toSomeoneElse = await seed(account.id, {
      amount: '84.00',
      description: 'TRANSF /Lucia Perez Sanz BANKINTER',
    })

    const before = await threeSums(account.id)

    await setHolderNames([HOLDER])
    // Same bank as the account and as the description: the `bank` field is
    // never a text, so it recognizes nothing by itself.
    await addOwnAccount({
      name: 'Hucha inventada',
      bank: 'Bankinter',
      type: 'savings',
      texts: ['Hucha inventada'],
    })

    const after = await threeSums(account.id)
    expect(after.movements).toEqual({ income: '0.00', expense: '84.00', net: '-84.00' })
    expect(after.movements).toEqual(before.movements)
    expect(after.overview).toEqual(before.overview)
    expect(after.byCategory.amount).toBe(before.byCategory.amount)
    expect(after.byCategory.ids).toContain(toSomeoneElse.id)
    expect(rowOf(await list(`accountId=${account.id}`), toSomeoneElse.id).ownership).toBeNull()
  })

  it('a doubtful movement keeps counting and is listed with ownership=doubtful', async () => {
    const account = await createAccount()
    const doubtful = await seed(account.id, {
      amount: '96.00',
      description: 'TRANSF /TRADE REPUBLIC',
    })
    await seed(account.id, { amount: '120.00', description: 'TRANSF /Ana Perez Gil' })
    await seed(account.id, { amount: '33.17', description: 'Libreria Ficticia' })

    await setHolderNames([HOLDER])
    const portfolio = await addOwnAccount({
      name: 'Cuenta inventada',
      bank: 'Trade Republic',
      type: 'checking',
      texts: ['Trade Republic'],
    })

    const all = await list(`accountId=${account.id}`)
    // The doubtful one still counts; the one with the holder name does not.
    expect(all.totals).toEqual({ income: '0.00', expense: '129.17', net: '-129.17' })
    expect(rowOf(all, doubtful.id).ownership).toEqual({
      status: 'doubtful',
      ownAccountId: portfolio.id,
      ownAccountName: 'Cuenta inventada',
      matchedText: 'Trade Republic',
    })
    expect((await byCategory()).ids).toContain(doubtful.id)

    const onlyDoubtful = await list(`accountId=${account.id}&ownership=doubtful`)
    expect(onlyDoubtful.movements.map((movement) => movement.id)).toEqual([doubtful.id])
    expect(onlyDoubtful.pagination).toMatchObject({ total: 1, totalPages: 1 })
    expect(onlyDoubtful.totals).toEqual({ income: '0.00', expense: '96.00', net: '-96.00' })

    const wrongValue = await app.inject({ method: 'GET', url: '/api/movements?ownership=own' })
    expect(wrongValue.statusCode).toBe(400)
  })

  it('a decision on a doubtful movement is kept and respected in the three sums', async () => {
    const account = await createAccount()
    const doubtful = await seed(account.id, {
      amount: '144.00',
      description: 'TRASPASO A TRADE REPUBLIC',
    })
    await addOwnAccount({
      name: 'Cuenta inventada',
      bank: 'Trade Republic',
      type: 'checking',
      texts: ['Trade Republic'],
    })

    const decide = (ownershipDecision: 'mine' | 'not_mine' | null) =>
      app.inject({
        method: 'PATCH',
        url: `/api/movements/${doubtful.id}`,
        payload: { ownershipDecision },
      })
    const doubtfulIds = async () =>
      (await list(`accountId=${account.id}&ownership=doubtful`)).movements.map((row) => row.id)

    const counting = await threeSums(account.id)
    expect(counting.movements.expense).toBe('144.00')
    expect(await doubtfulIds()).toEqual([doubtful.id])

    const mine = await decide('mine')
    expect(mine.statusCode).toBe(200)
    expect(mine.json()).toMatchObject({ id: doubtful.id, ownershipDecision: 'mine' })
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: doubtful.id } })
    expect(stored.ownershipDecision).toBe('mine')

    const afterMine = await threeSums(account.id)
    expect(afterMine.movements.expense).toBe('0.00')
    expect(minus(counting.overview.expense, afterMine.overview.expense)).toBe('144.00')
    expect(minus(counting.byCategory.amount, afterMine.byCategory.amount)).toBe('144.00')
    expect(afterMine.byCategory.ids).not.toContain(doubtful.id)
    expect(rowOf(await list(`accountId=${account.id}`), doubtful.id).ownership?.status).toBe('mine')
    expect(await doubtfulIds()).toEqual([])

    expect((await decide('not_mine')).json()).toMatchObject({ ownershipDecision: 'not_mine' })
    const afterNotMine = await threeSums(account.id)
    expect(afterNotMine.movements).toEqual(counting.movements)
    expect(afterNotMine.overview).toEqual(counting.overview)
    expect(afterNotMine.byCategory.amount).toBe(counting.byCategory.amount)
    expect(rowOf(await list(`accountId=${account.id}`), doubtful.id).ownership?.status).toBe(
      'not_mine',
    )
    expect(await doubtfulIds()).toEqual([])

    expect((await decide(null)).json()).toMatchObject({ ownershipDecision: null })
    expect(await doubtfulIds()).toEqual([doubtful.id])
    expect((await threeSums(account.id)).movements).toEqual(counting.movements)

    // A value outside the list is a 400 and changes nothing.
    const wrong = await app.inject({
      method: 'PATCH',
      url: `/api/movements/${doubtful.id}`,
      payload: { ownershipDecision: 'yes' },
    })
    expect(wrong.statusCode).toBe(400)
    // Resolving is one by one: the bulk PATCH does not take the decision.
    const bulk = await app.inject({
      method: 'PATCH',
      url: '/api/movements',
      payload: { ids: [doubtful.id], ownershipDecision: 'mine' },
    })
    expect(bulk.statusCode).toBe(400)
    const unchanged = await app.prisma.movement.findUniqueOrThrow({ where: { id: doubtful.id } })
    expect(unchanged.ownershipDecision).toBeNull()
  })

  it('a deposit movement still counts by the deposit rule', async () => {
    const account = await createAccount('myinvestor')
    const date = `${testMonth()}-02`
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'myinvestor',
        name: `Deposito inventado ${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        type: 'deposit',
        principal: '3815.40',
        interestRate: '2.3500',
        maturityDate: new Date(`${date}T00:00:00.000Z`),
      },
    })
    createdProductIds.push(product.id)
    const maturity = await seed(account.id, {
      type: 'income',
      amount: '3836.92',
      date,
      description: 'INTERESES DEP.: 880417',
    })

    const before = await threeSums(account.id)
    expect(before.movements).toEqual({ income: '21.52', expense: '0.00', net: '21.52' })

    await addOwnAccount({
      name: 'Deposito inventado',
      bank: 'MyInvestor',
      type: 'deposit',
      texts: ['880417'],
    })

    const after = await threeSums(account.id)
    expect(after.movements).toEqual(before.movements)
    expect(after.overview).toEqual(before.overview)
    const row = rowOf(await list(`accountId=${account.id}`), maturity.id)
    // It is recognized, and still adds its interest: the deposit rule goes first.
    expect(row.ownership?.status).toBe('own')
    expect(row.deposit?.countedAmount).toBe('21.52')
  })

  it('recognizes movements already stored and movements imported afterwards', async () => {
    const account = await createAccount()
    const stored = await seed(account.id, {
      amount: '120.00',
      description: 'TRANSF /Ana Perez Gil',
    })

    await setHolderNames([HOLDER])

    // A statement imported AFTER the holder forms were saved, through the
    // real importer and a Drive double.
    const iban = syntheticIban()
    await importPending({
      client: driveWithPendingFiles('revolut', '2025', [
        {
          name: 'extracto.csv',
          content: buildRevolutCsv({
            preamble: [`iban;${iban}`],
            rows: [
              revolutRow({
                startedAt: '2026-07-01 09:15:00',
                completedAt: '2026-07-01 09:15:02',
                description: 'Transferencia a Ana Perez Gil',
                amount: '-48.00',
                balance: '52.00',
              }),
              revolutRow({
                startedAt: '2026-07-01 10:15:00',
                completedAt: '2026-07-01 10:15:02',
                description: 'Cafeteria Ficticia',
                amount: '-3.40',
                balance: '48.60',
              }),
            ],
          }),
        },
      ]).client,
      prisma: app.prisma,
      rootFolderId: 'root',
      parsers: bankParsers,
      productParsers,
    })
    const imported = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    createdAccountIds.push(imported.id)
    const importedOwn = await app.prisma.movement.findFirstOrThrow({
      where: { accountId: imported.id, description: 'Transferencia a Ana Perez Gil' },
    })

    const old = await list(`accountId=${account.id}`)
    expect(old.totals).toEqual({ income: '0.00', expense: '0.00', net: '0.00' })
    expect(rowOf(old, stored.id).ownership?.status).toBe('own')

    const fresh = await list(`accountId=${imported.id}`)
    expect(fresh.totals).toEqual({ income: '0.00', expense: '3.40', net: '-3.40' })
    expect(rowOf(fresh, importedOwn.id).ownership?.status).toBe('own')
    // Nothing was written on either to get there.
    expect(importedOwn.ownershipDecision).toBeNull()
    expect(
      (await app.prisma.movement.findUniqueOrThrow({ where: { id: stored.id } })).ownershipDecision,
    ).toBeNull()
  })

  it('recognition writes nothing: amounts, balances, marks and transfer pairs stay the same', async () => {
    const from = await createAccount('bankinter')
    const to = await createAccount('ing')
    const date = `${testMonth()}-10`
    const out = await seed(from.id, {
      amount: '317.43',
      description: 'TRANSF /Ana Perez Gil',
      date,
      balanceAfter: '1204.18',
    })
    const into = await seed(to.id, {
      type: 'income',
      amount: '317.43',
      description: 'TRANSFERENCIA RECIBIDA ANA PEREZ GIL',
      date,
    })
    await seed(from.id, {
      amount: '61.09',
      description: 'TRANSF /TRADE REPUBLIC',
      date,
      excludedFromTotals: true,
    })
    await seed(from.id, { amount: '23.61', description: 'Panaderia Ficticia', date })
    const ids = [from.id, to.id]

    /** The pairs among this test's movements, as sorted id pairs. */
    async function pairs(): Promise<number[][]> {
      const rows = await app.prisma.movement.findMany({
        where: { accountId: { in: ids }, transferId: { not: null } },
        orderBy: { id: 'asc' },
      })
      const byTransfer = new Map<string, number[]>()
      for (const row of rows) {
        const key = row.transferId as string
        byTransfer.set(key, [...(byTransfer.get(key) ?? []), row.id])
      }
      return [...byTransfer.values()].sort((a, b) => a[0] - b[0])
    }

    /** Every column of this test's movements and its accounts as GET /api/accounts shows them. */
    async function snapshot() {
      const response = await app.inject({ method: 'GET', url: '/api/accounts' })
      expect(response.statusCode).toBe(200)
      const accounts = (response.json() as { id: number }[]).filter((account) =>
        ids.includes(account.id),
      )
      return {
        movements: await app.prisma.movement.findMany({
          where: { accountId: { in: ids } },
          orderBy: { id: 'asc' },
        }),
        accounts,
      }
    }

    // Detection with the table EMPTY.
    await detectTransfers(app.prisma)
    const pairsWithoutTable = await pairs()
    expect(pairsWithoutTable).toEqual([[out.id, into.id]])
    const before = await snapshot()

    await setHolderNames([HOLDER])
    await addOwnAccount({
      name: 'Cuenta inventada',
      bank: 'Trade Republic',
      type: 'checking',
      texts: ['Trade Republic'],
    })
    // Every read that asks for the recognition.
    await list(`accountId=${from.id}`)
    await list(`accountId=${from.id}&ownership=doubtful`)
    await overviewTotals()
    await byCategory()

    expect(await snapshot()).toEqual(before)

    // Detection again, this time with the table FILLED: the same pairs.
    await app.prisma.movement.updateMany({
      where: { accountId: { in: ids } },
      data: { transferId: null },
    })
    await detectTransfers(app.prisma)
    expect(await pairs()).toEqual(pairsWithoutTable)
  })
})
