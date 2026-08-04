import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'

import { AppError } from '../../errors/app-error.js'
import type { AppDriveClient } from '../../lib/drive.js'
import {
  downloadFileContent,
  ensureFolder,
  listBankFolders,
  listPendingFiles,
  listYearFolders,
  moveFileToProcessed,
  processedFolderName,
  type BankYearFolders,
} from '../../lib/drive-structure.js'
import type {
  DetectionResult,
  FailedFile,
  PendingBank,
  PendingYear,
  ProcessResult,
  ProcessedFile,
} from './ingesta.types.js'

/**
 * Non-destructive detection: walks every bank folder discovered under the root
 * (dynamically, no fixed name list) and, within each `<bank>/<year>/`, counts and
 * lists the pending files (non-folder children, so `procesados/` is excluded)
 * without downloading or moving anything. Bank and year come from the folder, not
 * the content. Only banks/years with pending files are included.
 */
export async function detectPending(
  client: AppDriveClient,
  rootFolderId: string,
): Promise<DetectionResult> {
  const bankFolders = await listBankFolders(client, rootFolderId)
  const banks: PendingBank[] = []
  let totalPending = 0

  for (const bank of bankFolders) {
    const yearFolders = await listYearFolders(client, bank.id)
    const years: PendingYear[] = []
    for (const year of yearFolders) {
      const pending = await listPendingFiles(client, year.id)
      if (pending.length === 0) {
        continue
      }
      totalPending += pending.length
      years.push({
        year: year.name,
        pendingCount: pending.length,
        pending: pending.map((file) => ({ fileId: file.id, name: file.name })),
      })
    }
    if (years.length > 0) {
      banks.push({ bank: bank.name, years })
    }
  }

  return { totalPending, banks }
}

/**
 * Explicit process action: for every pending file across all bank/year folders,
 * downloads its content as-is (no parsing), writes a local copy under
 * `dumpBaseDir/<bank>/<year>/<name>` and ONLY after the copy is written moves the
 * original to `<bank>/<year>/procesados/` (reusing feature 4's move). Files are
 * handled one by one: a read/copy/move failure for one file is isolated, reported
 * in `failed` (its original is never moved) and does not stop the rest. Running it
 * with nothing pending does nothing and duplicates no copies (idempotent).
 */
export async function processPending(
  client: AppDriveClient,
  rootFolderId: string,
  dumpBaseDir: string,
): Promise<ProcessResult> {
  const bankFolders = await listBankFolders(client, rootFolderId)
  const processed: ProcessedFile[] = []
  const failed: FailedFile[] = []

  for (const bank of bankFolders) {
    const yearFolders = await listYearFolders(client, bank.id)
    for (const year of yearFolders) {
      const pending = await listPendingFiles(client, year.id)
      if (pending.length === 0) {
        continue
      }
      // Resolve (reuse or create) the procesados/ folder once per year.
      const processedFolderId = await ensureFolder(client, processedFolderName, year.id)
      const folders: BankYearFolders = {
        bankFolderId: bank.id,
        yearFolderId: year.id,
        processedFolderId,
      }

      for (const file of pending) {
        try {
          const content = await downloadFileContent(client, file.id)
          // Local write uses the OS separator so the dump is correct on every platform.
          const targetPath = join(dumpBaseDir, bank.name, year.name, file.name)
          await mkdir(dirname(targetPath), { recursive: true })
          await writeFile(targetPath, content)
          // The move happens only after the local copy is written successfully.
          await moveFileToProcessed(client, file.id, folders)
          processed.push({
            bank: bank.name,
            year: year.name,
            fileId: file.id,
            name: file.name,
            // Logical relative path for the client: always '/', never the OS separator.
            path: posix.join(bank.name, year.name, file.name),
          })
        } catch (error) {
          failed.push({
            bank: bank.name,
            year: year.name,
            fileId: file.id,
            name: file.name,
            error: describeError(error),
          })
        }
      }
    }
  }

  return {
    processedCount: processed.length,
    failedCount: failed.length,
    processed,
    failed,
  }
}

/**
 * Turns a caught error into a safe message. Drive failures arrive already wrapped
 * as a sanitized AppError (DriveConnectionError) with a fixed message; local
 * filesystem errors are plain Errors whose message is a local path, never a
 * secret. Anything else is reported generically.
 */
function describeError(error: unknown): string {
  if (error instanceof AppError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error'
}
