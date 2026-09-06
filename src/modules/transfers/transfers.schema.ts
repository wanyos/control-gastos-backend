/**
 * Schemas of the manual transfer link (F44). The body of the link is EXACTLY
 * `movementIds` with two integers ≥ 1: anything else — fewer or more elements,
 * an unknown property, an empty body — is a `400 VALIDATION_ERROR` out of the
 * central error handler. Two EQUAL ids also fail with a 400, but that check
 * lives in the service, where the message can say which id came twice
 * (AJV's `uniqueItems` under `removeAdditional` cannot).
 */
export const linkTransferSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['movementIds'],
    properties: {
      movementIds: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: { type: 'integer', minimum: 1 },
      },
    },
  },
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const linkTransferBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(linkTransferSchema.body.properties),
)

export const unlinkTransferSchema = {
  params: {
    type: 'object',
    required: ['transferId'],
    additionalProperties: false,
    properties: {
      transferId: { type: 'string', minLength: 1 },
    },
  },
} as const
