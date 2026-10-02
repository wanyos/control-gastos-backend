/**
 * Schemas of the warning routes (features 48 and 54), with the native JSON Schema of
 * Fastify (ADR-003).
 *
 * There is NO response schema here, on purpose and for the same reason as
 * `import.schema.ts`: a response schema SERIALIZES BY OMISSION, so a field added
 * to the report later would silently stop travelling. The shape of the answer is
 * fixed by the types of `import.warnings.types.ts` (checked by `tsc`) and by the
 * tests, not by a second copy of it written in JSON.
 */

/**
 * Body of `PATCH /api/import/warnings/balance-mismatches/:id` (R11, R12, R14).
 *
 * `minProperties: 1` is what makes an empty `{}` a 400 instead of a silent
 * no-op, and `additionalProperties: false` keeps any other column of the
 * descuadre — the two amounts above all — out of reach of this route: what the
 * human changes of a warning is whether he has looked at it and what he wants to
 * remember about it, never the numbers that were found.
 *
 * `note` accepts `null` to CLEAR the note; leaving it out keeps the stored one.
 */
export const reviewBalanceMismatchSchema = {
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
    properties: {
      status: { type: 'string', enum: ['pending', 'reviewed'] },
      note: { type: ['string', 'null'], maxLength: 500 },
    },
  },
} as const

/**
 * `PATCH /api/import/warnings/unparsed-rows/:id` (feature 54): the same params
 * and the same body, so the allow-list below serves both routes.
 */
export const reviewUnparsedRowSchema = {
  params: reviewBalanceMismatchSchema.params,
  body: reviewBalanceMismatchSchema.body,
} as const

/** Derived from the schema so the allow-list and the schema cannot diverge. */
export const reviewBalanceMismatchBodyProperties: ReadonlySet<string> = new Set(
  Object.keys(reviewBalanceMismatchSchema.body.properties),
)
