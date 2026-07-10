import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

/**
 * Creates a PrismaClient instance using the PostgreSQL driver adapter.
 *
 * In Prisma 7 the database connection is established at runtime through a
 * "driver adapter" (here `@prisma/adapter-pg`) instead of reading the URL from
 * the schema. The connection string is taken from `process.env.DATABASE_URL`,
 * which must be loaded before calling this function (see `src/server.ts`,
 * which imports `dotenv/config`).
 */
export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not defined. Copy .env.example to .env and configure the PostgreSQL connection.',
    )
  }

  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

/** Type of the instance returned by `createPrismaClient`. */
export type AppPrismaClient = ReturnType<typeof createPrismaClient>
