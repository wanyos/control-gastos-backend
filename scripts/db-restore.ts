// CLI wrapper of `listBackups` and `restoreBackup` (feature 55). Run with
//   pnpm run db:restore                      lists the copies of the Drive folder
//   pnpm run db:restore <archivo> <base>     restores that copy into that database
//
// Restoring over a database that already has tables asks for its name ON THE
// TERMINAL. There is no argument and no variable that answers for the human,
// and without a terminal it does not ask: it refuses.
//
// Console is fine here: this is a command-line script, not the Fastify app
// (same conscious exception as `scripts/parse-bank-file.ts`).
import '../src/lib/load-env-file.js'

import { loadConfig } from '../src/config/env.js'
import { AppError } from '../src/errors/app-error.js'
import { createDriveClient } from '../src/lib/drive.js'
import { askDatabaseName } from '../src/modules/backup/backup.confirm.js'
import { runInContainer } from '../src/modules/backup/backup.database.js'
import {
  formatBackupList,
  formatRestoredDatabase,
  listBackups,
  restoreBackup,
} from '../src/modules/backup/backup.service.js'

const usage = [
  'Uso:',
  '  pnpm run db:restore                     lista las copias que hay en la carpeta de Drive',
  '  pnpm run db:restore <archivo> <base>    restaura esa copia en esa base de datos',
].join('\n')

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.length !== 0 && args.length !== 2) {
    console.error(
      `Hacen falta dos argumentos: el nombre del archivo de la copia y la base de destino.\n${usage}`,
    )
    return 1
  }

  let config
  try {
    config = loadConfig()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'La configuración del .env no es válida.',
    )
    return 1
  }

  try {
    const deps = {
      drive: createDriveClient(config.drive),
      folderId: config.driveBackupFolderId,
      databaseUrl: config.databaseUrl,
      run: runInContainer,
      now: () => new Date(),
      confirm: (database: string, keptAs: string) =>
        askDatabaseName(process.stdin, process.stdout, database, keptAs),
    }
    if (args.length === 0) {
      console.log(`${formatBackupList(await listBackups(deps))}\n\n${usage}`)
      return 0
    }
    const [fileName, database] = args
    console.log(formatRestoredDatabase(await restoreBackup(deps, { fileName, database })))
    return 0
  } catch (error) {
    // Only our own messages are printed: a library error can carry a token.
    console.error(
      error instanceof AppError
        ? error.message
        : 'El comando ha fallado por un motivo no previsto.',
    )
    return 1
  }
}

process.exitCode = await main()
