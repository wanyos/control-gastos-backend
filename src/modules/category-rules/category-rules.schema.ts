const categoryRuleIdParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
} as const

/**
 * The REAL minimum length (3 characters AFTER normalizing) lives in the
 * service, where the message can name the normalized text: AJV only rejects
 * the empty string here.
 */
export const createCategoryRuleSchema = {
  body: {
    type: 'object',
    required: ['categoryId', 'matchText'],
    additionalProperties: false,
    properties: {
      categoryId: { type: 'integer', minimum: 1 },
      matchText: { type: 'string', minLength: 1 },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const createCategoryRuleBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(createCategoryRuleSchema.body.properties),
)

/** At least one of the two fields, and nothing else (R4). */
export const updateCategoryRuleSchema = {
  params: categoryRuleIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      categoryId: { type: 'integer', minimum: 1 },
      matchText: { type: 'string', minLength: 1 },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const updateCategoryRuleBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(updateCategoryRuleSchema.body.properties),
)

export const deleteCategoryRuleSchema = {
  params: categoryRuleIdParams,
} as const

/**
 * Feature 61: `GET /api/category-rules/preview` takes the body the POST would
 * get, in the querystring. The real checks (3 characters after normalizing,
 * the category exists, the text has no rule yet) live in the service, with
 * the POST's messages.
 */
export const previewCategoryRuleSchema = {
  querystring: {
    type: 'object',
    required: ['matchText', 'categoryId'],
    additionalProperties: false,
    properties: {
      matchText: { type: 'string', minLength: 1 },
      categoryId: { type: 'integer', minimum: 1 },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const previewCategoryRuleQueryProperties: ReadonlySet<string> = new Set(
  Object.keys(previewCategoryRuleSchema.querystring.properties),
)
