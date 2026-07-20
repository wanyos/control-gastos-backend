import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Prisma 7 does not autoload .env; tests need DATABASE_URL just like
    // src/server.ts does (it imports 'dotenv/config' before building the app).
    setupFiles: ['dotenv/config'],
    // Keep test output clean and make the suite hermetic: these are set before
    // the `dotenv/config` setupFile runs, and dotenv does not override
    // already-set vars, so they win over the real .env. The Drive placeholders
    // let loadConfig() and buildApp() succeed without real credentials or
    // network (the Drive client is built lazily, see src/plugins/drive.ts).
    env: {
      LOG_LEVEL: 'silent',
      GOOGLE_DRIVE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_DRIVE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_DRIVE_REFRESH_TOKEN: 'test-refresh-token',
    },
  },
})
