import { describe, expect, it } from 'vitest'

import { assignDaySequence } from './parsed-statement.js'
import type {
  ParsedMovement,
  ParsedMovementDraft,
  ParsedMovementType,
  ParsedStatement,
} from './parsed-statement.js'
import { deriveMovementTypeFromAmount } from '../modules/movements/movements.service.js'

function draft(bookingDate: string, amount: number, description: string): ParsedMovementDraft {
  return {
    bookingDate,
    valueDate: bookingDate,
    description,
    amount,
    balance: null,
    currency: 'EUR',
    type: deriveMovementTypeFromAmount(amount),
  }
}

describe('assignDaySequence', () => {
  it('numbers a newest-first file from the oldest movement of each day', () => {
    // Bankinter writes the most recent first: inside 2026-01-08 the LAST row of
    // the file is the oldest one, so it is the one that gets daySequence 1.
    const movements = assignDaySequence(
      [
        draft('2026-01-08', -30, 'THIRD OF THE DAY'),
        draft('2026-01-08', -20, 'SECOND OF THE DAY'),
        draft('2026-01-08', -10, 'FIRST OF THE DAY'),
        draft('2026-01-07', 100, 'ONLY ONE OF ITS DAY'),
      ],
      'newest-first',
    )

    expect(movements.map((movement) => [movement.description, movement.daySequence])).toEqual([
      ['THIRD OF THE DAY', 3],
      ['SECOND OF THE DAY', 2],
      ['FIRST OF THE DAY', 1],
      ['ONLY ONE OF ITS DAY', 1],
    ])
  })

  it('numbers an oldest-first file in file order, restarting on each day', () => {
    const movements = assignDaySequence(
      [
        draft('2026-01-07', 100, 'ONLY ONE OF ITS DAY'),
        draft('2026-01-08', -10, 'FIRST OF THE DAY'),
        draft('2026-01-08', -20, 'SECOND OF THE DAY'),
      ],
      'oldest-first',
    )

    expect(movements.map((movement) => movement.daySequence)).toEqual([1, 1, 2])
  })

  it('keeps the array in file order and only adds daySequence', () => {
    const input = [draft('2026-01-08', -10, 'A'), draft('2026-01-08', -20, 'B')]

    const movements = assignDaySequence(input, 'newest-first')

    expect(movements.map((movement) => movement.description)).toEqual(['A', 'B'])
    expect(movements[0]).toEqual({ ...input[0], daySequence: 2 })
  })

  it('returns an empty array for an empty file', () => {
    expect(assignDaySequence([], 'newest-first')).toEqual([])
  })
})

describe('the parsed statement contract', () => {
  it('represents an absent balance and an absent IBAN as null, not as 0 or ""', () => {
    const movement: ParsedMovement = { ...draft('2026-01-08', 10, 'NO BALANCE'), daySequence: 1 }
    const statement: ParsedStatement<'somebank'> = {
      bank: 'somebank',
      accountIban: null,
      movements: [movement],
      unparsedRows: [],
    }

    expect(statement.movements[0].balance).toBeNull()
    expect(statement.movements[0].balance).not.toBe(0)
    expect(statement.accountIban).toBeNull()
    expect(statement.accountIban).not.toBe('')
    // A bank that DOES report them fills the very same fields with a value.
    expect({ ...movement, balance: 6149.06 }.balance).toBe(6149.06)
  })

  it('accepts the three values of the domain helper as its movement type', () => {
    // Compile-time proof that the contract type and the database enum agree:
    // the helper returns Prisma's MovementType and it is assignable here.
    const expense: ParsedMovementType = deriveMovementTypeFromAmount(-1)
    const income: ParsedMovementType = deriveMovementTypeFromAmount(1)
    const neutral: ParsedMovementType = deriveMovementTypeFromAmount(0)

    expect([expense, income, neutral]).toEqual(['expense', 'income', 'neutral'])
  })
})
