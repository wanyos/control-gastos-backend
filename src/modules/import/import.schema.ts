/**
 * Request schema of the local reimport (feature 25), with the native JSON Schema
 * of Fastify (ADR-003).
 *
 * The three parts are OPTIONAL and the body itself may be missing: `POST
 * /api/import/local` with no body reimports every local copy, which is safe
 * because the run stores nothing twice (the partial unique index drops the
 * duplicates) and moves nothing at all. Each part narrows the walk, and a part
 * that does not exist on disk is answered with `LOCAL_COPY_NOT_FOUND`, never
 * with an empty report.
 *
 * `pattern` keeps a path separator out of the names before they ever reach the
 * filesystem: these values become a path under `var/drive-read/`.
 *
 * There is NO response schema here, on purpose: neither import route declares
 * one, so Fastify serializes the report untouched and the `transfers` field of
 * feature 40 (like every field before it) travels whole with nothing to add.
 */
export const localImportSchema = {
  body: {
    // `null` on purpose: a POST with no body at all is the "reimport everything"
    // call, and Fastify hands it over as null.
    type: ['object', 'null'],
    additionalProperties: false,
    properties: {
      bank: { type: 'string', minLength: 1, maxLength: 60, pattern: '^[^/\\\\]+$' },
      year: { type: 'string', pattern: '^[0-9]{4}$' },
      name: { type: 'string', minLength: 1, maxLength: 255, pattern: '^[^/\\\\]+$' },
    },
  },
} as const
