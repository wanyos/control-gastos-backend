import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type AppConfig } from './config/env.js'
import accountsRoutes from './modules/accounts/accounts.routes.js'
import { parseBankinterXlsx } from './modules/bankinter/bankinter.parser.js'
import categoriesRoutes from './modules/categories/categories.routes.js'
import categoryRulesRoutes from './modules/category-rules/category-rules.routes.js'
import healthRoutes from './modules/health/health.routes.js'
import importRoutes from './modules/import/import.routes.js'
import type { BankParserRegistry } from './modules/import/import.types.js'
import investmentsRoutes from './modules/investments/investments.routes.js'
import type {
  DepositMaturityMatcherRegistry,
  ProductParserRegistry,
} from './modules/investments/investments.types.js'
import ingestionRoutes from './modules/ingestion/ingestion.routes.js'
import movementsRoutes from './modules/movements/movements.routes.js'
import { isMyinvestorDepositMaturity } from './modules/myinvestor/myinvestor.deposit-maturity.js'
import netWorthRoutes from './modules/net-worth/net-worth.routes.js'
import { parseMyinvestorProductFile } from './modules/myinvestor/myinvestor.service.js'
import { parseMyinvestorStatement } from './modules/myinvestor/myinvestor.statement.parser.js'
import { parseN26Statement } from './modules/n26/n26.statement.parser.js'
import overviewRoutes from './modules/overview/overview.routes.js'
import { parseOpenbankStatement } from './modules/openbank/openbank.statement.parser.js'
import { parseRevolutStatement } from './modules/revolut/revolut.statement.parser.js'
import { parseTradeRepublicProductFile } from './modules/trade-republic/trade-republic.service.js'
import transfersRoutes from './modules/transfers/transfers.routes.js'
import drivePlugin from './plugins/drive.js'
import errorHandlerPlugin from './plugins/error-handler.js'
import prismaPlugin from './plugins/prisma.js'

/**
 * Builds and configures the Fastify instance (plugins + modules) without
 * starting to listen. Keeping it separate from `server.ts` eases integration testing.
 */
/**
 * Bank → parser registry. It is built HERE, the composition root, and injected
 * into the importer: this file is the only one in `src/` allowed to name a
 * bank, so adding a bank is adding one line here and the importer never
 * changes (see docs/architecture.md ADR-015 and src/architecture.test.ts).
 *
 * Exported since feature 26 so a guardian can check the ONE invariant that
 * makes the two registries safe to consult in order: no bank declares the same
 * extension in both.
 */
export const bankParsers: BankParserRegistry = [
  { bank: 'bankinter', extensions: ['.xlsx'], parse: parseBankinterXlsx },
  { bank: 'myinvestor', extensions: ['.csv'], parse: parseMyinvestorStatement },
  { bank: 'n26', extensions: ['.csv'], parse: parseN26Statement },
  { bank: 'openbank', extensions: ['.xls'], parse: parseOpenbankStatement },
  { bank: 'revolut', extensions: ['.csv'], parse: parseRevolutStatement },
]

/**
 * Bank → PRODUCT parser registry (feature 26, ADR-026). The SECOND registry of
 * the importer: these files carry no movement, they carry the monthly photo of
 * an investment product the human writes by hand.
 *
 * Trade Republic is here and NOT in the registry above on purpose: it enters
 * the system without a parser of what the bank emits (ADR-024). Its `.pdf`
 * statement is still read by nobody.
 */
export const productParsers: ProductParserRegistry = [
  // MyInvestor is in BOTH registries (feature 29) and that is safe because the
  // two entries never claim the same extension: its statement is a `.csv` and
  // its products are `.json`. The guardian that checks it is
  // `never lets a bank declare the same extension in both registries`, in
  // `src/modules/import/import.routes.test.ts`.
  { bank: 'myinvestor', extensions: ['.json'], parse: parseMyinvestorProductFile },
  { bank: 'trade-republic', extensions: ['.json'], parse: parseTradeRepublicProductFile },
]

/**
 * Bank → deposit-maturity matcher registry (feature 50). The THIRD registry of
 * this composition root, twin of the two above: which statement description is
 * the maturity of a deposit is knowledge of each bank, and the investments
 * module that links it to the deposit's product file may not name a bank.
 */
export const depositMaturityMatchers: DepositMaturityMatcherRegistry = [
  { bank: 'myinvestor', isDepositMaturity: isMyinvestorDepositMaturity },
]

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
  app.register(categoryRulesRoutes, { prefix: '/api/category-rules' })
  app.register(movementsRoutes, { prefix: '/api/movements' })
  app.register(overviewRoutes, { prefix: '/api/overview' })
  app.register(netWorthRoutes, { prefix: '/api/net-worth' })
  app.register(investmentsRoutes, { prefix: '/api/investments', depositMaturityMatchers })
  app.register(ingestionRoutes, { prefix: '/api/ingestion' })
  app.register(transfersRoutes, { prefix: '/api/transfers' })
  app.register(importRoutes, { prefix: '/api/import', parsers: bankParsers, productParsers })

  return app
}
