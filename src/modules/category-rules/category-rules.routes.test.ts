// Feature 43 `auto-categorization`, HTTP layer: the CRUD of the rules
// (R1, R2, R3, R4, R5) and the on-demand categorization run (R13). Feature 56
// `categorized-movements-list`: the list of categorized movements in its answer.
// Feature 60 `category-origin-and-rule-reapply`: creating or changing a rule
// runs the rules over the pending movements and the closing ones (R7–R11).
// Feature 61 `rule-suggestions`: the preview of a rule (R10, R11) and that
// neither the preview nor the suggestions write anything (R12).
//
// 🔒 Everything here is synthetic: invented match texts, unique category
// names and `syntheticIban()` accounts, in the throwaway test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'

describe('/api/category-rules (F43)', () => {
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
    await app.prisma.categoryRule.deleteMany({
      where: { categoryId: { in: createdCategoryIds } },
    })
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

  async function createCategory(kind: 'expense' | 'income' = 'expense') {
    uniqueCounter += 1
    const category = await app.prisma.category.create({
      data: { name: `Rules route test ${Date.now()}-${uniqueCounter}`, kind },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  function uniqueText(base: string): string {
    uniqueCounter += 1
    return `${base} ${Date.now()}${uniqueCounter}`
  }

  async function postRule(payload: object) {
    const response = await app.inject({ method: 'POST', url: '/api/category-rules', payload })
    if (response.statusCode === 201) createdRuleIds.push(response.json().id)
    return response
  }

  it('creates a rule with 201, normalized matchText and its category embedded (R1)', async () => {
    const category = await createCategory('expense')
    const raw = uniqueText('  SÍNTESIS Alta ')

    const response = await postRule({ categoryId: category.id, matchText: raw })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.matchText).toBe(
      raw
        .normalize('NFD')
        .replace(/\p{Mn}/gu, '')
        .toLowerCase()
        .trim(),
    )
    expect(body.categoryId).toBe(category.id)
    expect(body.category).toMatchObject({
      id: category.id,
      name: category.name,
      kind: 'expense',
      parentId: null,
    })
    const stored = await app.prisma.categoryRule.findUniqueOrThrow({ where: { id: body.id } })
    expect(stored.matchText).toBe(body.matchText)
  })

  it('rejects a category that does not exist with 404, writing nothing (R2)', async () => {
    const response = await postRule({ categoryId: 999_999_431, matchText: 'sintetico sin dueno' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(
      await app.prisma.categoryRule.count({ where: { matchText: 'sintetico sin dueno' } }),
    ).toBe(0)
  })

  it('rejects a matchText shorter than 3 chars AFTER normalizing, with 400 (R2)', async () => {
    const category = await createCategory('expense')

    // '  Á ' normalizes to 'a': one character, however long the raw text is.
    const response = await postRule({ categoryId: category.id, matchText: '  Á ' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('rejects a matchText that normalized already exists, with 409 (R2)', async () => {
    const category = await createCategory('expense')
    const text = uniqueText('sintetico repetido')
    await postRule({ categoryId: category.id, matchText: text })

    // Same text with capitals and an accent: normalization makes it the same rule.
    const response = await postRule({
      categoryId: category.id,
      matchText: text.toUpperCase().replace('E', 'É'),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  })

  it('rejects an unknown body property with 400, never a 201 that ignored it (R1, R2)', async () => {
    const category = await createCategory('expense')

    const response = await postRule({
      categoryId: category.id,
      matchText: 'sintetico extra',
      priority: 7,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(await app.prisma.categoryRule.count({ where: { matchText: 'sintetico extra' } })).toBe(0)
  })

  it('lists every rule with its category embedded (R3)', async () => {
    const category = await createCategory('income')
    const text = uniqueText('sintetico listado')
    const created = await postRule({ categoryId: category.id, matchText: text })

    const response = await app.inject({ method: 'GET', url: '/api/category-rules' })

    expect(response.statusCode).toBe(200)
    const rules = response.json() as Array<{ id: number; category: { name: string } }>
    const mine = rules.find((rule) => rule.id === created.json().id)
    expect(mine).toMatchObject({
      matchText: created.json().matchText,
      categoryId: category.id,
      category: { id: category.id, name: category.name, kind: 'income' },
    })
  })

  it('updates only what travels: matchText alone, then categoryId alone (R4)', async () => {
    const category = await createCategory('expense')
    const other = await createCategory('expense')
    const created = await postRule({
      categoryId: category.id,
      matchText: uniqueText('sintetico parcheado'),
    })
    const id = created.json().id

    const textPatch = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${id}`,
      payload: { matchText: uniqueText('  SINTETICO Corregido ') },
    })
    expect(textPatch.statusCode).toBe(200)
    expect(textPatch.json().matchText).toMatch(/^sintetico corregido /)
    expect(textPatch.json().categoryId).toBe(category.id)

    const categoryPatch = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${id}`,
      payload: { categoryId: other.id },
    })
    expect(categoryPatch.statusCode).toBe(200)
    expect(categoryPatch.json().categoryId).toBe(other.id)
    expect(categoryPatch.json().matchText).toBe(textPatch.json().matchText)
    expect(categoryPatch.json().category).toMatchObject({ id: other.id, name: other.name })
  })

  it('rejects an empty PATCH body and an unknown property with 400 (R4)', async () => {
    const category = await createCategory('expense')
    const created = await postRule({
      categoryId: category.id,
      matchText: uniqueText('sintetico vacio'),
    })
    const id = created.json().id

    for (const payload of [{}, { kind: 'income' }]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/category-rules/${id}`,
        payload,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
  })

  it('applies the alta validations on PATCH: 404 rule, 404 category, 400 short, 409 dup (R2, R4)', async () => {
    const category = await createCategory('expense')
    const first = await postRule({ categoryId: category.id, matchText: uniqueText('sintetico a') })
    const second = await postRule({ categoryId: category.id, matchText: uniqueText('sintetico b') })
    const secondId = second.json().id

    const missingRule = await app.inject({
      method: 'PATCH',
      url: '/api/category-rules/999999431',
      payload: { matchText: 'da igual que sea largo' },
    })
    expect(missingRule.statusCode).toBe(404)

    const missingCategory = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${secondId}`,
      payload: { categoryId: 999_999_431 },
    })
    expect(missingCategory.statusCode).toBe(404)

    const tooShort = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${secondId}`,
      payload: { matchText: ' xy ' },
    })
    expect(tooShort.statusCode).toBe(400)

    const duplicated = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${secondId}`,
      payload: { matchText: first.json().matchText },
    })
    expect(duplicated.statusCode).toBe(409)
  })

  it('deletes a rule with 204 without un-categorizing any movement (R5)', async () => {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Rules route delete account' },
    })
    createdAccountIds.push(account.id)
    const category = await createCategory('expense')
    const created = await postRule({
      categoryId: category.id,
      matchText: uniqueText('sintetico borrable'),
    })
    const bookingDate = new Date('2032-05-02T00:00:00.000Z')
    const movement = await app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: '15.90',
        description: 'MOVIMIENTO CATEGORIZADO POR LA REGLA',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
        categoryId: category.id,
      },
    })

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/category-rules/${created.json().id}`,
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(await app.prisma.categoryRule.count({ where: { id: created.json().id } })).toBe(0)
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBe(category.id)
  })

  it('answers 404 on deleting a rule that does not exist (R2)', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/category-rules/999999431',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('runs the categorization on demand and answers 200 with its result (R13)', async () => {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Rules route apply account' },
    })
    createdAccountIds.push(account.id)
    const category = await createCategory('expense')
    await postRule({ categoryId: category.id, matchText: 'sintetico bajo demanda' })
    const bookingDate = new Date('2032-05-03T00:00:00.000Z')
    const movement = await app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: '9.99',
        description: 'PAGO SINTETICO BAJO DEMANDA',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
      },
    })

    const response = await app.inject({ method: 'POST', url: '/api/category-rules/apply' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.categorized).toBe(1)
    expect(body.conflictCount).toBe(0)
    expect(body.conflicts).toEqual([])
    expect(typeof body.unmatched).toBe('number')
    expect(body).not.toHaveProperty('error')
    const stored = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(stored.categoryId).toBe(category.id)
  })

  // ── Feature 56: the answer says WHICH movements the run categorized ──────

  interface ListedMovement {
    movementId: number
    categoryId: number
  }

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Rules route list account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  function seedPending(accountId: number, description: string, amount: string, day: string) {
    const bookingDate = new Date(`${day}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId,
        type: 'expense',
        amount,
        description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
      },
    })
  }

  it('answers each categorized movement with its id, description, date, amount, type, category and matching rules', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    const firstRule = await postRule({ categoryId: category.id, matchText: 'sintetico ferreteria' })
    const secondRule = await postRule({ categoryId: category.id, matchText: 'ferreteria sur' })
    const movement = await seedPending(
      account.id,
      'COMPRA SINTÉTICO FERRETERÍA SUR 12',
      '63.8',
      '2032-05-04',
    )

    const response = await app.inject({ method: 'POST', url: '/api/category-rules/apply' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // The fields the answer already had are all still there.
    expect(Object.keys(body).sort()).toEqual(
      ['categorized', 'categorizedMovements', 'conflictCount', 'conflicts', 'unmatched'].sort(),
    )
    expect(body.categorized).toBe(1)
    expect(body.categorizedMovements).toEqual([
      {
        movementId: movement.id,
        description: 'COMPRA SINTÉTICO FERRETERÍA SUR 12',
        bookingDate: '2032-05-04',
        amount: '63.80',
        type: 'expense',
        categoryId: category.id,
        categoryName: category.name,
        rules: [
          { ruleId: firstRule.json().id, matchText: 'sintetico ferreteria' },
          { ruleId: secondRule.json().id, matchText: 'ferreteria sur' },
        ],
      },
    ])
  })

  it('every listed movement reads back from GET /api/movements with the category the list says', async () => {
    const account = await createAccount()
    const bakery = await createCategory('expense')
    const pharmacy = await createCategory('expense')
    await postRule({ categoryId: bakery.id, matchText: 'sintetico horno' })
    await postRule({ categoryId: pharmacy.id, matchText: 'sintetico botica' })
    const seeded = [
      await seedPending(account.id, 'SINTETICO HORNO DEL BARRIO', '4.35', '2032-05-05'),
      await seedPending(account.id, 'SINTETICO BOTICA CENTRAL', '18.62', '2032-05-06'),
      await seedPending(account.id, 'SINTETICO HORNO OTRA VEZ', '6.1', '2032-05-07'),
    ]

    const applied = await app.inject({ method: 'POST', url: '/api/category-rules/apply' })
    const listed = applied.json().categorizedMovements as ListedMovement[]

    expect(listed.map((movement) => movement.movementId)).toEqual(seeded.map((row) => row.id))
    expect(listed).toHaveLength(applied.json().categorized)

    const read = await app.inject({
      method: 'GET',
      url: `/api/movements?accountId=${account.id}`,
    })
    expect(read.statusCode).toBe(200)
    const readBack = new Map(
      (read.json().movements as Array<{ id: number; categoryId: number | null }>).map(
        (movement) => [movement.id, movement.categoryId],
      ),
    )
    for (const movement of listed) {
      expect(readBack.get(movement.movementId)).toBe(movement.categoryId)
    }
    expect(listed.map((movement) => movement.categoryId)).toEqual([
      bakery.id,
      pharmacy.id,
      bakery.id,
    ])
  })

  it('a second run right after answers categorized 0 and an empty list', async () => {
    const account = await createAccount()
    const category = await createCategory('expense')
    await postRule({ categoryId: category.id, matchText: 'sintetico repaso' })
    await seedPending(account.id, 'SINTETICO REPASO UNO', '12.47', '2032-05-08')
    await seedPending(account.id, 'SINTETICO REPASO DOS', '7.03', '2032-05-09')

    const first = await app.inject({ method: 'POST', url: '/api/category-rules/apply' })
    expect(first.json().categorized).toBe(2)
    expect(first.json().categorizedMovements).toHaveLength(2)

    const second = await app.inject({ method: 'POST', url: '/api/category-rules/apply' })

    expect(second.statusCode).toBe(200)
    expect(second.json().categorized).toBe(0)
    expect(second.json().categorizedMovements).toEqual([])
  })

  // ── Feature 60: creating or changing a rule moves what the closing step left ──

  interface SeedCategorized {
    accountId: number
    description: string
    amount: string
    categoryId: number
    categorySource: 'manual' | 'rule' | 'closing'
    type?: 'expense' | 'income'
  }

  /** A movement already confirmed with a category, as an import leaves it. */
  function seedCategorized(movement: SeedCategorized) {
    const bookingDate = new Date('2032-06-11T00:00:00.000Z')
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
        status: 'confirmed',
        categoryId: movement.categoryId,
        categorySource: movement.categorySource,
      },
    })
  }

  async function storedSources(ids: number[]) {
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    })
    return rows.map((row) => [row.categoryId, row.categorySource])
  }

  it('moves the movements the closing step left in the generic category when a rule is created', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const genericIncome = await createCategory('income')
    const gym = await createCategory('expense')
    const moved = [
      await seedCategorized({
        accountId: account.id,
        description: 'RECIBO SINTETICO GIMNASIO ENERO',
        amount: '34.95',
        categoryId: generic.id,
        categorySource: 'closing',
      }),
      await seedCategorized({
        accountId: account.id,
        description: 'Recibo Sintético Gimnasio febrero',
        amount: '34.95',
        categoryId: generic.id,
        categorySource: 'closing',
      }),
    ]
    const untouched = [
      await seedCategorized({
        accountId: account.id,
        description: 'RECIBO SINTETICO PISCINA',
        amount: '18.42',
        categoryId: generic.id,
        categorySource: 'closing',
      }),
      // Same text, but an income: the rule's category is an expense one.
      await seedCategorized({
        accountId: account.id,
        description: 'DEVOLUCION SINTETICO GIMNASIO',
        amount: '9.13',
        type: 'income',
        categoryId: genericIncome.id,
        categorySource: 'closing',
      }),
    ]

    const response = await postRule({ categoryId: gym.id, matchText: 'sintetico gimnasio' })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    // The rule's own fields stay at the root, as before feature 60.
    expect(body).toMatchObject({ matchText: 'sintetico gimnasio', categoryId: gym.id })
    expect(body.categorization).toMatchObject({ categorized: 2, conflictCount: 0, conflicts: [] })
    expect(body.categorization).not.toHaveProperty('error')
    expect(body.categorization.categorizedMovements).toEqual(
      moved.map((row) => ({
        movementId: row.id,
        description: row.description,
        bookingDate: '2032-06-11',
        amount: '34.95',
        type: 'expense',
        categoryId: gym.id,
        categoryName: gym.name,
        rules: [{ ruleId: body.id, matchText: 'sintetico gimnasio' }],
      })),
    )
    expect(await storedSources(moved.map((row) => row.id))).toEqual([
      [gym.id, 'rule'],
      [gym.id, 'rule'],
    ])
    expect(await storedSources(untouched.map((row) => row.id))).toEqual([
      [generic.id, 'closing'],
      [genericIncome.id, 'closing'],
    ])
  })

  it('moves the movements the closing step left in the generic category when a rule is changed', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const pharmacy = await createCategory('expense')
    const optician = await createCategory('expense')
    const created = await postRule({ categoryId: pharmacy.id, matchText: 'sintetico optica' })
    expect(created.json().categorization.categorized).toBe(0)
    const movement = await seedCategorized({
      accountId: account.id,
      description: 'COMPRA SINTETICO OPTICA CENTRO',
      amount: '72.38',
      categoryId: generic.id,
      categorySource: 'closing',
    })

    // Changing the category of the rule…
    const categoryPatch = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${created.json().id}`,
      payload: { categoryId: optician.id },
    })

    expect(categoryPatch.statusCode).toBe(200)
    expect(categoryPatch.json()).toMatchObject({ categoryId: optician.id })
    expect(categoryPatch.json().categorization.categorizedMovements).toEqual([
      expect.objectContaining({ movementId: movement.id, categoryId: optician.id }),
    ])
    expect(await storedSources([movement.id])).toEqual([[optician.id, 'rule']])

    // …and its text: a new closing movement the new text matches moves too.
    const other = await seedCategorized({
      accountId: account.id,
      description: 'COMPRA SINTETICO LENTES NORTE',
      amount: '45.61',
      categoryId: generic.id,
      categorySource: 'closing',
    })
    const textPatch = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${created.json().id}`,
      payload: { matchText: 'sintetico lentes' },
    })

    expect(textPatch.statusCode).toBe(200)
    expect(textPatch.json().categorization.categorized).toBe(1)
    expect(textPatch.json().categorization.categorizedMovements[0]).toMatchObject({
      movementId: other.id,
      categoryId: optician.id,
      rules: [{ ruleId: created.json().id, matchText: 'sintetico lentes' }],
    })
    expect(await storedSources([movement.id, other.id])).toEqual([
      [optician.id, 'rule'],
      [optician.id, 'rule'],
    ])
  })

  it('never changes a movement whose category was set by hand, on creating or changing a rule', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const chosen = await createCategory('expense')
    const ruled = await createCategory('expense')
    const otherRuled = await createCategory('expense')
    const byHand = [
      // Set by hand on the generic category itself: still never moved.
      await seedCategorized({
        accountId: account.id,
        description: 'PAGO SINTETICO LIBRERIA PLAZA',
        amount: '16.27',
        categoryId: generic.id,
        categorySource: 'manual',
      }),
      await seedCategorized({
        accountId: account.id,
        description: 'PAGO SINTETICO LIBRERIA ESTACION',
        amount: '22.74',
        categoryId: chosen.id,
        categorySource: 'manual',
      }),
    ]
    const before = await app.prisma.movement.findMany({
      where: { id: { in: byHand.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    })

    const created = await postRule({ categoryId: ruled.id, matchText: 'sintetico libreria' })
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${created.json().id}`,
      payload: { categoryId: otherRuled.id, matchText: 'libreria' },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json().categorization.categorized).toBe(0)
    expect(changed.statusCode).toBe(200)
    expect(changed.json().categorization.categorized).toBe(0)
    // Identical INCLUDING updatedAt: no run wrote on them at all.
    const after = await app.prisma.movement.findMany({
      where: { id: { in: byHand.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    })
    expect(after).toEqual(before)
    expect(after.map((row) => row.categorySource)).toEqual(['manual', 'manual'])
  })

  it('never changes a movement a rule already categorized, on creating or changing a rule', async () => {
    const account = await createAccount()
    const first = await createCategory('expense')
    const second = await createCategory('expense')
    const movement = await seedCategorized({
      accountId: account.id,
      description: 'CUOTA SINTETICO CLUB REMO',
      amount: '27.86',
      categoryId: first.id,
      categorySource: 'rule',
    })
    const before = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })

    const created = await postRule({ categoryId: second.id, matchText: 'sintetico club remo' })
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${created.json().id}`,
      payload: { matchText: 'club remo' },
    })

    expect(created.json().categorization.categorized).toBe(0)
    expect(changed.json().categorization.categorized).toBe(0)
    const after = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(after).toEqual(before)
  })

  it('leaves a generic movement that rules of two categories match where it was and lists the conflict', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const fuel = await createCategory('expense')
    const shop = await createCategory('expense')
    const fuelRule = await postRule({ categoryId: fuel.id, matchText: 'sintetico gasolinera' })
    const movement = await seedCategorized({
      accountId: account.id,
      description: 'SINTETICO GASOLINERA TIENDA 24H',
      amount: '13.58',
      categoryId: generic.id,
      categorySource: 'closing',
    })
    const before = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })

    const shopRule = await postRule({ categoryId: shop.id, matchText: 'gasolinera tienda' })

    expect(shopRule.statusCode).toBe(201)
    const categorization = shopRule.json().categorization
    expect(categorization.categorized).toBe(0)
    expect(categorization.conflictCount).toBe(1)
    expect(categorization.conflicts).toHaveLength(1)
    expect(categorization.conflicts[0].movementId).toBe(movement.id)
    expect(
      categorization.conflicts[0].matches.map((match: { ruleId: number }) => match.ruleId).sort(),
    ).toEqual([fuelRule.json().id, shopRule.json().id].sort())
    const after = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(after).toEqual(before)
  })

  it('deleting a rule changes neither the category nor its source on any movement', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const category = await createCategory('expense')
    const created = await postRule({ categoryId: category.id, matchText: 'sintetico panaderia' })
    const seeded = [
      await seedCategorized({
        accountId: account.id,
        description: 'SINTETICO PANADERIA CATEGORIZADA',
        amount: '3.85',
        categoryId: category.id,
        categorySource: 'rule',
      }),
      await seedCategorized({
        accountId: account.id,
        description: 'SINTETICO PANADERIA A MANO',
        amount: '5.17',
        categoryId: category.id,
        categorySource: 'manual',
      }),
      await seedCategorized({
        accountId: account.id,
        description: 'OTRO SINTETICO EN EL CIERRE',
        amount: '8.29',
        categoryId: generic.id,
        categorySource: 'closing',
      }),
    ]
    const before = await app.prisma.movement.findMany({
      where: { id: { in: seeded.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    })

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/category-rules/${created.json().id}`,
    })

    expect(response.statusCode).toBe(204)
    const after = await app.prisma.movement.findMany({
      where: { id: { in: seeded.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    })
    expect(after).toEqual(before)
  })

  it('does not recategorize anything when the rule is rejected', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const category = await createCategory('expense')
    const existing = await postRule({ categoryId: category.id, matchText: 'sintetico lavanderia' })
    // Seeded AFTER the first rule ran, so only a rejected request could touch it.
    const movement = await seedCategorized({
      accountId: account.id,
      description: 'SINTETICO LAVANDERIA AUTOSERVICIO',
      amount: '6.42',
      categoryId: generic.id,
      categorySource: 'closing',
    })
    const before = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })

    const duplicated = await postRule({
      categoryId: category.id,
      matchText: 'SINTETICO LAVANDERIA',
    })
    const missingCategory = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${existing.json().id}`,
      payload: { categoryId: 999_999_431 },
    })
    const tooShort = await app.inject({
      method: 'PATCH',
      url: `/api/category-rules/${existing.json().id}`,
      payload: { matchText: ' la ' },
    })

    expect(duplicated.statusCode).toBe(409)
    expect(duplicated.json()).not.toHaveProperty('categorization')
    expect(missingCategory.statusCode).toBe(404)
    expect(tooShort.statusCode).toBe(400)
    const after = await app.prisma.movement.findUniqueOrThrow({ where: { id: movement.id } })
    expect(after).toEqual(before)
  })

  // ── Feature 61: what a rule would move, asked before creating it ──

  function previewUrl(query: Record<string, string | number>): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) params.set(key, String(value))
    return `/api/category-rules/preview?${params.toString()}`
  }

  it('previews exactly the categorization that creating the rule then returns', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const genericIncome = await createCategory('income')
    const marina = await createCategory('expense')
    const sailing = await createCategory('expense')
    const harbourRule = await postRule({ categoryId: marina.id, matchText: 'velero puerto' })
    // Seeded after the first rule ran, so it is still where the closing left it.
    const base = {
      accountId: account.id,
      categoryId: generic.id,
      categorySource: 'closing' as const,
    }
    await seedCategorized({ ...base, description: 'SINTETICO VELERO AMARRE', amount: '84.6' })
    await seedCategorized({ ...base, description: 'Sintético Velero vela', amount: '19.75' })
    // Both rules match it: a conflict, in the preview and in the POST.
    await seedCategorized({ ...base, description: 'SINTETICO VELERO PUERTO', amount: '12.4' })
    // The existing rule alone: the POST run moves it too, by that rule.
    await seedCategorized({ ...base, description: 'OTRO VELERO PUERTO', amount: '9.35' })
    // An income: an expense rule never takes it.
    await seedCategorized({
      ...base,
      categoryId: genericIncome.id,
      type: 'income',
      description: 'SINTETICO VELERO DEVOLUCION',
      amount: '7.2',
    })
    await seedPending(account.id, 'SINTETICO VELERO PENDIENTE', '23.5', '2032-06-12')
    const body = { matchText: '  Sintético VELERO ', categoryId: sailing.id }

    const preview = await app.inject({ method: 'GET', url: previewUrl(body) })
    const created = await postRule(body)

    expect(preview.statusCode).toBe(200)
    expect(created.statusCode).toBe(201)
    const previewed = preview.json()
    const answered = created.json()
    expect(previewed.matchText).toBe('sintetico velero')
    expect(previewed.matchText).toBe(answered.matchText)
    expect(previewed.categoryId).toBe(answered.categoryId)
    expect(previewed.categorization).toMatchObject({ categorized: 4, conflictCount: 1 })
    const withCreatedId = JSON.parse(
      JSON.stringify(previewed.categorization).replaceAll(
        '"ruleId":null',
        `"ruleId":${answered.id}`,
      ),
    )
    expect(withCreatedId).toEqual(answered.categorization)
    expect(
      answered.categorization.conflicts[0].matches.map((match: { ruleId: number }) => match.ruleId),
    ).toEqual([harbourRule.json().id, answered.id])
  })

  it('rejects a preview like the rule would be rejected', async () => {
    const category = await createCategory('expense')
    await postRule({ categoryId: category.id, matchText: 'sintetico preestreno' })
    const cases = [
      { categoryId: category.id, matchText: '  Á ' },
      { categoryId: 999_999_431, matchText: 'sintetico sin dueno' },
      { categoryId: category.id, matchText: 'SINTÉTICO Preestreno' },
    ]

    for (const [index, body] of cases.entries()) {
      const preview = await app.inject({ method: 'GET', url: previewUrl(body) })
      const created = await postRule(body)

      expect(preview.statusCode).toBe([400, 404, 409][index])
      expect(preview.statusCode).toBe(created.statusCode)
      expect(preview.json()).toEqual(created.json())
    }
  })

  it('rejects a preview missing a parameter or carrying an unknown one with 400', async () => {
    const category = await createCategory('expense')

    const missing = await app.inject({ method: 'GET', url: previewUrl({ matchText: 'sintetico' }) })
    const unknown = await app.inject({
      method: 'GET',
      url: previewUrl({ matchText: 'sintetico', categoryId: category.id, scope: 'all' }),
    })
    const notANumber = await app.inject({
      method: 'GET',
      url: previewUrl({ matchText: 'sintetico', categoryId: 'uno' }),
    })

    for (const response of [missing, unknown, notANumber]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
  })

  it('neither the suggestions nor the preview write anything', async () => {
    const account = await createAccount()
    const generic = await createCategory('expense')
    const ferry = await createCategory('expense')
    const taxi = await createCategory('expense')
    const existing = await postRule({ categoryId: ferry.id, matchText: 'sintetico ferry' })
    const base = { accountId: account.id, categoryId: generic.id }
    for (const amount of ['31.2', '33.6', '35.4']) {
      await seedCategorized({
        ...base,
        categorySource: 'closing',
        description: `BARCO TAXI ${amount}`,
        amount,
      })
    }
    await seedCategorized({
      ...base,
      categorySource: 'closing',
      description: 'SINTETICO FERRY BARCO',
      amount: '41.5',
    })
    await seedCategorized({
      ...base,
      categorySource: 'manual',
      description: 'BARCO TAXI A MANO',
      amount: '28.4',
    })
    await seedCategorized({
      ...base,
      categorySource: 'rule',
      description: 'BARCO TAXI REGLA',
      amount: '26.9',
    })
    await seedPending(account.id, 'BARCO TAXI PENDIENTE', '29.7', '2032-06-12')
    const movementsOf = () =>
      app.prisma.movement.findMany({ where: { accountId: account.id }, orderBy: { id: 'asc' } })
    const allRules = () => app.prisma.categoryRule.findMany({ orderBy: { id: 'asc' } })
    const movementsBefore = await movementsOf()
    const rulesBefore = await allRules()

    const suggestions = await app.inject({ method: 'GET', url: '/api/category-rules/suggestions' })
    const preview = await app.inject({
      method: 'GET',
      url: previewUrl({ matchText: 'barco', categoryId: taxi.id }),
    })

    expect(suggestions.statusCode).toBe(200)
    expect(
      suggestions
        .json()
        .find((suggestion: { matchText: string }) => suggestion.matchText === 'barco taxi'),
    ).toMatchObject({ movementCount: 4, manualMatches: 1 })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().categorization).toMatchObject({ categorized: 4, conflictCount: 1 })
    expect(await movementsOf()).toEqual(movementsBefore)
    expect(await allRules()).toEqual(rulesBefore)
    expect(rulesBefore.map((rule) => rule.id)).toContain(existing.json().id)
  })
})
