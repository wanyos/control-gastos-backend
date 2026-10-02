/** A single pending file reported by the detection endpoint. */
export interface PendingFileInfo {
  fileId: string
  name: string
}

/** Pending files grouped by year within a bank. */
export interface PendingYear {
  year: string
  pendingCount: number
  pending: PendingFileInfo[]
}

/** Pending files grouped by bank. */
export interface PendingBank {
  bank: string
  years: PendingYear[]
}

/**
 * Result of the non-destructive detection: how many files are pending across all
 * bank/year folders and where they are. Only banks/years with at least one
 * pending file are listed.
 */
export interface DetectionResult {
  totalPending: number
  banks: PendingBank[]
}
