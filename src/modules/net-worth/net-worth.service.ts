import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import { listAccounts } from '../accounts/accounts.service.js'
import { getInvestmentsNetWorth } from '../investments/investments.service.js'
import type { NetWorthResponse } from './net-worth.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function netWorthDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/**
 * The one read of feature 42: how much ALL the money is worth today. It
 * COMPOSES and sums, nothing else — that is the point of the feature:
 *
 *  - each account balance comes from `listAccounts`, the single balance
 *    formula of feature 31 that `GET /api/accounts` and `GET /api/overview`
 *    also use: two views of the same money cannot diverge (R2);
 *  - each investment value comes from `getInvestmentsNetWorth`, the only
 *    reader of the three investment tables (ADR-026): this module never
 *    names them.
 *
 * All arithmetic in `Prisma.Decimal`, serialized `toFixed(2)`; no stored
 * amount is recomputed or rounded (R10). Read-only end to end (R12).
 */
export async function getNetWorth(prisma: AppPrismaClient): Promise<NetWorthResponse> {
  // Date-only midnight UTC — the same clock as `bookingDate` and the photos.
  const asOf = new Date().toISOString().slice(0, 10)
  const today = new Date(`${asOf}T00:00:00.000Z`)

  const [accounts, investments] = await Promise.all([
    listAccounts(prisma),
    getInvestmentsNetWorth(prisma, today),
  ])

  const accountsTotal = accounts.reduce(
    (sum, account) => sum.plus(account.balance),
    new Prisma.Decimal(0),
  )

  return {
    asOf,
    total: accountsTotal.plus(investments.total).toFixed(2),
    accounts: {
      total: accountsTotal.toFixed(2),
      accounts: accounts.map((account) => ({
        id: account.id,
        iban: account.iban,
        bank: account.bank,
        alias: account.alias,
        type: account.type,
        balance: account.balance.toFixed(2),
      })),
    },
    investments,
  }
}
