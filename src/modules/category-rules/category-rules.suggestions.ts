/**
 * Feature 61 `rule-suggestions`: the list of proposed rules. For the movements
 * a rule may still move (`pendingAndClosing`: what is pending without category
 * and what the closing step left in `Otros gastos` / `Otros ingresos`), it
 * takes a piece of each description no rule matches yet and counts, with the
 * same `planCategorization` the run uses, what creating a rule with it would
 * write. It writes nothing and stores nothing: computed on every request.
 *
 * Apart from `category-rules.service.ts` because the derivation of the text is
 * pure and tested on its own (`design.md` §1).
 */
import type { CategoryKind } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import {
  matchingRules,
  normalizeForMatch,
  planCategorization,
  readCategorizationInput,
  toDateOnly,
} from './category-rules.service.js'
import type { PlannableRule, PlannedMovement } from './category-rules.service.js'
import type { RuleSuggestion } from './category-rules.types.js'

/** A shorter text matches inside other words and takes unrelated concepts (R4). */
export const minimumSuggestionLength = 5

/** Fewer movements than this are not worth a rule (R7). */
export const minimumSuggestionMovements = 3

/** From ` concepto` / `, concepto` on: the free text whoever sent a transfer wrote. */
const conceptTail = /[ ,]+concepto\b/

/** The bank word before a slash: `recibo /`, `transf /`, `anul. /`. */
const bankPrefix = /^[a-z. ]{1,24}\/\s*/

const leadingNonAlphanumeric = /^[^\p{L}\p{N}]+/u
const trailingNonAlphanumeric = /[^\p{L}\p{N}]+$/u

/**
 * Pure (R2–R4). The proposed rule text of a description, or null when no
 * proposal can come out of it. Every step cuts, never rewrites, so the result
 * is always a contiguous piece of `normalizeForMatch(description)` (R3): a rule
 * with it matches the movement it came from.
 */
export function proposedMatchText(description: string): string | null {
  let text = normalizeForMatch(description)

  const concept = conceptTail.exec(text)
  if (concept !== null && concept.index > 0) text = text.slice(0, concept.index)

  const prefix = bankPrefix.exec(text)
  if (prefix !== null) text = text.slice(prefix[0].length)

  // The first run of consecutive words without a digit, taken by position so
  // the spaces between them stay as the bank wrote them.
  let runStart: number | null = null
  let runEnd = 0
  for (const word of text.matchAll(/\S+/g)) {
    const wordStart = word.index
    if (/\d/.test(word[0])) {
      if (runStart !== null) break
      continue
    }
    if (runStart === null) runStart = wordStart
    runEnd = wordStart + word[0].length
  }
  if (runStart === null) return null

  const proposed = text
    .slice(runStart, runEnd)
    .replace(leadingNonAlphanumeric, '')
    .replace(trailingNonAlphanumeric, '')

  return proposed.length < minimumSuggestionLength ? null : proposed
}

const kinds: CategoryKind[] = ['expense', 'income']

/** Ascending code-unit order: the same on every machine, whatever its locale. */
function compareText(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Whether `other` makes `suggestion` redundant (R8): it takes every movement
 * `suggestion` takes, and more of them, or the same ones with a shorter text
 * (alphabetical first on equal length). A strict order, so two suggestions can
 * never hide each other.
 */
function isCoveredBy(suggestion: RuleSuggestion, other: RuleSuggestion): boolean {
  if (other === suggestion || other.kind !== suggestion.kind) return false
  if (other.movementCount < suggestion.movementCount) return false

  const otherIds = new Set(other.movements.map((movement) => movement.movementId))
  const allTaken = suggestion.movements.every((movement) => otherIds.has(movement.movementId))
  if (!allTaken) return false

  if (other.movementCount > suggestion.movementCount) return true
  if (other.matchText.length !== suggestion.matchText.length) {
    return other.matchText.length < suggestion.matchText.length
  }
  return compareText(other.matchText, suggestion.matchText) < 0
}

/**
 * R1, R5–R9. Reads the rules and the movements exactly as the `pendingAndClosing`
 * run does, plus the movements set by hand (only to count `manualMatches`).
 */
export async function listRuleSuggestions(prisma: AppPrismaClient): Promise<RuleSuggestion[]> {
  const { rules, movements } = await readCategorizationInput(prisma, 'pendingAndClosing')
  const manual = await prisma.movement.findMany({
    where: { categorySource: 'manual', type: { in: kinds } },
    select: { type: true, description: true },
  })

  const existingMatchTexts = new Set(rules.map((rule) => rule.matchText))
  const suggestions: RuleSuggestion[] = []

  for (const kind of kinds) {
    const eligible = movements
      .filter((movement) => movement.type === kind)
      .map((movement) => ({ movement, normalized: normalizeForMatch(movement.description) }))
    const manualOfKind = manual
      .filter((movement) => movement.type === kind)
      .map((movement) => normalizeForMatch(movement.description))

    // R5: texts only from what no existing rule takes yet.
    const candidates = new Set<string>()
    for (const { movement } of eligible) {
      if (matchingRules(movement.description, movement.type, rules).length > 0) continue
      const text = proposedMatchText(movement.description)
      if (text === null) continue
      // The POST stores `normalizeForMatch(matchText)`: a text that would not
      // survive it unchanged would not be the rule the count was made for.
      if (normalizeForMatch(text) !== text) continue
      // `matchText` is unique across the whole table, whatever the kind: a text
      // a rule of the other kind already has could never be created (409), so
      // the movements listed would be ones no rule of it can move.
      if (existingMatchTexts.has(text)) continue
      candidates.add(text)
    }

    for (const matchText of candidates) {
      // A rule with a category of this kind that no real one has: a movement
      // an existing rule also matches comes out as a conflict and does not
      // count, as creating the rule would leave it there or in the other one.
      const notCreatedYet: PlannableRule = {
        id: null,
        matchText,
        categoryId: -1,
        category: { name: '', kind },
      }
      // Only these can match the new rule; the plan is per movement, so
      // narrowing first changes nothing of what it decides for them.
      const containing: PlannedMovement[] = eligible
        .filter(({ normalized }) => normalized.includes(matchText))
        .map(({ movement }) => movement)
      const plan = planCategorization<PlannableRule>(containing, [...rules, notCreatedYet])
      const taken = plan.writes.filter((write) => write.winner.id === null)
      if (taken.length < minimumSuggestionMovements) continue // R7

      suggestions.push({
        matchText,
        kind,
        movementCount: taken.length,
        movements: taken.map(({ movement }) => ({
          movementId: movement.id,
          description: movement.description,
          bookingDate: toDateOnly(movement.bookingDate),
          amount: movement.amount.toFixed(2),
        })),
        manualMatches: manualOfKind.filter((normalized) => normalized.includes(matchText)).length,
      })
    }
  }

  return suggestions
    .filter((suggestion) => !suggestions.some((other) => isCoveredBy(suggestion, other)))
    .sort((a, b) => b.movementCount - a.movementCount || compareText(a.matchText, b.matchText))
}
