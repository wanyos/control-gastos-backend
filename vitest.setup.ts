// Runs in every worker, before every test file (feature 27, ADR-027).
//
// It does the two things that make «los tests no tocan tu base» true file by
// file:
//   1. Points DATABASE_URL at THIS worker's throwaway database, so `buildApp()`
//      -- which is how every database test gets its Prisma client -- can only
//      reach a `gastos_test_*`.
//   2. After the file ends, fails it if it left a single row behind, naming the
//      tables, and empties the database so the next file starts clean.
//
// Thin on purpose: the logic lives in `src/lib/test-db.ts`.
import { availableParallelism } from 'node:os'

import { afterAll } from 'vitest'

import {
  describeLeftoverRows,
  findLeftoverRows,
  testWorkerCount,
  truncateAll,
  withDatabase,
  workerDatabaseName,
} from './src/lib/test-db.js'

const realDatabaseUrl = process.env.DATABASE_URL
if (!realDatabaseUrl) {
  throw new Error(
    'Falta DATABASE_URL: la suite necesita saber en qué PostgreSQL están sus bases de prueba.',
  )
}

const workerCount = testWorkerCount(availableParallelism())
const poolId = Number(process.env.VITEST_POOL_ID ?? '1')
if (poolId > workerCount) {
  throw new Error(
    `Hay más workers (${poolId}) que bases de prueba preparadas (${workerCount}). ` +
      `No pases --maxWorkers a mano: el número lo fija vitest.config.ts para que cada worker tenga su base (ADR-027).`,
  )
}

const workerDatabaseUrl = withDatabase(realDatabaseUrl, workerDatabaseName(poolId, workerCount))
process.env.DATABASE_URL = workerDatabaseUrl

afterAll(async () => {
  const leftovers = await findLeftoverRows(workerDatabaseUrl)
  if (leftovers.length === 0) return

  // Emptied even though the file is about to fail: the next file in this worker
  // must not inherit the mess, or one careless test would redden ten innocent ones.
  await truncateAll(workerDatabaseUrl)
  throw new Error(
    `Este archivo de test ha dejado filas sin borrar (${describeLeftoverRows(leftovers)}). ` +
      `Un test limpia lo que crea: ver docs/conventions.md §Tests con base de datos.`,
  )
})
