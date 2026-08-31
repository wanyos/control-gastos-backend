import { Prisma } from '../../generated/prisma/client.js'

import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { isAfter, netOf } from '../movements/movements.service.js'
import type { BalanceAnchor, BalanceMovement, RecencyPoint } from '../movements/movements.types.js'

/**
 * The two checks one imported file goes through (feature 32). They compare what
 * the app can add up against what the file says, and they change NOTHING: no
 * anchor, no balance, no row. What they produce only travels in the report of
 * that file.
 *
 *     descuadre = computed − fromFile      (when it is not exactly 0)
 *
 * Neither check knows which bank wrote the file: what decides whether a check
 * runs is what the file CARRIES (a per-line balance, a preamble balance), so a
 * new bank that brings a balance is checked without touching this module.
 */

/** One mismatch, exactly as it travels in the report of a file. */
export interface BalanceMismatch {
  accountId: number
  accountAlias: string
  /** `YYYY-MM-DD` of the compared point. */
  date: string
  /** The number the calculation produces, as a decimal string. */
  computed: string
  /** The number the file carries, as a decimal string. */
  fromFile: string
  /** `computed − fromFile`, as a decimal string, with its sign. */
  difference: string
  /** Which of the two checks produced it. */
  check: 'per-line' | 'statement-balance'
}

/** The account a mismatch is reported against: id and alias, nothing else. */
interface MismatchAccount {
  id: number
  alias: string
}

/**
 * There is NO tolerance constant here, and none must appear: two amounts match
 * only when their difference is exactly zero. The amounts are `Decimal(10,2)`
 * in the database and are compared as `Prisma.Decimal`, so there is no floating
 * point error to absorb — and a margin of ±0,01 would hide precisely the
 * one-cent error a rounding bug produces.
 */
function isMatch(difference: Prisma.Decimal): boolean {
  return difference.isZero()
}

/** A parsed amount never reaches a Decimal as a float: it travels as a string. */
function toDecimal(amount: number): Prisma.Decimal {
  return new Prisma.Decimal(amount.toFixed(2))
}

/** `bookingDate` is a date-only value: no time, no timezone. */
function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

/**
 * The recency of a parsed movement, in the shape THE single comparator of
 * `movements.service` understands: the order of a file and the order of the
 * balance formula must not be able to diverge.
 */
function toRecencyPoint(movement: ParsedMovement): RecencyPoint {
  return { bookingDate: toDateOnly(movement.bookingDate), daySequence: movement.daySequence }
}

/** Oldest first by `(bookingDate, daySequence)`, without mutating the input. */
function oldestFirst(movements: ParsedMovement[]): ParsedMovement[] {
  return [...movements].sort((a, b) => {
    if (isAfter(toRecencyPoint(a), toRecencyPoint(b))) return 1
    if (isAfter(toRecencyPoint(b), toRecencyPoint(a))) return -1
    return 0
  })
}

/** The most recent movement of a file, or `null` when it carries none. */
function mostRecentMovement(movements: ParsedMovement[]): ParsedMovement | null {
  let best: ParsedMovement | null = null
  for (const movement of movements) {
    if (best === null || isAfter(toRecencyPoint(movement), toRecencyPoint(best))) {
      best = movement
    }
  }
  return best
}

function mismatch(
  account: MismatchAccount,
  date: string,
  computed: Prisma.Decimal,
  fromFile: Prisma.Decimal,
  difference: Prisma.Decimal,
  check: BalanceMismatch['check'],
): BalanceMismatch {
  return {
    accountId: account.id,
    accountAlias: account.alias,
    date,
    computed: computed.toFixed(2),
    fromFile: fromFile.toFixed(2),
    difference: difference.toFixed(2),
    check,
  }
}

/**
 * PER-LINE check (R1, R2). Pure: no database, no clock, no anchor.
 *
 * Orders the movements of the file by `(bookingDate, daySequence)` and, for each
 * consecutive pair whose BOTH lines carry a per-line balance, compares the jump
 * `balance(n) − balance(n−1)` (the `computed` number) against the signed amount
 * of line `n` (the number the file carries). A pair where either line brings no
 * balance is skipped in silence: a hole is not a deviation (R2).
 *
 * It needs no starting balance of the account: it only checks the short chain
 * inside the file.
 */
export function findPerLineMismatches(
  statement: ParsedStatement,
  account: MismatchAccount,
): BalanceMismatch[] {
  const ordered = oldestFirst(statement.movements)
  const mismatches: BalanceMismatch[] = []

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    if (previous === undefined || current === undefined) continue
    if (previous.balance === null || current.balance === null) continue

    const computed = toDecimal(current.balance).minus(toDecimal(previous.balance))
    const fromFile = toDecimal(current.amount)
    const difference = computed.minus(fromFile)
    if (isMatch(difference)) continue

    mismatches.push(
      mismatch(account, current.bookingDate, computed, fromFile, difference, 'per-line'),
    )
  }

  return mismatches
}

export interface StatementBalanceCheckDeps {
  prisma: AppPrismaClient
  statement: ParsedStatement
  account: MismatchAccount
  /** The anchor as it stood BEFORE this file tried to anchor the account. */
  anchor: BalanceAnchor | null
}

/**
 * PREAMBLE-BALANCE check (R3, R4). Compares the `accountBalance` the file writes
 * once against the amount of the STORED anchor plus the net of the movements of
 * the account after it and not after the most recent movement of the file.
 *
 * Returns `null` — nothing to compare, which is not a mismatch — when the file
 * carries no `accountBalance`, when the account had no stored anchor before this
 * file (comparing the anchor against itself would always give zero and check
 * nothing), or when the most recent movement of the file is not after the
 * anchor (a statement older than the anchor: summing forward does not apply).
 */
export async function findStatementBalanceMismatch(
  deps: StatementBalanceCheckDeps,
): Promise<BalanceMismatch | null> {
  const { prisma, statement, account, anchor } = deps

  if (statement.accountBalance === null) return null
  if (anchor === null) return null

  const mostRecent = mostRecentMovement(statement.movements)
  if (mostRecent === null) return null

  const upTo = toRecencyPoint(mostRecent)
  if (!isAfter(upTo, anchor)) return null

  // The SQL window is coarse on purpose (whole days, `gte`/`lte`); the exact cut
  // -- strictly after the anchor, not after the most recent line of the file --
  // is applied in memory by `isAfter`, the same comparator the balance formula
  // uses. SQL and the domain must not judge recency differently.
  const rows = await prisma.movement.findMany({
    where: {
      accountId: account.id,
      bookingDate: { gte: anchor.bookingDate, lte: upTo.bookingDate },
    },
    select: {
      type: true,
      amount: true,
      balanceAfter: true,
      bookingDate: true,
      daySequence: true,
    },
  })

  const inWindow: BalanceMovement[] = rows.filter(
    (row) => isAfter(row, anchor) && !isAfter(row, upTo),
  )

  const computed = netOf(inWindow, new Prisma.Decimal(anchor.amount))
  const fromFile = toDecimal(statement.accountBalance)
  const difference = computed.minus(fromFile)
  if (isMatch(difference)) return null

  return mismatch(
    account,
    mostRecent.bookingDate,
    computed,
    fromFile,
    difference,
    'statement-balance',
  )
}
