import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'

import type { Prisma } from '../../generated/prisma/client.js'

import {
  AppError,
  EmptyStatementError,
  MissingAccountDataError,
  UnreadableStatementError,
} from '../../errors/app-error.js'
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
import { normalizeIban } from '../../lib/iban.js'
import type { ParsedMovement, ParsedStatement } from '../../lib/parsed-statement.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { findOrCreateAccountFromMetadata } from '../accounts/accounts.service.js'
import { applyCategoryRules } from '../category-rules/category-rules.service.js'
import { persistProductSnapshot } from '../investments/investments.service.js'
import type {
  ProductParserAdapter,
  ProductParserRegistry,
} from '../investments/investments.types.js'
import {
  deriveMovementTypeFromAmount,
  isAfter,
  readAnchor,
} from '../movements/movements.service.js'
import type { BalanceAnchor, RecencyPoint } from '../movements/movements.types.js'
import { detectTransfers } from '../transfers/transfers.service.js'
import { findPerLineMismatches, findStatementBalanceMismatch } from './import.balance.service.js'
import type {
  AccountReport,
  BankParserAdapter,
  BankParserRegistry,
  FileCounts,
  FileErrorReport,
  ImportRunResult,
  ImportedFileReport,
  ProductResult,
  StatementResult,
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
  /**
   * SECOND registry (feature 26): the parsers of PRODUCT files. It is consulted
   * only when no statement parser reads the file, and it is optional so every
   * caller that predates feature 26 keeps behaving exactly as it did.
   */
  productParsers?: ProductParserRegistry
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
 * table of `specs/08-data-model/design.md` §9. Pure: no database, no clock, no id.
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
    // The importer does not enrich a row: a movement is born unlinked and the
    // transfer detection (feature 40) pairs it AFTER the file loop; categorizing
    // and marking an investment contribution are later features (R16).
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
  // Normalized with the SINGLE normalizer of `lib/iban.ts` (feature 21). The
  // parser already returns it normalized; doing it again here is what keeps the
  // seam honest if a parser ever forgets, and it costs nothing.
  const iban = normalizeIban(statement.accountIban ?? '')

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
): Promise<{ imported: number; duplicates: number; balancesFilled: number }> {
  if (rows.length === 0) {
    return { imported: 0, duplicates: 0, balancesFilled: 0 }
  }
  const { count } = await prisma.movement.createMany({ data: rows, skipDuplicates: true })
  const duplicates = rows.length - count
  // Only the rows the database refused are candidates for the backfill: with no
  // duplicate at all, every row of the file was just written with the balance it
  // carried, so there is nothing to fill and not one query is made (R12).
  const balancesFilled = duplicates === 0 ? 0 : await backfillMissingBalances(prisma, rows)
  return { imported: count, duplicates, balancesFilled }
}

/**
 * Fills the `balanceAfter` of the rows that ALREADY exist with it at NULL, with
 * the balance the file brings for them (R12).
 *
 * It NEVER overwrites a stored one: the `balanceAfter: null` condition travels
 * in the WHERE, not in a previous `if`, so a row whose balance is already there
 * is not even read, let alone written (R13). Discrepancies between the file and
 * the database are NOT reconciled here: that is feature 32.
 *
 * A row is identified by the very same columns the partial unique index
 * `Movement_imported_dedup_key` uses to deduplicate, so "the same row" means the
 * same thing in the two places. Rows the file brings with no balance are skipped
 * outright: there is nothing to fill them with.
 */
export async function backfillMissingBalances(
  prisma: AppPrismaClient,
  rows: Prisma.MovementCreateManyInput[],
): Promise<number> {
  const withBalance = rows.filter(
    (row) => row.balanceAfter !== null && row.balanceAfter !== undefined,
  )
  if (withBalance.length === 0) {
    return 0
  }

  let filled = 0
  for (const row of withBalance) {
    const { count } = await prisma.movement.updateMany({
      where: {
        accountId: row.accountId,
        bookingDate: row.bookingDate,
        type: row.type,
        amount: row.amount,
        description: row.description,
        daySequence: row.daySequence ?? null,
        origin: 'imported',
        balanceAfter: null,
      },
      data: { balanceAfter: row.balanceAfter },
    })
    filled += count
  }
  return filled
}

/**
 * The anchor ONE file offers, or `null` when it offers none (R1, R2, R4, R5).
 * Pure: no database, no clock. The order of the branches is the whole decision:
 *
 *  1. The preamble balance (`accountBalance`) wins, because it is the balance of
 *     the ACCOUNT and outranks the one of a single line. Its date is the one of
 *     the MOST RECENT movement of the file: the human writes that line meaning
 *     "the balance after the last movement of this file", confirmed 2026-08-25.
 *  2. Otherwise, the per-line balance of the most recent line that carries one,
 *     with its own date. It is how a bank that writes no preamble but a
 *     balance on every line gets anchored (R2).
 *  3. Otherwise `null`: the file is imported all the same (R5).
 *
 * The comparison is `!== null`, never truthiness: a preamble of `0` is a REAL
 * balance and must anchor (R4). An `if (statement.accountBalance)` is the bug.
 */
export function deriveAnchorFromStatement(statement: ParsedStatement): BalanceAnchor | null {
  const mostRecent = mostRecentMovement(statement.movements)
  if (mostRecent === null) {
    return null
  }

  if (statement.accountBalance !== null) {
    return toAnchor(statement.accountBalance, mostRecent)
  }

  const withBalance = mostRecentMovement(
    statement.movements.filter((movement) => movement.balance !== null),
  )
  if (withBalance === null || withBalance.balance === null) {
    return null
  }
  return toAnchor(withBalance.balance, withBalance)
}

/** The most recent movement of a file by `(bookingDate, daySequence)`. */
function mostRecentMovement(movements: ParsedMovement[]): ParsedMovement | null {
  let best: ParsedMovement | null = null
  for (const movement of movements) {
    if (best === null || isAfter(toRecencyPoint(movement), toRecencyPoint(best))) {
      best = movement
    }
  }
  return best
}

/**
 * The recency of a parsed movement, in the shape the SINGLE comparator of
 * `movements.service` understands: the order must not be able to diverge between
 * the importer and the balance formula.
 */
function toRecencyPoint(movement: ParsedMovement): RecencyPoint {
  return { bookingDate: toDateOnly(movement.bookingDate), daySequence: movement.daySequence }
}

/** The amount travels as a STRING, so no floating point reaches a Decimal(10,2). */
function toAnchor(amount: number, at: ParsedMovement): BalanceAnchor {
  return {
    amount: amount.toFixed(2),
    bookingDate: toDateOnly(at.bookingDate),
    daySequence: at.daySequence,
  }
}

/**
 * Anchors the account ONLY if it was not anchored yet (R3). Returns whether this
 * call is the one that anchored it.
 *
 * The `balanceAnchor: null` condition travels in the WHERE, not in a previous
 * `if`: an `if` would be a race, and two imports running at once could each read
 * "unanchored" and write a different amount. The WHERE cannot, with no
 * transaction needed.
 *
 * The amount and the date are written in the SAME statement because the database
 * demands it (`CHECK Account_balance_anchor_pair`): anchoring in two steps is
 * rejected. `balanceAnchorDaySequence` may stay null on its own.
 */
export async function anchorAccountIfMissing(
  prisma: AppPrismaClient,
  accountId: number,
  anchor: BalanceAnchor,
): Promise<boolean> {
  const { count } = await prisma.account.updateMany({
    where: { id: accountId, balanceAnchor: null },
    data: {
      balanceAnchor: anchor.amount,
      balanceAnchorDate: anchor.bookingDate,
      balanceAnchorDaySequence: anchor.daySequence,
    },
  })
  return count > 0
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
  const productParsers = deps.productParsers ?? []
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
        const drive = {
          client,
          rawCopyBaseDir,
          location,
          yearFolderId: year.id,
          bankFolderId: bank.id,
          resolveProcessedFolder,
        }
        const adapter = selectAdapter(parsers, bankSlug, file.name)

        if (!('reason' in adapter)) {
          files.push(
            await importDriveFile({
              ...drive,
              empty: emptyStatementResult(),
              store: (content) =>
                importStatement({ prisma, content, adapter: adapter.adapter, bankSlug }),
            }),
          )
          continue
        }

        // No statement parser reads it: it may still be a PRODUCT file, the
        // second registry of feature 26. The order is fixed — statements first —
        // and a guardian keeps the two registries from claiming the same
        // extension for the same bank, so it can never bite.
        const productAdapter = selectProductAdapter(productParsers, bankSlug, file.name)

        if (!('reason' in productAdapter)) {
          files.push(
            await importDriveFile({
              ...drive,
              empty: emptyProductResult(),
              store: (content) =>
                importProductFile({
                  prisma,
                  content,
                  adapter: productAdapter.adapter,
                  bankSlug,
                  fileName: file.name,
                }),
            }),
          )
          continue
        }

        // Neither registry reads it. The reason reported is the STATEMENT one,
        // exactly as before feature 26: it is the contract every other bank
        // already had, and changing it would be a silent breaking change.
        files.push({
          ...location,
          status: 'skipped',
          reason: adapter.reason,
          movedToProcessed: false,
        })
      }
    }
  }

  // After the whole file loop (feature 40, R1): the movements are already
  // stored, so a detection failure can lose nothing -- it travels in
  // `transfers.error` and the per-file reports stand untouched (R15).
  // The categorization run goes AFTER the detection (feature 43, R12): the
  // order matters little -- it never reads `transferId` -- but it is fixed so
  // the report is stable, and its failure travels in `categorization.error`.
  const transfers = await detectTransfers(prisma)
  return { ...totals(files), files, transfers, categorization: await applyCategoryRules(prisma) }
}

interface FileLocation {
  bank: string
  year: string
  fileId: string
  name: string
}

/** What every attempted outcome has, whatever kind of file produced it. */
interface AttemptOutcome {
  status: 'imported' | 'failed'
  error?: FileErrorReport
}

interface DriveFileDeps<T extends AttemptOutcome> {
  client: AppDriveClient
  rawCopyBaseDir: string
  location: FileLocation
  yearFolderId: string
  bankFolderId: string
  resolveProcessedFolder: () => Promise<string>
  /** The report of a file nothing has happened to yet: failed until proven otherwise. */
  empty: T
  /** Everything that is NOT Drive: parse, and store whatever the file means. */
  store: (content: Buffer) => Promise<T>
}

/**
 * The Drive half of importing ONE file: download, keep the raw copy, hand the
 * bytes to `store`, and move the original to `procesados/` ONLY if that
 * succeeded. It is generic over what a file means (a statement or, since feature
 * 26, a product photo) precisely so the rule of ADR-025 -- the move is a
 * CONSEQUENCE of storing, never the other way round -- lives in ONE place and
 * cannot drift between the two kinds of file.
 */
async function importDriveFile<T extends AttemptOutcome>(
  deps: DriveFileDeps<T>,
): Promise<T & FileLocation & { movedToProcessed: boolean }> {
  const { client, location } = deps
  const report = {
    ...location,
    ...deps.empty,
    movedToProcessed: false,
  } as T & FileLocation & { movedToProcessed: boolean }

  try {
    const content = await downloadFileContent(client, location.fileId)
    // The raw copy is kept (and overwritten, so it stays idempotent) because it
    // is what allows re-parsing a file without downloading it from Drive again
    // -- and, since feature 25, re-IMPORTING it without Drive at all.
    const targetPath = join(deps.rawCopyBaseDir, location.bank, location.year, location.name)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, content)

    // Everything that is not Drive happens in the shared core, so this way in
    // and the local one cannot drift apart on what a file means.
    const stored = await deps.store(content)
    Object.assign(report, stored)
    if (stored.status === 'failed') {
      return report
    }

    // Only now, with everything the file carried stored, the original moves.
    await moveFileToProcessed(client, location.fileId, {
      bankFolderId: deps.bankFolderId,
      yearFolderId: deps.yearFolderId,
      processedFolderId: await deps.resolveProcessedFolder(),
    })
    report.movedToProcessed = true
    return report
  } catch (error) {
    report.status = 'failed'
    report.error = describeError(error)
    return report
  }
}

/** The report of a file nothing has happened to yet: failed until proven otherwise. */
function emptyStatementResult(): StatementResult {
  return {
    status: 'failed',
    account: null,
    imported: 0,
    duplicates: 0,
    unparsedCount: 0,
    unparsedRows: [],
    anchored: false,
    balancesFilled: 0,
    balanceMismatches: [],
  }
}

/** The report of a product file nothing has happened to yet. */
function emptyProductResult(): ProductResult {
  return { status: 'failed', product: null, snapshot: null }
}

/** What one PRODUCT file needs to become a product and its photo. No Drive here. */
export interface ImportProductFileDeps {
  prisma: AppPrismaClient
  adapter: ProductParserAdapter
  /** Slug of the bank the file belongs to: its FOLDER says it, never its content. */
  bankSlug: string
  /** Only for the parser's messages: the name never decides a value of the file. */
  fileName: string
  content: Buffer
}

/**
 * The core of importing one PRODUCT file (feature 26): parse, then persist the
 * product and the photo of its month in ONE transaction.
 *
 * Since feature 29 it carries FOUR more kinds of product without one line of its
 * own changing: which writer a file needs is decided by `persistProductSnapshot`
 * from the `type` the file declares, so this function still knows only "parse,
 * store, report".
 *
 * The WHOLE validation of the parser -- the five amounts adding up included --
 * happens inside `adapter.parse`, before a single row is touched. That is what
 * makes "a file that does not add up leaves no trace" true and checkable: the
 * throw happens before `persistProductSnapshot` is even called, and what that
 * function writes is one transaction that rolls back as a whole.
 *
 * It never throws: a per-file failure comes back as `status: 'failed'` plus the
 * WHOLE reason of the parser, so the human can fix the file and upload it again.
 */
export async function importProductFile(deps: ImportProductFileDeps): Promise<ProductResult> {
  const result = emptyProductResult()

  try {
    const parsed = deps.adapter.parse(deps.fileName, deps.content)
    // The bank of a file is the one of its FOLDER (ADR-009), never the one its
    // contents claim: the parser's own slug is overwritten here on purpose.
    const stored = await persistProductSnapshot(deps.prisma, { ...parsed, bank: deps.bankSlug })
    result.product = stored.product
    result.snapshot = stored.snapshot
    result.status = 'imported'
    return result
  } catch (error) {
    result.error = describeError(error)
    return result
  }
}

/** What one file needs to become rows of its account. No Drive in here. */
export interface ImportStatementDeps {
  prisma: AppPrismaClient
  adapter: BankParserAdapter
  /** Slug of the bank the file belongs to: its FOLDER says it, never its content. */
  bankSlug: string
  content: Buffer
}

/**
 * The core of an import with Drive taken out (feature 25): parse, resolve the
 * account, map and store. Shared by the two ways in -- the pending files of
 * Drive and the local copies of `var/drive-read/` -- so what a file means is
 * decided in ONE place and the two cannot drift apart.
 *
 * It never throws: a per-file failure comes back as `status: 'failed'` plus its
 * sanitized error, exactly as it travelled inside the report before. The rows
 * the parser could not read are reported even when the file fails afterwards.
 */
export async function importStatement(deps: ImportStatementDeps): Promise<StatementResult> {
  const result = emptyStatementResult()

  try {
    const statement = await deps.adapter.parse(deps.content)
    result.unparsedRows = statement.unparsedRows
    result.unparsedCount = statement.unparsedRows.length

    assertTheFileBringsMovements(statement)

    const resolution = await resolveAccount(deps.prisma, statement, deps.bankSlug)
    const account = toAccountReport(resolution)
    result.account = account

    const rows = toMovementRows(statement.movements, resolution.account.id)
    const stored = await persistMovements(deps.prisma, rows)
    result.imported = stored.imported
    result.duplicates = stored.duplicates
    result.balancesFilled = stored.balancesFilled

    // 🔴 READ BEFORE ANCHORING (feature 32, R4), and this line order is the whole
    // check: it is the ONLY thing that tells "the account was already anchored"
    // from "this very file has just anchored it". Move it below
    // `anchorAccountIfMissing` and the preamble check compares the file against
    // itself, always finds nothing, and the feature is dead while looking alive.
    const storedAnchor = await readStoredAnchor(deps.prisma, resolution.account.id)

    // AFTER storing and BEFORE calling the file imported (feature 31): the date
    // of the anchor comes from the movements of this very file, and a file that
    // fails must leave the account exactly as it found it.
    const anchor = deriveAnchorFromStatement(statement)
    if (anchor !== null) {
      result.anchored = await anchorAccountIfMissing(deps.prisma, resolution.account.id, anchor)
    }
    account.balanceAnchor = await readAccountAnchor(deps.prisma, resolution.account.id)

    // The two checks of feature 32. They change NOTHING -- not the anchor, not a
    // balance, not a row -- and a descuadre does not fail the file (R7, R8): what
    // they find only travels in the report of this file.
    const perLine = findPerLineMismatches(statement, resolution.account)
    const statementBalance = await findStatementBalanceMismatch({
      prisma: deps.prisma,
      statement,
      account: resolution.account,
      anchor: storedAnchor,
    })
    result.balanceMismatches = [
      ...perLine,
      ...(statementBalance === null ? [] : [statementBalance]),
    ]

    result.status = 'imported'
    return result
  } catch (error) {
    result.status = 'failed'
    result.error = describeError(error)
    return result
  }
}

/**
 * Where feature 25 cuts the "zero movements" case, which is NOT one case but
 * three (written out in progress/implementations/reimport-from-local-copy.md):
 *
 *  1. No movement line and nothing left unread -> `EMPTY_STATEMENT`. The file is
 *     reported as failed and does NOT move: this is the silent failure of the
 *     diagnosis (2026-08-20, section 1.4), the one that left a whole bank out of
 *     the database while the report said the file had been imported.
 *  2. No movement line but rows the parser could not read -> `ALL_ROWS_UNPARSED`.
 *     Also failed and also not moved, with its own code: a full file nobody can
 *     read is a format that changed, not a month with no activity.
 *  3. Movement lines that ALL turn out to be duplicates -> nothing wrong here.
 *     Every row of the file IS in the database, which is what a healthy
 *     re-import looks like: `imported: 0, duplicates: n`, and the file moves,
 *     exactly as it did before (ADR-015, decision 3).
 *
 * As one rule: a file reaches `procesados/` only when at least one of its rows
 * is accounted for in the database, whether it was stored now or already was.
 * The check runs BEFORE the account is resolved, so a file that brings nothing
 * cannot create an account either.
 */
function assertTheFileBringsMovements(statement: ParsedStatement): void {
  if (statement.movements.length > 0) {
    return
  }
  if (statement.unparsedRows.length > 0) {
    throw new UnreadableStatementError(
      `ninguna de las ${statement.unparsedRows.length} líneas del archivo se ha podido ` +
        'interpretar: no se ha guardado nada y el archivo NO se ha movido a procesados/. ' +
        'Suele significar que el formato del archivo ha cambiado; el motivo de cada línea ' +
        'está en unparsedRows.',
    )
  }
  throw new EmptyStatementError(
    'el archivo se ha leído sin un solo error y no trae ni una línea de movimiento: no ' +
      'se ha guardado nada y el archivo NO se ha movido a procesados/, así que puedes ' +
      'reintentarlo. Comprueba que descargaste el extracto del periodo que querías.',
  )
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
    // Filled in once the anchoring has been attempted: a freshly resolved
    // account does not know yet whether this file is the one that anchors it.
    balanceAnchor: null,
  }
}

/**
 * The anchor the account holds right now, as a decimal string. Read AFTER the
 * anchoring attempt so the report says what is true of the account, not what
 * this file wished: an already anchored account reports the anchor it kept (R3).
 */
async function readAccountAnchor(
  prisma: AppPrismaClient,
  accountId: number,
): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { balanceAnchor: true },
  })
  return account?.balanceAnchor?.toFixed(2) ?? null
}

/**
 * The anchor the account holds BEFORE this file tries to anchor it (feature 32,
 * R4), in the shape the checks understand -- amount plus the point in history it
 * belongs to -- built by the SINGLE reader of those three columns, `readAnchor`.
 *
 * It is NOT `readAccountAnchor`: that one is read AFTER the anchoring, returns
 * only the amount, and is what the report says the account ended up with. This
 * one is read BEFORE and is what makes the preamble check check anything at all.
 */
async function readStoredAnchor(
  prisma: AppPrismaClient,
  accountId: number,
): Promise<BalanceAnchor | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { balanceAnchor: true, balanceAnchorDate: true, balanceAnchorDaySequence: true },
  })
  return account === null ? null : readAnchor(account)
}

/**
 * Picks the parser of a file by the bank of its FOLDER (never by the content:
 * the folder is what says the bank, ADR-009) and by its extension. Exported
 * since feature 25: the local way in chooses the parser with the same rule.
 */
export function selectAdapter(
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

/**
 * Picks the PRODUCT parser of a file, with the very same rule as `selectAdapter`
 * (feature 26): the folder says the bank, the extension says the parser. It is a
 * separate registry and not a flag on the first one, so the choice between "a
 * statement" and "a product photo" is made once, here, instead of at every use.
 */
export function selectProductAdapter(
  parsers: ProductParserRegistry,
  bankSlug: string,
  fileName: string,
): { adapter: ProductParserAdapter } | { reason: string } {
  const adapter = parsers.find((candidate) => candidate.bank === bankSlug)
  if (!adapter) {
    return { reason: `no hay parser de productos para el banco ${bankSlug}` }
  }
  const extension = extname(fileName).toLowerCase()
  if (!adapter.extensions.includes(extension)) {
    return { reason: `extensión no soportada por el parser de productos de ${bankSlug}` }
  }
  return { adapter }
}

/**
 * The totals of a run. Structural on purpose (feature 25): the report of a
 * local file has no Drive id, so the two ways in share the arithmetic without
 * sharing the shape. A skipped file counts zero movements, never `undefined`.
 */
export function totals(files: FileCounts[]) {
  return {
    importedCount: sum(files.map((file) => file.imported ?? 0)),
    duplicateCount: sum(files.map((file) => file.duplicates ?? 0)),
    unparsedCount: sum(files.map((file) => file.unparsedCount ?? 0)),
    failedCount: files.filter((file) => file.status === 'failed').length,
    skippedCount: files.filter((file) => file.status === 'skipped').length,
    // Feature 32, R10 and R11: the local way in gains it without one line of its
    // own, because it already shares `importStatement` and this very function.
    balanceMismatchCount: sum(files.map((file) => file.balanceMismatches?.length ?? 0)),
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
