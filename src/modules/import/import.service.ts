import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import type { Prisma } from '../../generated/prisma/client.js'

import { AppError, MissingAccountDataError } from '../../errors/app-error.js'
import type { AppDriveClient } from '../../lib/drive.js'
import {
  downloadFileContent,
  ensureFolder,
  listBankFolders,
  listPendingFiles,
  listYearFolders,
  moveFileToProcessed,
  normalizeBankName,
  processedFolderName,
} from '../../lib/drive-structure.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { findOrCreateAccountFromMetadata } from '../accounts/accounts.service.js'
import { deriveMovementTypeFromAmount } from '../movements/movements.service.js'
import type {
  AccountReport,
  AttemptedFileReport,
  BankParserAdapter,
  BankParserRegistry,
  FileErrorReport,
  ImportRunResult,
  ImportedFileReport,
} from './import.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference, like the other modules do.
 */
export function importDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** Everything one import run needs; nothing is read from the environment here. */
export interface ImportPendingDeps {
  client: AppDriveClient
  prisma: AppPrismaClient
  rootFolderId: string
  /** Where the raw copy of each downloaded file is written before parsing. */
  rawCopyBaseDir: string
  parsers: BankParserRegistry
}

/** The account a file's movements belong to, and how it was obtained. */
export interface AccountResolution {
  account: {
    id: number
    iban: string
    bank: string
    alias: string
    type: AccountReport['type']
  }
  created: boolean
  appliedDefaults: { alias: boolean; type: boolean }
}

/**
 * Maps the parsed movements of a file to the rows of its account, applying the
 * table of `specs/data-model/design.md` §9. Pure: no database, no clock, no id.
 *
 * Two deliberate details: the amount travels as a STRING (`toFixed(2)`) so no
 * floating point ever reaches a `Decimal(10,2)`, and the dates are built with an
 * explicit `T00:00:00.000Z` because these are date-only columns and a local
 * `new Date('YYYY-MM-DD')` would shift the day in a negative timezone.
 */
export function toMovementRows(
  movements: ParsedMovement[],
  accountId: number,
): Prisma.MovementCreateManyInput[] {
  return movements.map((movement) => ({
    accountId,
    type: deriveMovementTypeFromAmount(movement.amount),
    bookingDate: toDateOnly(movement.bookingDate),
    valueDate: toDateOnly(movement.valueDate),
    amount: Math.abs(movement.amount).toFixed(2),
    description: movement.description,
    // A balance the file does not carry stays null: it is never invented (R12).
    balanceAfter: movement.balance === null ? null : movement.balance.toFixed(2),
    currency: movement.currency === '' ? 'EUR' : movement.currency,
    daySequence: movement.daySequence,
    origin: 'imported',
    status: 'pending_review',
    // The importer does not enrich: categorizing, pairing transfers and marking
    // an investment contribution are later features (R16).
    categoryId: null,
    paymentMethod: null,
    transferId: null,
    productId: null,
    note: null,
  }))
}

function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

/**
 * Resolves the account the movements of a statement belong to (R4, R5, R6, R19).
 *
 * With an IBAN in the file it delegates to `findOrCreateAccountFromMetadata`,
 * the ONLY account-creating path of the importer, which already demands iban +
 * bank. Without an IBAN nothing is ever created: the file lands on the single
 * account already registered for that bank, and zero or several accounts is a
 * `MissingAccountDataError` asking the human to write the IBAN once.
 */
export async function resolveAccount(
  prisma: AppPrismaClient,
  statement: ParsedStatement,
  bankSlug: string,
): Promise<AccountResolution> {
  const iban = statement.accountIban?.trim() ?? ''

  if (iban.length > 0) {
    return findOrCreateAccountFromMetadata(prisma, { iban, bank: statement.bank || bankSlug })
  }

  const accounts = await prisma.account.findMany({
    where: { bank: { equals: bankSlug, mode: 'insensitive' } },
    orderBy: { id: 'asc' },
  })

  if (accounts.length === 1) {
    return { account: accounts[0], created: false, appliedDefaults: { alias: false, type: false } }
  }

  throw new MissingAccountDataError(
    accounts.length === 0
      ? `No iban in the file and no account registered for bank ${bankSlug}: ` +
          'add a line "iban;<IBAN>" at the top of one of its files, once.'
      : `No iban in the file and ${accounts.length} accounts registered for bank ${bankSlug}: ` +
          'add the "iban;<IBAN>" line so the file says which one it is.',
  )
}

/**
 * Stores the rows of one file in a single operation (R7, R8, R13).
 *
 * The duplicates are dropped by the database, not by a previous query:
 * `skipDuplicates` becomes `ON CONFLICT DO NOTHING` with no target, which is
 * what covers the PARTIAL unique index `Movement_imported_dedup_key` that
 * Prisma cannot express. Two identical lines of the same day are NOT duplicates:
 * their `daySequence` differs and both are stored.
 */
export async function persistMovements(
  prisma: AppPrismaClient,
  rows: Prisma.MovementCreateManyInput[],
): Promise<{ imported: number; duplicates: number }> {
  if (rows.length === 0) {
    return { imported: 0, duplicates: 0 }
  }
  const { count } = await prisma.movement.createMany({ data: rows, skipDuplicates: true })
  return { imported: count, duplicates: rows.length - count }
}

/**
 * Imports every pending file of every bank/year, one by one:
 * download → raw local copy → parse → resolve account → store → move to
 * `procesados/`. The move is a CONSEQUENCE of storing: it never happens before
 * (R9) and never happens at all when a step fails (R10), so a failed file stays
 * pending in Drive and can be retried.
 *
 * A per-file failure is isolated and reported, never stops the rest and never
 * changes the HTTP status. A file no parser can read is reported as `skipped`,
 * neither imported nor moved (R14). The banks, years and files arrive already
 * ordered by name from `drive-structure`; the order is not touched.
 */
export async function importPending(deps: ImportPendingDeps): Promise<ImportRunResult> {
  const { client, prisma, rootFolderId, rawCopyBaseDir, parsers } = deps
  const files: ImportedFileReport[] = []

  for (const bank of await listBankFolders(client, rootFolderId)) {
    const bankSlug = normalizeBankName(bank.name)
    for (const year of await listYearFolders(client, bank.id)) {
      const pending = await listPendingFiles(client, year.id)
      if (pending.length === 0) {
        continue
      }
      // Resolved at most once per year, and only when a file actually reaches
      // the move: a year whose files are all skipped creates no folder.
      let processedFolderId: string | null = null
      const resolveProcessedFolder = async (): Promise<string> => {
        processedFolderId ??= await ensureFolder(client, processedFolderName, year.id)
        return processedFolderId
      }

      for (const file of pending) {
        const location = { bank: bank.name, year: year.name, fileId: file.id, name: file.name }
        const adapter = selectAdapter(parsers, bankSlug, file.name)

        if ('reason' in adapter) {
          files.push({
            ...location,
            status: 'skipped',
            reason: adapter.reason,
            movedToProcessed: false,
          })
          continue
        }

        files.push(
          await importFile({
            client,
            prisma,
            rawCopyBaseDir,
            adapter: adapter.adapter,
            bankSlug,
            location,
            yearFolderId: year.id,
            bankFolderId: bank.id,
            resolveProcessedFolder,
          }),
        )
      }
    }
  }

  return { ...totals(files), files }
}

interface FileLocation {
  bank: string
  year: string
  fileId: string
  name: string
}

interface ImportFileDeps {
  client: AppDriveClient
  prisma: AppPrismaClient
  rawCopyBaseDir: string
  adapter: BankParserAdapter
  bankSlug: string
  location: FileLocation
  yearFolderId: string
  bankFolderId: string
  resolveProcessedFolder: () => Promise<string>
}

async function importFile(deps: ImportFileDeps): Promise<AttemptedFileReport> {
  const { client, prisma, location } = deps
  const report: AttemptedFileReport = {
    ...location,
    status: 'failed',
    account: null,
    imported: 0,
    duplicates: 0,
    unparsedCount: 0,
    unparsedRows: [],
    movedToProcessed: false,
  }

  try {
    const content = await downloadFileContent(client, location.fileId)
    // The raw copy is kept (and overwritten, so it stays idempotent) because it
    // is what allows re-parsing a file without downloading it from Drive again.
    const targetPath = join(deps.rawCopyBaseDir, location.bank, location.year, location.name)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, content)

    const statement = await deps.adapter.parse(content)
    report.unparsedRows = statement.unparsedRows
    report.unparsedCount = statement.unparsedRows.length

    const resolution = await resolveAccount(prisma, statement, deps.bankSlug)
    report.account = toAccountReport(resolution)

    const rows = toMovementRows(statement.movements, resolution.account.id)
    const stored = await persistMovements(prisma, rows)
    report.imported = stored.imported
    report.duplicates = stored.duplicates

    // Only now, with every movement of the file stored, the original moves.
    await moveFileToProcessed(client, location.fileId, {
      bankFolderId: deps.bankFolderId,
      yearFolderId: deps.yearFolderId,
      processedFolderId: await deps.resolveProcessedFolder(),
    })
    report.movedToProcessed = true
    report.status = 'imported'
    return report
  } catch (error) {
    report.status = 'failed'
    report.error = describeError(error)
    return report
  }
}

function toAccountReport(resolution: AccountResolution): AccountReport {
  return {
    id: resolution.account.id,
    iban: resolution.account.iban,
    bank: resolution.account.bank,
    alias: resolution.account.alias,
    type: resolution.account.type,
    created: resolution.created,
    appliedDefaults: resolution.appliedDefaults,
  }
}

/**
 * Picks the parser of a file by the bank of its FOLDER (never by the content:
 * the folder is what says the bank, ADR-009) and by its extension.
 */
function selectAdapter(
  parsers: BankParserRegistry,
  bankSlug: string,
  fileName: string,
): { adapter: BankParserAdapter } | { reason: string } {
  const adapter = parsers.find((candidate) => candidate.bank === bankSlug)
  if (!adapter) {
    return { reason: `no hay parser para el banco ${bankSlug}` }
  }
  const extension = extname(fileName).toLowerCase()
  if (!adapter.extensions.includes(extension)) {
    return { reason: `extensión no soportada por el parser de ${bankSlug}` }
  }
  return { adapter }
}

function totals(files: ImportedFileReport[]) {
  const attempted = files.filter((file): file is AttemptedFileReport => file.status !== 'skipped')
  return {
    importedCount: sum(attempted.map((file) => file.imported)),
    duplicateCount: sum(attempted.map((file) => file.duplicates)),
    unparsedCount: sum(attempted.map((file) => file.unparsedCount)),
    failedCount: files.filter((file) => file.status === 'failed').length,
    skippedCount: files.filter((file) => file.status === 'skipped').length,
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/**
 * Turns a caught error into the stable code plus a safe message. Drive failures
 * arrive already wrapped as a sanitized AppError; anything else is reported
 * generically so no internal detail (or token) can leak into the report.
 */
function describeError(error: unknown): FileErrorReport {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_SERVER_ERROR', message: error.message }
  }
  return { code: 'INTERNAL_SERVER_ERROR', message: 'Unknown error' }
}
