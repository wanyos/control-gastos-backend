import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Prisma 7 does not autoload .env; tests need DATABASE_URL just like
    // src/server.ts does (it imports 'dotenv/config' before building the app).
    setupFiles: ['dotenv/config'],
    // Keep test output clean; dotenv does not override already-set vars.
    env: { LOG_LEVEL: 'silent' },
  },
})
