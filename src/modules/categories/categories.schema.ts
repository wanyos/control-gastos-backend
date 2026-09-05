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

/** Renaming only takes `name`: the kind and the parentId are immutable this way. */
export const renameCategorySchema = {
  params: categoryIdParams,
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const renameCategoryBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(renameCategorySchema.body.properties),
)

export const deleteCategorySchema = {
  params: categoryIdParams,
} as const
