import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type { Category, CategoryRule } from '../../generated/prisma/client.js'

import { AppError, ConflictError, NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  CategorizationResult,
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

/** Throws the 404 of R2 when the category the rule points at does not exist. */
async function assertCategoryExists(prisma: AppPrismaClient, categoryId: number): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } })
  if (!category) throw new NotFoundError('Category not found')
}

type CategoryRuleWithCategory = CategoryRule & { category: Category }

const includeCategory = { category: true } as const

export async function createCategoryRule(
  prisma: AppPrismaClient,
  input: CreateCategoryRuleBody,
): Promise<CategoryRuleWithCategory> {
  const matchText = normalizedMatchTextOrThrow(input.matchText)
  await assertCategoryExists(prisma, input.categoryId)

  try {
    return await prisma.categoryRule.create({
      data: { categoryId: input.categoryId, matchText },
      include: includeCategory,
    })
  } catch (error) {
    // P2002: unique violation on `matchText` — the same normalized text twice.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`A rule with matchText '${matchText}' already exists`)
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
    await assertCategoryExists(prisma, input.categoryId)
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
      throw new ConflictError(`A rule with matchText '${matchText}' already exists`)
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

/**
 * The categorization run (R6–R11, R14). It NEVER throws (same contract as
 * `detectTransfers`): a failure comes back inside `result.error`, with what
 * was already written still counted, so the import report that carries this
 * result is never lost to a categorization problem (R12).
 *
 * Eligibility lives in the WHERE (R8): only movements with `categoryId` NULL,
 * `status` 'pending_review' and a non-neutral type enter memory at all. A rule
 * matches when the normalized description CONTAINS its `matchText` AND its
 * category's kind equals the movement's type (R6). Rules of one single
 * category → write; zero rules or rules of two or more distinct categories →
 * nothing is written and the case is counted (R7, R9).
 *
 * Each write re-checks eligibility in its own WHERE so a concurrent write can
 * never be overwritten (same insurance as the `transferId: null` of F40), and
 * `data` carries ONLY `categoryId` (R14). Idempotency is free (R11): an
 * assigned movement stops being eligible in the next read.
 */
export async function applyCategoryRules(prisma: AppPrismaClient): Promise<CategorizationResult> {
  const result: CategorizationResult = {
    categorized: 0,
    conflictCount: 0,
    conflicts: [],
    unmatched: 0,
  }

  try {
    const rules = await prisma.categoryRule.findMany({
      include: { category: { select: { name: true, kind: true } } },
      orderBy: { id: 'asc' },
    })

    const movements = await prisma.movement.findMany({
      where: {
        categoryId: null,
        status: 'pending_review',
        type: { in: ['expense', 'income'] },
      },
      select: { id: true, type: true, description: true, bookingDate: true },
      orderBy: { id: 'asc' },
    })

    for (const movement of movements) {
      const description = normalizeForMatch(movement.description)
      const matches = rules.filter(
        (rule) => rule.category.kind === movement.type && description.includes(rule.matchText),
      )

      if (matches.length === 0) {
        result.unmatched += 1
        continue
      }

      const distinctCategoryIds = new Set(matches.map((rule) => rule.categoryId))
      if (distinctCategoryIds.size > 1) {
        // Two rules of the SAME category are no conflict: they point the same
        // way. Distinct categories fight, so nothing is assigned (R9).
        result.conflicts.push({
          movementId: movement.id,
          description: movement.description,
          bookingDate: movement.bookingDate.toISOString().slice(0, 10),
          matches: matches.map((rule) => ({
            ruleId: rule.id,
            matchText: rule.matchText,
            categoryId: rule.categoryId,
            categoryName: rule.category.name,
          })),
        })
        continue
      }

      const categoryId = matches[0]?.categoryId
      if (categoryId === undefined) continue
      const { count } = await prisma.movement.updateMany({
        where: { id: movement.id, categoryId: null, status: 'pending_review' },
        data: { categoryId },
      })
      result.categorized += count
    }

    result.conflictCount = result.conflicts.length
    return result
  } catch (error) {
    result.error = describeCategorizationError(error)
    return result
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
