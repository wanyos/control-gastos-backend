export const createAccountSchema = {
  body: {
    type: 'object',
    required: ['iban', 'bank'],
    additionalProperties: false,
    properties: {
      iban: { type: 'string', minLength: 1 },
      bank: { type: 'string', minLength: 1 },
      alias: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['checking', 'savings'] },
      initialBalance: { type: 'number', minimum: 0 },
    },
  },
} as const

export const accountIdParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'integer' } },
  },
} as const
