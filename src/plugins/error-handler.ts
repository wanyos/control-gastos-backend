import { STATUS_CODES } from 'node:http'

import { errorCodes } from 'fastify'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { AppError } from '../errors/app-error.js'

interface ErrorResponseBody {
  statusCode: number
  code: string
  message: string
}

function errorBody(statusCode: number, code: string, message: string): ErrorResponseBody {
  return { statusCode, code, message }
}

/** Fastify tags every error it raises itself with a `FST_ERR_*` code. */
const FASTIFY_CODE_PREFIX = 'FST_ERR_'

/**
 * Is this the caller's fault? Two conditions, no hand-written list of codes
 * (feature 35, decision 1):
 *
 *  1. the error carries a `FST_ERR_*` code — it was raised by Fastify itself,
 *     not by a library that happens to decorate its errors with a status; and
 *  2. its own `statusCode` is in the 4xx range — Fastify already classified it.
 *
 * Anything else (a status of 5xx, or no status at all) is NOT trusted and falls
 * through to the generic 500: an error that does not say it is the caller's
 * fault is treated as ours, which is the safe direction to be wrong in.
 */
function isClientFault(error: FastifyError): boolean {
  return (
    typeof error.code === 'string' &&
    error.code.startsWith(FASTIFY_CODE_PREFIX) &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode <= 499
  )
}

/**
 * The `code` of the body, derived from the HTTP status (feature 35, decision 2):
 * 400 → `BAD_REQUEST`, 413 → `PAYLOAD_TOO_LARGE`, 415 → `UNSUPPORTED_MEDIA_TYPE`.
 *
 * It is NOT Fastify's own `FST_ERR_*` code: `code` is what the frontend reads to
 * decide, and welding our public contract to the internal vocabulary of a
 * framework would make it change under it (and it is an open-ended list it could
 * never enumerate). Derived from the status it already sees, the vocabulary is
 * closed, documented in `docs/api-contract.md` and maintains itself. The Fastify
 * code is not lost: it travels whole to the log.
 */
function statusCodeName(statusCode: number): string {
  const text = STATUS_CODES[statusCode]
  if (!text) return 'CLIENT_ERROR'
  return text.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')
}

const declaredMessage = new Map<string, string>()

/**
 * The message Fastify declares for a code, with its `%s` placeholders still
 * unresolved (e.g. `'%s' is not a valid url component`). `undefined` if the code
 * is not one of Fastify's own — a plugin's, say.
 */
function fastifyDeclaredMessage(code: string): string | undefined {
  const cached = declaredMessage.get(code)
  if (cached !== undefined) return cached

  const constructors = errorCodes as unknown as Record<string, (new () => Error) | undefined>
  const constructor = constructors[code]
  if (typeof constructor !== 'function') return undefined

  const message = new constructor().message
  declaredMessage.set(code, message)
  return message
}

/**
 * What the caller gets told (feature 35, decision 3). Checked one by one against
 * the 13 4xx errors declared by fastify@5.12.1: most are fixed sentences that
 * leak nothing (`Body cannot be empty when content-type is set to
 * 'application/json'`, `Request body is too large`, `Unsupported Media Type`),
 * but some interpolate a `%s` — and two of those interpolate a value of OURS,
 * not of the caller: `FST_ERR_CTP_INSTANCE_ALREADY_STARTED` (a method name of
 * our own code) and `FST_ERR_INVALID_URL` (a value our code passed in).
 *
 * So the rule is fail-closed and needs no list: the message travels only when it
 * is EXACTLY the sentence Fastify declares for that code, i.e. when nothing was
 * interpolated into it. The moment a `%s` got filled in — whatever it was filled
 * with — the caller gets the plain status text instead. A code Fastify does not
 * declare (a plugin's) is treated the same way. The original message always goes
 * to the log, whole.
 */
function safeClientMessage(error: FastifyError, statusCode: number): string {
  const declared = fastifyDeclaredMessage(error.code)
  if (declared !== undefined && declared === error.message) return error.message
  return STATUS_CODES[statusCode] ?? 'Client error'
}

/**
 * Central error → HTTP response mapping. Exported separately so it can be
 * unit-tested with fake request/reply.
 */
export function handleError(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AppError) {
    request.log.warn(error)
    return reply
      .status(error.statusCode)
      .send(errorBody(error.statusCode, error.code, error.message))
  }

  // Fastify/AJV schema validation failures carry a `validation` array.
  if ('validation' in error && error.validation) {
    request.log.warn(error)
    return reply.status(400).send(errorBody(400, 'VALIDATION_ERROR', error.message))
  }

  // A Fastify error that already classified itself as the caller's fault: empty
  // JSON body (400), malformed JSON (400), unsupported content type (415), body
  // too large (413)… Before feature 35 every one of these came out as a 500 and
  // sent the caller to read the server log for a mistake of their own.
  if (isClientFault(error)) {
    const statusCode = error.statusCode as number
    request.log.warn(error)
    return reply
      .status(statusCode)
      .send(errorBody(statusCode, statusCodeName(statusCode), safeClientMessage(error, statusCode)))
  }

  // Unknown error: log the original, respond with a generic body only.
  request.log.error(error)
  return reply.status(500).send(errorBody(500, 'INTERNAL_SERVER_ERROR', 'Internal server error'))
}

async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler(handleError)

  app.setNotFoundHandler((request, reply) => {
    const message = `Route ${request.method} ${request.url} not found`
    return reply.status(404).send(errorBody(404, 'NOT_FOUND', message))
  })
}

// Not encapsulated: it must cover every module registered after it.
export default fp(errorHandlerPlugin, { name: 'error-handler' })
