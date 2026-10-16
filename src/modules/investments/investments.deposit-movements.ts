import { Prisma } from '../../generated/prisma/client.js'
import type { MovementType } from '../../generated/prisma/client.js'

import type {
  DepositMaturityMatcherRegistry,
  DepositMovementInput,
  DepositMovementKind,
  DepositMovementReading,
  DepositProductInput,
} from './investments.types.js'

/** The `type` each kind of deposit movement must have to be one (R1). */
const expectedType: Record<DepositMovementKind, MovementType> = {
  opening: 'expense',
  cancellation: 'income',
  maturity: 'income',
}

const zero = new Prisma.Decimal(0)

/**
 * The amount condition a candidate principal `C` must meet for a maturity of
 * amount `M`: `C ≤ M` and `M − C < C` -- the interest is not negative and does
 * not reach the principal itself (R4, R5).
 */
function meetsAmountCondition(principal: Prisma.Decimal, maturity: Prisma.Decimal): boolean {
  return principal.lessThanOrEqualTo(maturity) && maturity.minus(principal).lessThan(principal)
}

/**
 * The order the movements of one account are walked in: `bookingDate`, then
 * `daySequence` (a missing one read as `0`, like `isAfter` of the movements
 * module), then `id` so two movements never tie.
 */
function byHistoryOrder(a: DepositMovementInput, b: DepositMovementInput): number {
  const dateDiff = a.bookingDate.getTime() - b.bookingDate.getTime()
  if (dateDiff !== 0) return dateDiff
  const sequenceDiff = (a.daySequence ?? 0) - (b.daySequence ?? 0)
  if (sequenceDiff !== 0) return sequenceDiff
  return a.id - b.id
}

/** Removes from `openings` the oldest one of exactly `amount`; `true` if there was one. */
function returnOldestOpening(openings: DepositMovementInput[], amount: Prisma.Decimal): boolean {
  const index = openings.findIndex((opening) => opening.amount.equals(amount))
  if (index === -1) return false
  openings.splice(index, 1)
  return true
}

/**
 * How much each deposit movement counts in the income/expense totals (feature
 * 57). PURE: no database and no bank name -- which text is a deposit movement
 * is said by the matcher of the bank of each movement's account, injected from
 * `src/app.ts` (ADR-015). Called on every read, so a movement imported later
 * counts on the next read without anything being stored (R15).
 *
 * Per account, in history order, it keeps the openings not returned yet:
 *  - an opening counts 0 and its amount is its principal; it joins the list;
 *  - a cancellation counts 0 and returns the oldest opening of exactly its
 *    amount; if there is none it is ambiguous, `opening_not_found` (R8);
 *  - a maturity takes its principal from the ONE product file of the same bank
 *    maturing that day whose principal meets the amount condition (R4); with no
 *    such file, from the openings still in the list that meet it, as long as
 *    they all share one amount (R5). With a certain principal it counts
 *    `amount − principal` and returns the oldest opening of that amount (R3,
 *    R6); without one it counts 0 and returns nothing (R7, R11).
 *
 * The result has an entry for every deposit movement and for nothing else.
 */
export function resolveDepositMovements(
  movements: DepositMovementInput[],
  products: DepositProductInput[],
  matchers: DepositMaturityMatcherRegistry,
): Map<number, DepositMovementReading> {
  const readings = new Map<number, DepositMovementReading>()

  const byAccount = new Map<
    number,
    { movement: DepositMovementInput; kind: DepositMovementKind }[]
  >()
  for (const movement of movements) {
    const matcher = matchers.find((candidate) => candidate.bank === movement.bank)
    const kind = matcher?.classifyDepositMovement(movement.description) ?? null
    if (kind === null || movement.type !== expectedType[kind]) continue
    const list = byAccount.get(movement.accountId) ?? []
    list.push({ movement, kind })
    byAccount.set(movement.accountId, list)
  }

  for (const entries of byAccount.values()) {
    entries.sort((a, b) => byHistoryOrder(a.movement, b.movement))
    const openings: DepositMovementInput[] = []

    for (const { movement, kind } of entries) {
      if (kind === 'opening') {
        openings.push(movement)
        readings.set(movement.id, certain(kind, movement.amount, zero))
        continue
      }

      if (kind === 'cancellation') {
        readings.set(
          movement.id,
          returnOldestOpening(openings, movement.amount)
            ? certain(kind, movement.amount, zero)
            : ambiguous(kind, 'opening_not_found', []),
        )
        continue
      }

      readings.set(movement.id, resolveMaturity(movement, products, openings))
    }
  }

  return readings
}

/** The principal of one maturity, from its product file or its openings (R4-R7). */
function resolveMaturity(
  maturity: DepositMovementInput,
  products: DepositProductInput[],
  openings: DepositMovementInput[],
): DepositMovementReading {
  const fromProducts = products.filter(
    (product): product is DepositProductInput & { principal: Prisma.Decimal } =>
      product.bank === maturity.bank &&
      product.maturityDate !== null &&
      product.maturityDate.getTime() === maturity.bookingDate.getTime() &&
      product.principal !== null &&
      meetsAmountCondition(product.principal, maturity.amount),
  )

  if (fromProducts.length > 1) return ambiguous('maturity', 'several_principals', [])

  if (fromProducts.length === 1) {
    const { principal } = fromProducts[0]
    // The opening may be missing (it predates the first statement): the
    // principal is still certain, it simply returns nothing.
    returnOldestOpening(openings, principal)
    return certain('maturity', principal, maturity.amount.minus(principal))
  }

  const candidates = openings.filter((opening) =>
    meetsAmountCondition(opening.amount, maturity.amount),
  )
  if (candidates.length === 0) return ambiguous('maturity', 'principal_not_found', [])

  const principal = candidates[0].amount
  if (candidates.some((opening) => !opening.amount.equals(principal))) {
    const ids = candidates.map((opening) => opening.id).sort((a, b) => a - b)
    return ambiguous('maturity', 'several_principals', ids)
  }

  returnOldestOpening(openings, principal)
  return certain('maturity', principal, maturity.amount.minus(principal))
}

function certain(
  kind: DepositMovementKind,
  principal: Prisma.Decimal,
  counted: Prisma.Decimal,
): DepositMovementReading {
  return { kind, principal, counted, ambiguous: false, reason: null, candidateMovementIds: [] }
}

function ambiguous(
  kind: DepositMovementKind,
  reason: DepositMovementReading['reason'],
  candidateMovementIds: number[],
): DepositMovementReading {
  return { kind, principal: null, counted: zero, ambiguous: true, reason, candidateMovementIds }
}
