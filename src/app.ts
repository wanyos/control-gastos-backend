import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type AppConfig } from './config/env.js'
import expensesRoutes from './modules/expenses/expenses.routes.js'
import healthRoutes from './modules/health/health.routes.js'
import errorHandlerPlugin from './plugins/error-handler.js'
import prismaPlugin from './plugins/prisma.js'

/**
 * Builds and configures the Fastify instance (plugins + modules) without
 * starting to listen. Keeping it separate from `server.ts` eases integration testing.
 */
export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  })

  app.decorate('config', config)

  // Shared infrastructure. The error handler goes first so it covers every module.
  app.register(errorHandlerPlugin)
  app.register(prismaPlugin)

  // Modules.
  app.register(healthRoutes)
  app.register(expensesRoutes, { prefix: '/api/expenses' })

  return app
}
