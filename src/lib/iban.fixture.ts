// Synthetic IBANs for the tests (feature 21).
//
// Since the IBAN is VALIDATED at both doors, a test that needs an account can no
// longer make one up with `ES` plus a timestamp: those strings have the wrong
// length and check digits that do not add up, so the API would — correctly —
// reject them. This module builds one that is unique AND well formed.
//
// 🔒 Nothing here is anybody's account: the body is a counter plus a random
// number, and the check digits are COMPUTED, never copied from anywhere. The
// values are generated at run time, so no valid IBAN is ever written into a
// versioned file (the privacy guardian of feature 14 scans files, and the shape
// layer would flag exactly that).
import { isValidIban } from './iban.js'

let counter = 0

/**
 * A unique, well-formed IBAN of `country` (Spain by default): the body is
 * padded/truncated to the length that country declares and the check digits are
 * found by trying the 97 possible values against `isValidIban` — the same
 * validator production uses, so the fixture can never disagree with it.
 */
export function syntheticIban(country = 'ES', bodyLength = 20): string {
  counter += 1
  const body = `${Date.now()}${counter}${Math.floor(Math.random() * 1_000_000)}`
    .padStart(bodyLength, '0')
    .slice(-bodyLength)

  for (let check = 2; check <= 98; check += 1) {
    const candidate = `${country}${String(check).padStart(2, '0')}${body}`
    if (isValidIban(candidate)) {
      return candidate
    }
  }
  /* v8 ignore next -- unreachable: one of the 97 check digits always fits. */
  throw new Error('no check digits fit this body')
}

/**
 * The same IBAN with ONE digit mistyped: same country, same length, same shape,
 * only the check digits no longer add up. It is the case the human described —
 * "si me equivoco en un dígito" — and the only one the mod-97 layer catches.
 */
export function mistypedIban(iban: string): string {
  const last = iban.slice(-1)
  const replacement = last === '9' ? '8' : '9'
  const mistyped = `${iban.slice(0, -1)}${replacement}`
  /* v8 ignore next -- guards the fixture itself: it must NOT return a valid IBAN. */
  if (isValidIban(mistyped)) throw new Error('the mistyped IBAN is still valid')
  return mistyped
}
