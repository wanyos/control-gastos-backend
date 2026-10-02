import type { AppDriveClient } from '../../lib/drive.js'
import { listBankFolders, listPendingFiles, listYearFolders } from '../../lib/drive-structure.js'
import type { DetectionResult, PendingBank, PendingYear } from './ingestion.types.js'

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
