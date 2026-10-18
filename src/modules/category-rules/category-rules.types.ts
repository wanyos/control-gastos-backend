/**
 * Types of the auto-categorization by rules (feature 43): the CRUD shapes of
 * `/api/category-rules` and the result of the categorization run — the pass
 * that walks the eligible movements applying the rules. The run's result
 * travels inside the import report and is also what
 * `POST /api/category-rules/apply` answers, same pattern as the transfer
 * detection of F40.
 */
import type { CategoryKind, MovementType } from '../../generated/prisma/client.js'

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

/**
 * What POST and PATCH answer since feature 60: the rule plus the categorization
 * run its write triggered (scope `pendingAndClosing`).
 */
export interface SerializedCategoryRuleWithCategorization extends SerializedCategoryRule {
  categorization: CategorizationResult
}

/**
 * One movement two or more rules of DIFFERENT categories fought over (R9, R10).
 * `RuleId` is `number | null` only in the preview of feature 61, where the
 * rule not created yet has no id.
 */
export interface CategorizationConflict<RuleId extends number | null = number> {
  movementId: number
  description: string
  /** `YYYY-MM-DD`: the column is date-only and the report keeps it that way. */
  bookingDate: string
  matches: Array<{
    ruleId: RuleId
    matchText: string
    categoryId: number
    categoryName: string
  }>
}

/** One movement the run wrote `categoryId` on (feature 56). `RuleId` as in `CategorizationConflict`. */
export interface CategorizedMovement<RuleId extends number | null = number> {
  movementId: number
  description: string
  /** `YYYY-MM-DD`, as in `CategorizationConflict`. */
  bookingDate: string
  /** Positive decimal string, serialized like `GET /api/movements` does. */
  amount: string
  /** Never `neutral`: a neutral movement is not eligible. */
  type: MovementType
  categoryId: number
  categoryName: string
  /** Every rule that matched: two rules of the same category do not clash. */
  rules: Array<{ ruleId: RuleId; matchText: string }>
}

/** What one categorization run did, always present in the import report (R10). */
export interface CategorizationResult {
  /** Movements that got their category written (R7). */
  categorized: number
  /**
   * Those same movements, one element each, by ascending movement id: as many
   * as `categorized`, never truncated, `[]` when none was written (feature 56).
   */
  categorizedMovements: CategorizedMovement[]
  /** Conflicts, not movements-per-conflict. */
  conflictCount: number
  /** `[]` when there is none: "nothing clashed" must be visible as such (R9, R10). */
  conflicts: CategorizationConflict[]
  /** Eligible movements no rule matched: they stay NULL, visible as pending (R10). */
  unmatched: number
  /** R12: present only when the run failed; the import itself stands. */
  error?: { code: string; message: string }
}

/**
 * Feature 61: what `POST /api/category-rules` would answer in `categorization`
 * right now, without writing. Same fields as `CategorizationResult`; the rule
 * not created yet appears with `ruleId: null`. No `error`: nothing is written
 * here, so a failure is a plain 500.
 */
export interface PreviewCategorizationResult {
  categorized: number
  categorizedMovements: CategorizedMovement<number | null>[]
  conflictCount: number
  conflicts: CategorizationConflict<number | null>[]
  unmatched: number
}

/** Querystring of `GET /api/category-rules/preview` (feature 61): the body the POST would get. */
export interface CategoryRulePreviewQuery {
  matchText: string
  categoryId: number
}

/** Answer of `GET /api/category-rules/preview` (feature 61, R10). */
export interface CategoryRulePreview {
  /** Normalized, exactly as the rule would be stored. */
  matchText: string
  categoryId: number
  categorization: PreviewCategorizationResult
}

/** One element of `GET /api/category-rules/suggestions` (feature 61, R1). */
export interface RuleSuggestion {
  /** The proposed rule text: a piece of the normalized description (R2, R3). */
  matchText: string
  kind: CategoryKind
  /** Always `movements.length`. */
  movementCount: number
  /** What creating the rule would write by this rule, by ascending id (R6). */
  movements: Array<{
    movementId: number
    description: string
    /** `YYYY-MM-DD`. */
    bookingDate: string
    /** Positive decimal string, as in `CategorizedMovement`. */
    amount: string
  }>
  /** Movements set by hand, same kind, that contain the text: never taken (R9). */
  manualMatches: number
}
