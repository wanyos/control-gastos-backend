/**
 * Types of `/api/own-accounts` (feature 62): the own accounts table and the
 * holder name forms. The recognition's own types live in
 * `own-accounts.recognition.ts`, next to the function that produces them.
 */
import type { OwnAccountType } from '../../generated/prisma/client.js'

/** Body of `POST /api/own-accounts` (R1). */
export interface CreateOwnAccountBody {
  name: string
  bank: string
  type: OwnAccountType
  accountNumber?: string | null
  /** `YYYY-MM-DD`. */
  openedAt?: string | null
  /** `YYYY-MM-DD`, never before `openedAt`. */
  closedAt?: string | null
  texts?: string[]
}

/** Body of `PATCH /api/own-accounts/:id`: only what travels changes (R2). */
export interface UpdateOwnAccountBody {
  name?: string
  bank?: string
  type?: OwnAccountType
  accountNumber?: string | null
  openedAt?: string | null
  closedAt?: string | null
  /** Replaces the whole list when it travels. */
  texts?: string[]
}

/** Params of `PATCH /api/own-accounts/:id`. */
export interface OwnAccountIdParams {
  id: number
}

/** One row of the own accounts table, as every route answers it. */
export interface OwnAccountDto {
  id: number
  name: string
  bank: string
  accountNumber: string | null
  type: OwnAccountType
  /** `YYYY-MM-DD`. */
  openedAt: string | null
  /** `YYYY-MM-DD`. */
  closedAt: string | null
  /** As the human typed them, in the order they were saved. */
  texts: string[]
  createdAt: string
  updatedAt: string
}

/** Answer of `GET /api/own-accounts`: ordered by `bank`, then `name`, then `id`. */
export interface OwnAccountList {
  ownAccounts: OwnAccountDto[]
}

/** Body of `PUT /api/own-accounts/holder-names` and answer of both holder-names routes (R4). */
export interface HolderNames {
  names: string[]
}
