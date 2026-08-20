// Test-only database plumbing (feature 27, ADR-027).
//
// The suite keeps testing against a REAL PostgreSQL -- nothing here replaces a
// database with a simulation. What it replaces is WHICH database: every test
// worker gets its own throwaway database (`gastos_test_<poolId>`), cloned from
// a migrated template, so the human's `gastos` is never opened for writing by a
// test.
//
// Three rules this file exists to enforce, in order of importance:
//   1. Nothing here can write to a database whose name is not a test one
//      (`assertTestDatabase`). A typo in a URL cannot delete his data.
//   2. A test that leaves a row behind is found by the suite, not months later
//      (`findLeftoverRows`, run after every test file).
//   3. If his database changes at all while the suite runs -- even an insert
//      that is deleted again -- the run goes red (`snapshotDatabase` +
//      `describeSnapshotDifferences`, taken before and after the whole suite).
//
// It reads NO environment variable on purpose: `src/config/env.ts` is the only
// file in `src/` allowed to (guarded by src/architecture.test.ts). Everything
// it needs arrives as an argument from the vitest glue at the repo root.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

/** Every throwaway database of the suite starts with this. */
export const testDatabasePrefix = 'gastos_test_'

/** The migrated database every worker database is cloned from. */
export const templateDatabaseName = 'gastos_test_template'

/** Maintenance database used to CREATE/DROP the others. */
const maintenanceDatabaseName = 'postgres'

/** Prisma's own bookkeeping table: it is not application data. */
const prismaMigrationsTable = '_prisma_migrations'

/**
 * How many worker databases the suite prepares. Pinned (and mirrored by
 * `maxWorkers` in vitest.config.ts) because the two numbers must agree: the
 * setup file picks its database by `VITEST_POOL_ID`, so a pool id above the
 * number of prepared databases would have nowhere to write.
 */
export function testWorkerCount(availableParallelism: number): number {
  return Math.max(1, Math.min(availableParallelism - 1, 8))
}

/** `gastos_test_3` for pool id 3. */
export function workerDatabaseName(poolId: number, workerCount: number): string {
  const bounded = Number.isFinite(poolId) && poolId >= 1 ? Math.trunc(poolId) : 1
  return `${testDatabasePrefix}${((bounded - 1) % workerCount) + 1}`
}

/** Same server, same credentials, another database. */
export function withDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${databaseName}`
  return parsed.toString()
}

/** The database name a connection string points at. */
export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

/**
 * The wall between the suite and his data. Every function of this file that
 * writes calls it first, so no combination of a wrong `.env`, a wrong argument
 * or a copied line can make a test truncate `gastos`.
 */
export function assertTestDatabase(url: string): void {
  const name = databaseNameOf(url)
  if (!name.startsWith(testDatabasePrefix)) {
    throw new Error(
      `Se ha intentado escribir en la base de datos «${name}», que no es una base de pruebas. ` +
        `Solo se escribe en bases que empiezan por «${testDatabasePrefix}» (ver ADR-027).`,
    )
  }
}

async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

/** Application tables of the public schema, alphabetically. */
async function applicationTables(client: Client): Promise<string[]> {
  const result = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename <> $1 order by tablename`,
    [prismaMigrationsTable],
  )
  return result.rows.map((row) => row.tablename)
}

export interface TableRowCount {
  table: string
  rows: number
}

/**
 * Row count of every application table in ONE round trip. It runs after every
 * test file, so six separate `count(*)` queries were six network waits per
 * file; this is one.
 */
async function countRows(client: Client): Promise<TableRowCount[]> {
  const tables = await applicationTables(client)
  if (tables.length === 0) return []
  const union = tables
    .map((table) => `select '${table}' as "table", count(*)::int as rows from "${table}"`)
    .join(' union all ')
  const result = await client.query<TableRowCount>(`${union} order by 1`)
  return result.rows
}

/**
 * Rows left in a test database. Empty array means the file cleaned up after
 * itself; anything else is what the suite reports as a leftover.
 */
export async function findLeftoverRows(url: string): Promise<TableRowCount[]> {
  assertTestDatabase(url)
  return withClient(url, async (client) => (await countRows(client)).filter(({ rows }) => rows > 0))
}

/** Human-readable one-liner of what a file (or the suite) left behind. */
export function describeLeftoverRows(leftovers: TableRowCount[]): string {
  return leftovers.map(({ table, rows }) => `${table}: ${rows}`).join(', ')
}

/** Empties a test database, keeping its schema and its migration history. */
export async function truncateAll(url: string): Promise<void> {
  assertTestDatabase(url)
  await withClient(url, async (client) => {
    const tables = await applicationTables(client)
    if (tables.length === 0) return
    const quoted = tables.map((table) => `"${table}"`).join(', ')
    await client.query(`truncate table ${quoted} restart identity cascade`)
  })
}

export interface DatabaseSnapshot {
  /** Table name → row count. */
  tables: Record<string, number>
  /**
   * Sequence name → last value handed out. It is here because a row count is
   * not enough: a test that inserts and then deletes leaves the counts intact
   * but MOVES the sequence forward, and «no toques mi base» means not even
   * that.
   */
  sequences: Record<string, string>
}

/** Read-only photo of a database. Never writes, not even to his. */
export async function snapshotDatabase(url: string): Promise<DatabaseSnapshot> {
  return withClient(url, async (client) => {
    const tables: Record<string, number> = {}
    for (const { table, rows } of await countRows(client)) {
      tables[table] = rows
    }

    const sequences: Record<string, string> = {}
    const found = await client.query<{ sequencename: string; last_value: string | null }>(
      `select sequencename, last_value from pg_sequences where schemaname = 'public' order by sequencename`,
    )
    for (const row of found.rows) {
      sequences[row.sequencename] = row.last_value ?? 'sin usar'
    }

    return { tables, sequences }
  })
}

/**
 * What changed between two photos, said in the human's terms. An empty array
 * means the database is EXACTLY as it was.
 */
export function describeSnapshotDifferences(
  before: DatabaseSnapshot,
  after: DatabaseSnapshot,
): string[] {
  const differences: string[] = []

  const tableNames = [...new Set([...Object.keys(before.tables), ...Object.keys(after.tables)])]
  for (const table of tableNames.sort()) {
    const rowsBefore = before.tables[table]
    const rowsAfter = after.tables[table]
    if (rowsBefore === undefined) {
      differences.push(`la tabla ${table} no existía antes (ahora con ${rowsAfter} filas)`)
    } else if (rowsAfter === undefined) {
      differences.push(`la tabla ${table} ha desaparecido (tenía ${rowsBefore} filas)`)
    } else if (rowsBefore !== rowsAfter) {
      differences.push(`${table}: ${rowsBefore} filas antes, ${rowsAfter} después`)
    }
  }

  const sequenceNames = [
    ...new Set([...Object.keys(before.sequences), ...Object.keys(after.sequences)]),
  ]
  for (const sequence of sequenceNames.sort()) {
    const valueBefore = before.sequences[sequence]
    const valueAfter = after.sequences[sequence]
    if (valueBefore !== valueAfter) {
      differences.push(
        `${sequence}: el contador pasó de ${valueBefore ?? 'inexistente'} a ${valueAfter ?? 'inexistente'} ` +
          `(alguien insertó una fila, aunque la haya borrado después)`,
      )
    }
  }

  return differences
}

/** Migration folder names on disk, in the order Prisma applies them. */
export function localMigrations(migrationsDir = defaultMigrationsDir()): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function defaultMigrationsDir(): string {
  return fileURLToPath(new URL('../../prisma/migrations', import.meta.url))
}

function repoRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url))
}

/** Migrations a database says it has applied. Empty if it has no history yet. */
async function appliedMigrations(url: string): Promise<string[]> {
  return withClient(url, async (client) => {
    const exists = await client.query<{ exists: boolean }>(
      `select to_regclass($1) is not null as exists`,
      [`public.${prismaMigrationsTable}`],
    )
    if (!exists.rows[0]?.exists) return []
    const result = await client.query<{ migration_name: string }>(
      `select migration_name from "${prismaMigrationsTable}" where finished_at is not null and rolled_back_at is null order by migration_name`,
    )
    return result.rows.map((row) => row.migration_name)
  })
}

async function databaseExists(adminUrl: string, name: string): Promise<boolean> {
  return withClient(adminUrl, async (client) => {
    const result = await client.query(`select 1 from pg_database where datname = $1`, [name])
    return result.rowCount === 1
  })
}

async function dropAndClone(adminUrl: string, name: string): Promise<void> {
  assertTestDatabase(withDatabase(adminUrl, name))
  await withClient(adminUrl, async (client) => {
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [name],
    )
    await client.query(`drop database if exists "${name}"`)
    await client.query(`create database "${name}" template "${templateDatabaseName}"`)
  })
}

/**
 * Brings the template database up to date, running `prisma migrate deploy` ONLY
 * when its history does not match the migrations on disk. That check costs one
 * query; the deploy costs ~1.5s, so the normal run does not pay it.
 */
async function ensureTemplateDatabase(
  adminUrl: string,
  baseEnv: Record<string, string | undefined>,
): Promise<void> {
  if (!(await databaseExists(adminUrl, templateDatabaseName))) {
    await withClient(adminUrl, (client) =>
      client.query(`create database "${templateDatabaseName}"`),
    )
  }

  const templateUrl = withDatabase(adminUrl, templateDatabaseName)
  const expected = localMigrations()
  const applied = await appliedMigrations(templateUrl)
  if (expected.length === applied.length && expected.every((name, i) => name === applied[i])) return

  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)),
      'migrate',
      'deploy',
    ],
    {
      cwd: repoRoot(),
      env: { ...baseEnv, DATABASE_URL: templateUrl },
      stdio: 'pipe',
    },
  )
}

export interface PreparedTestDatabases {
  /** Connection string of each worker database, indexed by pool id − 1. */
  urls: string[]
  /** Worker databases that had to be re-cloned (missing, stale or dirty). */
  recreated: string[]
}

/**
 * Makes sure the template and the `workerCount` worker databases exist, are
 * migrated and are EMPTY before the suite starts. A database that is already
 * clean and up to date is left alone: cloning costs ~50ms, checking costs ~10ms.
 */
export async function prepareTestDatabases(
  realDatabaseUrl: string,
  workerCount: number,
  baseEnv: Record<string, string | undefined>,
): Promise<PreparedTestDatabases> {
  const adminUrl = withDatabase(realDatabaseUrl, maintenanceDatabaseName)
  await ensureTemplateDatabase(adminUrl, baseEnv)

  const expected = localMigrations()
  const urls: string[] = []
  const recreated: string[] = []

  for (let poolId = 1; poolId <= workerCount; poolId += 1) {
    const name = workerDatabaseName(poolId, workerCount)
    const url = withDatabase(adminUrl, name)
    urls.push(url)

    let reusable = await databaseExists(adminUrl, name)
    if (reusable) {
      const applied = await appliedMigrations(url)
      reusable = expected.length === applied.length && expected.every((m, i) => m === applied[i])
    }
    if (reusable) {
      reusable = (await findLeftoverRows(url)).length === 0
    }
    if (!reusable) {
      await dropAndClone(adminUrl, name)
      recreated.push(name)
    }
  }

  return { urls, recreated }
}
