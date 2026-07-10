import type { FastifyInstance } from 'fastify'

// Expected body when creating an expense.
interface CreateExpenseBody {
  description: string
  amount: number
  date?: string
  categoryId?: number
}

const createExpenseSchema = {
  body: {
    type: 'object',
    required: ['description', 'amount'],
    additionalProperties: false,
    properties: {
      description: { type: 'string', minLength: 1 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string', format: 'date-time' },
      categoryId: { type: 'integer' },
    },
  },
} as const

/**
 * Basic CRUD for expenses. Registered under the `/api/expenses` prefix
 * (see `src/app.ts`), so the routes resolve to:
 *   GET    /api/expenses
 *   POST   /api/expenses
 *   GET    /api/expenses/:id
 *   DELETE /api/expenses/:id
 */
export default async function expenseRoutes(fastify: FastifyInstance) {
  // List all expenses (most recent first).
  fastify.get('/', async () => {
    const expenses = await fastify.prisma.expense.findMany({
      orderBy: { date: 'desc' },
      include: { category: true },
    })
    return expenses
  })

  // Get an expense by id.
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ message: 'The id must be an integer' })
    }

    const expense = await fastify.prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    })

    if (!expense) {
      return reply.status(404).send({ message: 'Expense not found' })
    }

    return expense
  })

  // Create an expense.
  fastify.post<{ Body: CreateExpenseBody }>(
    '/',
    { schema: createExpenseSchema },
    async (request, reply) => {
      const { description, amount, date, categoryId } = request.body

      const expense = await fastify.prisma.expense.create({
        data: {
          description,
          amount,
          ...(date ? { date: new Date(date) } : {}),
          ...(categoryId ? { categoryId } : {}),
        },
        include: { category: true },
      })

      return reply.status(201).send(expense)
    },
  )

  // Delete an expense.
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ message: 'The id must be an integer' })
    }

    try {
      await fastify.prisma.expense.delete({ where: { id } })
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ message: 'Expense not found' })
    }
  })
}
