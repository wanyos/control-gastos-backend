// Load .env BEFORE anything that depends on it, same as src/server.ts.
import 'dotenv/config'

import { createPrismaClient } from '../src/lib/prisma.js'
import { seedDefaultCategories } from '../src/modules/categories/categories.seed.js'

/**
 * CLI wrapper of the starting-categories seeding (feature 37). Run with
 * `pnpm run seed:categories`, once: it creates the missing starting categories
 * and never touches an existing row (a second run creates 0).
 *
 * Console is fine here: this is a command-line script, not the Fastify app —
 * there is no logger to use (same conscious exception as src/server.ts).
 */
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required (PostgreSQL connection string)')
  process.exit(1)
}

const prisma = createPrismaClient(databaseUrl)

try {
  const result = await seedDefaultCategories(prisma)
  console.log(`Seeded starting categories: created ${result.created}, skipped ${result.skipped}`)
} finally {
  await prisma.$disconnect()
}
