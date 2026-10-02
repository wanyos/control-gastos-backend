// A Drive client double for the tests of the backup commands (feature 55): one
// folder and its files, held in memory.
//
// Nothing here is anybody's Drive: the ids are made up from the position of
// each file, and the contents are whatever bytes the test hands over.
//
// EVERY method asked of `client.files` is written down by name, the ones this
// double does not implement too: that is what lets a test say «nothing that
// deletes, moves or renames a file was called».
import { PassThrough, type Readable } from 'node:stream'

import type { AppDriveClient } from '../../lib/drive.js'

const folderMimeType = 'application/vnd.google-apps.folder'

export interface StoredBackupFile {
  id: string
  name: string
  content: Buffer
  createdTime: string
}

export interface BackupDriveFixture {
  client: AppDriveClient
  folderId: string
  folderName: string
  /** What the folder id of the configuration points at. */
  folder: 'ok' | 'missing' | 'not-a-folder' | 'trashed'
  uploadFails: boolean
  /** Added to the size Drive answers after an upload: 0 is an honest Drive. */
  storedSizeOffset: number
  /** Names of the methods of `client.files` called so far, in order. */
  calls: string[]
  /** Ids of the files whose content was downloaded, in order. */
  downloads: string[]
  /** Parameters of each `files.list` call. */
  listQueries: Array<Record<string, unknown>>
  files: StoredBackupFile[]
  addFile: (name: string, content: Buffer, createdTime: string) => StoredBackupFile
}

/**
 * Reads the body of an upload the way the real client does (`multipartUpload`
 * of googleapis-common): a string goes as it is and anything else is PIPED, so
 * a body without `pipe` -- a Buffer -- fails with the same TypeError.
 */
async function readUploadBody(body: unknown): Promise<Buffer> {
  if (typeof body === 'string') return Buffer.from(body)
  const source = body as { pipe?: unknown } | null | undefined
  if (typeof source?.pipe !== 'function') {
    throw new TypeError('part.body.pipe is not a function')
  }
  const chunks: Buffer[] = []
  for await (const chunk of (body as Readable).pipe(new PassThrough())) {
    chunks.push(Buffer.from(chunk as Buffer))
  }
  return Buffer.concat(chunks)
}

export function backupDriveFixture(): BackupDriveFixture {
  // Each upload is one minute later than the previous one.
  let uploads = 0
  const nextCreatedTime = (): string => {
    uploads += 1
    return new Date(Date.UTC(2026, 2, 14, 8, uploads, 0)).toISOString()
  }

  const fixture: BackupDriveFixture = {
    client: undefined as unknown as AppDriveClient,
    folderId: 'fixture-backup-folder',
    folderName: 'copias-de-prueba',
    folder: 'ok',
    uploadFails: false,
    storedSizeOffset: 0,
    calls: [],
    downloads: [],
    listQueries: [],
    files: [],
    addFile(name, content, createdTime) {
      const file = {
        id: `fixture-backup-file-${fixture.files.length + 1}`,
        name,
        content,
        createdTime,
      }
      fixture.files.push(file)
      return file
    },
  }

  const notFound = (): Error => Object.assign(new Error('File not found'), { status: 404 })

  const methods: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
    async get({ fileId, alt }) {
      if (alt === 'media') {
        const file = fixture.files.find((candidate) => candidate.id === fileId)
        if (file === undefined) throw notFound()
        fixture.downloads.push(file.id)
        return { data: file.content }
      }
      if (fixture.folder === 'missing' || fileId !== fixture.folderId) throw notFound()
      return {
        data: {
          id: fixture.folderId,
          name: fixture.folderName,
          mimeType: fixture.folder === 'not-a-folder' ? 'application/pdf' : folderMimeType,
          trashed: fixture.folder === 'trashed',
        },
      }
    },
    async list(params) {
      fixture.listQueries.push(params)
      const parent = (String(params.q).match(/'([^']+)' in parents/) ?? [])[1]
      const listed = parent === fixture.folderId ? [...fixture.files] : []
      if (params.orderBy === 'createdTime desc') {
        listed.sort((a, b) => b.createdTime.localeCompare(a.createdTime))
      }
      return {
        data: {
          files: listed.map((file) => ({
            id: file.id,
            name: file.name,
            size: String(file.content.length),
            createdTime: file.createdTime,
          })),
        },
      }
    },
    async create(params) {
      if (fixture.uploadFails) throw new Error('upload refused by the fixture')
      const { requestBody, media } = params as {
        requestBody: { name: string; parents: string[] }
        media: { body: unknown }
      }
      const content = await readUploadBody(media.body)
      if (requestBody.parents[0] !== fixture.folderId) throw notFound()
      const file = fixture.addFile(requestBody.name, content, nextCreatedTime())
      return {
        data: {
          id: file.id,
          name: file.name,
          size: String(file.content.length + fixture.storedSizeOffset),
          createdTime: file.createdTime,
        },
      }
    },
  }

  const files = new Proxy(
    {},
    {
      get(_target, method) {
        return async (params: Record<string, unknown> = {}) => {
          const name = String(method)
          fixture.calls.push(name)
          const implemented = methods[name]
          if (implemented === undefined) {
            throw new Error(`the backup Drive fixture does not implement files.${name}`)
          }
          return implemented(params)
        }
      },
    },
  )

  fixture.client = { files } as unknown as AppDriveClient
  return fixture
}
