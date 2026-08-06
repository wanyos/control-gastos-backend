import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { Category } from '../../generated/prisma/client.js'

import { ConflictError, NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  CategoryWithChildren,
  CreateCategoryBody,
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
