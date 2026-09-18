import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  reviewBalanceMismatchBodyProperties,
  reviewBalanceMismatchSchema,
} from './import.warnings.schema.js'
import { listPendingImportWarnings, reviewBalanceMismatch } from './import.warnings.service.js'
import type { ReviewBalanceMismatchPatch } from './import.warnings.types.js'

interface BalanceMismatchIdParams {
  id: number
}

/**
 * HTTP layer of the warnings an import leaves behind (feature 48). Registered
 * from `import.routes.ts`, so it hangs from the `/api/import` prefix that
 * already exists and `src/app.ts` is not touched:
 *   GET   /api/import/warnings
 *   PATCH /api/import/warnings/balance-mismatches/:id
 *
 * The listing does NOT paginate: what it answers is what is still open, which is
 * expected to be short. If it ever stops being short, that is another feature
 * and the contract says so.
 *
 * Nothing is computed here: the two handlers hand over to the service, which is
 * the single reader and writer of the two tables.
 */
export default async function importWarningsRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma

  fastify.get('/warnings', async () => {
    return listPendingImportWarnings(prisma)
  })

  fastify.patch<{ Params: BalanceMismatchIdParams; Body: ReviewBalanceMismatchPatch }>(
    '/warnings/balance-mismatches/:id',
    {
      schema: reviewBalanceMismatchSchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts):
      // a PATCH carrying `computed` must be a 400, never a 200 that ignored it.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, reviewBalanceMismatchBodyProperties)
      },
    },
    async (request) => {
      return reviewBalanceMismatch(prisma, request.params.id, request.body)
    },
  )
}
