import type { CategoryKind } from '../../generated/prisma/client.js'

import type { AppPrismaClient } from '../../lib/prisma.js'
import { normalizeForMatch } from './category-rules.service.js'

/**
 * The STARTING DRAFT of categorization rules (feature 43, R15), written from
 * scratch for this feature: the concrete rules of the 2026-09-01 analysis were
 * never written down (checked on 2026-09-06; only the 16 categories exist).
 *
 * Every matchText here is a PUBLIC brand or an everyday Spanish statement word
 * of one or two words — NEVER a literal concept copied from the human's real
 * statements (`var/` was not opened to write this list; see design §5 and
 * ADR-017). It is a draft to be corrected by API, not an encyclopedia: the
 * human adds, changes and deletes rules through `/api/category-rules` and
 * re-runs `POST /api/category-rules/apply`.
 *
 * Category names must match `defaultCategories` (categories.seed.ts) roots; a
 * name that no longer exists (renamed) is reported, never invented.
 */
export const defaultCategoryRules: ReadonlyArray<{
  categoryName: string
  kind: CategoryKind
  matchText: string
}> = [
  // Vivienda
  { categoryName: 'Vivienda', kind: 'expense', matchText: 'alquiler' },
  { categoryName: 'Vivienda', kind: 'expense', matchText: 'hipoteca' },
  { categoryName: 'Vivienda', kind: 'expense', matchText: 'comunidad' },
  // Suministros
  { categoryName: 'Suministros', kind: 'expense', matchText: 'iberdrola' },
  { categoryName: 'Suministros', kind: 'expense', matchText: 'endesa' },
  { categoryName: 'Suministros', kind: 'expense', matchText: 'naturgy' },
  { categoryName: 'Suministros', kind: 'expense', matchText: 'holaluz' },
  // Telefonía e internet
  { categoryName: 'Telefonía e internet', kind: 'expense', matchText: 'movistar' },
  { categoryName: 'Telefonía e internet', kind: 'expense', matchText: 'vodafone' },
  { categoryName: 'Telefonía e internet', kind: 'expense', matchText: 'orange' },
  { categoryName: 'Telefonía e internet', kind: 'expense', matchText: 'pepephone' },
  { categoryName: 'Telefonía e internet', kind: 'expense', matchText: 'lowi' },
  // Supermercado
  { categoryName: 'Supermercado', kind: 'expense', matchText: 'mercadona' },
  { categoryName: 'Supermercado', kind: 'expense', matchText: 'carrefour' },
  { categoryName: 'Supermercado', kind: 'expense', matchText: 'lidl' },
  { categoryName: 'Supermercado', kind: 'expense', matchText: 'aldi' },
  { categoryName: 'Supermercado', kind: 'expense', matchText: 'alcampo' },
  { categoryName: 'Supermercado', kind: 'expense', matchText: 'eroski' },
  // Comer y beber fuera
  { categoryName: 'Comer y beber fuera', kind: 'expense', matchText: 'mcdonalds' },
  { categoryName: 'Comer y beber fuera', kind: 'expense', matchText: 'burger king' },
  { categoryName: 'Comer y beber fuera', kind: 'expense', matchText: 'telepizza' },
  { categoryName: 'Comer y beber fuera', kind: 'expense', matchText: 'glovo' },
  { categoryName: 'Comer y beber fuera', kind: 'expense', matchText: 'just eat' },
  { categoryName: 'Comer y beber fuera', kind: 'expense', matchText: 'starbucks' },
  // Compras
  { categoryName: 'Compras', kind: 'expense', matchText: 'amazon' },
  { categoryName: 'Compras', kind: 'expense', matchText: 'zara' },
  { categoryName: 'Compras', kind: 'expense', matchText: 'decathlon' },
  { categoryName: 'Compras', kind: 'expense', matchText: 'corte ingles' },
  { categoryName: 'Compras', kind: 'expense', matchText: 'aliexpress' },
  { categoryName: 'Compras', kind: 'expense', matchText: 'ikea' },
  // Transporte y vehículo
  { categoryName: 'Transporte y vehículo', kind: 'expense', matchText: 'renfe' },
  { categoryName: 'Transporte y vehículo', kind: 'expense', matchText: 'cabify' },
  { categoryName: 'Transporte y vehículo', kind: 'expense', matchText: 'uber' },
  { categoryName: 'Transporte y vehículo', kind: 'expense', matchText: 'cepsa' },
  { categoryName: 'Transporte y vehículo', kind: 'expense', matchText: 'galp' },
  // Salud y deporte
  { categoryName: 'Salud y deporte', kind: 'expense', matchText: 'farmacia' },
  { categoryName: 'Salud y deporte', kind: 'expense', matchText: 'gimnasio' },
  { categoryName: 'Salud y deporte', kind: 'expense', matchText: 'clinica' },
  { categoryName: 'Salud y deporte', kind: 'expense', matchText: 'basic fit' },
  // Suscripciones
  { categoryName: 'Suscripciones', kind: 'expense', matchText: 'netflix' },
  { categoryName: 'Suscripciones', kind: 'expense', matchText: 'spotify' },
  { categoryName: 'Suscripciones', kind: 'expense', matchText: 'hbo' },
  { categoryName: 'Suscripciones', kind: 'expense', matchText: 'disney plus' },
  { categoryName: 'Suscripciones', kind: 'expense', matchText: 'prime video' },
  // Impuestos y administración
  { categoryName: 'Impuestos y administración', kind: 'expense', matchText: 'agencia tributaria' },
  { categoryName: 'Impuestos y administración', kind: 'expense', matchText: 'ayuntamiento' },
  { categoryName: 'Impuestos y administración', kind: 'expense', matchText: 'seguridad social' },
  { categoryName: 'Impuestos y administración', kind: 'expense', matchText: 'dgt' },
  // Ocio
  { categoryName: 'Ocio', kind: 'expense', matchText: 'cinesa' },
  { categoryName: 'Ocio', kind: 'expense', matchText: 'yelmo' },
  { categoryName: 'Ocio', kind: 'expense', matchText: 'ticketmaster' },
  { categoryName: 'Ocio', kind: 'expense', matchText: 'steam' },
  { categoryName: 'Ocio', kind: 'expense', matchText: 'playstation' },
  // Pago de tarjeta
  { categoryName: 'Pago de tarjeta', kind: 'expense', matchText: 'pago tarjeta' },
  { categoryName: 'Pago de tarjeta', kind: 'expense', matchText: 'recibo tarjeta' },
  // Transferencias a personas
  { categoryName: 'Transferencias a personas', kind: 'expense', matchText: 'bizum' },
  // Nómina
  { categoryName: 'Nómina', kind: 'income', matchText: 'nomina' },
  // Intereses
  { categoryName: 'Intereses', kind: 'income', matchText: 'intereses' },
  { categoryName: 'Intereses', kind: 'income', matchText: 'remuneracion' },
  // Otros ingresos
  { categoryName: 'Otros ingresos', kind: 'income', matchText: 'devolucion' },
  { categoryName: 'Otros ingresos', kind: 'income', matchText: 'reembolso' },
]

/**
 * Creates the starting rules that are missing and never touches an existing
 * row: the idempotency comes from `createMany({ skipDuplicates: true })` over
 * the `@unique` on `matchText` — same mechanism as the F37 categories seed. A
 * second run inserts 0 (R15).
 *
 * Each rule resolves its `categoryName + kind` to a ROOT category id; a
 * category that does not exist (the human renamed it) is skipped and reported
 * in `missingCategories` instead of failing the whole run. It only runs when
 * the human launches `pnpm run seed:category-rules`; nothing seeds on its own
 * (neither the migration nor the app start).
 */
export async function seedDefaultCategoryRules(prisma: AppPrismaClient): Promise<{
  created: number
  skipped: number
  missingCategories: string[]
}> {
  const roots = await prisma.category.findMany({
    where: { parentId: null },
    select: { id: true, name: true, kind: true },
  })
  const idByNameAndKind = new Map(roots.map((root) => [`${root.kind}:${root.name}`, root.id]))

  const missing = new Set<string>()
  const rows: Array<{ categoryId: number; matchText: string }> = []
  for (const rule of defaultCategoryRules) {
    const categoryId = idByNameAndKind.get(`${rule.kind}:${rule.categoryName}`)
    if (categoryId === undefined) {
      missing.add(rule.categoryName)
      continue
    }
    // The list is written normalized already; normalizing again costs nothing
    // and keeps the stored-normalized invariant unbreakable from here.
    rows.push({ categoryId, matchText: normalizeForMatch(rule.matchText) })
  }

  const result = await prisma.categoryRule.createMany({ data: rows, skipDuplicates: true })

  return {
    created: result.count,
    skipped: rows.length - result.count,
    missingCategories: [...missing],
  }
}
