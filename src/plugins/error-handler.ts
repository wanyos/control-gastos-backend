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
