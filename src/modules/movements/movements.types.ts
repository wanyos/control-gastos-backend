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

/**
 * A point in the history of an account: `bookingDate` plus the position within
 * that day. Everything that asks "which one is more recent" takes this shape.
 */
export interface RecencyPoint {
  bookingDate: Date
  daySequence: number | null
}

/** An amount together with the point in history it belongs to (feature 31, R6). */
export interface BalanceAnchor extends RecencyPoint {
  amount: DecimalLike
}

/** The three anchor columns of an account, as they come out of the database. */
export interface AnchorColumns {
  balanceAnchor: DecimalLike | null
  balanceAnchorDate: Date | null
  balanceAnchorDaySequence: number | null
}

/** Minimum shape needed to aggregate totals (R20 and feature 36). */
export interface TotalsMovement {
  type: MovementType
  amount: DecimalLike
  transferId: string | null
  productId: number | null
}

export interface MovementTotals {
  income: Prisma.Decimal
  expense: Prisma.Decimal
}

/**
 * The querystring of `GET /api/movements`, after schema validation: every
 * filter optional and combinable, pagination always present because the schema
 * fills its defaults (feature 36).
 */
export interface MovementListQuery {
  accountId?: number
  from?: string
  to?: string
  type?: MovementType
  status?: MovementStatus
  page: number
  pageSize: number
}

export interface MovementListPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Totals of THE FILTER asked for, as the contract ships them (decimal strings). */
export interface SerializedMovementTotals {
  income: string
  expense: string
  net: string
}

/** Shape of the `GET /api/movements` response since feature 36. */
export interface MovementListResponse {
  movements: SerializedMovement[]
  pagination: MovementListPagination
  totals: SerializedMovementTotals
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
