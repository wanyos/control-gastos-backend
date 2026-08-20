import type { AccountType } from '../../generated/prisma/client.js'

import type { ParsedStatement, UnparsedRow } from '../../lib/parsed-statement.js'
import type { ProductImportResult } from '../investments/investments.types.js'

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

/**
 * What a PRODUCT file left in the database (feature 26). Its own shape, not a
 * nullable branch of the statement one: a product file brings no movement, no
 * account and no unread row, so every counter of a statement would be a zero
 * that means nothing. `created` is what tells "it has been stored" apart from
 * "the same thing has been stored again" (R13).
 */
export interface ProductResult {
  status: 'imported' | 'failed'
  product: ProductImportResult['product'] | null
  snapshot: ProductImportResult['snapshot'] | null
  error?: FileErrorReport
}

/** A product file the importer did try to import, whether it succeeded or not. */
export interface AttemptedProductFileReport extends FileReportBase, ProductResult {}

export type ImportedFileReport =
  SkippedFileReport | AttemptedFileReport | AttemptedProductFileReport

/** Outcome of one import run: the totals plus the report of every file seen. */
export interface ImportRunResult {
  importedCount: number
  duplicateCount: number
  unparsedCount: number
  failedCount: number
  skippedCount: number
  files: ImportedFileReport[]
}

/**
 * The minimum a file report needs for the totals of a run to be computed
 * (feature 25). It is structural so the two ways in -- Drive and the local
 * copies -- share the arithmetic without sharing the shape: a local file has no
 * Drive id, and a skipped one carries no counters at all.
 */
export interface FileCounts {
  status: 'imported' | 'failed' | 'skipped'
  imported?: number
  duplicates?: number
  unparsedCount?: number
}

/**
 * What happened to ONE file once parsed, mapped and stored, with Drive left
 * out (feature 25). It is the part of the report both ways in share; the Drive
 * way adds the file id and whether it moved.
 */
export interface StatementResult {
  status: 'imported' | 'failed'
  account: AccountReport | null
  imported: number
  duplicates: number
  unparsedCount: number
  unparsedRows: UnparsedRow[]
  error?: FileErrorReport
}

/**
 * Where a local copy lives: bank folder, year and file name. There is NO Drive
 * id here, on purpose -- the local copy is identified by its path, and this way
 * in never talks to Drive.
 */
interface LocalFileReportBase {
  bank: string
  year: string
  name: string
  /**
   * ALWAYS `false`, and typed as the literal so the compiler says it too: the
   * local reimport moves nothing and deletes nothing in Drive (feature 25).
   */
  movedToProcessed: false
}

/** No parser for the bank of the folder, or an extension that parser does not read. */
export interface SkippedLocalFileReport extends LocalFileReportBase {
  status: 'skipped'
  reason: string
}

/** A local copy the importer did try to import, whether it succeeded or not. */
export interface AttemptedLocalFileReport extends LocalFileReportBase, StatementResult {}

/** A local product copy the importer did try to import (feature 26). */
export interface AttemptedLocalProductFileReport extends LocalFileReportBase, ProductResult {}

export type LocalFileReport =
  SkippedLocalFileReport | AttemptedLocalFileReport | AttemptedLocalProductFileReport

/** Outcome of one local reimport run: the totals plus the report of every copy seen. */
export interface LocalImportRunResult {
  importedCount: number
  duplicateCount: number
  unparsedCount: number
  failedCount: number
  skippedCount: number
  files: LocalFileReport[]
}
