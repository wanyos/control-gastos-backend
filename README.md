# gastos-backend

Backend para una aplicación de **control de gastos**, construido con
[Fastify](https://fastify.dev), **TypeScript** y [Prisma 7](https://www.prisma.io)
sobre **PostgreSQL**.

## Requisitos

- Node.js >= 20 (probado con Node 24)
- PostgreSQL (o Docker para levantarlo con `docker-compose.yml`)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env        # en Windows: copy .env.example .env
#   Edita .env y ajusta DATABASE_URL si es necesario

# 3. Levantar PostgreSQL (opcional, si usas Docker)
docker compose up -d

# 4. Crear las tablas en la base de datos
npm run prisma:migrate      # aplica las migraciones (crea la BD si no existe)

# 5. Arrancar en modo desarrollo (recarga en caliente)
npm run dev
```

El servidor queda escuchando en `http://localhost:3000` (configurable con `PORT`).

## Scripts disponibles

| Script                    | Descripción                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | Servidor en desarrollo con recarga en caliente (`tsx watch`). |
| `npm run build`           | Genera el cliente de Prisma y compila TypeScript a `dist/`.   |
| `npm start`               | Ejecuta la versión compilada (`dist/server.js`).              |
| `npm run typecheck`       | Comprueba tipos sin emitir archivos.                          |
| `npm run prisma:migrate`  | Crea y aplica migraciones (`prisma migrate dev`).             |
| `npm run prisma:generate` | Regenera el cliente de Prisma.                                |
| `npm run prisma:studio`   | Abre Prisma Studio para explorar los datos.                   |

## Endpoints

| Método   | Ruta               | Descripción                          |
| -------- | ------------------ | ------------------------------------ |
| `GET`    | `/health`          | Liveness (el proceso responde).      |
| `GET`    | `/health/db`       | Readiness (la base de datos responde). |
| `GET`    | `/api/expenses`     | Lista todos los gastos.              |
| `POST`   | `/api/expenses`     | Crea un gasto.                       |
| `GET`    | `/api/expenses/:id` | Obtiene un gasto por id.             |
| `DELETE` | `/api/expenses/:id` | Elimina un gasto.                    |

Ejemplo de creación de un gasto:

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{ "description": "Weekly groceries", "amount": 45.90, "categoryId": 1 }'
```

## Estructura del proyecto

```
gastos-backend/
├── prisma/
│   ├── schema.prisma        # Modelos de datos (Category, Expense)
│   └── migrations/          # Historial de migraciones
├── src/
│   ├── server.ts            # Punto de entrada: carga .env y arranca el servidor
│   ├── app.ts               # Construye la app Fastify (plugins + rutas)
│   ├── lib/
│   │   └── prisma.ts        # Crea el PrismaClient con el driver adapter de Postgres
│   ├── plugins/
│   │   └── prisma.ts        # Plugin que expone `fastify.prisma` y cierra la conexión
│   ├── routes/
│   │   ├── health.ts        # Rutas de estado
│   │   └── expenses.ts      # CRUD de gastos
│   └── generated/prisma/    # Cliente de Prisma generado (no se versiona)
├── prisma.config.ts         # Configuración del CLI de Prisma (Prisma 7)
├── docker-compose.yml       # PostgreSQL para desarrollo
├── tsconfig.json
└── package.json
```

## Notas sobre Prisma 7

Este proyecto usa la configuración moderna de **Prisma 7**:

- La URL de conexión **ya no vive en `schema.prisma`**. Para el CLI (`migrate`,
  `studio`) se define en `prisma.config.ts`; en tiempo de ejecución se pasa a
  `PrismaClient` mediante un **driver adapter** (`@prisma/adapter-pg`) en
  [`src/lib/prisma.ts`](src/lib/prisma.ts).
- El `.env` **no se carga automáticamente**: `prisma.config.ts` importa
  `dotenv/config`, y el servidor lo hace en la primera línea de
  [`src/server.ts`](src/server.ts).
- El cliente se genera con el generador `prisma-client` (ESM) en
  `src/generated/prisma`. El proyecto es **ESM** (`"type": "module"`), por lo
  que las importaciones relativas usan la extensión `.js`.
