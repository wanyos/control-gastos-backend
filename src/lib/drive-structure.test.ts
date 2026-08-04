import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createBank,
  downloadFileContent,
  ensureBankYearFolders,
  ensureFolder,
  listBankFolders,
  listPendingFiles,
  listYearFolders,
  moveFileToProcessed,
  normalizeBankName,
  resolveBankFolder,
  suggestBank,
  uploadFile,
  validateYear,
  type BankYearFolders,
} from './drive-structure.js'
import type { AppDriveClient } from './drive.js'
import { DriveConnectionError, UnknownBankError, ValidationError } from '../errors/app-error.js'

function driveDouble(files: {
  list?: ReturnType<typeof vi.fn>
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  get?: ReturnType<typeof vi.fn>
}): AppDriveClient {
  return { files } as unknown as AppDriveClient
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

const bankFile = { id: 'bank-id', name: 'santander', createdTime: '2020-01-01T00:00:00Z' }
const folders: BankYearFolders = {
  bankFolderId: 'bank-id',
  yearFolderId: 'year-id',
  processedFolderId: 'processed-id',
}

// The duplicate-folder warning is diagnostic; silence it to keep test output clean.
beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('normalizeBankName', () => {
  it('lowercases and dashes realistic human input (R14)', () => {
    expect(normalizeBankName('BBVA')).toBe('bbva')
    expect(normalizeBankName('La Caixa')).toBe('la-caixa')
    expect(normalizeBankName('Bancó')).toBe('banco')
  })

  it('neutralizes path traversal and quotes by construction (R14)', () => {
    const slug = normalizeBankName('../etc/passwd')

    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).not.toMatch(/[/.]/)
  })

  it('rejects empty, too-long and reserved names (R15)', () => {
    expect(() => normalizeBankName('///')).toThrow(ValidationError)
    expect(() => normalizeBankName('a'.repeat(65))).toThrow(ValidationError)
    expect(() => normalizeBankName('procesados')).toThrow(ValidationError)
  })
})

describe('validateYear', () => {
  it('accepts a 4-digit year in range and returns it (R16)', () => {
    expect(validateYear('2026')).toBe('2026')
  })

  it('rejects malformed or out-of-range years (R17)', () => {
    for (const bad of ['99', '20260', 'abcd', '1999', '2101', "20'26"]) {
      expect(() => validateYear(bad)).toThrow(ValidationError)
    }
  })
})

describe('suggestBank (pure)', () => {
  it('returns the closest bank within the threshold (R26)', () => {
    expect(suggestBank('santender', ['santander', 'bbva'])).toBe('santander')
  })

  it('returns undefined when nobody is close enough (R26)', () => {
    expect(suggestBank('zzzzz', ['santander', 'bbva'])).toBeUndefined()
  })
})

describe('ensureFolder', () => {
  it('creates the folder with the folder mimeType and parent when none exists (R4)', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } })
    const create = vi.fn().mockResolvedValue({ data: { id: 'new-folder' } })
    const client = driveDouble({ list, create })

    const id = await ensureFolder(client, '2026', 'parent-id')

    expect(id).toBe('new-folder')
    expect(create).toHaveBeenCalledOnce()
    const arg = create.mock.calls[0][0]
    expect(arg.requestBody.mimeType).toBe('application/vnd.google-apps.folder')
    expect(arg.requestBody.parents).toEqual(['parent-id'])
  })

  it('reuses an existing folder without creating (R6)', async () => {
    const list = vi.fn().mockResolvedValue({
      data: { files: [{ id: 'existing', createdTime: '2020-01-01T00:00:00Z' }] },
    })
    const create = vi.fn()
    const client = driveDouble({ list, create })

    const id = await ensureFolder(client, '2026', 'parent-id')

    expect(id).toBe('existing')
    expect(create).not.toHaveBeenCalled()
  })

  it('reuses the oldest folder when duplicates exist, without creating (R8)', async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        files: [
          { id: 'older', createdTime: '2020-01-01T00:00:00Z' },
          { id: 'newer', createdTime: '2021-01-01T00:00:00Z' },
        ],
      },
    })
    const create = vi.fn()
    const client = driveDouble({ list, create })

    await expect(ensureFolder(client, '2026', 'parent-id')).resolves.toBe('older')
    expect(create).not.toHaveBeenCalled()
  })

  it('creates each folder at most once under concurrent calls (R7)', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } })
    const create = vi.fn().mockResolvedValue({ data: { id: 'created-once' } })
    const client = driveDouble({ list, create })

    const results = await Promise.all([
      ensureFolder(client, '2026', 'parent-id'),
      ensureFolder(client, '2026', 'parent-id'),
    ])

    expect(results).toEqual(['created-once', 'created-once'])
    expect(create).toHaveBeenCalledOnce()
  })

  it('wraps a Drive failure in a sanitized DriveConnectionError (R12)', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } })
    const create = vi
      .fn()
      .mockRejectedValue(new Error('refresh failed for token 1//fake-token-value'))
    const client = driveDouble({ list, create })

    const error = await captureError(ensureFolder(client, '2026', 'parent-id'))

    expect(error).toBeInstanceOf(DriveConnectionError)
    expect((error as DriveConnectionError).message).not.toContain('1//fake-token-value')
  })
})

describe('resolveBankFolder', () => {
  it('returns the existing bank id without creating (R23)', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [bankFile] } })
    const create = vi.fn()
    const client = driveDouble({ list, create })

    await expect(resolveBankFolder(client, 'root', 'santander')).resolves.toBe('bank-id')
    expect(create).not.toHaveBeenCalled()
  })

  it('reuses the oldest bank folder when duplicates exist (R8)', async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        files: [
          { id: 'bank-older', name: 'santander', createdTime: '2020-01-01T00:00:00Z' },
          { id: 'bank-newer', name: 'santander', createdTime: '2021-01-01T00:00:00Z' },
        ],
      },
    })
    const create = vi.fn()
    const client = driveDouble({ list, create })

    await expect(resolveBankFolder(client, 'root', 'santander')).resolves.toBe('bank-older')
    expect(create).not.toHaveBeenCalled()
  })

  it('throws UnknownBankError listing known banks and a suggestion, without creating (R24, R25, R26)', async () => {
    const list = vi.fn(async ({ q }: { q: string }) =>
      q.includes("name = 'santender'")
        ? { data: { files: [] } }
        : { data: { files: [{ name: 'santander' }, { name: 'bbva' }] } },
    )
    const create = vi.fn()
    const client = driveDouble({ list, create })

    const error = await captureError(resolveBankFolder(client, 'root', 'santender'))

    expect(error).toBeInstanceOf(UnknownBankError)
    const message = (error as UnknownBankError).message
    expect(message).toContain('santander')
    expect(message).toContain('bbva')
    expect(message).toMatch(/Did you mean 'santander'/)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('createBank', () => {
  it('creates the bank folder under the root when absent (R27)', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } })
    const create = vi.fn().mockResolvedValue({ data: { id: 'new-bank' } })
    const client = driveDouble({ list, create })

    const id = await createBank(client, 'root', 'santander')

    expect(id).toBe('new-bank')
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0].requestBody.parents).toEqual(['root'])
  })

  it('is idempotent: reuses an existing bank folder without creating (R27)', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [bankFile] } })
    const create = vi.fn()
    const client = driveDouble({ list, create })

    await expect(createBank(client, 'root', 'santander')).resolves.toBe('bank-id')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('UnknownBankError discrimination (R28)', () => {
  it('an invalid slug throws ValidationError, not UnknownBankError, without touching Drive', async () => {
    const list = vi.fn()
    const create = vi.fn()
    const client = driveDouble({ list, create })

    const error = await captureError(ensureBankYearFolders(client, 'root', '///', '2026'))

    expect(error).toBeInstanceOf(ValidationError)
    expect(error).not.toBeInstanceOf(UnknownBankError)
    expect(list).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('a valid but unregistered slug throws UnknownBankError, not ValidationError', async () => {
    const list = vi.fn(async ({ q }: { q: string }) =>
      q.includes("name = 'santender'")
        ? { data: { files: [] } }
        : { data: { files: [{ name: 'santander' }] } },
    )
    const client = driveDouble({ list, create: vi.fn() })

    const error = await captureError(resolveBankFolder(client, 'root', 'santender'))

    expect(error).toBeInstanceOf(UnknownBankError)
    expect(error).not.toBeInstanceOf(ValidationError)
  })
})

describe('ensureBankYearFolders', () => {
  it('resolves the bank and auto-creates year and procesados, never the bank or root (R3, R4, R5)', async () => {
    const list = vi.fn(async ({ q }: { q: string }) =>
      q.includes("name = 'santander'") ? { data: { files: [bankFile] } } : { data: { files: [] } },
    )
    const create = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 'year-id' } })
      .mockResolvedValueOnce({ data: { id: 'processed-id' } })
    const client = driveDouble({ list, create })

    const result = await ensureBankYearFolders(client, 'root', 'santander', '2026')

    expect(result).toEqual({
      bankFolderId: 'bank-id',
      yearFolderId: 'year-id',
      processedFolderId: 'processed-id',
    })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][0].requestBody.parents).toEqual(['bank-id'])
    expect(create.mock.calls[1][0].requestBody.parents).toEqual(['year-id'])
    for (const call of create.mock.calls) {
      expect(call[0].requestBody.parents).not.toEqual(['root'])
    }
  })

  it('throws UnknownBankError and creates nothing for an unregistered bank (R24)', async () => {
    const list = vi.fn(async ({ q }: { q: string }) =>
      q.includes("name = 'santender'")
        ? { data: { files: [] } }
        : { data: { files: [{ name: 'santander' }, { name: 'bbva' }] } },
    )
    const create = vi.fn()
    const client = driveDouble({ list, create })

    const error = await captureError(ensureBankYearFolders(client, 'root', 'santender', '2026'))

    expect(error).toBeInstanceOf(UnknownBankError)
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects an invalid year without touching Drive (R17)', async () => {
    const list = vi.fn()
    const create = vi.fn()
    const client = driveDouble({ list, create })

    await expect(ensureBankYearFolders(client, 'root', 'santander', '99')).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(list).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('converges after a partial failure, reusing the bank and never recreating it (R13)', async () => {
    const listPhase1 = vi.fn(async ({ q }: { q: string }) => {
      if (q.includes("name = 'santander'")) return { data: { files: [bankFile] } }
      if (q.includes("name = '2026'")) throw new Error('network blip')
      return { data: { files: [] } }
    })
    const createPhase1 = vi.fn()
    const client1 = driveDouble({ list: listPhase1, create: createPhase1 })

    const failure = await captureError(ensureBankYearFolders(client1, 'root', 'santander', '2026'))

    expect(failure).toBeInstanceOf(DriveConnectionError)
    expect(createPhase1).not.toHaveBeenCalled()

    const listPhase2 = vi.fn(async ({ q }: { q: string }) =>
      q.includes("name = 'santander'") ? { data: { files: [bankFile] } } : { data: { files: [] } },
    )
    const createPhase2 = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 'year-id' } })
      .mockResolvedValueOnce({ data: { id: 'processed-id' } })
    const client2 = driveDouble({ list: listPhase2, create: createPhase2 })

    const result = await ensureBankYearFolders(client2, 'root', 'santander', '2026')

    expect(result).toEqual({
      bankFolderId: 'bank-id',
      yearFolderId: 'year-id',
      processedFolderId: 'processed-id',
    })
    for (const call of createPhase2.mock.calls) {
      expect(call[0].requestBody.parents).not.toEqual(['root'])
    }
  })
})

describe('uploadFile', () => {
  it('creates a new file in the folder with the media and returns its id (R9)', async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 'file-1' } })
    const client = driveDouble({ create })

    const id = await uploadFile(client, 'year-id', {
      name: 'statement.pdf',
      mimeType: 'application/pdf',
      body: 'raw-bytes',
    })

    expect(id).toBe('file-1')
    const arg = create.mock.calls[0][0]
    expect(arg.requestBody.parents).toEqual(['year-id'])
    expect(arg.requestBody.name).toBe('statement.pdf')
    expect(arg.media).toEqual({ mimeType: 'application/pdf', body: 'raw-bytes' })
  })

  it('never overwrites: two uploads of the same name yield two independent files (R10)', async () => {
    const update = vi.fn()
    const create = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 'file-a' } })
      .mockResolvedValueOnce({ data: { id: 'file-b' } })
    const client = driveDouble({ create, update })
    const file = { name: 'same.pdf', mimeType: 'application/pdf', body: 'x' }

    const first = await uploadFile(client, 'year-id', file)
    const second = await uploadFile(client, 'year-id', file)

    expect(first).toBe('file-a')
    expect(second).toBe('file-b')
    expect(create).toHaveBeenCalledTimes(2)
    expect(update).not.toHaveBeenCalled()
  })
})

describe('moveFileToProcessed', () => {
  it('moves the file into procesados via addParents/removeParents (R11)', async () => {
    const update = vi.fn().mockResolvedValue({ data: { id: 'file-1', parents: ['processed-id'] } })
    const client = driveDouble({ update })

    await moveFileToProcessed(client, 'file-1', folders)

    const arg = update.mock.calls[0][0]
    expect(arg.fileId).toBe('file-1')
    expect(arg.addParents).toBe('processed-id')
    expect(arg.removeParents).toBe('year-id')
  })
})

describe('listBankFolders', () => {
  it('lists the bank subfolders of the root as id/name (dynamic registry)', async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        files: [
          { id: 'b-bankinter', name: 'bankinter' },
          { id: 'b-santander', name: 'santander' },
        ],
      },
    })
    const client = driveDouble({ list })

    const banks = await listBankFolders(client, 'root')

    expect(banks).toEqual([
      { id: 'b-bankinter', name: 'bankinter' },
      { id: 'b-santander', name: 'santander' },
    ])
    const q = list.mock.calls[0][0].q as string
    expect(q).toContain("'root' in parents")
    expect(q).toContain("mimeType = 'application/vnd.google-apps.folder'")
  })

  it('drops entries without a usable id or name', async () => {
    const list = vi.fn().mockResolvedValue({
      data: { files: [{ id: 'b-ok', name: 'bbva' }, { name: 'no-id' }, { id: 'no-name' }] },
    })
    const client = driveDouble({ list })

    await expect(listBankFolders(client, 'root')).resolves.toEqual([{ id: 'b-ok', name: 'bbva' }])
  })
})

describe('listYearFolders', () => {
  it('returns only 4-digit year folders, ignoring stray folders', async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        files: [
          { id: 'y-2025', name: '2025' },
          { id: 'y-2026', name: '2026' },
          { id: 'misc', name: 'notas' },
        ],
      },
    })
    const client = driveDouble({ list })

    const years = await listYearFolders(client, 'b-bankinter')

    expect(years).toEqual([
      { id: 'y-2025', name: '2025' },
      { id: 'y-2026', name: '2026' },
    ])
    expect(list.mock.calls[0][0].q as string).toContain("'b-bankinter' in parents")
  })
})

describe('listPendingFiles', () => {
  it('lists non-folder children of the year folder (excludes procesados)', async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        files: [
          { id: 'f1', name: 'movs.xlsx', mimeType: 'application/vnd.ms-excel' },
          { id: 'f2', name: 'extracto.pdf', mimeType: 'application/pdf' },
        ],
      },
    })
    const client = driveDouble({ list })

    const pending = await listPendingFiles(client, 'y-2026')

    expect(pending).toEqual([
      { id: 'f1', name: 'movs.xlsx', mimeType: 'application/vnd.ms-excel' },
      { id: 'f2', name: 'extracto.pdf', mimeType: 'application/pdf' },
    ])
    const q = list.mock.calls[0][0].q as string
    expect(q).toContain("'y-2026' in parents")
    expect(q).toContain("mimeType != 'application/vnd.google-apps.folder'")
  })

  it('returns an empty list when nothing is pending', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } })
    const client = driveDouble({ list })

    await expect(listPendingFiles(client, 'y-2026')).resolves.toEqual([])
  })
})

describe('downloadFileContent', () => {
  it('downloads raw bytes via files.get alt=media and returns a Buffer', async () => {
    const bytes = Buffer.from('xlsx-raw-bytes')
    const get = vi.fn().mockResolvedValue({ data: bytes })
    const client = driveDouble({ get })

    const content = await downloadFileContent(client, 'file-1')

    expect(Buffer.isBuffer(content)).toBe(true)
    expect(content.equals(bytes)).toBe(true)
    const [params, opts] = get.mock.calls[0]
    expect(params).toEqual({ fileId: 'file-1', alt: 'media' })
    expect(opts).toEqual({ responseType: 'arraybuffer' })
  })

  it('wraps a Drive failure in a sanitized DriveConnectionError, hiding the token', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(new Error('download failed for token 1//fake-token-value'))
    const client = driveDouble({ get })

    const error = await captureError(downloadFileContent(client, 'file-1'))

    expect(error).toBeInstanceOf(DriveConnectionError)
    expect((error as DriveConnectionError).message).not.toContain('1//fake-token-value')
  })
})
