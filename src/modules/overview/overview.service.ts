import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import { currentMonthInMadrid } from '../../lib/local-date.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { listAccounts } from '../accounts/accounts.service.js'
import { readDepositMovements } from '../investments/investments.service.js'
import type { DepositMaturityMatcherRegistry } from '../investments/investments.types.js'
import { computeTotals, serializeTotals } from '../movements/movements.service.js'
import { readOwnership } from '../own-accounts/own-accounts.service.js'
import type { OverviewQuery, OverviewResponse } from './overview.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function overviewDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** `YYYY-MM` of today in Madrid, the calendar `bookingDate` is written in (`src/lib/local-date.ts`). */
export function currentMonth(): string {
  return currentMonthInMadrid()
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
 *    the contributions to an investment product (`productId != null`), the
 *    movements the human marked `excludedFromTotals` (feature 49) and the
 *    `neutral` movements, and since feature 57 counts a deposit movement only
 *    by its interest, and since feature 62 leaves out what the own accounts
 *    table recognizes as the human's own money moving (`readOwnership`). Two
 *    different sums of the same money diverge.
 *
 * A month with no movements is not an error: the totals are simply zero.
 * Read-only: this view writes nothing (its queries are `findMany` only).
 */
export async function getOverview(
  prisma: AppPrismaClient,
  query: OverviewQuery,
  matchers: DepositMaturityMatcherRegistry,
): Promise<OverviewResponse> {
  const month = query.month ?? currentMonth()
  const { from, to } = monthRange(month)

  const [accounts, periodMovements, deposits, ownership] = await Promise.all([
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
      select: {
        id: true,
        type: true,
        amount: true,
        transferId: true,
        productId: true,
        excludedFromTotals: true,
      },
    }),
    // Over the whole history, not the month: a maturity's principal may come
    // from an opening of an earlier month (feature 57).
    readDepositMovements(prisma, matchers),
    // Feature 62: the same reading `GET /api/movements` uses, so the two sums agree.
    readOwnership(prisma),
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
    period: {
      month,
      from,
      to,
      totals: serializeTotals(computeTotals(periodMovements, deposits, ownership)),
    },
  }
}
