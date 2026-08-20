import type { ParsedSavingsAccount, TradeRepublicProductType } from './trade-republic.types.js'

/**
 * Pure parser of ONE hand-written remunerated-account file (feature 20, ADR-024).
 *
 * Trade Republic enters the system WITHOUT a parser of what the bank emits: its
 * statement is a `.pdf` whose table does not survive text extraction, and the
 * account has one or two entries a month (all of them interest payments), so the
 * human writes the photo of the month by hand — like the MyInvestor products.
 *
 * The FORM of that file is copied from MyInvestor deliberately (native JSON
 * numbers, strict `YYYY-MM-DD` dates, unknown keys are an error, `_` keys are his
 * notes) and the CODE is not: this file imports nothing from any other bank
 * module, and a guardian of `src/architecture.test.ts` turns the suite red the
 * day someone does.
 *
 * It computes NOTHING: every number comes out exactly as written, with no
 * rounding and no reformatting (R7). The arithmetic check of `checkBalanceEquation`
 * is a VERIFICATION, not a computation: it never changes a value it returns.
 *
 * It RETURNS the reason instead of throwing (same criterion as ADR-016 §9.3): a
 * badly written file is not an exception of the request, it is part of its
 * answer. Every problem of the same file is accumulated into a SINGLE reason
 * (R12), so fixing a file with three mistakes takes one trip.
 */

const productTypes: TradeRepublicProductType[] = ['savings_account']

/** Every key the template carries. Anything else (not starting with `_`) is an error. */
const allowedKeys = [
  'type',
  'name',
  'date',
  'openedAt',
  'currency',
  'openingBalance',
  'moneyIn',
  'moneyOut',
  'balance',
  'interest',
  'closedAt',
]

/** The five amounts the arithmetic check of R17 works on, in reading order. */
const equationKeys = ['openingBalance', 'moneyIn', 'moneyOut', 'interest', 'balance'] as const

export function parseTradeRepublicProduct(
  file: string,
  content: string,
): ParsedSavingsAccount | { reason: string } {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch (error) {
    return { reason: `JSON inválido: ${error instanceof Error ? error.message : 'sin detalle'}` }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { reason: `se espera un objeto con una sola cuenta, recibido ${display(raw)}` }
  }

  const source = raw as Record<string, unknown>
  const problems: string[] = []
  const missing: string[] = []
  const markers: string[] = []
  const readNumber = (key: string, required: boolean) =>
    readNumberField(source, key, required, problems, missing, markers)
  const readIso = (key: string, required: boolean) =>
    readIsoField(source, key, required, problems, missing, markers)

  const type = readType(source, problems, markers)
  const name = readName(source, problems, missing, markers)
  const date = readIso('date', true)
  const currency = readCurrency(source, problems, markers)
  // Mandatory on every product since feature 15: its absence lands in `missing`
  // and is reported by name inside the SINGLE reason of the file.
  const openedAt = readIso('openedAt', true)
  const closedAt = readIso('closedAt', false)

  const openingBalance = readNumber('openingBalance', true)
  const moneyIn = readNumber('moneyIn', true)
  const moneyOut = readNumber('moneyOut', true)
  const balance = readNumber('balance', true)
  const interest = readNumber('interest', true)

  reportUnknownKeys(source, problems)
  if (missing.length > 0) {
    problems.unshift(`faltan campos obligatorios: ${missing.join(', ')}`)
  }
  // First of the reason, because it is the one that explains all the rest: the
  // template was copied and (part of) it was never filled in (R2).
  if (markers.length > 0) {
    problems.unshift(
      `campos sin sustituir, siguen con el marcador <…> de la plantilla: ${markers.join(', ')}`,
    )
  }

  // LAST check of the parser, and only when the five amounts are valid numbers
  // (R18): a mismatch computed over incomplete data is noise that hides the real
  // problem, and it would send the human hunting an arithmetic error where there
  // is only a field he did not write.
  if (
    openingBalance !== null &&
    moneyIn !== null &&
    moneyOut !== null &&
    balance !== null &&
    interest !== null
  ) {
    const mismatch = checkBalanceEquation({
      openingBalance,
      moneyIn,
      moneyOut,
      interest,
      balance,
    })
    if (mismatch !== null) {
      problems.push(mismatch)
    }
  }

  if (
    problems.length > 0 ||
    type === null ||
    name === null ||
    date === null ||
    openedAt === null ||
    openingBalance === null ||
    moneyIn === null ||
    moneyOut === null ||
    balance === null ||
    interest === null
  ) {
    return { reason: problems.join('; ') || 'archivo de cuenta no interpretable' }
  }

  return {
    bank: 'trade-republic',
    file,
    type,
    name,
    date,
    openedAt,
    currency,
    openingBalance,
    moneyIn,
    moneyOut,
    balance,
    interest,
    closedAt,
  }
}

/**
 * The file checks ITSELF (R17, decision of the human of 2026-08-19):
 *
 *     openingBalance + moneyIn − moneyOut + interest  ==  balance
 *
 * `moneyIn` is what came in during the month WITHOUT the interest, which goes
 * apart in `interest`: counting it in both would make the equation fail every
 * good month of an account whose only entry is the payment.
 *
 * It returns the reason when it does NOT add up (the file is REJECTED, it is not
 * a warning: a warning inside a `products.json` nobody reads every month does not
 * stop the bad datum from entering) and `null` when it does.
 *
 * The comparison is done in WHOLE CENTS: `0.1 + 0.2 !== 0.3` in floating point,
 * and adding five amounts in euros leaves residues of the order of `1e-13` that
 * would reject perfectly good months. A tolerance of exactly ONE cent is allowed,
 * because the five amounts already come rounded to the cent by the bank; more
 * margin would let a real typo through and less would reject the bank's own
 * rounding. The cents are LOCAL to this check: nothing it touches is returned.
 */
export function checkBalanceEquation(
  amounts: Pick<
    ParsedSavingsAccount,
    'openingBalance' | 'moneyIn' | 'moneyOut' | 'interest' | 'balance'
  >,
): string | null {
  const cents = (value: number) => Math.round(value * 100)
  const expectedCents =
    cents(amounts.openingBalance) +
    cents(amounts.moneyIn) -
    cents(amounts.moneyOut) +
    cents(amounts.interest)
  const deviationCents = cents(amounts.balance) - expectedCents
  if (Math.abs(deviationCents) <= toleranceCents) {
    return null
  }

  // The parser cannot know WHICH of the five is wrong, so it shows all five: that
  // is what lets the human see at a glance which one grates. This is the message
  // he reads when he mistypes, so it says the deviation with its sign first.
  const fields = equationKeys.map((key) => `${key} ${euros(amounts[key])}`).join(', ')
  return (
    `los importes no cuadran: se desvía ${euros(deviationCents / 100, true)} € ` +
    `(saldo final esperado ${euros(expectedCents / 100)}, escrito ${euros(amounts.balance)}); ` +
    `saldo inicial + entradas - salidas + intereses = saldo final; ${fields}`
  )
}

/** One cent of margin, no more and no less (design §2.1a). */
const toleranceCents = 1

/**
 * An amount as the message shows it: two decimals, and the sign written out when
 * it is a deviation (`+0.20` reads as «there is 20 cents too much»).
 */
function euros(value: number, signed = false): string {
  const text = value.toFixed(2)
  return signed && value > 0 ? `+${text}` : text
}

/**
 * A value that is still the `<…>` of the template.
 *
 * It needs its OWN check, and the spec's assumption that «`<…>` is already
 * invalid everywhere» does not hold for `name`: a marker is a perfectly valid
 * non-empty string, so without this the template copied unfilled would be
 * accepted with the placeholder AS THE NAME OF THE ACCOUNT — which is the exact
 * accident of 2026-08-15 that the markers exist to prevent (R2).
 */
function isMarker(value: unknown): boolean {
  return typeof value === 'string' && /^\s*<.*>\s*$/s.test(value)
}

/** The type decides the shape of the file, so an unknown one is reported with the admitted values. */
function readType(
  source: Record<string, unknown>,
  problems: string[],
  markers: string[],
): TradeRepublicProductType | null {
  const value = source.type
  const admitted = `valores admitidos: ${productTypes.join(', ')}`
  if (isAbsent(value)) {
    problems.push(`type: campo obligatorio ausente; ${admitted}`)
    return null
  }
  if (isMarker(value)) {
    markers.push('type')
    return null
  }
  if (typeof value !== 'string' || !productTypes.includes(value as TradeRepublicProductType)) {
    problems.push(`type: valor no admitido ${display(value)}; ${admitted}`)
    return null
  }
  return value as TradeRepublicProductType
}

/** The identity of the account, always from the contents and never from the file name. */
function readName(
  source: Record<string, unknown>,
  problems: string[],
  missing: string[],
  markers: string[],
): string | null {
  const value = source.name
  if (isAbsent(value)) {
    missing.push('name')
    return null
  }
  if (isMarker(value)) {
    markers.push('name')
    return null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`name: se espera un texto no vacío, recibido ${display(value)}`)
    return null
  }
  return value
}

/** Optional and never written by the human: `EUR` is assumed. */
function readCurrency(
  source: Record<string, unknown>,
  problems: string[],
  markers: string[],
): string {
  const value = source.currency
  if (isAbsent(value)) {
    return 'EUR'
  }
  if (isMarker(value)) {
    markers.push('currency')
    return 'EUR'
  }
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`currency: se espera un texto no vacío, recibido ${display(value)}`)
    return 'EUR'
  }
  return value
}

/**
 * Reads a numeric field, which must be a FINITE NATIVE JSON NUMBER. Text gets its
 * own, more explicit reason and is NEVER interpreted, not even when it would be
 * unambiguous (`"1234.56"`) — accepting both forms turns one format into two. The
 * value is returned exactly as written, with no rounding and no reformatting.
 */
function readNumberField(
  source: Record<string, unknown>,
  key: string,
  required: boolean,
  problems: string[],
  missing: string[],
  markers: string[],
): number | null {
  const value = source[key]
  if (isAbsent(value)) {
    if (required) {
      missing.push(key)
    }
    return null
  }
  if (isMarker(value)) {
    markers.push(key)
    return null
  }
  if (typeof value === 'string') {
    problems.push(`${key}: se espera un número sin comillas, recibido ${display(value)}`)
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${key}: se espera un número, recibido ${display(value)}`)
    return null
  }
  return value
}

/** Reads a date field, strict `YYYY-MM-DD`; the reason names the expected format. */
function readIsoField(
  source: Record<string, unknown>,
  key: string,
  required: boolean,
  problems: string[],
  missing: string[],
  markers: string[],
): string | null {
  const value = source[key]
  if (isAbsent(value)) {
    if (required) {
      missing.push(key)
    }
    return null
  }
  if (isMarker(value)) {
    markers.push(key)
    return null
  }
  const parsed = parseIsoDate(value)
  if (parsed === null) {
    problems.push(
      `${key}: fecha inválida, se espera el formato AAAA-MM-DD, recibido ${display(value)}`,
    )
    return null
  }
  return parsed
}

/**
 * Strict `YYYY-MM-DD`, validating it is a real calendar day: `2026-02-31` is
 * `null`, never rolled over into March.
 *
 * It lives HERE and not in a shared helper on purpose: reading the format of a
 * bank is never shared between banks (`docs/conventions.md` §Parsers de banco).
 * What IS shared is what is not format — the output shape and the encoding.
 */
function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
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
  return value
}

/**
 * An unknown key is an error because it is the only thing that catches a silent
 * typo: `moneyin` in lower case would drop the month's deposits without a word,
 * and with them the arithmetic check that protects everything else. Keys starting
 * with `_` are the human's notes and are the escape hatch.
 */
function reportUnknownKeys(source: Record<string, unknown>, problems: string[]): void {
  const unknown = Object.keys(source).filter(
    (key) => !key.startsWith('_') && !allowedKeys.includes(key),
  )
  if (unknown.length > 0) {
    problems.push(`claves no admitidas: ${unknown.join(', ')}`)
  }
}

/** An absent field and a field set to `null` mean the same: not reported. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

/** The received value, quoted as JSON, so the reason is enough to fix the file. */
function display(value: unknown): string {
  return JSON.stringify(value) ?? String(value)
}
