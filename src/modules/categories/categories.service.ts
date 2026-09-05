import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { Category } from '../../generated/prisma/client.js'

import { ConflictError, NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  CategoryWithChildren,
  CreateCategoryBody,
  RenameCategoryBody,
  SerializedCategory,
} from './categories.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function categoriesDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** Root categories with their subcategories (the hierarchy is one level deep). */
export function listCategories(prisma: AppPrismaClient): Promise<CategoryWithChildren[]> {
  return prisma.category.findMany({
    where: { parentId: null },
    include: { children: { orderBy: { name: 'asc' } } },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
}

export async function createCategory(
  prisma: AppPrismaClient,
  input: CreateCategoryBody,
): Promise<Category> {
  const name = input.name.trim()
  if (name.length === 0) throw new ValidationError('name is required')

  if (input.parentId !== undefined) {
    const parent = await prisma.category.findUnique({ where: { id: input.parentId } })

    if (!parent) {
      throw new NotFoundError('Parent category not found')
    }
    if (parent.parentId !== null) {
      throw new ValidationError('Only one level of subcategory is allowed')
    }
    if (parent.kind !== input.kind) {
      throw new ValidationError(`A subcategory must have the same kind as its parent`)
    }
  }

  try {
    return await prisma.category.create({
      data: {
        name,
        kind: input.kind,
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      },
    })
  } catch (error) {
    // P2002: unique violation on (parentId, kind, name). The index is created
    // with NULLS NOT DISTINCT, so it also catches duplicated root categories.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`A category named '${name}' already exists for that parent and kind`)
    }
    throw error
  }
}

/** Changes ONLY the name: kind and parentId cannot travel through this path (R3). */
export async function renameCategory(
  prisma: AppPrismaClient,
  id: number,
  input: RenameCategoryBody,
): Promise<Category> {
  const name = input.name.trim()
  if (name.length === 0) throw new ValidationError('name is required')

  const category = await prisma.category.findUnique({ where: { id } })
  if (!category) throw new NotFoundError('Category not found')

  try {
    return await prisma.category.update({ where: { id }, data: { name } })
  } catch (error) {
    // P2002: same unique index as on create — (parentId, kind, name).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`A category named '${name}' already exists for that parent and kind`)
    }
    throw error
  }
}

/**
 * Deletes a category only when nothing hangs from it. A category in use is a
 * 409, never a silent un-categorization of the movements pointing at it (R6):
 * the caller removes the category from those movements first, explicitly.
 */
export async function deleteCategory(prisma: AppPrismaClient, id: number): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { movements: true, children: true } } },
  })
  if (!category) throw new NotFoundError('Category not found')

  const { movements, children } = category._count
  if (movements > 0 || children > 0) {
    throw new ConflictError(
      `Category is in use: ${movements} movement(s) point at it and it has ${children} subcategory(ies)`,
    )
  }

  await prisma.category.delete({ where: { id } })
}

/** Maps the domain object to the API contract shape. */
export function serializeCategory(
  category: Category & { children?: Category[] },
): SerializedCategory {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    parentId: category.parentId,
    createdAt: category.createdAt.toISOString(),
    children: (category.children ?? []).map(serializeCategory),
  }
}
