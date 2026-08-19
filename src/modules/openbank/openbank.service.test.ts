import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildOpenbankStatement,
  documentationIban,
  resaveInUtf8AsAnEditorWould,
  writeLocalCopy,
} from './openbank.fixture.js'
import { parseLocalOpenbankCopies } from './openbank.service.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'openbank-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'openbank-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

describe('parseLocalOpenbankCopies (R15)', () => {
  it('parses each local copy and writes its JSON dump', async () => {
    await writeLocalCopy(sourceDir, '2026', 'movimientos.xls', buildOpenbankStatement())

    const result = await parseLocalOpenbankCopies(sourceDir, dumpDir)

    expect(result).toMatchObject({
      parsedCount: 1,
      failedCount: 0,
      ignoredCount: 0,
      statements: [
        {
          bank: 'openbank',
          year: '2026',
          file: 'movimientos.xls',
          accountIban: documentationIban,
          accountBalance: 1234.56,
          movements: 8,
          unparsedRows: 2,
          dumpPath: 'openbank/2026/movimientos.xls.json',
        },
      ],
    })

    const dump = JSON.parse(
      await readFile(join(dumpDir, 'openbank', '2026', 'movimientos.xls.json'), 'utf8'),
    )
    expect(dump.bank).toBe('openbank')
    expect(dump.movements).toHaveLength(8)
    // The dump is written in UTF-8 whatever the file came in: the encoding of
    // the bank stops at the parser (ADR-022).
    expect(dump.movements[1].description).toBe('RECIBO SUSCRIPCIÓN INVENTADA')
  })

  it('walks every year of the bank, oldest folder first', async () => {
    await writeLocalCopy(sourceDir, '2025', 'movimientos.xls', buildOpenbankStatement())
    await writeLocalCopy(sourceDir, '2026', 'movimientos.xls', buildOpenbankStatement())

    const result = await parseLocalOpenbankCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(2)
    expect(result.statements.map((statement) => statement.year)).toEqual(['2025', '2026'])
  })

  it('isolates a failing file and keeps the good ones, without stopping', async () => {
    await writeLocalCopy(sourceDir, '2026', 'bueno.xls', buildOpenbankStatement())
    await writeLocalCopy(sourceDir, '2026', 'roto.xls', Buffer.from('<html>nada</html>', 'latin1'))
    await writeLocalCopy(sourceDir, '2026', 'notas.txt', 'ruido')

    const result = await parseLocalOpenbankCopies(sourceDir, dumpDir)

    expect(result).toMatchObject({
      parsedCount: 1,
      failedCount: 1,
      ignoredCount: 1,
      failed: [{ bank: 'openbank', year: '2026', file: 'roto.xls' }],
      ignored: [{ file: 'notas.txt' }],
    })
  })

  it('reports a file that no longer declares the bank encoding as a failure of that file', async () => {
    await writeLocalCopy(
      sourceDir,
      '2026',
      'utf8.xls',
      buildOpenbankStatement({ charset: 'utf-8', encoding: 'utf8' }),
    )

    const result = await parseLocalOpenbankCopies(sourceDir, dumpDir)

    expect(result.failedCount).toBe(1)
    expect(result.failed[0].reason).toContain("'utf-8'")
    expect(result.parsedCount).toBe(0)
  })

  it('reports a re-saved file as a failure OF THAT FILE, with the true reason (C1)', async () => {
    // The whole path, as it happened on 2026-08-19: the file the editor
    // re-saved travels as one entry of `failed[]` — the rest of the batch is
    // parsed, nothing is imported from it and the reason is the true one, not
    // «this is not a statement of this bank».
    await writeLocalCopy(sourceDir, '2026', 'bueno.xls', buildOpenbankStatement())
    await writeLocalCopy(
      sourceDir,
      '2026',
      'reguardado.xls',
      resaveInUtf8AsAnEditorWould(buildOpenbankStatement()),
    )

    const result = await parseLocalOpenbankCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.failed[0].file).toBe('reguardado.xls')
    expect(result.failed[0].reason).toContain('vuelto a guardar')
    expect(result.failed[0].reason).not.toContain('no se encuentra la cabecera')
  })

  it('does nothing when there are no local copies', async () => {
    const result = await parseLocalOpenbankCopies(sourceDir, dumpDir)

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
    await writeLocalCopy(sourceDir, '2026', 'movimientos.xls', buildOpenbankStatement())
    const dumpFile = join(dumpDir, 'openbank', '2026', 'movimientos.xls.json')

    const first = await parseLocalOpenbankCopies(sourceDir, dumpDir)
    const firstDump = await readFile(dumpFile, 'utf8')
    const second = await parseLocalOpenbankCopies(sourceDir, dumpDir)
    const secondDump = await readFile(dumpFile, 'utf8')

    expect(second).toEqual(first)
    expect(secondDump).toBe(firstDump)
  })
})
