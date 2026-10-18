import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  createCategoryRuleBodyProperties,
  createCategoryRuleSchema,
  deleteCategoryRuleSchema,
  previewCategoryRuleQueryProperties,
  previewCategoryRuleSchema,
  updateCategoryRuleBodyProperties,
  updateCategoryRuleSchema,
} from './category-rules.schema.js'
import {
  applyCategoryRules,
  categoryRulesDb,
  createCategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  previewCategoryRule,
  serializeCategoryRule,
  updateCategoryRule,
} from './category-rules.service.js'
import { listRuleSuggestions } from './category-rules.suggestions.js'
import type {
  CategoryRuleIdParams,
  CategoryRulePreview,
  CategoryRulePreviewQuery,
  CreateCategoryRuleBody,
  SerializedCategoryRuleWithCategorization,
  RuleSuggestion,
  UpdateCategoryRuleBody,
} from './category-rules.types.js'

/**
 * HTTP layer of the auto-categorization rules (feature 43). Registered under
 * the `/api/category-rules` prefix (see `src/app.ts`), so the routes resolve to:
 *   POST   /api/category-rules          (create one rule, then run the rules)
 *   GET    /api/category-rules          (list them, category embedded)
 *   PATCH  /api/category-rules/:id      (change matchText and/or categoryId, then run)
 *   DELETE /api/category-rules/:id      (delete the rule; movements untouched)
 *   POST   /api/category-rules/apply    (run the categorization on demand, R13)
 *   GET    /api/category-rules/suggestions  (proposed rules, feature 61)
 *   GET    /api/category-rules/preview      (what creating a rule would move, feature 61)
 *
 * `apply` under the module's own prefix follows the action-route precedent of
 * `/api/import/*`: it is what lets the human re-run the rules over what is
 * still pending after correcting one, without reimporting anything.
 *
 * Feature 60: creating or changing a rule runs ALL the rules right after the
 * write, over the pending movements and the ones `confirmAllMovements` filled
 * (`pendingAndClosing`), and answers what that run did in `categorization`.
 * The rule is saved first and apart: the run never throws, so a failure of it
 * travels in `categorization.error` with the rule kept; a 400/404/409 of the
 * rule is thrown before the run, which then moves nothing.
 *
 * Feature 61: the two GETs write nothing. The preview answers what the POST
 * with the same body would answer in `categorization` (rule id `null`), with
 * the POST's 400/404/409; the suggestions list takes no parameter.
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
      const categorization = await applyCategoryRules(db, 'pendingAndClosing')
      const body: SerializedCategoryRuleWithCategorization = {
        ...serializeCategoryRule(rule),
        categorization,
      }
      return reply.status(201).send(body)
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
    async (request): Promise<SerializedCategoryRuleWithCategorization> => {
      const rule = await updateCategoryRule(db, request.params.id, request.body)
      const categorization = await applyCategoryRules(db, 'pendingAndClosing')
      return { ...serializeCategoryRule(rule), categorization }
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

  fastify.get('/suggestions', async (): Promise<RuleSuggestion[]> => {
    return listRuleSuggestions(db)
  })

  fastify.get<{ Querystring: CategoryRulePreviewQuery }>(
    '/preview',
    {
      schema: previewCategoryRuleSchema,
      // AJV strips an unknown querystring parameter too (src/lib/strict-body.ts):
      // a preview of something other than what was asked must be a 400.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.query, previewCategoryRuleQueryProperties)
      },
    },
    async (request): Promise<CategoryRulePreview> => {
      return previewCategoryRule(db, request.query)
    },
  )
}
