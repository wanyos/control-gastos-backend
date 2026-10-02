import type { Prisma } from '../../generated/prisma/client.js'

import { NotFoundError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  ImportWarningsInput,
  ImportWarningsReport,
  ReviewBalanceMismatchPatch,
  ReviewUnparsedRowPatch,
  SerializedBalanceMismatch,
  SerializedUnparsedRow,
  WarningFileRef,
} from './import.warnings.types.js'

/**
 * THE SINGLE WRITER of the two warning tables (feature 48).
 *
 * It stores what an import found and could not fix by itself, so that closing
 * the modal stops losing it. It NEVER deletes: a warning goes away only when the
 * human gives it for reviewed, never because a later import no longer finds it
 * (ADR-031, decisions.md #3).
 *
 * Nothing here recalculates an amount: `computed` and `fromFile` are stored as
 * the checks of feature 32 produced them and are read back verbatim.
 */

/** A stored row with the only thing its serialization needs from the account. */
type MismatchRow = Prisma.ImportBalanceMismatchGetPayload<{
  include: { account: { select: { alias: true } } }
}>

type UnparsedRowRow = Prisma.ImportUnparsedRowGetPayload<object>

const withAccountAlias = { account: { select: { alias: true } } } as const

/** A `@db.Date` column is a date-only value: no time, no timezone. */
function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

function serializeUnparsedRow(row: UnparsedRowRow): SerializedUnparsedRow {
  return {
    id: row.id,
    file: { bank: row.bank, year: row.year, name: row.fileName },
    row: row.rowNumber,
    reason: row.reason,
    status: row.status,
    note: row.note,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    detectedAt: row.createdAt.toISOString(),
  }
}

function serializeBalanceMismatch(row: MismatchRow): SerializedBalanceMismatch {
  return {
    id: row.id,
    file: { bank: row.bank, year: row.year, name: row.fileName },
    accountId: row.accountId,
    accountAlias: row.account.alias,
    date: toDateOnlyString(row.bookingDate),
    computed: row.computed.toFixed(2),
    fromFile: row.fromFile.toFixed(2),
    difference: row.computed.minus(row.fromFile).toFixed(2),
    check: row.check === 'statement-balance' ? 'statement-balance' : 'per-line',
    status: row.status,
    note: row.note,
    detectedAt: row.createdAt.toISOString(),
    lastSeenAt: row.updatedAt.toISOString(),
  }
}

/**
 * Stores the warnings of ONE statement file that was imported, in a single
 * transaction: either all the warnings of that file are in, or none is.
 *
 * Reimporting the same file UPDATES on the natural key (R6) and the update
 * touches neither `status`, nor `note`, nor `reviewedAt`, of a descuadre or of
 * an unreadable row (feature 54): those three columns are the human's, and that
 * single omission is what keeps a reimport from resurrecting something already
 * reviewed (R7).
 *
 * A file with no warning at all opens no transaction and writes nothing (R8).
 */
export async function persistImportWarnings(
  prisma: AppPrismaClient,
  file: WarningFileRef,
  warnings: ImportWarningsInput,
): Promise<void> {
  const { unparsedRows, balanceMismatches } = warnings
  if (unparsedRows.length === 0 && balanceMismatches.length === 0) return

  const seenAt = new Date()

  const writes = [
    ...unparsedRows.map((unparsed) =>
      prisma.importUnparsedRow.upsert({
        where: {
          bank_year_fileName_rowNumber: {
            bank: file.bank,
            year: file.year,
            fileName: file.name,
            rowNumber: unparsed.row,
          },
        },
        create: {
          bank: file.bank,
          year: file.year,
          fileName: file.name,
          rowNumber: unparsed.row,
          reason: unparsed.reason,
        },
        // Never status, note nor reviewedAt: they are the human's (feature 54).
        update: { reason: unparsed.reason, updatedAt: seenAt },
      }),
    ),
    ...balanceMismatches.map((mismatch) =>
      prisma.importBalanceMismatch.upsert({
        where: {
          bank_year_fileName_accountId_bookingDate_check_computed_fromFile: {
            bank: file.bank,
            year: file.year,
            fileName: file.name,
            accountId: mismatch.accountId,
            bookingDate: toDateOnly(mismatch.date),
            check: mismatch.check,
            computed: mismatch.computed,
            fromFile: mismatch.fromFile,
          },
        },
        create: {
          bank: file.bank,
          year: file.year,
          fileName: file.name,
          accountId: mismatch.accountId,
          bookingDate: toDateOnly(mismatch.date),
          check: mismatch.check,
          computed: mismatch.computed,
          fromFile: mismatch.fromFile,
        },
        // Only the timestamp: status, note and reviewedAt are the human's (R7).
        update: { updatedAt: seenAt },
      }),
    ),
  ]

  await prisma.$transaction(writes)
}

/**
 * Every stored unreadable row, reviewed or not (feature 54: a reviewed one keeps
 * being listed, marked), and the descuadres still `pending` (R10). The name says
 * `Pending` because of the descuadres; it was kept not to touch feature 48.
 *
 * `counts.unparsedRows` counts only the rows still `pending`, so it is NOT the
 * size of that list; `counts.balanceMismatches` is the size of its own.
 *
 * Most recent first (`createdAt DESC, id DESC`). It does NOT paginate: it is
 * expected to be short.
 */
export async function listPendingImportWarnings(
  prisma: AppPrismaClient,
): Promise<ImportWarningsReport> {
  const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

  const [unparsedRows, balanceMismatches] = await Promise.all([
    prisma.importUnparsedRow.findMany({ orderBy: order }),
    prisma.importBalanceMismatch.findMany({
      where: { status: 'pending' },
      include: withAccountAlias,
      orderBy: order,
    }),
  ])

  return {
    unparsedRows: unparsedRows.map(serializeUnparsedRow),
    balanceMismatches: balanceMismatches.map(serializeBalanceMismatch),
    counts: {
      unparsedRows: unparsedRows.filter((row) => row.status === 'pending').length,
      balanceMismatches: balanceMismatches.length,
    },
  }
}

/**
 * Marks an unreadable row reviewed (or puts it back to pending) and stores the
 * note (feature 54). Same rules as `reviewBalanceMismatch`: reversible,
 * `reviewedAt` follows the status, and the note survives both ways unless an
 * explicit `null` clears it. It NEVER deletes the row.
 */
export async function reviewUnparsedRow(
  prisma: AppPrismaClient,
  id: number,
  patch: ReviewUnparsedRowPatch,
): Promise<SerializedUnparsedRow> {
  const existing = await prisma.importUnparsedRow.findUnique({ where: { id } })
  if (existing === null) throw new NotFoundError(`Unparsed row ${id} not found`)

  const data: Prisma.ImportUnparsedRowUpdateInput = {}
  if (patch.status !== undefined) {
    data.status = patch.status
    data.reviewedAt = patch.status === 'reviewed' ? new Date() : null
  }
  if (patch.note !== undefined) data.note = patch.note

  const updated = await prisma.importUnparsedRow.update({ where: { id }, data })

  return serializeUnparsedRow(updated)
}

/**
 * Marks a descuadre reviewed (or puts it back to pending) and stores the note.
 * Reversible on purpose (R12): a wrong click must not be a one-way door.
 *
 * `reviewedAt` is written when it becomes reviewed and cleared when it goes back
 * to pending, so a pending row never carries the date of a review that no longer
 * holds. The note survives both ways: only an explicit `null` clears it.
 */
export async function reviewBalanceMismatch(
  prisma: AppPrismaClient,
  id: number,
  patch: ReviewBalanceMismatchPatch,
): Promise<SerializedBalanceMismatch> {
  const existing = await prisma.importBalanceMismatch.findUnique({ where: { id } })
  if (existing === null) throw new NotFoundError(`Balance mismatch ${id} not found`)

  const data: Prisma.ImportBalanceMismatchUpdateInput = {}
  if (patch.status !== undefined) {
    data.status = patch.status
    data.reviewedAt = patch.status === 'reviewed' ? new Date() : null
  }
  if (patch.note !== undefined) data.note = patch.note

  const updated = await prisma.importBalanceMismatch.update({
    where: { id },
    data,
    include: withAccountAlias,
  })

  return serializeBalanceMismatch(updated)
}
