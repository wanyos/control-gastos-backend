import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { syntheticIban } from '../../lib/iban.fixture.js'
import { buildApp } from '../../app.js'
import type { SerializedCategory } from './categories.types.js'

let nameCounter = 0

/**
 * Unique category name per call: the DB is shared across runs and test files
 * run in parallel (hence the random suffix, not just a counter).
 */
function uniqueName(prefix: string): string {
  nameCounter += 1
  return `${prefix}-${Date.now()}-${nameCounter}-${Math.floor(Math.random() * 1_000_000)}`
}

describe('category routes', () => {
  let app: FastifyInstance
  const createdIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdIds.length > 0) {
      // Children first: the self-relation restricts deleting a parent in use.
      await app.prisma.category.deleteMany({
        where: { id: { in: createdIds }, parentId: { not: null } },
      })
      await app.prisma.category.deleteMany({ where: { id: { in: createdIds } } })
      createdIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function postCategory(body: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/categories', payload: body })
  }

  async function createCategory(body: Record<string, unknown>): Promise<SerializedCategory> {
    const response = await postCategory(body)
    expect(response.statusCode).toBe(201)
    const category = response.json<SerializedCategory>()
    createdIds.push(category.id)
    return category
  }

  it('POST /api/categories creates a root and a subcategory (R25)', async () => {
    const rootName = uniqueName('Food')
    const root = await createCategory({ name: rootName, kind: 'expense' })
    const child = await createCategory({
      name: uniqueName('Groceries'),
      kind: 'expense',
      parentId: root.id,
    })

    expect(root.parentId).toBeNull()
    expect(root.kind).toBe('expense')
    expect(root.name).toBe(rootName)
    expect(child.parentId).toBe(root.id)
    expect(child.kind).toBe('expense')
  })

  it('models the one-level hierarchy with parent and children relations (R2)', async () => {
    const root = await createCategory({ name: uniqueName('Health'), kind: 'expense' })
    const child = await createCategory({
      name: uniqueName('Pharmacy'),
      kind: 'expense',
      parentId: root.id,
    })

    const storedChild = await app.prisma.category.findUniqueOrThrow({
      where: { id: child.id },
      include: { parent: true },
    })
    const storedRoot = await app.prisma.category.findUniqueOrThrow({
      where: { id: root.id },
      include: { children: true },
    })

    expect(storedChild.parentId).toBe(root.id)
    expect(storedChild.parent?.id).toBe(root.id)
    expect(storedChild.kind).toBe('expense')
    expect(storedRoot.parentId).toBeNull()
    expect(storedRoot.children.map((category) => category.id)).toEqual([child.id])
    expect(storedRoot.createdAt).toBeInstanceOf(Date)
  })

  it('GET /api/categories returns roots with their children embedded (R26)', async () => {
    const root = await createCategory({ name: uniqueName('Sport'), kind: 'expense' })
    const childName = uniqueName('Gym')
    const child = await createCategory({ name: childName, kind: 'expense', parentId: root.id })

    const response = await app.inject({ method: 'GET', url: '/api/categories' })

    expect(response.statusCode).toBe(200)
    const categories = response.json<SerializedCategory[]>()
    const found = categories.find((category) => category.id === root.id)
    expect(found).toBeDefined()
    expect(found?.children.map((c) => c.id)).toEqual([child.id])
    expect(found?.children[0]?.name).toBe(childName)
    // The subcategory is not listed as a root of its own.
    expect(categories.some((category) => category.id === child.id)).toBe(false)
  })

  it('POST /api/categories with a subcategory as parent returns 400 (R27)', async () => {
    const root = await createCategory({ name: uniqueName('Home'), kind: 'expense' })
    const child = await createCategory({
      name: uniqueName('Utilities'),
      kind: 'expense',
      parentId: root.id,
    })

    const response = await postCategory({
      name: uniqueName('Electricity'),
      kind: 'expense',
      parentId: child.id,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Only one level of subcategory is allowed',
    })
  })

  it('POST /api/categories with a kind different from its parent returns 400 (R28)', async () => {
    const root = await createCategory({ name: uniqueName('Salary'), kind: 'expense' })

    const response = await postCategory({
      name: uniqueName('Bonus'),
      kind: 'income',
      parentId: root.id,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('POST /api/categories with an unknown parentId returns 404', async () => {
    const response = await postCategory({
      name: uniqueName('Orphan'),
      kind: 'expense',
      parentId: 99999999,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('POST /api/categories duplicating a root {kind,name} returns 409 (R29, R7)', async () => {
    const name = uniqueName('Transport')
    await createCategory({ name, kind: 'expense' })

    const duplicated = await postCategory({ name, kind: 'expense' })

    expect(duplicated.statusCode).toBe(409)
    expect(duplicated.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  })

  it('allows the same root name for a different kind (R7)', async () => {
    const name = uniqueName('Other')
    const asExpense = await createCategory({ name, kind: 'expense' })
    const asIncome = await createCategory({ name, kind: 'income' })

    expect(asExpense.id).not.toBe(asIncome.id)
  })

  it('allows homonymous subcategories under different parents (R7)', async () => {
    const firstParent = await createCategory({ name: uniqueName('Bank A'), kind: 'expense' })
    const secondParent = await createCategory({ name: uniqueName('Bank B'), kind: 'expense' })
    const childName = uniqueName('Fees')

    const first = await createCategory({
      name: childName,
      kind: 'expense',
      parentId: firstParent.id,
    })
    const second = await createCategory({
      name: childName,
      kind: 'expense',
      parentId: secondParent.id,
    })

    expect(first.id).not.toBe(second.id)
    expect(first.parentId).toBe(firstParent.id)
    expect(second.parentId).toBe(secondParent.id)
  })

  it('POST /api/categories without kind returns 400 VALIDATION_ERROR', async () => {
    const response = await postCategory({ name: uniqueName('No kind') })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })
})

describe('rename and delete category routes (feature 37)', () => {
  let app: FastifyInstance
  const createdCategoryIds: number[] = []
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
    if (createdCategoryIds.length > 0) {
      // Children first: the self-relation restricts deleting a parent in use.
      await app.prisma.category.deleteMany({
        where: { id: { in: createdCategoryIds }, parentId: { not: null } },
      })
      await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
      createdCategoryIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createCategory(body: Record<string, unknown>): Promise<SerializedCategory> {
    const response = await app.inject({ method: 'POST', url: '/api/categories', payload: body })
    expect(response.statusCode).toBe(201)
    const category = response.json<SerializedCategory>()
    createdCategoryIds.push(category.id)
    return category
  }

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function seedMovement(accountId: number, categoryId: number | null) {
    const bookingDate = new Date('2026-07-24T00:00:00.000Z')
    return app.prisma.movement.create({
      data: {
        accountId,
        type: 'expense',
        amount: '34.15',
        description: 'RECIBO /Recibo GIMNASIO',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        categoryId,
      },
    })
  }

  function patchCategory(id: number | string, body: unknown) {
    return app.inject({ method: 'PATCH', url: `/api/categories/${id}`, payload: body as object })
  }

  function deleteCategory(id: number | string) {
    return app.inject({ method: 'DELETE', url: `/api/categories/${id}` })
  }

  it('PATCH /api/categories/:id renames and changes nothing else (R3)', async () => {
    const category = await createCategory({ name: uniqueName('Leisure'), kind: 'expense' })
    const newName = uniqueName('Leisure and culture')

    const response = await patchCategory(category.id, { name: `  ${newName}  ` })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: category.id,
      name: newName,
      kind: 'expense',
      parentId: null,
    })
    const stored = await app.prisma.category.findUniqueOrThrow({ where: { id: category.id } })
    expect(stored.name).toBe(newName)
    expect(stored.kind).toBe('expense')
    expect(stored.parentId).toBeNull()
  })

  it('PATCH /api/categories/:id colliding with a sibling name returns 409 untouched (R4)', async () => {
    const takenName = uniqueName('Housing')
    await createCategory({ name: takenName, kind: 'expense' })
    const victim = await createCategory({ name: uniqueName('Bills'), kind: 'expense' })

    const response = await patchCategory(victim.id, { name: takenName })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' })
    const stored = await app.prisma.category.findUniqueOrThrow({ where: { id: victim.id } })
    expect(stored.name).toBe(victim.name)
  })

  it('allows the same name again for a different kind when renaming (R4)', async () => {
    const name = uniqueName('Other')
    await createCategory({ name, kind: 'expense' })
    const income = await createCategory({ name: uniqueName('Misc'), kind: 'income' })

    const response = await patchCategory(income.id, { name })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ name, kind: 'income' })
  })

  it('PATCH /api/categories/:id of an unknown id returns 404 (R11)', async () => {
    const response = await patchCategory(99999999, { name: uniqueName('Ghost') })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('PATCH /api/categories/:id rejects kind, extra properties and an empty body (R12)', async () => {
    const category = await createCategory({ name: uniqueName('Transport'), kind: 'expense' })

    const withKind = await patchCategory(category.id, {
      name: uniqueName('Vehicle'),
      kind: 'income',
    })
    const withExtra = await patchCategory(category.id, {
      name: uniqueName('Vehicle'),
      parentId: null,
    })
    const empty = await patchCategory(category.id, {})

    for (const response of [withKind, withExtra, empty]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
    const stored = await app.prisma.category.findUniqueOrThrow({ where: { id: category.id } })
    expect(stored.name).toBe(category.name)
    expect(stored.kind).toBe('expense')
  })

  it('PATCH /api/categories/:id rejects an empty and a whitespace-only name (R12)', async () => {
    const category = await createCategory({ name: uniqueName('Health'), kind: 'expense' })

    const emptyName = await patchCategory(category.id, { name: '' })
    const blankName = await patchCategory(category.id, { name: '   ' })

    for (const response of [emptyName, blankName]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    }
  })

  it('DELETE /api/categories/:id removes a free category and no movement (R5)', async () => {
    const doomed = await createCategory({ name: uniqueName('Unused'), kind: 'expense' })
    const kept = await createCategory({ name: uniqueName('Groceries'), kind: 'expense' })
    const account = await createAccount()
    const movement = await seedMovement(account.id, kept.id)

    const response = await deleteCategory(doomed.id)

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(await app.prisma.category.findUnique({ where: { id: doomed.id } })).toBeNull()
    const storedMovement = await app.prisma.movement.findUniqueOrThrow({
      where: { id: movement.id },
    })
    expect(storedMovement.categoryId).toBe(kept.id)
  })

  it('DELETE /api/categories/:id with movements returns 409 with their count (R6)', async () => {
    const category = await createCategory({ name: uniqueName('Supermarket'), kind: 'expense' })
    const account = await createAccount()
    const movement = await seedMovement(account.id, category.id)

    const response = await deleteCategory(category.id)

    expect(response.statusCode).toBe(409)
    const body = response.json<{ code: string; message: string }>()
    expect(body.code).toBe('CONFLICT')
    expect(body.message).toContain('1 movement(s)')
    // Nothing was deleted nor modified.
    expect(await app.prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull()
    const storedMovement = await app.prisma.movement.findUniqueOrThrow({
      where: { id: movement.id },
    })
    expect(storedMovement.categoryId).toBe(category.id)
  })

  it('DELETE /api/categories/:id with subcategories returns 409 (R6)', async () => {
    const parent = await createCategory({ name: uniqueName('Home'), kind: 'expense' })
    await createCategory({ name: uniqueName('Utilities'), kind: 'expense', parentId: parent.id })

    const response = await deleteCategory(parent.id)

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ statusCode: 409, code: 'CONFLICT' })
    expect(await app.prisma.category.findUnique({ where: { id: parent.id } })).not.toBeNull()
  })

  it('DELETE /api/categories/:id of an unknown id returns 404 (R11)', async () => {
    const response = await deleteCategory(99999999)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('keeps POST 201 and GET 200 responding exactly as before (R1, R2)', async () => {
    const name = uniqueName('Taxes')
    const created = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name, kind: 'expense' },
    })
    expect(created.statusCode).toBe(201)
    const category = created.json<SerializedCategory>()
    createdCategoryIds.push(category.id)
    expect(category).toMatchObject({ name, kind: 'expense', parentId: null, children: [] })

    const listed = await app.inject({ method: 'GET', url: '/api/categories' })
    expect(listed.statusCode).toBe(200)
    expect(listed.json<SerializedCategory[]>().some((entry) => entry.id === category.id)).toBe(true)
  })
})
