import { describe, expect, it } from 'vitest'

import { parseBankAmount, parseHandwrittenAmount, parseIsoStatementDate } from './n26.format.js'

// Criterion 4: the amounts of this bank use a DOT as the decimal separator and
// carry the sign inside. Nothing is converted and nothing is guessed.
describe('parseBankAmount — the bank column (criterion 4)', () => {
  it('reads the shapes the export writes, sign included', () => {
    expect(parseBankAmount('-3.40')).toBe(-3.4)
    expect(parseBankAmount('1150')).toBe(1150)
    expect(parseBankAmount('0')).toBe(0)
    expect(parseBankAmount('-0.5')).toBe(-0.5)
    expect(parseBankAmount('+12.5')).toBe(12.5)
    expect(parseBankAmount(' -60 ')).toBe(-60)
  })

  it('returns null for anything that is not one of them, instead of guessing', () => {
    // A comma is not this bank's decimal separator, and reading `1,50` as one
    // and a half (or as one hundred and fifty) would be a silent invention.
    for (const value of ['mil trescientos', '', '1,50', '1.234,56', '12€', '--1', '1.2.3']) {
      expect(parseBankAmount(value)).toBeNull()
    }
  })
})

// The preamble line is written by the HUMAN, not by the bank: he writes Spanish
// while copying a figure out of a file whose numbers use the dot.
describe('parseHandwrittenAmount — the preamble line', () => {
  it('reads the Spanish way he writes it and the way this file writes it', () => {
    expect(parseHandwrittenAmount('1500,00')).toBe(1500)
    expect(parseHandwrittenAmount('1500.00')).toBe(1500)
    expect(parseHandwrittenAmount('1.500')).toBe(1500)
    expect(parseHandwrittenAmount('-2.000,50')).toBe(-2000.5)
    expect(parseHandwrittenAmount('1500,00 €')).toBe(1500)
    expect(parseHandwrittenAmount('0')).toBe(0)
  })

  it('returns null when it is not a number', () => {
    for (const value of ['mil quinientos', '', 'abc', '1,2,3']) {
      expect(parseHandwrittenAmount(value)).toBeNull()
    }
  })
})

// Criterion 3: the dates already come as ISO and are read WITHOUT conversion.
describe('parseIsoStatementDate (criterion 3)', () => {
  it('reads an ISO date as it is', () => {
    expect(parseIsoStatementDate('2026-07-01')).toBe('2026-07-01')
    expect(parseIsoStatementDate(' 2026-12-31 ')).toBe('2026-12-31')
  })

  it('rejects a day that does not exist instead of rolling it over', () => {
    expect(parseIsoStatementDate('2026-02-31')).toBeNull()
    expect(parseIsoStatementDate('2026-13-01')).toBeNull()
  })

  it('rejects any other shape, including the Spanish one', () => {
    for (const value of ['01/07/2026', '2026-7-1', '20260701', '', 'ayer']) {
      expect(parseIsoStatementDate(value)).toBeNull()
    }
  })
})
