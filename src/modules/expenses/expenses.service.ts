import type { FastifyInstance } from 'fastify'

import { Prisma } from '../../generated/prisma/client.js'

import { NotFoundError } from '../../errors/app-error.js'
import type { AppPrismaClient } from '../../lib/prisma.js'
import type { CreateExpenseBody } from './expenses.types.js'

/**
 * Single point where the module obtains its data client. Keeps the routes
 * layer free of any data-access reference (guarded by src/architecture.test.ts).
 */
export function expensesDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}

export function listExpenses(prisma: AppPrismaClient) {
  return prisma.expense.findMany({
    orderBy: { date: 'desc' },
    include: { category: true },
  })
}

export async function getExpenseById(prisma: AppPrismaClient, id: number) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { category: true },
  })

  if (!expense) {
    throw new NotFoundError('Expense not found')
  }

  return expense
}

export function createExpense(prisma: AppPrismaClient, input: CreateExpenseBody) {
  const { description, amount, date, categoryId } = input

  return prisma.expense.create({
    data: {
      description,
      amount,
      ...(date ? { date: new Date(date) } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    include: { category: true },
  })
}

export async function deleteExpense(prisma: AppPrismaClient, id: number) {
  try {
    await prisma.expense.delete({ where: { id } })
  } catch (error) {
    // P2025: record to delete does not exist. Anything else (e.g. DB down)
    // must propagate and surface as a 500, not disguise itself as a 404.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundError('Expense not found')
    }
    throw error
  }
}
