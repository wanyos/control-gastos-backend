import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectPending, processPending } from './ingestion.service.js'
import type { AppDriveClient } from '../../lib/drive.js'
import { DriveConnectionError } from '../../errors/app-error.js'

const folderMime = 'application/vnd.google-apps.folder'

interface FolderEntry {
  id: string
  name: string
  createdTime?: string
}
interface FileEntry {
  id: string
  name: string
  mimeType: string
}
interface Tree {
  folders: Record<string, FolderEntry[]>
  files: Record<string, FileEntry[]>
}

function parentOf(q: string): string {
  const match = q.match(/'([^']+)' in parents/)
  return match ? match[1] : ''
}

interface Overrides {
  get?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  create?: ReturnType<typeof vi.fn>
  contents?: Record<string, Buffer>
}

function buildClient(tree: Tree, overrides: Overrides = {}) {
  const list = vi.fn(async ({ q }: { q: string }) => {
    const parent = parentOf(q)
    if (q.includes(`mimeType != '${folderMime}'`)) {
      return { data: { files: tree.files[parent] ?? [] } }
    }
    if (q.includes("name = 'procesados'")) {
      const matches = (tree.folders[parent] ?? []).filter((folder) => folder.name === 'procesados')
      return { data: { files: matches } }
    }
    return { data: { files: tree.folders[parent] ?? [] } }
  })
  const get =
    overrides.get ??
    vi.fn(async ({ fileId }: { fileId: string }) => ({
      data: overrides.contents?.[fileId] ?? Buffer.from(`content-of-${fileId}`),
    }))
  const update = overrides.update ?? vi.fn(async () => ({ data: {} }))
  const create = overrides.create ?? vi.fn(async () => ({ data: { id: 'created-folder' } }))
  const client = { files: { list, get, update, create } } as unknown as AppDriveClient
  return { client, list, get, update, create }
}

let dumpDir: string

beforeEach(async () => {
  dumpDir = await mkdtemp(join(tmpdir(), 'drive-read-'))
})

afterEach(async () => {
  await rm(dumpDir, { recursive: true, force: true })
})

// Two banks discovered dynamically under the root, each with one pending file.
function twoBankTree(): Tree {
  return {
    folders: {
      root: [
        { id: 'b-bankinter', name: 'bankinter' },
        { id: 'b-santander', name: 'santander' },
      ],
      'b-bankinter': [{ id: 'y-bk-2026', name: '2026' }],
      'b-santander': [{ id: 'y-sa-2025', name: '2025' }],
      // bankinter/2026 already has its procesados/; santander/2025 does not.
      'y-bk-2026': [
        { id: 'proc-bk-2026', name: 'procesados', createdTime: '2020-01-01T00:00:00Z' },
      ],
    },
    files: {
      'y-bk-2026': [{ id: 'f1', name: 'movs.xlsx', mimeType: 'application/vnd.ms-excel' }],
      'y-sa-2025': [{ id: 'f2', name: 'extracto.pdf', mimeType: 'application/pdf' }],
    },
  }
}

describe('detectPending', () => {
  it('walks every bank/year dynamically and counts pending without touching files', async () => {
    const { client, get, update, create } = buildClient(twoBankTree())

    const result = await detectPending(client, 'root')

    expect(result.totalPending).toBe(2)
    expect(result.banks).toEqual([
      {
        bank: 'bankinter',
        years: [{ year: '2026', pendingCount: 1, pending: [{ fileId: 'f1', name: 'movs.xlsx' }] }],
      },
      {
        bank: 'santander',
        years: [
          { year: '2025', pendingCount: 1, pending: [{ fileId: 'f2', name: 'extracto.pdf' }] },
        ],
      },
    ])
    // Non-destructive: nothing downloaded, moved or created.
    expect(get).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('reports zero pending and no banks when the year folders are empty', async () => {
    const tree: Tree = {
      folders: {
        root: [{ id: 'b-bankinter', name: 'bankinter' }],
        'b-bankinter': [{ id: 'y-bk-2026', name: '2026' }],
      },
      files: {},
    }
    const { client } = buildClient(tree)

    await expect(detectPending(client, 'root')).resolves.toEqual({ totalPending: 0, banks: [] })
  })
})

describe('processPending', () => {
  it('copies each pending file locally WITHOUT moving the original (R15)', async () => {
    const { client, update, create } = buildClient(twoBankTree(), {
      create: vi.fn(async () => ({ data: { id: 'proc-sa-2025' } })),
    })

    const result = await processPending(client, 'root', dumpDir)

    expect(result.processedCount).toBe(2)
    expect(result.failedCount).toBe(0)
    // The returned path is a logical relative path: always '/', never the OS
    // separator, so the same string is stable across platforms (Windows too).
    expect(result.processed).toEqual([
      {
        bank: 'bankinter',
        year: '2026',
        fileId: 'f1',
        name: 'movs.xlsx',
        path: 'bankinter/2026/movs.xlsx',
      },
      {
        bank: 'santander',
        year: '2025',
        fileId: 'f2',
        name: 'extracto.pdf',
        path: 'santander/2025/extracto.pdf',
      },
    ])
    for (const entry of result.processed) {
      expect(entry.path).not.toContain('\\')
    }

    // The local copies hold the raw bytes as downloaded.
    const bkCopy = await readFile(join(dumpDir, 'bankinter', '2026', 'movs.xlsx'))
    const saCopy = await readFile(join(dumpDir, 'santander', '2025', 'extracto.pdf'))
    expect(bkCopy.equals(Buffer.from('content-of-f1'))).toBe(true)
    expect(saCopy.equals(Buffer.from('content-of-f2'))).toBe(true)

    // Nothing was moved and no procesados/ was even resolved: both originals
    // stay pending in Drive until the importer stores their movements (R15).
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('stays idempotent: a second run rewrites the same copy and still moves nothing (R15)', async () => {
    const { client, update, create } = buildClient(twoBankTree())

    const first = await processPending(client, 'root', dumpDir)
    const second = await processPending(client, 'root', dumpDir)

    // The files are still pending, so the second run reports them again and
    // overwrites the same local copies: no duplicate file, no new state.
    expect(second).toEqual(first)
    expect(await readdir(join(dumpDir, 'bankinter', '2026'))).toEqual(['movs.xlsx'])
    const copy = await readFile(join(dumpDir, 'bankinter', '2026', 'movs.xlsx'))
    expect(copy.equals(Buffer.from('content-of-f1'))).toBe(true)
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('does nothing and duplicates no copies when there is nothing pending (idempotent)', async () => {
    const tree: Tree = {
      folders: {
        root: [{ id: 'b-bankinter', name: 'bankinter' }],
        'b-bankinter': [{ id: 'y-bk-2026', name: '2026' }],
      },
      files: {},
    }
    const { client, get, update, create } = buildClient(tree)

    const first = await processPending(client, 'root', dumpDir)
    const second = await processPending(client, 'root', dumpDir)

    for (const result of [first, second]) {
      expect(result).toEqual({ processedCount: 0, failedCount: 0, processed: [], failed: [] })
    }
    expect(get).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    await expect(readdir(dumpDir)).resolves.toEqual([])
  })

  it('does not move a file whose download fails and reports it sanitized', async () => {
    const tree: Tree = {
      folders: {
        root: [{ id: 'b-bankinter', name: 'bankinter' }],
        'b-bankinter': [{ id: 'y-bk-2026', name: '2026' }],
        'y-bk-2026': [
          { id: 'proc-bk-2026', name: 'procesados', createdTime: '2020-01-01T00:00:00Z' },
        ],
      },
      files: {
        'y-bk-2026': [{ id: 'f1', name: 'movs.xlsx', mimeType: 'application/vnd.ms-excel' }],
      },
    }
    const get = vi.fn(async () => {
      throw new Error('download failed for token 1//fake-token-value')
    })
    const { client, update } = buildClient(tree, { get })

    const result = await processPending(client, 'root', dumpDir)

    expect(result.processedCount).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ fileId: 'f1', name: 'movs.xlsx' })
    // Error is sanitized: the token never leaks.
    expect(result.failed[0].error).not.toContain('1//fake-token-value')
    // No local copy was written (and nothing is ever moved here anyway).
    expect(update).not.toHaveBeenCalled()
    await expect(readdir(dumpDir)).resolves.toEqual([])
  })

  it('reports a file whose local copy fails to write, without touching Drive', async () => {
    // Make the bank subdir path collide with an existing file so mkdir fails.
    await writeFile(join(dumpDir, 'bankinter'), 'i am a file, not a directory')
    const tree: Tree = {
      folders: {
        root: [{ id: 'b-bankinter', name: 'bankinter' }],
        'b-bankinter': [{ id: 'y-bk-2026', name: '2026' }],
        'y-bk-2026': [
          { id: 'proc-bk-2026', name: 'procesados', createdTime: '2020-01-01T00:00:00Z' },
        ],
      },
      files: {
        'y-bk-2026': [{ id: 'f1', name: 'movs.xlsx', mimeType: 'application/vnd.ms-excel' }],
      },
    }
    const { client, get, update } = buildClient(tree)

    const result = await processPending(client, 'root', dumpDir)

    expect(get).toHaveBeenCalledOnce() // the download succeeded
    expect(result.processedCount).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]).toMatchObject({ fileId: 'f1' })
    expect(update).not.toHaveBeenCalled()
  })

  it('isolates a per-file failure and still copies the healthy files', async () => {
    const tree: Tree = {
      folders: {
        root: [{ id: 'b-bankinter', name: 'bankinter' }],
        'b-bankinter': [{ id: 'y-bk-2026', name: '2026' }],
        'y-bk-2026': [
          { id: 'proc-bk-2026', name: 'procesados', createdTime: '2020-01-01T00:00:00Z' },
        ],
      },
      files: {
        'y-bk-2026': [
          { id: 'bad', name: 'broken.xlsx', mimeType: 'application/vnd.ms-excel' },
          { id: 'good', name: 'ok.xlsx', mimeType: 'application/vnd.ms-excel' },
        ],
      },
    }
    const get = vi.fn(async ({ fileId }: { fileId: string }) => {
      if (fileId === 'bad') {
        throw new Error('boom')
      }
      return { data: Buffer.from(`content-of-${fileId}`) }
    })
    const { client, update } = buildClient(tree, { get })

    const result = await processPending(client, 'root', dumpDir)

    expect(result.processedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.processed[0]).toMatchObject({ fileId: 'good' })
    expect(result.failed[0]).toMatchObject({ fileId: 'bad' })
    // The healthy file got its local copy; neither file was moved in Drive.
    expect(update).not.toHaveBeenCalled()
    const goodCopy = await readFile(join(dumpDir, 'bankinter', '2026', 'ok.xlsx'))
    expect(goodCopy.equals(Buffer.from('content-of-good'))).toBe(true)
  })

  it('surfaces a top-level Drive failure (cannot even list banks) as DriveConnectionError', async () => {
    const list = vi.fn(async () => {
      throw new Error('network down')
    })
    const client = { files: { list } } as unknown as AppDriveClient

    await expect(processPending(client, 'root', dumpDir)).rejects.toBeInstanceOf(
      DriveConnectionError,
    )
  })
})
