import type { FastifyInstance } from 'fastify'

import { accountIdParamsSchema, createAccountSchema } from './accounts.schema.js'
import {
  accountsDb,
  createAccount,
  getAccountById,
  listAccounts,
  serializeAccount,
} from './accounts.service.js'
import type { AccountIdParams, CreateAccountBody } from './accounts.types.js'

/**
 * HTTP layer for accounts. Registered under the `/api/accounts` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET  /api/accounts
 *   POST /api/accounts
 *   GET  /api/accounts/:id
 */
export default async function accountsRoutes(fastify: FastifyInstance) {
  const db = accountsDb(fastify)

  fastify.get('/', async () => {
    const accounts = await listAccounts(db)
    return accounts.map(serializeAccount)
  })

  fastify.get<{ Params: AccountIdParams }>(
    '/:id',
    { schema: accountIdParamsSchema },
    async (request) => {
      return serializeAccount(await getAccountById(db, request.params.id))
    },
  )

  fastify.post<{ Body: CreateAccountBody }>(
    '/',
    { schema: createAccountSchema },
    async (request, reply) => {
      const account = await createAccount(db, request.body)
      return reply.status(201).send(serializeAccount(account))
    },
  )
}
