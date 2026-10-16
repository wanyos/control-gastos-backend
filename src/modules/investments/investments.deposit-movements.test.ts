// How much each deposit movement counts in the totals (feature 57), on the pure
// function alone. Every figure, concept and deposit number in this file is
// invented (see docs/conventions.md §Tests): fixtures only need to be well
// formed, never true.
import { describe, expect, it } from 'vitest'

import { Prisma } from '../../generated/prisma/client.js'
import type { MovementType } from '../../generated/prisma/client.js'

import { resolveDepositMovements } from './investments.deposit-movements.js'
import type {
  DepositMaturityMatcherRegistry,
  DepositMovementInput,
  DepositMovementReading,
  DepositProductInput,
} from './investments.types.js'

// A fake bank: its texts are not those of any real one.
const matchers: DepositMaturityMatcherRegistry = [
  {
    bank: 'synthbank',
    isDepositMaturity: (text) => text.startsWith('SYNTH MATURITY'),
    classifyDepositMovement: (text) => {
      if (text.startsWith('SYNTH OPEN')) return 'opening'
      if (text.startsWith('SYNTH CANCEL')) return 'cancellation'
      if (text.startsWith('SYNTH MATURITY')) return 'maturity'
      return null
    },
  },
]

function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

let nextId = 100

interface Seed {
  id?: number
  accountId?: number
  bank?: string
  type: MovementType
  date: string
  daySequence?: number | null
  amount: string
  description: string
}

function movement(seed: Seed): DepositMovementInput {
  return {
    id: seed.id ?? nextId++,
    accountId: seed.accountId ?? 1,
    bank: seed.bank ?? 'synthbank',
    type: seed.type,
    bookingDate: toDate(seed.date),
    daySequence: seed.daySequence === undefined ? 1 : seed.daySequence,
    amount: new Prisma.Decimal(seed.amount),
    description: seed.description,
  }
}

const opening = (date: string, amount: string, extra: Partial<Seed> = {}) =>
  movement({ type: 'expense', date, amount, description: 'SYNTH OPEN 4401', ...extra })
const cancellation = (date: string, amount: string, extra: Partial<Seed> = {}) =>
  movement({ type: 'income', date, amount, description: 'SYNTH CANCEL 4401', ...extra })
const maturity = (date: string, amount: string, extra: Partial<Seed> = {}) =>
  movement({ type: 'income', date, amount, description: 'SYNTH MATURITY 4401', ...extra })

function product(
  maturityDate: string,
  principal: string | null,
  id = nextId++,
): DepositProductInput {
  return {
    id,
    bank: 'synthbank',
    maturityDate: toDate(maturityDate),
    principal: principal === null ? null : new Prisma.Decimal(principal),
  }
}

/** A reading as plain values, so `toEqual` compares figures and not Decimal objects. */
function plain(reading: DepositMovementReading | undefined) {
  expect(reading).toBeDefined()
  const value = reading as DepositMovementReading
  return {
    kind: value.kind,
    principal: value.principal === null ? null : value.principal.toFixed(2),
    counted: value.counted.toFixed(2),
    ambiguous: value.ambiguous,
    reason: value.reason,
    candidateMovementIds: value.candidateMovementIds,
  }
}

describe('resolveDepositMovements (feature 57)', () => {
  it('takes the principal of a maturity from its product file (R4)', () => {
    const due = maturity('2026-05-14', '3127.64')
    const readings = resolveDepositMovements([due], [product('2026-05-14', '3108.15')], matchers)

    expect(plain(readings.get(due.id))).toEqual({
      kind: 'maturity',
      principal: '3108.15',
      counted: '19.49',
      ambiguous: false,
      reason: null,
      candidateMovementIds: [],
    })
  })

  it('ignores a product file of another bank or another day (R4)', () => {
    const due = maturity('2026-05-14', '3127.64')
    const other = { ...product('2026-05-14', '3108.15'), bank: 'otherbank' }
    const readings = resolveDepositMovements(
      [due],
      [other, product('2026-05-15', '3108.15')],
      matchers,
    )

    expect(plain(readings.get(due.id))).toMatchObject({
      ambiguous: true,
      reason: 'principal_not_found',
      counted: '0.00',
    })
  })

  it('takes the principal from the earlier opening not yet returned (R5, R6)', () => {
    const open = opening('2026-02-11', '2715.30')
    const due = maturity('2026-05-12', '2731.88')
    const readings = resolveDepositMovements([due, open], [], matchers)

    expect(plain(readings.get(open.id))).toEqual({
      kind: 'opening',
      principal: '2715.30',
      counted: '0.00',
      ambiguous: false,
      reason: null,
      candidateMovementIds: [],
    })
    expect(plain(readings.get(due.id))).toMatchObject({
      principal: '2715.30',
      counted: '16.58',
      ambiguous: false,
    })
  })

  it('takes an opening of the same day only when it comes before the maturity', () => {
    // The maturity (sequence 2) comes after the first opening and before the
    // second one, which re-invests the money: only the first is a candidate.
    const earlier = opening('2026-01-20', '1854.27', { daySequence: 1 })
    const due = maturity('2026-04-20', '1866.03', { daySequence: 2 })
    const later = opening('2026-04-20', '1860.00', { daySequence: 3 })
    const readings = resolveDepositMovements([later, due, earlier], [], matchers)

    expect(plain(readings.get(due.id))).toMatchObject({ principal: '1854.27', counted: '11.76' })
  })

  it('a later opening of the same day is not a candidate even when it is the only one', () => {
    const due = maturity('2026-04-20', '1866.03', { daySequence: 1 })
    const later = opening('2026-04-20', '1860.00', { daySequence: 2 })
    const readings = resolveDepositMovements([later, due], [], matchers)

    expect(plain(readings.get(due.id))).toMatchObject({
      ambiguous: true,
      reason: 'principal_not_found',
    })
  })

  it('lets the amount condition pick one of two openings of different amounts (R5)', () => {
    // 1630.40 fails `M − C < C` (the interest would exceed the principal); only
    // the larger one is left.
    const small = opening('2026-01-08', '1630.40')
    const large = opening('2026-02-03', '3241.90')
    const due = maturity('2026-06-03', '3262.71')
    const readings = resolveDepositMovements([small, large, due], [], matchers)

    expect(plain(readings.get(due.id))).toMatchObject({
      principal: '3241.90',
      counted: '20.81',
      ambiguous: false,
    })
  })

  it('marks several_principals with the ascending ids when two amounts meet the condition (R11)', () => {
    const first = opening('2026-01-08', '2508.33', { id: 9002 })
    const second = opening('2026-02-03', '2519.70', { id: 9001 })
    const due = maturity('2026-06-03', '2533.12')
    const readings = resolveDepositMovements([first, second, due], [], matchers)

    expect(plain(readings.get(due.id))).toEqual({
      kind: 'maturity',
      principal: null,
      counted: '0.00',
      ambiguous: true,
      reason: 'several_principals',
      candidateMovementIds: [9001, 9002],
    })
  })

  it('marks principal_not_found when there is no opening and no product file (R7, R11)', () => {
    const due = maturity('2025-08-25', '2044.19')
    const readings = resolveDepositMovements([due], [], matchers)

    expect(plain(readings.get(due.id))).toEqual({
      kind: 'maturity',
      principal: null,
      counted: '0.00',
      ambiguous: true,
      reason: 'principal_not_found',
      candidateMovementIds: [],
    })
  })

  it('marks several_principals with no ids when two product files mature that day (R4, R11)', () => {
    const due = maturity('2026-05-14', '3127.64')
    const readings = resolveDepositMovements(
      [due],
      [product('2026-05-14', '3108.15'), product('2026-05-14', '3099.82')],
      matchers,
    )

    expect(plain(readings.get(due.id))).toMatchObject({
      ambiguous: true,
      reason: 'several_principals',
      candidateMovementIds: [],
      counted: '0.00',
    })
  })

  it('a cancellation returns its opening, which then serves no maturity (R6)', () => {
    const open = opening('2026-01-15', '1977.45')
    const cancel = cancellation('2026-02-02', '1977.45')
    const due = maturity('2026-04-15', '1988.91')
    const readings = resolveDepositMovements([open, cancel, due], [], matchers)

    expect(plain(readings.get(cancel.id))).toEqual({
      kind: 'cancellation',
      principal: '1977.45',
      counted: '0.00',
      ambiguous: false,
      reason: null,
      candidateMovementIds: [],
    })
    expect(plain(readings.get(due.id))).toMatchObject({ reason: 'principal_not_found' })
  })

  it('marks a cancellation with no opening of its amount as opening_not_found (R8)', () => {
    const open = opening('2026-01-15', '1977.45')
    const cancel = cancellation('2026-02-02', '1977.46')
    const readings = resolveDepositMovements([open, cancel], [], matchers)

    expect(plain(readings.get(cancel.id))).toEqual({
      kind: 'cancellation',
      principal: null,
      counted: '0.00',
      ambiguous: true,
      reason: 'opening_not_found',
      candidateMovementIds: [],
    })
  })

  it('an ambiguous maturity returns no opening (R7)', () => {
    const first = opening('2026-01-08', '2508.33')
    const second = opening('2026-02-03', '2519.70')
    const doubtful = maturity('2026-06-03', '2533.12', { daySequence: 1 })
    const cancel = cancellation('2026-06-10', '2508.33')
    const readings = resolveDepositMovements([first, second, doubtful, cancel], [], matchers)

    expect(plain(readings.get(doubtful.id))).toMatchObject({ ambiguous: true })
    // The first opening is still there for the cancellation to return.
    expect(plain(readings.get(cancel.id))).toMatchObject({ ambiguous: false, principal: '2508.33' })
  })

  it('a maturity with a product file returns the oldest opening of its principal (R6)', () => {
    const open = opening('2026-02-14', '3108.15')
    const due = maturity('2026-05-14', '3127.64')
    const cancel = cancellation('2026-05-20', '3108.15')
    const readings = resolveDepositMovements(
      [open, due, cancel],
      [product('2026-05-14', '3108.15')],
      matchers,
    )

    expect(plain(readings.get(due.id))).toMatchObject({ counted: '19.49' })
    expect(plain(readings.get(cancel.id))).toMatchObject({ reason: 'opening_not_found' })
  })

  it('keeps the openings of each account apart', () => {
    const open = opening('2026-02-11', '2715.30', { accountId: 1 })
    const due = maturity('2026-05-12', '2731.88', { accountId: 2 })
    const readings = resolveDepositMovements([open, due], [], matchers)

    expect(plain(readings.get(due.id))).toMatchObject({ reason: 'principal_not_found' })
  })

  it('a deposit text with an unexpected type is not a deposit movement (R1)', () => {
    const wrongOpening = movement({
      type: 'income',
      date: '2026-02-11',
      amount: '2715.30',
      description: 'SYNTH OPEN 4401',
    })
    const wrongMaturity = movement({
      type: 'expense',
      date: '2026-05-12',
      amount: '2731.88',
      description: 'SYNTH MATURITY 4401',
    })
    const readings = resolveDepositMovements([wrongOpening, wrongMaturity], [], matchers)

    expect(readings.size).toBe(0)
  })

  it('a movement of a bank without matcher or with another text is not a deposit one (R1)', () => {
    const otherBank = opening('2026-02-11', '2715.30', { bank: 'otherbank' })
    const grocery = movement({
      type: 'expense',
      date: '2026-02-11',
      amount: '37.18',
      description: 'SYNTHETIC GROCERY SHOP',
    })
    const readings = resolveDepositMovements([otherBank, grocery], [], matchers)

    expect(readings.size).toBe(0)
  })
})
