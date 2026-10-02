import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  reviewBalanceMismatchBodyProperties,
  reviewBalanceMismatchSchema,
  reviewUnparsedRowSchema,
} from './import.warnings.schema.js'
import {
  listPendingImportWarnings,
  reviewBalanceMismatch,
  reviewUnparsedRow,
} from './import.warnings.service.js'
import type { ReviewBalanceMismatchPatch, ReviewUnparsedRowPatch } from './import.warnings.types.js'

interface BalanceMismatchIdParams {
  id: number
}

interface UnparsedRowIdParams {
  id: number
}

/**
 * HTTP layer of the warnings an import leaves behind (features 48 and 54).
 * Registered from `import.routes.ts`, so it hangs from the `/api/import` prefix
 * that already exists and `src/app.ts` is not touched:
 *   GET   /api/import/warnings
 *   PATCH /api/import/warnings/balance-mismatches/:id
 *   PATCH /api/import/warnings/unparsed-rows/:id
 *
 * The listing does NOT paginate: it is expected to be short. If it ever stops
 * being short, that is another feature and the contract says so.
 *
 * Nothing is computed here: the handlers hand over to the service, which is
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

  fastify.patch<{ Params: UnparsedRowIdParams; Body: ReviewUnparsedRowPatch }>(
    '/warnings/unparsed-rows/:id',
    {
      schema: reviewUnparsedRowSchema,
      // Same body and same reason as the route above: `reason` must be a 400.
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, reviewBalanceMismatchBodyProperties)
      },
    },
    async (request) => {
      return reviewUnparsedRow(prisma, request.params.id, request.body)
    },
  )
}
