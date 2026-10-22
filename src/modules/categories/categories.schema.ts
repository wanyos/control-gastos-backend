const categoryIdParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
} as const

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

/**
 * The update takes `name` and/or `isFixed` (F63): the kind and the parentId are
 * immutable this way. At least one of the two must travel.
 */
export const updateCategorySchema = {
  params: categoryIdParams,
  body: {
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      isFixed: { type: 'boolean' },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const updateCategoryBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(updateCategorySchema.body.properties),
)

export const deleteCategorySchema = {
  params: categoryIdParams,
} as const
