// Runs ONCE per `pnpm test`, in the main process, before any test file
// (feature 27, ADR-027).
//
// Two jobs, and both are about the same promise: the suite does not touch the
// human's database.
//   - Before: prepare one empty, migrated throwaway database per test worker.
//   - After:  compare his database with the photo taken before, and put the run
//     in RED if a single row -- or even a single sequence -- moved.
//
// It is deliberately thin: the logic it calls lives in `src/lib/test-db.ts`,
// which is type-checked by `tsc` and has its own tests.
import 'dotenv/config'
import { availableParallelism } from 'node:os'

import {
  describeLeftoverRows,
  describeSnapshotDifferences,
  findLeftoverRows,
  prepareTestDatabases,
  snapshotDatabase,
  testWorkerCount,
} from './src/lib/test-db.js'

export default async function setup() {
  const realDatabaseUrl = process.env.DATABASE_URL
  if (!realDatabaseUrl) {
    throw new Error(
      'Falta DATABASE_URL: la suite necesita saber en qué PostgreSQL crear sus bases de prueba.',
    )
  }

  const workerCount = testWorkerCount(availableParallelism())
  const { urls } = await prepareTestDatabases(realDatabaseUrl, workerCount, process.env)

  // Read-only photo of HIS database. Nothing else in the suite opens it.
  const before = await snapshotDatabase(realDatabaseUrl)

  return async () => {
    const after = await snapshotDatabase(realDatabaseUrl)
    const differences = describeSnapshotDifferences(before, after)
    if (differences.length > 0) {
      throw new Error(
        `TU BASE DE DATOS HA CAMBIADO DURANTE LA SUITE. Los tests deben escribir solo en ` +
          `sus bases desechables (ver ADR-027). Diferencias:\n  - ${differences.join('\n  - ')}\n` +
          `Si estabas importando algo a la vez, esa es la causa; si no, hay un test escribiendo ` +
          `en tu base y hay que arreglarlo antes de seguir.`,
      )
    }

    const dirty: string[] = []
    for (const url of urls) {
      const leftovers = await findLeftoverRows(url)
      if (leftovers.length > 0)
        dirty.push(`${url.split('/').pop()} → ${describeLeftoverRows(leftovers)}`)
    }
    if (dirty.length > 0) {
      throw new Error(
        `La suite ha dejado filas en sus bases de prueba:\n  - ${dirty.join('\n  - ')}\n` +
          `Cada test limpia lo que crea (docs/conventions.md §Tests con base de datos).`,
      )
    }
  }
}
