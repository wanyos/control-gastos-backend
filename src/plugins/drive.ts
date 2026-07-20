import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { createDriveClient, type AppDriveClient } from '../lib/drive.js'

// Extend the Fastify instance so `fastify.drive` is typed across the whole
// project (routes, hooks, etc.).
declare module 'fastify' {
  interface FastifyInstance {
    drive: AppDriveClient
  }
}

/**
 * Fastify plugin that builds the Drive client from the validated config and
 * exposes it as `fastify.drive`. Unlike the Prisma plugin it does NO eager
 * handshake, logs nothing at startup (there is nothing to assert without a
 * network round-trip) and registers no `onClose`: the Drive client is a
 * connectionless HTTP wrapper. Connectivity is checked on demand at
 * `GET /health/drive`.
 */
async function drivePlugin(fastify: FastifyInstance) {
  const drive = createDriveClient(fastify.config.drive)

  fastify.decorate('drive', drive)
}

// `fastify-plugin` prevents encapsulation, so `fastify.drive` is available in
// all registered routes.
export default fp(drivePlugin, { name: 'drive' })
