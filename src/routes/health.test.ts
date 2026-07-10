import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'

describe('health routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok' })
  })

  it('GET /health/db returns 200 with database up', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/db' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok', database: 'up' })
  })
})
