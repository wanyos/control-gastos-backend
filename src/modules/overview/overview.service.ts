import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import { listAccounts } from '../accounts/accounts.service.js'
import { computeTotals, serializeTotals } from '../movements/movements.service.js'
import type { OverviewQuery, OverviewResponse } from './overview.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function overviewDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** `YYYY-MM` of today, in UTC — the same clock `bookingDate` lives in. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/** First and last day of a `YYYY-MM` month, both inclusive. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  // Day 0 of the NEXT month is the last day of this one (handles leap years).
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * The one read of feature 38: how much money there is, where it sits, and what
 * came in / went out / was left over in a month. It computes NOTHING of its
 * own — that is the point of the feature:
 *
 *  - each balance (and therefore the total) comes from `listAccounts`, the
 *    single balance formula of feature 31 that `GET /api/accounts` also uses;
 *  - the period totals go through `computeTotals`, the single sum of feature 36
 *    that already leaves out both legs of a transfer (`transferId != null`),
 *    the contributions to an investment product (`productId != null`) and the
 *    `neutral` movements. Two different sums of the same money diverge.
 *
 * A month with no movements is not an error: the totals are simply zero.
 * Read-only: this view writes nothing (its queries are `findMany` only).
 */
export async function getOverview(
  prisma: AppPrismaClient,
  query: OverviewQuery,
): Promise<OverviewResponse> {
  const month = query.month ?? currentMonth()
  const { from, to } = monthRange(month)

  const [accounts, periodMovements] = await Promise.all([
    listAccounts(prisma),
    prisma.movement.findMany({
      // Both ends inclusive: `bookingDate` is date-only stored at midnight UTC,
      // so `lte` at midnight of `to` covers the whole last day.
      where: {
        bookingDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
      },
      select: { type: true, amount: true, transferId: true, productId: true },
    }),
  ])

  const totalBalance = accounts.reduce(
    (sum, account) => sum.plus(account.balance),
    new Prisma.Decimal(0),
  )

  return {
    totalBalance: totalBalance.toFixed(2),
    accounts: accounts.map((account) => ({
      id: account.id,
      iban: account.iban,
      bank: account.bank,
      alias: account.alias,
      type: account.type,
      balance: account.balance.toFixed(2),
    })),
    period: { month, from, to, totals: serializeTotals(computeTotals(periodMovements)) },
  }
}
