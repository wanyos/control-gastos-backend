// What the two backup commands run inside the PostgreSQL container (feature
// 55). Everything goes through `docker exec gastos-postgres <program>`: there
// is no `pg_dump` on the host, and the one of the container always matches the
// server. The dump travels through stdout / stdin as a Buffer: no file.
import { spawn } from 'node:child_process'

import { BackupError } from '../../errors/app-error.js'
import type { CommandResult, ContainerCommand, DatabaseTarget, TableRows } from './backup.types.js'

/** Same name as `container_name` in docker-compose.yml (a test compares them). */
export const postgresContainerName = 'gastos-postgres'

const maintenanceDatabase = 'postgres'
const internalDatabases = [maintenanceDatabase, 'template0', 'template1']
const databaseNameShape = /^[a-z][a-z0-9_]{0,29}$/
// What PostgreSQL itself allows (63), for the names this module derives.
const sqlSafeNameShape = /^[a-z][a-z0-9_]{0,62}$/
const dockerUnavailable = 'docker could not be started'

export const runInContainer: ContainerCommand = (args, input) =>
  new Promise<CommandResult>((resolve) => {
    const dockerArgs = ['exec', ...(input === undefined ? [] : ['-i']), postgresContainerName]
    const child = spawn('docker', [...dockerArgs, ...args], { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', () =>
      resolve({ exitCode: 127, stdout: Buffer.alloc(0), stderr: dockerUnavailable }),
    )
    child.on('close', (code) =>
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('latin1'),
      }),
    )
    // The program may exit before reading all of its input (a file that is not
    // a dump): the exit code already says so.
    child.stdin.on('error', () => undefined)
    child.stdin.end(input)
  })

/** User and database a connection string points at. */
export function databaseTarget(databaseUrl: string): DatabaseTarget {
  const url = new URL(databaseUrl)
  return {
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  }
}

/**
 * Database names are interpolated into SQL, so every one is checked here first.
 * 30 characters leave room for the longest suffix this module appends
 * (`_before_restore_<14 digits>`) within the 63 of PostgreSQL.
 */
export function assertDatabaseName(name: string): void {
  if (!databaseNameShape.test(name)) {
    throw new BackupError(
      'El nombre de la base de datos no es válido: tiene que empezar por una letra minúscula y ' +
        'llevar solo minúsculas, números y guiones bajos, 30 caracteres como mucho.',
    )
  }
}

/**
 * The databases PostgreSQL itself creates are never a restore target: they have
 * no tables, so a restore would go in unasked, and every database created
 * afterwards is cloned from `template1`. Compared as typed: a name with an
 * uppercase letter is already refused by `assertDatabaseName`.
 */
export function assertNotInternalDatabase(name: string): void {
  if (internalDatabases.includes(name)) {
    throw new BackupError(
      `La base «${name}» es interna de PostgreSQL y no se puede usar como destino de una ` +
        'restauración: elige otro nombre. No se ha tocado nada.',
    )
  }
}

/**
 * Every name that reaches a SQL statement goes through here, the derived ones
 * (`<base>_restore_<stamp>`, `<base>_before_restore_<stamp>`) included.
 */
function assertSqlSafeName(name: string): void {
  if (!sqlSafeNameShape.test(name)) {
    throw new BackupError('El nombre de la base de datos no es válido.')
  }
}

/**
 * Turns a failed command into a message. The raw text of the program is only
 * searched for known symptoms and never printed.
 */
function failure(step: string, result: CommandResult): BackupError {
  return new BackupError(`${step}: ${symptomOf(result)}`)
}

function symptomOf(result: CommandResult): string {
  const text = result.stderr
  if (text === dockerUnavailable) {
    return 'no se ha podido ejecutar `docker`. Comprueba que Docker está instalado y en marcha.'
  }
  if (text.includes('No such container') || text.includes('is not running')) {
    return `el contenedor ${postgresContainerName} no existe o está parado. Arráncalo con \`docker compose up -d\`.`
  }
  if (text.includes('is being accessed by other users')) {
    return 'la base de datos está en uso. Para `pnpm run dev` y cualquier otro programa conectado a ella, y vuelve a lanzar el comando.'
  }
  if (text.includes('does not appear to be a valid archive')) {
    return 'el archivo no es una copia válida de la base de datos.'
  }
  if (/database "[^"]*" already exists/.test(text)) {
    return 'ya existe una base de datos con ese nombre.'
  }
  if (/(database|role) "[^"]*" does not exist/.test(text)) {
    return 'la base de datos, o el usuario de la conexión, no existe en el contenedor.'
  }
  return `el programa del contenedor terminó con el código ${result.exitCode}.`
}

async function sql(
  run: ContainerCommand,
  target: DatabaseTarget,
  statement: string,
  step: string,
): Promise<string[]> {
  const result = await run([
    'psql',
    '-U',
    target.user,
    '-d',
    target.database,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    statement,
  ])
  if (result.exitCode !== 0) throw failure(step, result)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout)
  } catch {
    throw new BackupError(`${step}: la respuesta del contenedor no es texto UTF-8.`)
  }
  return text.split(/\r?\n/).filter((line) => line !== '')
}

/** The whole database in `pg_dump` custom format, read from stdout. */
export async function dumpDatabase(run: ContainerCommand, target: DatabaseTarget): Promise<Buffer> {
  const result = await run([
    'pg_dump',
    '-U',
    target.user,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    target.database,
  ])
  if (result.exitCode !== 0) {
    throw failure(`No se ha podido obtener la copia de la base «${target.database}»`, result)
  }
  if (result.stdout.length === 0) {
    throw new BackupError(
      `No se ha podido obtener la copia de la base «${target.database}»: pg_dump no devolvió nada.`,
    )
  }
  return result.stdout
}

/** All or nothing: one transaction, stopped at the first error. */
export async function restoreDump(
  run: ContainerCommand,
  target: DatabaseTarget,
  dump: Buffer,
): Promise<void> {
  const result = await run(
    [
      'pg_restore',
      '-U',
      target.user,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '--single-transaction',
      '-d',
      target.database,
    ],
    dump,
  )
  if (result.exitCode !== 0) {
    throw failure(`No se ha podido restaurar la copia en la base «${target.database}»`, result)
  }
}

export async function databaseExists(
  run: ContainerCommand,
  user: string,
  name: string,
): Promise<boolean> {
  assertSqlSafeName(name)
  const lines = await sql(
    run,
    { user, database: maintenanceDatabase },
    `select 1 from pg_database where datname = '${name}'`,
    `No se ha podido comprobar si existe la base «${name}»`,
  )
  return lines.length > 0
}

export async function hasTables(run: ContainerCommand, target: DatabaseTarget): Promise<boolean> {
  assertSqlSafeName(target.database)
  const lines = await sql(
    run,
    target,
    `select count(*) from pg_tables where schemaname = 'public'`,
    `No se han podido leer las tablas de la base «${target.database}»`,
  )
  return Number(lines[0]) > 0
}

export async function createDatabase(
  run: ContainerCommand,
  user: string,
  name: string,
): Promise<void> {
  assertSqlSafeName(name)
  await sql(
    run,
    { user, database: maintenanceDatabase },
    `create database "${name}"`,
    `No se ha podido crear la base «${name}»`,
  )
}

/** Only ever called on a database this same command created in this run. */
export async function dropDatabase(
  run: ContainerCommand,
  user: string,
  name: string,
): Promise<void> {
  assertSqlSafeName(name)
  await sql(
    run,
    { user, database: maintenanceDatabase },
    `drop database "${name}"`,
    `No se ha podido borrar la base «${name}»`,
  )
}

export async function renameDatabase(
  run: ContainerCommand,
  user: string,
  from: string,
  to: string,
): Promise<void> {
  assertSqlSafeName(from)
  assertSqlSafeName(to)
  await sql(
    run,
    { user, database: maintenanceDatabase },
    `alter database "${from}" rename to "${to}"`,
    `No se ha podido renombrar la base «${from}» a «${to}»`,
  )
}

/** Rows of EVERY table of `public`, `_prisma_migrations` included. */
export async function countRows(
  run: ContainerCommand,
  target: DatabaseTarget,
): Promise<TableRows[]> {
  assertSqlSafeName(target.database)
  const step = `No se han podido contar las filas de la base «${target.database}»`
  const tables = await sql(
    run,
    target,
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    step,
  )
  if (tables.length === 0) return []
  const union = tables
    .map((table) => {
      const literal = table.replaceAll("'", "''")
      const identifier = table.replaceAll('"', '""')
      return `select '${literal}', count(*) from "${identifier}"`
    })
    .join(' union all ')
  const lines = await sql(run, target, `${union} order by 1`, step)
  return lines.map((line) => {
    const separator = line.lastIndexOf('|')
    return { table: line.slice(0, separator), rows: Number(line.slice(separator + 1)) }
  })
}
