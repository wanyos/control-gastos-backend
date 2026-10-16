/**
 * "Today" and "this month" in the calendar of Spain (`Europe/Madrid`), as
 * `YYYY-MM-DD` and `YYYY-MM`.
 *
 * `bookingDate` is the calendar day the bank writes, in Spanish time; a
 * movement booked on the 1st at 00:30 in Madrid is still the 1st. Reading the
 * clock in UTC instead (`new Date().toISOString()`) says "yesterday" between
 * midnight and 01:00/02:00 Madrid time, so on the first night of a month
 * `GET /api/overview` answered with the previous month and a deposit maturing
 * today was not counted yet. Found on 2026-10-16.
 */
const madridDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `YYYY-MM-DD` of today in Madrid. `now` is injectable for tests. */
export function todayInMadrid(now: Date = new Date()): string {
  // en-CA already formats as YYYY-MM-DD; reading the parts avoids relying on it.
  const parts = madridDay.formatToParts(now)
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

/** `YYYY-MM` of today in Madrid. */
export function currentMonthInMadrid(now: Date = new Date()): string {
  return todayInMadrid(now).slice(0, 7)
}

/** Midnight UTC of today in Madrid: the clock `bookingDate` and the photos use. */
export function todayInMadridAsDate(now: Date = new Date()): Date {
  return new Date(`${todayInMadrid(now)}T00:00:00.000Z`)
}
