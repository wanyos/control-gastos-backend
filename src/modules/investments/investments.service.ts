import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'
import type {
  InvestmentProduct,
  SavingsSnapshot,
  Valuation,
} from '../../generated/prisma/client.js'

import { NotFoundError, ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import { currentMonth, monthRange } from '../overview/overview.service.js'
import { resolveDepositMovements } from './investments.deposit-movements.js'
import type {
  DepositEarningsEntry,
  DepositEarningsResponse,
  DepositInput,
  DepositMaturityMatcherRegistry,
  DepositMovementReading,
  ClosedGainsProduct,
  ExcludedFromGainsTotal,
  ExcludedFromPeriodGain,
  GainsProduct,
  GainsProductCommon,
  GainsReason,
  InvestmentGainsResponse,
  InvestmentProductOverview,
  InvestmentsNetWorth,
  InvestmentsOverviewQuery,
  InvestmentsOverviewResponse,
  NetWorthIssue,
  NetWorthProduct,
  ProductFileCommon,
  ProductFileInput,
  ProductImportFacts,
  ProductImportResult,
  SavingsSnapshotInput,
  SerializedSavingsSnapshot,
  SerializedValuation,
  ValuationChange,
  ValuationInput,
} from './investments.types.js'

/**
 * The single writer of `InvestmentProduct` and `SavingsSnapshot` (feature 26,
 * ADR-026). A guardian of `src/architecture.test.ts` keeps it that way: no other
 * file of `src/` names those two Prisma models.
 *
 * It executes the contract ADR-012 decision 6 wrote down for "the future
 * importer": TWO upserts, one on the natural key `(bank, name)` of the product
 * and one on `(productId, date)` of the photo. Neither key carries a counter, a
 * position or an autoincrement, so reloading the same month overwrites it and
 * the next month adds a row -- the very failure feature 25 warned about
 * (`Movement.daySequence`) cannot happen here.
 *
 * It COMPUTES NOTHING (rule 4 of ADR-012): the five amounts are stored exactly
 * as the file writes them. The arithmetic check lives in the parser and runs
 * BEFORE this function is ever called, which is what makes "a file that does not
 * add up leaves no trace" checkable.
 */
export async function persistSavingsSnapshot(
  prisma: AppPrismaClient,
  input: SavingsSnapshotInput,
  importedAt: Date = new Date(),
): Promise<ProductImportResult> {
  // Belt and braces for a caller that is not the type checker (a registry entry
  // wired by hand in `app.ts`): only a savings account has a SavingsSnapshot.
  if (input.type !== 'savings_account') {
    throw new ValidationError(
      `SavingsSnapshot solo existe para productos de tipo savings_account, recibido '${String(input.type)}'`,
    )
  }

  // ONE transaction for the two writes: a failure halfway cannot leave a product
  // without its photo, and it cannot leave a photo of a month that was rejected.
  return prisma.$transaction(async (tx) => {
    const { product, created } = await upsertProduct(tx, input, importedAt)

    const date = toDateOnly(input.date)
    const previousSnapshot = await tx.savingsSnapshot.findUnique({
      where: { productId_date: { productId: product.id, date } },
      select: { id: true },
    })

    // Every amount travels as a STRING (`toFixed(2)`), never as a number, so no
    // floating point ever reaches a `Decimal(10,2)` -- the same detail the
    // movement importer takes (import.service.ts).
    const amounts = {
      openingBalance: input.openingBalance.toFixed(2),
      moneyIn: input.moneyIn.toFixed(2),
      moneyOut: input.moneyOut.toFixed(2),
      interest: input.interest.toFixed(2),
      balance: input.balance.toFixed(2),
    }

    await tx.savingsSnapshot.upsert({
      where: { productId_date: { productId: product.id, date } },
      create: { productId: product.id, date, ...amounts },
      update: amounts,
    })

    return {
      product: toProductReport(product, created),
      snapshot: { date: input.date, created: previousSnapshot === null },
    }
  })
}

/**
 * THE way in of a product file (feature 29). It resolves the union of
 * `ProductFileInput` ONCE, here, and hands the file to the writer of its kind.
 *
 * Why a dispatcher and not one generalized function (decision 1 of this
 * feature): the three kinds write DIFFERENT things -- a `SavingsSnapshot` row, a
 * `Valuation` row, and no row at all but four columns of the product -- so a
 * single body would be a `switch` with three branches wearing one name, and its
 * guards ("a savings account never gets a Valuation") would have to be re-proved
 * inside it. Splitting instead leaves `persistSavingsSnapshot` the very function
 * feature 26 left tested, INCLUDING its refusal of any type that is not
 * `savings_account`: nothing that was proved then is re-proved here.
 *
 * What the three DO share -- the upsert of the product on its natural key
 * `(bank, name)`, the refusal to convert a product into another type, and the
 * single transaction -- lives in `upsertProduct` below, used by all of them.
 */
export async function persistProductSnapshot(
  prisma: AppPrismaClient,
  input: ProductFileInput,
  importedAt: Date = new Date(),
): Promise<ProductImportResult> {
  switch (input.type) {
    case 'savings_account':
      return persistSavingsSnapshot(prisma, input, importedAt)
    case 'deposit':
      return persistDeposit(prisma, input, importedAt)
    default:
      return persistValuation(prisma, input, importedAt)
  }
}

/**
 * The twin of `persistSavingsSnapshot` for a product that FLUCTUATES: a fund, an
 * ETF or a managed portfolio (feature 29). Same two upserts, same natural keys,
 * same transaction; the second table is `Valuation` instead of `SavingsSnapshot`.
 *
 * The identity of the photo is `(productId, date)` and the identity of the
 * product is `(bank, name)`: the human writes the name and the date, and nothing
 * in the system renumbers either. That is the whole of the idempotence, and it
 * is why the failure of feature 25 (`Movement.daySequence`, a counter the
 * importer itself produced) cannot repeat here.
 *
 * It COMPUTES NOTHING: `gain` and `gainPercent` are stored as the file writes
 * them even when they do not match `marketValue - invested`, and
 * `uninvestedCash` is stored APART, never added into anything (ADR-012).
 */
export async function persistValuation(
  prisma: AppPrismaClient,
  input: ValuationInput,
  importedAt: Date = new Date(),
): Promise<ProductImportResult> {
  // Belt and braces for a caller that is not the type checker (a registry entry
  // wired by hand in `app.ts`): only these three types have a Valuation.
  if (!fluctuatingTypes.includes(input.type)) {
    throw new ValidationError(
      `Valuation solo existe para productos de tipo ${fluctuatingTypes.join(', ')}, ` +
        `recibido '${String(input.type)}'`,
    )
  }

  return prisma.$transaction(async (tx) => {
    const { product, created } = await upsertProduct(tx, input, importedAt)

    const date = toDateOnly(input.date)
    const previousValuation = await tx.valuation.findUnique({
      where: { productId_date: { productId: product.id, date } },
      select: { id: true },
    })

    // Every amount travels as a STRING (`toFixed`), never as a number, so no
    // floating point ever reaches a `Decimal`. The percentage takes four
    // decimals because its column is `Decimal(7,4)`.
    const amounts = {
      invested: input.valuation.invested.toFixed(2),
      marketValue: input.valuation.marketValue.toFixed(2),
      gain: input.valuation.gain.toFixed(2),
      gainPercent: input.valuation.gainPercent.toFixed(4),
      uninvestedCash:
        input.valuation.uninvestedCash === null ? null : input.valuation.uninvestedCash.toFixed(2),
    }

    await tx.valuation.upsert({
      where: { productId_date: { productId: product.id, date } },
      create: { productId: product.id, date, ...amounts },
      update: amounts,
    })

    return {
      product: toProductReport(product, created),
      snapshot: { date: input.date, created: previousValuation === null },
    }
  })
}

/**
 * The writer of a DEPOSIT (feature 29). ONE upsert, not two: a deposit is signed
 * once with a principal, a rate and a maturity and it does NOT fluctuate, so its
 * four conditions are COLUMNS OF THE PRODUCT and it keeps no series at all
 * (ADR-012, decision 2 of this feature). Writing a `Valuation` per month would
 * be the same four numbers copied over and over, and it would make "a deposit
 * has no valuations" false the first time it ran.
 *
 * Its `ProductImportResult` therefore reports `snapshot: null`, which is what
 * tells the human "the conditions are stored" apart from "a photo of the month
 * was added". Re-uploading the same file is idempotent for free: the single
 * upsert lands on the same `(bank, name)` and rewrites the same values.
 *
 * The `date` of the file (the day of the note) is NOT stored: it identifies no
 * row here, because there is no row per date. It stays provenance, as the file
 * name does.
 */
export async function persistDeposit(
  prisma: AppPrismaClient,
  input: DepositInput,
  importedAt: Date = new Date(),
): Promise<ProductImportResult> {
  if (input.type !== 'deposit') {
    throw new ValidationError(
      'las condiciones de un depósito solo existen para productos de tipo deposit, ' +
        `recibido '${String(input.type)}'`,
    )
  }

  // Still a transaction with a single write inside: the guard of `upsertProduct`
  // reads before it writes, and reading and writing outside one would let a
  // concurrent load slip between the two.
  return prisma.$transaction(async (tx) => {
    const { product, created } = await upsertProduct(tx, input, importedAt, {
      principal: input.depositTerms.principal.toFixed(2),
      // A PERCENTAGE, never a fraction: 2.75 is 2,75 % (`Decimal(6,4)`).
      interestRate: input.depositTerms.interestRate.toFixed(4),
      expectedGain: input.depositTerms.expectedGain.toFixed(2),
      maturityDate: toDateOnly(input.depositTerms.maturityDate),
    })

    return { product: toProductReport(product, created), snapshot: null }
  })
}

/** The three types whose photo is a `Valuation`. A deposit is NOT one of them. */
const fluctuatingTypes: ValuationInput['type'][] = ['fund', 'etf', 'managed_portfolio']

/** The columns only a deposit fills; every other type leaves them NULL. */
interface DepositColumns {
  principal: string
  interestRate: string
  expectedGain: string
  maturityDate: Date
}

/** The transactional client the three writers receive from `$transaction`. */
type TransactionClient = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]

/** The product half of the report: the same four fields whatever wrote them. */
interface ProductRow {
  id: number
  bank: string
  name: string
  type: string
}

/**
 * The upsert of the product itself, on its natural key `(bank, name)`, shared by
 * the three writers (feature 29) so the rule below is written ONCE.
 *
 * The rule: a product that already exists with ANOTHER type is not this file's
 * product. Its photo would land on something else, which ADR-012 forbids (a
 * savings account has no `Valuation`, a fund has no `SavingsSnapshot`, a deposit
 * has neither). Refusing is what keeps that true; converting the product in
 * silence would not -- and it would strand the series it already had.
 *
 * `created` is read BEFORE the upsert and inside the same transaction: comparing
 * `createdAt` with `updatedAt` would depend on the clock resolution.
 *
 * Feature 69: `importedAt` is written as `lastImportedAt` on create AND on
 * update, so reloading the same file moves it too (R6). It is a parameter of the
 * writers and not a field of `ProductFileCommon`: that type is what a parser
 * returns, and a parser does not know when the file is imported. The writers
 * default it to "now" because every write of a product file IS an import, also
 * the one of a test that calls a writer directly.
 */
async function upsertProduct(
  tx: TransactionClient,
  input: ProductFileCommon & { type: ProductFileInput['type'] },
  importedAt: Date,
  depositColumns?: DepositColumns,
): Promise<{ product: ProductRow; created: boolean }> {
  const where = { bank_name: { bank: input.bank, name: input.name } }
  const existing = await tx.investmentProduct.findUnique({
    where,
    select: { id: true, type: true },
  })

  if (existing && existing.type !== input.type) {
    throw new ValidationError(
      `ya existe un producto '${input.name}' en ${input.bank} de tipo '${existing.type}', ` +
        `y este archivo lo declara de tipo '${input.type}': un producto no cambia de tipo. ` +
        'Cambia el "name" del archivo.',
    )
  }

  const columns = {
    type: input.type,
    currency: input.currency,
    openedAt: toDateOnly(input.openedAt),
    closedAt: input.closedAt === null ? null : toDateOnly(input.closedAt),
    // Absent on every type but the deposit, and then they stay NULL: the four
    // columns are never invented for a product that has no conditions.
    principal: depositColumns?.principal ?? null,
    interestRate: depositColumns?.interestRate ?? null,
    expectedGain: depositColumns?.expectedGain ?? null,
    maturityDate: depositColumns?.maturityDate ?? null,
    lastImportedAt: importedAt,
  }

  const product = await tx.investmentProduct.upsert({
    where,
    create: { bank: input.bank, name: input.name, ...columns },
    update: columns,
  })

  return { product, created: existing === null }
}

/** The product half of the report, built the same way by the three writers. */
function toProductReport(product: ProductRow, created: boolean): ProductImportResult['product'] {
  return {
    id: product.id,
    bank: product.bank,
    name: product.name,
    type: product.type,
    created,
  }
}

/**
 * A date-only column is built with an explicit `T00:00:00.000Z`: a local
 * `new Date('YYYY-MM-DD')` shifts the day in a negative timezone.
 */
function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

// ---------------------------------------------------------------------------
// Read side (feature 39): the first reader of the layer the writers above
// fill. Everything below is `find*` only -- this view writes NOTHING.
// ---------------------------------------------------------------------------

/**
 * Single point where the module obtains its data client, twin of `overviewDb`.
 * Keeps the routes layer free of any data-access reference.
 */
export function investmentsDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

/**
 * The one read of feature 39: each investment product with its photo of the
 * period, how much it moved since the previous photo, and what was gained in
 * total in that month (fluctuation of the funds plus the interest paid into
 * the remunerated accounts).
 *
 * It derives at read time and NOTHING else: every stored amount is serialized
 * exactly as the human wrote it (rule 4 of ADR-012 -- `gain` is never
 * re-derived from `marketValue - invested`, nothing is rounded), and the only
 * arithmetic is the difference between two of his numbers and their sum.
 * The variation is measured on `gain` / `gainPercent`, never on `marketValue`,
 * so a monthly contribution does not read as a market rise (decisions.md 🔴 2).
 *
 * What cannot be computed comes out as a gap: `null` in its place plus an
 * entry in `periodGain.excluded` with the reason -- never a silent zero, and
 * never a previous photo standing in for the missing one (decisions.md 🔴 3/4).
 */
export async function getInvestmentsOverview(
  prisma: AppPrismaClient,
  query: InvestmentsOverviewQuery,
): Promise<InvestmentsOverviewResponse> {
  const month = query.month ?? currentMonth()
  const { from, to } = monthRange(month)
  const fromDate = toDateOnly(from)
  const toDate = toDateOnly(to)

  // R11: a productId that does not exist is a 404, same as the accountId of
  // GET /api/movements. Existence is checked WITHOUT the period filter: a
  // product closed before the period exists -- it is simply not listed (R9).
  if (query.productId !== undefined) {
    const product = await prisma.investmentProduct.findUnique({
      where: { id: query.productId },
      select: { id: true },
    })
    if (product === null) throw new NotFoundError('Investment product not found')
  }

  const products = await prisma.investmentProduct.findMany({
    where: {
      ...(query.productId === undefined ? {} : { id: query.productId }),
      ...(query.type === undefined ? {} : { type: query.type }),
      // R9: closed before the first day of the period -> out of the view.
      // Closed inside the period or later (or still open) -> in.
      OR: [{ closedAt: null }, { closedAt: { gte: fromDate } }],
    },
    orderBy: { id: 'asc' },
  })

  const productIds = products.map((product) => product.id)
  // Newest first and capped at `to`: per product, the first row with
  // `date >= from` is the photo of the period (the greatest date, should a
  // month ever hold two), and the first row older than it -- or older than
  // `from` when the period has none -- is the previous photo.
  const [valuations, snapshots] = await Promise.all([
    prisma.valuation.findMany({
      where: { productId: { in: productIds }, date: { lte: toDate } },
      orderBy: { date: 'desc' },
    }),
    prisma.savingsSnapshot.findMany({
      where: { productId: { in: productIds }, date: { lte: toDate } },
      orderBy: { date: 'desc' },
    }),
  ])

  let fluctuation = new Prisma.Decimal(0)
  let interest = new Prisma.Decimal(0)
  const excluded: ExcludedFromPeriodGain[] = []
  const overviewProducts: InvestmentProductOverview[] = []

  for (const product of products) {
    const common = {
      id: product.id,
      bank: product.bank,
      name: product.name,
      currency: product.currency,
      openedAt: product.openedAt === null ? null : serializeDateOnly(product.openedAt),
      closedAt: product.closedAt === null ? null : serializeDateOnly(product.closedAt),
    }

    if (product.type === 'deposit') {
      // A deposit does not fluctuate and keeps no series (ADR-012): its four
      // conditions ARE its view, and it can never be "excluded" -- there is
      // no photo of it to miss.
      overviewProducts.push({ ...common, type: 'deposit', conditions: depositConditions(product) })
      continue
    }

    if (product.type === 'savings_account') {
      const snapshot = snapshots.find((row) => row.productId === product.id && row.date >= fromDate)
      if (snapshot === undefined) {
        excluded.push({ productId: product.id, name: product.name, reason: 'no_photo_in_period' })
      } else {
        // The interest counts as gain of the month it was PAID, which is the
        // month of the photo's date (R8).
        interest = interest.plus(snapshot.interest)
      }
      overviewProducts.push({
        ...common,
        type: 'savings_account',
        snapshot: snapshot === undefined ? null : serializeSavingsSnapshot(snapshot),
      })
      continue
    }

    const series = valuations.filter((row) => row.productId === product.id)
    const periodPhoto = series.find((row) => row.date >= fromDate)
    const previousPhoto = series.find((row) => row.date < (periodPhoto?.date ?? fromDate))

    let change: ValuationChange | null = null
    if (periodPhoto === undefined) {
      excluded.push({ productId: product.id, name: product.name, reason: 'no_photo_in_period' })
    } else if (previousPhoto === undefined) {
      excluded.push({ productId: product.id, name: product.name, reason: 'no_previous_photo' })
    } else {
      // Both numbers of each difference are the human's own; when one of the
      // two is missing, that COMPONENT is null (R4). The product enters the
      // euro sum only when the euro component is computable (R8).
      const amount =
        periodPhoto.gain === null || previousPhoto.gain === null
          ? null
          : periodPhoto.gain.minus(previousPhoto.gain)
      const percentPoints =
        periodPhoto.gainPercent === null || previousPhoto.gainPercent === null
          ? null
          : periodPhoto.gainPercent.minus(previousPhoto.gainPercent)
      change = {
        amount: amount === null ? null : amount.toFixed(2),
        percentPoints: percentPoints === null ? null : percentPoints.toString(),
      }
      if (amount === null) {
        excluded.push({ productId: product.id, name: product.name, reason: 'gain_not_reported' })
      } else {
        fluctuation = fluctuation.plus(amount)
      }
    }

    overviewProducts.push({
      ...common,
      type: product.type,
      valuation: periodPhoto === undefined ? null : serializeValuation(periodPhoto),
      previousValuation: previousPhoto === undefined ? null : serializeValuation(previousPhoto),
      change,
    })
  }

  return {
    period: { month, from, to },
    products: overviewProducts,
    periodGain: {
      total: fluctuation.plus(interest).toFixed(2),
      fluctuation: fluctuation.toFixed(2),
      interest: interest.toFixed(2),
      excluded,
    },
  }
}

/**
 * The read of feature 42: what every LIVE investment product is worth today,
 * for the `investments` block of `GET /api/net-worth`. It lives here and not
 * in the net-worth module because this file is the only one of `src/` allowed
 * to name the three investment tables (ADR-026, guarded by
 * `src/architecture.test.ts`): the net-worth module composes, it never reads.
 *
 * `today` is injected (date-only, midnight UTC) so the tests can fix the
 * clock; the threshold for a stale photo derives from it, never from the wall
 * clock. Only `find*` in the whole path — this view writes NOTHING (R12).
 *
 * Valuation rules (decisions.md of feature 42, all approved):
 *  - closed product (`closedAt` written): not listed, not summed — its money
 *    is already in an account balance (R6);
 *  - fluctuating: `marketValue + uninvestedCash` of the most recent photo
 *    with `date <= today`; a `NULL` cash adds only `marketValue`, never an
 *    invented zero (R3, ADR-012);
 *  - deposit: its `principal` while it lives, `expectedGain` NEVER added
 *    (R4); matured but still open → keeps summing, with a warning (R9);
 *  - savings account: the `balance` of its most recent snapshot (R5);
 *  - no photo at all → `value: null`, out of the sum, listed in `issues`
 *    with `no_valuation` — never a silent zero (R7);
 *  - photo older than the first day of LAST month → still sums, listed in
 *    `issues` with `stale_valuation` and the date used (R8).
 */
export async function getInvestmentsNetWorth(
  prisma: AppPrismaClient,
  today: Date,
): Promise<InvestmentsNetWorth> {
  // First day of the month BEFORE today's month (UTC). The photos are monthly
  // end-of-month files: mid-month, last month's photo is fresh; one from two
  // months ago is not (decisions.md 🔴 3).
  const staleBefore = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))

  const products = await prisma.investmentProduct.findMany({
    where: { closedAt: null },
    orderBy: { id: 'asc' },
  })

  const productIds = products.map((product) => product.id)
  // Newest first and capped at `today`: per product, the first row is "the
  // most recent photo with date <= today" (same pattern as feature 39).
  const [valuations, snapshots] = await Promise.all([
    prisma.valuation.findMany({
      where: { productId: { in: productIds }, date: { lte: today } },
      orderBy: { date: 'desc' },
    }),
    prisma.savingsSnapshot.findMany({
      where: { productId: { in: productIds }, date: { lte: today } },
      orderBy: { date: 'desc' },
    }),
  ])

  let total = new Prisma.Decimal(0)
  const netWorthProducts: NetWorthProduct[] = []
  const issues: NetWorthIssue[] = []

  for (const product of products) {
    const identity = { productId: product.id, name: product.name }

    if (product.type === 'deposit') {
      // Worth its principal while it lives (should the column be NULL — the
      // parser forbids it — the value is a gap and does NOT sum, no new issue).
      if (product.principal !== null) total = total.plus(product.principal)
      const matured = product.maturityDate !== null && product.maturityDate < today
      if (matured && product.maturityDate !== null) {
        issues.push({
          ...identity,
          reason: 'matured_not_closed',
          valuedAt: serializeDateOnly(product.maturityDate),
        })
      }
      netWorthProducts.push({
        id: product.id,
        bank: product.bank,
        name: product.name,
        type: 'deposit',
        value: product.principal === null ? null : product.principal.toFixed(2),
        principal: product.principal === null ? null : product.principal.toFixed(2),
        expectedGain: product.expectedGain === null ? null : product.expectedGain.toFixed(2),
        maturityDate:
          product.maturityDate === null ? null : serializeDateOnly(product.maturityDate),
        matured,
      })
      continue
    }

    if (product.type === 'savings_account') {
      const snapshot = snapshots.find((row) => row.productId === product.id)
      const value = snapshot === undefined ? null : snapshot.balance
      const stale = snapshot !== undefined && snapshot.date < staleBefore
      if (snapshot === undefined) {
        issues.push({ ...identity, reason: 'no_valuation', valuedAt: null })
      } else {
        total = total.plus(snapshot.balance)
        if (stale) {
          issues.push({
            ...identity,
            reason: 'stale_valuation',
            valuedAt: serializeDateOnly(snapshot.date),
          })
        }
      }
      netWorthProducts.push({
        id: product.id,
        bank: product.bank,
        name: product.name,
        type: 'savings_account',
        value: value === null ? null : value.toFixed(2),
        valuedAt: snapshot === undefined ? null : serializeDateOnly(snapshot.date),
        stale,
      })
      continue
    }

    const photo = valuations.find((row) => row.productId === product.id)
    // A NULL cash adds NOTHING: the sum is only performed when the cash is
    // there, never over an invented zero (R3, ADR-012).
    const value =
      photo === undefined
        ? null
        : photo.uninvestedCash === null
          ? photo.marketValue
          : photo.marketValue.plus(photo.uninvestedCash)
    const stale = photo !== undefined && photo.date < staleBefore
    if (photo === undefined) {
      issues.push({ ...identity, reason: 'no_valuation', valuedAt: null })
    } else {
      if (value !== null) total = total.plus(value)
      if (stale) {
        issues.push({
          ...identity,
          reason: 'stale_valuation',
          valuedAt: serializeDateOnly(photo.date),
        })
      }
    }
    netWorthProducts.push({
      id: product.id,
      bank: product.bank,
      name: product.name,
      type: product.type,
      value: value === null ? null : value.toFixed(2),
      marketValue: photo === undefined ? null : photo.marketValue.toFixed(2),
      uninvestedCash:
        photo === undefined || photo.uninvestedCash === null
          ? null
          : photo.uninvestedCash.toFixed(2),
      valuedAt: photo === undefined ? null : serializeDateOnly(photo.date),
      stale,
    })
  }

  return { total: total.toFixed(2), products: netWorthProducts, issues }
}

/**
 * The read of feature 50: every deposit with a product file and, once it
 * matured, what it earned -- the amount of its maturity movement in the
 * statement minus the `principal` of its file -- plus the total of them all.
 *
 * The maturity movement is linked to the deposit BY DATE ONLY: a movement of an
 * account of the same bank, of type `income`, booked on the `maturityDate`,
 * whose description the matcher of that bank recognizes. The number in the
 * description is never read (it repeats between deposits), and the F49 mark,
 * `transferId` and `productId` play no part. Zero or several candidates give no
 * figure, never a guessed one.
 *
 * `today` is injected (date-only, midnight UTC) so the tests can fix the clock.
 * Only `find*` in the whole path: the link is computed, never stored.
 */
export async function getDepositEarnings(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
  today: Date,
): Promise<DepositEarningsResponse> {
  const products = await prisma.investmentProduct.findMany({
    where: { type: 'deposit' },
    orderBy: [{ maturityDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  })

  // Only the deposits that are due need a look at the statement.
  const due = products.flatMap((product) =>
    product.maturityDate !== null &&
    !isCancelledBeforeMaturity(product) &&
    product.maturityDate <= today
      ? [{ bank: product.bank, maturityDate: product.maturityDate }]
      : [],
  )
  const dueDates = [...new Set(due.map((product) => product.maturityDate.getTime()))].map(
    (time) => new Date(time),
  )
  const dueBanks = [...new Set(due.map((product) => product.bank))]

  const movements =
    due.length === 0
      ? []
      : await prisma.movement.findMany({
          where: {
            type: 'income',
            bookingDate: { in: dueDates },
            account: { bank: { in: dueBanks } },
          },
          select: {
            id: true,
            bookingDate: true,
            amount: true,
            description: true,
            account: { select: { bank: true } },
          },
          orderBy: { id: 'asc' },
        })

  let total = new Prisma.Decimal(0)
  const deposits: DepositEarningsEntry[] = []

  for (const product of products) {
    const entry: DepositEarningsEntry = {
      id: product.id,
      bank: product.bank,
      name: product.name,
      openedAt: product.openedAt === null ? null : serializeDateOnly(product.openedAt),
      closedAt: product.closedAt === null ? null : serializeDateOnly(product.closedAt),
      principal: product.principal === null ? null : product.principal.toFixed(2),
      expectedGain: product.expectedGain === null ? null : product.expectedGain.toFixed(2),
      maturityDate: product.maturityDate === null ? null : serializeDateOnly(product.maturityDate),
      status: 'maturity_not_found',
      earned: null,
      maturity: null,
      candidateMovementIds: [],
    }
    deposits.push(entry)

    if (isCancelledBeforeMaturity(product)) {
      entry.status = 'cancelled'
      continue
    }
    const { maturityDate, principal } = product
    // A NULL maturityDate (the parser forbids it) can be neither active nor
    // looked up: it stays `maturity_not_found`, never with a figure.
    if (maturityDate === null) continue
    if (maturityDate > today) {
      entry.status = 'active'
      continue
    }

    const matcher = matchers.find((candidate) => candidate.bank === product.bank)
    const candidates =
      matcher === undefined
        ? []
        : movements.filter(
            (movement) =>
              movement.account.bank === product.bank &&
              movement.bookingDate.getTime() === maturityDate.getTime() &&
              matcher.isDepositMaturity(movement.description),
          )

    if (candidates.length === 0 || principal === null) continue
    if (candidates.length > 1) {
      entry.status = 'ambiguous'
      entry.candidateMovementIds = candidates.map((movement) => movement.id).sort((a, b) => a - b)
      continue
    }

    const [maturity] = candidates
    entry.maturity = {
      movementId: maturity.id,
      date: serializeDateOnly(maturity.bookingDate),
      amount: maturity.amount.toFixed(2),
    }
    if (maturity.amount.lessThan(principal)) {
      // In a deposit, getting back less than the principal can only be a wrong
      // link: no figure, and the movement is shown so it can be checked.
      entry.status = 'below_principal'
      continue
    }
    const earned = maturity.amount.minus(principal)
    entry.status = 'matured'
    entry.earned = earned.toFixed(2)
    total = total.plus(earned)
  }

  return { asOf: serializeDateOnly(today), deposits, total: total.toFixed(2) }
}

/** `closedAt` before `maturityDate`: the human cancelled it before it matured. */
function isCancelledBeforeMaturity(product: InvestmentProduct): boolean {
  return (
    product.closedAt !== null &&
    product.maturityDate !== null &&
    product.closedAt < product.maturityDate
  )
}

/**
 * How much every deposit movement counts in the income/expense totals (feature
 * 57), keyed by movement id. It reads the WHOLE history of the accounts of the
 * banks of the registry, never only the filter being summed: what a maturity of
 * October counts cannot depend on whether the filter leaves its September
 * opening out (design §4). The texts are classified in memory by the matchers,
 * so the query repeats no prefix of any bank.
 *
 * It lives here and not in the movements module because this is the only file
 * allowed to read `InvestmentProduct` (`architecture.test.ts`). The rule itself
 * is the pure `resolveDepositMovements`. Only `findMany`: nothing is stored, so
 * a movement imported later counts on the next read (R15).
 */
export async function readDepositMovements(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
): Promise<Map<number, DepositMovementReading>> {
  const banks = [...new Set(matchers.map((matcher) => matcher.bank))]
  if (banks.length === 0) return new Map()

  const [products, movements] = await Promise.all([
    prisma.investmentProduct.findMany({
      where: { type: 'deposit', bank: { in: banks } },
      select: { id: true, bank: true, maturityDate: true, principal: true },
    }),
    prisma.movement.findMany({
      where: { account: { bank: { in: banks } } },
      select: {
        id: true,
        accountId: true,
        type: true,
        bookingDate: true,
        daySequence: true,
        amount: true,
        description: true,
        account: { select: { bank: true } },
      },
    }),
  ])

  return resolveDepositMovements(
    movements.map(({ account, ...movement }) => ({ ...movement, bank: account.bank })),
    products,
    matchers,
  )
}

/** `YYYY-MM-DD` of a date-only column (stored at midnight UTC). */
function serializeDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/**
 * A monetary `Decimal(10,2)` travels as `toFixed(2)` (the convention of the
 * whole contract: the human writes two decimals) and a percentage as
 * `toString()` -- a `toFixed(4)` would pad with zeros digits he never typed.
 */
function serializeValuation(row: Valuation): SerializedValuation {
  return {
    date: serializeDateOnly(row.date),
    invested: row.invested.toFixed(2),
    marketValue: row.marketValue.toFixed(2),
    gain: row.gain === null ? null : row.gain.toFixed(2),
    gainPercent: row.gainPercent === null ? null : row.gainPercent.toString(),
    uninvestedCash: row.uninvestedCash === null ? null : row.uninvestedCash.toFixed(2),
  }
}

function serializeSavingsSnapshot(row: SavingsSnapshot): SerializedSavingsSnapshot {
  return {
    date: serializeDateOnly(row.date),
    openingBalance: row.openingBalance.toFixed(2),
    moneyIn: row.moneyIn.toFixed(2),
    moneyOut: row.moneyOut.toFixed(2),
    interest: row.interest.toFixed(2),
    balance: row.balance.toFixed(2),
  }
}

function depositConditions(product: InvestmentProduct) {
  return {
    principal: product.principal === null ? null : product.principal.toFixed(2),
    interestRate: product.interestRate === null ? null : product.interestRate.toString(),
    expectedGain: product.expectedGain === null ? null : product.expectedGain.toFixed(2),
    maturityDate: product.maturityDate === null ? null : serializeDateOnly(product.maturityDate),
  }
}

/**
 * The most recent `date` written in the two photo tables (`Valuation` and
 * `SavingsSnapshot`), or `null` when both are empty. Read here and not in
 * `net-worth` because this module is the only reader of the investment tables
 * (ADR-026); `GET /api/net-worth` combines it with the most recent
 * `Movement.bookingDate` to say up to which day the data reaches.
 */
export async function readLatestInvestmentDate(prisma: AppPrismaClient): Promise<Date | null> {
  const [valuation, snapshot] = await Promise.all([
    prisma.valuation.aggregate({ _max: { date: true } }),
    prisma.savingsSnapshot.aggregate({ _max: { date: true } }),
  ])
  const dates = [valuation._max.date, snapshot._max.date].filter(
    (date): date is Date => date !== null,
  )
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

/** The four types that are an investment of this view (R2: never a savings account). */
const gainsProductTypes: InvestmentProduct['type'][] = [
  'fund',
  'etf',
  'managed_portfolio',
  'deposit',
]

const millisecondsPerDay = 86_400_000

type FluctuatingProduct = InvestmentProduct & { type: 'fund' | 'etf' | 'managed_portfolio' }

/** A product of the view plus, when its `gain` is there, the two numbers the total adds. */
interface GainsRow {
  product: GainsProduct
  sum: { gain: Prisma.Decimal; invested: Prisma.Decimal } | null
}

/**
 * The read of feature 67: what each fund, ETF, managed portfolio and deposit
 * gained or lost SINCE IT WAS OPENED, live and closed apart, plus the total of
 * the live ones (`GET /api/investments/gains`, ADR-043).
 *
 * It lives here and not in a file of its own because this is the only file of
 * `src/` allowed to name the investment tables (`src/architecture.test.ts`).
 *
 * Rules (decisions.md of feature 67, approved on 2026-11-04):
 *  - closing date: `closedAt` of a fluctuating product; the earliest of
 *    `closedAt` and `maturityDate` of a deposit. Closed when it is <= `today`;
 *  - fluctuating: the figures of its most recent photo with `date` <= today
 *    (live) or <= its closing date (closed), EXACTLY as stored -- nothing is
 *    recomputed (ADR-012); `currentValue` is `marketValue`, the cash apart;
 *  - live deposit: its expected gain spread over the calendar days since it
 *    opened, rounded to the cent (half up); its principal counts as invested;
 *  - closed deposit: the rule of `getDepositEarnings` (feature 50), CALLED and
 *    not copied; one cancelled before maturity closes with gain 0;
 *  - what cannot be obtained is `null` with its reason, never `0`, and a live
 *    product without `gain` is listed in `total.excluded`.
 *
 * `today` is injected (date-only, midnight UTC) so the tests fix the clock.
 * Only `find*` in the whole path: this view writes NOTHING (R14).
 */
export async function getInvestmentGains(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
  today: Date,
): Promise<InvestmentGainsResponse> {
  const products = await prisma.investmentProduct.findMany({
    where: { type: { in: gainsProductTypes } },
    orderBy: { id: 'asc' },
  })
  const productIds = products.map((product) => product.id)

  // Newest first and capped at `today`: per product, the first row is the photo
  // of a live product, and the first row with `date <= closing date` the one of
  // a closed product (its closing date is <= today, so it is in this result).
  const [valuations, depositEarnings] = await Promise.all([
    prisma.valuation.findMany({
      where: { productId: { in: productIds }, date: { lte: today } },
      orderBy: { date: 'desc' },
    }),
    getDepositEarnings(prisma, matchers, today),
  ])
  const earningsById = new Map(depositEarnings.deposits.map((entry) => [entry.id, entry]))

  const liveRows: GainsRow[] = []
  const closedRows: { product: GainsProduct; closedOn: Date }[] = []

  for (const product of products) {
    const closedOn = closingDate(product)
    if (closedOn !== null && closedOn <= today) {
      closedRows.push({
        product: gainsOfClosedProduct(product, closedOn, valuations, earningsById),
        closedOn,
      })
    } else {
      liveRows.push(gainsOfLiveProduct(product, valuations, today))
    }
  }

  // Live: oldest first (`openedAt` ascending, `null` last), then `id`.
  liveRows.sort((a, b) => {
    const left = a.product.openedAt
    const right = b.product.openedAt
    if (left !== right) {
      if (left === null) return 1
      if (right === null) return -1
      return left < right ? -1 : 1
    }
    return a.product.id - b.product.id
  })
  // Closed: the most recently closed first, then `id` descending.
  closedRows.sort(
    (a, b) => b.closedOn.getTime() - a.closedOn.getTime() || b.product.id - a.product.id,
  )

  // The total adds the LIVE products only (R9-R13), with the ALREADY rounded
  // gain of each deposit, so it matches the sum of the rows.
  let gain = new Prisma.Decimal(0)
  let invested = new Prisma.Decimal(0)
  const excluded: ExcludedFromGainsTotal[] = []
  for (const row of liveRows) {
    if (row.sum === null) {
      // A live product without `gain` always carries its reason.
      if (row.product.reason !== null) {
        excluded.push({
          productId: row.product.id,
          name: row.product.name,
          reason: row.product.reason,
        })
      }
      continue
    }
    gain = gain.plus(row.sum.gain)
    invested = invested.plus(row.sum.invested)
  }

  return {
    asOf: serializeDateOnly(today),
    total: {
      gain: gain.toFixed(2),
      invested: invested.toFixed(2),
      gainPercent: invested.isZero() ? null : percentOf(gain, invested),
      excluded,
    },
    live: liveRows.map((row) => row.product),
    closed: closedRows.map((row) => withClosedOn(row.product, row.closedOn)),
  }
}

/**
 * The closing date of a product (requirements.md of feature 67): `closedAt` of a
 * fluctuating one; the earliest non-null of `closedAt` and `maturityDate` of a
 * deposit -- a deposit is over the day it matures, closing written or not.
 */
function closingDate(product: InvestmentProduct): Date | null {
  if (product.type !== 'deposit') return product.closedAt
  const dates = [product.closedAt, product.maturityDate].filter(
    (date): date is Date => date !== null,
  )
  if (dates.length === 0) return null
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}

/** `part / base × 100`, two decimals, half up, always padded (`"0.60"`). */
function percentOf(part: Prisma.Decimal, base: Prisma.Decimal): string {
  return part.dividedBy(base).times(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
}

/** Calendar days from `from` to `to`, both date-only at midnight UTC. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay)
}

function isFluctuating(product: InvestmentProduct): product is FluctuatingProduct {
  return product.type === 'fund' || product.type === 'etf' || product.type === 'managed_portfolio'
}

/** Identity of a product of the view, with every figure still empty. */
function gainsCommon(product: InvestmentProduct): GainsProductCommon {
  return {
    id: product.id,
    bank: product.bank,
    name: product.name,
    openedAt: product.openedAt === null ? null : serializeDateOnly(product.openedAt),
    closedAt: product.closedAt === null ? null : serializeDateOnly(product.closedAt),
    invested: null,
    currentValue: null,
    gain: null,
    gainPercent: null,
    valuedAt: null,
    reason: null,
  }
}

/** The figures of a fluctuating product from ONE photo, exactly as stored (R4, R5, R8). */
function gainsFromPhoto(product: FluctuatingProduct, photo: Valuation | undefined): GainsRow {
  const common = gainsCommon(product)
  if (photo === undefined) {
    return {
      product: { ...common, type: product.type, uninvestedCash: null, reason: 'no_photo' },
      sum: null,
    }
  }
  return {
    product: {
      ...common,
      type: product.type,
      invested: photo.invested.toFixed(2),
      currentValue: photo.marketValue.toFixed(2),
      gain: photo.gain === null ? null : photo.gain.toFixed(2),
      gainPercent: photo.gainPercent === null ? null : photo.gainPercent.toString(),
      uninvestedCash: photo.uninvestedCash === null ? null : photo.uninvestedCash.toFixed(2),
      valuedAt: serializeDateOnly(photo.date),
      reason:
        photo.gain === null
          ? 'gain_not_reported'
          : photo.gainPercent === null
            ? 'gain_percent_not_reported'
            : null,
    },
    sum: photo.gain === null ? null : { gain: photo.gain, invested: photo.invested },
  }
}

/** A deposit with no figure, and why (R8). `invested` is its principal, as stored. */
function depositWithoutFigures(product: InvestmentProduct, reason: GainsReason): GainsProduct {
  return {
    ...gainsCommon(product),
    type: 'deposit',
    conditions: depositConditions(product),
    invested: product.principal === null ? null : product.principal.toFixed(2),
    reason,
  }
}

/** A live product (R4, R6). */
function gainsOfLiveProduct(
  product: InvestmentProduct,
  valuations: Valuation[],
  today: Date,
): GainsRow {
  if (isFluctuating(product)) {
    return gainsFromPhoto(
      product,
      valuations.find((row) => row.productId === product.id),
    )
  }

  const { openedAt, principal, expectedGain, maturityDate } = product
  if (openedAt === null || principal === null || expectedGain === null || maturityDate === null) {
    return { product: depositWithoutFigures(product, 'missing_conditions'), sum: null }
  }
  // Calendar days of the whole term (D) and of the part already lived (d),
  // clamped to [0, D]: never a division by zero, never more than the expected gain.
  const term = daysBetween(openedAt, maturityDate)
  if (term <= 0) return { product: depositWithoutFigures(product, 'missing_conditions'), sum: null }
  const lived = Math.min(Math.max(daysBetween(openedAt, today), 0), term)
  const gain = expectedGain
    .times(lived)
    .dividedBy(term)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

  return {
    product: {
      ...gainsCommon(product),
      type: 'deposit',
      conditions: depositConditions(product),
      invested: principal.toFixed(2),
      currentValue: principal.plus(gain).toFixed(2),
      gain: gain.toFixed(2),
      gainPercent: percentOf(gain, principal),
      valuedAt: serializeDateOnly(today),
    },
    sum: { gain, invested: principal },
  }
}

/** A closed product (R5, R7, R8, R16). It never adds to the total (R9). */
function gainsOfClosedProduct(
  product: InvestmentProduct,
  closedOn: Date,
  valuations: Valuation[],
  earningsById: Map<number, DepositEarningsEntry>,
): GainsProduct {
  if (isFluctuating(product)) {
    const photo = valuations.find((row) => row.productId === product.id && row.date <= closedOn)
    return gainsFromPhoto(product, photo).product
  }

  const { principal, maturityDate } = product
  if (principal === null || maturityDate === null) {
    return depositWithoutFigures(product, 'missing_conditions')
  }

  const entry = earningsById.get(product.id)
  if (entry === undefined || entry.status === 'active') {
    // Cannot happen: a closed deposit is cancelled or already due, and both
    // reads see the same products. Failing loud beats inventing a figure.
    throw new Error(`Deposit ${product.id} is closed but the deposit rule does not see it due`)
  }

  const common = {
    ...gainsCommon(product),
    type: 'deposit' as const,
    conditions: depositConditions(product),
    invested: principal.toFixed(2),
  }

  if (entry.status === 'cancelled') {
    // Cancelled before maturity: the principal comes back and nothing is
    // earned (decisions.md of feature 67, point 2).
    return {
      ...common,
      currentValue: principal.toFixed(2),
      gain: '0.00',
      gainPercent: '0.00',
      valuedAt: entry.closedAt,
    }
  }

  if (entry.status === 'matured') {
    if (entry.earned === null || entry.maturity === null) {
      // Cannot happen: `getDepositEarnings` always fills both on `matured`.
      throw new Error(`Deposit ${product.id} is matured without its maturity movement`)
    }
    return {
      ...common,
      currentValue: entry.maturity.amount,
      gain: entry.earned,
      gainPercent: percentOf(new Prisma.Decimal(entry.earned), principal),
      valuedAt: entry.maturity.date,
    }
  }

  // `maturity_not_found`, `ambiguous` or `below_principal`: no figure, and the
  // status of the deposit rule is the reason.
  return depositWithoutFigures(product, entry.status)
}

/** The closed entry: `closedOn` right after `closedAt`, the order of the contract. */
function withClosedOn(product: GainsProduct, closedOn: Date): ClosedGainsProduct {
  const { invested, currentValue, gain, gainPercent, valuedAt, reason, ...identity } = product
  return {
    ...identity,
    closedOn: serializeDateOnly(closedOn),
    invested,
    currentValue,
    gain,
    gainPercent,
    valuedAt,
    reason,
  } as ClosedGainsProduct
}

// ---------------------------------------------------------------------------
// Feature 69 `last-imports`: the read of the investment tables that view needs.
// ---------------------------------------------------------------------------

/**
 * Feature 69: every product with what the last-imports view needs (R7). Only
 * `find*`: it writes NOTHING (R15).
 *
 * It lives here and not in the module `last-imports` because this is the only
 * file of `src/` allowed to name the investment tables
 * (`src/architecture.test.ts`). It returns EVERY product, closed ones included:
 * which are live, and their gaps, is decided there, as pure functions.
 */
export async function listProductsForLastImports(
  prisma: AppPrismaClient,
): Promise<ProductImportFacts[]> {
  const products = await prisma.investmentProduct.findMany({
    orderBy: [{ bank: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      bank: true,
      name: true,
      type: true,
      closedAt: true,
      maturityDate: true,
      lastImportedAt: true,
      valuations: { select: { date: true } },
      savingsSnapshots: { select: { date: true } },
    },
  })

  return products.map(({ valuations, savingsSnapshots, ...product }) => ({
    ...product,
    photoDates: [...valuations, ...savingsSnapshots]
      .map((photo) => photo.date)
      .sort((a, b) => a.getTime() - b.getTime()),
  }))
}
