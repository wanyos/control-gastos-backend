export interface CreateExpenseBody {
  description: string
  amount: number
  date?: string
  categoryId?: number
}

export interface ExpenseIdParams {
  id: number // AJV coerces the ':id' path param to integer via the params schema
}
