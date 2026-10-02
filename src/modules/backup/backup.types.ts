import type { AppDriveClient } from '../../lib/drive.js'

export interface CommandResult {
  exitCode: number
  stdout: Buffer
  stderr: string
}

/** Runs `docker exec [-i] gastos-postgres <args>`; `input` goes to its stdin. */
export type ContainerCommand = (args: string[], input?: Buffer) => Promise<CommandResult>

export interface DatabaseTarget {
  user: string
  database: string
}

export interface BackupFolder {
  id: string
  name: string
}

export interface BackupFile {
  id: string
  name: string
  sizeBytes: number
  createdTime: string
}

export interface CreatedBackup {
  fileName: string
  sizeBytes: number
  folderName: string
}

export interface TableRows {
  table: string
  rows: number
}

export interface RestoredDatabase {
  database: string
  tables: TableRows[]
  /** Name the previous content was kept under, or null if there was none. */
  previousDatabase: string | null
}

export interface BackupDeps {
  drive: AppDriveClient
  folderId: string | undefined
  databaseUrl: string
  run: ContainerCommand
  now: () => Date
  /** Returns what the human typed, or null if it could not ask. */
  confirm: (database: string, keptAs: string) => Promise<string | null>
}
