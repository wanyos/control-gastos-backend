// Test-only reader of the values the privacy guardian compares the repository
// against (feature 51). It reads them from a database through a connection
// PostgreSQL itself opens READ-ONLY, and returns them raw: which amount or
// which phrase is worth comparing is decided in `src/no-real-data.test.ts`.
//
// The only caller that passes the human's database is `vitest.global-setup.ts`
// (ADR-027): no test file ever opens it.
//
// It reads NO environment variable (guarded by src/architecture.test.ts): the
// connection string arrives as an argument.
import { Client } from 'pg'

export interface RealDataReference {
  /** Decimal text of every distinct value of the money columns. */
  amounts: string[]
  /** One element per distinct value of the text columns. Never glued together. */
  texts: string[]
  /** `ImportUnparsedRow.reason`: sentences of ours with values of his inside. */
  ownMessages: string[]
  /** `Account.iban`, without spaces or hyphens and in upper case. */
  ibans: string[]
}

export type ColumnKind = 'amount' | 'text' | 'ownMessage' | 'iban'

/** Every column whose values are compared against the versioned files. */
export const comparedColumns: Array<{ table: string; column: string; kind: ColumnKind }> = [
  { table: 'Movement', column: 'amount', kind: 'amount' },
  { table: 'Movement', column: 'balanceAfter', kind: 'amount' },
  { table: 'Account', column: 'initialBalance', kind: 'amount' },
  { table: 'Account', column: 'balanceAnchor', kind: 'amount' },
  { table: 'InvestmentProduct', column: 'principal', kind: 'amount' },
  { table: 'InvestmentProduct', column: 'interestRate', kind: 'amount' },
  { table: 'InvestmentProduct', column: 'expectedGain', kind: 'amount' },
  { table: 'Valuation', column: 'invested', kind: 'amount' },
  { table: 'Valuation', column: 'marketValue', kind: 'amount' },
  { table: 'Valuation', column: 'gain', kind: 'amount' },
  { table: 'Valuation', column: 'gainPercent', kind: 'amount' },
  { table: 'Valuation', column: 'uninvestedCash', kind: 'amount' },
  { table: 'SavingsSnapshot', column: 'openingBalance', kind: 'amount' },
  { table: 'SavingsSnapshot', column: 'moneyIn', kind: 'amount' },
  { table: 'SavingsSnapshot', column: 'moneyOut', kind: 'amount' },
  { table: 'SavingsSnapshot', column: 'interest', kind: 'amount' },
  { table: 'SavingsSnapshot', column: 'balance', kind: 'amount' },
  { table: 'ImportBalanceMismatch', column: 'computed', kind: 'amount' },
  { table: 'ImportBalanceMismatch', column: 'fromFile', kind: 'amount' },
  { table: 'Movement', column: 'description', kind: 'text' },
  { table: 'Movement', column: 'note', kind: 'text' },
  { table: 'InvestmentProduct', column: 'name', kind: 'text' },
  { table: 'Account', column: 'alias', kind: 'text' },
  { table: 'CategoryRule', column: 'matchText', kind: 'text' },
  { table: 'ImportBalanceMismatch', column: 'note', kind: 'text' },
  { table: 'ImportUnparsedRow', column: 'note', kind: 'text' },
  { table: 'ImportUnparsedRow', column: 'reason', kind: 'ownMessage' },
  { table: 'Account', column: 'iban', kind: 'iban' },
]

const generatedIdentifier = 'identifier we generate, not a datum of his'
const currencyCode = 'currency code'
const bankName = 'bank name: our own code publishes it'
const yearOnly = 'a year'
const fileNameReason =
  'file name: it can be our own naming convention; a product name inside it is ' +
  'already compared through InvestmentProduct.name'

/**
 * Every `Decimal` or `String` column that is NOT compared, each with its reason.
 * A column in neither list turns the suite red (src/lib/test-real-data.test.ts).
 */
export const notComparedColumns: Array<{ table: string; column: string; reason: string }> = [
  {
    table: 'Category',
    column: 'name',
    reason: 'everyday words: comparing them flags our own prose all over the repository',
  },
  { table: 'Movement', column: 'descriptionSearch', reason: 'derived from Movement.description' },
  { table: 'Movement', column: 'transferId', reason: generatedIdentifier },
  { table: 'Movement', column: 'undoneTransferId', reason: generatedIdentifier },
  { table: 'Movement', column: 'currency', reason: currencyCode },
  { table: 'InvestmentProduct', column: 'currency', reason: currencyCode },
  { table: 'Account', column: 'bank', reason: bankName },
  { table: 'InvestmentProduct', column: 'bank', reason: bankName },
  { table: 'ImportUnparsedRow', column: 'bank', reason: bankName },
  { table: 'ImportBalanceMismatch', column: 'bank', reason: bankName },
  { table: 'ImportUnparsedRow', column: 'year', reason: yearOnly },
  { table: 'ImportBalanceMismatch', column: 'year', reason: yearOnly },
  { table: 'ImportUnparsedRow', column: 'fileName', reason: fileNameReason },
  { table: 'ImportBalanceMismatch', column: 'fileName', reason: fileNameReason },
  { table: 'ImportBalanceMismatch', column: 'check', reason: 'fixed value of our own contract' },
]

/**
 * Runs `run` over a connection opened with `default_transaction_read_only=on`:
 * PostgreSQL rejects any write made through it (error 25006).
 */
export async function withReadOnlyClient<T>(
  url: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: url,
    options: '-c default_transaction_read_only=on',
  })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `select to_regclass($1) is not null as exists`,
    [`public."${table}"`],
  )
  return result.rows[0]?.exists === true
}

function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * The distinct non-null values of every compared column. A table that does not
 * exist contributes nothing and does not fail.
 */
export async function readRealDataReference(url: string): Promise<RealDataReference> {
  return withReadOnlyClient(url, async (client) => {
    const values: Record<ColumnKind, Set<string>> = {
      amount: new Set(),
      text: new Set(),
      ownMessage: new Set(),
      iban: new Set(),
    }
    const existing = new Map<string, boolean>()

    for (const { table, column, kind } of comparedColumns) {
      if (!existing.has(table)) existing.set(table, await tableExists(client, table))
      if (!existing.get(table)) continue

      const result = await client.query<{ value: string }>(
        `select distinct "${column}"::text as value from "${table}" where "${column}" is not null`,
      )
      for (const { value } of result.rows) {
        values[kind].add(kind === 'iban' ? normalizeIban(value) : value)
      }
    }

    return {
      amounts: [...values.amount],
      texts: [...values.text],
      ownMessages: [...values.ownMessage],
      ibans: [...values.iban],
    }
  })
}
