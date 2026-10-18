// Feature 60 (R14): the migration `20261018120100_movement_category_source_backfill`
// gives `categorySource` to the movements that had a category before the column
// existed, and touches nothing else. The test runs the very `migration.sql` file
// on rows seeded in the worker's disposable database (never the human's): the
// template database already applied it once, on empty tables, so running it
// again here is what proves what it does to rows that exist.
//
// Everything here is synthetic: invented amounts and descriptions, and
// `syntheticIban()` accounts.
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
    '20261018120100_movement_category_source_backfill',
    'migration.sql',
  ),
  'utf8',
)

describe('migration 20261018120100_movement_category_source_backfill (feature 60)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  // Only what this file created: the two generic roots may already exist in the
  // worker's database (other files create them too) and are then left alone.
  const createdCategoryIds: number[] = []

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
    if (createdCategoryIds.length > 0) {
      // Children first: a parent cannot go while a subcategory points at it.
      const ids = [...createdCategoryIds].reverse()
      for (const id of ids) await app.prisma.category.delete({ where: { id } })
      createdCategoryIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Category source migration test' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function findOrCreateRoot(name: string, kind: 'expense' | 'income') {
    const existing = await app.prisma.category.findFirst({ where: { parentId: null, kind, name } })
    if (existing !== null) return existing
    const created = await app.prisma.category.create({ data: { name, kind } })
    createdCategoryIds.push(created.id)
    return created
  }

  async function createCategory(name: string, kind: 'expense' | 'income', parentId?: number) {
    const category = await app.prisma.category.create({
      data: { name, kind, parentId: parentId ?? null },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  let daySequence = 0

  function seed(
    accountId: number,
    type: 'expense' | 'income',
    amount: string,
    categoryId: number | null,
    categorySource: 'manual' | 'rule' | 'closing' | null = null,
  ) {
    daySequence += 1
    const bookingDate = new Date('2031-04-09T00:00:00.000Z')
    return app.prisma.movement.create({
      data: {
        accountId,
        type,
        amount,
        description: `SYNTHETIC CATEGORY SOURCE ROW ${daySequence}`,
        bookingDate,
        valueDate: bookingDate,
        daySequence,
        categoryId,
        categorySource,
      },
    })
  }

  it('gives closing to the generic categories and manual to every other categorized movement', async () => {
    const account = await createAccount()
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const otherExpenses = await findOrCreateRoot('Otros gastos', 'expense')
    const otherIncome = await findOrCreateRoot('Otros ingresos', 'income')
    const groceries = await createCategory(`synthetic groceries ${suffix}`, 'expense')
    // A SUBcategory with the generic name is not the generic one: only the root counts.
    const childNamedLikeGeneric = await createCategory('Otros gastos', 'expense', groceries.id)

    const genericExpense = await seed(account.id, 'expense', '41.37', otherExpenses.id)
    const genericIncome = await seed(account.id, 'income', '263.18', otherIncome.id)
    const otherCategory = await seed(account.id, 'expense', '17.64', groceries.id)
    const inChild = await seed(account.id, 'expense', '8.29', childNamedLikeGeneric.id)
    const uncategorized = await seed(account.id, 'expense', '52.06', null)
    // Already carrying a source: the file only fills NULLs, so it keeps it.
    const alreadySet = await seed(account.id, 'expense', '23.71', otherExpenses.id, 'rule')

    const seeded = [
      genericExpense,
      genericIncome,
      otherCategory,
      inChild,
      uncategorized,
      alreadySet,
    ]
    const ids = seeded.map((movement) => movement.id)
    const before = await app.prisma.movement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    })

    await app.prisma.$executeRawUnsafe(migrationSql)

    const after = await app.prisma.movement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    })
    const sourceOf = new Map(after.map((movement) => [movement.id, movement.categorySource]))

    expect(sourceOf.get(genericExpense.id)).toBe('closing')
    expect(sourceOf.get(genericIncome.id)).toBe('closing')
    expect(sourceOf.get(otherCategory.id)).toBe('manual')
    expect(sourceOf.get(inChild.id)).toBe('manual')
    expect(sourceOf.get(uncategorized.id)).toBeNull()
    expect(sourceOf.get(alreadySet.id)).toBe('rule')

    // No other column changes, `updatedAt` included: only the source is written.
    const withoutSource = ({ categorySource: _source, ...rest }: (typeof after)[number]) => rest
    expect(after.map(withoutSource)).toEqual(before.map(withoutSource))

    // Running it a second time changes nothing.
    await app.prisma.$executeRawUnsafe(migrationSql)
    const again = await app.prisma.movement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    })
    expect(again).toEqual(after)
  })
})
