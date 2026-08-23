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

/**
 * Keys every product carries, whatever its type.
 *
 * `openedAt` is here and not among the type keys because it is MANDATORY on the
 * four types (feature 15): every product was opened one day, whereas only some
 * are closed. That is why it sits next to `closedAt` but is read as required.
 */
const commonKeys = ['type', 'name', 'date', 'currency', 'openedAt', 'closedAt']

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
  const markers: MarkerReport = { whole: [], half: [] }
  const readNumber = (key: string, required: boolean) =>
    readNumberField(source, key, required, problems, missing)
  const readIso = (key: string, required: boolean) =>
    readIsoField(source, key, required, problems, missing)

  const type = readType(source, problems)
  const name = readName(source, problems, missing, markers)
  const date = readIso('date', true)
  const currency = readCurrency(source, problems, markers)
  // Required on the four types (R-F15): its absence lands in `missing` and is
  // reported by name inside the SINGLE reason of the file, like any other one.
  const openedAt = readIso('openedAt', true)
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
  // Second of the reason and never merged with the one below: half of a marker
  // is a DIFFERENT mistake from not having touched the field at all, and the two
  // are fixed by looking at different things (feature 30, copied from 28).
  if (markers.half.length > 0) {
    problems.unshift(
      `campos con el marcador <…> de la plantilla A MEDIO SUSTITUIR, te dejaste un ` +
        `símbolo suelto: ${markers.half.join(', ')}; ` +
        `un valor no puede empezar por < ni acabar en >`,
    )
  }
  // First of the reason, because it is the one that explains all the rest: the
  // template was copied and (part of) it was never filled in.
  if (markers.whole.length > 0) {
    problems.unshift(
      `campos sin sustituir, siguen con el marcador <…> de la plantilla: ${markers.whole.join(', ')}`,
    )
  }

  const shape = type === 'deposit' ? depositTerms : valuation
  if (
    problems.length > 0 ||
    type === null ||
    name === null ||
    date === null ||
    openedAt === null ||
    shape === null
  ) {
    return { reason: problems.join('; ') || 'archivo de producto no interpretable' }
  }

  return {
    bank: 'myinvestor',
    file,
    type,
    name,
    date,
    currency,
    openedAt,
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
  markers: MarkerReport,
): string | null {
  const value = source.name
  if (isAbsent(value)) {
    missing.push('name')
    return null
  }
  if (collectMarker('name', value, markers)) {
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
  markers: MarkerReport,
): string {
  const value = source.currency
  if (isAbsent(value)) {
    return 'EUR'
  }
  if (collectMarker('currency', value, markers)) {
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

/**
 * A value that is still the `<…>` of the template (feature 30).
 *
 * The document of this format used to claim that no new code was needed because
 * «the very shape of the marker is already invalid in the four places». A probe
 * of 2026-08-22 (`progress/explorations/auditoria-tests-huecos-2026-08-22.md`
 * §G1) MEASURED that claim field by field, and it is true for eleven of the
 * thirteen keys and FALSE for the two that hold free text:
 *
 *  - `type` → rejected, not one of the four admitted values.
 *  - `date`, `openedAt`, `closedAt`, `maturityDate` → rejected, not `AAAA-MM-DD`.
 *  - `invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash`,
 *    `principal`, `interestRate`, `expectedGain` → rejected, a number written
 *    as text is never interpreted (R77).
 *  - **`name` and `currency` → ACCEPTED.** A marker is a perfectly valid
 *    non-empty string, so the template copied unfilled entered IN GREEN with the
 *    placeholder AS THE NAME OF THE PRODUCT — and since feature 29 the name is
 *    the natural key that identifies the product in the database, so next month,
 *    already with the good name, a SECOND product would be created and the series
 *    would be split in two.
 *
 * That is why the check lives on those two fields and NOT on the other eleven:
 * they already reject on their own validation, with their own reason, and
 * rewriting those reasons is not this feature.
 *
 * WHY IT IS COPIED FROM TRADE REPUBLIC AND NOT SHARED WITH IT (decision of
 * feature 30, delegated by the human; feature 28 left the condition written and
 * today it is met — two real users and feature 29 closed — so the decision is
 * TAKEN here, not inherited):
 *
 *  - `docs/conventions.md` §Parsers de banco says «un parser por banco, sin
 *    genéricos», and what IS shared is what is not format (the output shape, the
 *    encoding). The `<…>` marker is the convention of a TEMPLATE, which each bank
 *    document publishes on its own: today the two coincide, and nothing keeps them
 *    coinciding.
 *  - **The policies diverge, and that is the new fact.** Trade Republic runs the
 *    check on EVERY field; here it runs on the two that are exposed. What could be
 *    shared is a two-line predicate, while the part that carries the risk — which
 *    fields it applies to — stays per bank anyway.
 *  - The same convention already resolved this exact shape of problem: «el banco
 *    siguiente que traiga CSV entrecomillado copia el patrón, no el módulo». And
 *    `src/lib/` is the open door for sharing parsing code between banks that the
 *    audit flags as C5; a marker helper in there would be the first tenant that
 *    the convention forbids.
 */
function isMarker(value: unknown): boolean {
  return typeof value === 'string' && /^\s*<.*>\s*$/s.test(value)
}

/**
 * The two ways a marker of the template can survive, kept APART on purpose: a
 * field never touched and a field half rewritten are different mistakes and are
 * fixed by looking at different things.
 */
interface MarkerReport {
  /** Fields still carrying the whole `<…>`. */
  whole: string[]
  /** Fields where only one of the two symbols was erased. */
  half: string[]
}

/**
 * A value where ONE of the two symbols of the marker was erased and the other was
 * left behind: `"<nombre del producto"`. It is covered here for the same reason
 * Trade Republic covers it since feature 28 — it happened twice in the very first
 * real file written by hand, and the audit probe showed that on `name` it enters
 * in green exactly like the whole marker, which is the same silent damage.
 *
 * WHAT COUNTS, and why it does not open false positives on free text:
 *
 *  - **Starts with `<` or ends with `>`, and is not a whole marker.** Erasing one
 *    delimiter ALWAYS leaves the other at an END of the value.
 *  - **The symbol in the MIDDLE does NOT count** (`"Cartera 3 > 2"`, `"Fondo <A>
 *    global"` is a whole-marker miss, not this one). The middle is the only place
 *    where a product name can legitimately carry the symbol, and a residue of this
 *    accident never lands there.
 *  - **A name that legitimately opened with `<` is rejected with a reason that
 *    says what to do.** That is the accepted trade-off: rejecting a little too
 *    much with a message he understands, never swallowing a placeholder as the
 *    identity of a product. Renaming the product is an escape hatch; a split
 *    series months later is not.
 *
 * The parser NEITHER GUESSES NOR REPAIRS: it does not strip the symbol and read
 * the rest. The file is rejected; only the reason exists where there was none.
 */
function isHalfErasedMarker(value: unknown): boolean {
  if (typeof value !== 'string' || isMarker(value)) {
    return false
  }
  const trimmed = value.trim()
  return trimmed.startsWith('<') || trimmed.endsWith('>')
}

/**
 * Files a field under the marker it carries, if any, and answers whether the
 * caller must stop reading it. The half-erased one shows the received value: the
 * whole point is that he SEES the character that is left over.
 */
function collectMarker(key: string, value: unknown, markers: MarkerReport): boolean {
  if (isMarker(value)) {
    markers.whole.push(key)
    return true
  }
  if (isHalfErasedMarker(value)) {
    markers.half.push(`${key} ${display(value)}`)
    return true
  }
  return false
}

/** An absent field and a field set to `null` mean the same: not reported (R32). */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

/** The received value, quoted as JSON, so the reason is enough to fix the file. */
function display(value: unknown): string {
  return JSON.stringify(value) ?? String(value)
}
