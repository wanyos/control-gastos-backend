export const createCategorySchema = {
  body: {
    type: 'object',
    required: ['name', 'kind'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      kind: { type: 'string', enum: ['expense', 'income'] },
      parentId: { type: 'integer' },
    },
  },
} as const
