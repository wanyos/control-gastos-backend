// Feature 57 (R14): the migration `20261016120000_deposit_movements_unmark`
// takes the `excludedFromTotals` mark off the deposit movements of MyInvestor
// accounts and touches nothing else. The test runs the very `migration.sql`
// file on rows seeded in the worker's disposable database (never the human's):
// the template database already applied it once, on empty tables, so running it
// again here is what proves what it does to rows that exist.
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
    '20261016120000_deposit_movements_unmark',
    'migration.sql',
  ),
  'utf8',
)

describe('migration 20261016120000_deposit_movements_unmark (feature 57)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount(bank: string) {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank, alias: 'Deposit unmark migration test' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  let daySequence = 0

  function seedMarked(
    accountId: number,
    type: 'expense' | 'income',
    amount: string,
    description: string,
  ) {
    daySequence += 1
    const bookingDate = new Date('2026-03-17T00:00:00.000Z')
    return app.prisma.movement.create({
      data: {
        accountId,
        type,
        amount,
        description,
        bookingDate,
        valueDate: bookingDate,
        daySequence,
        excludedFromTotals: true,
      },
    })
  }

  it('the deposit unmark migration unmarks the deposit movements and leaves any other mark', async () => {
    const myinvestor = await createAccount('myinvestor')
    const otherBank = await createAccount('bankinter')

    // The three kinds of deposit movement, marked. The cancellation carries
    // leading spaces: the prefixes are read after them.
    const opening = await seedMarked(
      myinvestor.id,
      'expense',
      '3175.40',
      'APERTURA DEP 0417 PRUEBA SINTETICA',
    )
    const cancellation = await seedMarked(
      myinvestor.id,
      'income',
      '1268.55',
      '   CANCELACION DEP 0418 PRUEBA SINTETICA',
    )
    const maturity = await seedMarked(
      myinvestor.id,
      'income',
      '3192.87',
      'INTERESES DEP 0417 PRUEBA SINTETICA',
    )

    // Marked rows that must keep their mark:
    // - a movement of the same account that is not a deposit one;
    const notDeposit = await seedMarked(
      myinvestor.id,
      'expense',
      '58.23',
      'RECIBO SINTETICO DE PRUEBA',
    )
    // - an opening text with the wrong type (an opening is an expense);
    const wrongType = await seedMarked(
      myinvestor.id,
      'income',
      '742.16',
      'APERTURA DEP 0419 PRUEBA SINTETICA',
    )
    // - a deposit text in an account of another bank.
    const otherBankDeposit = await seedMarked(
      otherBank.id,
      'income',
      '2214.09',
      'INTERESES DEP 0420 PRUEBA SINTETICA',
    )

    const seeded = [opening, cancellation, maturity, notDeposit, wrongType, otherBankDeposit]
    const before = await app.prisma.movement.findMany({
      where: { id: { in: seeded.map((movement) => movement.id) } },
      orderBy: { id: 'asc' },
    })

    await app.prisma.$executeRawUnsafe(migrationSql)

    const after = await app.prisma.movement.findMany({
      where: { id: { in: seeded.map((movement) => movement.id) } },
      orderBy: { id: 'asc' },
    })
    const markOf = new Map(after.map((movement) => [movement.id, movement.excludedFromTotals]))

    expect(markOf.get(opening.id)).toBe(false)
    expect(markOf.get(cancellation.id)).toBe(false)
    expect(markOf.get(maturity.id)).toBe(false)
    expect(markOf.get(notDeposit.id)).toBe(true)
    expect(markOf.get(wrongType.id)).toBe(true)
    expect(markOf.get(otherBankDeposit.id)).toBe(true)

    // No other column changes, `updatedAt` included: only the mark moves.
    const withoutMark = ({ excludedFromTotals: _mark, ...rest }: (typeof after)[number]) => rest
    expect(after.map(withoutMark)).toEqual(before.map(withoutMark))
  })
})
