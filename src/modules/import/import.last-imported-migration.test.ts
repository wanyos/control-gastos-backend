// Feature 69 (R14): the migration `20261108120100_last_imported_at_backfill`
// gives `lastImportedAt` to what was imported before the column existed, and
// touches nothing else. The test runs the very `migration.sql` file on rows
// seeded in the worker's disposable database (never the human's): the template
// database already applied it once, on empty tables, so running it again here is
// what proves what it does to rows that exist. Same pattern as
// `movements.category-source-migration.test.ts` (feature 60).
//
// 🔒 Everything here is synthetic: `syntheticIban()` accounts, a made-up bank
// slug, short invented amounts and made-up names. The `createdAt` of every row is
// set by hand so the expected dates do not depend on the clock.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const migrationSql = readFileSync(
  join(
    repoRoot,
    'prisma',
    'migrations',
    '20261108120100_last_imported_at_backfill',
    'migration.sql',
  ),
  'utf8',
)

const at = (instant: string) => new Date(instant)

describe('migration 20261108120100_last_imported_at_backfill (feature 69)', () => {
  let app: FastifyInstance
  const bank = `zz-f69-migration-${Date.now()}`

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    const accounts = await app.prisma.account.findMany({ where: { bank } })
    const accountIds = accounts.map((account) => account.id)
    await app.prisma.movement.deleteMany({ where: { accountId: { in: accountIds } } })
    await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } })
    const products = await app.prisma.investmentProduct.findMany({ where: { bank } })
    const productIds = products.map((product) => product.id)
    await app.prisma.valuation.deleteMany({ where: { productId: { in: productIds } } })
    await app.prisma.savingsSnapshot.deleteMany({ where: { productId: { in: productIds } } })
    await app.prisma.investmentProduct.deleteMany({ where: { id: { in: productIds } } })
  })

  afterAll(async () => {
    await app.close()
  })

  let daySequence = 0

  function seedMovement(accountId: number, createdAt: Date, bookingDate: string) {
    daySequence += 1
    const date = new Date(`${bookingDate}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: 'expense',
        amount: '9.45',
        description: `SYNTHETIC LAST IMPORTED ROW ${daySequence}`,
        bookingDate: date,
        valueDate: date,
        daySequence,
        createdAt,
      },
    })
  }

  function valuation(productId: number, date: string, createdAt: Date) {
    return app.prisma.valuation.create({
      data: {
        productId,
        date: new Date(`${date}T00:00:00.000Z`),
        invested: '150.20',
        marketValue: '152.70',
        gain: '2.50',
        gainPercent: '1.6600',
        createdAt,
      },
    })
  }

  it('fills the import date of what was imported before the feature', async () => {
    // Accounts.
    const withMovements = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'migración con movimientos' },
    })
    // Two imports: the most recent `createdAt` wins, whatever the booking dates say.
    await seedMovement(withMovements.id, at('2031-01-04T10:00:00.000Z'), '2030-12-29')
    await seedMovement(withMovements.id, at('2031-02-03T19:30:00.000Z'), '2031-01-28')
    await seedMovement(withMovements.id, at('2031-01-04T10:00:00.000Z'), '2031-12-30')
    const withoutMovements = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'migración sin movimientos' },
    })
    const alreadyFilled = await app.prisma.account.create({
      data: {
        iban: syntheticIban(),
        bank,
        alias: 'migración ya rellena',
        lastImportedAt: at('2031-03-15T07:45:00.000Z'),
      },
    })
    await seedMovement(alreadyFilled.id, at('2031-04-01T12:00:00.000Z'), '2031-03-31')

    // Products.
    const fund = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Fondo inventado de la migración',
        type: 'fund',
        createdAt: at('2030-06-02T09:00:00.000Z'),
      },
    })
    await valuation(fund.id, '2030-06-30', at('2030-07-01T09:00:00.000Z'))
    await valuation(fund.id, '2030-08-31', at('2030-09-02T21:10:00.000Z'))
    await valuation(fund.id, '2030-07-31', at('2030-08-01T09:00:00.000Z'))
    const savings = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Cuenta remunerada inventada de la migración',
        type: 'savings_account',
        createdAt: at('2030-05-11T16:00:00.000Z'),
      },
    })
    await app.prisma.savingsSnapshot.create({
      data: {
        productId: savings.id,
        date: new Date('2030-05-31T00:00:00.000Z'),
        openingBalance: '41.20',
        moneyIn: '25.50',
        moneyOut: '0.00',
        interest: '0.07',
        balance: '66.77',
        createdAt: at('2030-06-01T08:30:00.000Z'),
      },
    })
    // A product whose own `createdAt` is newer than its only photo: the most
    // recent of the three still wins.
    const productNewerThanPhotos = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Cartera inventada de la migración',
        type: 'managed_portfolio',
        createdAt: at('2030-10-20T13:00:00.000Z'),
      },
    })
    await valuation(productNewerThanPhotos.id, '2030-09-30', at('2030-10-01T09:00:00.000Z'))
    const deposit = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Depósito inventado de la migración',
        type: 'deposit',
        principal: '540.00',
        interestRate: '2.1500',
        expectedGain: '11.61',
        maturityDate: new Date('2031-09-14T00:00:00.000Z'),
        createdAt: at('2030-09-14T11:25:00.000Z'),
      },
    })
    const filledProduct = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'ETF inventado ya relleno de la migración',
        type: 'etf',
        createdAt: at('2030-04-02T09:00:00.000Z'),
        lastImportedAt: at('2030-04-03T09:00:00.000Z'),
      },
    })
    await valuation(filledProduct.id, '2030-12-31', at('2031-01-02T09:00:00.000Z'))

    const accountIds = [withMovements.id, withoutMovements.id, alreadyFilled.id]
    const productIds = [
      fund.id,
      savings.id,
      productNewerThanPhotos.id,
      deposit.id,
      filledProduct.id,
    ]
    const readAccounts = () =>
      app.prisma.account.findMany({ where: { id: { in: accountIds } }, orderBy: { id: 'asc' } })
    const readProducts = () =>
      app.prisma.investmentProduct.findMany({
        where: { id: { in: productIds } },
        orderBy: { id: 'asc' },
      })
    const accountsBefore = await readAccounts()
    const productsBefore = await readProducts()

    await app.prisma.$executeRawUnsafe(migrationSql)

    const accountsAfter = await readAccounts()
    const productsAfter = await readProducts()
    const accountDate = new Map(accountsAfter.map((row) => [row.id, row.lastImportedAt]))
    const productDate = new Map(productsAfter.map((row) => [row.id, row.lastImportedAt]))

    expect(accountDate.get(withMovements.id)).toEqual(at('2031-02-03T19:30:00.000Z'))
    expect(accountDate.get(withoutMovements.id)).toBeNull()
    expect(accountDate.get(alreadyFilled.id)).toEqual(at('2031-03-15T07:45:00.000Z'))

    expect(productDate.get(fund.id)).toEqual(at('2030-09-02T21:10:00.000Z'))
    expect(productDate.get(savings.id)).toEqual(at('2030-06-01T08:30:00.000Z'))
    expect(productDate.get(productNewerThanPhotos.id)).toEqual(at('2030-10-20T13:00:00.000Z'))
    expect(productDate.get(deposit.id)).toEqual(at('2030-09-14T11:25:00.000Z'))
    expect(productDate.get(filledProduct.id)).toEqual(at('2030-04-03T09:00:00.000Z'))

    // No other column changes, `updatedAt` included: only the date is written.
    const withoutDate = <T extends { lastImportedAt: Date | null }>({
      lastImportedAt: _date,
      ...rest
    }: T) => rest
    expect(accountsAfter.map(withoutDate)).toEqual(accountsBefore.map(withoutDate))
    expect(productsAfter.map(withoutDate)).toEqual(productsBefore.map(withoutDate))

    // Running it a second time changes nothing.
    await app.prisma.$executeRawUnsafe(migrationSql)
    expect(await readAccounts()).toEqual(accountsAfter)
    expect(await readProducts()).toEqual(productsAfter)
  })
})
