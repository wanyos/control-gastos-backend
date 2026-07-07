import type { FastifyInstance } from 'fastify'

// Cuerpo esperado al crear un gasto.
interface CrearGastoBody {
  descripcion: string
  monto: number
  fecha?: string
  categoriaId?: number
}

const crearGastoSchema = {
  body: {
    type: 'object',
    required: ['descripcion', 'monto'],
    additionalProperties: false,
    properties: {
      descripcion: { type: 'string', minLength: 1 },
      monto: { type: 'number', exclusiveMinimum: 0 },
      fecha: { type: 'string', format: 'date-time' },
      categoriaId: { type: 'integer' },
    },
  },
} as const

/**
 * CRUD básico de gastos. Se registra con el prefijo `/api/gastos`
 * (ver `src/app.ts`), por lo que las rutas quedan como:
 *   GET    /api/gastos
 *   POST   /api/gastos
 *   GET    /api/gastos/:id
 *   DELETE /api/gastos/:id
 */
export default async function gastosRoutes(fastify: FastifyInstance) {
  // Listar todos los gastos (más recientes primero).
  fastify.get('/', async () => {
    const gastos = await fastify.prisma.gasto.findMany({
      orderBy: { fecha: 'desc' },
      include: { categoria: true },
    })
    return gastos
  })

  // Obtener un gasto por id.
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ message: 'El id debe ser un número entero' })
    }

    const gasto = await fastify.prisma.gasto.findUnique({
      where: { id },
      include: { categoria: true },
    })

    if (!gasto) {
      return reply.status(404).send({ message: 'Gasto no encontrado' })
    }

    return gasto
  })

  // Crear un gasto.
  fastify.post<{ Body: CrearGastoBody }>(
    '/',
    { schema: crearGastoSchema },
    async (request, reply) => {
      const { descripcion, monto, fecha, categoriaId } = request.body

      const gasto = await fastify.prisma.gasto.create({
        data: {
          descripcion,
          monto,
          ...(fecha ? { fecha: new Date(fecha) } : {}),
          ...(categoriaId ? { categoriaId } : {}),
        },
        include: { categoria: true },
      })

      return reply.status(201).send(gasto)
    },
  )

  // Eliminar un gasto.
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ message: 'El id debe ser un número entero' })
    }

    try {
      await fastify.prisma.gasto.delete({ where: { id } })
      return reply.status(204).send()
    } catch {
      return reply.status(404).send({ message: 'Gasto no encontrado' })
    }
  })
}
