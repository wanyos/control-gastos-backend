import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import type { BalanceAnchor } from '../movements/movements.types.js'
import { findPerLineMismatches, findStatementBalanceMismatch } from './import.balance.service.js'

// Every amount, date, IBAN and description below is INVENTED (ADR-017): a
// fixture only has to be well formed, never true.
const account = { id: 7, alias: 'Synthetic checking' }

function parsedMovement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
  return {
    bookingDate: '2026-07-10',
    valueDate: '2026-07-10',
    description: 'SYNTHETIC LINE',
    amount: -10,
    balance: null,
    currency: 'EUR',
    type: 'expense',
    daySequence: 1,
    ...overrides,
  }
}

function statementOf(
  movements: ParsedMovement[],
  accountBalance: number | null = null,
): ParsedStatement {
  return {
    bank: 'synthetic',
    accountIban: null,
    accountBalance,
    movements,
    unparsedRows: [],
  }
}

describe('findPerLineMismatches', () => {
  it('reports nothing when every jump between two balances is explained by the amount (R1)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
      parsedMovement({
        bookingDate: '2026-07-11',
        daySequence: 1,
        amount: 75,
        type: 'income',
        balance: 195,
      }),
      parsedMovement({ bookingDate: '2026-07-11', daySequence: 2, amount: -20, balance: 175 }),
    ])

    expect(findPerLineMismatches(statement, account)).toEqual([])
  })

  it('orders by (bookingDate, daySequence), not by the order of the file (R1)', () => {
    // Same chain as above, written newest first: it still adds up.
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-11', daySequence: 2, amount: -20, balance: 175 }),
      parsedMovement({
        bookingDate: '2026-07-11',
        daySequence: 1,
        amount: 75,
        type: 'income',
        balance: 195,
      }),
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
    ])

    expect(findPerLineMismatches(statement, account)).toEqual([])
  })

  it('reports a line whose amount does not explain the jump, with the five data (R1, R6)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
      parsedMovement({
        bookingDate: '2026-07-11',
        daySequence: 1,
        amount: 74,
        type: 'income',
        balance: 195,
      }),
    ])

    expect(findPerLineMismatches(statement, account)).toEqual([
      {
        accountId: 7,
        accountAlias: 'Synthetic checking',
        date: '2026-07-11',
        computed: '75.00',
        fromFile: '74.00',
        difference: '1.00',
        check: 'per-line',
      },
    ])
  })

  it('keeps the sign of the difference when the file says more than the jump (R6)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
      parsedMovement({
        bookingDate: '2026-07-11',
        daySequence: 1,
        amount: 76,
        type: 'income',
        balance: 195,
      }),
    ])

    const [reported] = findPerLineMismatches(statement, account)

    expect(reported?.difference).toBe('-1.00')
  })

  it('reports nothing for a pair where one of the two lines brings no balance (R2)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
      // No balance in the middle: the chain has a hole, which is not a deviation.
      parsedMovement({ bookingDate: '2026-07-11', daySequence: 1, amount: -5, balance: null }),
      parsedMovement({ bookingDate: '2026-07-12', daySequence: 1, amount: -40, balance: 60 }),
    ])

    expect(findPerLineMismatches(statement, account)).toEqual([])
  })

  it('reports nothing for a file where no line brings a balance at all (R9)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30 }),
      parsedMovement({ bookingDate: '2026-07-11', daySequence: 1, amount: 75, type: 'income' }),
    ])

    expect(findPerLineMismatches(statement, account)).toEqual([])
  })

  it('reports nothing for a file with a single line (nothing to pair)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
    ])

    expect(findPerLineMismatches(statement, account)).toEqual([])
  })

  it('treats a difference of one cent as a mismatch: the tolerance is zero (R5)', () => {
    const statement = statementOf([
      parsedMovement({ bookingDate: '2026-07-10', daySequence: 1, amount: -30, balance: 120 }),
      parsedMovement({
        bookingDate: '2026-07-11',
        daySequence: 1,
        amount: 74.99,
        type: 'income',
        balance: 195,
      }),
    ])

    const [reported] = findPerLineMismatches(statement, account)

    expect(reported?.difference).toBe('0.01')
  })
})

describe('findStatementBalanceMismatch', () => {
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
    const created = await app.prisma.account.create({
      data: {
        iban: syntheticIban(),
        bank: 'bankinter',
        alias: 'Synthetic checking',
        initialBalance: 0,
      },
    })
    createdAccountIds.push(created.id)
    return created
  }

  interface SeedMovement {
    accountId: number
    type?: 'income' | 'expense' | 'neutral'
    amount: string
    bookingDate: string
    daySequence: number
  }

  function seedMovement(movement: SeedMovement) {
    const bookingDate = new Date(`${movement.bookingDate}T00:00:00.000Z`)
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount,
        description: 'SYNTHETIC LINE',
        bookingDate,
        valueDate: bookingDate,
        daySequence: movement.daySequence,
        origin: 'imported',
      },
    })
  }

  const storedAnchor: BalanceAnchor = {
    amount: '1000.00',
    bookingDate: new Date('2026-07-10T00:00:00.000Z'),
    daySequence: 1,
  }

  /** The file whose lines the tests below seed: two movements and a preamble. */
  function statementWithPreamble(accountBalance: number): ParsedStatement {
    return statementOf(
      [
        parsedMovement({
          bookingDate: '2026-07-11',
          daySequence: 1,
          amount: 200,
          type: 'income',
        }),
        parsedMovement({ bookingDate: '2026-07-12', daySequence: 1, amount: -50 }),
      ],
      accountBalance,
    )
  }

  async function seedTheFileLines(accountId: number) {
    // The point of the anchor itself: it is already contained in the anchor and
    // must NOT be counted again.
    await seedMovement({
      accountId,
      amount: '400.00',
      bookingDate: '2026-07-10',
      daySequence: 1,
    })
    await seedMovement({
      accountId,
      type: 'income',
      amount: '200.00',
      bookingDate: '2026-07-11',
      daySequence: 1,
    })
    await seedMovement({
      accountId,
      amount: '50.00',
      bookingDate: '2026-07-12',
      daySequence: 1,
    })
  }

  it('returns null when the net after the anchor adds up to the preamble balance (R3, R5)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementWithPreamble(1150),
      account: { id: created.id, alias: created.alias },
      anchor: storedAnchor,
    })

    expect(result).toBeNull()
  })

  it('reports the mismatch when one more movement sits in the window (R3, R6)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)
    await seedMovement({
      accountId: created.id,
      type: 'income',
      amount: '30.00',
      bookingDate: '2026-07-11',
      daySequence: 2,
    })

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementWithPreamble(1150),
      account: { id: created.id, alias: created.alias },
      anchor: storedAnchor,
    })

    expect(result).toEqual({
      accountId: created.id,
      accountAlias: 'Synthetic checking',
      date: '2026-07-12',
      computed: '1180.00',
      fromFile: '1150.00',
      difference: '30.00',
      check: 'statement-balance',
    })
  })

  it('treats a difference of one cent as a mismatch: the tolerance is zero (R5)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementWithPreamble(1149.99),
      account: { id: created.id, alias: created.alias },
      anchor: storedAnchor,
    })

    expect(result?.difference).toBe('0.01')
  })

  it('returns null when the account had no stored anchor before this file (R4)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementWithPreamble(1150),
      account: { id: created.id, alias: created.alias },
      anchor: null,
    })

    expect(result).toBeNull()
  })

  it('returns null when the most recent movement of the file is not after the anchor (R4)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementWithPreamble(1150),
      account: { id: created.id, alias: created.alias },
      // Anchored later than the whole file: summing forward does not apply.
      anchor: {
        amount: '1000.00',
        bookingDate: new Date('2026-07-20T00:00:00.000Z'),
        daySequence: 1,
      },
    })

    expect(result).toBeNull()
  })

  it('returns null when the file brings no preamble balance (R9)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementOf(statementWithPreamble(1150).movements, null),
      account: { id: created.id, alias: created.alias },
      anchor: storedAnchor,
    })

    expect(result).toBeNull()
  })

  it('ignores the movements stored after the most recent line of the file (R3)', async () => {
    const created = await createAccount()
    await seedTheFileLines(created.id)
    // Newer than everything the file carries: it belongs to another statement.
    await seedMovement({
      accountId: created.id,
      type: 'income',
      amount: '500.00',
      bookingDate: '2026-07-15',
      daySequence: 1,
    })

    const result = await findStatementBalanceMismatch({
      prisma: app.prisma,
      statement: statementWithPreamble(1150),
      account: { id: created.id, alias: created.alias },
      anchor: storedAnchor,
    })

    expect(result).toBeNull()
  })
})
