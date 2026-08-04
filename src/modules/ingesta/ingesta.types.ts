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

/** A file successfully downloaded, copied locally and moved to `procesados`. */
export interface ProcessedFile {
  bank: string
  year: string
  fileId: string
  name: string
  /** Path of the local copy relative to the dump base dir (`<bank>/<year>/<name>`). */
  path: string
}

/** A file whose read or copy failed; its original was NOT moved to `procesados`. */
export interface FailedFile {
  bank: string
  year: string
  fileId: string
  name: string
  /** Sanitized error message (never leaks tokens or secrets). */
  error: string
}

/** Outcome of the explicit process action. */
export interface ProcessResult {
  processedCount: number
  failedCount: number
  processed: ProcessedFile[]
  failed: FailedFile[]
}
