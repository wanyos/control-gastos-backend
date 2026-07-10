import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Prisma CLI configuration (migrate, studio, generate).
// In Prisma 7 the connection URL no longer lives in the schema: it is defined
// here for CLI tasks, and in the driver adapter for the runtime.
// The .env file is NOT loaded automatically; that's why we import 'dotenv/config'.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
