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
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const updateMovementBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(updateMovementSchema.body.properties),
)
