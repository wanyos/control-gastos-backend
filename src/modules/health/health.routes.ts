import type { FastifyInstance } from 'fastify'

import { checkDriveConnection } from '../../lib/drive.js'

/**
 * Service status routes.
 *   GET /health        -> liveness (the process responds)
 *   GET /health/db     -> readiness (the database is reachable)
 *   GET /health/drive  -> readiness (Google Drive is reachable)
 */
export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  fastify.get('/health/db', async (_request, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`
      return { status: 'ok', database: 'up' }
    } catch (error) {
      fastify.log.error(error, 'Database health check failed')
      return reply.status(503).send({ status: 'error', database: 'down' })
    }
  })

  fastify.get('/health/drive', async (_request, reply) => {
    try {
      const account = await checkDriveConnection(fastify.drive)
      // The connected account goes to the log, never to the response body: this
      // endpoint has no authentication and must not expose the owner's email.
      fastify.log.info({ account }, 'Drive connection verified')
      return { status: 'ok', drive: 'up' }
    } catch (error) {
      // `error` is already a sanitized DriveConnectionError from checkDriveConnection.
      fastify.log.error(error, 'Drive health check failed')
      return reply.status(503).send({ status: 'error', drive: 'down' })
    }
  })
}
