import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  createCategorySchema,
  deleteCategorySchema,
  renameCategoryBodyProperties,
  renameCategorySchema,
} from './categories.schema.js'
import {
  categoriesDb,
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  serializeCategory,
} from './categories.service.js'
import type {
  CategoryIdParams,
  CreateCategoryBody,
  RenameCategoryBody,
} from './categories.types.js'

/**
 * HTTP layer for categories. Registered under the `/api/categories` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET    /api/categories
 *   POST   /api/categories
 *   PATCH  /api/categories/:id   (rename only)
 *   DELETE /api/categories/:id   (only when not in use)
 */
export default async function categoriesRoutes(fastify: FastifyInstance) {
  const db = categoriesDb(fastify)

  fastify.get('/', async () => {
    const categories = await listCategories(db)
    return categories.map(serializeCategory)
  })

  fastify.post<{ Body: CreateCategoryBody }>(
    '/',
    { schema: createCategorySchema },
    async (request, reply) => {
      const category = await createCategory(db, request.body)
      return reply.status(201).send(serializeCategory(category))
    },
  )

  fastify.patch<{ Params: CategoryIdParams; Body: RenameCategoryBody }>(
    '/:id',
    {
      schema: renameCategorySchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts):
      // a rename carrying `kind` must be a 400, never a rename that ignored it.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, renameCategoryBodyProperties)
      },
    },
    async (request) => {
      const category = await renameCategory(db, request.params.id, request.body)
      return serializeCategory(category)
    },
  )

  fastify.delete<{ Params: CategoryIdParams }>(
    '/:id',
    { schema: deleteCategorySchema },
    async (request, reply) => {
      await deleteCategory(db, request.params.id)
      return reply.status(204).send()
    },
  )
}
