/**
 * Querystring of `GET /api/overview` (feature 38). A malformed month
 * (`2026-13`, `sep`, a full date) comes out of the central error handler as
 * `400 VALIDATION_ERROR`, never as a silent fallback to the current month:
 * the fallback is ONLY for a month that was not sent at all.
 */
export const getOverviewSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
    },
  },
} as const
