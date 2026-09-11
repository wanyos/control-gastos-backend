// Feature 43 `auto-categorization`, HTTP layer: the CRUD of the rules
// (R1, R2, R3, R4, R5) and the on-demand categorization run (R13).
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
})
