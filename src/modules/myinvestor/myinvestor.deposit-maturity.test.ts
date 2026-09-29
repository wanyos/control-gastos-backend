import { describe, expect, it } from 'vitest'

import { isMyinvestorDepositMaturity } from './myinvestor.deposit-maturity.js'

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
