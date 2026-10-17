/**
 * Schema of `GET /api/recurring-expenses` (feature 58). No querystring: an
 * unknown parameter is ignored. The response schema lists EVERY key of
 * `recurring-expenses.types.ts`: Fastify serializes only what is declared
 * here, so a key missing below would silently vanish from the answer.
 */
const movementSchema = {
  type: 'object',
  required: ['id', 'accountId', 'bookingDate', 'amount', 'description'],
  properties: {
    id: { type: 'integer' },
    accountId: { type: 'integer' },
    bookingDate: { type: 'string' },
    amount: { type: 'string' },
    description: { type: 'string' },
  },
} as const

const monthAmountSchema = {
  type: 'object',
  required: ['month', 'amount'],
  properties: {
    month: { type: 'string' },
    amount: { type: 'string' },
  },
} as const

const groupProperties = {
  months: { type: 'array', items: monthAmountSchema },
  monthlyCost: { type: 'string' },
  movements: { type: 'array', items: movementSchema },
} as const

const billSchema = {
  type: 'object',
  required: [
    'key',
    'name',
    'periodicity',
    'usualAmount',
    'count',
    'lastDate',
    'lastMonth',
    'lastMonthAmount',
    'previousMonth',
    'previousMonthAmount',
    'change',
    'hasIncreased',
    'monthlyCost',
    'movements',
  ],
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    periodicity: {
      type: 'string',
      enum: [
        'once',
        'twice_monthly',
        'monthly',
        'every_two_months',
        'every_three_months',
        'every_six_months',
        'annual',
      ],
    },
    usualAmount: { type: 'string' },
    count: { type: 'integer' },
    lastDate: { type: 'string' },
    lastMonth: { type: 'string' },
    lastMonthAmount: { type: 'string' },
    previousMonth: { type: ['string', 'null'] },
    previousMonthAmount: { type: ['string', 'null'] },
    change: { type: ['string', 'null'] },
    hasIncreased: { type: 'boolean' },
    monthlyCost: { type: 'string' },
    movements: { type: 'array', items: movementSchema },
  },
} as const

const categoryGroupSchema = {
  type: 'object',
  required: ['category', 'months', 'monthlyCost', 'movements'],
  properties: {
    category: {
      type: ['object', 'null'],
      required: ['id', 'name', 'parentId'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        parentId: { type: ['integer', 'null'] },
      },
    },
    ...groupProperties,
  },
} as const

export const getRecurringExpensesSchema = {
  response: {
    200: {
      type: 'object',
      required: ['period', 'monthlyTotal', 'bills', 'transfersToPeople', 'variable'],
      properties: {
        period: {
          type: 'object',
          required: ['from', 'to', 'months'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            months: { type: 'array', items: { type: 'string' } },
          },
        },
        monthlyTotal: { type: 'string' },
        bills: { type: 'array', items: billSchema },
        transfersToPeople: {
          type: 'object',
          required: ['months', 'monthlyCost', 'movements'],
          properties: groupProperties,
        },
        variable: { type: 'array', items: categoryGroupSchema },
      },
    },
  },
} as const
