import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { BackupError } from '../../errors/app-error.js'
import {
  assertDatabaseName,
  assertNotInternalDatabase,
  databaseExists,
  databaseTarget,
  dumpDatabase,
  postgresContainerName,
  renameDatabase,
  restoreDump,
} from './backup.database.js'
import type { CommandResult, ContainerCommand } from './backup.types.js'

function failingWith(stderr: string): ContainerCommand {
  return async (): Promise<CommandResult> => ({ exitCode: 1, stdout: Buffer.alloc(0), stderr })
}

async function messageOf(action: Promise<unknown>): Promise<string> {
  const error = await action.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BackupError)
  return (error as BackupError).message
}

describe('backup database commands', () => {
  it('names the same container as docker-compose.yml', () => {
    const compose = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8')
    const declared = compose.match(/container_name:\s*(\S+)/)

    expect(declared?.[1]).toBe(postgresContainerName)
  })

  it('reads the user and the database of a connection string', () => {
    const target = databaseTarget(
      'postgresql://lectora:clave-de-prueba@localhost:5434/gastos_test_4?schema=public',
    )

    expect(target).toEqual({ user: 'lectora', database: 'gastos_test_4' })
  })

  it('accepts only lowercase names of 30 characters at most', () => {
    for (const valid of ['gastos', 'gastos_restore_check', 'g', `g${'0'.repeat(29)}`]) {
      expect(() => assertDatabaseName(valid)).not.toThrow()
    }
    for (const invalid of ['', 'Gastos', '1gastos', 'gastos-2', 'gastos 2', `g${'0'.repeat(30)}`]) {
      expect(() => assertDatabaseName(invalid)).toThrow(BackupError)
    }
    expect(() => assertDatabaseName('gastos"; drop database gastos; --')).toThrow(BackupError)
  })

  it('refuses the three databases PostgreSQL creates and no other name', () => {
    for (const internal of ['postgres', 'template0', 'template1']) {
      expect(() => assertNotInternalDatabase(internal)).toThrow(BackupError)
      expect(() => assertNotInternalDatabase(internal)).toThrow(
        `La base «${internal}» es interna de PostgreSQL`,
      )
    }
    for (const other of ['gastos', 'gastos_restore_check', 'postgres_copia', 'template2']) {
      expect(() => assertNotInternalDatabase(other)).not.toThrow()
    }
  })

  it('runs nothing in the container for a name that is not valid', async () => {
    const ran: string[][] = []
    const run: ContainerCommand = async (args) => {
      ran.push(args)
      return { exitCode: 0, stdout: Buffer.alloc(0), stderr: '' }
    }

    await expect(databaseExists(run, 'postgres', "x' or '1'='1")).rejects.toBeInstanceOf(
      BackupError,
    )
    await expect(renameDatabase(run, 'postgres', 'gastos_test_a', 'B')).rejects.toBeInstanceOf(
      BackupError,
    )

    expect(ran).toEqual([])
  })

  it('says which step failed and why, without printing what the program wrote', async () => {
    const target = { user: 'postgres', database: 'gastos_test_a' }

    const missingContainer = await messageOf(
      dumpDatabase(
        failingWith('Error response from daemon: No such container: gastos-postgres'),
        target,
      ),
    )
    const notADump = await messageOf(
      restoreDump(
        failingWith('pg_restore: error: input file does not appear to be a valid archive'),
        target,
        Buffer.from('texto'),
      ),
    )
    const inUse = await messageOf(
      renameDatabase(
        failingWith(
          'ERROR:  database "gastos_test_a" is being accessed by other users\nDETAIL:  There is 1 other session using the database.',
        ),
        'postgres',
        'gastos_test_a',
        'gastos_test_b',
      ),
    )
    const unknown = await messageOf(
      dumpDatabase(failingWith('pg_dump: error: algo-que-no-se-reconoce 4471'), target),
    )

    expect(missingContainer).toContain('No se ha podido obtener la copia')
    expect(missingContainer).toContain('docker compose up -d')
    expect(notADump).toContain('no es una copia válida')
    expect(inUse).toContain('pnpm run dev')
    expect(unknown).toContain('código 1')
    for (const message of [missingContainer, notADump, inUse, unknown]) {
      expect(message).not.toMatch(/daemon|pg_restore: error|DETAIL|algo-que-no-se-reconoce/)
    }
  })

  it('fails when pg_dump ends well and writes nothing', async () => {
    const run: ContainerCommand = async () => ({ exitCode: 0, stdout: Buffer.alloc(0), stderr: '' })

    const message = await messageOf(
      dumpDatabase(run, { user: 'postgres', database: 'gastos_test_a' }),
    )

    expect(message).toContain('no devolvió nada')
  })
})
