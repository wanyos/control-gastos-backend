import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client.js'

/**
 * Creates a PrismaClient instance using the PostgreSQL driver adapter.
 *
 * In Prisma 7 the database connection is established at runtime through a
 * "driver adapter" (here `@prisma/adapter-pg`) instead of reading the URL from
 * the schema. The connection string comes from the validated app config
 * (see `src/config/env.ts`), never read from the environment here.
 */
export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl })
  return new PrismaClient({ adapter })
}

/** Type of the instance returned by `createPrismaClient`. */
export type AppPrismaClient = ReturnType<typeof createPrismaClient>
