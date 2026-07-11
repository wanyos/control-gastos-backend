export const createExpenseSchema = {
  body: {
    type: 'object',
    required: ['description', 'amount'],
    additionalProperties: false,
    properties: {
      description: { type: 'string', minLength: 1 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string', format: 'date-time' },
      categoryId: { type: 'integer' },
    },
  },
} as const

export const expenseIdParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'integer' } },
  },
} as const
