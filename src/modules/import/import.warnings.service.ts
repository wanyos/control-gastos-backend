import type { Prisma } from '../../generated/prisma/client.js'

import { NotFoundError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type {
  ImportWarningsInput,
  ImportWarningsReport,
  ReviewBalanceMismatchPatch,
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
 * Reimporting the same file UPDATES on the natural key (R6) and the update of a
 * descuadre touches neither `status`, nor `note`, nor `reviewedAt`: that single
 * omission is what keeps a reimport from resurrecting something already
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
 * The warnings still open: every stored unreadable row (they have no state --
 * closing one is another feature) and the descuadres still `pending` (R10).
 *
 * Most recent first (`createdAt DESC, id DESC`). It does NOT paginate: the list
 * is what is left to look at, and it is expected to be short.
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
      unparsedRows: unparsedRows.length,
      balanceMismatches: balanceMismatches.length,
    },
  }
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
