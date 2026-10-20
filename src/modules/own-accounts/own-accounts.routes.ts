import type { FastifyInstance } from 'fastify'

import { assertOnlyAllowedBodyProperties } from '../../lib/strict-body.js'
import {
  createOwnAccountBodyProperties,
  createOwnAccountSchema,
  replaceHolderNamesBodyProperties,
  replaceHolderNamesSchema,
  updateOwnAccountBodyProperties,
  updateOwnAccountSchema,
} from './own-accounts.schema.js'
import {
  createOwnAccount,
  listHolderNames,
  listOwnAccounts,
  ownAccountsDb,
  replaceHolderNames,
  updateOwnAccount,
} from './own-accounts.service.js'
import type {
  CreateOwnAccountBody,
  HolderNames,
  OwnAccountDto,
  OwnAccountIdParams,
  OwnAccountList,
  UpdateOwnAccountBody,
} from './own-accounts.types.js'

/**
 * HTTP layer of the own accounts table (feature 62). Registered under the
 * `/api/own-accounts` prefix (see `src/app.ts`):
 *   GET   /api/own-accounts               (the table, by bank and name)
 *   POST  /api/own-accounts               (one row with its texts)
 *   PATCH /api/own-accounts/:id           (only the fields sent; texts replaced)
 *   GET   /api/own-accounts/holder-names  (the holder name forms)
 *   PUT   /api/own-accounts/holder-names  (replace them all)
 *
 * No DELETE: the human asked to add, change and look up. A row he no longer
 * wants is left without texts, and then it recognizes nothing.
 */
export default async function ownAccountsRoutes(fastify: FastifyInstance) {
  const db = ownAccountsDb(fastify)

  fastify.get('/', async (): Promise<OwnAccountList> => {
    return listOwnAccounts(db)
  })

  fastify.post<{ Body: CreateOwnAccountBody }>(
    '/',
    {
      schema: createOwnAccountSchema,
      // AJV would silently strip an unknown property (see src/lib/strict-body.ts).
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, createOwnAccountBodyProperties)
      },
    },
    async (request, reply) => {
      const account = await createOwnAccount(db, request.body)
      return reply.status(201).send(account)
    },
  )

  fastify.patch<{ Params: OwnAccountIdParams; Body: UpdateOwnAccountBody }>(
    '/:id',
    {
      schema: updateOwnAccountSchema,
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, updateOwnAccountBodyProperties)
      },
    },
    async (request): Promise<OwnAccountDto> => {
      return updateOwnAccount(db, request.params.id, request.body)
    },
  )

  fastify.get('/holder-names', async (): Promise<HolderNames> => {
    return listHolderNames(db)
  })

  fastify.put<{ Body: HolderNames }>(
    '/holder-names',
    {
      schema: replaceHolderNamesSchema,
      preValidation: async (request) => {
        assertOnlyAllowedBodyProperties(request.body, replaceHolderNamesBodyProperties)
      },
    },
    async (request): Promise<HolderNames> => {
      return replaceHolderNames(db, request.body.names)
    },
  )
}
