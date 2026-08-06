import type { FastifyInstance } from 'fastify'

import { createCategorySchema } from './categories.schema.js'
import {
  categoriesDb,
  createCategory,
  listCategories,
  serializeCategory,
} from './categories.service.js'
import type { CreateCategoryBody } from './categories.types.js'

/**
 * HTTP layer for categories. Registered under the `/api/categories` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET  /api/categories
 *   POST /api/categories
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
}
