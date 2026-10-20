import type { FastifyInstance } from 'fastify'

import type { OwnAccount, OwnAccountText } from '../../generated/prisma/client.js'

import { NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import {
  normalizeOwnText,
  resolveOwnership,
  type OwnershipReading,
} from './own-accounts.recognition.js'
import type {
  CreateOwnAccountBody,
  HolderNames,
  OwnAccountDto,
  OwnAccountList,
  UpdateOwnAccountBody,
} from './own-accounts.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference, like every other module.
 */
export function ownAccountsDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/** A text of one or two letters would match half a statement: 3 minimum, normalized (R3, R4). */
const minimumTextLength = 3

/**
 * Validates every text and drops the ones repeated once normalized, keeping
 * the first as typed. Throws the 400 of R3/R4 before anything is written.
 */
function uniqueTextsOrThrow(texts: string[], field: string): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const text of texts) {
    const normalized = normalizeOwnText(text)
    if (normalized.length < minimumTextLength) {
      throw new ValidationError(
        `${field} must keep at least ${minimumTextLength} characters after normalizing, ` +
          `got '${normalized}'`,
      )
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    kept.push(text)
  }
  return kept
}

function trimmedOrThrow(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new ValidationError(`${field} must not be blank`)
  return trimmed
}

/** Date-only columns are stored at midnight UTC. */
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value
  return new Date(`${value}T00:00:00.000Z`)
}

function toDateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` strings compare as dates. */
function assertClosedNotBeforeOpened(openedAt: string | null, closedAt: string | null): void {
  if (openedAt !== null && closedAt !== null && closedAt < openedAt) {
    throw new ValidationError(`closedAt (${closedAt}) must not be before openedAt (${openedAt})`)
  }
}

type OwnAccountWithTexts = OwnAccount & { texts: OwnAccountText[] }

const includeTexts = { texts: { orderBy: { id: 'asc' } } } as const

export function serializeOwnAccount(account: OwnAccountWithTexts): OwnAccountDto {
  return {
    id: account.id,
    name: account.name,
    bank: account.bank,
    accountNumber: account.accountNumber,
    type: account.type,
    openedAt: toDateOnly(account.openedAt),
    closedAt: toDateOnly(account.closedAt),
    texts: account.texts.map((text) => text.text),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }
}

export async function listOwnAccounts(prisma: AppPrismaClient): Promise<OwnAccountList> {
  const accounts = await prisma.ownAccount.findMany({
    include: includeTexts,
    orderBy: [{ bank: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  })
  return { ownAccounts: accounts.map(serializeOwnAccount) }
}

export async function createOwnAccount(
  prisma: AppPrismaClient,
  input: CreateOwnAccountBody,
): Promise<OwnAccountDto> {
  const name = trimmedOrThrow(input.name, 'name')
  const bank = trimmedOrThrow(input.bank, 'bank')
  const openedAt = input.openedAt ?? null
  const closedAt = input.closedAt ?? null
  assertClosedNotBeforeOpened(openedAt, closedAt)
  const texts = uniqueTextsOrThrow(input.texts ?? [], 'texts')

  const account = await prisma.ownAccount.create({
    data: {
      name,
      bank,
      type: input.type,
      accountNumber: input.accountNumber ?? null,
      openedAt: toDate(openedAt),
      closedAt: toDate(closedAt),
      texts: { create: texts.map((text) => ({ text })) },
    },
    include: includeTexts,
  })
  return serializeOwnAccount(account)
}

/**
 * Changes ONLY the fields that travel; `texts`, when it travels, replaces the
 * whole list. Everything is validated before the transaction opens, so a 400
 * or a 404 writes nothing (R2, R3).
 */
export async function updateOwnAccount(
  prisma: AppPrismaClient,
  id: number,
  input: UpdateOwnAccountBody,
): Promise<OwnAccountDto> {
  const current = await prisma.ownAccount.findUnique({ where: { id } })
  if (!current) throw new NotFoundError('Own account not found')

  const name = input.name === undefined ? undefined : trimmedOrThrow(input.name, 'name')
  const bank = input.bank === undefined ? undefined : trimmedOrThrow(input.bank, 'bank')
  const openedAt = input.openedAt === undefined ? toDateOnly(current.openedAt) : input.openedAt
  const closedAt = input.closedAt === undefined ? toDateOnly(current.closedAt) : input.closedAt
  assertClosedNotBeforeOpened(openedAt, closedAt)
  const texts = input.texts === undefined ? undefined : uniqueTextsOrThrow(input.texts, 'texts')

  const account = await prisma.$transaction(async (tx) => {
    if (texts !== undefined) {
      await tx.ownAccountText.deleteMany({ where: { ownAccountId: id } })
      await tx.ownAccountText.createMany({
        data: texts.map((text) => ({ ownAccountId: id, text })),
      })
    }
    return tx.ownAccount.update({
      where: { id },
      data: {
        name,
        bank,
        type: input.type,
        accountNumber: input.accountNumber,
        openedAt: toDate(input.openedAt),
        closedAt: toDate(input.closedAt),
        // A change of only the texts must still move `updatedAt`.
        updatedAt: new Date(),
      },
      include: includeTexts,
    })
  })
  return serializeOwnAccount(account)
}

export async function listHolderNames(prisma: AppPrismaClient): Promise<HolderNames> {
  const rows = await prisma.accountHolderName.findMany({ orderBy: { name: 'asc' } })
  return { names: rows.map((row) => row.name) }
}

/** Replaces the holder name forms with exactly `names`, or writes nothing (R4). */
export async function replaceHolderNames(
  prisma: AppPrismaClient,
  names: string[],
): Promise<HolderNames> {
  const kept = uniqueTextsOrThrow(names, 'names')
  await prisma.$transaction([
    prisma.accountHolderName.deleteMany({}),
    prisma.accountHolderName.createMany({ data: kept.map((name) => ({ name })) }),
  ])
  return listHolderNames(prisma)
}

/**
 * The ownership reading of every movement that has one, computed now over what
 * the database holds: a movement imported after the table was filled is
 * recognized on the next read, with nothing to run (R13). Reads only.
 *
 * With the table and the forms empty nothing can match, so only the movements
 * the human decided are read.
 */
export async function readOwnership(
  prisma: AppPrismaClient,
): Promise<Map<number, OwnershipReading>> {
  const [ownAccounts, holderNames] = await Promise.all([
    prisma.ownAccount.findMany({ include: { texts: true }, orderBy: { id: 'asc' } }),
    prisma.accountHolderName.findMany({ orderBy: { id: 'asc' } }),
  ])

  const hasNothingToMatch =
    holderNames.length === 0 && ownAccounts.every((account) => account.texts.length === 0)

  const movements = await prisma.movement.findMany({
    where: hasNothingToMatch ? { ownershipDecision: { not: null } } : undefined,
    select: {
      id: true,
      description: true,
      transferId: true,
      excludedFromTotals: true,
      ownershipDecision: true,
    },
  })

  return resolveOwnership(
    movements,
    ownAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      bank: account.bank,
      texts: account.texts.map((text) => text.text),
    })),
    holderNames.map((row) => row.name),
  )
}
