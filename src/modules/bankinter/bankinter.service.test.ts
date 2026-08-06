import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseLocalBankinterCopies } from './bankinter.service.js'
import { bankinterSampleFixture, buildStatementXlsx } from './bankinter.fixture.js'
import type { BankinterParseResult } from './bankinter.types.js'

let sourceDir: string
let dumpDir: string

beforeEach(async () => {
  sourceDir = await mkdtemp(join(tmpdir(), 'bankinter-src-'))
  dumpDir = await mkdtemp(join(tmpdir(), 'bankinter-dump-'))
})

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true })
  await rm(dumpDir, { recursive: true, force: true })
})

async function writeCopy(year: string, file: string, buffer: Buffer): Promise<void> {
  const dir = join(sourceDir, 'bankinter', year)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, file), buffer)
}

describe('parseLocalBankinterCopies', () => {
  it('parses each local copy and writes a JSON dump per file (no DB, no move)', async () => {
    await writeCopy('2026', 'movs.xlsx', await buildStatementXlsx(bankinterSampleFixture()))

    const result = await parseLocalBankinterCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.parsed[0]).toEqual({
      bank: 'bankinter',
      year: '2026',
      file: 'movs.xlsx',
      accountIban: 'ES9820385778983000760236',
      movements: 5,
      unparsedRows: 1,
      dumpPath: 'bankinter/2026/movs.xlsx.json',
    })
    // The relative dumpPath is logical: always '/', stable across platforms.
    expect(result.parsed[0].dumpPath).not.toContain('\\')

    // The JSON dump on disk holds the full structured result.
    const dumped = JSON.parse(
      await readFile(join(dumpDir, 'bankinter', '2026', 'movs.xlsx.json'), 'utf8'),
    ) as BankinterParseResult
    expect(dumped.bank).toBe('bankinter')
    expect(dumped.accountIban).toBe('ES9820385778983000760236')
    expect(dumped.movements).toHaveLength(5)
    // No deduplication: the two identical rows survive into the dump.
    expect(
      dumped.movements.filter((m) => m.description === 'PAGO TARJETA' && m.amount === -10),
    ).toHaveLength(2)
    expect(dumped.unparsedRows).toEqual([{ row: 15, reason: expect.stringContaining('importe') }])
  })

  it('does nothing when there are no local Bankinter copies (source dir absent)', async () => {
    const result = await parseLocalBankinterCopies(sourceDir, dumpDir)

    expect(result).toEqual({ parsedCount: 0, failedCount: 0, parsed: [], failed: [] })
    // Nothing was written to the dump dir.
    await expect(readdir(dumpDir)).resolves.toEqual([])
  })

  it('isolates a file that is not a recognizable statement and still parses the healthy one', async () => {
    await writeCopy('2026', 'good.xlsx', await buildStatementXlsx(bankinterSampleFixture()))
    await writeCopy(
      '2026',
      'bad.xlsx',
      await buildStatementXlsx({
        headers: ['Columna A', 'Columna B'],
        rows: [['x', 'y']],
      }),
    )

    const result = await parseLocalBankinterCopies(sourceDir, dumpDir)

    expect(result.parsedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.parsed[0].file).toBe('good.xlsx')
    expect(result.failed[0]).toMatchObject({ bank: 'bankinter', year: '2026', file: 'bad.xlsx' })
    // The healthy file's dump exists; the bad one wrote nothing.
    await expect(
      readFile(join(dumpDir, 'bankinter', '2026', 'good.xlsx.json'), 'utf8'),
    ).resolves.toContain('bankinter')
    await expect(
      readFile(join(dumpDir, 'bankinter', '2026', 'bad.xlsx.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('ignores non-xlsx files in the source folder', async () => {
    await writeCopy('2026', 'notes.txt', Buffer.from('not a spreadsheet'))

    const result = await parseLocalBankinterCopies(sourceDir, dumpDir)

    expect(result).toEqual({ parsedCount: 0, failedCount: 0, parsed: [], failed: [] })
  })
})
