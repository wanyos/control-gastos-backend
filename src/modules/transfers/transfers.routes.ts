import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  linkTransferBodyProperties,
  linkTransferSchema,
  unlinkTransferSchema,
} from './transfers.schema.js'
import { linkTransfer, transfersDb, unlinkTransfer } from './transfers.service.js'
import type { LinkTransferBody, TransferIdParams } from './transfers.types.js'

/**
 * HTTP layer of the manual transfer link (F44). Registered under the
 * `/api/transfers` prefix (see `src/app.ts`), so the routes resolve to:
 *   POST   /api/transfers
 *   DELETE /api/transfers/:transferId
 *
 * The resource is the PAIR, never one movement: linking writes the same
 * server-made transferId on both legs in one transaction, and undoing clears
 * both at once while writing the undone-link memory. The detection of F40/F41
 * still has NO endpoint — it keeps running by itself after every import pass;
 * this is the manual writer for the pairs it cannot resolve.
 */
export default async function transfersRoutes(fastify: FastifyInstance) {
  const db = transfersDb(fastify)

  fastify.post<{ Body: LinkTransferBody }>(
    '/',
    {
      schema: linkTransferSchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts):
      // a POST carrying anything besides `movementIds` must be a 400, never a
      // 201 that ignored it (R7).
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, linkTransferBodyProperties)
      },
    },
    async (request, reply) => {
      const result = await linkTransfer(db, request.body)
      return reply.status(201).send(result)
    },
  )

  fastify.delete<{ Params: TransferIdParams }>(
    '/:transferId',
    { schema: unlinkTransferSchema },
    async (request, reply) => {
      await unlinkTransfer(db, request.params.transferId)
      return reply.status(204).send()
    },
  )
}
