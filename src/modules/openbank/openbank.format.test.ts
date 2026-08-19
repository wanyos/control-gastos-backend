import { describe, expect, it } from 'vitest'

import { parseAmountText, parseStatementDate } from './openbank.format.js'

describe('parseStatementDate — DD/MM/AAAA to ISO (R6)', () => {
  it('converts the dates of the table', () => {
    expect(parseStatementDate('17/08/2026')).toBe('2026-08-17')
    expect(parseStatementDate('28/08/2024')).toBe('2024-08-28')
    expect(parseStatementDate('01/01/2025')).toBe('2025-01-01')
  })

  it('tolerates the surrounding spaces a cell may keep', () => {
    expect(parseStatementDate('  17/08/2026 ')).toBe('2026-08-17')
  })

  it('accepts a leap day that exists and rejects one that does not', () => {
    expect(parseStatementDate('29/02/2024')).toBe('2024-02-29')
    expect(parseStatementDate('29/02/2026')).toBeNull()
  })

  it('rejects an impossible day instead of rolling it over into the next month', () => {
    expect(parseStatementDate('31/02/2026')).toBeNull()
    expect(parseStatementDate('31/04/2026')).toBeNull()
    expect(parseStatementDate('00/08/2026')).toBeNull()
    expect(parseStatementDate('17/13/2026')).toBeNull()
  })

  it('rejects any other shape rather than guessing which number is the month', () => {
    for (const value of ['2026-08-17', '17/8/2026', '17-08-2026', '17/08/26', '', 'ayer']) {
      expect(parseStatementDate(value)).toBeNull()
    }
  })
})

describe('parseAmountText — dot for thousands, comma for decimals (R7)', () => {
  // Every figure of this block is INVENTED and checked against the gitignored
  // sample: an assertion is a versioned file like any other, and the first
  // version of these tests asserted on real amounts of the human's statement.
  it('reads the amounts of the table with their sign', () => {
    expect(parseAmountText('-37,49')).toBe(-37.49)
    expect(parseAmountText('-2.615,08')).toBe(-2615.08)
    expect(parseAmountText('947,62')).toBe(947.62)
    expect(parseAmountText('8.253,47')).toBe(8253.47)
  })

  it('keeps the cents exactly as written, with no rounding', () => {
    expect(parseAmountText('12.409,31')).toBe(12409.31)
    expect(parseAmountText('-88,77')).toBe(-88.77)
    expect(parseAmountText('14.780,16')).toBe(14780.16)
  })

  it('reads a zero as a zero, which the sign rule then calls neutral', () => {
    expect(parseAmountText('0,00')).toBe(0)
  })

  it('discards the currency glued to the balance of the preamble (R9)', () => {
    expect(parseAmountText('12.409,31 EUR')).toBe(12409.31)
    expect(parseAmountText('12.409,31€')).toBe(12409.31)
    expect(parseAmountText('-482,13 EUR')).toBe(-482.13)
  })

  it('reads a figure with no thousands and no decimals', () => {
    expect(parseAmountText('149')).toBe(149)
    expect(parseAmountText('2617,4')).toBe(2617.4)
  })

  it('refuses to guess a dot it cannot explain as a thousands separator', () => {
    // `1.23` is not how this bank writes anything; reading it as one point
    // twenty-three or as one hundred and twenty-three would both be inventions.
    for (const value of ['1.23', '1.2345', '1.234.5', '1,234,56']) {
      expect(parseAmountText(value)).toBeNull()
    }
  })

  it('returns null for anything that is not a number, so the row gets reported', () => {
    for (const value of ['', '   ', 'mil trescientos', 'EUR', '-', 'S/N']) {
      expect(parseAmountText(value)).toBeNull()
    }
  })
})
