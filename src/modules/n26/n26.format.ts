/**
 * Number and date normalizers of THIS bank only.
 *
 * They deliberately stay inside `modules/n26/` and never move up to `src/lib/`:
 * `docs/conventions.md` §Parsers de banco shares the SHAPE of the output, never
 * the code that reads a format.
 *
 * There are TWO amount readers here, and that is the point: the bank writes its
 * own column, the human writes the preamble line, and they do not write numbers
 * the same way.
 */

/**
 * Reads an amount of the bank's own amount column. This export writes plain
 * English numbers: an optional sign glued to the figure, a DOT as the decimal
 * separator and no thousands separator at all (verified over the whole sample:
 * every one of its rows matches this shape).
 *
 * Strict on purpose: anything else returns `null` so the caller reports the row
 * instead of guessing. Guessing here is expensive and silent — reading `1.234`
 * as one thousand two hundred when the bank meant one point two hundred and
 * thirty four (or the other way round) produces a number nobody will ever
 * notice is wrong.
 */
export function parseBankAmount(value: string): number | null {
  const text = value.trim()
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return null
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Reads an amount the HUMAN wrote by hand in a preamble line (`saldo;…`).
 *
 * He is Spanish and writes `1.234,56`, but he is also copying a figure out of a
 * file whose own numbers use the dot, so both readings have to be understood:
 *
 * 1. Whitespace, `€` and `%` are dropped.
 * 2. With a comma → Spanish: `.` groups thousands, `,` is the decimal.
 * 3. Without a comma, when the dots group exactly three digits → thousands.
 * 4. Otherwise the dot is the decimal separator.
 *
 * Rule 3 reads `1.500` as one thousand five hundred: that mistake is visible at
 * a glance, while the opposite one would silently drop three zeros. Returns
 * `null` when it is not a number, so the line is reported and never dropped.
 */
export function parseHandwrittenAmount(value: string): number | null {
  let text = value.replace(/[€%\s]/g, '')
  if (text === '') {
    return null
  }

  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '')
  }

  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return null
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Reads a date of this bank's statement: it already exports ISO `YYYY-MM-DD`,
 * so there is NO conversion to do and none is invented.
 *
 * The calendar day is validated all the same (`2026-02-31` is `null`, never
 * rolled over into March): a date that does not exist is a row to report, not a
 * date to fix.
 */
export function parseIsoStatementDate(value: string): string | null {
  const text = value.trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return text
}
