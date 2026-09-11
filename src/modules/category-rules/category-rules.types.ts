/**
 * Types of the auto-categorization by rules (feature 43): the CRUD shapes of
 * `/api/category-rules` and the result of the categorization run — the pass
 * that walks the eligible movements applying the rules. The run's result
 * travels inside the import report (both ways in) and is also what
 * `POST /api/category-rules/apply` answers, same pattern as the transfer
 * detection of F40.
 */
import type { CategoryKind } from '../../generated/prisma/client.js'

/** Body of `POST /api/category-rules` (R1). */
export interface CreateCategoryRuleBody {
  categoryId: number
  matchText: string
}

/** Body of `PATCH /api/category-rules/:id`: at least one of the two (R4). */
export interface UpdateCategoryRuleBody {
  categoryId?: number
  matchText?: string
}

/** Params of the `:id` routes. */
export interface CategoryRuleIdParams {
  id: number
}

/** What every rule endpoint answers: the rule with its category embedded. */
export interface SerializedCategoryRule {
  id: number
  /** Normalized (lowercase, no diacritics, trimmed): exactly as stored. */
  matchText: string
  categoryId: number
  category: {
    id: number
    name: string
    kind: CategoryKind
    parentId: number | null
  }
  createdAt: string
  updatedAt: string
}

/** One movement two or more rules of DIFFERENT categories fought over (R9, R10). */
export interface CategorizationConflict {
  movementId: number
  description: string
  /** `YYYY-MM-DD`: the column is date-only and the report keeps it that way. */
  bookingDate: string
  matches: Array<{
    ruleId: number
    matchText: string
    categoryId: number
    categoryName: string
  }>
}

/** What one categorization run did, always present in the import report (R10). */
export interface CategorizationResult {
  /** Movements that got their category written (R7). */
  categorized: number
  /** Conflicts, not movements-per-conflict. */
  conflictCount: number
  /** `[]` when there is none: "nothing clashed" must be visible as such (R9, R10). */
  conflicts: CategorizationConflict[]
  /** Eligible movements no rule matched: they stay NULL, visible as pending (R10). */
  unmatched: number
  /** R12: present only when the run failed; the import itself stands. */
  error?: { code: string; message: string }
}
