import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Configuración del CLI de Prisma (migrate, studio, generate).
// En Prisma 7 la URL de conexión ya no vive en el schema: se define aquí
// para las tareas del CLI, y en el driver adapter para el runtime.
// El archivo .env NO se carga automáticamente; por eso importamos 'dotenv/config'.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
