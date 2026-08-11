/**
 * Number and date normalizers shared BETWEEN THE ENTRIES OF THIS BANK ONLY.
 *
 * They deliberately stay inside `modules/myinvestor/` and never move up to
 * `src/lib/`: `docs/conventions.md` §Parsers de banco shares the SHAPE of the
 * output, never the code that reads a format. A format changes without notice,
 * and a shared reader turns one bank's change into everyone's regression.
 */

/**
 * Parses a MyInvestor amount into a signed number. The export mixes the
 * thousands separator inside the very same file (`-50`, `-7,99`, `-5000`,
 * `-25.000`, `25.149,95`), so one single rule covers all of them:
 *
 * 1. `€`, `%` and whitespace are dropped.
 * 2. With a comma → Spanish format: `.` groups thousands, `,` is the decimal.
 * 3. Without a comma, when the dots group exactly three digits → thousands.
 * 4. Otherwise the dot is the decimal separator.
 *
 * Rule 3 reads `"1.500"` as one thousand five hundred, because these numbers
 * come from a Spanish UI where the dot always groups thousands, and because
 * that mistake is visible at a glance while the opposite one (`25.000` → 25)
 * would silently drop three zeros.
 *
 * Returns `null` when the value is not a number, so the caller can report the
 * row instead of inventing a figure.
 */
export function parseAmountText(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }

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
 * Parses a statement date `dd/mm/yyyy` into ISO `YYYY-MM-DD`, validating it is
 * a real calendar day: `31/02/2026` is `null`, never rolled over into March.
 */
export function parseStatementDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) {
    return null
  }
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
