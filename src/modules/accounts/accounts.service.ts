import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import {
  ConflictError,
  MissingAccountDataError,
  NotFoundError,
  ValidationError,
} from '../../errors/app-error.js'
import { normalizeIban, requireValidIban } from '../../lib/iban.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { computeAccountBalance } from '../movements/movements.service.js'
import type { BalanceMovement } from '../movements/movements.types.js'
import type {
  AccountMetadata,
  AccountWithBalance,
  CreateAccountBody,
  FindOrCreateAccountResult,
  SerializedAccount,
} from './accounts.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function accountsDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

const balanceMovementSelect = {
  type: true,
  amount: true,
  balanceAfter: true,
  bookingDate: true,
  daySequence: true,
} as const

function deriveAlias(bank: string, iban: string): string {
  return `${bank} ···${iban.slice(-4)}`
}

interface AccountWithStatement {
  id: number
  initialBalance: Prisma.Decimal
  movements: BalanceMovement[]
}

/**
 * Resolves the balance of each account. The normal path needs no sum: the
 * `movements` already carry the single most recent statement line (see the
 * `take: 1` include below). Only accounts whose movements bring no
 * `balanceAfter` at all fall back to summing from `initialBalance` (R9).
 */
async function attachBalances<T extends AccountWithStatement>(
  prisma: AppPrismaClient,
  accounts: T[],
): Promise<Array<Omit<T, 'movements'> & { balance: Prisma.Decimal }>> {
  const withoutStatement = accounts
    .filter((account) => account.movements.length === 0)
    .map((account) => account.id)

  const fallbackMovements =
    withoutStatement.length > 0
      ? await prisma.movement.findMany({
          where: { accountId: { in: withoutStatement } },
          select: { ...balanceMovementSelect, accountId: true },
        })
      : []

  return accounts.map((account) => {
    const { movements, ...rest } = account
    const source =
      movements.length > 0
        ? movements
        : fallbackMovements.filter((movement) => movement.accountId === account.id)

    return { ...rest, balance: computeAccountBalance(account.initialBalance, source) }
  })
}

export async function listAccounts(prisma: AppPrismaClient): Promise<AccountWithBalance[]> {
  const accounts = await prisma.account.findMany({
    orderBy: { id: 'asc' },
    include: {
      movements: {
        where: { balanceAfter: { not: null } },
        orderBy: [{ bookingDate: 'desc' }, { daySequence: 'desc' }],
        take: 1,
        select: balanceMovementSelect,
      },
    },
  })

  return attachBalances(prisma, accounts)
}

export async function getAccountById(
  prisma: AppPrismaClient,
  id: number,
): Promise<AccountWithBalance> {
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      movements: {
        where: { balanceAfter: { not: null } },
        orderBy: [{ bookingDate: 'desc' }, { daySequence: 'desc' }],
        take: 1,
        select: balanceMovementSelect,
      },
    },
  })

  if (!account) {
    throw new NotFoundError('Account not found')
  }

  const [withBalance] = await attachBalances(prisma, [account])
  return withBalance
}

export async function createAccount(
  prisma: AppPrismaClient,
  input: CreateAccountBody,
): Promise<AccountWithBalance> {
  const iban = normalizeIban(input.iban)
  const bank = input.bank.trim()

  if (iban.length === 0) throw new ValidationError('iban is required')
  if (bank.length === 0) throw new ValidationError('bank is required')

  // The SAME rule as the file path (feature 21): this door and the statements
  // cannot judge the same datum differently, or the two of them create the two
  // accounts the feature exists to prevent. `requireValidIban` is the single
  // normalizer+validator of `src/lib/iban.ts`.
  requireValidIban(input.iban)

  const alias = input.alias?.trim()

  try {
    const account = await prisma.account.create({
      data: {
        iban,
        bank,
        alias: alias && alias.length > 0 ? alias : deriveAlias(bank, iban),
        ...(input.type ? { type: input.type } : {}),
        ...(input.initialBalance !== undefined ? { initialBalance: input.initialBalance } : {}),
      },
    })

    return { ...account, balance: computeAccountBalance(account.initialBalance, []) }
  } catch (error) {
    // P2002: unique violation on `iban`. Anything else (e.g. DB down) must
    // propagate as a 500 instead of disguising itself as a conflict.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`An account with iban ${iban} already exists`)
    }
    throw error
  }
}

/**
 * Find-or-create by IBAN from the metadata of a bank statement. Reusable
 * domain function: this feature does NOT trigger it from Drive nor expose it
 * over HTTP; the importer (next feature) chains it (R30-R32).
 */
export async function findOrCreateAccountFromMetadata(
  prisma: AppPrismaClient,
  meta: AccountMetadata,
): Promise<FindOrCreateAccountResult> {
  const iban = normalizeIban(meta.iban ?? '')
  const bank = meta.bank?.trim() ?? ''

  const missing = [...(iban.length > 0 ? [] : ['iban']), ...(bank.length > 0 ? [] : ['bank'])]
  if (missing.length > 0) {
    throw new MissingAccountDataError(`Missing data to create the account: ${missing.join(', ')}`)
  }

  // Last gate before the database, shared with `createAccount` and with the
  // three bank parsers (feature 21). The importer already gets a validated IBAN
  // from its parser; this is what makes the rule true for ANY future caller of
  // this reusable service, not just for the ones that exist today.
  requireValidIban(iban)

  const existing = await prisma.account.findUnique({ where: { iban } })
  if (existing) {
    return { account: existing, created: false, appliedDefaults: { alias: false, type: false } }
  }

  const alias = meta.alias?.trim()
  const account = await prisma.account.create({
    data: {
      iban,
      bank,
      alias: alias && alias.length > 0 ? alias : deriveAlias(bank, iban),
      type: meta.type ?? 'checking',
    },
  })

  return {
    account,
    created: true,
    appliedDefaults: { alias: !alias, type: !meta.type },
  }
}

/** Maps the domain object to the API contract shape (Decimal as string). */
export function serializeAccount(account: AccountWithBalance): SerializedAccount {
  return {
    id: account.id,
    iban: account.iban,
    bank: account.bank,
    alias: account.alias,
    type: account.type,
    initialBalance: account.initialBalance.toFixed(2),
    balance: account.balance.toFixed(2),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }
}
