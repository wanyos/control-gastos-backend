// Runs ONCE per `pnpm test`, in the main process, before any test file
// (feature 27, ADR-027).
//
// Two jobs, and both are about the same promise: the suite does not touch the
// human's database.
//   - Before: prepare one empty, migrated throwaway database per test worker.
//   - After:  compare his database with the photo taken before, and put the run
//     in RED if a single row -- or even a single sequence -- moved.
//
// HOW THE TWO CHECKS FAIL THE RUN (rewritten 2026-08-26, review of feature 33):
// they do NOT throw. An exception thrown in this teardown is reported as `error
// during close` and `vitest run` still exits 0 -- measured end to end -- so
// `init.sh` printed «Todos los tests pasan» over a failed check. The problems
// are COLLECTED and handed to `failRun`, which writes them to file descriptor 2
// and sets the exit code. Collected, and not the first one only, so a change in
// his database no longer hides rows left in a throwaway one.
//
// Until feature 52 there was a third check, on a folder of his disk the project
// no longer uses: nothing of this suite reads, lists or compares his disk now.
//
// Since feature 51 it has a third job: it reads from HIS database, through a
// connection PostgreSQL opens READ-ONLY, the values of the columns the privacy
// guardian (`src/no-real-data.test.ts`) compares the repository against, and
// hands them to the test files with `provide`. They travel in memory: nothing
// is written to disk nor printed. This file stays the only place of the suite
// that opens his database.
//
// It is deliberately thin: the logic it calls lives in `src/lib/test-db.ts`,
// `src/lib/test-guard.ts` and `src/lib/test-real-data.ts`, type-checked by `tsc`
// and each with its own tests.
import './src/lib/load-env-file.js'
import { availableParallelism } from 'node:os'

import {
  describeLeftoverRows,
  describeSnapshotDifferences,
  findLeftoverRows,
  prepareTestDatabases,
  snapshotDatabase,
  testWorkerCount,
} from './src/lib/test-db.js'
import { failRun } from './src/lib/test-guard.js'
import { readRealDataReference } from './src/lib/test-real-data.js'
import type { RealDataReference } from './src/lib/test-real-data.js'

/** The one thing this file needs of vitest's `TestProject`. */
interface ProvidingProject {
  provide(key: 'realDataReference', value: RealDataReference): void
}

export default async function setup(project: ProvidingProject) {
  const realDatabaseUrl = process.env.DATABASE_URL
  if (!realDatabaseUrl) {
    throw new Error(
      'Falta DATABASE_URL: la suite necesita saber en qué PostgreSQL crear sus bases de prueba.',
    )
  }

  const workerCount = testWorkerCount(availableParallelism())
  const { urls } = await prepareTestDatabases(realDatabaseUrl, workerCount, process.env)

  // Read-only photo of HIS database. No test file opens it: only this one does.
  const before = await snapshotDatabase(realDatabaseUrl)
  // What the privacy guardian compares against (feature 51), read through a
  // read-only connection. An empty or table-less database gives empty lists.
  project.provide('realDataReference', await readRealDataReference(realDatabaseUrl))

  return async () => {
    // Every check runs, and every problem found is collected: the first one no
    // longer hides the rest.
    const problems: string[] = []

    const after = await snapshotDatabase(realDatabaseUrl)
    const differences = describeSnapshotDifferences(before, after)
    if (differences.length > 0) {
      problems.push(
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
      problems.push(
        `La suite ha dejado filas en sus bases de prueba:\n  - ${dirty.join('\n  - ')}\n` +
          `Cada test limpia lo que crea (docs/conventions.md §Tests con base de datos).`,
      )
    }

    // NOT a `throw`: see the header. This is what makes `vitest run` exit != 0.
    failRun(problems)
  }
}
