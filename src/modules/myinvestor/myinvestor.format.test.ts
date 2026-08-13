import { describe, expect, it } from 'vitest'

import { parseAmountText, parseIsoDate, parseStatementDate } from './myinvestor.format.js'

describe('parseAmountText (R10)', () => {
  it('reads the five numeric shapes that coexist in a single statement', () => {
    expect(parseAmountText('-60')).toBe(-60)
    expect(parseAmountText('-9,49')).toBe(-9.49)
    expect(parseAmountText('-4200')).toBe(-4200)
    expect(parseAmountText('-31.000')).toBe(-31000)
    expect(parseAmountText('12.345,67')).toBe(12345.67)
  })

  it('drops the currency symbol, the percent sign and the spaces', () => {
    expect(parseAmountText('3.210,40 €')).toBe(3210.4)
    expect(parseAmountText('-3,47 %')).toBe(-3.47)
    expect(parseAmountText(' 12,50 ')).toBe(12.5)
  })

  it('treats dots that group three digits as thousands, and any other dot as decimal', () => {
    expect(parseAmountText('3.210.000')).toBe(3210000)
    expect(parseAmountText('3210.40')).toBe(3210.4)
    expect(parseAmountText('1.5')).toBe(1.5)
  })

  it('returns a native finite number unchanged', () => {
    expect(parseAmountText(-9.49)).toBe(-9.49)
    expect(parseAmountText(0)).toBe(0)
  })

  it('returns null for anything that is not a number', () => {
    expect(parseAmountText('mil trescientos')).toBeNull()
    expect(parseAmountText('')).toBeNull()
    expect(parseAmountText('12,3,4')).toBeNull()
    expect(parseAmountText(Number.NaN)).toBeNull()
    expect(parseAmountText(null)).toBeNull()
    expect(parseAmountText(undefined)).toBeNull()
  })
})

describe('parseStatementDate (R9)', () => {
  it('converts dd/mm/yyyy into ISO YYYY-MM-DD', () => {
    expect(parseStatementDate('01/08/2026')).toBe('2026-08-01')
    expect(parseStatementDate('6/8/2026')).toBe('2026-08-06')
    expect(parseStatementDate(' 31/12/2026 ')).toBe('2026-12-31')
  })

  it('rejects a day that does not exist instead of rolling it over', () => {
    expect(parseStatementDate('31/02/2026')).toBeNull()
    expect(parseStatementDate('00/01/2026')).toBeNull()
    expect(parseStatementDate('01/13/2026')).toBeNull()
  })

  it('returns null for a date in any other format', () => {
    expect(parseStatementDate('2026-08-01')).toBeNull()
    expect(parseStatementDate('01/08/26')).toBeNull()
    expect(parseStatementDate('')).toBeNull()
    expect(parseStatementDate(42)).toBeNull()
  })
})

describe('parseIsoDate (R28)', () => {
  it('accepts a strict YYYY-MM-DD and returns it unchanged', () => {
    expect(parseIsoDate('2027-04-15')).toBe('2027-04-15')
    expect(parseIsoDate('2026-08-31')).toBe('2026-08-31')
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29')
  })

  it('rejects the formats the bank web shows, instead of guessing the century', () => {
    expect(parseIsoDate('15/04/27')).toBeNull()
    expect(parseIsoDate('15/04/2027')).toBeNull()
  })

  it('rejects a day that does not exist instead of rolling it over', () => {
    expect(parseIsoDate('2026-13-01')).toBeNull()
    expect(parseIsoDate('2026-02-31')).toBeNull()
    expect(parseIsoDate('2026-02-29')).toBeNull()
    expect(parseIsoDate('2026-00-10')).toBeNull()
  })

  it('rejects loose shapes: padding, whitespace and non-strings', () => {
    expect(parseIsoDate('2026-8-31')).toBeNull()
    expect(parseIsoDate(' 2026-08-31 ')).toBeNull()
    expect(parseIsoDate('2026-08-31T00:00:00Z')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
    expect(parseIsoDate(20260831)).toBeNull()
    expect(parseIsoDate(null)).toBeNull()
    expect(parseIsoDate(undefined)).toBeNull()
  })
})
