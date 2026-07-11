// Load .env environment variables BEFORE any other module that depends on
// them (e.g. the Prisma connection).
import 'dotenv/config'

import { buildApp } from './app.js'
import { loadConfig, type AppConfig } from './config/env.js'

let config: AppConfig
try {
  config = loadConfig()
} catch (error) {
  // Conscious exception to "no console for errors": the Fastify logger does
  // not exist yet — its level depends precisely on this config.
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const app = buildApp(config)

// Graceful shutdown: close the server and the Prisma connection.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal} signal, shutting down server...`)
    await app.close()
    process.exit(0)
  })
}

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

start()
