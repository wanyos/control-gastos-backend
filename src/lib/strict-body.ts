import { ValidationError } from '../errors/app-error.js'

/**
 * Rejects a request body carrying properties outside `allowed` (feature 37).
 *
 * Why the route schema is not enough: Fastify's default AJV runs with
 * `removeAdditional`, so `additionalProperties: false` silently STRIPS an
 * unknown property instead of failing — a `PATCH` with `{ amount: … }` would
 * come out as a 200 that ignored the field. For a write endpoint that must
 * only ever touch an explicit allow-list of fields, that silence is the bug,
 * so the check runs in a `preValidation` hook on the raw parsed body, before
 * the schema gets a chance to strip anything.
 */
export function assertOnlyAllowedBodyProperties(body: unknown, allowed: ReadonlySet<string>): void {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return

  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Unknown body property '${key}'`)
    }
  }
}
