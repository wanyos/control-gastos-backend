// Feature 69 `last-imports`: `GET /api/last-imports`, for every account and
// every live product, up to which date there is data, which day it was last
// imported, whether a file is expected every month and its gaps.
//
// 🔒 Everything here is invented (ADR-017): `syntheticIban()` accounts, bank
// slugs made up per test, made-up names, concepts and short amounts. Statements
// and product files are built in code by fake adapters; no file of any bank is
// read. The movements of the gap tests are seeded with an explicit `createdAt`
// so they never depend on the clock.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { todayInMadrid } from '../../lib/local-date.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import { importProductFile, importStatement } from '../import/import.service.js'
import type { BankParserAdapter } from '../import/import.types.js'
import type { ProductFileInput, ProductParserAdapter } from '../investments/investments.types.js'
import {
  accountGaps,
  closingDate,
  getLastImports,
  missingPhotoMonths,
} from './last-imports.service.js'
import type { LastImportsResponse } from './last-imports.types.js'

// ── Fixtures ────────────────────────────────────────────────────────────────

function day(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

function parsedMovement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
  return {
    bookingDate: '2026-10-15',
    valueDate: '2026-10-15',
    description: 'COMPRA INVENTADA ULTIMAS IMPORTACIONES',
    amount: -23.7,
    balance: null,
    currency: 'EUR',
    type: 'expense',
    daySequence: 1,
    ...overrides,
  }
}

function statementAdapter(bank: string, statement: ParsedStatement): BankParserAdapter {
  return { bank, extensions: ['.csv'], parse: () => statement }
}

function productAdapter(bank: string, file: ProductFileInput): ProductParserAdapter {
  return { bank, extensions: ['.json'], parse: () => file }
}

function fundFile(name: string, date: string): ProductFileInput {
  return {
    bank: 'never-this-one',
    name,
    currency: 'EUR',
    openedAt: '2026-02-09',
    closedAt: null,
    date,
    type: 'fund',
    valuation: {
      invested: 734.6,
      marketValue: 751.18,
      gain: 16.58,
      gainPercent: 2.26,
      uninvestedCash: null,
    },
  }
}

// ── Pure rules ──────────────────────────────────────────────────────────────

describe('the rules of the last imports (feature 69)', () => {
  it('reports only jumps of more than 31 days between two different imports', () => {
    const first = new Date('2026-05-02T10:00:00.000Z')
    const second = new Date('2026-06-14T18:30:00.000Z')
    expect(
      accountGaps([
        { bookingDate: day('2026-03-03'), createdAt: first },
        // Same import, 61 days later: not a gap (R13).
        { bookingDate: day('2026-05-03'), createdAt: first },
        // Another import, 32 days later: a gap (R12).
        { bookingDate: day('2026-06-04'), createdAt: second },
      ]),
    ).toEqual([{ from: '2026-05-04', to: '2026-06-03' }])
  })

  it('joins consecutive missing months into one stretch, across a year', () => {
    expect(missingPhotoMonths([day('2025-11-30'), day('2026-03-31'), day('2026-05-29')])).toEqual([
      { from: '2025-12-01', to: '2026-02-28' },
      { from: '2026-04-01', to: '2026-04-30' },
    ])
    expect(missingPhotoMonths([])).toEqual([])
    expect(missingPhotoMonths([day('2026-04-30')])).toEqual([])
  })

  it('takes the earliest written date as the closing date of a product', () => {
    expect(closingDate({ closedAt: null, maturityDate: null })).toBeNull()
    expect(closingDate({ closedAt: day('2026-09-14'), maturityDate: day('2027-01-08') })).toEqual(
      day('2026-09-14'),
    )
    expect(closingDate({ closedAt: null, maturityDate: day('2027-01-08') })).toEqual(
      day('2027-01-08'),
    )
  })
})

// ── Against the database ────────────────────────────────────────────────────

describe('GET /api/last-imports (feature 69)', () => {
  let app: FastifyInstance
  const usedBanks: string[] = []
  let bankCounter = 0

  function uniqueBank(): string {
    bankCounter += 1
    const slug = `zz-f69-view-${Date.now()}-${bankCounter}`
    usedBanks.push(slug)
    return slug
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (usedBanks.length === 0) return
    const accounts = await app.prisma.account.findMany({ where: { bank: { in: usedBanks } } })
    const accountIds = accounts.map((account) => account.id)
    await app.prisma.importBalanceMismatch.deleteMany({ where: { accountId: { in: accountIds } } })
    await app.prisma.importUnparsedRow.deleteMany({ where: { bank: { in: usedBanks } } })
    await app.prisma.movement.deleteMany({ where: { accountId: { in: accountIds } } })
    await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } })

    const products = await app.prisma.investmentProduct.findMany({
      where: { bank: { in: usedBanks } },
    })
    const productIds = products.map((product) => product.id)
    await app.prisma.valuation.deleteMany({ where: { productId: { in: productIds } } })
    await app.prisma.savingsSnapshot.deleteMany({ where: { productId: { in: productIds } } })
    await app.prisma.investmentProduct.deleteMany({ where: { id: { in: productIds } } })
    usedBanks.length = 0
  })

  afterAll(async () => {
    await app.close()
  })

  function accountOf(response: LastImportsResponse, bank: string) {
    return response.accounts.filter((account) => account.bank === bank)
  }

  function productsOf(response: LastImportsResponse, bank: string) {
    return response.products.filter((product) => product.bank === bank)
  }

  async function createAccount(bank: string, lastImportedAt: Date | null = null) {
    return app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Cuenta inventada F69', lastImportedAt },
    })
  }

  /** Movements of one import: they all share `createdAt`, as a real file does. */
  async function seedImport(accountId: number, createdAt: string, bookingDates: string[]) {
    await app.prisma.movement.createMany({
      data: bookingDates.map((bookingDate, index) => ({
        accountId,
        type: 'expense' as const,
        amount: `-${(11.35 + index).toFixed(2)}`,
        description: `RECIBO INVENTADO F69 ${bookingDate}`,
        bookingDate: day(bookingDate),
        valueDate: day(bookingDate),
        daySequence: 1,
        createdAt: new Date(createdAt),
      })),
    })
  }

  let fundCounter = 0

  async function createFund(bank: string, data: { closedAt?: string } = {}) {
    fundCounter += 1
    return app.prisma.investmentProduct.create({
      data: {
        bank,
        name: `Fondo inventado F69 ${fundCounter}`,
        type: 'fund',
        openedAt: day('2026-02-09'),
        closedAt: data.closedAt === undefined ? null : day(data.closedAt),
      },
    })
  }

  async function createPhoto(productId: number, date: string) {
    await app.prisma.valuation.create({
      data: {
        productId,
        date: day(date),
        invested: '734.60',
        marketValue: '751.18',
        gain: '16.58',
        gainPercent: '2.2600',
      },
    })
  }

  it('answers GET /api/last-imports with asOf, accounts and products', async () => {
    const bank = uniqueBank()
    const account = await createAccount(bank)
    const fund = await createFund(bank)

    const response = await app.inject({ method: 'GET', url: '/api/last-imports' })

    expect(response.statusCode).toBe(200)
    const body = response.json<LastImportsResponse>()
    expect(Object.keys(body)).toEqual(['asOf', 'accounts', 'products'])
    expect(body.asOf).toBe(todayInMadrid())
    expect(accountOf(body, bank)).toEqual([
      {
        accountId: account.id,
        bank,
        alias: 'Cuenta inventada F69',
        dataUntil: null,
        importedAt: null,
        expectedMonthly: true,
        gaps: [],
      },
    ])
    expect(productsOf(body, bank)).toEqual([
      {
        productId: fund.id,
        bank,
        name: fund.name,
        type: 'fund',
        maturityDate: null,
        dataUntil: null,
        importedAt: null,
        expectedMonthly: true,
        gaps: [],
      },
    ])
  })

  it('shows a statement with data until its last movement and the day it was imported', async () => {
    const bank = uniqueBank()
    const result = await importStatement({
      prisma: app.prisma,
      adapter: statementAdapter(bank, {
        bank,
        accountIban: syntheticIban(),
        accountBalance: null,
        movements: [
          parsedMovement({ bookingDate: '2026-09-22', valueDate: '2026-09-22', amount: -41.9 }),
          parsedMovement({ bookingDate: '2026-10-15', valueDate: '2026-10-15' }),
          parsedMovement({
            bookingDate: '2026-10-15',
            valueDate: '2026-10-15',
            description: 'TRANSFERENCIA INVENTADA F69',
            amount: 312.45,
            type: 'income',
            daySequence: 2,
          }),
        ],
        unparsedRows: [],
      }),
      bankSlug: bank,
      file: { bank, year: '2026', name: 'extracto-octubre.csv' },
      content: Buffer.from('ignored by the fake adapter'),
      now: () => new Date('2026-11-02T10:17:00.000Z'),
    })
    expect(result.status).toBe('imported')

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    expect(accountOf(response, bank)).toMatchObject([
      { dataUntil: '2026-10-15', importedAt: '2026-11-02', expectedMonthly: true, gaps: [] },
    ])
  })

  it('keeps data until and moves the import date when a statement brings no new movements', async () => {
    const bank = uniqueBank()
    const statement: ParsedStatement = {
      bank,
      accountIban: syntheticIban(),
      accountBalance: null,
      movements: [parsedMovement({ bookingDate: '2026-08-28', valueDate: '2026-08-28' })],
      unparsedRows: [],
    }
    const importAt = (instant: string) =>
      importStatement({
        prisma: app.prisma,
        adapter: statementAdapter(bank, statement),
        bankSlug: bank,
        file: { bank, year: '2026', name: 'mismo-extracto.csv' },
        content: Buffer.from('ignored by the fake adapter'),
        now: () => new Date(instant),
      })

    await importAt('2026-09-03T08:12:00.000Z')
    const before = await getLastImports(app.prisma, day('2026-11-08'))
    const again = await importAt('2026-11-05T19:40:00.000Z')
    const after = await getLastImports(app.prisma, day('2026-11-08'))

    expect(again.status).toBe('imported')
    expect(again.imported).toBe(0)
    expect(accountOf(before, bank)).toMatchObject([
      { dataUntil: '2026-08-28', importedAt: '2026-09-03' },
    ])
    expect(accountOf(after, bank)).toMatchObject([
      { dataUntil: '2026-08-28', importedAt: '2026-11-05' },
    ])
  })

  it('shows a fund photo with its date and the day it was imported', async () => {
    const bank = uniqueBank()
    const file = fundFile('Fondo inventado con foto F69', '2026-10-14')
    const result = await importProductFile({
      prisma: app.prisma,
      adapter: productAdapter(bank, file),
      bankSlug: bank,
      fileName: 'fondo.json',
      content: Buffer.from('ignored by the fake adapter'),
      now: () => new Date('2026-10-15T07:52:00.000Z'),
    })
    expect(result.status).toBe('imported')

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    expect(productsOf(response, bank)).toMatchObject([
      {
        name: file.name,
        type: 'fund',
        maturityDate: null,
        dataUntil: '2026-10-14',
        importedAt: '2026-10-15',
        expectedMonthly: true,
        gaps: [],
      },
    ])
  })

  it('lists a live deposit as not expected every month and drops it once it matures', async () => {
    const bank = uniqueBank()
    const deposit = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Depósito inventado F69',
        type: 'deposit',
        openedAt: day('2026-03-10'),
        principal: '1250.00',
        interestRate: '2.1500',
        expectedGain: '26.88',
        maturityDate: day('2027-03-10'),
        lastImportedAt: new Date('2026-03-11T12:04:00.000Z'),
      },
    })

    const dayBefore = await getLastImports(app.prisma, day('2027-03-09'))
    const maturityDay = await getLastImports(app.prisma, day('2027-03-10'))

    expect(productsOf(dayBefore, bank)).toEqual([
      {
        productId: deposit.id,
        bank,
        name: 'Depósito inventado F69',
        type: 'deposit',
        maturityDate: '2027-03-10',
        dataUntil: null,
        importedAt: '2026-03-11',
        expectedMonthly: false,
        gaps: [],
      },
    ])
    expect(productsOf(maturityDay, bank)).toEqual([])
  })

  it('does not list a closed product', async () => {
    const bank = uniqueBank()
    const closed = await createFund(bank, { closedAt: '2026-09-30' })
    await createPhoto(closed.id, '2026-07-31')
    const closesToday = await createFund(bank, { closedAt: '2026-11-08' })
    const closesTomorrow = await createFund(bank, { closedAt: '2026-11-09' })

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    const listed = productsOf(response, bank).map((product) => product.productId)
    expect(listed).not.toContain(closed.id)
    expect(listed).not.toContain(closesToday.id)
    expect(listed).toEqual([closesTomorrow.id])
  })

  it('reports September as missing for a fund with August and October photos', async () => {
    const bank = uniqueBank()
    const fund = await createFund(bank)
    await createPhoto(fund.id, '2026-08-31')
    await createPhoto(fund.id, '2026-10-30')

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    expect(productsOf(response, bank)).toMatchObject([
      {
        productId: fund.id,
        dataUntil: '2026-10-30',
        expectedMonthly: true,
        gaps: [{ from: '2026-09-01', to: '2026-09-30' }],
      },
    ])
  })

  it('reports a gap between two statements of a current account', async () => {
    const bank = uniqueBank()
    const account = await createAccount(bank)
    await seedImport(account.id, '2026-07-04T09:00:00.000Z', ['2026-06-12', '2026-07-03'])
    // 38 days after the last movement of the previous import: a gap.
    await seedImport(account.id, '2026-08-11T09:00:00.000Z', ['2026-08-10'])
    // Exactly 31 days after: not a gap.
    await seedImport(account.id, '2026-09-11T09:00:00.000Z', ['2026-09-10'])

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    expect(accountOf(response, bank)).toMatchObject([
      {
        accountId: account.id,
        dataUntil: '2026-09-10',
        expectedMonthly: true,
        gaps: [{ from: '2026-07-04', to: '2026-08-09' }],
      },
    ])
  })

  it('does not report a quiet stretch inside one statement', async () => {
    const bank = uniqueBank()
    const account = await createAccount(bank)
    // One file with 80 days and then 46 days without movements.
    await seedImport(account.id, '2026-09-15T16:20:00.000Z', [
      '2026-04-02',
      '2026-06-21',
      '2026-08-06',
    ])

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    expect(accountOf(response, bank)).toMatchObject([{ dataUntil: '2026-08-06', gaps: [] }])
  })

  it('does not change the database when listing', async () => {
    const bank = uniqueBank()
    const account = await createAccount(bank, new Date('2026-10-04T08:00:00.000Z'))
    await seedImport(account.id, '2026-10-04T08:00:00.000Z', ['2026-08-03', '2026-10-01'])
    const fund = await createFund(bank)
    await createPhoto(fund.id, '2026-07-31')
    await createPhoto(fund.id, '2026-10-30')
    await createFund(bank, { closedAt: '2026-06-30' })

    async function photo() {
      const [accounts, movements, products, valuations, snapshots] = await Promise.all([
        app.prisma.account.aggregate({
          _count: true,
          _max: { updatedAt: true, lastImportedAt: true },
        }),
        app.prisma.movement.aggregate({ _count: true, _max: { updatedAt: true } }),
        app.prisma.investmentProduct.aggregate({
          _count: true,
          _max: { updatedAt: true, lastImportedAt: true },
        }),
        app.prisma.valuation.aggregate({ _count: true, _max: { updatedAt: true } }),
        app.prisma.savingsSnapshot.aggregate({ _count: true, _max: { updatedAt: true } }),
      ])
      return { accounts, movements, products, valuations, snapshots }
    }

    const before = await photo()
    const response = await app.inject({ method: 'GET', url: '/api/last-imports' })
    await getLastImports(app.prisma, day('2026-11-08'))
    const after = await photo()

    expect(response.statusCode).toBe(200)
    expect(after).toEqual(before)
  })

  it('serializes importedAt as the Madrid date of the stored instant', async () => {
    const bank = uniqueBank()
    // 23:30 UTC on 31 October is 00:30 of 1 November in Madrid.
    await createAccount(bank, new Date('2026-10-31T23:30:00.000Z'))
    await createAccount(bank, null)

    const response = await getLastImports(app.prisma, day('2026-11-08'))

    expect(accountOf(response, bank).map((account) => account.importedAt)).toEqual([
      '2026-11-01',
      null,
    ])
  })
})
