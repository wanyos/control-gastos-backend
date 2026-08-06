import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type AppConfig } from './config/env.js'
import accountsRoutes from './modules/accounts/accounts.routes.js'
import bankinterRoutes from './modules/bankinter/bankinter.routes.js'
import categoriesRoutes from './modules/categories/categories.routes.js'
import healthRoutes from './modules/health/health.routes.js'
import ingestaRoutes from './modules/ingesta/ingesta.routes.js'
import movementsRoutes from './modules/movements/movements.routes.js'
import drivePlugin from './plugins/drive.js'
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
  app.register(drivePlugin)

  // Modules.
  app.register(healthRoutes)
  app.register(accountsRoutes, { prefix: '/api/accounts' })
  app.register(categoriesRoutes, { prefix: '/api/categories' })
  app.register(movementsRoutes, { prefix: '/api/movements' })
  app.register(ingestaRoutes, { prefix: '/api/ingesta' })
  app.register(bankinterRoutes, { prefix: '/api/parser' })

  return app
}
