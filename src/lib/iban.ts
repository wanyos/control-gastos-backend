// The IBAN of an account: normalized and validated in ONE place (feature 21).
//
// WHY IT IS SHARED, when a bank format never is: an IBAN is not a format of any
// bank, it is the ISO 13616 identifier of an account — the same rule as the
// encoding (`lib/utf8.ts`, ADR-018) and the shape of the output
// (`lib/parsed-statement.ts`, ADR-013). Duplicating it per module is what let
// the same account exist twice: until today the IBAN was stored VERBATIM, so
// `ES91 2100 …` and `ES912100…` were two different accounts, in silence
// (measured against the real files on 2026-08-18; the report lives in
// `progress/explorations/`, and it is not named here because no file of `src/`
// other than `app.ts` may name a bank).
//
// The reasons are written in Spanish on purpose: they are read by the human who
// writes that line by hand in his statement files, like every other `reason` of
// the parsers. `message` is never a machine contract (`docs/api-contract.md`
// §Errores); the stable identifier is the `code` of `InvalidIbanError`.
import { InvalidIbanError } from '../errors/app-error.js'

/**
 * The canonical form of an IBAN: no whitespace at all — including the INTERIOR
 * spaces a human writes when grouping in fours — and uppercase. It is the
 * natural key of an account, so it is what gets compared and what gets stored.
 *
 * It does NOT validate: normalizing and judging are two steps, and the caller
 * that only needs to compare (the importer) should not have to catch.
 */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

/** Two letters of country, two check digits, then letters or digits. */
const ibanShape = /^[A-Z]{2}\d{2}[A-Z0-9]+$/

/** ISO 13616 allows 34 characters at most; no registered country goes below 15. */
const minIbanLength = 15
const maxIbanLength = 34

/**
 * Total IBAN length of each registered country. A country that is NOT here is
 * not rejected: it is only checked against the generic 15–34 range and the
 * check digits. Deliberate asymmetry — a wrong or missing row of this table
 * would reject a legitimate file, which is a worse failure than accepting an
 * IBAN of a country nobody in this project has.
 */
const ibanLengthByCountry = new Map<string, number>(
  (
    'AD24 AE23 AL28 AT20 AZ28 BA20 BE16 BG22 BH22 BR29 BY28 CH21 CR22 CY28 CZ24 ' +
    'DE22 DK18 DO28 EE20 EG29 ES24 FI18 FO18 FR27 GB22 GE22 GI23 GL18 GR27 GT28 ' +
    'HR21 HU28 IE22 IL23 IS26 IT27 JO30 KW30 KZ20 LB28 LC32 LI21 LT20 LU20 LV21 ' +
    'LY25 MC27 MD24 ME22 MK19 MR27 MT31 MU30 NL18 NO15 PK24 PL28 PS29 PT25 QA29 ' +
    'RO24 RS22 SA24 SC31 SE24 SI19 SK24 SM27 ST25 SV28 TL23 TN24 TR26 UA29 VA22 ' +
    'VG24 XK20'
  )
    .split(' ')
    .map((entry) => [entry.slice(0, 2), Number(entry.slice(2))]),
)

/**
 * Why this string is not an IBAN, or `null` when it is one. The input is
 * normalized first, so spacing and casing are never a reason.
 *
 * "Valid" means the four things, in this order (feature 21, delegated decision
 * nº 2): non-empty, the ISO shape, the length its country declares, and the
 * mod-97 check digits. The check digits are the only layer that catches a
 * MISTYPED digit, which is the case the human asked for.
 *
 * The value is NEVER echoed in the reason: it is an account number, and this
 * text ends up in an HTTP response and in the logs. The caller adds WHERE the
 * problem is (which line of which file), which is what makes it fixable.
 */
export function ibanRejectionReason(iban: string): string | null {
  const candidate = normalizeIban(iban)

  if (candidate === '') {
    return 'está vacío'
  }
  if (!ibanShape.test(candidate)) {
    return 'no tiene la forma de un iban (dos letras de país, dos dígitos de control y luego solo letras o números)'
  }

  const country = candidate.slice(0, 2)
  const expectedLength = ibanLengthByCountry.get(country)

  if (expectedLength !== undefined && candidate.length !== expectedLength) {
    return `un iban de ${country} tiene ${expectedLength} caracteres y este tiene ${candidate.length}`
  }
  if (
    expectedLength === undefined &&
    (candidate.length < minIbanLength || candidate.length > maxIbanLength)
  ) {
    return `un iban tiene entre ${minIbanLength} y ${maxIbanLength} caracteres y este tiene ${candidate.length}`
  }
  if (mod97(candidate) !== 1) {
    return 'el dígito de control no cuadra'
  }
  return null
}

/** `true` when the string is a well-formed IBAN with correct check digits. */
export function isValidIban(iban: string): boolean {
  return ibanRejectionReason(iban) === null
}

/**
 * The normalized IBAN, or `InvalidIbanError` naming the problem. `subject` says
 * WHERE it is (`el iban de la línea 2`), so the same sentence serves the file
 * path and the API: one rule, one diagnosis, two doors.
 */
export function requireValidIban(iban: string, subject = 'el iban'): string {
  const reason = ibanRejectionReason(iban)
  if (reason !== null) {
    throw new InvalidIbanError(`${subject} no es válido: ${reason}`)
  }
  return normalizeIban(iban)
}

/** A labelled preamble line as every bank parser reads it: where it was, and what it said. */
export interface PreambleIbanLine {
  line: number
  value: string
}

/**
 * Turns the `iban;<IBAN>` preamble line of a statement into the `accountIban`
 * of the common contract.
 *
 * An ABSENT or EMPTY line stays `null` — never `''` — exactly as before this
 * feature: the human simply did not write it, and the importer already knows
 * how to resolve the account without it. A line that IS there with something
 * that is not an IBAN next to it is another matter: it REJECTS THE WHOLE FILE
 * (`InvalidIbanError`), the same doctrine as a file that is not UTF-8
 * (ADR-018). Nothing is imported and no account is created from a datum the
 * check digits say is mistyped.
 */
export function readPreambleIban(line: PreambleIbanLine | null): string | null {
  if (line === null) {
    return null
  }
  const value = line.value.trim()
  if (value === '') {
    return null
  }
  return requireValidIban(value, `el iban de la línea ${line.line}`)
}

/**
 * ISO 7064 MOD 97-10 over the rearranged IBAN: the four leading characters move
 * to the end and each letter becomes its position in the alphabet plus 9
 * (A = 10 … Z = 35). Computed digit by digit because the resulting number is far
 * beyond what a `number` can hold.
 */
function mod97(iban: string): number {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let remainder = 0
  for (const character of rearranged) {
    const digits =
      character >= '0' && character <= '9'
        ? character
        : String(character.charCodeAt(0) - 'A'.charCodeAt(0) + 10)
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }
  return remainder
}
