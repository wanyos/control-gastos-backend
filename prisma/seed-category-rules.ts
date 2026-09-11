// Load .env BEFORE anything that depends on it, same as src/server.ts.
import 'dotenv/config'

import { createPrismaClient } from '../src/lib/prisma.js'
import { seedDefaultCategoryRules } from '../src/modules/category-rules/category-rules.seed.js'

/**
 * CLI wrapper of the starting categorization rules seeding (feature 43). Run
 * with `pnpm run seed:category-rules`, once, AFTER `pnpm run seed:categories`:
 * it creates the missing starting rules and never touches an existing row (a
 * second run creates 0). A rule pointing at a category that no longer exists
 * (renamed) is listed instead of seeded.
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
  const result = await seedDefaultCategoryRules(prisma)
  console.log(
    `Seeded starting category rules: created ${result.created}, skipped ${result.skipped}`,
  )
  if (result.missingCategories.length > 0) {
    console.log(
      `Rules NOT seeded because their category does not exist (renamed?): ` +
        result.missingCategories.join(', '),
    )
  }
} finally {
  await prisma.$disconnect()
}
