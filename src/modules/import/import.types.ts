import type { AccountType } from '../../generated/prisma/client.js'

import type { ParsedStatement, UnparsedRow } from '../../lib/parsed-statement.js'

/**
 * What the importer needs to know about a bank to read one of its files. The
 * importer knows NO bank: the registry is injected from `src/app.ts` (the
 * composition root), so adding a bank is adding one line there.
 */
export interface BankParserAdapter {
  /** Slug of the bank: the same normalized name as its Drive folder. */
  bank: string
  /** Extensions this parser reads, lowercase and with the dot. */
  extensions: string[]
  parse(content: Buffer): ParsedStatement | Promise<ParsedStatement>
}

export type BankParserRegistry = BankParserAdapter[]

/** The account the movements of a file went to, and how it was obtained. */
export interface AccountReport {
  id: number
  iban: string
  bank: string
  alias: string
  type: AccountType
  /** `true` when this run created it from the IBAN carried by the file. */
  created: boolean
  /** Which values were defaulted, so the report says with what data it was created. */
  appliedDefaults: { alias: boolean; type: boolean }
}

/** The stable error code plus a sanitized message (never a token or a secret). */
export interface FileErrorReport {
  code: string
  message: string
}

interface FileReportBase {
  bank: string
  year: string
  fileId: string
  name: string
  /** A file only ever moves to `procesados/` after its movements are stored. */
  movedToProcessed: boolean
}

/** No parser for the bank, or an extension that parser does not read (R14). */
export interface SkippedFileReport extends FileReportBase {
  status: 'skipped'
  reason: string
}

/** A file the importer did try to import, whether it succeeded or not. */
export interface AttemptedFileReport extends FileReportBase {
  status: 'imported' | 'failed'
  account: AccountReport | null
  imported: number
  duplicates: number
  /** How many rows the parser could not interpret, and which ones (R2, R11). */
  unparsedCount: number
  unparsedRows: UnparsedRow[]
  error?: FileErrorReport
}

export type ImportedFileReport = SkippedFileReport | AttemptedFileReport

/** Outcome of one import run: the totals plus the report of every file seen. */
export interface ImportRunResult {
  importedCount: number
  duplicateCount: number
  unparsedCount: number
  failedCount: number
  skippedCount: number
  files: ImportedFileReport[]
}
