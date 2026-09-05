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
import type {
  DepositInput,
  ExcludedFromPeriodGain,
  InvestmentProductOverview,
  InvestmentsOverviewQuery,
  InvestmentsOverviewResponse,
  ProductFileCommon,
  ProductFileInput,
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
    const { product, created } = await upsertProduct(tx, input)

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
): Promise<ProductImportResult> {
  switch (input.type) {
    case 'savings_account':
      return persistSavingsSnapshot(prisma, input)
    case 'deposit':
      return persistDeposit(prisma, input)
    default:
      return persistValuation(prisma, input)
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
    const { product, created } = await upsertProduct(tx, input)

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
    const { product, created } = await upsertProduct(tx, input, {
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
 */
async function upsertProduct(
  tx: TransactionClient,
  input: ProductFileCommon & { type: ProductFileInput['type'] },
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
