// Tests of the plumbing that keeps the suite out of the human's database
// (feature 27, ADR-027).
//
// The point of this file is that the two guardians are DEMONSTRATED red, not
// asserted to exist: one test leaves a row on purpose and checks the leftover
// guardian reports it, another writes and deletes a row and checks the
// «tu base ha cambiado» guardian still sees it. Both clean up after themselves,
// so the very guardians they exercise stay green on this file.
import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'
import { syntheticIban } from './iban.fixture.js'
import {
  assertTestDatabase,
  databaseNameOf,
  describeLeftoverRows,
  describeSnapshotDifferences,
  findLeftoverRows,
  localMigrations,
  snapshotDatabase,
  testDatabasePrefix,
  testWorkerCount,
  truncateAll,
  withDatabase,
  workerDatabaseName,
} from './test-db.js'

/** The database THIS worker was pointed at by vitest.setup.ts. */
const workerDatabaseUrl = process.env.DATABASE_URL ?? ''

function syntheticAccount() {
  return {
    iban: syntheticIban(),
    bank: 'zz-test-db-guardian',
    alias: 'leftover on purpose',
  }
}

describe('the suite runs against a throwaway database, never the human one', () => {
  it('points DATABASE_URL at a gastos_test_* database', () => {
    expect(databaseNameOf(workerDatabaseUrl)).toMatch(new RegExp(`^${testDatabasePrefix}\\d+$`))
  })

  it('does not point at the database of .env (the human one)', () => {
    // `.env` is gitignored and may not exist on a fresh clone; without it there
    // is nothing to compare and the test above already carries the guarantee.
    let envFile: string
    try {
      envFile = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    } catch {
      return
    }

    const declared = envFile.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1]
    if (!declared) return

    expect(databaseNameOf(workerDatabaseUrl)).not.toBe(databaseNameOf(declared))
  })

  it('gives every worker its own database, so no two files share rows', () => {
    const workerCount = testWorkerCount(availableParallelism())
    const names = new Set(
      Array.from({ length: workerCount }, (_, i) => workerDatabaseName(i + 1, workerCount)),
    )

    expect(names.size).toBe(workerCount)
    expect(names.has(databaseNameOf(workerDatabaseUrl))).toBe(true)
  })

  it('refuses to write to a database that is not a test one', () => {
    const production = withDatabase(workerDatabaseUrl, 'gastos')

    expect(() => assertTestDatabase(production)).toThrow(/no es una base de pruebas/)
    expect(assertTestDatabase(workerDatabaseUrl)).toBeUndefined()
    // The two writers of the module go through that same door.
    return expect(truncateAll(production)).rejects.toThrow(/no es una base de pruebas/)
  })

  it('caps the worker count so there is always a prepared database behind a pool id', () => {
    expect(testWorkerCount(1)).toBe(1)
    expect(testWorkerCount(4)).toBe(3)
    expect(testWorkerCount(12)).toBe(8)
    expect(testWorkerCount(64)).toBe(8)
  })

  it('has the template of the throwaway databases at the migrations on disk', () => {
    // A migration added without re-cloning would leave the suite testing an old
    // schema; `prepareTestDatabases` compares exactly these two lists.
    expect(localMigrations().length).toBeGreaterThan(0)
    expect(localMigrations()).toEqual([...localMigrations()].sort())
  })
})

describe('the guardians are WIRED, not just written', () => {
  function repoFile(name: string): string {
    return readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')
  }

  it('runs vitest.setup.ts in every test file, after the .env is loaded', () => {
    const config = repoFile('vitest.config.ts')
    const setups = config.match(/setupFiles:\s*\[([^\]]+)\]/)?.[1] ?? ''
    const envLoader = "'./src/lib/load-env-file.ts'"

    expect(setups.indexOf(envLoader)).toBeGreaterThanOrEqual(0)
    expect(setups.indexOf("'./vitest.setup.ts'")).toBeGreaterThan(setups.indexOf(envLoader))
    expect(config).toContain("globalSetup: ['./vitest.global-setup.ts']")
  })

  it('keeps the leftover check as an afterAll of every file, and the redirection before it', () => {
    const setup = repoFile('vitest.setup.ts')

    expect(setup).toContain('process.env.DATABASE_URL = workerDatabaseUrl')
    expect(setup).toContain('afterAll(')
    expect(setup).toContain('findLeftoverRows(workerDatabaseUrl)')
    // Deleting the throw is what turns the guardian into a comment.
    expect(setup).toMatch(/throw new Error\(\s*\n?\s*`Este archivo de test ha dejado filas/)
  })

  it('keeps the before/after photo of the human database in the global setup', () => {
    const globalSetup = repoFile('vitest.global-setup.ts')

    expect(globalSetup).toContain('snapshotDatabase(realDatabaseUrl)')
    expect(globalSetup).toContain('describeSnapshotDifferences(before, after)')
    expect(globalSetup).toContain('TU BASE DE DATOS HA CAMBIADO DURANTE LA SUITE')
  })
})

describe('the leftover guardian goes RED with a row left behind', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports the table and the number of rows a test forgot', async () => {
    expect(await findLeftoverRows(workerDatabaseUrl)).toEqual([])

    // Left on purpose: this is the row the guardian has to see.
    const account = await app.prisma.account.create({ data: syntheticAccount() })

    const leftovers = await findLeftoverRows(workerDatabaseUrl)
    expect(leftovers).toEqual([{ table: 'Account', rows: 1 }])
    expect(describeLeftoverRows(leftovers)).toBe('Account: 1')

    await app.prisma.account.delete({ where: { id: account.id } })
    expect(await findLeftoverRows(workerDatabaseUrl)).toEqual([])
  })

  it('counts every application table, not a hand-written list', async () => {
    const account = await app.prisma.account.create({ data: syntheticAccount() })
    const movement = await app.prisma.movement.create({
      data: {
        type: 'expense',
        bookingDate: new Date('2026-07-01T00:00:00.000Z'),
        valueDate: new Date('2026-07-01T00:00:00.000Z'),
        amount: '12.34',
        description: 'ZZ leftover on purpose',
        accountId: account.id,
        daySequence: 1,
      },
    })

    expect(await findLeftoverRows(workerDatabaseUrl)).toEqual([
      { table: 'Account', rows: 1 },
      { table: 'Movement', rows: 1 },
    ])

    await app.prisma.movement.delete({ where: { id: movement.id } })
    await app.prisma.account.delete({ where: { id: account.id } })
    expect(await findLeftoverRows(workerDatabaseUrl)).toEqual([])
  })

  it('does not count Prisma bookkeeping as a leftover row', async () => {
    // `_prisma_migrations` always has rows; if it were counted the guardian
    // would be red on every single file and would be turned off within a day.
    expect(await findLeftoverRows(workerDatabaseUrl)).toEqual([])
  })
})

describe('the «tu base ha cambiado» guardian goes RED even if the row is deleted again', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sees nothing when nothing happens', async () => {
    const before = await snapshotDatabase(workerDatabaseUrl)
    const after = await snapshotDatabase(workerDatabaseUrl)

    expect(describeSnapshotDifferences(before, after)).toEqual([])
  })

  it('sees an insert that was cleaned up, through the sequence', async () => {
    const before = await snapshotDatabase(workerDatabaseUrl)

    const account = await app.prisma.account.create({ data: syntheticAccount() })
    await app.prisma.account.delete({ where: { id: account.id } })

    const after = await snapshotDatabase(workerDatabaseUrl)
    const differences = describeSnapshotDifferences(before, after)

    // Row counts match again -- this is exactly the case a count-only guardian
    // would miss, and the reason the snapshot carries the sequences too.
    expect(after.tables).toEqual(before.tables)
    expect(differences).toHaveLength(1)
    expect(differences[0]).toContain('Account_id_seq')
    expect(differences[0]).toContain('aunque la haya borrado después')
  })

  it('says which table grew and by how much', () => {
    const before = { tables: { Account: 4, Movement: 455 }, sequences: { Account_id_seq: '10' } }
    const after = { tables: { Account: 19, Movement: 460 }, sequences: { Account_id_seq: '10' } }

    expect(describeSnapshotDifferences(before, after)).toEqual([
      'Account: 4 filas antes, 19 después',
      'Movement: 455 filas antes, 460 después',
    ])
  })
})
