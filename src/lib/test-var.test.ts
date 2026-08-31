import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultVarRoot, describeVarDifferences, snapshotVarDir } from './test-var.js'

// Everything written here is invented and lives in a temp dir: the guardian is
// proved on a fake `var/`, never on his (ADR-017).
let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'test-var-'))
  await mkdir(join(root, 'drive-read', 'banco-inventado', '2026'), { recursive: true })
  await writeFile(join(root, 'drive-read', 'banco-inventado', '2026', 'extracto.csv'), 'a;b;c\n')
  await mkdir(join(root, 'parsed', 'banco-inventado', '2026'), { recursive: true })
  await writeFile(
    join(root, 'parsed', 'banco-inventado', '2026', 'products.json'),
    '{"bank":"banco-inventado"}\n',
  )
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('snapshotVarDir', () => {
  it('photographs every file under var/, with its content, size and modification time', () => {
    const snapshot = snapshotVarDir(root)

    expect(Object.keys(snapshot.files).sort()).toEqual([
      'drive-read/banco-inventado/2026/extracto.csv',
      'parsed/banco-inventado/2026/products.json',
    ])
    const state = snapshot.files['drive-read/banco-inventado/2026/extracto.csv']
    expect(state?.size).toBe(6)
    expect(state?.hash).toHaveLength(64)
    expect(state?.modifiedAt).toBeGreaterThan(0)
  })

  it('gives an empty snapshot when var/ does not exist, instead of throwing', () => {
    expect(snapshotVarDir(join(root, 'no-existe')).files).toEqual({})
  })

  it('reading it twice changes nothing: two photos in a row are identical', () => {
    expect(describeVarDifferences(snapshotVarDir(root), snapshotVarDir(root))).toEqual([])
  })

  it('points at the var/ of this repository by default', () => {
    expect(defaultVarRoot().replace(/\\/g, '/')).toMatch(/\/var$/)
  })
})

describe('describeVarDifferences', () => {
  it('goes red when a test writes a NEW file into var/', async () => {
    const before = snapshotVarDir(root)
    await writeFile(join(root, 'parsed', 'banco-inventado', '2026', 'nuevo.json'), '{}\n')

    expect(describeVarDifferences(before, snapshotVarDir(root))).toEqual([
      'var/parsed/banco-inventado/2026/nuevo.json: creado por la suite',
    ])
  })

  it('goes red when a test CHANGES the content of one of his files', async () => {
    const before = snapshotVarDir(root)
    await writeFile(
      join(root, 'parsed', 'banco-inventado', '2026', 'products.json'),
      '{"bank":"banco-inventado","products":[]}\n',
    )

    expect(describeVarDifferences(before, snapshotVarDir(root))).toEqual([
      'var/parsed/banco-inventado/2026/products.json: su contenido ha cambiado (27 → 41 bytes)',
    ])
  })

  it('goes red when a test REWRITES a file with the very same bytes (only the date moved)', async () => {
    const file = join(root, 'parsed', 'banco-inventado', '2026', 'products.json')
    const before = snapshotVarDir(root)
    // The exact case of feature 33: the dump was rewritten on every run, and for
    // a while with identical bytes. Set explicitly so the test does not depend on
    // the clock resolution of the filesystem.
    const later = new Date(Date.now() + 60_000)
    await utimes(file, later, later)

    expect(describeVarDifferences(before, snapshotVarDir(root))).toEqual([
      'var/parsed/banco-inventado/2026/products.json: reescrito con el mismo contenido (cambió su fecha)',
    ])
  })

  it('goes red when a test DELETES one of his files', async () => {
    const before = snapshotVarDir(root)
    await rm(join(root, 'drive-read', 'banco-inventado', '2026', 'extracto.csv'))

    expect(describeVarDifferences(before, snapshotVarDir(root))).toEqual([
      'var/drive-read/banco-inventado/2026/extracto.csv: BORRADO por la suite',
    ])
  })

  it('stays quiet when nothing moved', () => {
    expect(describeVarDifferences(snapshotVarDir(root), snapshotVarDir(root))).toEqual([])
  })

  it('names no content of his: only the path and what moved', async () => {
    const before = snapshotVarDir(root)
    await writeFile(
      join(root, 'drive-read', 'banco-inventado', '2026', 'extracto.csv'),
      'a;b;c\nsecreto-inventado;123456,78;X\n',
    )

    const differences = describeVarDifferences(before, snapshotVarDir(root))

    expect(differences).toHaveLength(1)
    expect(differences[0]).not.toContain('secreto-inventado')
    expect(differences[0]).not.toContain('123456')
  })
})
