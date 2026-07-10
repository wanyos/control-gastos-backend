import type { FastifyInstance } from 'fastify'

/**
 * Service status routes.
 *   GET /health     -> liveness (the process responds)
 *   GET /health/db  -> readiness (the database is reachable)
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
}
