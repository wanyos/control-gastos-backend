import { describe, expect, it } from 'vitest'

import {
  classifyMyinvestorDepositMovement,
  isMyinvestorDepositMaturity,
} from './myinvestor.deposit-maturity.js'

// Every number in this file is invented (see docs/conventions.md §Tests).
describe('isMyinvestorDepositMaturity (feature 50, R11)', () => {
  it('recognizes a maturity description', () => {
    expect(isMyinvestorDepositMaturity('INTERESES DEP.: 000123')).toBe(true)
  })

  it('recognizes it with leading spaces', () => {
    expect(isMyinvestorDepositMaturity('   INTERESES DEP.: 000123')).toBe(true)
  })

  it('does not recognize the opening of a deposit', () => {
    expect(isMyinvestorDepositMaturity('APERTURA DEP.: 000123')).toBe(false)
  })

  it('does not recognize the cancellation of a deposit', () => {
    expect(isMyinvestorDepositMaturity('CANCELACION DEP:000123')).toBe(false)
  })

  it('does not recognize any other description', () => {
    expect(isMyinvestorDepositMaturity('SYNTHETIC GROCERY SHOP')).toBe(false)
    expect(isMyinvestorDepositMaturity('')).toBe(false)
  })
})

describe('classifyMyinvestorDepositMovement (feature 57, R1)', () => {
  it('classifies the opening of a deposit', () => {
    expect(classifyMyinvestorDepositMovement('APERTURA DEP.: 000123')).toBe('opening')
  })

  it('classifies the cancellation of a deposit', () => {
    expect(classifyMyinvestorDepositMovement('CANCELACION DEP:000123')).toBe('cancellation')
  })

  it('classifies the maturity of a deposit', () => {
    expect(classifyMyinvestorDepositMovement('INTERESES DEP.: 000123')).toBe('maturity')
  })

  it('classifies the three with leading spaces', () => {
    expect(classifyMyinvestorDepositMovement('  APERTURA DEP.: 000123')).toBe('opening')
    expect(classifyMyinvestorDepositMovement(' CANCELACION DEP:000123')).toBe('cancellation')
    expect(classifyMyinvestorDepositMovement('   INTERESES DEP.: 000123')).toBe('maturity')
  })

  it('returns null on a description that is not a deposit one', () => {
    expect(classifyMyinvestorDepositMovement('SYNTHETIC GROCERY SHOP')).toBeNull()
    expect(classifyMyinvestorDepositMovement('TRANSFER APERTURA DEP 000123')).toBeNull()
    expect(classifyMyinvestorDepositMovement('')).toBeNull()
  })
})
