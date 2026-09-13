// Runs ONCE per `pnpm test`, in the main process, before any test file
// (feature 27, ADR-027).
//
// Two jobs, and both are about the same promise: the suite does not touch the
// human's database.
//   - Before: prepare one empty, migrated throwaway database per test worker.
//   - After:  compare his database with the photo taken before, and put the run
//     in RED if a single row -- or even a single sequence -- moved.
//
// Since feature 33 it does the same with `var/`, the other thing of his the suite
// can reach: a photo before, a photo after, and RED if one file changed content
// or even just its modification time.
//
// HOW ALL THREE CHECKS FAIL THE RUN (rewritten 2026-08-26, review of feature 33):
// they do NOT throw. An exception thrown in this teardown is reported as `error
// during close` and `vitest run` still exits 0 -- measured end to end -- so
// `init.sh` printed «Todos los tests pasan» over a touched folder. Since the F27
// guardian had been failing the same way since the day it was written, the three
// problems are now COLLECTED and handed to `failRun`, which writes them to file
// descriptor 2 and sets the exit code. Collected, and not the first one only, so
// a change in his database no longer hides one in his `var/`.
//
// It is deliberately thin: the logic it calls lives in `src/lib/test-db.ts`,
// `src/lib/test-var.ts` and `src/lib/test-guard.ts`, type-checked by `tsc` and
// each with its own tests.
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
import { describeVarDifferences, snapshotVarDir } from './src/lib/test-var.js'

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
  // Read-only photo of HIS `var/` (feature 33): the downloads of his banks and
  // the dumps the parser writes over them, gitignored and with no copy anywhere.
  // Empty snapshot on a machine that has no `var/`, which is every machine but his.
  const varBefore = snapshotVarDir()

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

    // Its message carries no datum of his: the path and what moved, nothing else.
    const varDifferences = describeVarDifferences(varBefore, snapshotVarDir())
    if (varDifferences.length > 0) {
      problems.push(
        `LA SUITE HA TOCADO TU CARPETA var/. Ningún test escribe ahí: es lo único tuyo que no ` +
          `tiene copia en git. Diferencias:\n  - ${varDifferences.join('\n  - ')}\n` +
          `Casi siempre es un test que llama a buildApp() sin inyectarle sourceBaseDir/dumpBaseDir ` +
          `y acaba parseando tus archivos de verdad (feature 33). Si estabas importando algo a la vez, esa es la causa.`,
      )
    }

    // NOT a `throw`: see the header. This is what makes `vitest run` exit != 0.
    failRun(problems)
  }
}
