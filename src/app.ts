import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type AppConfig } from './config/env.js'
import accountsRoutes from './modules/accounts/accounts.routes.js'
import { parseBankinterXlsx } from './modules/bankinter/bankinter.parser.js'
import bankinterRoutes from './modules/bankinter/bankinter.routes.js'
import categoriesRoutes from './modules/categories/categories.routes.js'
import healthRoutes from './modules/health/health.routes.js'
import importRoutes from './modules/import/import.routes.js'
import type { BankParserRegistry } from './modules/import/import.types.js'
import ingestionRoutes from './modules/ingestion/ingestion.routes.js'
import movementsRoutes from './modules/movements/movements.routes.js'
import myinvestorRoutes from './modules/myinvestor/myinvestor.routes.js'
import { parseMyinvestorStatement } from './modules/myinvestor/myinvestor.statement.parser.js'
import n26Routes from './modules/n26/n26.routes.js'
import { parseN26Statement } from './modules/n26/n26.statement.parser.js'
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

  // Bank → parser registry. It is built HERE, the composition root, and injected
  // into the importer: this file is the only one in `src/` allowed to name a
  // bank, so adding a bank is adding one line here and the importer never
  // changes (see docs/architecture.md ADR-015 and src/architecture.test.ts).
  const parsers: BankParserRegistry = [
    { bank: 'bankinter', extensions: ['.xlsx'], parse: parseBankinterXlsx },
    { bank: 'myinvestor', extensions: ['.csv'], parse: parseMyinvestorStatement },
    { bank: 'n26', extensions: ['.csv'], parse: parseN26Statement },
  ]

  // Shared infrastructure. The error handler goes first so it covers every module.
  app.register(errorHandlerPlugin)
  app.register(prismaPlugin)
  app.register(drivePlugin)

  // Modules.
  app.register(healthRoutes)
  app.register(accountsRoutes, { prefix: '/api/accounts' })
  app.register(categoriesRoutes, { prefix: '/api/categories' })
  app.register(movementsRoutes, { prefix: '/api/movements' })
  app.register(ingestionRoutes, { prefix: '/api/ingestion' })
  app.register(importRoutes, { prefix: '/api/import', parsers })
  app.register(bankinterRoutes, { prefix: '/api/parser' })
  app.register(myinvestorRoutes, { prefix: '/api/parser' })
  app.register(n26Routes, { prefix: '/api/parser' })

  return app
}
