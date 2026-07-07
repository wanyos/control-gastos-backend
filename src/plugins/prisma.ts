import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { createPrismaClient, type AppPrismaClient } from '../lib/prisma.js'

// Extiende la instancia de Fastify para que `fastify.prisma` esté tipado
// en todo el proyecto (rutas, hooks, etc.).
declare module 'fastify' {
  interface FastifyInstance {
    prisma: AppPrismaClient
  }
}

/**
 * Plugin de Fastify que instancia PrismaClient, lo expone como `fastify.prisma`
 * y cierra la conexión de forma limpia cuando el servidor se apaga.
 */
async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = createPrismaClient()

  await prisma.$connect()
  fastify.log.info('Conexión a PostgreSQL establecida (Prisma)')

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })
}

// `fastify-plugin` evita que el plugin quede encapsulado, de modo que
// `fastify.prisma` esté disponible en todas las rutas registradas.
export default fp(prismaPlugin, { name: 'prisma' })
