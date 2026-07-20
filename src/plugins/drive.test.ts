import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../app.js'

describe('drive plugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    // Route registered after the plugin: it must be able to read fastify.drive (R7).
    app.get('/_drive-probe', async () => {
      return { hasAboutGet: typeof app.drive.about.get === 'function' }
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('decorates fastify.drive without any network handshake at startup (R7, R8)', () => {
    // ready() resolving with the placeholder credentials is the proof that no
    // eager network call happened: an eager handshake would fail with invalid_client.
    expect(app.drive).toBeDefined()
    expect(typeof app.drive.about.get).toBe('function')
  })

  it('exposes fastify.drive to a route registered after the plugin (R7)', async () => {
    const response = await app.inject({ method: 'GET', url: '/_drive-probe' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ hasAboutGet: true })
  })
})
