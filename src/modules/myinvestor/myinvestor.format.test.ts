import { describe, expect, it } from 'vitest'

import { parseAmountText, parseStatementDate } from './myinvestor.format.js'

describe('parseAmountText (R10)', () => {
  it('reads the five numeric shapes that coexist in a single statement', () => {
    expect(parseAmountText('-50')).toBe(-50)
    expect(parseAmountText('-7,99')).toBe(-7.99)
    expect(parseAmountText('-5000')).toBe(-5000)
    expect(parseAmountText('-25.000')).toBe(-25000)
    expect(parseAmountText('25.149,95')).toBe(25149.95)
  })

  it('drops the currency symbol, the percent sign and the spaces', () => {
    expect(parseAmountText('1.312,72 €')).toBe(1312.72)
    expect(parseAmountText('-3,47 %')).toBe(-3.47)
    expect(parseAmountText(' 12,50 ')).toBe(12.5)
  })

  it('treats dots that group three digits as thousands, and any other dot as decimal', () => {
    expect(parseAmountText('1.312.000')).toBe(1312000)
    expect(parseAmountText('1312.72')).toBe(1312.72)
    expect(parseAmountText('1.5')).toBe(1.5)
  })

  it('returns a native finite number unchanged', () => {
    expect(parseAmountText(-7.99)).toBe(-7.99)
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
