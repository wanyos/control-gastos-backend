import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { createPrismaClient, type AppPrismaClient } from '../lib/prisma.js'

// Extend the Fastify instance so `fastify.prisma` is typed across the whole
// project (routes, hooks, etc.).
declare module 'fastify' {
  interface FastifyInstance {
    prisma: AppPrismaClient
  }
}

/**
 * Fastify plugin that instantiates PrismaClient, exposes it as `fastify.prisma`
 * and closes the connection cleanly when the server shuts down.
 */
async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = createPrismaClient()

  await prisma.$connect()
  fastify.log.info('PostgreSQL connection established (Prisma)')

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })
}

// `fastify-plugin` prevents the plugin from being encapsulated, so that
// `fastify.prisma` is available in all registered routes.
export default fp(prismaPlugin, { name: 'prisma' })
