import { availableParallelism } from 'node:os'

import { defineConfig } from 'vitest/config'

import { testWorkerCount } from './src/lib/test-db.js'

export default defineConfig({
  test: {
    environment: 'node',
    // Prisma 7 does not autoload .env; tests need DATABASE_URL just like
    // src/server.ts does (its first import is src/lib/load-env-file.ts, which
    // calls Node's process.loadEnvFile() before the app is built).
    //
    // `vitest.setup.ts` comes after on purpose: it REWRITES the DATABASE_URL
    // loaded from .env just before, so the file can only reach this worker's
    // throwaway database, never the human's `gastos` (feature 27, ADR-027).
    setupFiles: ['./src/lib/load-env-file.ts', './vitest.setup.ts'],
    // Prepares those databases before the suite and, when it ends, checks his
    // database is EXACTLY as it was.
    globalSetup: ['./vitest.global-setup.ts'],
    // Pinned so it matches the number of databases the global setup prepares:
    // the setup file picks its own by VITEST_POOL_ID, and a pool id with no
    // database behind it has nowhere to write. Measured cost of capping at 8
    // instead of the default (11 here): ~0.2s on a ~6s suite.
    maxWorkers: testWorkerCount(availableParallelism()),
    // Keep test output clean and make the suite hermetic: these are set before
    // the `./src/lib/load-env-file.ts` setupFile runs, and process.loadEnvFile()
    // does not override already-set vars, so they win over the real .env. The
    // Drive placeholders let loadConfig() and buildApp() succeed without real credentials or
    // network (the Drive client is built lazily, see src/plugins/drive.ts).
    env: {
      LOG_LEVEL: 'silent',
      GOOGLE_DRIVE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_DRIVE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_DRIVE_REFRESH_TOKEN: 'test-refresh-token',
      GOOGLE_DRIVE_ROOT_FOLDER_ID: 'test-root-folder-id',
    },
  },
})
