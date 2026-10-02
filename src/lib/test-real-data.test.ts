// Tests of the reader the privacy guardian gets its reference from (feature 51).
//
// They run against the THROWAWAY database of this worker, seeded with invented
// rows that are deleted when the file ends. The human's database is never
// opened here: only `vitest.global-setup.ts` does that.
import { readFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'
import { syntheticIban } from './iban.fixture.js'
import { withDatabase } from './test-db.js'
import {
  comparedColumns,
  notComparedColumns,
  readRealDataReference,
  withReadOnlyClient,
} from './test-real-data.js'

/** The database THIS worker was pointed at by vitest.setup.ts. */
const workerDatabaseUrl = process.env.DATABASE_URL ?? ''

function day(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

describe('the reader of the compared columns', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.prisma.importBalanceMismatch.deleteMany()
    await app.prisma.importUnparsedRow.deleteMany()
    await app.prisma.savingsSnapshot.deleteMany()
    await app.prisma.valuation.deleteMany()
    await app.prisma.movement.deleteMany()
    await app.prisma.investmentProduct.deleteMany()
    await app.prisma.categoryRule.deleteMany()
    await app.prisma.category.deleteMany()
    await app.prisma.account.deleteMany()
    await app.close()
  })

  it('reads the compared columns of a database', async () => {
    const iban = syntheticIban()
    // Stored as a person would type it: the reader hands it over normalized.
    const typedIban = (iban.match(/.{1,4}/g) ?? []).join(' ').toLowerCase()
    const unparsedReason = 'fecha no reconocida: recibido "31-02 VENTOLERA LEVANTE"'

    const account = await app.prisma.account.create({
      data: {
        iban: typedIban,
        bank: 'zz-banco-levante',
        alias: 'Cuenta Ventolera Diaria',
        initialBalance: '318.47',
        balanceAnchor: '2764.19',
        balanceAnchorDate: day('2026-03-14'),
      },
    })
    const category = await app.prisma.category.create({
      data: { name: 'Zz Mercado Semanal', kind: 'expense' },
    })
    await app.prisma.categoryRule.create({
      data: { categoryId: category.id, matchText: 'fruteria la garbinada' },
    })
    await app.prisma.movement.create({
      data: {
        type: 'expense',
        bookingDate: day('2026-03-14'),
        valueDate: day('2026-03-14'),
        amount: '-57.83',
        balanceAfter: '2706.36',
        description: 'COMPRA FRUTERIA LA GARBINADA',
        note: 'Pedido grande de Pascua',
        transferId: 'zz-transfer-identifier',
        undoneTransferId: 'zz-undone-identifier',
        accountId: account.id,
        daySequence: 1,
      },
    })
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'zz-banco-levante',
        name: 'Plazo Garbinada Trimestral',
        type: 'deposit',
        principal: '6183.25',
        interestRate: '2.8375',
        expectedGain: '43.87',
      },
    })
    await app.prisma.valuation.create({
      data: {
        productId: product.id,
        date: day('2026-03-31'),
        invested: '6183.25',
        marketValue: '6297.14',
        gain: '113.89',
        gainPercent: '1.8419',
        uninvestedCash: '12.06',
      },
    })
    await app.prisma.savingsSnapshot.create({
      data: {
        productId: product.id,
        date: day('2026-03-31'),
        openingBalance: '1873.44',
        moneyIn: '260.15',
        moneyOut: '94.38',
        interest: '3.71',
        balance: '2042.92',
      },
    })
    await app.prisma.importUnparsedRow.create({
      data: {
        bank: 'zz-banco-levante',
        year: '2026',
        fileName: 'zz-extracto-marzo.csv',
        rowNumber: 7,
        reason: unparsedReason,
      },
    })
    await app.prisma.importBalanceMismatch.create({
      data: {
        bank: 'zz-banco-levante',
        year: '2026',
        fileName: 'zz-extracto-marzo.csv',
        accountId: account.id,
        bookingDate: day('2026-03-14'),
        check: 'per-line',
        computed: '2706.36',
        fromFile: '2709.51',
        note: 'Revisado con el extracto de papel',
      },
    })

    const reference = await readRealDataReference(workerDatabaseUrl)

    // Every value in its own list, as the decimal text PostgreSQL gives, and
    // each distinct value once (two columns share 6183.25 and 2706.36).
    expect([...reference.amounts].sort()).toEqual(
      [
        '-57.83',
        '2706.36',
        '318.47',
        '2764.19',
        '6183.25',
        '2.8375',
        '43.87',
        '6297.14',
        '113.89',
        '1.8419',
        '12.06',
        '1873.44',
        '260.15',
        '94.38',
        '3.71',
        '2042.92',
        '2709.51',
      ].sort(),
    )
    expect([...reference.texts].sort()).toEqual(
      [
        'COMPRA FRUTERIA LA GARBINADA',
        'Pedido grande de Pascua',
        'Plazo Garbinada Trimestral',
        'Cuenta Ventolera Diaria',
        'fruteria la garbinada',
        'Revisado con el extracto de papel',
      ].sort(),
    )
    expect(reference.ownMessages).toEqual([unparsedReason])
    expect(reference.ibans).toEqual([iban])

    // What sits in a NOT compared column is not handed over at all.
    const everything = [
      ...reference.amounts,
      ...reference.texts,
      ...reference.ownMessages,
      ...reference.ibans,
    ]
    for (const notCompared of [
      'Zz Mercado Semanal',
      'compra fruteria la garbinada',
      'zz-transfer-identifier',
      'zz-undone-identifier',
      'EUR',
      'zz-banco-levante',
      '2026',
      'zz-extracto-marzo.csv',
      'per-line',
    ]) {
      expect(everything).not.toContain(notCompared)
    }
  })

  it('rejects a write through the read-only connection', async () => {
    const before = await app.prisma.category.count({ where: { name: 'Zz Escritura Rechazada' } })

    const attempt = withReadOnlyClient(workerDatabaseUrl, (client) =>
      client.query(`insert into "Category" ("name", "kind") values ($1, 'expense')`, [
        'Zz Escritura Rechazada',
      ]),
    )

    // 25006 = read_only_sql_transaction: PostgreSQL itself refuses.
    await expect(attempt).rejects.toMatchObject({ code: '25006' })
    expect(before).toBe(0)
    expect(await app.prisma.category.count({ where: { name: 'Zz Escritura Rechazada' } })).toBe(0)
  })

  it('reads an empty reference from a database with no application tables', async () => {
    const reference = await readRealDataReference(withDatabase(workerDatabaseUrl, 'postgres'))

    expect(reference).toEqual({ amounts: [], texts: [], ownMessages: [], ibans: [] })
  })
})

/** Every `Decimal` and `String` column of the schema, as `{ table, column, type }`. */
function moneyAndTextColumns(): Array<{ table: string; column: string; type: string }> {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  const columns: Array<{ table: string; column: string; type: string }> = []
  let table: string | null = null
  for (const line of schema.split(/\r?\n/)) {
    const model = line.match(/^model\s+(\w+)\s*\{/)
    if (model) {
      table = model[1] ?? null
    } else if (line.startsWith('}')) {
      table = null
    } else if (table) {
      const field = line.match(/^\s+(\w+)\s+(Decimal|String)\??(?:\s|$)/)
      if (field) columns.push({ table, column: field[1] ?? '', type: field[2] ?? '' })
    }
  }
  return columns
}

describe('the inventory of compared and not compared columns', () => {
  it('holds the inventory of money and text columns EXACTLY, so a new column turns it red', () => {
    const key = (entry: { table: string; column: string }) => `${entry.table}.${entry.column}`
    const inSchema = moneyAndTextColumns()
    const compared = comparedColumns.map(key)
    const notCompared = notComparedColumns.map(key)
    const decided = [...compared, ...notCompared]

    // The parser of the schema does find them: an empty list would pass everything.
    expect(inSchema.length).toBeGreaterThan(30)

    // Both directions: a new column nobody decided about fails here by its name,
    // and an entry about a column that no longer exists fails too.
    expect(inSchema.map(key).filter((column) => !decided.includes(column))).toEqual([])
    expect(decided.filter((column) => !inSchema.map(key).includes(column))).toEqual([])
    // Decided once: in one list or in the other.
    expect(new Set(decided).size).toBe(decided.length)

    // Every money column is compared, and as an amount; no text column is.
    const decimals = inSchema.filter((column) => column.type === 'Decimal').map(key)
    const asAmount = comparedColumns.filter((column) => column.kind === 'amount').map(key)
    expect([...asAmount].sort()).toEqual([...decimals].sort())

    expect(notComparedColumns.filter((column) => column.reason.trim().length === 0)).toEqual([])
  })
})
