import type { MovementType } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  InvestmentPurchaseMatcherRegistry,
  InvestmentPurchaseReading,
} from './movements.types.js'

/** What the rule needs of a movement: its id, its type, its pair and its text and bank. */
export interface InvestmentPurchaseCandidate {
  id: number
  type: MovementType
  transferId: string | null
  description: string
  bank: string
}

/**
 * Which movements are an investment purchase (feature 71), keyed by movement
 * id. Only an `expense` (R12) that is not a leg of a paired transfer (R13), of
 * an account of a bank that has a matcher (R11), whose matcher does not answer
 * `null` (R1). Pure: it writes nothing and reads nothing (R4).
 */
export function resolveInvestmentPurchases(
  movements: InvestmentPurchaseCandidate[],
  matchers: InvestmentPurchaseMatcherRegistry,
): Map<number, InvestmentPurchaseReading> {
  const readings = new Map<number, InvestmentPurchaseReading>()
  for (const movement of movements) {
    if (movement.type !== 'expense' || movement.transferId !== null) continue
    const matcher = matchers.find((candidate) => candidate.bank === movement.bank)
    if (matcher === undefined) continue
    const purchase = matcher.classifyInvestmentPurchase(movement.description)
    if (purchase !== null) readings.set(movement.id, { certain: purchase.certain })
  }
  return readings
}

/**
 * The investment purchases of the whole table (feature 71), read when the
 * sums are read and never stored, like the deposit movements (ADR-035) and
 * the own accounts reading (ADR-040): a purchase imported later counts on the
 * next read, and nothing is written on the movement (R3, R4). Only `findMany`.
 * With an empty registry it does not even query.
 */
export async function readInvestmentPurchases(
  prisma: AppPrismaClient,
  matchers: InvestmentPurchaseMatcherRegistry,
): Promise<Map<number, InvestmentPurchaseReading>> {
  const banks = [...new Set(matchers.map((matcher) => matcher.bank))]
  if (banks.length === 0) return new Map()

  const movements = await prisma.movement.findMany({
    where: { type: 'expense', transferId: null, account: { bank: { in: banks } } },
    select: {
      id: true,
      type: true,
      transferId: true,
      description: true,
      account: { select: { bank: true } },
    },
  })

  return resolveInvestmentPurchases(
    movements.map(({ account, ...movement }) => ({ ...movement, bank: account.bank })),
    matchers,
  )
}
