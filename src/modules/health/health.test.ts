import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { buildApp } from '../../app.js'
import healthRoutes from './health.routes.js'
import type { AppDriveClient } from '../../lib/drive.js'

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

// A bare Fastify instance with a Drive double: buildApp() already decorates
// `drive` with the real client and `decorate` cannot be overridden, so the Drive
// endpoint is exercised on its own (design.md §8).
function driveDouble(get: ReturnType<typeof vi.fn>): AppDriveClient {
  return { about: { get } } as unknown as AppDriveClient
}

describe('GET /health/drive (bare app with a Drive double)', () => {
  it('returns 200 with the exact body and without the email when Drive is up (R9)', async () => {
    const app = Fastify()
    app.decorate(
      'drive',
      driveDouble(
        vi.fn().mockResolvedValue({ data: { user: { emailAddress: 'owner@example.com' } } }),
      ),
    )
    app.register(healthRoutes)
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/health/drive' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', drive: 'up' })
    expect(response.payload).not.toContain('owner@example.com')

    await app.close()
  })

  it('logs the connected account email at info level, not in the body (R20)', async () => {
    const app = Fastify()
    const infoSpy = vi.spyOn(app.log, 'info')
    app.decorate(
      'drive',
      driveDouble(
        vi.fn().mockResolvedValue({ data: { user: { emailAddress: 'owner@example.com' } } }),
      ),
    )
    app.register(healthRoutes)
    await app.ready()

    await app.inject({ method: 'GET', url: '/health/drive' })

    expect(infoSpy).toHaveBeenCalledWith(
      { account: 'owner@example.com' },
      'Drive connection verified',
    )

    await app.close()
  })

  it('returns 503 with the exact body when Drive is down and keeps the app up (R10)', async () => {
    const app = Fastify()
    app.decorate('drive', driveDouble(vi.fn().mockRejectedValue(new Error('invalid_grant'))))
    app.register(healthRoutes)
    await app.ready()

    const driveResponse = await app.inject({ method: 'GET', url: '/health/drive' })
    expect(driveResponse.statusCode).toBe(503)
    expect(driveResponse.json()).toEqual({ status: 'error', drive: 'down' })

    // The app is still standing: /health keeps answering 200.
    const liveness = await app.inject({ method: 'GET', url: '/health' })
    expect(liveness.statusCode).toBe(200)
    expect(liveness.json()).toMatchObject({ status: 'ok' })

    await app.close()
  })
})
