import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { buildApp } from '../app.js'
import { NotFoundError } from '../errors/app-error.js'
import { handleError } from './error-handler.js'

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

describe('error handler (integration)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    // Test-only route to exercise the unknown-error path end to end.
    app.get('/boom', async () => {
      throw new Error('secret detail')
    })
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
