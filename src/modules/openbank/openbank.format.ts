/**
 * Number and date normalizers of THIS bank only.
 *
 * They deliberately stay inside `modules/openbank/` and are NOT imported from
 * the other bank whose file happens to use the very same Spanish convention:
 * `docs/conventions.md` §Parsers de banco shares the SHAPE of the output, never
 * the code that reads a format. Sharing them would mean that the day Openbank
 * changes how it writes a number, fixing it here breaks the other bank — the
 * regression this norm exists to prevent.
 */

/**
 * Reads a date of this bank's table (`DD/MM/AAAA`) into ISO `AAAA-MM-DD`.
 *
 * The calendar day is validated, so `31/02/2026` is `null` and never rolls over
 * into March: a date that does not exist is a row to report, not a date to fix.
 * Anything that is not exactly this shape returns `null` instead of being
 * guessed — an American reading of `03/08/2026` would be a wrong date nobody
 * would ever notice.
 */
export function parseStatementDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
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
  return `${match[3]}-${match[2]}-${match[1]}`
}

/**
 * Reads an amount as this bank writes it: DOT for thousands, COMMA for the
 * decimals and the sign in front (`-2.615,08`, `8.253,47`, `-37,49`).
 *
 * A trailing currency suffix is accepted and DISCARDED, because the balance of
 * the preamble carries one glued to the figure (`12.409,31 EUR`) while the
 * amounts of the table never do. Discarded, not stored: the file has no
 * currency column, so the movements keep the `''` the contract asks for when a
 * datum is not in the file, instead of an `EUR` we would have invented for 200
 * rows.
 *
 * (Every figure of this docstring is invented and checked against the real
 * sample: an example in a comment is a versioned file like any other, and the
 * first version of this one carried real amounts and the real balance of the
 * account. See the header of `openbank.fixture.ts`.)
 *
 * Strict about everything else, on purpose: `null` for anything that is not
 * this shape, so the caller reports the row instead of guessing. Reading
 * `1.234` as one point two hundred and thirty four when the bank meant one
 * thousand two hundred and thirty four produces a number nobody ever notices is
 * wrong — the mistake this project has already paid for once.
 */
export function parseAmountText(value: string): number | null {
  const text = value
    .trim()
    .replace(/\s*[A-Za-z€$£]+\.?$/, '')
    .replace(/\s+/g, '')
  if (text === '') {
    return null
  }
  // Either grouped in threes by dots, or no grouping at all; decimals after a
  // single comma. `1.23` is NOT a number of this bank and comes back `null`.
  if (!/^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(text)) {
    return null
  }
  const parsed = Number(text.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
