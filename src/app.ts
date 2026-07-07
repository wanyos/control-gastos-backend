import Fastify, { type FastifyInstance } from 'fastify'
import prismaPlugin from './plugins/prisma.js'
import healthRoutes from './routes/health.js'
import gastosRoutes from './routes/gastos.js'

/**
 * Construye y configura la instancia de Fastify (plugins + rutas) sin ponerla
 * a escuchar. Separarlo de `server.ts` facilita las pruebas de integración.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  // Plugins (infraestructura compartida).
  app.register(prismaPlugin)

  // Rutas.
  app.register(healthRoutes)
  app.register(gastosRoutes, { prefix: '/api/gastos' })

  return app
}
