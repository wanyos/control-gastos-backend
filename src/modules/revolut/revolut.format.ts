/**
 * Number and date readers of THIS bank only.
 *
 * They stay inside `modules/revolut/` and never move up to `src/lib/`:
 * `docs/conventions.md` §Parsers de banco shares the SHAPE of the output, never
 * the code that reads a format.
 */

/**
 * Reads an amount of the bank's own `Importe` or `Saldo` column. The export
 * writes plain numbers: an optional sign glued to the figure, a DOT as the
 * decimal separator and no thousands separator (`-42.40`, `1000.00`; verified on
 * the export of 2026-09-15).
 *
 * Strict on purpose: anything else returns `null` so the caller reports the row
 * instead of guessing. Reading `1.234` the wrong way round produces a number
 * nobody notices is wrong.
 */
export function parseAmount(value: string): number | null {
  const text = value.trim()
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return null
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Reads a date-time of this export (`AAAA-MM-DD HH:MM:SS`) and returns ONLY the
 * calendar day, as ISO `YYYY-MM-DD`.
 *
 * The time is DISCARDED (feature 46, delegated decision nº 2): the contract has
 * no field for it, `bookingDate` and `valueDate` are days, and the order inside
 * a day is already carried by the order of the file (see `daySequence`). No time
 * zone is applied either: the file declares none, so the day is the one written.
 *
 * The time is still VALIDATED, and so is the calendar day (`2026-02-31` is
 * `null`, never rolled over into March): a value that does not have the shape the
 * bank writes is a row to report, not a date to fix. Returns `null` for anything
 * else, the empty string included.
 */
export function parseDateTimeAsDay(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) {
    return null
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) {
    return null
  }
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return `${yearText}-${monthText}-${dayText}`
}
