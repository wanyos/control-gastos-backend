import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

/**
 * Crea una instancia de PrismaClient usando el driver adapter de PostgreSQL.
 *
 * En Prisma 7 la conexión a la base de datos se establece en tiempo de
 * ejecución mediante un "driver adapter" (aquí `@prisma/adapter-pg`), en lugar
 * de leer la URL desde el schema. La cadena de conexión se toma de
 * `process.env.DATABASE_URL`, que debe estar cargada antes de llamar a esta
 * función (ver `src/server.ts`, que importa `dotenv/config`).
 */
export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está definida. Copia .env.example a .env y configura la conexión a PostgreSQL.',
    )
  }

  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

/** Tipo de la instancia devuelta por `createPrismaClient`. */
export type AppPrismaClient = ReturnType<typeof createPrismaClient>
