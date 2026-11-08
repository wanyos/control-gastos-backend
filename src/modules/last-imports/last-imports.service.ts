import type { FastifyInstance } from 'fastify'

import { todayInMadrid } from '../../lib/local-date.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { listProductsForLastImports } from '../investments/investments.service.js'
import type { ProductImportFacts } from '../investments/investments.types.js'
import type {
  AccountImportStatus,
  DateGap,
  LastImportsResponse,
  ProductImportStatus,
} from './last-imports.types.js'

/**
 * More than this many days between two movements of an account that came in
 * DIFFERENT imports is a gap (R12). Measured on the human's database on
 * 2026-11-08: the largest jump between two different imports was 25 days, so
 * with 31 no account shows a gap today; 20 would have shown two in an account
 * with few movements that nobody knows are real (decisions.md point 1).
 */
export const ACCOUNT_GAP_DAYS = 31

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (same pattern as `netWorthDb`).
 */
export function lastImportsDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** `YYYY-MM-DD` of a date-only value (midnight UTC). */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Madrid day of a stored instant, or `null` (R3). */
function madridDay(instant: Date | null): string | null {
  return instant === null ? null : todayInMadrid(instant)
}

/**
 * Gaps of an account (R12, R13). `movements` come already ordered by
 * `bookingDate`, `daySequence`, `id`. Two movements are of the same import when
 * they share `createdAt` (one `createMany` per file): a quiet stretch inside one
 * file is never a gap, however long, because the bank already covered it.
 */
export function accountGaps(movements: { bookingDate: Date; createdAt: Date }[]): DateGap[] {
  const gaps: DateGap[] = []
  for (let index = 1; index < movements.length; index += 1) {
    const previous = movements[index - 1]
    const current = movements[index]
    if (previous === undefined || current === undefined) continue
    if (previous.createdAt.getTime() === current.createdAt.getTime()) continue
    const days = (current.bookingDate.getTime() - previous.bookingDate.getTime()) / DAY_MS
    if (days <= ACCOUNT_GAP_DAYS) continue
    gaps.push({
      from: isoDate(addDays(previous.bookingDate, 1)),
      to: isoDate(addDays(current.bookingDate, -1)),
    })
  }
  return gaps
}

/**
 * Whole calendar months with no photo between the month of the first photo and
 * the month of the last one, both excluded (R11). Consecutive missing months
 * are one stretch: from the 1st of the first to the last day of the last.
 * Months in UTC: the photos are date-only (midnight UTC).
 */
export function missingPhotoMonths(photoDates: Date[]): DateGap[] {
  if (photoDates.length === 0) return []
  const monthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth()
  const months = new Set(photoDates.map(monthIndex))
  const first = Math.min(...months)
  const last = Math.max(...months)

  const gaps: DateGap[] = []
  let runStart: number | null = null
  for (let month = first + 1; month <= last; month += 1) {
    if (!months.has(month)) {
      if (runStart === null) runStart = month
      continue
    }
    if (runStart !== null) {
      const runEnd = month - 1
      gaps.push({
        from: isoDate(new Date(Date.UTC(Math.floor(runStart / 12), runStart % 12, 1))),
        // Day 0 of the next month is the last day of this one.
        to: isoDate(new Date(Date.UTC(Math.floor(runEnd / 12), (runEnd % 12) + 1, 0))),
      })
      runStart = null
    }
  }
  return gaps
}

/**
 * The closing date of a product: the earliest of `closedAt` and `maturityDate`
 * that is written, whatever its type (same rule as feature 67). `null` = none.
 */
export function closingDate(product: {
  closedAt: Date | null
  maturityDate: Date | null
}): Date | null {
  const dates = [product.closedAt, product.maturityDate].filter(
    (date): date is Date => date !== null,
  )
  if (dates.length === 0) return null
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}

/**
 * The one read of feature 69. `today` is midnight UTC of today in Madrid
 * (`todayInMadridAsDate()` in the route), injected so tests fix the calendar.
 * Only `find*`: it writes nothing (R15).
 */
export async function getLastImports(
  prisma: AppPrismaClient,
  today: Date,
): Promise<LastImportsResponse> {
  const [accounts, movements, products] = await Promise.all([
    prisma.account.findMany({
      orderBy: [{ bank: 'asc' }, { id: 'asc' }],
      select: { id: true, bank: true, alias: true, lastImportedAt: true },
    }),
    prisma.movement.findMany({
      select: { accountId: true, bookingDate: true, createdAt: true },
      orderBy: [
        { accountId: 'asc' },
        { bookingDate: 'asc' },
        { daySequence: 'asc' },
        { id: 'asc' },
      ],
    }),
    listProductsForLastImports(prisma),
  ])

  const movementsByAccount = new Map<number, { bookingDate: Date; createdAt: Date }[]>()
  for (const movement of movements) {
    const group = movementsByAccount.get(movement.accountId) ?? []
    group.push(movement)
    movementsByAccount.set(movement.accountId, group)
  }

  return {
    asOf: isoDate(today),
    accounts: accounts.map((account): AccountImportStatus => {
      const group = movementsByAccount.get(account.id) ?? []
      const last = group.at(-1)
      return {
        accountId: account.id,
        bank: account.bank,
        alias: account.alias,
        dataUntil: last === undefined ? null : isoDate(last.bookingDate),
        importedAt: madridDay(account.lastImportedAt),
        expectedMonthly: true,
        gaps: accountGaps(group),
      }
    }),
    products: products.filter((product) => isLive(product, today)).map(productStatus),
  }
}

/** Live = no closing date, or a closing date after today (R8). */
function isLive(product: ProductImportFacts, today: Date): boolean {
  const closing = closingDate(product)
  return closing === null || closing.getTime() > today.getTime()
}

function productStatus(product: ProductImportFacts): ProductImportStatus {
  const expectedMonthly = product.maturityDate === null
  const lastPhoto = product.photoDates.at(-1)
  return {
    productId: product.id,
    bank: product.bank,
    name: product.name,
    type: product.type,
    maturityDate: product.maturityDate === null ? null : isoDate(product.maturityDate),
    dataUntil: lastPhoto === undefined ? null : isoDate(lastPhoto),
    importedAt: madridDay(product.lastImportedAt),
    expectedMonthly,
    gaps: expectedMonthly ? missingPhotoMonths(product.photoDates) : [],
  }
}
