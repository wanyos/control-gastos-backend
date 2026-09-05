/**
 * Querystring of `GET /api/investments/overview` (feature 39). A malformed
 * value (`2026-13`, a `type` outside the enum, a non-integer `productId`)
 * comes out of the central error handler as `400 VALIDATION_ERROR`, never as
 * a silent guess: the current-month fallback is ONLY for a month that was not
 * sent at all, same as `GET /api/overview`.
 */
export const getInvestmentsOverviewSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
      productId: { type: 'integer', minimum: 1 },
      type: {
        type: 'string',
        enum: ['fund', 'etf', 'managed_portfolio', 'deposit', 'savings_account'],
      },
    },
  },
} as const
