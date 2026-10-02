// A Drive client double for the tests that import through `importPending`
// (feature 52): one bank folder, one year, its `procesados/` and the pending
// files a test hands it, held in memory.
//
// 🔒 Nothing here is anybody's Drive: the ids are made up from the position of
// each file and the contents are whatever synthetic bytes the test builds.
import type { AppDriveClient } from './drive.js'

const folderMimeType = 'application/vnd.google-apps.folder'
const processedFolder = 'procesados'

export interface PendingFileFixture {
  name: string
  content: Buffer
}

/**
 * One bank folder, one year, its `procesados/`, and the given pending files.
 *
 * The listing is static on purpose: a file that was moved is still listed on
 * the next run, which is what «the human put it back in the year folder» looks
 * like. `moved()` says, by name and in order, which files the importer moved.
 */
export function driveWithPendingFiles(
  bankFolder: string,
  year: string,
  files: PendingFileFixture[],
): { client: AppDriveClient; moved: () => string[] } {
  const bankId = 'fixture-bank'
  const yearId = 'fixture-year'
  const processedId = 'fixture-processed'
  const pending = files.map((file, index) => ({ id: `fixture-file-${index + 1}`, ...file }))
  const movedNames: string[] = []

  const list = async ({ q }: { q: string }) => {
    const parent = (q.match(/'([^']+)' in parents/) ?? [])[1] ?? ''
    if (q.includes(`mimeType != '${folderMimeType}'`)) {
      const listed =
        parent === yearId
          ? pending.map((file) => ({
              id: file.id,
              name: file.name,
              mimeType: 'application/octet-stream',
            }))
          : []
      return { data: { files: listed } }
    }
    if (q.includes(`name = '${processedFolder}'`)) {
      return {
        data: { files: parent === yearId ? [{ id: processedId, name: processedFolder }] : [] },
      }
    }
    if (parent === bankId) {
      return { data: { files: [{ id: yearId, name: year }] } }
    }
    if (parent === yearId) {
      return { data: { files: [{ id: processedId, name: processedFolder }] } }
    }
    // Any other parent is the root the test passes as `rootFolderId`.
    return { data: { files: [{ id: bankId, name: bankFolder }] } }
  }

  const get = async ({ fileId }: { fileId: string }) => {
    const file = pending.find((candidate) => candidate.id === fileId)
    if (file === undefined) {
      throw new Error(`no pending file with id ${fileId}`)
    }
    return { data: file.content }
  }

  const update = async ({ fileId }: { fileId: string }) => {
    const file = pending.find((candidate) => candidate.id === fileId)
    if (file !== undefined) {
      movedNames.push(file.name)
    }
    return { data: { id: fileId } }
  }

  const create = async () => ({ data: { id: processedId } })

  return {
    client: { files: { list, get, update, create } } as unknown as AppDriveClient,
    moved: () => [...movedNames],
  }
}
