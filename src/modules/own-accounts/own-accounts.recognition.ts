/**
 * Feature 62: the recognition of own movements. Pure: it reads the own
 * accounts table, the holder name forms and the movements it is given, and
 * says which movement is the human's own money moving, which one is doubtful
 * and which one the human already decided. Nothing here writes anything; the
 * reading is computed again on every read (ADR-040).
 */

/**
 * lowercase, no diacritics, every run of characters other than `a-z` and `0-9`
 * turned into ONE space, trimmed. Applied to both sides, so a form typed with
 * accents matches a description written with underscores.
 */
export function normalizeOwnText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Whole words only: `ing` matches `transf ing` but not `ingreso`. */
function matches(normalizedDescription: string, normalizedText: string): boolean {
  if (normalizedText.length === 0) return false
  return ` ${normalizedDescription} `.includes(` ${normalizedText} `)
}

export interface OwnershipInput {
  id: number
  description: string
  transferId: string | null
  excludedFromTotals: boolean
  ownershipDecision: 'mine' | 'not_mine' | null
}

export interface OwnAccountForMatch {
  id: number
  name: string
  bank: string
  texts: string[]
}

export type OwnershipStatus = 'own' | 'doubtful' | 'mine' | 'not_mine'

export interface OwnershipReading {
  status: OwnershipStatus
  /** `null` when it matched a holder name form, or matched nothing. */
  ownAccountId: number | null
  ownAccountName: string | null
  /** The text or form that matched, as the human typed it. */
  matchedText: string | null
  /** `true` only with status `own` or `mine`. */
  leavesTotals: boolean
}

interface Candidate {
  ownAccountId: number | null
  ownAccountName: string | null
  /** As the human typed it. */
  text: string
  normalized: string
}

interface Match {
  candidate: Candidate
  /** `true` when the only thing that matched is a bank name (doubtful). */
  isBankOnly: boolean
}

/** Longest first, so the most specific text is the one reported; then alphabetical. */
function byLengthThenText(a: Candidate, b: Candidate): number {
  return b.normalized.length - a.normalized.length || a.normalized.localeCompare(b.normalized)
}

function candidatesOf(
  ownAccounts: OwnAccountForMatch[],
  holderNames: string[],
): { holder: Candidate[]; own: Candidate[]; bank: Candidate[] } {
  // A text is a bank text when it equals the bank of ANY row, not only its own.
  const bankNames = new Set(ownAccounts.map((account) => normalizeOwnText(account.bank)))

  const holder = holderNames
    .map((name) => ({
      ownAccountId: null,
      ownAccountName: null,
      text: name,
      normalized: normalizeOwnText(name),
    }))
    .sort(byLengthThenText)

  const own: Candidate[] = []
  const bank: Candidate[] = []
  for (const account of [...ownAccounts].sort((a, b) => a.id - b.id)) {
    const texts = account.texts
      .map((text) => ({
        ownAccountId: account.id,
        ownAccountName: account.name,
        text,
        normalized: normalizeOwnText(text),
      }))
      .sort(byLengthThenText)
    for (const candidate of texts) {
      if (bankNames.has(candidate.normalized)) bank.push(candidate)
      else own.push(candidate)
    }
  }

  return { holder, own, bank }
}

function findMatch(description: string, candidates: ReturnType<typeof candidatesOf>): Match | null {
  const normalized = normalizeOwnText(description)
  const holder = candidates.holder.find((candidate) => matches(normalized, candidate.normalized))
  if (holder) return { candidate: holder, isBankOnly: false }
  const own = candidates.own.find((candidate) => matches(normalized, candidate.normalized))
  if (own) return { candidate: own, isBankOnly: false }
  const bank = candidates.bank.find((candidate) => matches(normalized, candidate.normalized))
  if (bank) return { candidate: bank, isBankOnly: true }
  return null
}

/**
 * The reading of every movement that has one; a movement with no reading is
 * absent from the map. Order, per movement (design §3):
 *
 *  1. a decision of the human wins, whatever matches;
 *  2. a holder name form, or a text that is not a bank name → `own`;
 *  3. only bank names → `doubtful`, unless it is a transfer leg or marked
 *     out of the totals: those stay as they were, with no reading;
 *  4. nothing → no reading.
 *
 * The `bank` field of a row is only used to tell which texts are bank names:
 * it never matches a description by itself.
 */
export function resolveOwnership(
  movements: OwnershipInput[],
  ownAccounts: OwnAccountForMatch[],
  holderNames: string[],
): Map<number, OwnershipReading> {
  const candidates = candidatesOf(ownAccounts, holderNames)
  const readings = new Map<number, OwnershipReading>()

  for (const movement of movements) {
    const match = findMatch(movement.description, candidates)
    const matched = {
      ownAccountId: match?.candidate.ownAccountId ?? null,
      ownAccountName: match?.candidate.ownAccountName ?? null,
      matchedText: match?.candidate.text ?? null,
    }

    if (movement.ownershipDecision !== null) {
      readings.set(movement.id, {
        status: movement.ownershipDecision,
        ...matched,
        leavesTotals: movement.ownershipDecision === 'mine',
      })
      continue
    }

    if (match === null) continue

    if (!match.isBankOnly) {
      readings.set(movement.id, { status: 'own', ...matched, leavesTotals: true })
      continue
    }

    if (movement.transferId !== null || movement.excludedFromTotals) continue
    readings.set(movement.id, { status: 'doubtful', ...matched, leavesTotals: false })
  }

  return readings
}
