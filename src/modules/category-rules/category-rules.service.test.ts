// Feature 43 `auto-categorization`: the matching convention (R6), the
// categorization run (R7, R8, R9, R10, R11, R14) and the starting-rules
// seeding (R15, R2).
//
// 🔒 Everything here is synthetic: invented descriptions and amounts,
// `syntheticIban()` accounts and unique category names, in the throwaway
// test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { defaultCategories, seedDefaultCategories } from '../categories/categories.seed.js'
import { defaultCategoryRules, seedDefaultCategoryRules } from './category-rules.seed.js'
import { applyCategoryRules, normalizeForMatch } from './category-rules.service.js'

describe('normalizeForMatch (R6)', () => {
  it('lowercases, removes diacritics and trims', () => {
    expect(normalizeForMatch('  CAFÉ Añejo  ')).toBe('cafe anejo')
    expect(normalizeForMatch('MERCADONA')).toBe('mercadona')
    expect(normalizeForMatch('Telefonía')).toBe('telefonia')
  })

  it('leaves an already normalized text untouched', () => {
    expect(normalizeForMatch('bizum')).toBe('bizum')
  })
})

describe('applyCategoryRules', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []
  const createdRuleIds: number[] = []
  let uniqueCounter = 0

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.categoryRule.deleteMany({ where: { id: { in: createdRuleIds } } })
    await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
    await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
    await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
    createdRuleIds.length = 0
    createdAccountIds.length = 0
    createdCategoryIds.length = 0
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Rules service test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(kind: 'expense' | 'income', name?: string) {
    uniqueCounter += 1
    const category = await app.prisma.category.create({
      data: { name: name ?? `Rules test ${Date.now()}-${uniqueCounter}`, kind },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  async function createRule(categoryId: number, matchText: string) {
    const rule = await app.prisma.categoryRule.create({ data: { categoryId, matchText } })
    createdRuleIds.push(rule.id)
    return rule
  }

  interface SeedMovement {
    accountId: number
    description: string
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    status?: 'confirmed' | 'pending_review'
    categoryId?: number | null
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date('2032-04-10T00:00:00.000Z')
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount ?? '27.43',
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
        status: movement.status ?? 'pending_review',
        categoryId: movement.categoryId ?? null,
      },
    })
  }

  it('assigns the category when the rules that match point at exactly one (R6, R7)', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    await createRule(category.id, 'sintetico mercado')
    // Capitals and accents in the description must not keep the rule from matching.
    const movement = await seedMovement({
      accountId: account.id,
      description: 'COMPRA SINTÉTICO MERCADO 42',
    })

    const result = await applyCategoryRules(app.prisma)

    expect(result.categorized).toBe(1)
    expect(result.error).toBeUndefined()
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBe(category.id)
  })

  it('never matches a rule whose category kind differs from the movement type (R6)', async () => {
    const account = await createAccount()
    const incomeCategory = await createCategory('income')
    await createRule(incomeCategory.id, 'sintetico cruzado')
    const movement = await seedMovement({
      accountId: account.id,
      description: 'SINTETICO CRUZADO GASTO',
      type: 'expense',
    })

    const result = await applyCategoryRules(app.prisma)

    expect(result.categorized).toBe(0)
    expect(result.unmatched).toBeGreaterThanOrEqual(1)
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBeNull()
  })

  it('touches nothing already categorized, confirmed or neutral (R8)', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    const otherCategory = await createCategory('expense')
    await createRule(category.id, 'sintetico protegido')

    const categorized = await seedMovement({
      accountId: account.id,
      description: 'SINTETICO PROTEGIDO YA CATEGORIZADO',
      categoryId: otherCategory.id,
    })
    const confirmed = await seedMovement({
      accountId: account.id,
      description: 'SINTETICO PROTEGIDO CONFIRMADO',
      status: 'confirmed',
    })
    const neutral = await seedMovement({
      accountId: account.id,
      description: 'SINTETICO PROTEGIDO NEUTRO',
      type: 'neutral',
      amount: '0.00',
    })

    const result = await applyCategoryRules(app.prisma)

    expect(result.categorized).toBe(0)
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [categorized.id, confirmed.id, neutral.id] } },
      orderBy: { id: 'asc' },
    })
    expect(rows.map((row) => row.categoryId)).toEqual([otherCategory.id, null, null])
    expect(rows.map((row) => row.status)).toEqual(['pending_review', 'confirmed', 'pending_review'])
  })

  it('assigns nothing on a conflict of two categories and lists it in the result (R9, R10)', async () => {
    const account = await createAccount()
    const first = await createCategory('expense')
    const second = await createCategory('expense')
    const firstRule = await createRule(first.id, 'sintetico choque uno')
    const secondRule = await createRule(second.id, 'choque uno')

    const movement = await seedMovement({
      accountId: account.id,
      description: 'PAGO SINTETICO CHOQUE UNO',
    })

    const result = await applyCategoryRules(app.prisma)

    expect(result.categorized).toBe(0)
    expect(result.conflictCount).toBe(1)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      movementId: movement.id,
      description: 'PAGO SINTETICO CHOQUE UNO',
      bookingDate: '2032-04-10',
    })
    expect(result.conflicts[0]?.matches.map((match) => match.ruleId).sort()).toEqual(
      [firstRule.id, secondRule.id].sort(),
    )
    expect(result.conflicts[0]?.matches.map((match) => match.categoryName)).toContain(first.name)
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBeNull()
  })

  it('treats two matching rules of the SAME category as agreement, not conflict (R7, R9)', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    await createRule(category.id, 'sintetico acuerdo')
    await createRule(category.id, 'acuerdo total')
    const movement = await seedMovement({
      accountId: account.id,
      description: 'SINTETICO ACUERDO TOTAL',
    })

    const result = await applyCategoryRules(app.prisma)

    expect(result.categorized).toBe(1)
    expect(result.conflictCount).toBe(0)
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBe(category.id)
  })

  it('counts the eligible movement no rule matches, and leaves it NULL (R9, R10)', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    await createRule(category.id, 'sintetico sin par')
    const movement = await seedMovement({
      accountId: account.id,
      description: 'CONCEPTO QUE NADIE RECONOCE',
    })

    const result = await applyCategoryRules(app.prisma)

    expect(result.categorized).toBe(0)
    expect(result.unmatched).toBeGreaterThanOrEqual(1)
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBeNull()
  })

  it('categorizes 0 on a second run and leaves the rows identical (R11)', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    await createRule(category.id, 'sintetico repetible')
    await seedMovement({ accountId: account.id, description: 'SINTETICO REPETIBLE 1' })
    await seedMovement({ accountId: account.id, description: 'SINTETICO REPETIBLE 2' })

    const first = await applyCategoryRules(app.prisma)
    expect(first.categorized).toBe(2)
    const afterFirst = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })

    const second = await applyCategoryRules(app.prisma)

    expect(second.categorized).toBe(0)
    // Identical INCLUDING updatedAt: the second run wrote nothing at all.
    const afterSecond = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
    })
    expect(afterSecond).toEqual(afterFirst)
  })

  it('writes ONLY categoryId: full row and period totals identical otherwise (R14)', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    await createRule(category.id, 'sintetico intacto')
    const movement = await seedMovement({
      accountId: account.id,
      description: 'SINTETICO INTACTO 88',
      amount: '88.20',
    })
    await seedMovement({
      accountId: account.id,
      description: 'OTRO GASTO SIN REGLA',
      amount: '11.80',
    })

    const before = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    const totalsBefore = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${account.id}`,
    })
    expect(totalsBefore.json().totals).toEqual({
      income: '0.00',
      expense: '100.00',
      net: '-100.00',
    })

    const result = await applyCategoryRules(app.prisma)
    expect(result.categorized).toBe(1)

    const after = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(after.categoryId).toBe(category.id)
    // Everything but categoryId (and the automatic updatedAt) is byte-identical.
    const { categoryId: _b, updatedAt: _bu, ...beforeRest } = before
    const { categoryId: _a, updatedAt: _au, ...afterRest } = after
    expect(afterRest).toEqual(beforeRest)

    const totalsAfter = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${account.id}`,
    })
    expect(totalsAfter.json().totals).toEqual({
      income: '0.00',
      expense: '100.00',
      net: '-100.00',
    })
  })

  it('never throws: a failing read comes back inside result.error (R12)', async () => {
    const failing = new Proxy(app.prisma, {
      get(target, property) {
        if (property === 'categoryRule') {
          return {
            findMany: () => {
              throw new Error('synthetic categorization failure')
            },
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as AppPrismaClient

    const result = await applyCategoryRules(failing)

    expect(result).toEqual({
      categorized: 0,
      conflictCount: 0,
      conflicts: [],
      unmatched: 0,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'synthetic categorization failure' },
    })
  })
})

describe('seeding of the starting rules (R15, R2)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.categoryRule.deleteMany({
      where: { matchText: { in: defaultCategoryRules.map((rule) => rule.matchText) } },
    })
    await app.prisma.category.deleteMany({
      where: { parentId: null, OR: defaultCategories.map((category) => ({ ...category })) },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it('every draft rule is normalized, unique, at least 3 chars and points at a known category (R2)', () => {
    const texts = defaultCategoryRules.map((rule) => rule.matchText)
    expect(new Set(texts).size).toBe(texts.length)
    for (const rule of defaultCategoryRules) {
      expect(rule.matchText).toBe(normalizeForMatch(rule.matchText))
      expect(rule.matchText.length).toBeGreaterThanOrEqual(3)
      // One or two words only: never a literal multi-word statement concept.
      expect(rule.matchText.split(' ').length).toBeLessThanOrEqual(2)
      expect(
        defaultCategories.some(
          (category) => category.name === rule.categoryName && category.kind === rule.kind,
        ),
      ).toBe(true)
    }
  })

  it('creates the whole draft on a base with the 16 categories, and 0 on a second run (R15)', async () => {
    await seedDefaultCategories(app.prisma)

    const first = await seedDefaultCategoryRules(app.prisma)

    expect(first).toEqual({
      created: defaultCategoryRules.length,
      skipped: 0,
      missingCategories: [],
    })

    const second = await seedDefaultCategoryRules(app.prisma)

    expect(second).toEqual({
      created: 0,
      skipped: defaultCategoryRules.length,
      missingCategories: [],
    })
  })

  it('skips and reports the rules of a category that no longer exists (R15)', async () => {
    await seedDefaultCategories(app.prisma)
    // The human renamed a seeded category: its old name is gone.
    await app.prisma.category.deleteMany({
      where: { name: 'Ocio', kind: 'expense', parentId: null },
    })
    const orphaned = defaultCategoryRules.filter((rule) => rule.categoryName === 'Ocio')
    expect(orphaned.length).toBeGreaterThan(0)

    const result = await seedDefaultCategoryRules(app.prisma)

    expect(result).toEqual({
      created: defaultCategoryRules.length - orphaned.length,
      skipped: 0,
      missingCategories: ['Ocio'],
    })
    expect(
      await app.prisma.categoryRule.count({
        where: { matchText: { in: orphaned.map((rule) => rule.matchText) } },
      }),
    ).toBe(0)
  })
})
