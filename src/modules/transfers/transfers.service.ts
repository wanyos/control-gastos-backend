import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { AppError, ConflictError, NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { serializeMovement } from '../movements/movements.service.js'
import type {
  AmbiguousTransferGroup,
  LinkTransferBody,
  LinkTransferResult,
  TransferCandidate,
  TransferDetectionResult,
} from './transfers.types.js'

/**
 * Single point where the module obtains its data client (same pattern as
 * `movementsDb`). Keeps the routes layer free of any data-access reference.
 */
export function transfersDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/**
 * Window between the booking dates of the two legs of one transfer, in natural
 * days (decision 1 of specs/40-transfer-detection/decisions.md): it covers a
 * weekend plus one processing day. Changing it costs this one line.
 */
export const transferDateWindowDays = 3

const millisecondsPerDay = 86_400_000

/** Both columns are date-only at midnight UTC, so the difference is exact days. */
function withinWindow(a: TransferCandidate, b: TransferCandidate): boolean {
  const days = Math.abs(a.bookingDate.getTime() - b.bookingDate.getTime()) / millisecondsPerDay
  return days <= transferDateWindowDays
}

/**
 * F44 R11: two movements sharing the same non-null `undoneTransferId` are the
 * pair the human undid; the detection never links THEM again. The veto is of
 * the pair, not of the movement: each leg stays eligible for anyone else (R12).
 */
function isUndonePair(a: TransferCandidate, b: TransferCandidate): boolean {
  return a.undoneTransferId !== null && a.undoneTransferId === b.undoneTransferId
}

/**
 * Control flow of ONE pair's transaction: the `WHERE transferId: null` found
 * fewer than two legs, so a concurrent run took at least one of them. The pair
 * is skipped whole -- never half written (R11) -- and it is not an `AppError`:
 * it never leaves this module.
 */
class PairRacedError extends Error {
  constructor() {
    super('another run linked one of the two legs first; this pair is skipped')
  }
}

/**
 * Order in which the two sides of a resolvable group are matched position by
 * position (F41 R2): booking date, then position inside the day as the
 * statement brought it (a missing `daySequence` sorts as 0), then id.
 */
function byPairingOrder(a: TransferCandidate, b: TransferCandidate): number {
  const dateDiff = a.bookingDate.getTime() - b.bookingDate.getTime()
  if (dateDiff !== 0) return dateDiff
  const sequenceDiff = (a.daySequence ?? 0) - (b.daySequence ?? 0)
  if (sequenceDiff !== 0) return sequenceDiff
  return a.id - b.id
}

/**
 * Pure pairing (no database, no clock): decides which pairs are unambiguous
 * (R2, R5 of the F40) or resolvable as a group (R1 of the F41), and which
 * groups stay unlinked and reported.
 *
 * Per amount, it builds the bipartite expense-income graph with an edge when
 * the accounts differ and the dates are within the window. A pair is an edge
 * whose two ends have degree 1 (mutual uniqueness); a movement with no edge at
 * all (a Bizum, a third party) is silently left out. Every other connected
 * component with at least one edge is resolved position by position when it has
 * as many expenses as incomes AND every expense-income combination is a valid
 * match (F41 R1: the expenses are interchangeable, so no guessing happens);
 * otherwise the whole component is an ambiguous group, never partially paired
 * (F41 R3, R4). The input is sorted by id first, so the outcome never depends
 * on the order of arrival.
 */
export function pairTransferCandidates(candidates: TransferCandidate[]): {
  pairs: Array<[TransferCandidate, TransferCandidate]>
  ambiguous: AmbiguousTransferGroup[]
} {
  const byAmount = new Map<string, TransferCandidate[]>()
  for (const candidate of [...candidates].sort((a, b) => a.id - b.id)) {
    const group = byAmount.get(candidate.amount)
    if (group === undefined) {
      byAmount.set(candidate.amount, [candidate])
    } else {
      group.push(candidate)
    }
  }

  const pairs: Array<[TransferCandidate, TransferCandidate]> = []
  const ambiguous: AmbiguousTransferGroup[] = []

  for (const [amount, group] of byAmount) {
    const expenses = group.filter((movement) => movement.type === 'expense')
    const incomes = group.filter((movement) => movement.type === 'income')

    const edges: Array<[TransferCandidate, TransferCandidate]> = []
    const neighbours = new Map<number, TransferCandidate[]>()
    for (const expense of expenses) {
      for (const income of incomes) {
        if (expense.accountId === income.accountId) continue
        if (!withinWindow(expense, income)) continue
        if (isUndonePair(expense, income)) continue
        edges.push([expense, income])
        neighbours.set(expense.id, [...(neighbours.get(expense.id) ?? []), income])
        neighbours.set(income.id, [...(neighbours.get(income.id) ?? []), expense])
      }
    }

    // A resolved pair is a whole component by itself (degree 1 on both ends
    // means no other edge touches either leg), so taking it out here can never
    // split an ambiguous component.
    const resolved = new Set<number>()
    for (const [expense, income] of edges) {
      if (neighbours.get(expense.id)?.length === 1 && neighbours.get(income.id)?.length === 1) {
        pairs.push([expense, income])
        resolved.add(expense.id)
        resolved.add(income.id)
      }
    }

    const visited = new Set<number>()
    for (const start of group) {
      if (!neighbours.has(start.id) || resolved.has(start.id) || visited.has(start.id)) continue
      const component: TransferCandidate[] = []
      const queue = [start]
      visited.add(start.id)
      while (queue.length > 0) {
        const current = queue.shift()
        if (current === undefined) break
        component.push(current)
        for (const next of neighbours.get(current.id) ?? []) {
          if (!visited.has(next.id)) {
            visited.add(next.id)
            queue.push(next)
          }
        }
      }
      // F41 R1: a component with as many expenses as incomes where EVERY
      // expense-income combination is a valid match (complete bipartite
      // subgraph) is resolved by pairing both sides position by position (R2).
      // Any other component -- uneven counts (R3), some combination outside
      // the window / same account (R4), or an undone combination inside it
      // (F44 R11: where there is doubt nothing is chosen) -- stays ambiguous
      // whole.
      const componentExpenses = component.filter((movement) => movement.type === 'expense')
      const componentIncomes = component.filter((movement) => movement.type === 'income')
      const isResolvable =
        componentExpenses.length === componentIncomes.length &&
        componentExpenses.every((expense) =>
          componentIncomes.every(
            (income) =>
              expense.accountId !== income.accountId &&
              withinWindow(expense, income) &&
              !isUndonePair(expense, income),
          ),
        )
      if (isResolvable) {
        componentExpenses.sort(byPairingOrder)
        componentIncomes.sort(byPairingOrder)
        for (const [position, expense] of componentExpenses.entries()) {
          const income = componentIncomes[position]
          if (income !== undefined) pairs.push([expense, income])
        }
        continue
      }

      ambiguous.push({
        amount,
        movements: component
          .sort((a, b) => a.id - b.id)
          .map((movement) => ({
            id: movement.id,
            accountId: movement.accountId,
            accountAlias: movement.accountAlias,
            type: movement.type,
            bookingDate: movement.bookingDate.toISOString().slice(0, 10),
            description: movement.description,
          })),
      })
    }
  }

  return { pairs, ambiguous }
}

/**
 * Reads the candidates, pairs them and writes each pair (R1 half, R2, R3, R11).
 *
 * It reads the WHOLE table of unlinked non-neutral movements, not "what this
 * run imported": that is what makes a late mirror leg find the old lonely one
 * (R9), and what makes idempotency free -- a linked leg has `transferId !=
 * null`, never re-enters the candidates and can never be re-evaluated (R8).
 *
 * Each pair gets its own `randomUUID()` (R3) and its two legs are written in
 * ONE transaction whose WHERE keeps `transferId: null`: if fewer than two rows
 * match, a concurrent run got there first, the transaction rolls back and the
 * pair is skipped without touching the rest (same pattern as
 * `anchorAccountIfMissing`). Only `transferId` is ever written (R10).
 *
 * It NEVER throws (R15): a failure comes back inside `result.error`, with the
 * pairs that were already written still counted, so the import report that
 * carries this result is never lost to a detection problem.
 */
export async function detectTransfers(prisma: AppPrismaClient): Promise<TransferDetectionResult> {
  const result: TransferDetectionResult = { pairsCreated: 0, ambiguousCount: 0, ambiguous: [] }

  try {
    const rows = await prisma.movement.findMany({
      where: { transferId: null, type: { in: ['expense', 'income'] } },
      select: {
        id: true,
        accountId: true,
        type: true,
        amount: true,
        bookingDate: true,
        daySequence: true,
        description: true,
        undoneTransferId: true,
        account: { select: { alias: true } },
      },
    })
    const candidates: TransferCandidate[] = rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountAlias: row.account.alias,
      // The WHERE already left `neutral` out; this cast states it to the compiler.
      type: row.type as 'expense' | 'income',
      amount: row.amount.toFixed(2),
      bookingDate: row.bookingDate,
      daySequence: row.daySequence,
      description: row.description,
      undoneTransferId: row.undoneTransferId,
    }))

    const { pairs, ambiguous } = pairTransferCandidates(candidates)

    for (const [expense, income] of pairs) {
      const transferId = randomUUID()
      try {
        await prisma.$transaction(async (tx) => {
          const { count } = await tx.movement.updateMany({
            where: { id: { in: [expense.id, income.id] }, transferId: null },
            data: { transferId },
          })
          if (count !== 2) throw new PairRacedError()
        })
        result.pairsCreated += 1
      } catch (error) {
        if (!(error instanceof PairRacedError)) throw error
      }
    }

    result.ambiguous = ambiguous
    result.ambiguousCount = ambiguous.length
    return result
  } catch (error) {
    result.error = describeDetectionError(error)
    return result
  }
}

/**
 * Links two movements as the two legs of one transfer, by hand (F44). The
 * compatibility the detection demands — same amount, one `expense` and one
 * `income` (`neutral` is never a leg), different accounts — is mandatory here
 * too; the 3-day window is NOT (R8): the manual link exists precisely for what
 * the detection cannot resolve. `undoneTransferId` is never consulted either:
 * the human outranks his own past undo, and only `transferId` is written (R13)
 * — the old memory stays, harmless, vetoing only the automatic detection.
 *
 * Validation order: R6 (exists) → R5 (already linked) → R3 (types) → R4
 * (accounts) → R2 (amounts). The write reuses the transaction/race pattern of
 * `detectTransfers`: `WHERE transferId: null` on both legs, fewer than two
 * rows means another write got there first and the whole link rolls back.
 */
export async function linkTransfer(
  prisma: AppPrismaClient,
  input: LinkTransferBody,
): Promise<LinkTransferResult> {
  const [firstId, secondId] = input.movementIds
  if (firstId === secondId) {
    throw new ValidationError(`movementIds must be two different ids, got ${firstId} twice`)
  }

  const rows = await prisma.movement.findMany({
    where: { id: { in: [firstId, secondId] } },
    include: { account: true, category: true },
  })
  const first = rows.find((row) => row.id === firstId)
  const second = rows.find((row) => row.id === secondId)
  if (first === undefined || second === undefined) {
    const missing = [firstId, secondId].filter((id) => !rows.some((row) => row.id === id))
    throw new NotFoundError(`Movement ${missing.join(' and ')} not found`)
  }

  const alreadyLinked = [first, second].filter((movement) => movement.transferId !== null)
  if (alreadyLinked.length > 0) {
    const ids = alreadyLinked.map((movement) => movement.id).join(' and ')
    throw new ConflictError(`Movement ${ids} already belongs to a transfer; undo that pair first`)
  }

  const isOneExpenseOneIncome =
    (first.type === 'expense' && second.type === 'income') ||
    (first.type === 'income' && second.type === 'expense')
  if (!isOneExpenseOneIncome) {
    throw new ValidationError(
      `the two legs must be exactly one expense and one income, got '${first.type}' and '${second.type}'`,
    )
  }

  if (first.accountId === second.accountId) {
    throw new ValidationError('the two legs belong to the same account; a transfer crosses two')
  }

  if (!first.amount.equals(second.amount)) {
    throw new ValidationError(
      `the two amounts differ: ${first.amount.toFixed(2)} vs ${second.amount.toFixed(2)}`,
    )
  }

  const transferId = randomUUID()
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.movement.updateMany({
      where: { id: { in: [firstId, secondId] }, transferId: null },
      data: { transferId },
    })
    if (count !== 2) {
      throw new ConflictError(
        'another write linked one of the two movements first; nothing was written',
      )
    }
  })

  // Re-read after the write so the response carries what the database holds
  // (fresh transferId and updatedAt), in the order the caller sent the ids.
  const linked = await prisma.movement.findMany({
    where: { id: { in: [firstId, secondId] } },
    include: { account: true, category: true },
  })
  const linkedFirst = linked.find((row) => row.id === firstId)
  const linkedSecond = linked.find((row) => row.id === secondId)
  if (linkedFirst === undefined || linkedSecond === undefined) {
    throw new NotFoundError(`Movement ${firstId} or ${secondId} disappeared while linking`)
  }
  return {
    transferId,
    movements: [serializeMovement(linkedFirst), serializeMovement(linkedSecond)],
  }
}

/**
 * Undoes one pair — manual or from the detection, one single rule (F44 R9) —
 * in ONE statement over both legs at once: `transferId` back to null and the
 * undone-link memory (`undoneTransferId`) set to the value they just lost, so
 * the next detection run never re-links THEM (R11). Nothing else is written
 * (R13). By construction a transferId sits on exactly 2 rows; the count is not
 * re-checked against 2 so no impossible state gets invented.
 */
export async function unlinkTransfer(prisma: AppPrismaClient, transferId: string): Promise<void> {
  const { count } = await prisma.movement.updateMany({
    where: { transferId },
    data: { transferId: null, undoneTransferId: transferId },
  })
  if (count === 0) {
    throw new NotFoundError('No movement carries that transferId')
  }
}

/**
 * Same sanitizing pattern as the importer's `describeError`: an `AppError`
 * travels with its own stable code, anything else is reported generically so
 * no internal detail can leak into the report (R15).
 */
function describeDetectionError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_SERVER_ERROR', message: error.message }
  }
  return { code: 'INTERNAL_SERVER_ERROR', message: 'Unknown error' }
}
