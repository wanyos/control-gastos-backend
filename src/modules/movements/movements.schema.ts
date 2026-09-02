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
