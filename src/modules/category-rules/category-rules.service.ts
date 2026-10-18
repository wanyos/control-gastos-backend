import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type {
  Category,
  CategoryKind,
  CategoryRule,
  MovementType,
} from '../../generated/prisma/client.js'

import { AppError, ConflictError, NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  CategorizationConflict,
  CategorizationResult,
  CategorizedMovement,
  CategoryRulePreview,
  CreateCategoryRuleBody,
  SerializedCategoryRule,
  UpdateCategoryRuleBody,
} from './category-rules.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function categoryRulesDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/**
 * lowercase + NFD without diacritic marks + trim. It lives here and not in
 * `lib/` because it is not a bank format: it is the matching convention of the
 * rules (R6), applied to BOTH sides — the stored `matchText` and the
 * movement's description at run time — so capitals and accents can never keep
 * a rule from matching.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
}

/** A one- or two-letter rule would match almost anything: 3 minimum, normalized (R2). */
const minimumMatchTextLength = 3

/** Normalizes and validates a matchText, or throws the 400 of R2. */
function normalizedMatchTextOrThrow(matchText: string): string {
  const normalized = normalizeForMatch(matchText)
  if (normalized.length < minimumMatchTextLength) {
    throw new ValidationError(
      `matchText must keep at least ${minimumMatchTextLength} characters after normalizing, ` +
        `got '${normalized}'`,
    )
  }
  return normalized
}

/** The category the rule points at, or the 404 of R2 when it does not exist. */
async function existingCategoryOrThrow(
  prisma: AppPrismaClient,
  categoryId: number,
): Promise<Category> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } })
  if (!category) throw new NotFoundError('Category not found')
  return category
}

/**
 * The message of the 409 of R2, written once: creating, changing and the
 * preview of feature 61 (R11) must say exactly the same.
 */
function duplicateMatchTextMessage(matchText: string | undefined): string {
  return `A rule with matchText '${matchText}' already exists`
}

type CategoryRuleWithCategory = CategoryRule & { category: Category }

const includeCategory = { category: true } as const

export async function createCategoryRule(
  prisma: AppPrismaClient,
  input: CreateCategoryRuleBody,
): Promise<CategoryRuleWithCategory> {
  const matchText = normalizedMatchTextOrThrow(input.matchText)
  await existingCategoryOrThrow(prisma, input.categoryId)

  try {
    return await prisma.categoryRule.create({
      data: { categoryId: input.categoryId, matchText },
      include: includeCategory,
    })
  } catch (error) {
    // P2002: unique violation on `matchText` — the same normalized text twice.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(duplicateMatchTextMessage(matchText))
    }
    throw error
  }
}

export function listCategoryRules(prisma: AppPrismaClient): Promise<CategoryRuleWithCategory[]> {
  return prisma.categoryRule.findMany({
    include: includeCategory,
    orderBy: { id: 'asc' },
  })
}

/** Updates ONLY the fields that travel, with the same validations as the alta (R4). */
export async function updateCategoryRule(
  prisma: AppPrismaClient,
  id: number,
  input: UpdateCategoryRuleBody,
): Promise<CategoryRuleWithCategory> {
  const rule = await prisma.categoryRule.findUnique({ where: { id } })
  if (!rule) throw new NotFoundError('Category rule not found')

  const matchText =
    input.matchText === undefined ? undefined : normalizedMatchTextOrThrow(input.matchText)
  if (input.categoryId !== undefined) {
    await existingCategoryOrThrow(prisma, input.categoryId)
  }

  try {
    return await prisma.categoryRule.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(matchText !== undefined ? { matchText } : {}),
      },
      include: includeCategory,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(duplicateMatchTextMessage(matchText))
    }
    throw error
  }
}

/**
 * Deletes the rule and NOTHING else: what it categorized stays categorized
 * (R5, decisions.md ⚙️ 1). Correcting a movement is the manual PATCH of F37.
 */
export async function deleteCategoryRule(prisma: AppPrismaClient, id: number): Promise<void> {
  const rule = await prisma.categoryRule.findUnique({ where: { id } })
  if (!rule) throw new NotFoundError('Category rule not found')
  await prisma.categoryRule.delete({ where: { id } })
}

/** Maps the domain object to the API contract shape. */
export function serializeCategoryRule(rule: CategoryRuleWithCategory): SerializedCategoryRule {
  return {
    id: rule.id,
    matchText: rule.matchText,
    categoryId: rule.categoryId,
    category: {
      id: rule.category.id,
      name: rule.category.name,
      kind: rule.category.kind,
      parentId: rule.category.parentId,
    },
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }
}

/** Which movements a categorization run may write on (feature 60). */
export type CategorizationScope = 'pending' | 'pendingAndClosing'

/**
 * The single definition of "a rule may write here". `pending` is the scope of
 * feature 43 (the import run and POST /apply); `pendingAndClosing` adds what
 * `confirmAllMovements` filled (`categorySource` 'closing'), and is what rule
 * create/update runs. `manual` and `rule` are in neither (ADR-038). Exported so
 * feature 61 counts exactly what a rule would take.
 */
export function categorizationEligibleWhere(scope: CategorizationScope): Prisma.MovementWhereInput {
  const pending: Prisma.MovementWhereInput = { categoryId: null, status: 'pending_review' }
  if (scope === 'pending') return { type: { in: ['expense', 'income'] }, ...pending }
  return {
    type: { in: ['expense', 'income'] },
    OR: [pending, { categorySource: 'closing' }],
  }
}

/**
 * Pure: the rules whose category kind equals `type` and whose `matchText` the
 * normalized description CONTAINS (R6 of feature 43). Feature 61 reuses it.
 */
export function matchingRules<
  R extends { matchText: string; categoryId: number; category: { kind: CategoryKind } },
>(description: string, type: MovementType, rules: R[]): R[] {
  const normalized = normalizeForMatch(description)
  return rules.filter((rule) => rule.category.kind === type && normalized.includes(rule.matchText))
}

/** A rule as the run sees it. `id` null = a rule that does not exist yet (feature 61). */
export interface PlannableRule {
  id: number | null
  matchText: string
  categoryId: number
  category: { name: string; kind: CategoryKind }
}

/** A movement as the run reads it. */
export interface PlannedMovement {
  id: number
  type: MovementType
  description: string
  bookingDate: Date
  amount: Prisma.Decimal
}

/** One movement a single category won, with every rule that matched it. */
export interface PlannedWrite<R extends PlannableRule> {
  movement: PlannedMovement
  winner: R
  matches: R[]
}

/** One movement rules of two or more categories fought over. */
export interface PlannedConflict<R extends PlannableRule> {
  movement: PlannedMovement
  matches: R[]
}

/** What the run would do with each movement it read, before writing anything. */
export interface CategorizationPlan<R extends PlannableRule> {
  /** By ascending movement id, as read. */
  writes: PlannedWrite<R>[]
  /** By ascending movement id, as read. */
  conflicts: PlannedConflict<R>[]
  unmatched: number
}

/**
 * Pure. THE decision of the run (R7, R9 of feature 43), taken inline by
 * `applyCategoryRules` until feature 61 and shared since then with the preview
 * and the suggestions, so what they count is what the run writes: the rules
 * that match (`matchingRules`) point at one single category → write; at two or
 * more → conflict; none → unmatched.
 */
export function planCategorization<R extends PlannableRule>(
  movements: PlannedMovement[],
  rules: R[],
): CategorizationPlan<R> {
  const plan: CategorizationPlan<R> = { writes: [], conflicts: [], unmatched: 0 }

  for (const movement of movements) {
    const matches = matchingRules(movement.description, movement.type, rules)
    const winner = matches[0]

    if (winner === undefined) {
      plan.unmatched += 1
      continue
    }

    const distinctCategoryIds = new Set(matches.map((rule) => rule.categoryId))
    if (distinctCategoryIds.size > 1) {
      // Two rules of the SAME category are no conflict: they point the same
      // way. Distinct categories fight, so nothing is assigned (R9).
      plan.conflicts.push({ movement, matches })
      continue
    }

    plan.writes.push({ movement, winner, matches })
  }

  return plan
}

/** `YYYY-MM-DD`: the column is date-only and every answer keeps it that way. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Shape of one write in the answer: the run and the preview cannot diverge. */
function toCategorizedMovement<R extends PlannableRule>(
  write: PlannedWrite<R>,
): CategorizedMovement<R['id']> {
  const { movement, winner, matches } = write
  return {
    movementId: movement.id,
    description: movement.description,
    bookingDate: toDateOnly(movement.bookingDate),
    amount: movement.amount.toFixed(2),
    type: movement.type,
    categoryId: winner.categoryId,
    categoryName: winner.category.name,
    rules: matches.map((rule) => ({ ruleId: rule.id, matchText: rule.matchText })),
  }
}

/** Shape of one conflict in the answer, shared like `toCategorizedMovement`. */
function toCategorizationConflict<R extends PlannableRule>(
  conflict: PlannedConflict<R>,
): CategorizationConflict<R['id']> {
  const { movement, matches } = conflict
  return {
    movementId: movement.id,
    description: movement.description,
    bookingDate: toDateOnly(movement.bookingDate),
    matches: matches.map((rule) => ({
      ruleId: rule.id,
      matchText: rule.matchText,
      categoryId: rule.categoryId,
      categoryName: rule.category.name,
    })),
  }
}

/**
 * The two reads of a run: every rule (ascending id, so the newest is last) and
 * the movements the scope lets a rule write on (ascending id). The run, the
 * preview and the suggestions of feature 61 read through here, so all three
 * see the same.
 */
export async function readCategorizationInput(
  prisma: AppPrismaClient,
  scope: CategorizationScope,
): Promise<{ rules: Array<PlannableRule & { id: number }>; movements: PlannedMovement[] }> {
  const rules = await prisma.categoryRule.findMany({
    include: { category: { select: { name: true, kind: true } } },
    orderBy: { id: 'asc' },
  })
  const movements = await prisma.movement.findMany({
    where: categorizationEligibleWhere(scope),
    select: { id: true, type: true, description: true, bookingDate: true, amount: true },
    orderBy: { id: 'asc' },
  })
  return { rules, movements }
}

/**
 * The categorization run (R6–R11, R14). It NEVER throws (same contract as
 * `detectTransfers`): a failure comes back inside `result.error`, with what
 * was already written still counted, so the import report that carries this
 * result is never lost to a categorization problem (R12).
 *
 * Eligibility lives in the WHERE (`categorizationEligibleWhere`): the default
 * `pending` scope reads only movements with `categoryId` NULL, `status`
 * 'pending_review' and a non-neutral type (R8); `pendingAndClosing` (feature
 * 60, rule create/update) adds the ones `confirmAllMovements` filled. What
 * happens to each one is `planCategorization` (feature 61): rules of one
 * single category → write; zero rules or rules of two or more distinct
 * categories → nothing is written and the case is counted (R7, R9).
 *
 * Each write repeats the scope's WHERE plus the id, so a concurrent write (a
 * category set by hand meanwhile is `manual`) can never be overwritten, and
 * `data` carries ONLY `categoryId` and `categorySource` 'rule' (R14, feature
 * 60). Idempotency is free (R11): a written movement is `rule` and stops being
 * eligible in the next read.
 *
 * `categorizedMovements` (feature 56) lists exactly the movements whose write
 * happened, in the ascending id order of the read; on a failure half way it
 * keeps what was written before, like `categorized`. Conflicts and unmatched
 * come whole from the plan, which writes nothing.
 */
export async function applyCategoryRules(
  prisma: AppPrismaClient,
  scope: CategorizationScope = 'pending',
): Promise<CategorizationResult> {
  const result: CategorizationResult = {
    categorized: 0,
    categorizedMovements: [],
    conflictCount: 0,
    conflicts: [],
    unmatched: 0,
  }

  try {
    const { rules, movements } = await readCategorizationInput(prisma, scope)
    const plan = planCategorization(movements, rules)

    result.conflicts = plan.conflicts.map(toCategorizationConflict)
    result.conflictCount = result.conflicts.length
    result.unmatched = plan.unmatched

    const eligible = categorizationEligibleWhere(scope)
    for (const write of plan.writes) {
      const { count } = await prisma.movement.updateMany({
        where: { ...eligible, id: write.movement.id },
        data: { categoryId: write.winner.categoryId, categorySource: 'rule' },
      })
      result.categorized += count
      // Listed only when the write happened: a movement another request changed
      // between the read and the write is neither counted nor listed.
      if (count === 1) result.categorizedMovements.push(toCategorizedMovement(write))
    }

    return result
  } catch (error) {
    result.error = describeCategorizationError(error)
    return result
  }
}

/**
 * Feature 61 (R10, R11): what `POST /api/category-rules` with this body would
 * answer in `categorization` right now, WITHOUT writing anything. Same
 * validations and messages as `createCategoryRule` (400, 404, 409, in that
 * order), the same reads as the `pendingAndClosing` run, and the rule not
 * created yet added LAST, where the newest rule sits in the run: same
 * `planCategorization`, same shapes, with `ruleId: null` where the POST puts
 * the new id. Every write of the plan counts as written.
 */
export async function previewCategoryRule(
  prisma: AppPrismaClient,
  input: CreateCategoryRuleBody,
): Promise<CategoryRulePreview> {
  const matchText = normalizedMatchTextOrThrow(input.matchText)
  const category = await existingCategoryOrThrow(prisma, input.categoryId)
  const existing = await prisma.categoryRule.findUnique({ where: { matchText } })
  if (existing) throw new ConflictError(duplicateMatchTextMessage(matchText))

  const { rules, movements } = await readCategorizationInput(prisma, 'pendingAndClosing')
  const notCreatedYet: PlannableRule = {
    id: null,
    matchText,
    categoryId: category.id,
    category: { name: category.name, kind: category.kind },
  }
  const plan = planCategorization<PlannableRule>(movements, [...rules, notCreatedYet])
  const conflicts = plan.conflicts.map(toCategorizationConflict)

  return {
    matchText,
    categoryId: category.id,
    categorization: {
      categorized: plan.writes.length,
      categorizedMovements: plan.writes.map(toCategorizedMovement),
      conflictCount: conflicts.length,
      conflicts,
      unmatched: plan.unmatched,
    },
  }
}

/**
 * Same sanitizing pattern as `describeDetectionError` in the transfers module
 * (copied, not shared: it sanitizes the same, different module): an `AppError`
 * travels with its own stable code, anything else is reported generically so
 * no internal detail can leak into the report (R12).
 */
function describeCategorizationError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_SERVER_ERROR', message: error.message }
  }
  return { code: 'INTERNAL_SERVER_ERROR', message: 'Unknown error' }
}
