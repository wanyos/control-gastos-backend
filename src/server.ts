// Carga las variables de entorno de .env ANTES que cualquier otro módulo
// que dependa de ellas (p. ej. la conexión de Prisma).
import 'dotenv/config'
import { buildApp } from './app.js'

const app = buildApp()

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

// Apagado ordenado: cierra el servidor y la conexión de Prisma.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`Recibida señal ${signal}, cerrando servidor...`)
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
