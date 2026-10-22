import type { Category, CategoryKind } from '../../generated/prisma/client.js'

export interface CreateCategoryBody {
  name: string
  kind: CategoryKind
  parentId?: number
}

/**
 * `PATCH /api/categories/:id` changes the name and/or the fixed-expense mark (F63)
 * and nothing else: kind and parentId are immutable.
 */
export interface UpdateCategoryBody {
  name?: string
  isFixed?: boolean
}

export interface CategoryIdParams {
  id: number
}

/** A root category with its (single level of) subcategories. */
export interface CategoryWithChildren extends Category {
  children: Category[]
}

/** Shape of the API contract: dates as ISO. */
export interface SerializedCategory {
  id: number
  name: string
  kind: CategoryKind
  parentId: number | null
  isFixed: boolean
  createdAt: string
  children: SerializedCategory[]
}
