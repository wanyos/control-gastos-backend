/**
 * Schema of `GET /api/last-imports` (feature 69). There are NO parameters: the
 * endpoint answers only for today. `additionalProperties: false` with no
 * properties makes Fastify's validator DISCARD any unknown parameter before the
 * handler runs, same behaviour as `GET /api/net-worth`.
 * The response schema lists EVERY key of `last-imports.types.ts`: Fastify
 * serializes only what is declared here.
 */
const gapSchema = {
  type: 'object',
  required: ['from', 'to'],
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
  },
} as const

const accountSchema = {
  type: 'object',
  required: ['accountId', 'bank', 'alias', 'dataUntil', 'importedAt', 'expectedMonthly', 'gaps'],
  properties: {
    accountId: { type: 'integer' },
    bank: { type: 'string' },
    alias: { type: 'string' },
    dataUntil: { type: ['string', 'null'] },
    importedAt: { type: ['string', 'null'] },
    expectedMonthly: { type: 'boolean' },
    gaps: { type: 'array', items: gapSchema },
  },
} as const

const productSchema = {
  type: 'object',
  required: [
    'productId',
    'bank',
    'name',
    'type',
    'maturityDate',
    'dataUntil',
    'importedAt',
    'expectedMonthly',
    'gaps',
  ],
  properties: {
    productId: { type: 'integer' },
    bank: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    maturityDate: { type: ['string', 'null'] },
    dataUntil: { type: ['string', 'null'] },
    importedAt: { type: ['string', 'null'] },
    expectedMonthly: { type: 'boolean' },
    gaps: { type: 'array', items: gapSchema },
  },
} as const

export const getLastImportsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  response: {
    200: {
      type: 'object',
      required: ['asOf', 'accounts', 'products'],
      properties: {
        asOf: { type: 'string' },
        accounts: { type: 'array', items: accountSchema },
        products: { type: 'array', items: productSchema },
      },
    },
  },
} as const
