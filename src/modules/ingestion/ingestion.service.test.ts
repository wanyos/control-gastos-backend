import { describe, expect, it, vi } from 'vitest'

import { detectPending } from './ingestion.service.js'
import type { AppDriveClient } from '../../lib/drive.js'

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
