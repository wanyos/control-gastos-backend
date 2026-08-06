import type { Account, AccountType, Prisma } from '../../generated/prisma/client.js'

export interface CreateAccountBody {
  iban: string
  bank: string
  alias?: string
  type?: AccountType
  initialBalance?: number
}

export interface AccountIdParams {
  id: number // AJV coerces the ':id' path param to integer via the params schema
}

/** Account plus its balance, resolved per request (never stored). */
export interface AccountWithBalance extends Account {
  balance: Prisma.Decimal
}

/** Shape of the API contract: decimals as strings, dates as ISO. */
export interface SerializedAccount {
  id: number
  iban: string
  bank: string
  alias: string
  type: AccountType
  initialBalance: string
  balance: string
  createdAt: string
  updatedAt: string
}

/** What a bank statement knows about its account (used by the importer). */
export interface AccountMetadata {
  iban?: string
  bank?: string
  alias?: string
  type?: AccountType
}

export interface FindOrCreateAccountResult {
  account: Account
  created: boolean
  /** Which defaults were applied, so the caller can report the data it used. */
  appliedDefaults: {
    alias: boolean
    type: boolean
  }
}
