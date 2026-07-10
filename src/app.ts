import Fastify, { type FastifyInstance } from 'fastify'
import prismaPlugin from './plugins/prisma.js'
import healthRoutes from './routes/health.js'
import expenseRoutes from './routes/expenses.js'

/**
 * Builds and configures the Fastify instance (plugins + routes) without
 * starting to listen. Keeping it separate from `server.ts` eases integration testing.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  // Plugins (shared infrastructure).
  app.register(prismaPlugin)

  // Routes.
  app.register(healthRoutes)
  app.register(expenseRoutes, { prefix: '/api/expenses' })

  return app
}
