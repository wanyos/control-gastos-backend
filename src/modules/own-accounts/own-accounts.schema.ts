/**
 * Route schemas of `/api/own-accounts` (feature 62). AJV checks the shapes
 * (types, the closed list of `type`, `YYYY-MM-DD` dates); the checks that need
 * the normalized text or the stored row (3 characters after normalizing, a
 * blank `name`, `closedAt` before `openedAt`) live in the service (R3, R4).
 */

const ownAccountTypes = ['checking', 'savings', 'investment', 'deposit', 'crypto', 'other']

const ownAccountProperties = {
  name: { type: 'string', minLength: 1 },
  bank: { type: 'string', minLength: 1 },
  type: { type: 'string', enum: ownAccountTypes },
  accountNumber: { type: ['string', 'null'] },
  openedAt: { type: ['string', 'null'], format: 'date' },
  closedAt: { type: ['string', 'null'], format: 'date' },
  texts: { type: 'array', items: { type: 'string', minLength: 1 } },
} as const

export const createOwnAccountSchema = {
  body: {
    type: 'object',
    required: ['name', 'bank', 'type'],
    additionalProperties: false,
    properties: ownAccountProperties,
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const createOwnAccountBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(createOwnAccountSchema.body.properties),
)

export const updateOwnAccountSchema = {
  params: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: { type: 'integer', minimum: 1 },
    },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: ownAccountProperties,
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const updateOwnAccountBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(updateOwnAccountSchema.body.properties),
)

/** `{ "names": [...] }`: the whole list, an empty one included (R4). */
export const replaceHolderNamesSchema = {
  body: {
    type: 'object',
    required: ['names'],
    additionalProperties: false,
    properties: {
      names: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const replaceHolderNamesBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(replaceHolderNamesSchema.body.properties),
)
