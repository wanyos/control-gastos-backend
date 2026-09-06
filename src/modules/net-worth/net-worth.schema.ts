/**
 * Querystring of `GET /api/net-worth` (feature 42): there are NO parameters —
 * the endpoint answers only for today (R11). `additionalProperties: false`
 * with no properties makes Fastify's validator DISCARD any unknown parameter
 * before the handler runs (its AJV removes additional properties instead of
 * rejecting them), same behaviour as `GET /api/overview`.
 */
export const getNetWorthSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
} as const
