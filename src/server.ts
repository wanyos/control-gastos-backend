// Load .env environment variables BEFORE any other module that depends on
// them (e.g. the Prisma connection).
import 'dotenv/config'
import { buildApp } from './app.js'

const app = buildApp()

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

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
    await app.listen({ port, host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

start()
