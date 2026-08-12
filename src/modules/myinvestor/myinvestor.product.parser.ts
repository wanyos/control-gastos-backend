import { parseIsoDate } from './myinvestor.format.js'
import type {
  InvestmentProductType,
  ParsedDepositTerms,
  ParsedProduct,
  ParsedValuation,
} from './myinvestor.types.js'

/**
 * Pure parser of ONE hand-written investment product file (feature 13, ADR-016).
 *
 * This is the second entry of the same bank, and the FIRST format written by
 * the human instead of exported by the bank, so the format is designed rather
 * than accepted: numbers are native JSON numbers, dates are strict `YYYY-MM-DD`
 * and any key that is not in the template is an error (except the `_` ones,
 * which are his own notes).
 *
 * Consequence of numbers being native JSON: this parser does NOT import
 * `parseAmountText`. That normalizer belongs to the `.csv` statement, where the
 * bank writes amounts as Spanish text with a `€` and there is no choice. Here
 * a numeric value that
 * arrives as TEXT is a failure of the file with an explicit reason, and it is
 * never interpreted, not even when it would be unambiguous (R77).
 *
 * It computes NOTHING (R39): no gain, no percentage, no total. It emits the
 * numbers as written even when they do not add up, and it never rounds nor
 * reformats them.
 *
 * It RETURNS the reason instead of throwing (design §9.3): a badly written file
 * is not an exception of the request, it is part of its answer. Every problem
 * of the same file is accumulated into a single reason (R48), so fixing a file
 * with three mistakes takes one trip.
 */

const productTypes: InvestmentProductType[] = ['fund', 'etf', 'managed_portfolio', 'deposit']

/** Keys every product carries, whatever its type. */
const commonKeys = ['type', 'name', 'date', 'currency', 'closedAt']

/** Keys of a product that fluctuates (fund, ETF, managed portfolio). */
const valuationKeys = ['invested', 'marketValue', 'gain', 'gainPercent', 'uninvestedCash']

/** Keys of a deposit. A single interest rate: the one that applies (R37). */
const depositKeys = ['principal', 'interestRate', 'expectedGain', 'maturityDate']

export function parseMyinvestorProduct(
  file: string,
  content: string,
): ParsedProduct | { reason: string } {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch (error) {
    return { reason: `JSON inválido: ${error instanceof Error ? error.message : 'sin detalle'}` }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { reason: `se espera un objeto con un solo producto, recibido ${display(raw)}` }
  }

  const source = raw as Record<string, unknown>
  const problems: string[] = []
  const missing: string[] = []
  const readNumber = (key: string, required: boolean) =>
    readNumberField(source, key, required, problems, missing)
  const readIso = (key: string, required: boolean) =>
    readIsoField(source, key, required, problems, missing)

  const type = readType(source, problems)
  const name = readName(source, problems, missing)
  const date = readIso('date', true)
  const currency = readCurrency(source, problems)
  const closedAt = readIso('closedAt', false)

  let valuation: ParsedValuation | null = null
  let depositTerms: ParsedDepositTerms | null = null
  if (type === 'deposit') {
    const principal = readNumber('principal', true)
    const interestRate = readNumber('interestRate', true)
    const expectedGain = readNumber('expectedGain', true)
    const maturityDate = readIso('maturityDate', true)
    if (
      principal !== null &&
      interestRate !== null &&
      expectedGain !== null &&
      maturityDate !== null
    ) {
      depositTerms = { principal, interestRate, expectedGain, maturityDate }
    }
  } else if (type !== null) {
    const invested = readNumber('invested', true)
    const marketValue = readNumber('marketValue', true)
    const gain = readNumber('gain', true)
    const gainPercent = readNumber('gainPercent', true)
    // Kept apart on purpose: never added into marketValue nor into any total (R36).
    const uninvestedCash = readNumber('uninvestedCash', false)
    if (invested !== null && marketValue !== null && gain !== null && gainPercent !== null) {
      valuation = { invested, marketValue, gain, gainPercent, uninvestedCash }
    }
  }

  reportUnknownKeys(source, type, problems)
  if (missing.length > 0) {
    problems.unshift(`faltan campos obligatorios: ${missing.join(', ')}`)
  }

  const shape = type === 'deposit' ? depositTerms : valuation
  if (problems.length > 0 || type === null || name === null || date === null || shape === null) {
    return { reason: problems.join('; ') || 'archivo de producto no interpretable' }
  }

  return {
    bank: 'myinvestor',
    file,
    type,
    name,
    date,
    currency,
    closedAt,
    valuation,
    depositTerms,
  }
}

/** The type decides which fields apply, so an unknown one is reported with the four admitted. */
function readType(
  source: Record<string, unknown>,
  problems: string[],
): InvestmentProductType | null {
  const value = source.type
  const admitted = `valores admitidos: ${productTypes.join(', ')}`
  if (isAbsent(value)) {
    problems.push(`type: campo obligatorio ausente; ${admitted}`)
    return null
  }
  if (typeof value !== 'string' || !productTypes.includes(value as InvestmentProductType)) {
    problems.push(`type: valor no admitido ${display(value)}; ${admitted}`)
    return null
  }
  return value as InvestmentProductType
}

/** The identity of the product, always from the contents and never from the file name (R24). */
function readName(
  source: Record<string, unknown>,
  problems: string[],
  missing: string[],
): string | null {
  const value = source.name
  if (isAbsent(value)) {
    missing.push('name')
    return null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`name: se espera un texto no vacío, recibido ${display(value)}`)
    return null
  }
  return value
}

/** Optional and never written by the human: `EUR` is assumed. */
function readCurrency(source: Record<string, unknown>, problems: string[]): string {
  const value = source.currency
  if (isAbsent(value)) {
    return 'EUR'
  }
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`currency: se espera un texto no vacío, recibido ${display(value)}`)
    return 'EUR'
  }
  return value
}

/**
 * Reads a numeric field, which must be a FINITE NATIVE JSON NUMBER (R26). Text
 * gets its own, more explicit reason (R77) and is never interpreted; the value
 * is returned exactly as written, with no rounding and no reformatting (R27).
 */
function readNumberField(
  source: Record<string, unknown>,
  key: string,
  required: boolean,
  problems: string[],
  missing: string[],
): number | null {
  const value = source[key]
  if (isAbsent(value)) {
    if (required) {
      missing.push(key)
    }
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

/** Reads a date field, strict `YYYY-MM-DD`; the reason names the expected format (R43). */
function readIsoField(
  source: Record<string, unknown>,
  key: string,
  required: boolean,
  problems: string[],
  missing: string[],
): string | null {
  const value = source[key]
  if (isAbsent(value)) {
    if (required) {
      missing.push(key)
    }
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
 * An unknown key is an error because it is the only thing that catches a silent
 * typo: `uninvestedcash` would otherwise drop the cash without a word. Keys
 * starting with `_` are the human's notes and are the escape hatch (R44). A key
 * that exists but not for this type (a valuation field on a deposit) is
 * reported the same way (R35).
 */
function reportUnknownKeys(
  source: Record<string, unknown>,
  type: InvestmentProductType | null,
  problems: string[],
): void {
  const typeKeys =
    type === null
      ? [...valuationKeys, ...depositKeys]
      : type === 'deposit'
        ? depositKeys
        : valuationKeys
  const allowed = [...commonKeys, ...typeKeys]
  const unknown = Object.keys(source).filter(
    (key) => !key.startsWith('_') && !allowed.includes(key),
  )
  if (unknown.length > 0) {
    problems.push(
      `claves no admitidas para el tipo '${type ?? 'desconocido'}': ${unknown.join(', ')}`,
    )
  }
}

/** An absent field and a field set to `null` mean the same: not reported (R32). */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

/** The received value, quoted as JSON, so the reason is enough to fix the file. */
function display(value: unknown): string {
  return JSON.stringify(value) ?? String(value)
}
