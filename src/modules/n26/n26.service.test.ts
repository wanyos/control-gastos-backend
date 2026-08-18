import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildCp1252StatementCsv,
  buildStatementCsv,
  n26Preamble,
  writeLocalCopy,
} from './n26.fixture.js'
import { parseLocalN26Copies } from './n26.service.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'n26-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'n26-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

describe('parseLocalN26Copies', () => {
  it('parses each local copy and writes its JSON dump', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'extracto.csv',
      buildStatementCsv({
        preamble: n26Preamble(),
      }),
    )

    const result = await parseLocalN26Copies(sourceDir, dumpDir)

    expect(result).toMatchObject({
      parsedCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'n26',
          year: '2026',
          file: 'extracto.csv',
          accountBalance: 1234.56,
          movements: 9,
          unparsedRows: 2,
          dumpPath: 'n26/2026/extracto.csv.json',
        },
      ],
    })

    const dump = JSON.parse(
      await readFile(join(dumpDir, 'n26', '2026', 'extracto.csv.json'), 'utf8'),
    )
    expect(dump.bank).toBe('n26')
    expect(dump.movements).toHaveLength(9)
  })

  it('isolates a failing file and keeps the good ones, without stopping', async () => {
    await writeLocalCopy(sourceDir, '2026', 'bueno.csv', buildStatementCsv())
    await writeLocalCopy(sourceDir, '2026', 'roto.csv', Buffer.from('esto,no,es,un,extracto\n'))
    await writeLocalCopy(sourceDir, '2026', 'notas.txt', 'ruido')

    const result = await parseLocalN26Copies(sourceDir, dumpDir)

    expect(result).toMatchObject({
      parsedCount: 1,
      failedCount: 1,
      ignoredCount: 1,
      failed: [{ bank: 'n26', year: '2026', file: 'roto.csv' }],
      ignored: [{ file: 'notas.txt' }],
    })
  })

  it('reports a file that is not UTF-8 as a failure of that file, with its reason', async () => {
    await writeLocalCopy(sourceDir, '2026', 'ansi.csv', buildCp1252StatementCsv())

    const result = await parseLocalN26Copies(sourceDir, dumpDir)

    expect(result.failedCount).toBe(1)
    expect(result.failed[0].reason).toContain('no está guardado en UTF-8')
    expect(result.parsedCount).toBe(0)
  })

  it('does nothing when there are no local copies', async () => {
    const result = await parseLocalN26Copies(sourceDir, dumpDir)

    expect(result).toEqual({
      parsedCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      statements: [],
      failed: [],
      ignored: [],
    })
  })

  it('is deterministic: two runs over the same input write the same bytes', async () => {
    await writeLocalCopy(sourceDir, '2026', 'extracto.csv', buildStatementCsv())

    const first = await parseLocalN26Copies(sourceDir, dumpDir)
    const firstDump = await readFile(join(dumpDir, 'n26', '2026', 'extracto.csv.json'), 'utf8')
    const second = await parseLocalN26Copies(sourceDir, dumpDir)
    const secondDump = await readFile(join(dumpDir, 'n26', '2026', 'extracto.csv.json'), 'utf8')

    expect(second).toEqual(first)
    expect(secondDump).toBe(firstDump)
  })
})
