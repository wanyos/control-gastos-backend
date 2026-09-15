import { describe, expect, it } from 'vitest'

import { parseAmount, parseDateTimeAsDay } from './revolut.format.js'

describe('parseAmount (C7)', () => {
  it('reads a signed amount with a dot as the decimal separator', () => {
    expect(parseAmount('-42.40')).toBe(-42.4)
    expect(parseAmount('1000.00')).toBe(1000)
    expect(parseAmount('+3.5')).toBe(3.5)
    expect(parseAmount('0.00')).toBe(0)
    expect(parseAmount(' 7 ')).toBe(7)
  })

  it('returns null for anything else instead of guessing', () => {
    for (const value of ['', 'mil', '1,50', '1.234,56', '1 000.00', '12.', '€5', '--1']) {
      expect(parseAmount(value), value).toBeNull()
    }
  })
})

describe('parseDateTimeAsDay (C3)', () => {
  it('returns the calendar day and discards the time', () => {
    expect(parseDateTimeAsDay('2026-07-01 23:59:59')).toBe('2026-07-01')
    expect(parseDateTimeAsDay('2026-07-01 00:00:00')).toBe('2026-07-01')
  })

  it('applies no time zone: the day is the one written', () => {
    // A time near midnight would move to another day under any zone conversion.
    expect(parseDateTimeAsDay('2026-12-31 23:30:00')).toBe('2026-12-31')
  })

  it('rejects an impossible calendar day instead of rolling it over', () => {
    expect(parseDateTimeAsDay('2026-02-31 10:00:00')).toBeNull()
  })

  it('rejects an impossible time', () => {
    expect(parseDateTimeAsDay('2026-07-01 24:00:00')).toBeNull()
    expect(parseDateTimeAsDay('2026-07-01 10:60:00')).toBeNull()
  })

  it('rejects any other shape, the empty cell of a reversed row included', () => {
    for (const value of ['', '2026-07-01', '01/07/2026 10:00:00', '2026-07-01T10:00:00']) {
      expect(parseDateTimeAsDay(value), value).toBeNull()
    }
  })
})
