import type { FastifyInstance } from 'fastify'

/**
 * Rutas de estado del servicio.
 *   GET /health     -> liveness (el proceso responde)
 *   GET /health/db  -> readiness (la base de datos está accesible)
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
      fastify.log.error(error, 'Fallo la comprobación de la base de datos')
      return reply.status(503).send({ status: 'error', database: 'down' })
    }
  })
}
