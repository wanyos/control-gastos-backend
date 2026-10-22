import type { FastifyInstance } from 'fastify'

import { ValidationError } from '../../errors/app-error.js'
import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  createCategorySchema,
  deleteCategorySchema,
  updateCategoryBodyProperties,
  updateCategorySchema,
} from './categories.schema.js'
import {
  categoriesDb,
  createCategory,
  deleteCategory,
  listCategories,
  serializeCategory,
  updateCategory,
} from './categories.service.js'
import type {
  CategoryIdParams,
  CreateCategoryBody,
  UpdateCategoryBody,
} from './categories.types.js'

/**
 * `isFixed` must be literally `true` or `false` (F63 R7). Checked on the RAW body
 * in `preValidation`: AJV coerces types by default, so after the schema a `"true"`
 * or a `null` would already look like a boolean and could unmark a category
 * silently. Same check as `excludedFromTotals` in `movements.routes.ts` (F49).
 */
function assertStrictIsFixed(body: unknown): void {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return
  if (!Object.hasOwn(body, 'isFixed')) return

  const value: unknown = (body as Record<string, unknown>).isFixed
  if (typeof value !== 'boolean') {
    throw new ValidationError("'isFixed' must be true or false")
  }
}

/**
 * HTTP layer for categories. Registered under the `/api/categories` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET    /api/categories
 *   POST   /api/categories
 *   PATCH  /api/categories/:id   (name and/or isFixed only)
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

  fastify.patch<{ Params: CategoryIdParams; Body: UpdateCategoryBody }>(
    '/:id',
    {
      schema: updateCategorySchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts):
      // an update carrying `kind` must be a 400, never an update that ignored it.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, updateCategoryBodyProperties)
        assertStrictIsFixed(request.body)
      },
    },
    async (request) => {
      const category = await updateCategory(db, request.params.id, request.body)
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
