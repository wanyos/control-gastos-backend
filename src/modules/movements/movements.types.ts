import type { Prisma } from '../../generated/prisma/client.js'
import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  Movement,
  MovementOrigin,
  MovementStatus,
  MovementType,
  PaymentMethod,
} from '../../generated/prisma/client.js'

/** Anything the domain helpers accept as a decimal amount. */
export type DecimalLike = Prisma.Decimal | number | string

/** Minimum shape needed to resolve the balance of an account (R9). */
export interface BalanceMovement {
  type: MovementType
  amount: DecimalLike
  balanceAfter: DecimalLike | null
  bookingDate: Date
  daySequence: number | null
}

/** Minimum shape needed to aggregate global totals (R20). */
export interface TotalsMovement {
  type: MovementType
  amount: DecimalLike
  transferId: string | null
}

export interface MovementTotals {
  income: Prisma.Decimal
  expense: Prisma.Decimal
}

/** What `GET /api/movements` reads: the movement plus its embedded relations. */
export type MovementWithRelations = Movement & {
  account: Account
  category: Category | null
}

export interface EmbeddedAccount {
  id: number
  iban: string
  bank: string
  alias: string
  type: AccountType
}

export interface EmbeddedCategory {
  id: number
  name: string
  kind: CategoryKind
  parentId: number | null
}

/** Shape of the API contract: decimals as strings, dates as `YYYY-MM-DD`/ISO. */
export interface SerializedMovement {
  id: number
  type: MovementType
  bookingDate: string
  valueDate: string
  amount: string
  description: string
  balanceAfter: string | null
  currency: string
  note: string | null
  accountId: number
  categoryId: number | null
  paymentMethod: PaymentMethod | null
  origin: MovementOrigin
  status: MovementStatus
  transferId: string | null
  daySequence: number | null
  createdAt: string
  updatedAt: string
  account: EmbeddedAccount
  category: EmbeddedCategory | null
}
