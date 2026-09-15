import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildRevolutCsv, revolutPreamble, revolutRow, writeLocalCopy } from './revolut.fixture.js'
import { parseLocalRevolutCopies } from './revolut.service.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'revolut-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'revolut-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

describe('parseLocalRevolutCopies', () => {
  it('parses each local copy and writes its JSON dump', async () => {
    await writeLocalCopy(
      sourceDir,
      '2025',
      'extracto.csv',
      buildRevolutCsv({ preamble: revolutPreamble() }),
    )

    const result = await parseLocalRevolutCopies(sourceDir, dumpDir)

    expect(result).toEqual({
      parsedCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'revolut',
          year: '2025',
          file: 'extracto.csv',
          accountIban: 'ES9121000418450200051332',
          accountBalance: null,
          movements: 6,
          unparsedRows: 3,
          dumpPath: 'revolut/2025/extracto.csv.json',
        },
      ],
      failed: [],
      ignored: [],
    })
    const dump = JSON.parse(
      await readFile(join(dumpDir, 'revolut', '2025', 'extracto.csv.json'), 'utf8'),
    )
    expect(dump.bank).toBe('revolut')
    expect(dump.movements).toHaveLength(6)
  })

  it('isolates a failing file and ignores other extensions, without stopping', async () => {
    await writeLocalCopy(sourceDir, '2025', 'bueno.csv', buildRevolutCsv())
    await writeLocalCopy(sourceDir, '2025', 'roto.csv', Buffer.from('esto,no,es,un,extracto\n'))
    await writeLocalCopy(sourceDir, '2025', 'notas.txt', 'ruido')

    const result = await parseLocalRevolutCopies(sourceDir, dumpDir)

    expect(result).toMatchObject({
      parsedCount: 1,
      failedCount: 1,
      ignoredCount: 1,
      failed: [{ bank: 'revolut', year: '2025', file: 'roto.csv' }],
      ignored: [{ bank: 'revolut', year: '2025', file: 'notas.txt' }],
    })
  })

  it('reports a file that is not UTF-8 as a failure of that file, with its reason', async () => {
    const utf8 = buildRevolutCsv({ rows: [revolutRow({ description: 'Suscripción Inventada' })] })
    const index = utf8.indexOf(Buffer.from('ó', 'utf8'))
    const cp1252 = Buffer.concat([
      utf8.subarray(0, index),
      Buffer.from([0xf3]),
      utf8.subarray(index + 2),
    ])
    await writeLocalCopy(sourceDir, '2025', 'ansi.csv', cp1252)

    const result = await parseLocalRevolutCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(0)
    expect(result.failed[0].reason).toContain('no está guardado en UTF-8')
  })

  it('does nothing when there are no local copies', async () => {
    expect(await parseLocalRevolutCopies(sourceDir, dumpDir)).toEqual({
      parsedCount: 0,
      failedCount: 0,
      ignoredCount: 0,
      statements: [],
      failed: [],
      ignored: [],
    })
  })

  it('is deterministic: two runs over the same input write the same bytes', async () => {
    await writeLocalCopy(sourceDir, '2025', 'extracto.csv', buildRevolutCsv())
    const dumpFile = join(dumpDir, 'revolut', '2025', 'extracto.csv.json')

    const first = await parseLocalRevolutCopies(sourceDir, dumpDir)
    const firstDump = await readFile(dumpFile, 'utf8')
    const second = await parseLocalRevolutCopies(sourceDir, dumpDir)

    expect(second).toEqual(first)
    expect(await readFile(dumpFile, 'utf8')).toBe(firstDump)
  })
})
