import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

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
