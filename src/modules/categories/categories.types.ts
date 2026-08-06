import type { Category, CategoryKind } from '../../generated/prisma/client.js'

export interface CreateCategoryBody {
  name: string
  kind: CategoryKind
  parentId?: number
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
  createdAt: string
  children: SerializedCategory[]
}
