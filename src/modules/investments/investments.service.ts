import { ValidationError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type { ProductImportResult, SavingsSnapshotInput } from './investments.types.js'

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
    const existing = await tx.investmentProduct.findUnique({
      where: { bank_name: { bank: input.bank, name: input.name } },
      select: { id: true, type: true },
    })

    // A product that already exists with ANOTHER type is not this account: the
    // photo would land on a fund or a deposit, which R3 forbids. Refusing is
    // what keeps the rule true; converting the product in silence would not.
    if (existing && existing.type !== 'savings_account') {
      throw new ValidationError(
        `ya existe un producto '${input.name}' en ${input.bank} de tipo '${existing.type}': ` +
          'una cuenta remunerada no puede reutilizar su nombre. Cambia el "name" del archivo.',
      )
    }

    const product = await tx.investmentProduct.upsert({
      where: { bank_name: { bank: input.bank, name: input.name } },
      create: {
        bank: input.bank,
        name: input.name,
        type: 'savings_account',
        currency: input.currency,
        openedAt: toDateOnly(input.openedAt),
        closedAt: input.closedAt === null ? null : toDateOnly(input.closedAt),
      },
      update: {
        type: 'savings_account',
        currency: input.currency,
        openedAt: toDateOnly(input.openedAt),
        closedAt: input.closedAt === null ? null : toDateOnly(input.closedAt),
      },
    })

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
      product: {
        id: product.id,
        bank: product.bank,
        name: product.name,
        type: product.type,
        // Read BEFORE the upsert, inside the same transaction: comparing
        // `createdAt` with `updatedAt` would depend on the clock resolution.
        created: existing === null,
      },
      snapshot: { date: input.date, created: previousSnapshot === null },
    }
  })
}

/**
 * A date-only column is built with an explicit `T00:00:00.000Z`: a local
 * `new Date('YYYY-MM-DD')` shifts the day in a negative timezone.
 */
function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}
