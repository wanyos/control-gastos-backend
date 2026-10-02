// Drive is the in-memory double of `backup.fixture.ts`. PostgreSQL is the real
// one of the container, through the same `docker exec` the commands use: the
// source is this worker's throwaway database, and every target is a
// `gastos_test_backup_<worker>_<suffix>` database this file creates and drops.
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BackupError } from '../../errors/app-error.js'
import {
  assertTestDatabase,
  databaseNameOf,
  templateDatabaseName,
  truncateAll,
  withDatabase,
} from '../../lib/test-db.js'
import { runInContainer } from './backup.database.js'
import { backupDriveFixture, type BackupDriveFixture } from './backup.fixture.js'
import {
  backupFileName,
  createBackup,
  formatBackupList,
  formatBytes,
  formatCreatedBackup,
  formatRestoredDatabase,
  listBackups,
  restoreBackup,
  timestampOf,
} from './backup.service.js'
import type { BackupDeps, CommandResult, ContainerCommand, TableRows } from './backup.types.js'

const workerUrl = process.env.DATABASE_URL ?? ''
assertTestDatabase(workerUrl)
const adminUrl = withDatabase(workerUrl, 'postgres')
const worker = databaseNameOf(workerUrl).replace('gastos_test_', '')
const targetPrefix = `gastos_test_backup_${worker}_`

// 14 March 2026, 09:05:07 in the local time of whoever runs the suite.
const fixedNow = new Date(2026, 2, 14, 9, 5, 7)
const fixedFileName = 'control-gastos-2026-03-14-090507.dump'
const fixedStamp = '20260314090507'

const sourceCategories = ['Suministros de casa', 'Transporte urbano', 'Clases de piano']
const markerCategory = 'Farmacia de guardia'

async function query<Row extends Record<string, unknown>>(
  url: string,
  statement: string,
  values: unknown[] = [],
): Promise<Row[]> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return (await client.query<Row>(statement, values)).rows
  } finally {
    await client.end()
  }
}

const byTable = (a: TableRows, b: TableRows) => (a.table < b.table ? -1 : a.table > b.table ? 1 : 0)

/** Rows of every table of `public`, counted by the test on its own connection. */
async function tableCounts(database: string): Promise<TableRows[]> {
  const url = withDatabase(adminUrl, database)
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const tables = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    const counts: TableRows[] = []
    for (const { tablename } of tables.rows) {
      const counted = await client.query<{ rows: number }>(
        `select count(*)::int as rows from "${tablename}"`,
      )
      counts.push({ table: tablename, rows: counted.rows[0].rows })
    }
    return counts.sort(byTable)
  } finally {
    await client.end()
  }
}

async function categoryNames(database: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    withDatabase(adminUrl, database),
    `select name from "Category" order by name`,
  )
  return rows.map((row) => row.name)
}

/**
 * The databases of this file that exist right now, derived ones included. With
 * a suffix, only the ones of the test that uses it: the restore tests run at
 * the same time, each one on names of its own.
 */
async function targetDatabases(suffix = ''): Promise<string[]> {
  const rows = await query<{ datname: string }>(
    adminUrl,
    `select datname from pg_database where datname like $1 order by datname`,
    [`${`${targetPrefix}${suffix}`.replaceAll('_', '\\_')}%`],
  )
  return rows.map((row) => row.datname)
}

function targetName(suffix: string): string {
  const name = `${targetPrefix}${suffix}`
  assertTestDatabase(withDatabase(adminUrl, name))
  return name
}

async function createEmptyDatabase(name: string): Promise<void> {
  assertTestDatabase(withDatabase(adminUrl, name))
  await query(adminUrl, `create database "${name}"`)
}

/** A migrated database with one category of its own, to tell it from the source. */
async function createDatabaseWithTables(name: string): Promise<void> {
  assertTestDatabase(withDatabase(adminUrl, name))
  await query(adminUrl, `create database "${name}" template "${templateDatabaseName}"`)
  await query(
    withDatabase(adminUrl, name),
    `insert into "Category" (name, kind) values ($1, 'expense')`,
    [markerCategory],
  )
}

async function dropTargetDatabases(): Promise<void> {
  for (const name of await targetDatabases()) {
    assertTestDatabase(withDatabase(adminUrl, name))
    await query(
      adminUrl,
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [name],
    )
    await query(adminUrl, `drop database if exists "${name}"`)
  }
}

interface Harness {
  drive: BackupDriveFixture
  deps: BackupDeps
  /** Arguments of every command run in the container. */
  ran: string[][]
  /** What the confirmation was asked with. */
  asked: Array<[string, string]>
}

function harness(options: { run?: ContainerCommand; answer?: string | null } = {}): Harness {
  const drive = backupDriveFixture()
  const ran: string[][] = []
  const asked: Array<[string, string]> = []
  const run = options.run ?? runInContainer
  return {
    drive,
    ran,
    asked,
    deps: {
      drive: drive.client,
      folderId: drive.folderId,
      databaseUrl: workerUrl,
      run: (args, input) => {
        ran.push(args)
        return run(args, input)
      },
      now: () => fixedNow,
      confirm: async (database, keptAs) => {
        asked.push([database, keptAs])
        return options.answer ?? null
      },
    },
  }
}

/** A `pg_dump` that answers with the given bytes, without any container. */
function dumpAnswering(content: Buffer): ContainerCommand {
  return async (): Promise<CommandResult> => ({ exitCode: 0, stdout: content, stderr: '' })
}

async function rejection(action: Promise<unknown>): Promise<BackupError> {
  const error = await action.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BackupError)
  return error as BackupError
}

const inventedDump = Buffer.from('PGDMP bytes inventados para una subida de prueba, 61 en total..')

let sourceDump: Buffer
let sourceCounts: TableRows[]

describe('backup commands', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await dropTargetDatabases()
    for (const [index, name] of sourceCategories.entries()) {
      await query(workerUrl, `insert into "Category" (name, kind) values ($1, $2)`, [
        name,
        index === 2 ? 'income' : 'expense',
      ])
    }
    sourceCounts = await tableCounts(databaseNameOf(workerUrl))
    const { drive, deps } = harness()
    await createBackup(deps)
    sourceDump = drive.files[0].content
  }, 60_000)

  afterAll(async () => {
    await truncateAll(workerUrl)
    await dropTargetDatabases()
    expect(await targetDatabases()).toEqual([])
  })

  describe('createBackup', () => {
    it('uploads a new dump file named with the local date and time into the configured folder', async () => {
      const { drive, deps, ran } = harness()

      await createBackup(deps)

      expect(backupFileName(fixedNow)).toBe(fixedFileName)
      expect(drive.files).toHaveLength(1)
      expect(drive.files[0].name).toBe(fixedFileName)
      // A real archive of pg_dump's custom format, taken from the worker database.
      expect(drive.files[0].content.subarray(0, 5).toString('latin1')).toBe('PGDMP')
      expect(drive.files[0].content.length).toBeGreaterThan(1000)
      expect(ran).toHaveLength(1)
      expect(ran[0]).toContain('pg_dump')
      expect(ran[0].at(-1)).toBe(databaseNameOf(workerUrl))
      expect(drive.calls).toEqual(['get', 'create'])
    })

    it('reports the name and the size of the uploaded copy and the name of the folder', async () => {
      const { drive, deps } = harness({ run: dumpAnswering(inventedDump) })

      const created = await createBackup(deps)
      const printed = formatCreatedBackup(created)

      expect(created).toEqual({
        fileName: fixedFileName,
        sizeBytes: inventedDump.length,
        folderName: drive.folderName,
      })
      expect(printed).toContain(fixedFileName)
      expect(printed).toContain(`${inventedDump.length} bytes`)
      expect(printed).toContain(drive.folderName)
      expect(formatBytes(1_234_567)).toBe('1,2 MB (1 234 567 bytes)')
      expect(formatBytes(39_195)).toBe('38,3 kB (39 195 bytes)')
    })

    it('adds a second file on a second backup and leaves the first one as it was', async () => {
      const { drive, deps } = harness({ run: dumpAnswering(inventedDump) })
      const secondDump = Buffer.from('PGDMP otros bytes inventados, los de la segunda copia')

      await createBackup(deps)
      const first = { ...drive.files[0] }
      await createBackup({
        ...deps,
        run: dumpAnswering(secondDump),
        now: () => new Date(2026, 2, 14, 9, 6, 41),
      })

      expect(drive.files).toHaveLength(2)
      expect(drive.files[0]).toEqual(first)
      expect(drive.files[0].content.equals(inventedDump)).toBe(true)
      expect(drive.files[1].name).toBe('control-gastos-2026-03-14-090641.dump')
      expect(drive.files[1].content.equals(secondDump)).toBe(true)
      expect(drive.calls).toEqual(['get', 'create', 'get', 'create'])
    })

    it('fails without claiming a copy when the folder variable is missing', async () => {
      const { drive, deps, ran } = harness({ run: dumpAnswering(inventedDump) })

      const error = await rejection(createBackup({ ...deps, folderId: undefined }))

      expect(error.code).toBe('BACKUP_FAILED')
      expect(error.message).toContain('falta la variable GOOGLE_DRIVE_BACKUP_FOLDER_ID')
      expect(drive.calls).toEqual([])
      expect(drive.files).toEqual([])
      expect(ran).toEqual([])
    })

    it('fails without claiming a copy when the folder does not exist', async () => {
      const missing = harness({ run: dumpAnswering(inventedDump) })
      missing.drive.folder = 'missing'
      // What happens when the variable carries the NAME of the folder.
      const named = harness({ run: dumpAnswering(inventedDump) })

      const errors = [
        await rejection(createBackup(missing.deps)),
        await rejection(createBackup({ ...named.deps, folderId: named.drive.folderName })),
      ]

      for (const error of errors) {
        expect(error.message).toContain('no existe en Drive o esta cuenta no lo ve')
        expect(error.message).toContain('identificador de la carpeta o su dirección completa')
        expect(error.message).toContain('no su nombre')
      }
      for (const { drive, ran } of [missing, named]) {
        expect(drive.calls).toEqual(['get'])
        expect(drive.files).toEqual([])
        expect(ran).toEqual([])
      }
    })

    it('fails without claiming a copy when the id is not a folder or is in the bin', async () => {
      const notAFolder = harness({ run: dumpAnswering(inventedDump) })
      notAFolder.drive.folder = 'not-a-folder'
      const trashed = harness({ run: dumpAnswering(inventedDump) })
      trashed.drive.folder = 'trashed'

      const notAFolderError = await rejection(createBackup(notAFolder.deps))
      const trashedError = await rejection(createBackup(trashed.deps))

      expect(notAFolderError.message).toContain('no es una carpeta')
      expect(trashedError.message).toContain('está en la papelera')
      for (const { drive, ran } of [notAFolder, trashed]) {
        expect(drive.calls).toEqual(['get'])
        expect(drive.files).toEqual([])
        expect(ran).toEqual([])
      }
    })

    it('fails without claiming a copy when the dump fails', async () => {
      const { drive, deps } = harness({
        run: async () => ({
          exitCode: 1,
          stdout: Buffer.alloc(0),
          stderr:
            'pg_dump: error: connection to server failed: FATAL:  database "gastos_test_x" does not exist',
        }),
      })

      const error = await rejection(createBackup(deps))

      expect(error.message).toContain('No se ha podido obtener la copia')
      expect(error.message).not.toContain('FATAL')
      expect(drive.calls).toEqual(['get'])
      expect(drive.files).toEqual([])
    })

    it('fails without claiming a copy when the upload fails', async () => {
      const { drive, deps } = harness({ run: dumpAnswering(inventedDump) })
      drive.uploadFails = true

      const error = await rejection(createBackup(deps))

      expect(error.message).toContain('No se ha podido subir la copia a Drive')
      expect(error.message).toContain('No se ha guardado ninguna copia')
      expect(error.message).not.toContain('refused by the fixture')
      expect(drive.calls).toEqual(['get', 'create'])
      expect(drive.files).toEqual([])
    })

    it('fails when Drive stored a different size than the one sent', async () => {
      const { drive, deps } = harness({ run: dumpAnswering(inventedDump) })
      drive.storedSizeOffset = -7

      const error = await rejection(createBackup(deps))

      expect(error.message).toContain(`se enviaron ${inventedDump.length} bytes`)
      expect(error.message).toContain(`${inventedDump.length - 7}`)
    })
  })

  describe('listBackups', () => {
    it('lists the copies of the folder, newest first, without touching any database', async () => {
      const { drive, deps, ran } = harness()
      drive.addFile(
        'control-gastos-2026-02-03-211540.dump',
        Buffer.alloc(2048),
        '2026-02-03T20:15:44.000Z',
      )
      drive.addFile(
        'control-gastos-2026-03-09-073012.dump',
        Buffer.alloc(40_117),
        '2026-03-09T06:30:15.000Z',
      )
      drive.addFile(
        'control-gastos-2026-01-17-184502.dump',
        Buffer.alloc(911),
        '2026-01-17T17:45:06.000Z',
      )
      const before = await targetDatabases()

      const files = await listBackups(deps)
      const printed = formatBackupList(files)

      expect(files.map((file) => file.name)).toEqual([
        'control-gastos-2026-03-09-073012.dump',
        'control-gastos-2026-02-03-211540.dump',
        'control-gastos-2026-01-17-184502.dump',
      ])
      expect(files.map((file) => file.sizeBytes)).toEqual([40_117, 2048, 911])
      expect(files[0].createdTime).toBe('2026-03-09T06:30:15.000Z')
      expect(drive.listQueries[0].orderBy).toBe('createdTime desc')
      expect(printed.indexOf('2026-03-09-073012')).toBeLessThan(
        printed.indexOf('2026-02-03-211540'),
      )
      expect(printed.indexOf('2026-02-03-211540')).toBeLessThan(
        printed.indexOf('2026-01-17-184502'),
      )
      expect(printed).toContain('39,2 kB (40 117 bytes)')
      expect(printed).toContain('subida el 2026-')
      expect(ran).toEqual([])
      expect(drive.calls).toEqual(['get', 'list'])
      expect(await targetDatabases()).toEqual(before)
    })
  })

  // At the same time: the test of a database in use waits five seconds for
  // PostgreSQL to refuse the rename, and every test works on names of its own.
  describe.concurrent('restoreBackup', () => {
    it('restores a copy into an empty database with the same tables and the same row counts', async () => {
      const database = targetName('empty')
      await createEmptyDatabase(database)
      const { drive, deps, asked } = harness()
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')

      const restored = await restoreBackup(deps, { fileName: fixedFileName, database })

      expect(sourceCounts.find((entry) => entry.table === 'Category')?.rows).toBe(3)
      expect(
        sourceCounts.find((entry) => entry.table === '_prisma_migrations')?.rows,
      ).toBeGreaterThan(0)
      expect(await tableCounts(database)).toEqual(sourceCounts)
      expect([...restored.tables].sort(byTable)).toEqual(sourceCounts)
      expect(await categoryNames(database)).toEqual([...sourceCategories].sort())
      expect(restored.previousDatabase).toBeNull()
      expect(asked).toEqual([])
      expect(await targetDatabases('empty')).toEqual([database])
    })

    it('creates the target database when it does not exist', async () => {
      const database = targetName('fresh')
      const { drive, deps, asked } = harness()
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')

      const restored = await restoreBackup(deps, { fileName: fixedFileName, database })

      expect(await targetDatabases('fresh')).toEqual([database])
      expect(await tableCounts(database)).toEqual(sourceCounts)
      expect(restored).toMatchObject({ database, previousDatabase: null })
      expect(asked).toEqual([])
    })

    it('reports the target database and the rows of each table', async () => {
      const database = targetName('report')
      const { drive, deps } = harness()
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')

      const printed = formatRestoredDatabase(
        await restoreBackup(deps, { fileName: fixedFileName, database }),
      )

      expect(printed).toContain(`«${database}»`)
      for (const { table, rows } of sourceCounts) {
        expect(printed.split('\n')).toContain(`  ${table}: ${rows}`)
      }
      expect(printed.split('\n').filter((line) => /^ {2}\S+: \d+$/.test(line))).toHaveLength(
        sourceCounts.length,
      )
      expect(printed).not.toContain('se conserva')
    })

    it('leaves a database that has tables untouched unless its name is typed', async () => {
      const database = targetName('kept')
      await createDatabaseWithTables(database)
      const countsBefore = await tableCounts(database)

      for (const answer of [null, '', 'gastos', `${database} `, database.toUpperCase()]) {
        const { drive, deps, asked } = harness({ answer })
        drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')

        const error = await rejection(restoreBackup(deps, { fileName: fixedFileName, database }))

        expect(error.message).toContain('no se ha tocado nada')
        expect(asked).toEqual([[database, `${database}_before_restore_${fixedStamp}`]])
        // Nothing was even downloaded.
        expect(drive.downloads).toEqual([])
        expect(await targetDatabases('kept')).toEqual([database])
        expect(await tableCounts(database)).toEqual(countsBefore)
        expect(await categoryNames(database)).toEqual([markerCategory])
      }
    })

    it('keeps the previous database under another name when the overwrite is confirmed', async () => {
      const database = targetName('swap')
      await createDatabaseWithTables(database)
      const countsBefore = await tableCounts(database)
      const { drive, deps, asked } = harness({ answer: database })
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')
      const keptAs = `${database}_before_restore_${fixedStamp}`

      const restored = await restoreBackup(deps, { fileName: fixedFileName, database })

      expect(timestampOf(fixedNow)).toBe(fixedStamp)
      expect(restored.previousDatabase).toBe(keptAs)
      expect(asked).toEqual([[database, keptAs]])
      expect(await targetDatabases('swap')).toEqual([database, keptAs])
      // What was there is whole, under the other name.
      expect(await tableCounts(keptAs)).toEqual(countsBefore)
      expect(await categoryNames(keptAs)).toEqual([markerCategory])
      // And the copy took the name of the target.
      expect(await tableCounts(database)).toEqual(sourceCounts)
      expect(await categoryNames(database)).toEqual([...sourceCategories].sort())
      expect(formatRestoredDatabase(restored)).toContain(`«${keptAs}»`)
    })

    it('leaves every database as it was when the copy name matches no file', async () => {
      const database = targetName('nofile')
      const { drive, deps, ran } = harness({ answer: database })
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')
      drive.addFile('control-gastos-2026-02-03-211540.dump', sourceDump, '2026-02-03T20:15:44.000Z')
      drive.addFile('control-gastos-2026-02-03-211540.dump', sourceDump, '2026-02-03T20:15:51.000Z')

      const none = await rejection(
        restoreBackup(deps, { fileName: 'control-gastos-2026-01-01-000000.dump', database }),
      )
      const two = await rejection(
        restoreBackup(deps, { fileName: 'control-gastos-2026-02-03-211540.dump', database }),
      )

      expect(none.message).toContain('No hay ninguna copia con ese nombre')
      // It lists the ones there are.
      expect(none.message).toContain(fixedFileName)
      expect(two.message).toContain('Hay 2 archivos con ese nombre')
      expect(ran).toEqual([])
      expect(drive.downloads).toEqual([])
      expect(await targetDatabases('nofile')).toEqual([])
    })

    it('leaves every database as it was when the file is not a valid copy', async () => {
      const fresh = targetName('badnew')
      const existing = targetName('badold')
      await createDatabaseWithTables(existing)
      const countsBefore = await tableCounts(existing)
      const notADump = Buffer.from('esto es un texto cualquiera, no una copia de la base')

      const intoFresh = harness()
      intoFresh.drive.addFile(fixedFileName, notADump, '2026-03-14T08:05:09.000Z')
      const freshError = await rejection(
        restoreBackup(intoFresh.deps, { fileName: fixedFileName, database: fresh }),
      )
      const intoExisting = harness({ answer: existing })
      intoExisting.drive.addFile(fixedFileName, notADump, '2026-03-14T08:05:09.000Z')
      const existingError = await rejection(
        restoreBackup(intoExisting.deps, { fileName: fixedFileName, database: existing }),
      )

      expect(freshError.message).toContain('no es una copia válida')
      expect(existingError.message).toContain('no es una copia válida')
      // The database created for the restore is gone, and the other is intact.
      expect(await targetDatabases('bad')).toEqual([existing])
      expect(await tableCounts(existing)).toEqual(countsBefore)
      expect(await categoryNames(existing)).toEqual([markerCategory])
    })

    it('leaves every database as it was when the target database is in use', async () => {
      const database = targetName('busy')
      await createDatabaseWithTables(database)
      const countsBefore = await tableCounts(database)
      const { drive, deps } = harness({ answer: database })
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')
      const session = new Client({ connectionString: withDatabase(adminUrl, database) })
      await session.connect()

      let error: BackupError
      try {
        error = await rejection(restoreBackup(deps, { fileName: fixedFileName, database }))
      } finally {
        await session.end()
      }

      expect(error.message).toContain('la base de datos está en uso')
      expect(error.message).toContain('pnpm run dev')
      expect(await targetDatabases('busy')).toEqual([database])
      expect(await tableCounts(database)).toEqual(countsBefore)
      expect(await categoryNames(database)).toEqual([markerCategory])
    })

    it('rejects a target database name that is not valid', async () => {
      const { drive, deps, ran } = harness({ answer: 'gastos' })
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')

      for (const database of [
        '',
        'Gastos_Test_Backup',
        'gastos-test-backup',
        '9gastos',
        `${targetPrefix}${'x'.repeat(30)}`,
        `${targetPrefix}a"; drop database "gastos_test_template`,
      ]) {
        const error = await rejection(restoreBackup(deps, { fileName: fixedFileName, database }))

        expect(error.message).toContain('El nombre de la base de datos no es válido')
      }
      expect(ran).toEqual([])
      expect(drive.calls).toEqual([])
    })

    it('rejects the internal databases of PostgreSQL as target before doing anything', async () => {
      // A command that reaches no container: this test can never restore into them.
      const { drive, deps, ran, asked } = harness({
        answer: 'postgres',
        run: async () => ({ exitCode: 1, stdout: Buffer.alloc(0), stderr: '' }),
      })
      drive.addFile(fixedFileName, sourceDump, '2026-03-14T08:05:09.000Z')

      for (const database of ['postgres', 'template0', 'template1']) {
        const error = await rejection(restoreBackup(deps, { fileName: fixedFileName, database }))

        expect(error.code).toBe('BACKUP_FAILED')
        expect(error.message).toBe(
          `La base «${database}» es interna de PostgreSQL y no se puede usar como destino de una ` +
            'restauración: elige otro nombre. No se ha tocado nada.',
        )
      }
      // With an uppercase letter it is the rule of valid names that refuses it.
      for (const database of ['Postgres', 'TEMPLATE1']) {
        const error = await rejection(restoreBackup(deps, { fileName: fixedFileName, database }))

        expect(error.message).toContain('El nombre de la base de datos no es válido')
      }
      expect(ran).toEqual([])
      expect(drive.calls).toEqual([])
      expect(drive.downloads).toEqual([])
      expect(asked).toEqual([])
    })

    it('calls nothing of Drive that deletes, moves or renames a file', async () => {
      const database = targetName('calls')
      const { drive, deps } = harness()
      const older = drive.addFile(
        'control-gastos-2026-02-03-211540.dump',
        Buffer.from('PGDMP una copia anterior inventada'),
        '2026-02-03T20:15:44.000Z',
      )
      const olderBefore = { ...older }

      await createBackup(deps)
      await listBackups(deps)
      await restoreBackup(deps, { fileName: fixedFileName, database })

      expect(drive.calls.length).toBeGreaterThan(0)
      expect([...new Set(drive.calls)].sort()).toEqual(['create', 'get', 'list'])
      for (const forbidden of ['update', 'delete', 'copy', 'emptyTrash']) {
        expect(drive.calls).not.toContain(forbidden)
      }
      expect(drive.files).toHaveLength(2)
      expect(drive.files[0]).toEqual(olderBefore)
      expect(await tableCounts(database)).toEqual(sourceCounts)
    })
  })
})
