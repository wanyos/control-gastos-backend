import type { FastifyInstance } from 'fastify'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { defaultCategories, seedDefaultCategories } from './categories.seed.js'

describe('seeding of the starting categories (feature 37)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.category.deleteMany({
      where: { parentId: null, OR: defaultCategories.map((category) => ({ ...category })) },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it('declares exactly the 16 of the intent: 13 expense and 3 income, verbatim', () => {
    expect(defaultCategories).toHaveLength(16)
    expect(defaultCategories.filter((category) => category.kind === 'expense')).toHaveLength(13)
    expect(defaultCategories.filter((category) => category.kind === 'income')).toHaveLength(3)
    expect(defaultCategories.map((category) => category.name)).toEqual([
      'Vivienda',
      'Suministros',
      'Telefonía e internet',
      'Supermercado',
      'Comer y beber fuera',
      'Compras',
      'Transporte y vehículo',
      'Salud y deporte',
      'Suscripciones',
      'Impuestos y administración',
      'Ocio',
      'Pago de tarjeta',
      'Transferencias a personas',
      'Nómina',
      'Intereses',
      'Otros ingresos',
    ])
  })

  it('creates the 16 as roots with their kind on a base without them (R13)', async () => {
    const result = await seedDefaultCategories(app.prisma)

    expect(result).toEqual({ created: 16, skipped: 0 })
    const stored = await app.prisma.category.findMany({
      where: { OR: defaultCategories.map((category) => ({ ...category })) },
    })
    expect(stored).toHaveLength(16)
    expect(stored.every((category) => category.parentId === null)).toBe(true)
    for (const expected of defaultCategories) {
      expect(
        stored.some(
          (category) => category.name === expected.name && category.kind === expected.kind,
        ),
      ).toBe(true)
    }
  })

  it('creates 0 on a second run and leaves the existing rows identical (R14)', async () => {
    await seedDefaultCategories(app.prisma)
    const firstRun = await app.prisma.category.findMany({
      where: { OR: defaultCategories.map((category) => ({ ...category })) },
      orderBy: { id: 'asc' },
    })

    const result = await seedDefaultCategories(app.prisma)

    expect(result).toEqual({ created: 0, skipped: 16 })
    const secondRun = await app.prisma.category.findMany({
      where: { OR: defaultCategories.map((category) => ({ ...category })) },
      orderBy: { id: 'asc' },
    })
    expect(secondRun.map((category) => ({ id: category.id, name: category.name }))).toEqual(
      firstRun.map((category) => ({ id: category.id, name: category.name })),
    )
  })

  it('creates only what is missing when some of the 16 already exist (R14)', async () => {
    await app.prisma.category.create({ data: { name: 'Ocio', kind: 'expense' } })
    const existing = await app.prisma.category.findFirstOrThrow({
      where: { name: 'Ocio', kind: 'expense', parentId: null },
    })

    const result = await seedDefaultCategories(app.prisma)

    expect(result).toEqual({ created: 15, skipped: 1 })
    const stored = await app.prisma.category.findMany({
      where: { name: 'Ocio', kind: 'expense', parentId: null },
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe(existing.id)
  })
})
