// Feature 69 `last-imports`, lote A: the importer starts dating what it stores.
// `Account.lastImportedAt` is written by `importStatement` inside the file's
// transaction (R4, R5) and `InvestmentProduct.lastImportedAt` by the three
// product writers, through `importProductFile` (R6). Plus the read the module
// `last-imports` will use (`listProductsForLastImports`, R7).
//
// 🔒 Everything here is invented (ADR-017): `syntheticIban()` accounts, bank
// slugs made up per test, short amounts and made-up concepts and names. The
// statements and product files are built in code by fake adapters; no file of
// any bank is read.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import type { AppPrismaClient, TransactionClient } from '../../lib/prisma.js'
import { listProductsForLastImports } from '../investments/investments.service.js'
import type { ProductFileInput, ProductParserAdapter } from '../investments/investments.types.js'
import { importProductFile, importStatement } from './import.service.js'
import type { BankParserAdapter } from './import.types.js'

// ── Fixtures ────────────────────────────────────────────────────────────────

function movement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
  return {
    bookingDate: '2031-03-04',
    valueDate: '2031-03-04',
    description: 'COMPRA INVENTADA FECHA DE IMPORTACION',
    amount: -18.4,
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

/**
 * The real client, except that inside every transaction `<model>.<method>`
 * throws `message`: the failure happens where the writes of a statement go since
 * feature 66, and everything else is the real `tx`.
 */
function failingInsideTransaction(
  prisma: AppPrismaClient,
  model: string,
  method: string,
  message: string,
): AppPrismaClient {
  const breakTx = (tx: TransactionClient): TransactionClient => {
    const delegate = Reflect.get(tx, model) as Record<string, unknown>
    const broken = new Proxy(delegate, {
      get(target, property) {
        if (property === method) {
          return () => {
            throw new Error(message)
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value
      },
    })
    return new Proxy(tx, {
      get(target, property) {
        if (property === model) return broken
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  const transaction = (fn: (tx: TransactionClient) => Promise<unknown>, options?: unknown) =>
    prisma.$transaction((tx) => fn(breakTx(tx)), options as never)

  return new Proxy(prisma, {
    get(target, property) {
      if (property === '$transaction') return transaction
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('the importer dates what it stores (feature 69)', () => {
  let app: FastifyInstance
  const usedBanks: string[] = []
  let bankCounter = 0

  function uniqueBank(): string {
    bankCounter += 1
    const slug = `zz-f69-${Date.now()}-${bankCounter}`
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

  it('a failed statement leaves the import date as it was', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()
    const account = await app.prisma.account.create({
      data: { iban, bank, alias: 'cuenta inventada F69' },
    })
    const file = { bank, year: '2031', name: 'extracto.csv' }
    const firstImport = new Date('2031-03-05T09:41:00.000Z')

    // Arrange: the account was imported once, and that dated it (R4).
    const first = await importStatement({
      prisma: app.prisma,
      adapter: statementAdapter(bank, {
        bank,
        accountIban: iban,
        accountBalance: null,
        movements: [movement({ description: 'COMPRA INVENTADA PRIMER ARCHIVO' })],
        unparsedRows: [],
      }),
      bankSlug: bank,
      file,
      content: Buffer.from('ignored by the fake adapter'),
      now: () => firstImport,
    })
    expect(first.status).toBe('imported')
    expect(
      (await app.prisma.account.findUniqueOrThrow({ where: { id: account.id } })).lastImportedAt,
    ).toEqual(firstImport)

    // Two later files that fail inside the transaction: one at the warnings, the
    // last step before the date is written; one at the write of its movements.
    const failures = [
      {
        model: 'importUnparsedRow',
        method: 'upsert',
        message: 'la escritura del aviso ha fallado',
      },
      {
        model: 'movement',
        method: 'createMany',
        message: 'la escritura de movimientos ha fallado',
      },
    ]
    for (const [index, failure] of failures.entries()) {
      const description = `COMPRA INVENTADA ARCHIVO QUE FALLA ${index + 1}`
      const result = await importStatement({
        prisma: failingInsideTransaction(
          app.prisma,
          failure.model,
          failure.method,
          failure.message,
        ),
        adapter: statementAdapter(bank, {
          bank,
          accountIban: iban,
          accountBalance: null,
          movements: [movement({ bookingDate: '2031-04-02', description, amount: -7.35 })],
          unparsedRows: [{ row: 4, reason: 'la columna del importe viene vacía' }],
        }),
        bankSlug: bank,
        file: { ...file, name: `falla-${index + 1}.csv` },
        content: Buffer.from('ignored by the fake adapter'),
        now: () => new Date('2031-04-06T17:02:00.000Z'),
      })

      expect(result.status).toBe('failed')
      expect(result.error?.message).toBe(failure.message)
      // R5: the date is the one of the import that worked, and nothing of the
      // failed file stayed.
      const after = await app.prisma.account.findUniqueOrThrow({ where: { id: account.id } })
      expect(after.lastImportedAt).toEqual(firstImport)
      expect(await app.prisma.movement.count({ where: { description } })).toBe(0)
    }
  })

  it('dates a statement whose movements were all already stored', async () => {
    const bank = uniqueBank()
    const iban = syntheticIban()
    const statement: ParsedStatement = {
      bank,
      accountIban: iban,
      accountBalance: null,
      movements: [movement({ description: 'COMPRA INVENTADA SIN NOVEDADES' })],
      unparsedRows: [],
    }
    const importAt = (instant: string) =>
      importStatement({
        prisma: app.prisma,
        adapter: statementAdapter(bank, statement),
        bankSlug: bank,
        file: { bank, year: '2031', name: 'mismo-extracto.csv' },
        content: Buffer.from('ignored by the fake adapter'),
        now: () => new Date(instant),
      })

    const first = await importAt('2031-03-05T09:41:00.000Z')
    const again = await importAt('2031-03-19T20:13:00.000Z')

    expect(first.status).toBe('imported')
    expect(again.status).toBe('imported')
    expect(again.imported).toBe(0)
    expect(again.duplicates).toBe(1)
    // R4: also with `imported` 0 the account was imported now.
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(account.lastImportedAt).toEqual(new Date('2031-03-19T20:13:00.000Z'))
  })

  it('writes the import date of a product file', async () => {
    const bank = uniqueBank()
    const common = { bank: 'never-this-one', currency: 'EUR', closedAt: null }
    // One file per writer: `Valuation`, `SavingsSnapshot` and the deposit columns.
    const files: ProductFileInput[] = [
      {
        ...common,
        name: 'Fondo inventado F69',
        type: 'fund',
        openedAt: '2030-11-12',
        date: '2031-02-28',
        valuation: {
          invested: 412.5,
          marketValue: 431.8,
          gain: 19.3,
          gainPercent: 4.68,
          uninvestedCash: null,
        },
      },
      {
        ...common,
        name: 'Cuenta remunerada inventada F69',
        type: 'savings_account',
        openedAt: '2030-09-03',
        date: '2031-02-28',
        openingBalance: 215.4,
        moneyIn: 30.5,
        moneyOut: 12.25,
        interest: 0.47,
        balance: 234.12,
      },
      {
        ...common,
        name: 'Depósito inventado F69',
        type: 'deposit',
        openedAt: '2031-01-14',
        date: '2031-01-14',
        depositTerms: {
          principal: 615,
          interestRate: 2.35,
          expectedGain: 14.45,
          maturityDate: '2032-01-14',
        },
      },
    ]

    for (const parsed of files) {
      const importAt = (instant: string) =>
        importProductFile({
          prisma: app.prisma,
          adapter: productAdapter(bank, parsed),
          bankSlug: bank,
          fileName: 'producto.json',
          content: Buffer.from('ignored by the fake adapter'),
          now: () => new Date(instant),
        })

      const first = await importAt('2031-03-01T08:05:00.000Z')
      expect(first.status).toBe('imported')
      const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
        where: { bank_name: { bank, name: parsed.name } },
      })
      expect(stored.lastImportedAt).toEqual(new Date('2031-03-01T08:05:00.000Z'))

      // R6: the same file again moves the date too (an `update`, not a `create`).
      const again = await importAt('2031-03-22T18:47:00.000Z')
      expect(again.status).toBe('imported')
      expect(again.product?.created).toBe(false)
      const reloaded = await app.prisma.investmentProduct.findUniqueOrThrow({
        where: { id: stored.id },
      })
      expect(reloaded.lastImportedAt).toEqual(new Date('2031-03-22T18:47:00.000Z'))
    }
  })

  it('a failed product file leaves the import date as it was', async () => {
    const bank = uniqueBank()
    const fund: ProductFileInput = {
      bank: 'never-this-one',
      name: 'Fondo inventado que cambia de tipo F69',
      currency: 'EUR',
      openedAt: '2030-11-12',
      closedAt: null,
      date: '2031-02-28',
      type: 'fund',
      valuation: {
        invested: 318.2,
        marketValue: 309.6,
        gain: -8.6,
        gainPercent: -2.7,
        uninvestedCash: null,
      },
    }
    const base = {
      prisma: app.prisma,
      bankSlug: bank,
      fileName: 'producto.json',
      content: Buffer.from('ignored by the fake adapter'),
    }
    await importProductFile({
      ...base,
      adapter: productAdapter(bank, fund),
      now: () => new Date('2031-03-01T08:05:00.000Z'),
    })

    // The same product declared with another type: `upsertProduct` refuses it.
    const failed = await importProductFile({
      ...base,
      adapter: productAdapter(bank, {
        ...fund,
        type: 'savings_account',
        openingBalance: 12.5,
        moneyIn: 0,
        moneyOut: 0,
        interest: 0,
        balance: 12.5,
      } as ProductFileInput),
      now: () => new Date('2031-03-22T18:47:00.000Z'),
    })

    expect(failed.status).toBe('failed')
    const stored = await app.prisma.investmentProduct.findUniqueOrThrow({
      where: { bank_name: { bank, name: fund.name } },
    })
    expect(stored.lastImportedAt).toEqual(new Date('2031-03-01T08:05:00.000Z'))
  })

  it('lists every product with its photo dates for the last-imports view', async () => {
    const bank = uniqueBank()
    const fund = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Fondo inventado con fotos F69',
        type: 'fund',
        openedAt: new Date('2030-07-01T00:00:00.000Z'),
        lastImportedAt: new Date('2031-01-03T11:20:00.000Z'),
      },
    })
    // Stored out of order on purpose: the list comes back oldest first.
    for (const date of ['2030-10-31', '2030-08-31']) {
      await app.prisma.valuation.create({
        data: {
          productId: fund.id,
          date: new Date(`${date}T00:00:00.000Z`),
          invested: '205.40',
          marketValue: '211.70',
          gain: '6.30',
          gainPercent: '3.0700',
        },
      })
    }
    const savings = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Cuenta remunerada inventada con fotos F69',
        type: 'savings_account',
        closedAt: new Date('2031-02-01T00:00:00.000Z'),
      },
    })
    await app.prisma.savingsSnapshot.create({
      data: {
        productId: savings.id,
        date: new Date('2030-12-31T00:00:00.000Z'),
        openingBalance: '84.20',
        moneyIn: '15.50',
        moneyOut: '0.00',
        interest: '0.13',
        balance: '99.83',
      },
    })
    const deposit = await app.prisma.investmentProduct.create({
      data: {
        bank,
        name: 'Depósito inventado sin fotos F69',
        type: 'deposit',
        principal: '730.00',
        interestRate: '2.4500',
        expectedGain: '17.89',
        maturityDate: new Date('2032-05-17T00:00:00.000Z'),
      },
    })

    const listed = (await listProductsForLastImports(app.prisma)).filter(
      (product) => product.bank === bank,
    )

    // Every product of the bank, closed one included (the module decides which
    // are live), ordered by name.
    expect(listed).toEqual([
      {
        id: savings.id,
        bank,
        name: 'Cuenta remunerada inventada con fotos F69',
        type: 'savings_account',
        closedAt: new Date('2031-02-01T00:00:00.000Z'),
        maturityDate: null,
        lastImportedAt: null,
        photoDates: [new Date('2030-12-31T00:00:00.000Z')],
      },
      {
        id: deposit.id,
        bank,
        name: 'Depósito inventado sin fotos F69',
        type: 'deposit',
        closedAt: null,
        maturityDate: new Date('2032-05-17T00:00:00.000Z'),
        lastImportedAt: null,
        photoDates: [],
      },
      {
        id: fund.id,
        bank,
        name: 'Fondo inventado con fotos F69',
        type: 'fund',
        closedAt: null,
        maturityDate: null,
        lastImportedAt: new Date('2031-01-03T11:20:00.000Z'),
        photoDates: [new Date('2030-08-31T00:00:00.000Z'), new Date('2030-10-31T00:00:00.000Z')],
      },
    ])
  })
})
