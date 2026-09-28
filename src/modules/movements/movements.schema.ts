/**
 * Querystring of `GET /api/movements` (feature 36). Validation is delegated to
 * the route schema so a malformed filter (a date that is not a date, an unknown
 * type, a page below 1) comes out of the central error handler as
 * `400 VALIDATION_ERROR` — never as a 500 and never as a silently empty list.
 *
 * `page`/`pageSize` defaults live HERE and nowhere else: Fastify applies them
 * (`useDefaults`) before the handler runs, so the service always receives both.
 */
export const listMovementsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accountId: { type: 'integer', minimum: 1 },
      // Inclusive on both ends: `from=2026-08-01&to=2026-08-31` is the whole
      // of August, extreme days included.
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
      type: { type: 'string', enum: ['expense', 'income', 'neutral'] },
      status: { type: 'string', enum: ['confirmed', 'pending_review'] },
      // Feature 47. `categoryId` stays a plain integer and "no category" is a
      // separate boolean, so the two never need a union type here; asking for
      // both at once is rejected by the service (R3), not silently resolved.
      categoryId: { type: 'integer', minimum: 1 },
      uncategorized: { type: 'boolean' },
      // Matched against the generated `descriptionSearch` column, so case and
      // diacritics do not matter (R5). Trimmed by the service before use.
      q: { type: 'string', minLength: 2, maxLength: 100 },
      // Feature 49: `only` = linked transfer legs, `none` = not linked (R10);
      // `only` = marked out of the totals, `none` = not marked (R16). Anything
      // else is a 400 (R11).
      transfer: { type: 'string', enum: ['only', 'none'] },
      excluded: { type: 'string', enum: ['only', 'none'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    },
  },
} as const

/**
 * Body of `PATCH /api/movements/:id` (feature 37). Only `categoryId` and
 * `status` can travel: `additionalProperties: false` is what technically
 * guarantees that no other field of the movement can be touched this way, and
 * `minProperties: 1` makes an empty `{}` a 400 instead of a silent no-op.
 */
export const updateMovementSchema = {
  params: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: { type: 'integer', minimum: 1 },
    },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      // null removes the category ("no category" is not a category, it is none).
      categoryId: { type: ['integer', 'null'], minimum: 1 },
      status: { type: 'string', enum: ['confirmed', 'pending_review'] },
      // Feature 49. AJV would coerce `"true"` or `null` into a boolean, so the
      // route also checks the RAW value in its preValidation (R3).
      excludedFromTotals: { type: 'boolean' },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const updateMovementBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(updateMovementSchema.body.properties),
)

/**
 * The most movements one `PATCH /api/movements` can carry (feature 47, R11):
 * the same maximum a page of `GET /api/movements` can show, so "mark everything
 * on this page" always fits in a single request.
 */
export const bulkUpdateMovementsMaxIds = 200

/**
 * Body of `PATCH /api/movements` (feature 47): the same two writable fields as
 * the single-movement endpoint, applied to an explicit list of ids. An empty
 * list, a repeated id or more than `bulkUpdateMovementsMaxIds` of them are a
 * 400 (R11), never a 200 that did something else than what was asked.
 *
 * "At least one of `categoryId`/`status`" is NOT expressible with
 * `minProperties` here — `ids` is always present — so the route checks it in
 * the same `preValidation` that rejects unknown properties (R12).
 */
export const bulkUpdateMovementsSchema = {
  body: {
    type: 'object',
    required: ['ids'],
    additionalProperties: false,
    properties: {
      ids: {
        type: 'array',
        minItems: 1,
        maxItems: bulkUpdateMovementsMaxIds,
        uniqueItems: true,
        items: { type: 'integer', minimum: 1 },
      },
      // null removes the category ("no category" is not a category, it is none).
      categoryId: { type: ['integer', 'null'], minimum: 1 },
      status: { type: 'string', enum: ['confirmed', 'pending_review'] },
      // Feature 49: same strict boolean as the single-movement endpoint (R3).
      excludedFromTotals: { type: 'boolean' },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const bulkUpdateMovementsBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(bulkUpdateMovementsSchema.body.properties),
)

/**
 * The fields a bulk update may write: at least one must travel (feature 47,
 * R12). Feature 49 adds the mark, so `{ ids, excludedFromTotals }` is valid.
 */
export const bulkUpdateMovementsWritableProperties: readonly string[] = [
  'categoryId',
  'status',
  'excludedFromTotals',
]
