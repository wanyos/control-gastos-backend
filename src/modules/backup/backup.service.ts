// The two backup commands (feature 55): `pnpm run db:backup` and
// `pnpm run db:restore`. Nothing of the app imports this module; the scripts
// of `scripts/` are its only callers.
import { BackupError } from '../../errors/app-error.js'
import { downloadFileContent } from '../../lib/drive-structure.js'
import {
  assertDatabaseName,
  assertNotInternalDatabase,
  countRows,
  createDatabase,
  databaseExists,
  databaseTarget,
  dropDatabase,
  dumpDatabase,
  hasTables,
  renameDatabase,
  restoreDump,
} from './backup.database.js'
import { listBackupFiles, resolveBackupFolder, uploadBackup } from './backup.drive.js'
import type {
  BackupDeps,
  BackupFile,
  CreatedBackup,
  RestoredDatabase,
  TableRows,
} from './backup.types.js'

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/** `control-gastos-2026-03-14-090507.dump`, in the local time of the machine. */
export function backupFileName(now: Date): string {
  const date = `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `control-gastos-${date}-${time}.dump`
}

/** `20260314090507`, in the local time of the machine. */
export function timestampOf(now: Date): string {
  return (
    `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/** Folder first: no dump is taken if there is nowhere to upload it. */
export async function createBackup(deps: BackupDeps): Promise<CreatedBackup> {
  const folder = await resolveBackupFolder(deps.drive, deps.folderId)
  const dump = await dumpDatabase(deps.run, databaseTarget(deps.databaseUrl))
  const file = await uploadBackup(deps.drive, folder.id, backupFileName(deps.now()), dump)
  return { fileName: file.name, sizeBytes: file.sizeBytes, folderName: folder.name }
}

/** The copies of the folder, newest first. It runs nothing in the container. */
export async function listBackups(deps: BackupDeps): Promise<BackupFile[]> {
  const folder = await resolveBackupFolder(deps.drive, deps.folderId)
  return listBackupFiles(deps.drive, folder.id)
}

async function findBackupFile(deps: BackupDeps, fileName: string): Promise<BackupFile> {
  const folder = await resolveBackupFolder(deps.drive, deps.folderId)
  const files = await listBackupFiles(deps.drive, folder.id)
  // The name the human typed never enters a Drive query: it is compared here.
  const matches = files.filter((file) => file.name === fileName)
  if (matches.length === 0) {
    throw new BackupError(
      `No hay ninguna copia con ese nombre en la carpeta «${folder.name}».\n${formatBackupList(files)}`,
    )
  }
  if (matches.length > 1) {
    throw new BackupError(
      `Hay ${matches.length} archivos con ese nombre en la carpeta «${folder.name}» y no se puede ` +
        'saber cuál restaurar. Renombra en Drive los que sobren y vuelve a lanzar el comando.',
    )
  }
  return matches[0]
}

/**
 * Restores always into a database with nothing to lose: one that does not
 * exist (created here, dropped if the restore fails), one without tables (one
 * transaction), or -- for one WITH tables, after its name is typed -- a new one
 * that only takes the target's name once the restore has ended well.
 */
export async function restoreBackup(
  deps: BackupDeps,
  args: { fileName: string; database: string },
): Promise<RestoredDatabase> {
  const { database } = args
  assertNotInternalDatabase(database)
  assertDatabaseName(database)
  const file = await findBackupFile(deps, args.fileName)
  const { user } = databaseTarget(deps.databaseUrl)
  const target = { user, database }

  const exists = await databaseExists(deps.run, user, database)
  if (exists && (await hasTables(deps.run, target))) {
    return replaceDatabase(deps, user, database, file)
  }

  const dump = await downloadFileContent(deps.drive, file.id)
  if (!exists) await createDatabase(deps.run, user, database)
  try {
    await restoreDump(deps.run, target, dump)
  } catch (error) {
    if (!exists) throw await afterDropping(deps, user, database, error)
    throw error
  }
  return { database, tables: await countRows(deps.run, target), previousDatabase: null }
}

/**
 * Drops a database THIS run created and hands back the error that caused it,
 * saying so if the drop itself failed and the database is still there.
 */
async function afterDropping(
  deps: BackupDeps,
  user: string,
  createdHere: string,
  cause: unknown,
): Promise<unknown> {
  try {
    await dropDatabase(deps.run, user, createdHere)
    return cause
  } catch {
    const reason = cause instanceof Error ? cause.message : 'La restauración ha fallado.'
    return new BackupError(
      `${reason}
Además, no se ha podido borrar la base «${createdHere}», que creó este comando: bórrala a mano.`,
    )
  }
}

async function replaceDatabase(
  deps: BackupDeps,
  user: string,
  database: string,
  file: BackupFile,
): Promise<RestoredDatabase> {
  const stamp = timestampOf(deps.now())
  const restoredAs = `${database}_restore_${stamp}`
  const keptAs = `${database}_before_restore_${stamp}`

  const typed = await deps.confirm(database, keptAs)
  if (typed !== database) {
    throw new BackupError(
      typed === null
        ? `La base «${database}» ya tiene tablas y sustituirla hay que confirmarlo escribiendo su nombre ` +
            'en un terminal. Este comando no se ha lanzado desde un terminal, así que no pregunta: ' +
            'no se ha tocado nada.'
        : `Lo que has escrito no es el nombre de la base «${database}»: no se ha tocado nada.`,
    )
  }

  const dump = await downloadFileContent(deps.drive, file.id)
  await createDatabase(deps.run, user, restoredAs)
  try {
    await restoreDump(deps.run, { user, database: restoredAs }, dump)
    await renameDatabase(deps.run, user, database, keptAs)
  } catch (error) {
    throw await afterDropping(deps, user, restoredAs, error)
  }
  try {
    await renameDatabase(deps.run, user, restoredAs, database)
  } catch (error) {
    try {
      await renameDatabase(deps.run, user, keptAs, database)
    } catch {
      throw new BackupError(
        `La restauración se ha quedado a medias: la base «${database}» se llama ahora «${keptAs}» y no se ` +
          `ha podido devolverle su nombre, y la copia está restaurada en «${restoredAs}». No se ha borrado nada.`,
      )
    }
    throw await afterDropping(deps, user, restoredAs, error)
  }
  return {
    database,
    tables: await countRows(deps.run, { user, database }),
    previousDatabase: keptAs,
  }
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** «1,2 MB (1 234 567 bytes)». */
export function formatBytes(bytes: number): string {
  const exact = `${groupThousands(bytes)} bytes`
  if (bytes < 1024) return exact
  const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, 'kB'] : [bytes / (1024 * 1024), 'MB']
  return `${value.toFixed(1).replace('.', ',')} ${unit} (${exact})`
}

export function formatCreatedBackup(created: CreatedBackup): string {
  return [
    'Copia hecha y guardada en Drive.',
    `  Archivo: ${created.fileName}`,
    `  Tamaño guardado en Drive: ${formatBytes(created.sizeBytes)}`,
    `  Carpeta: ${created.folderName}`,
  ].join('\n')
}

function formatUploadTime(createdTime: string): string {
  const date = new Date(createdTime)
  if (Number.isNaN(date.getTime())) return 'fecha desconocida'
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

export function formatBackupList(files: BackupFile[]): string {
  if (files.length === 0) return 'La carpeta de copias no tiene ningún archivo.'
  return [
    'Copias que hay en la carpeta, de la más reciente a la más antigua:',
    ...files.map(
      (file) =>
        `  ${file.name}  ${formatBytes(file.sizeBytes)}  subida el ${formatUploadTime(file.createdTime)}`,
    ),
  ].join('\n')
}

function formatTableRows(tables: TableRows[]): string[] {
  if (tables.length === 0) return ['  (ninguna tabla)']
  return tables.map(({ table, rows }) => `  ${table}: ${rows}`)
}

export function formatRestoredDatabase(restored: RestoredDatabase): string {
  return [
    `Copia restaurada en la base «${restored.database}».`,
    'Filas de cada tabla:',
    ...formatTableRows(restored.tables),
    ...(restored.previousDatabase === null
      ? []
      : [
          `Lo que había antes en «${restored.database}» se conserva entero en la base «${restored.previousDatabase}».`,
        ]),
  ].join('\n')
}
