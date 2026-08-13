// Model tests of the investments layer (feature 9, ADR-012). This feature adds
// no endpoints, so every row is seeded with Prisma against the real PostgreSQL,
// the same pattern movements.test.ts uses for the read-only flow.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { InvestmentProductType } from '../../generated/prisma/client.js'

type ProductType = 'fund' | 'etf' | 'managed_portfolio' | 'deposit'

interface ProductInput {
  bank?: string
  name?: string
  type?: ProductType
  currency?: string
  openedAt?: Date | null
  closedAt?: Date | null
  principal?: string | null
  interestRate?: string | null
  expectedGain?: string | null
  maturityDate?: Date | null
}

interface ValuationInput {
  date?: Date
  invested?: string
  marketValue?: string
  gain?: string | null
  gainPercent?: string | null
  uninvestedCash?: string | null
}

function day(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

describe('investments model: InvestmentProduct and Valuation', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []
  const createdAccountIds: number[] = []
  let uniqueCounter = 0

  function unique(prefix: string): string {
    uniqueCounter += 1
    return `${prefix}-${Date.now()}-${uniqueCounter}-${Math.floor(Math.random() * 1_000_000)}`
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  // movement -> valuation -> investmentProduct -> account: the FKs are RESTRICT.
  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
    }
    if (createdProductIds.length > 0) {
      await app.prisma.valuation.deleteMany({ where: { productId: { in: createdProductIds } } })
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
    if (createdAccountIds.length > 0) {
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createProduct(product: ProductInput = {}) {
    const created = await app.prisma.investmentProduct.create({
      data: {
        bank: product.bank ?? 'myinvestor',
        name: product.name ?? unique('Product'),
        type: product.type ?? 'fund',
        ...(product.currency === undefined ? {} : { currency: product.currency }),
        openedAt: product.openedAt ?? null,
        closedAt: product.closedAt ?? null,
        principal: product.principal ?? null,
        interestRate: product.interestRate ?? null,
        expectedGain: product.expectedGain ?? null,
        maturityDate: product.maturityDate ?? null,
      },
    })
    createdProductIds.push(created.id)
    return created
  }

  function createValuation(productId: number, valuation: ValuationInput = {}) {
    return app.prisma.valuation.create({
      data: {
        productId,
        date: valuation.date ?? day('2026-03-31'),
        invested: valuation.invested ?? '12000.00',
        marketValue: valuation.marketValue ?? '12500.00',
        gain: valuation.gain ?? null,
        gainPercent: valuation.gainPercent ?? null,
        uninvestedCash: valuation.uninvestedCash ?? null,
      },
    })
  }

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: {
        iban: `ES${Date.now()}${(uniqueCounter += 1)}${Math.floor(Math.random() * 1_000_000)}`,
        bank: 'myinvestor',
        alias: 'Investments test account',
      },
    })
    createdAccountIds.push(account.id)
    return account
  }

  describe('the product and its four types', () => {
    it('stores every common field of a product and defaults the currency to EUR (R1)', async () => {
      const name = unique('Fondo Renta Fija Europa')

      const created = await createProduct({
        bank: 'myinvestor',
        name,
        type: 'fund',
        openedAt: day('2025-01-15'),
      })
      const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
        where: { id: created.id },
      })

      expect(stored.bank).toBe('myinvestor')
      expect(stored.name).toBe(name)
      expect(stored.type).toBe('fund')
      expect(stored.currency).toBe('EUR')
      expect(stored.openedAt?.toISOString().slice(0, 10)).toBe('2025-01-15')
      expect(stored.closedAt).toBeNull()
      expect(stored.createdAt).toBeInstanceOf(Date)
      expect(stored.updatedAt).toBeInstanceOf(Date)
    })

    it('accepts a product of each of the four types (R2)', async () => {
      const types: ProductType[] = ['fund', 'etf', 'managed_portfolio', 'deposit']

      for (const type of types) {
        const created = await createProduct({ type, name: unique(`Product ${type}`) })
        expect(created.type).toBe(type)
      }

      const stored = await app.prisma.investmentProduct.findMany({
        where: { id: { in: createdProductIds } },
      })
      expect(stored.map((product) => product.type).sort()).toEqual([...types].sort())
    })

    it('generates the enum with exactly those four values and no more (R2)', () => {
      expect(Object.keys(InvestmentProductType)).toEqual([
        'fund',
        'etf',
        'managed_portfolio',
        'deposit',
      ])
    })

    it('gives fund, etf and managed_portfolio exactly the same fields (R3)', async () => {
      const shared = {
        bank: 'myinvestor',
        currency: 'EUR',
        openedAt: day('2025-06-01'),
      }

      const fund = await createProduct({ ...shared, type: 'fund', name: unique('Same fields') })
      const etf = await createProduct({ ...shared, type: 'etf', name: unique('Same fields') })
      const portfolio = await createProduct({
        ...shared,
        type: 'managed_portfolio',
        name: unique('Same fields'),
      })

      const comparable = (product: typeof fund) => ({
        bank: product.bank,
        currency: product.currency,
        openedAt: product.openedAt?.toISOString(),
        closedAt: product.closedAt,
        principal: product.principal,
        interestRate: product.interestRate,
        expectedGain: product.expectedGain,
        maturityDate: product.maturityDate,
      })

      expect(comparable(etf)).toEqual(comparable(fund))
      expect(comparable(portfolio)).toEqual(comparable(fund))
      expect([fund.type, etf.type, portfolio.type]).toEqual(['fund', 'etf', 'managed_portfolio'])
      // A managed portfolio is ONE product with its total value: no self relation
      // to break it down into what it holds.
      expect(Object.keys(fund)).not.toContain('parentId')
      expect(Object.keys(fund)).not.toContain('parentProductId')
    })

    it('does not keep the invested capital on the product: it belongs to the snapshot (R9)', async () => {
      const fund = await createProduct({ type: 'fund' })

      expect(Object.keys(fund)).not.toContain('invested')
      expect(Object.keys(fund)).toContain('principal')
    })

    it('fills the four deposit-only columns and keeps them null on a fund (R4, R5)', async () => {
      const deposit = await createProduct({
        type: 'deposit',
        name: unique('Deposito 12M'),
        principal: '10000.00',
        interestRate: '2.7500',
        expectedGain: '275.00',
        maturityDate: day('2027-03-31'),
      })
      const fund = await createProduct({ type: 'fund', name: unique('Fondo sin deposito') })

      const storedDeposit = await app.prisma.investmentProduct.findUniqueOrThrow({
        where: { id: deposit.id },
      })
      const storedFund = await app.prisma.investmentProduct.findUniqueOrThrow({
        where: { id: fund.id },
      })

      expect(storedDeposit.principal?.toFixed(2)).toBe('10000.00')
      // APR as a percentage: 2.7500 is 2.75 %, never the 0.0275 fraction.
      expect(storedDeposit.interestRate?.toFixed(4)).toBe('2.7500')
      expect(storedDeposit.expectedGain?.toFixed(2)).toBe('275.00')
      expect(storedDeposit.maturityDate?.toISOString().slice(0, 10)).toBe('2027-03-31')

      expect(storedFund.principal).toBeNull()
      expect(storedFund.interestRate).toBeNull()
      expect(storedFund.expectedGain).toBeNull()
      expect(storedFund.maturityDate).toBeNull()
    })

    it('represents the lifecycle only with closedAt, with no status flag (R7)', async () => {
      const open = await createProduct({ name: unique('Fondo vivo') })
      const closed = await createProduct({
        name: unique('Deposito vencido'),
        type: 'deposit',
        closedAt: day('2026-02-28'),
      })

      expect(open.closedAt).toBeNull()
      expect(closed.closedAt?.toISOString().slice(0, 10)).toBe('2026-02-28')
      // No enum nor boolean derivable from the date: it would be a second source
      // of truth for the same fact.
      expect(Object.keys(open)).not.toContain('status')
      expect(Object.keys(open)).not.toContain('isClosed')
    })

    it('rejects a second product with the same (bank, name) and allows it in another bank (R6)', async () => {
      const name = unique('Cartera Indexada')
      await createProduct({ bank: 'myinvestor', name })

      await expect(createProduct({ bank: 'myinvestor', name })).rejects.toMatchObject({
        code: 'P2002',
      })

      const elsewhere = await createProduct({ bank: 'bankinter', name })
      expect(elsewhere.name).toBe(name)
      expect(await app.prisma.investmentProduct.count({ where: { name } })).toBe(2)
    })
  })

  describe('the periodic snapshot', () => {
    it('stores a full valuation and returns every number with its exact precision (R8)', async () => {
      const product = await createProduct({ type: 'fund' })

      const created = await createValuation(product.id, {
        date: day('2026-04-30'),
        invested: '8250.45',
        marketValue: '9500.60',
        gain: '1250.15',
        gainPercent: '15.1525',
        uninvestedCash: '75.25',
      })
      const stored = await app.prisma.valuation.findUniqueOrThrow({ where: { id: created.id } })

      expect(stored.productId).toBe(product.id)
      expect(stored.date.toISOString().slice(0, 10)).toBe('2026-04-30')
      expect(stored.invested.toFixed(2)).toBe('8250.45')
      expect(stored.marketValue.toFixed(2)).toBe('9500.60')
      expect(stored.gain?.toFixed(2)).toBe('1250.15')
      expect(stored.gainPercent?.toFixed(4)).toBe('15.1525')
      expect(stored.uninvestedCash?.toFixed(2)).toBe('75.25')
      expect(stored.createdAt).toBeInstanceOf(Date)
      expect(stored.updatedAt).toBeInstanceOf(Date)
    })

    it('keeps a negative gain and a negative percentage identical (R11)', async () => {
      const product = await createProduct({ type: 'etf' })

      const created = await createValuation(product.id, {
        invested: '20000.00',
        marketValue: '18765.44',
        gain: '-1234.56',
        gainPercent: '-3.4700',
      })
      const stored = await app.prisma.valuation.findUniqueOrThrow({ where: { id: created.id } })

      expect(stored.gain?.toFixed(2)).toBe('-1234.56')
      expect(stored.gainPercent?.toFixed(4)).toBe('-3.4700')
    })

    it('stores the uninvested cash as null when absent and keeps it when present (R12)', async () => {
      const withoutCash = await createProduct({ type: 'fund' })
      const withCash = await createProduct({ type: 'managed_portfolio' })

      const bare = await createValuation(withoutCash.id)
      const withValue = await createValuation(withCash.id, { uninvestedCash: '250.00' })

      expect(
        (await app.prisma.valuation.findUniqueOrThrow({ where: { id: bare.id } })).uninvestedCash,
      ).toBeNull()
      expect(
        (
          await app.prisma.valuation.findUniqueOrThrow({ where: { id: withValue.id } })
        ).uninvestedCash?.toFixed(2),
      ).toBe('250.00')
    })

    it('stores the gain as given even when it does not match marketValue - invested (R13)', async () => {
      const product = await createProduct({ type: 'fund' })

      // Rule 4: the snapshot is read, never computed. 12500.00 - 12000.00 would
      // be 500.00, but the file says 480.00 and the file wins.
      const created = await createValuation(product.id, {
        invested: '12000.00',
        marketValue: '12500.00',
        gain: '480.00',
      })
      const stored = await app.prisma.valuation.findUniqueOrThrow({ where: { id: created.id } })

      expect(stored.gain?.toFixed(2)).toBe('480.00')
      expect(stored.gain?.toFixed(2)).not.toBe('500.00')
    })

    it('leaves a missing gain and percentage as null instead of deriving them (R13)', async () => {
      const product = await createProduct({ type: 'fund' })

      const created = await createValuation(product.id, {
        invested: '12000.00',
        marketValue: '12500.00',
      })
      const stored = await app.prisma.valuation.findUniqueOrThrow({ where: { id: created.id } })

      expect(stored.gain).toBeNull()
      expect(stored.gainPercent).toBeNull()
    })

    it('keeps the three snapshots of a fund whose invested capital grows (R9, R10)', async () => {
      const product = await createProduct({ type: 'fund' })

      await createValuation(product.id, {
        date: day('2026-05-31'),
        invested: '12600.00',
        marketValue: '13050.00',
      })
      await createValuation(product.id, {
        date: day('2026-03-31'),
        invested: '12000.00',
        marketValue: '12400.00',
      })
      await createValuation(product.id, {
        date: day('2026-04-30'),
        invested: '12300.00',
        marketValue: '12690.00',
      })

      const series = await app.prisma.valuation.findMany({
        where: { productId: product.id },
        orderBy: { date: 'asc' },
      })

      expect(series).toHaveLength(3)
      expect(series.map((snapshot) => snapshot.date.toISOString().slice(0, 10))).toEqual([
        '2026-03-31',
        '2026-04-30',
        '2026-05-31',
      ])
      expect(series.map((snapshot) => snapshot.invested.toFixed(2))).toEqual([
        '12000.00',
        '12300.00',
        '12600.00',
      ])
      expect(series.map((snapshot) => snapshot.marketValue.toFixed(2))).toEqual([
        '12400.00',
        '12690.00',
        '13050.00',
      ])
    })

    it('rejects two snapshots of the same product and date, but not of two products (R14)', async () => {
      const product = await createProduct({ type: 'fund' })
      const other = await createProduct({ type: 'etf' })
      const date = day('2026-04-30')

      await createValuation(product.id, { date })

      await expect(createValuation(product.id, { date })).rejects.toMatchObject({ code: 'P2002' })

      const sameDateElsewhere = await createValuation(other.id, { date })
      expect(sameDateElsewhere.date.toISOString().slice(0, 10)).toBe('2026-04-30')
      expect(await app.prisma.valuation.count({ where: { productId: product.id } })).toBe(1)
    })

    it('overwrites the snapshot when the same file is loaded again (R15)', async () => {
      const product = await createProduct({ type: 'fund' })
      const date = day('2026-04-30')
      const first = await createValuation(product.id, {
        date,
        invested: '12300.00',
        marketValue: '12690.00',
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      const reloaded = await app.prisma.valuation.upsert({
        where: { productId_date: { productId: product.id, date } },
        create: {
          productId: product.id,
          date,
          invested: '12300.00',
          marketValue: '12750.00',
        },
        update: { marketValue: '12750.00' },
      })

      expect(reloaded.id).toBe(first.id)
      expect(reloaded.marketValue.toFixed(2)).toBe('12750.00')
      expect(reloaded.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime())
      expect(await app.prisma.valuation.count({ where: { productId: product.id } })).toBe(1)
    })
  })

  describe('link with the flow model', () => {
    it('links a movement to the product the money went to (R16)', async () => {
      const account = await createAccount()
      const product = await createProduct({ type: 'fund' })

      const created = await app.prisma.movement.create({
        data: {
          type: 'expense',
          bookingDate: day('2026-04-01'),
          valueDate: day('2026-04-01'),
          amount: '250.00',
          description: 'APORTACION FONDO',
          accountId: account.id,
          productId: product.id,
          daySequence: 1,
        },
      })

      const stored = await app.prisma.movement.findUniqueOrThrow({
        where: { id: created.id },
        include: { product: true },
      })

      expect(stored.productId).toBe(product.id)
      expect(stored.product?.name).toBe(product.name)
      expect(stored.product?.type).toBe('fund')
    })

    it('leaves productId null on a movement created the existing way (R16)', async () => {
      const account = await createAccount()

      const created = await app.prisma.movement.create({
        data: {
          type: 'expense',
          bookingDate: day('2026-04-02'),
          valueDate: day('2026-04-02'),
          amount: '34.15',
          description: 'RECIBO /Recibo GIMNASIO',
          accountId: account.id,
          daySequence: 1,
        },
      })

      const stored = await app.prisma.movement.findUniqueOrThrow({
        where: { id: created.id },
        include: { product: true },
      })

      expect(stored.productId).toBeNull()
      expect(stored.product).toBeNull()
    })
  })

  describe('known limit: a deposit with valuations', () => {
    // "A deposit has no snapshots" is a business rule watched by the service,
    // not by the database (ADR-012): a CHECK cannot look at another table and
    // would break the zero-raw-SQL of this migration. These two tests write the
    // limit down and turn red if someone adds a CHECK in silence, so the spec
    // gets updated with it.
    it('does not stop a valuation on a deposit today (R20)', async () => {
      const deposit = await createProduct({
        type: 'deposit',
        principal: '10000.00',
        interestRate: '3.0000',
      })

      const created = await createValuation(deposit.id, { date: day('2026-04-30') })

      expect(created.productId).toBe(deposit.id)
      expect(await app.prisma.valuation.count({ where: { productId: deposit.id } })).toBe(1)
    })

    it('declares no CHECK constraint on Valuation (R20, R23)', async () => {
      const checks = await app.prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conrelid = '"Valuation"'::regclass AND contype = 'c'
      `

      expect(checks).toEqual([])
    })
  })

  describe('migration applied to the database', () => {
    it('creates the InvestmentProduct and Valuation tables (R22)', async () => {
      const tables = await app.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('InvestmentProduct', 'Valuation')
        ORDER BY table_name
      `

      expect(tables.map((table) => table.table_name)).toEqual(['InvestmentProduct', 'Valuation'])
    })

    it('adds Movement.productId as a nullable column (R16, R22)', async () => {
      const columns = await app.prisma.$queryRaw<Array<{ is_nullable: string }>>`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Movement' AND column_name = 'productId'
      `

      expect(columns).toHaveLength(1)
      expect(columns[0]?.is_nullable).toBe('YES')
    })

    it('creates the three declarative indexes of this feature (R22, R23)', async () => {
      const indexes = await app.prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname IN (
          'InvestmentProduct_bank_name_key',
          'Valuation_productId_date_key',
          'Movement_productId_idx'
        )
        ORDER BY indexname
      `

      expect(indexes.map((index) => index.indexname)).toEqual([
        'InvestmentProduct_bank_name_key',
        'Movement_productId_idx',
        'Valuation_productId_date_key',
      ])
    })
  })
})
