import type { CategoryKind } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'

/**
 * The 16 starting categories (feature 37), verbatim from the intent of the
 * feature: 13 expense ones and 3 income ones, all roots. They came out of
 * classifying the human's 1520 real movements on 2026-09-01. A starting point,
 * not a cage: they can be renamed or deleted by API afterwards.
 */
export const defaultCategories: ReadonlyArray<{ name: string; kind: CategoryKind }> = [
  { name: 'Vivienda', kind: 'expense' },
  { name: 'Suministros', kind: 'expense' },
  { name: 'Telefonía e internet', kind: 'expense' },
  { name: 'Supermercado', kind: 'expense' },
  { name: 'Comer y beber fuera', kind: 'expense' },
  { name: 'Compras', kind: 'expense' },
  { name: 'Transporte y vehículo', kind: 'expense' },
  { name: 'Salud y deporte', kind: 'expense' },
  { name: 'Suscripciones', kind: 'expense' },
  { name: 'Impuestos y administración', kind: 'expense' },
  { name: 'Ocio', kind: 'expense' },
  { name: 'Pago de tarjeta', kind: 'expense' },
  { name: 'Transferencias a personas', kind: 'expense' },
  { name: 'Nómina', kind: 'income' },
  { name: 'Intereses', kind: 'income' },
  { name: 'Otros ingresos', kind: 'income' },
]

/**
 * Creates the starting categories that are missing and never touches a row
 * that exists: the idempotency comes from `skipDuplicates` over the unique
 * index `(parentId, kind, name)` — created NULLS NOT DISTINCT in feature 8, so
 * it also covers these roots (`parentId: null`). A second run inserts 0.
 *
 * It only runs when the human launches `pnpm run seed:categories`; nothing
 * seeds on its own. Known limit (written in the decisions sheet): re-running
 * it after renaming a seeded category re-creates the old name.
 */
export async function seedDefaultCategories(
  prisma: AppPrismaClient,
): Promise<{ created: number; skipped: number }> {
  const result = await prisma.category.createMany({
    data: defaultCategories.map((category) => ({ ...category })),
    skipDuplicates: true,
  })

  return { created: result.count, skipped: defaultCategories.length - result.count }
}
