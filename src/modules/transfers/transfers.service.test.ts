// Feature 40 `transfer-detection`: the pure pairing (R2, R4, R5) and the
// writer against the real database (R3, R8, R9, R10, R11, R15).
//
// 🔒 Everything here is synthetic: invented amounts, invented descriptions and
// `syntheticIban()` accounts, in the throwaway test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { AppError } from '../../errors/app-error.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import {
  detectTransfers,
  linkTransfer,
  pairTransferCandidates,
  unlinkTransfer,
} from './transfers.service.js'
import type { TransferCandidate } from './transfers.types.js'

let nextId = 1

function candidate(overrides: Partial<TransferCandidate> = {}): TransferCandidate {
  return {
    id: nextId++,
    accountId: 1,
    accountAlias: 'synthetic ···0001',
    type: 'expense',
    amount: '431.27',
    bookingDate: new Date('2031-03-10T00:00:00.000Z'),
    daySequence: null,
    description: 'SYNTHETIC TRANSFER LEG',
    undoneTransferId: null,
    ...overrides,
  }
}

describe('pairTransferCandidates (pure)', () => {
  it('pairs an unambiguous expense-income couple of the same amount (R2)', () => {
    const expense = candidate({ accountId: 1, type: 'expense' })
    const income = candidate({
      accountId: 2,
      accountAlias: 'synthetic ···0002',
      type: 'income',
      bookingDate: new Date('2031-03-11T00:00:00.000Z'),
    })

    const { pairs, ambiguous } = pairTransferCandidates([expense, income])

    expect(pairs).toEqual([[expense, income]])
    expect(ambiguous).toEqual([])
  })

  it('pairs at exactly the window edge and not one day beyond (R2)', () => {
    const expense = candidate({ type: 'expense', bookingDate: new Date('2031-03-10') })
    const atEdge = candidate({
      accountId: 2,
      type: 'income',
      bookingDate: new Date('2031-03-13'),
    })
    expect(pairTransferCandidates([expense, atEdge]).pairs).toHaveLength(1)

    const beyond = candidate({
      accountId: 2,
      type: 'income',
      bookingDate: new Date('2031-03-14'),
    })
    const { pairs, ambiguous } = pairTransferCandidates([expense, beyond])
    expect(pairs).toEqual([])
    // Out of the window there is no valid candidate at all: nothing to report.
    expect(ambiguous).toEqual([])
  })

  it('neither pairs nor reports a movement with no valid candidate (R4)', () => {
    const bizum = candidate({ type: 'expense', amount: '52.10' })
    const unrelatedIncome = candidate({ accountId: 2, type: 'income', amount: '900.00' })

    const { pairs, ambiguous } = pairTransferCandidates([bizum, unrelatedIncome])

    expect(pairs).toEqual([])
    expect(ambiguous).toEqual([])
  })

  it('pairs nobody when one leg has two valid candidates, and reports the group (R5, R6)', () => {
    const expense = candidate({ accountId: 1, type: 'expense' })
    const firstIncome = candidate({ accountId: 2, type: 'income' })
    const secondIncome = candidate({
      accountId: 3,
      accountAlias: 'synthetic ···0003',
      type: 'income',
      bookingDate: new Date('2031-03-12T00:00:00.000Z'),
    })

    const { pairs, ambiguous } = pairTransferCandidates([expense, firstIncome, secondIncome])

    expect(pairs).toEqual([])
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]?.amount).toBe('431.27')
    expect(ambiguous[0]?.movements.map((movement) => movement.id)).toEqual([
      expense.id,
      firstIncome.id,
      secondIncome.id,
    ])
    // The report carries what locating them needs (R6).
    expect(ambiguous[0]?.movements[0]).toMatchObject({
      accountId: 1,
      accountAlias: 'synthetic ···0001',
      type: 'expense',
      bookingDate: '2031-03-10',
      description: 'SYNTHETIC TRANSFER LEG',
    })
  })

  it('does not pair two legs of the same account (R2)', () => {
    const expense = candidate({ accountId: 1, type: 'expense' })
    const income = candidate({ accountId: 1, type: 'income' })

    const { pairs, ambiguous } = pairTransferCandidates([expense, income])

    expect(pairs).toEqual([])
    expect(ambiguous).toEqual([])
  })

  it('does not pair two movements of the same type (R2)', () => {
    const first = candidate({ accountId: 1, type: 'expense' })
    const second = candidate({ accountId: 2, type: 'expense' })

    const { pairs, ambiguous } = pairTransferCandidates([first, second])

    expect(pairs).toEqual([])
    expect(ambiguous).toEqual([])
  })

  it('resolves the clean pair and reports the tangled group of another amount (R2, R5)', () => {
    const cleanExpense = candidate({ accountId: 1, type: 'expense', amount: '77.40' })
    const cleanIncome = candidate({ accountId: 2, type: 'income', amount: '77.40' })
    const tangledExpenseA = candidate({ accountId: 1, type: 'expense', amount: '200.00' })
    const tangledExpenseB = candidate({ accountId: 3, type: 'expense', amount: '200.00' })
    const tangledIncome = candidate({ accountId: 2, type: 'income', amount: '200.00' })

    const { pairs, ambiguous } = pairTransferCandidates([
      tangledIncome,
      cleanIncome,
      tangledExpenseA,
      cleanExpense,
      tangledExpenseB,
    ])

    expect(pairs).toEqual([[cleanExpense, cleanIncome]])
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]?.movements.map((movement) => movement.id)).toEqual(
      [tangledExpenseA, tangledExpenseB, tangledIncome].map((movement) => movement.id),
    )
  })
})

// F41: a group with the same number of expenses as incomes where every
// expense-income combination is a valid match gets paired by date order instead
// of staying ambiguous. Fixtures are synthetic reproductions of the structure
// of the four real groups reported on 2026-09-03 (invented accounts and
// descriptions; round amounts are not personal data).
describe('pairTransferCandidates — groups with as many expenses as incomes (F41)', () => {
  it('pairs three same-day expenses with three same-day incomes following the order inside the day (R1, R2, R9)', () => {
    // Structure of real group 1: 3 x 1000.00 between two accounts, same day.
    const day = new Date('2031-06-10T00:00:00.000Z')
    const out1 = candidate({
      accountId: 1,
      type: 'expense',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 1,
    })
    const out2 = candidate({
      accountId: 1,
      type: 'expense',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 2,
    })
    const out3 = candidate({
      accountId: 1,
      type: 'expense',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 3,
    })
    // Incomes created out of order on purpose: the pairing must follow
    // daySequence, not the id (creation) order.
    const in2 = candidate({
      accountId: 2,
      type: 'income',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 2,
    })
    const in1 = candidate({
      accountId: 2,
      type: 'income',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 1,
    })
    const in3 = candidate({
      accountId: 2,
      type: 'income',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 3,
    })

    const { pairs, ambiguous } = pairTransferCandidates([out1, out2, out3, in2, in1, in3])

    expect(pairs).toEqual([
      [out1, in1],
      [out2, in2],
      [out3, in3],
    ])
    expect(ambiguous).toEqual([])
  })

  it('pairs two identical expenses with one income in each of two other accounts (R1, R9)', () => {
    // Structure of real group 2: two 1000.00 expenses from one account the
    // same day, one income in each of two different banks. The expenses are
    // interchangeable, so every combination is valid and the group resolves.
    const day = new Date('2031-07-03T00:00:00.000Z')
    const outA = candidate({
      accountId: 1,
      type: 'expense',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 1,
    })
    const outB = candidate({
      accountId: 1,
      type: 'expense',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 2,
    })
    const inB = candidate({
      accountId: 2,
      type: 'income',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 1,
    })
    const inC = candidate({
      accountId: 3,
      type: 'income',
      amount: '1000.00',
      bookingDate: day,
      daySequence: 1,
    })

    const { pairs, ambiguous } = pairTransferCandidates([outA, outB, inB, inC])

    // Same date and daySequence on the income side: the id breaks the tie.
    expect(pairs).toEqual([
      [outA, inB],
      [outB, inC],
    ])
    expect(ambiguous).toEqual([])
  })

  it('pairs two expenses on consecutive days with the income of their own day (R1, R2, R9)', () => {
    // Structure of real group 3: 2 x 3000.00 on consecutive days.
    const outDay1 = candidate({
      accountId: 1,
      type: 'expense',
      amount: '3000.00',
      bookingDate: new Date('2031-08-04T00:00:00.000Z'),
    })
    const outDay2 = candidate({
      accountId: 1,
      type: 'expense',
      amount: '3000.00',
      bookingDate: new Date('2031-08-05T00:00:00.000Z'),
    })
    // Incomes created in reverse date order: the pairing must follow the date.
    const inDay2 = candidate({
      accountId: 2,
      type: 'income',
      amount: '3000.00',
      bookingDate: new Date('2031-08-05T00:00:00.000Z'),
    })
    const inDay1 = candidate({
      accountId: 2,
      type: 'income',
      amount: '3000.00',
      bookingDate: new Date('2031-08-04T00:00:00.000Z'),
    })

    const { pairs, ambiguous } = pairTransferCandidates([outDay1, outDay2, inDay2, inDay1])

    expect(pairs).toEqual([
      [outDay1, inDay1],
      [outDay2, inDay2],
    ])
    expect(ambiguous).toEqual([])
  })

  it('leaves a group with more expenses than incomes whole in ambiguous, never partially paired (R3)', () => {
    // Structure of real group 4: 2 x 500.00 expenses and a single income.
    const day = new Date('2031-09-15T00:00:00.000Z')
    const outA = candidate({
      accountId: 1,
      type: 'expense',
      amount: '500.00',
      bookingDate: day,
      daySequence: 1,
    })
    const outB = candidate({
      accountId: 1,
      type: 'expense',
      amount: '500.00',
      bookingDate: day,
      daySequence: 2,
    })
    const lonelyIn = candidate({ accountId: 2, type: 'income', amount: '500.00', bookingDate: day })

    const { pairs, ambiguous } = pairTransferCandidates([outA, outB, lonelyIn])

    expect(pairs).toEqual([])
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]?.movements.map((movement) => movement.id)).toEqual([
      outA.id,
      outB.id,
      lonelyIn.id,
    ])
  })

  it('leaves a group with equal counts but one combination outside the window whole in ambiguous (R4)', () => {
    // Chained by the window: expense d1 reaches income d3, income d3 reaches
    // expense d4, expense d4 reaches income d7 -- but expense d1 and income d7
    // are 6 days apart, so pairing anything here would be guessing.
    const outDay1 = candidate({
      accountId: 1,
      type: 'expense',
      bookingDate: new Date('2031-10-01T00:00:00.000Z'),
    })
    const outDay4 = candidate({
      accountId: 1,
      type: 'expense',
      bookingDate: new Date('2031-10-04T00:00:00.000Z'),
    })
    const inDay3 = candidate({
      accountId: 2,
      type: 'income',
      bookingDate: new Date('2031-10-03T00:00:00.000Z'),
    })
    const inDay7 = candidate({
      accountId: 2,
      type: 'income',
      bookingDate: new Date('2031-10-07T00:00:00.000Z'),
    })

    const { pairs, ambiguous } = pairTransferCandidates([outDay1, outDay4, inDay3, inDay7])

    expect(pairs).toEqual([])
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]?.movements.map((movement) => movement.id)).toEqual([
      outDay1.id,
      outDay4.id,
      inDay3.id,
      inDay7.id,
    ])
  })

  it('breaks same-day ties deterministically: a missing daySequence sorts as 0, then the id decides (R2)', () => {
    const day = new Date('2031-11-20T00:00:00.000Z')
    // withSequence has the lower id but daySequence 1; withoutSequence sorts
    // first because a missing daySequence counts as 0.
    const withSequence = candidate({
      accountId: 1,
      type: 'expense',
      bookingDate: day,
      daySequence: 1,
    })
    const withoutSequence = candidate({
      accountId: 1,
      type: 'expense',
      bookingDate: day,
      daySequence: null,
    })
    // Both incomes lack daySequence: the id breaks their tie.
    const firstIn = candidate({ accountId: 2, type: 'income', bookingDate: day, daySequence: null })
    const secondIn = candidate({
      accountId: 2,
      type: 'income',
      bookingDate: day,
      daySequence: null,
    })

    const { pairs, ambiguous } = pairTransferCandidates([
      withSequence,
      withoutSequence,
      firstIn,
      secondIn,
    ])

    expect(pairs).toEqual([
      [withoutSequence, firstIn],
      [withSequence, secondIn],
    ])
    expect(ambiguous).toEqual([])
  })
})

describe('detectTransfers (database)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Transfer test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    accountId: number
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    description?: string
    bookingDate?: string
    daySequence?: number
    transferId?: string | null
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date(`${movement.bookingDate ?? '2031-03-10'}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount ?? '431.27',
        description: movement.description ?? 'SYNTHETIC TRANSFER LEG',
        bookingDate,
        valueDate: bookingDate,
        daySequence: movement.daySequence ?? 1,
        origin: 'imported',
        transferId: movement.transferId ?? null,
      },
    })
  }

  it('writes one fresh transferId per pair, never shared between pairs (R2, R3)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const firstOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const firstIn = await seedMovement({ accountId: target.id, type: 'income' })
    const secondOut = await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '58.03',
      bookingDate: '2031-04-02',
    })
    const secondIn = await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '58.03',
      bookingDate: '2031-04-03',
    })
    const lonely = await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '19.99',
      description: 'SYNTHETIC BIZUM OUT',
    })

    const result = await detectTransfers(app.prisma)

    expect(result.pairsCreated).toBe(2)
    expect(result.ambiguousCount).toBe(0)
    expect(result.error).toBeUndefined()

    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [firstOut.id, firstIn.id, secondOut.id, secondIn.id, lonely.id] } },
    })
    const byId = new Map(rows.map((row) => [row.id, row]))
    const firstTransferId = byId.get(firstOut.id)?.transferId
    expect(firstTransferId).toBeTruthy()
    expect(byId.get(firstIn.id)?.transferId).toBe(firstTransferId)
    const secondTransferId = byId.get(secondOut.id)?.transferId
    expect(secondTransferId).toBeTruthy()
    expect(byId.get(secondIn.id)?.transferId).toBe(secondTransferId)
    expect(secondTransferId).not.toBe(firstTransferId)
    expect(byId.get(lonely.id)?.transferId).toBeNull()
  })

  it('leaves exactly the same pairs on a second run (R8)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })

    const first = await detectTransfers(app.prisma)
    const afterFirst = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
      orderBy: { id: 'asc' },
    })
    const second = await detectTransfers(app.prisma)
    const afterSecond = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
      orderBy: { id: 'asc' },
    })

    expect(first.pairsCreated).toBe(1)
    expect(second.pairsCreated).toBe(0)
    expect(second.ambiguousCount).toBe(0)
    // Same transferId, same everything: a linked leg is never re-evaluated.
    expect(afterSecond).toEqual(afterFirst)
  })

  it('pairs a mirror leg that arrives in a later run with the old lonely one (R9)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const oldLeg = await seedMovement({ accountId: source.id, type: 'expense' })

    const firstRun = await detectTransfers(app.prisma)
    expect(firstRun.pairsCreated).toBe(0)

    const lateLeg = await seedMovement({ accountId: target.id, type: 'income' })
    const secondRun = await detectTransfers(app.prisma)

    expect(secondRun.pairsCreated).toBe(1)
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [oldLeg.id, lateLeg.id] } },
    })
    expect(rows[0]?.transferId).toBeTruthy()
    expect(rows[0]?.transferId).toBe(rows[1]?.transferId)
  })

  it('changes nothing but transferId (and updatedAt) on any row, and no account (R10)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    await app.prisma.account.update({
      where: { id: source.id },
      data: {
        balanceAnchor: '1500.00',
        balanceAnchorDate: new Date('2031-03-10T00:00:00.000Z'),
        balanceAnchorDaySequence: 1,
      },
    })
    await seedMovement({ accountId: source.id, type: 'expense' })
    await seedMovement({ accountId: target.id, type: 'income' })

    const movementsBefore = await app.prisma.movement.findMany({
      where: { accountId: { in: [source.id, target.id] } },
      orderBy: { id: 'asc' },
    })
    const accountsBefore = await app.prisma.account.findMany({
      where: { id: { in: [source.id, target.id] } },
      orderBy: { id: 'asc' },
    })

    const result = await detectTransfers(app.prisma)
    expect(result.pairsCreated).toBe(1)

    const movementsAfter = await app.prisma.movement.findMany({
      where: { accountId: { in: [source.id, target.id] } },
      orderBy: { id: 'asc' },
    })
    // The WHOLE row is compared, except the two columns the write itself moves:
    // `transferId` (the point of the feature) and `updatedAt` (@updatedAt of
    // Prisma advances on any update; stated in design §6).
    const strip = (row: (typeof movementsBefore)[number]) => {
      const { transferId: _transferId, updatedAt: _updatedAt, ...rest } = row
      return rest
    }
    expect(movementsAfter.map(strip)).toEqual(movementsBefore.map(strip))
    expect(movementsAfter.every((row) => row.transferId !== null)).toBe(true)
    // The accounts -- anchor included -- are byte-for-byte what they were.
    const accountsAfter = await app.prisma.account.findMany({
      where: { id: { in: [source.id, target.id] } },
      orderBy: { id: 'asc' },
    })
    expect(accountsAfter).toEqual(accountsBefore)
  })

  it('resolves a group with as many expenses as incomes idempotently, touching only transferId (F41 R6, R7)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    // A pair linked before this feature was deployed: it must stay untouched
    // even though it shares amount and is close in date to the new group.
    const preLinkedId = 'synthetic-pre-existing-transfer'
    const preLinkedOut = await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '1000.00',
      bookingDate: '2031-05-08',
      transferId: preLinkedId,
    })
    const preLinkedIn = await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '1000.00',
      bookingDate: '2031-05-08',
      transferId: preLinkedId,
    })
    // The group: 2 expenses and 2 incomes, all combinations valid. Under the
    // F40 rule alone this whole group stayed ambiguous (every leg has two
    // candidates); now it resolves day by day.
    const outDay10 = await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '1000.00',
      bookingDate: '2031-05-10',
    })
    const outDay11 = await seedMovement({
      accountId: source.id,
      type: 'expense',
      amount: '1000.00',
      bookingDate: '2031-05-11',
    })
    const inDay10 = await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '1000.00',
      bookingDate: '2031-05-10',
    })
    const inDay11 = await seedMovement({
      accountId: target.id,
      type: 'income',
      amount: '1000.00',
      bookingDate: '2031-05-11',
    })

    const allIds = [
      preLinkedOut.id,
      preLinkedIn.id,
      outDay10.id,
      outDay11.id,
      inDay10.id,
      inDay11.id,
    ]
    const before = await app.prisma.movement.findMany({
      where: { id: { in: allIds } },
      orderBy: { id: 'asc' },
    })

    const first = await detectTransfers(app.prisma)
    expect(first.pairsCreated).toBe(2)
    expect(first.ambiguousCount).toBe(0)
    expect(first.error).toBeUndefined()

    const afterFirst = await app.prisma.movement.findMany({
      where: { id: { in: allIds } },
      orderBy: { id: 'asc' },
    })
    const byId = new Map(afterFirst.map((row) => [row.id, row]))
    // Each new pair matches the leg of its own day and gets its own id.
    const day10TransferId = byId.get(outDay10.id)?.transferId
    const day11TransferId = byId.get(outDay11.id)?.transferId
    expect(day10TransferId).toBeTruthy()
    expect(byId.get(inDay10.id)?.transferId).toBe(day10TransferId)
    expect(day11TransferId).toBeTruthy()
    expect(byId.get(inDay11.id)?.transferId).toBe(day11TransferId)
    expect(day11TransferId).not.toBe(day10TransferId)
    // The pre-existing pair keeps the transferId it already had (R6).
    expect(byId.get(preLinkedOut.id)?.transferId).toBe(preLinkedId)
    expect(byId.get(preLinkedIn.id)?.transferId).toBe(preLinkedId)
    // Whole-row comparison: nothing but transferId (and updatedAt) moved (R7).
    const strip = (row: (typeof before)[number]) => {
      const { transferId: _transferId, updatedAt: _updatedAt, ...rest } = row
      return rest
    }
    expect(afterFirst.map(strip)).toEqual(before.map(strip))

    // Second run without new movements: exactly the same pairs (R6).
    const second = await detectTransfers(app.prisma)
    expect(second.pairsCreated).toBe(0)
    expect(second.ambiguousCount).toBe(0)
    const afterSecond = await app.prisma.movement.findMany({
      where: { id: { in: allIds } },
      orderBy: { id: 'asc' },
    })
    expect(afterSecond).toEqual(afterFirst)
  })

  it('writes each pair of a resolved group in its own transaction and skips a raced pair whole (F41 R8)', async () => {
    // 2 expenses + 2 incomes forming a resolvable group. The first pair's
    // transaction finds only one free leg (a concurrent run raced it): that
    // pair is skipped whole; the second pair still goes through untouched.
    const updateCalls: Array<{
      where: { id: { in: number[] }; transferId: null }
      data: { transferId: string }
    }> = []
    const fake = {
      movement: {
        findMany: async () => [
          {
            id: 1,
            accountId: 1,
            type: 'expense',
            amount: 431.27,
            bookingDate: new Date('2031-03-10T00:00:00.000Z'),
            daySequence: 1,
            description: 'SYNTHETIC TRANSFER LEG',
            undoneTransferId: null,
            account: { alias: 'synthetic ···0001' },
          },
          {
            id: 2,
            accountId: 1,
            type: 'expense',
            amount: 431.27,
            bookingDate: new Date('2031-03-11T00:00:00.000Z'),
            daySequence: 1,
            description: 'SYNTHETIC TRANSFER LEG',
            undoneTransferId: null,
            account: { alias: 'synthetic ···0001' },
          },
          {
            id: 3,
            accountId: 2,
            type: 'income',
            amount: 431.27,
            bookingDate: new Date('2031-03-10T00:00:00.000Z'),
            daySequence: 1,
            description: 'SYNTHETIC TRANSFER LEG',
            undoneTransferId: null,
            account: { alias: 'synthetic ···0002' },
          },
          {
            id: 4,
            accountId: 2,
            type: 'income',
            amount: 431.27,
            bookingDate: new Date('2031-03-11T00:00:00.000Z'),
            daySequence: 1,
            description: 'SYNTHETIC TRANSFER LEG',
            undoneTransferId: null,
            account: { alias: 'synthetic ···0002' },
          },
        ],
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          movement: {
            updateMany: async (args: (typeof updateCalls)[number]) => {
              updateCalls.push(args)
              return { count: updateCalls.length === 1 ? 1 : 2 }
            },
          },
        }),
    } as unknown as AppPrismaClient

    const result = await detectTransfers(fake)

    expect(updateCalls).toHaveLength(2)
    // One transaction per pair, both legs together, only free legs (transferId null).
    expect(updateCalls[0]?.where).toEqual({ id: { in: [1, 3] }, transferId: null })
    expect(updateCalls[1]?.where).toEqual({ id: { in: [2, 4] }, transferId: null })
    expect(updateCalls[0]?.data.transferId).toBeTruthy()
    expect(updateCalls[1]?.data.transferId).toBeTruthy()
    expect(updateCalls[1]?.data.transferId).not.toBe(updateCalls[0]?.data.transferId)
    // The raced first pair is skipped whole; the second one is still written.
    expect(result.pairsCreated).toBe(1)
    expect(result.error).toBeUndefined()
  })

  it('skips a pair whole when the transaction finds fewer than two free legs (R11)', async () => {
    // A raced pair: the WHERE `transferId: null` matches only one row. The
    // fake client answers like the database would after a concurrent run took
    // one leg; nothing is counted and nothing is reported as an error.
    const updateCalls: unknown[] = []
    const fake = {
      movement: {
        findMany: async () => [
          {
            id: 1,
            accountId: 1,
            type: 'expense',
            amount: 431.27,
            bookingDate: new Date('2031-03-10T00:00:00.000Z'),
            daySequence: 1,
            description: 'SYNTHETIC TRANSFER LEG',
            undoneTransferId: null,
            account: { alias: 'synthetic ···0001' },
          },
          {
            id: 2,
            accountId: 2,
            type: 'income',
            amount: 431.27,
            bookingDate: new Date('2031-03-10T00:00:00.000Z'),
            daySequence: 1,
            description: 'SYNTHETIC TRANSFER LEG',
            undoneTransferId: null,
            account: { alias: 'synthetic ···0002' },
          },
        ],
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          movement: {
            updateMany: async (args: unknown) => {
              updateCalls.push(args)
              return { count: 1 }
            },
          },
        }),
    } as unknown as AppPrismaClient

    const result = await detectTransfers(fake)

    expect(updateCalls).toHaveLength(1)
    expect(result.pairsCreated).toBe(0)
    expect(result.error).toBeUndefined()
  })

  it('never throws: an AppError travels in result.error with its own code (R15)', async () => {
    const fake = {
      movement: {
        findMany: async () => {
          throw new AppError('the detection read failed', 'SYNTHETIC_DETECTION_ERROR', 500)
        },
      },
    } as unknown as AppPrismaClient

    const result = await detectTransfers(fake)

    expect(result).toEqual({
      pairsCreated: 0,
      ambiguousCount: 0,
      ambiguous: [],
      error: { code: 'SYNTHETIC_DETECTION_ERROR', message: 'the detection read failed' },
    })
  })

  it('never throws: any other failure is reported generically (R15)', async () => {
    const fake = {
      movement: {
        findMany: async () => {
          throw new Error('connection lost')
        },
      },
    } as unknown as AppPrismaClient

    const result = await detectTransfers(fake)

    expect(result.error).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: 'connection lost' })
    expect(result.pairsCreated).toBe(0)
  })
})

// F44: the undone-pair veto in the pure pairing. A case with no undo at all is
// exactly the fixtures above: every candidate has `undoneTransferId: null` and
// the whole F40/F41 suite runs unchanged on top of the veto code.
describe('pairTransferCandidates — undone pairs (F44)', () => {
  it('never re-links two movements sharing the same undone transferId, and reports nothing (R11)', () => {
    const expense = candidate({ accountId: 1, type: 'expense', undoneTransferId: 'undone-u1' })
    const income = candidate({ accountId: 2, type: 'income', undoneTransferId: 'undone-u1' })

    const { pairs, ambiguous } = pairTransferCandidates([expense, income])

    // No valid candidate left at all: same treatment as an out-of-window leg.
    expect(pairs).toEqual([])
    expect(ambiguous).toEqual([])
  })

  it('still pairs a movement with an undone pair against a compatible third (R12)', () => {
    const expense = candidate({ accountId: 1, type: 'expense', undoneTransferId: 'undone-u2' })
    const oldPartner = candidate({ accountId: 2, type: 'income', undoneTransferId: 'undone-u2' })
    const third = candidate({ accountId: 3, type: 'income' })

    const { pairs, ambiguous } = pairTransferCandidates([expense, oldPartner, third])

    // The veto is of the PAIR: the expense finds the third leg on its own.
    expect(pairs).toEqual([[expense, third]])
    expect(ambiguous).toEqual([])
  })

  it('pairs two movements whose undone memories are different values (the veto needs the SAME one)', () => {
    const expense = candidate({ accountId: 1, type: 'expense', undoneTransferId: 'undone-a' })
    const income = candidate({ accountId: 2, type: 'income', undoneTransferId: 'undone-b' })

    const { pairs, ambiguous } = pairTransferCandidates([expense, income])

    expect(pairs).toEqual([[expense, income]])
    expect(ambiguous).toEqual([])
  })

  it('leaves an even group containing one undone combination ambiguous whole (R11)', () => {
    const day = new Date('2031-12-01T00:00:00.000Z')
    const out1 = candidate({
      accountId: 1,
      type: 'expense',
      bookingDate: day,
      daySequence: 1,
      undoneTransferId: 'undone-u3',
    })
    const out2 = candidate({ accountId: 1, type: 'expense', bookingDate: day, daySequence: 2 })
    const in1 = candidate({
      accountId: 2,
      type: 'income',
      bookingDate: day,
      daySequence: 1,
      undoneTransferId: 'undone-u3',
    })
    const in2 = candidate({ accountId: 2, type: 'income', bookingDate: day, daySequence: 2 })

    const { pairs, ambiguous } = pairTransferCandidates([out1, out2, in1, in2])

    // Without the undo this group resolves (F41). With one undone combination
    // inside, choosing any assignment would be guessing: it stays whole.
    expect(pairs).toEqual([])
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0]?.movements.map((movement) => movement.id)).toEqual([
      out1.id,
      out2.id,
      in1.id,
      in2.id,
    ])
  })
})

describe('linkTransfer / unlinkTransfer (F44, database)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Manual link test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  interface SeedMovement {
    accountId: number
    type?: 'expense' | 'income' | 'neutral'
    amount?: string
    description?: string
    bookingDate?: string
    transferId?: string | null
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date(`${movement.bookingDate ?? '2031-03-10'}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount ?? '512.44',
        description: movement.description ?? 'SYNTHETIC MANUAL LINK LEG',
        bookingDate,
        valueDate: bookingDate,
        daySequence: 1,
        origin: 'imported',
        transferId: movement.transferId ?? null,
      },
    })
  }

  it('links two compatible movements 60 days apart with one server-made transferId (R1, R8)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({
      accountId: source.id,
      type: 'expense',
      bookingDate: '2031-03-10',
    })
    const legIn = await seedMovement({
      accountId: target.id,
      type: 'income',
      bookingDate: '2031-05-09', // 60 days later: far outside the detection window.
    })

    const result = await linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] })

    expect(result.transferId).toBeTruthy()
    expect(result.movements.map((movement) => movement.id)).toEqual([legOut.id, legIn.id])
    expect(result.movements[0].transferId).toBe(result.transferId)
    expect(result.movements[1].transferId).toBe(result.transferId)
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    expect(rows.every((row) => row.transferId === result.transferId)).toBe(true)
  })

  it('rejects different amounts with both of them in the message, writing nothing (R2)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense', amount: '512.44' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income', amount: '512.45' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: expect.stringContaining('512.44'),
    })
    await expect(
      linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('512.45') })

    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    expect(rows.every((row) => row.transferId === null)).toBe(true)
  })

  it('rejects two legs of the same type (R3)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const first = await seedMovement({ accountId: source.id, type: 'expense' })
    const second = await seedMovement({ accountId: target.id, type: 'expense' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [first.id, second.id] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })

  it('rejects a neutral leg: it is never a transfer leg (R3)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense', amount: '0.00' })
    const neutral = await seedMovement({ accountId: target.id, type: 'neutral', amount: '0.00' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [legOut.id, neutral.id] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })

  it('rejects two legs of the same account (R4)', async () => {
    const account = await createAccount()
    const legOut = await seedMovement({ accountId: account.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: account.id, type: 'income' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })

  it('answers 409 when one leg is already linked, writing nothing on either (R5)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const linkedLeg = await seedMovement({
      accountId: source.id,
      type: 'expense',
      transferId: 'synthetic-existing-link',
    })
    const freeLeg = await seedMovement({ accountId: target.id, type: 'income' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [linkedLeg.id, freeLeg.id] }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })

    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [linkedLeg.id, freeLeg.id] } },
      orderBy: { id: 'asc' },
    })
    expect(rows[0]?.transferId).toBe('synthetic-existing-link')
    expect(rows[1]?.transferId).toBeNull()
  })

  it('answers 404 when one of the ids does not exist (R6)', async () => {
    const source = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [legOut.id, legOut.id + 999_983] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('rejects the same id twice (R7, the half the schema cannot say clearly)', async () => {
    const source = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })

    await expect(
      linkTransfer(app.prisma, { movementIds: [legOut.id, legOut.id] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })

  it('links two movements the human himself undid before: the memory only vetoes the detection', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })

    const linked = await linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] })
    await unlinkTransfer(app.prisma, linked.transferId)
    const relinked = await linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] })

    expect(relinked.transferId).toBeTruthy()
    expect(relinked.transferId).not.toBe(linked.transferId)
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    // The link is back and the old memory stays where it was, harmless.
    expect(rows.every((row) => row.transferId === relinked.transferId)).toBe(true)
    expect(rows.every((row) => row.undoneTransferId === linked.transferId)).toBe(true)
  })

  it('writes nothing but transferId when linking (and updatedAt, which Prisma writes) (R13)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })

    const before = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
      orderBy: { id: 'asc' },
    })

    await linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] })

    const after = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
      orderBy: { id: 'asc' },
    })
    const strip = (row: (typeof before)[number]) => {
      const { transferId: _transferId, updatedAt: _updatedAt, ...rest } = row
      return rest
    }
    expect(after.map(strip)).toEqual(before.map(strip))
    expect(after.every((row) => row.transferId !== null)).toBe(true)
    // No movement was created nor deleted.
    expect(after).toHaveLength(before.length)
  })

  it('undoes a pair in one statement: transferId to null, the memory set to the value lost (R9)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })
    const { transferId } = await linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] })

    await unlinkTransfer(app.prisma, transferId)

    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    expect(rows.every((row) => row.transferId === null)).toBe(true)
    expect(rows.every((row) => row.undoneTransferId === transferId)).toBe(true)
  })

  it('answers 404 when no movement carries that transferId (R10)', async () => {
    await expect(
      unlinkTransfer(app.prisma, 'synthetic-transfer-id-nobody-has'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('writes nothing but transferId and the undone memory when undoing (R13)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })
    const { transferId } = await linkTransfer(app.prisma, { movementIds: [legOut.id, legIn.id] })

    const before = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
      orderBy: { id: 'asc' },
    })

    await unlinkTransfer(app.prisma, transferId)

    const after = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
      orderBy: { id: 'asc' },
    })
    const strip = (row: (typeof before)[number]) => {
      const {
        transferId: _transferId,
        undoneTransferId: _undoneTransferId,
        updatedAt: _updatedAt,
        ...rest
      } = row
      return rest
    }
    expect(after.map(strip)).toEqual(before.map(strip))
    expect(after).toHaveLength(before.length)
  })

  it('keeps the undone pair apart on the next detection run, both still eligible for others (R11, R12)', async () => {
    const source = await createAccount()
    const target = await createAccount()
    const legOut = await seedMovement({ accountId: source.id, type: 'expense' })
    const legIn = await seedMovement({ accountId: target.id, type: 'income' })

    const firstRun = await detectTransfers(app.prisma)
    expect(firstRun.pairsCreated).toBe(1)
    const linkedRow = await app.prisma.movement.findUniqueOrThrow({ where: { id: legOut.id } })
    const detectedId = linkedRow.transferId
    expect(detectedId).toBeTruthy()
    if (detectedId === null) throw new Error('unreachable: just asserted')

    await unlinkTransfer(app.prisma, detectedId)
    const secondRun = await detectTransfers(app.prisma)

    expect(secondRun.pairsCreated).toBe(0)
    const rows = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id] } },
    })
    expect(rows.every((row) => row.transferId === null)).toBe(true)
    expect(rows.every((row) => row.undoneTransferId === detectedId)).toBe(true)

    // A third compatible leg in another account: the undone expense is still a
    // candidate and pairs with it (R12).
    const third = await createAccount()
    const thirdLeg = await seedMovement({ accountId: third.id, type: 'income' })
    const thirdRun = await detectTransfers(app.prisma)

    expect(thirdRun.pairsCreated).toBe(1)
    const afterThird = await app.prisma.movement.findMany({
      where: { id: { in: [legOut.id, legIn.id, thirdLeg.id] } },
      orderBy: { id: 'asc' },
    })
    const byId = new Map(afterThird.map((row) => [row.id, row]))
    expect(byId.get(legOut.id)?.transferId).toBeTruthy()
    expect(byId.get(legOut.id)?.transferId).toBe(byId.get(thirdLeg.id)?.transferId)
    expect(byId.get(legIn.id)?.transferId).toBeNull()
  })
})
