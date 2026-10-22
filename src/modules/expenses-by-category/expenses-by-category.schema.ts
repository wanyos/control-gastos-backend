/**
 * Schema of `GET /api/expenses-by-category` (feature 63). A malformed `month`,
 * `year` or `compare` is a `400 VALIDATION_ERROR` from the central error
 * handler; which of them may travel together is checked by `resolvePeriods`.
 * The response schema lists EVERY key of `expenses-by-category.types.ts`:
 * Fastify serializes only what is declared here.
 */
const amountsProperties = {
  amount: { type: 'string' },
  comparedAmount: { type: 'string' },
  difference: { type: 'string' },
} as const

const movementSchema = {
  type: 'object',
  required: ['id', 'bookingDate', 'description', 'amount', 'accountId'],
  properties: {
    id: { type: 'integer' },
    bookingDate: { type: 'string' },
    description: { type: 'string' },
    amount: { type: 'string' },
    accountId: { type: 'integer' },
  },
} as const

const lineSchema = {
  type: 'object',
  required: [
    'category',
    'amount',
    'comparedAmount',
    'difference',
    'change',
    'monthlyAmount',
    'movements',
  ],
  properties: {
    category: {
      type: ['object', 'null'],
      required: ['id', 'name', 'parentId', 'isFixed'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        parentId: { type: ['integer', 'null'] },
        isFixed: { type: 'boolean' },
      },
    },
    ...amountsProperties,
    change: { type: ['string', 'null'], enum: ['new', 'gone', null] },
    monthlyAmount: { type: ['string', 'null'] },
    movements: { type: 'array', items: movementSchema },
  },
} as const

const groupSchema = {
  type: 'object',
  required: ['amount', 'comparedAmount', 'difference', 'lines'],
  properties: {
    ...amountsProperties,
    lines: { type: 'array', items: lineSchema },
  },
} as const

const rangeProperties = {
  from: { type: 'string' },
  to: { type: 'string' },
  months: { type: 'integer' },
} as const

export const getExpensesByCategorySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
      year: { type: 'string', pattern: '^\\d{4}$' },
      compare: { type: 'string', enum: ['previous-month', 'same-month-last-year'] },
    },
  },
  response: {
    200: {
      type: 'object',
      required: [
        'period',
        'compared',
        'compare',
        'amount',
        'comparedAmount',
        'difference',
        'fixed',
        'variable',
      ],
      properties: {
        period: {
          type: 'object',
          required: ['month', 'year', 'from', 'to', 'months'],
          properties: {
            month: { type: ['string', 'null'] },
            year: { type: ['string', 'null'] },
            ...rangeProperties,
          },
        },
        compared: {
          type: 'object',
          required: ['from', 'to', 'months'],
          properties: rangeProperties,
        },
        compare: {
          type: 'string',
          enum: ['previous-month', 'same-month-last-year', 'previous-year'],
        },
        ...amountsProperties,
        fixed: groupSchema,
        variable: groupSchema,
      },
    },
  },
} as const
