// CLI wrapper of `createBackup` (feature 55). Run with
//   pnpm run db:backup
// to take a copy of the whole database with the `pg_dump` of the PostgreSQL
// container and upload it, as a new file, to the Drive folder of
// GOOGLE_DRIVE_BACKUP_FOLDER_ID. It writes no file on this machine.
//
// Console is fine here: this is a command-line script, not the Fastify app
// (same conscious exception as `scripts/parse-bank-file.ts`).
import '../src/lib/load-env-file.js'

import { loadConfig } from '../src/config/env.js'
import { AppError } from '../src/errors/app-error.js'
import { createDriveClient } from '../src/lib/drive.js'
import { runInContainer } from '../src/modules/backup/backup.database.js'
import { createBackup, formatCreatedBackup } from '../src/modules/backup/backup.service.js'

async function main(): Promise<number> {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    const problem =
      error instanceof Error ? error.message : 'La configuración del .env no es válida.'
    console.error(`La copia NO está hecha.\n${problem}`)
    return 1
  }

  try {
    const created = await createBackup({
      drive: createDriveClient(config.drive),
      folderId: config.driveBackupFolderId,
      databaseUrl: config.databaseUrl,
      run: runInContainer,
      now: () => new Date(),
      confirm: async () => null,
    })
    console.log(formatCreatedBackup(created))
    return 0
  } catch (error) {
    // Only our own messages are printed: a library error can carry a token.
    console.error(
      error instanceof AppError
        ? `La copia NO está hecha.\n${error.message}`
        : 'La copia NO está hecha.\nEl comando ha fallado por un motivo no previsto.',
    )
    return 1
  }
}

process.exitCode = await main()
