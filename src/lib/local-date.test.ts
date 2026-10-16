import { describe, expect, it } from 'vitest'

import { currentMonthInMadrid, todayInMadrid, todayInMadridAsDate } from './local-date.js'

describe('todayInMadrid', () => {
  it('says the 1st of the month at 00:30 Madrid time, when UTC still says the 31st', () => {
    // 2031-07-31T22:30Z is 2031-08-01 00:30 in Madrid (CEST, UTC+2).
    const now = new Date('2031-07-31T22:30:00.000Z')
    expect(todayInMadrid(now)).toBe('2031-08-01')
    expect(currentMonthInMadrid(now)).toBe('2031-08')
    expect(todayInMadridAsDate(now).toISOString()).toBe('2031-08-01T00:00:00.000Z')
  })

  it('agrees with UTC during the day', () => {
    expect(todayInMadrid(new Date('2031-03-10T12:00:00.000Z'))).toBe('2031-03-10')
  })

  it('handles winter time too (UTC+1)', () => {
    // 2031-12-31T23:30Z is 2032-01-01 00:30 in Madrid (CET).
    expect(todayInMadrid(new Date('2031-12-31T23:30:00.000Z'))).toBe('2032-01-01')
  })
})
