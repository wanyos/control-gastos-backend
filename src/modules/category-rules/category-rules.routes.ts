import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  createCategoryRuleBodyProperties,
  createCategoryRuleSchema,
  deleteCategoryRuleSchema,
  updateCategoryRuleBodyProperties,
  updateCategoryRuleSchema,
} from './category-rules.schema.js'
import {
  applyCategoryRules,
  categoryRulesDb,
  createCategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  serializeCategoryRule,
  updateCategoryRule,
} from './category-rules.service.js'
import type {
  CategoryRuleIdParams,
  CreateCategoryRuleBody,
  UpdateCategoryRuleBody,
} from './category-rules.types.js'

/**
 * HTTP layer of the auto-categorization rules (feature 43). Registered under
 * the `/api/category-rules` prefix (see `src/app.ts`), so the routes resolve to:
 *   POST   /api/category-rules          (create one rule)
 *   GET    /api/category-rules          (list them, category embedded)
 *   PATCH  /api/category-rules/:id      (change matchText and/or categoryId)
 *   DELETE /api/category-rules/:id      (delete the rule; movements untouched)
 *   POST   /api/category-rules/apply    (run the categorization on demand, R13)
 *
 * `apply` under the module's own prefix follows the action-route precedent of
 * `/api/import/*`: it is what lets the human re-run the rules over what is
 * still pending after correcting one, without reimporting anything.
 */
export default async function categoryRulesRoutes(fastify: FastifyInstance) {
  const db = categoryRulesDb(fastify)

  fastify.post<{ Body: CreateCategoryRuleBody }>(
    '/',
    {
      schema: createCategoryRuleSchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts):
      // a POST carrying anything else must be a 400, never a 201 that ignored it.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, createCategoryRuleBodyProperties)
      },
    },
    async (request, reply) => {
      const rule = await createCategoryRule(db, request.body)
      return reply.status(201).send(serializeCategoryRule(rule))
    },
  )

  fastify.get('/', async () => {
    const rules = await listCategoryRules(db)
    return rules.map(serializeCategoryRule)
  })

  fastify.patch<{ Params: CategoryRuleIdParams; Body: UpdateCategoryRuleBody }>(
    '/:id',
    {
      schema: updateCategoryRuleSchema,
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, updateCategoryRuleBodyProperties)
      },
    },
    async (request) => {
      const rule = await updateCategoryRule(db, request.params.id, request.body)
      return serializeCategoryRule(rule)
    },
  )

  fastify.delete<{ Params: CategoryRuleIdParams }>(
    '/:id',
    { schema: deleteCategoryRuleSchema },
    async (request, reply) => {
      await deleteCategoryRule(db, request.params.id)
      return reply.status(204).send()
    },
  )

  fastify.post('/apply', async () => {
    return applyCategoryRules(db)
  })
}
