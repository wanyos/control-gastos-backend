import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { errorCodes } from 'fastify'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { buildApp } from '../app.js'
import { NotFoundError } from '../errors/app-error.js'
import { handleError } from './error-handler.js'

/** The body every error of the API answers with (see `docs/api-contract.md`). */
interface ErrorBody {
  statusCode: number
  code: string
  message: string
}

function fakeRequest() {
  const request = {
    log: { warn: vi.fn(), error: vi.fn() },
  }
  return request as unknown as FastifyRequest & typeof request
}

function fakeReply() {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  }
  reply.status.mockReturnValue(reply)
  reply.send.mockReturnValue(reply)
  return reply as unknown as FastifyReply & typeof reply
}

describe('handleError (unit)', () => {
  it('logs the original non-AppError via request.log.error and replies 500 generic', () => {
    const error = new Error('secret detail')
    const request = fakeRequest()
    const reply = fakeReply()

    handleError(error as FastifyError, request, reply)

    expect(request.log.error).toHaveBeenCalledWith(error)
    expect(reply.status).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
  })

  it('maps an AppError to its own statusCode, code and message', () => {
    const error = new NotFoundError('Expense not found')
    const request = fakeRequest()
    const reply = fakeReply()

    handleError(error, request, reply)

    expect(request.log.warn).toHaveBeenCalledWith(error)
    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Expense not found',
    })
  })

  it('keeps the 500 body free of the internal detail while the log keeps it whole', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:5434 on table "Movement"')
    const request = fakeRequest()
    const reply = fakeReply()

    handleError(error as FastifyError, request, reply)

    // The log gets the error object itself, not a summary of it.
    expect(request.log.error).toHaveBeenCalledWith(error)
    const [body] = reply.send.mock.calls[0] as [ErrorBody]
    expect(body.message).toBe('Internal server error')
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('Movement')
  })

  it('maps a Fastify/AJV validation error to 400 VALIDATION_ERROR', () => {
    const error = Object.assign(new Error("body must have required property 'amount'"), {
      validation: [{}],
    })
    const request = fakeRequest()
    const reply = fakeReply()

    handleError(error as unknown as FastifyError, request, reply)

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: "body must have required property 'amount'",
    })
  })
})

describe('handleError — a fault of the caller is not a 500 (feature 35)', () => {
  function run(error: unknown) {
    const request = fakeRequest()
    const reply = fakeReply()
    handleError(error as FastifyError, request, reply)
    const [body] = reply.send.mock.calls[0] as [ErrorBody]
    return { request, reply, body }
  }

  it('answers 400 BAD_REQUEST to an empty body with a JSON content-type', () => {
    const { request, reply, body } = run(new errorCodes.FST_ERR_CTP_EMPTY_JSON_BODY())

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(body).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: "Body cannot be empty when content-type is set to 'application/json'",
    })
    // The caller's mistake is a warning, never a server failure.
    expect(request.log.warn).toHaveBeenCalled()
    expect(request.log.error).not.toHaveBeenCalled()
  })

  it('answers 400 BAD_REQUEST to a malformed JSON body', () => {
    const { reply, body } = run(new errorCodes.FST_ERR_CTP_INVALID_JSON_BODY())

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(body).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: "Body is not valid JSON but content-type is set to 'application/json'",
    })
  })

  it('answers 415 UNSUPPORTED_MEDIA_TYPE to a content-type nobody parses', () => {
    const { reply, body } = run(new errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE())

    expect(reply.status).toHaveBeenCalledWith(415)
    expect(body).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Unsupported Media Type',
    })
  })

  it('answers 413 PAYLOAD_TOO_LARGE to a body that is too big', () => {
    const { reply, body } = run(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE())

    expect(reply.status).toHaveBeenCalledWith(413)
    expect(body).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    })
  })

  it('does not propagate a Fastify message that got a value interpolated into it', () => {
    // `FST_ERR_CTP_INSTANCE_ALREADY_STARTED` interpolates a method name of OUR
    // code and Fastify still tags it 400: the status is respected, the sentence
    // is not, because it no longer is the one Fastify declares.
    const error = new errorCodes.FST_ERR_CTP_INSTANCE_ALREADY_STARTED('addContentTypeParser')
    const { reply, body } = run(error)

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(body.message).toBe('Bad Request')
    expect(JSON.stringify(body)).not.toContain('addContentTypeParser')
  })

  it('does not propagate the caller-supplied value of an interpolated message either', () => {
    const { reply, body } = run(new errorCodes.FST_ERR_BAD_URL('/api/%%%'))

    expect(reply.status).toHaveBeenCalledWith(400)
    expect(body).toEqual({ statusCode: 400, code: 'BAD_REQUEST', message: 'Bad Request' })
  })

  it('keeps a Fastify error with a 5xx status as a generic 500', () => {
    const error = Object.assign(new Error('Reply was already sent, while sending /secret/path'), {
      code: 'FST_ERR_REP_ALREADY_SENT',
      statusCode: 500,
    })
    const { request, reply, body } = run(error)

    expect(reply.status).toHaveBeenCalledWith(500)
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
    expect(request.log.error).toHaveBeenCalledWith(error)
  })

  it('keeps a Fastify error with no status at all as a generic 500', () => {
    const error = Object.assign(new Error('no status here'), { code: 'FST_ERR_SOMETHING' })
    const { reply, body } = run(error)

    expect(reply.status).toHaveBeenCalledWith(500)
    expect(body.code).toBe('INTERNAL_SERVER_ERROR')
  })

  it('does not trust a 4xx status carried by an error that is not Fastify\u2019s', () => {
    // A third-party client (an HTTP library talking to Drive, say) decorates its
    // errors with a status too, and its message is not ours to publish.
    const error = Object.assign(new Error('403 reading C:/Users/secret/token.json'), {
      code: 'ERR_BAD_RESPONSE',
      statusCode: 403,
    })
    const { request, reply, body } = run(error)

    expect(reply.status).toHaveBeenCalledWith(500)
    expect(body.message).toBe('Internal server error')
    expect(JSON.stringify(body)).not.toContain('token.json')
    expect(request.log.error).toHaveBeenCalledWith(error)
  })
})

describe('error handler (integration)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    // Test-only route to exercise the unknown-error path end to end.
    app.get('/boom', async () => {
      throw new Error('secret detail')
    })
    // Test-only routes for the caller-fault paths (feature 35). The tiny body
    // limit avoids having to push a megabyte through the injector.
    app.post('/echo', async (request) => ({ received: request.body }))
    app.post('/tiny', { bodyLimit: 32 }, async () => ({ ok: true }))
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('responds 500 with the generic body and without internal details', async () => {
    const response = await app.inject({ method: 'GET', url: '/boom' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    })
    expect(response.payload).not.toContain('secret detail')
  })

  it('responds 400, not 500, to an empty body with a JSON content-type', async () => {
    // The exact request that uncovered it: POST with a JSON header and no body.
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: "Body cannot be empty when content-type is set to 'application/json'",
    })
  })

  it('responds 400, not 500, to a malformed JSON body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{ "iban": ',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' })
  })

  it('responds 415, not 500, to a content-type it cannot parse', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'iban=ES00',
    })

    expect(response.statusCode).toBe(415)
    expect(response.json()).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Unsupported Media Type',
    })
  })

  it('responds 413, not 500, to a body that exceeds the limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tiny',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(200) }),
    })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    })
  })

  it('leaves the happy path of a route untouched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: { iban: 'ES0000000000000000000000' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: { iban: 'ES0000000000000000000000' } })
  })

  it('still answers 400 VALIDATION_ERROR when the schema rejects the body', async () => {
    // NO REGRESSION: a schema failure is a caller fault too, and it keeps its
    // own code — the frontend already reads it.
    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: { 'content-type': 'application/json' },
      payload: { iban: 'ES0000000000000000000000' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('responds 404 NOT_FOUND for a route that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Route GET /does-not-exist not found',
    })
  })
})
