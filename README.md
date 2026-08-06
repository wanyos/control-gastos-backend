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
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env        # en Windows: copy .env.example .env
#   Edita .env y ajusta DATABASE_URL si es necesario

# 3. Levantar PostgreSQL (opcional, si usas Docker)
docker compose up -d

# 4. Crear las tablas en la base de datos
pnpm run prisma:migrate      # aplica las migraciones (crea la BD si no existe)

# 5. Arrancar en modo desarrollo (recarga en caliente)
pnpm run dev
```

El servidor queda escuchando en `http://localhost:3000` (configurable con `PORT`).

## Scripts disponibles

| Script                    | Descripción                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `pnpm run dev`             | Servidor en desarrollo con recarga en caliente (`tsx watch`). |
| `pnpm run build`           | Genera el cliente de Prisma y compila TypeScript a `dist/`.   |
| `pnpm start`               | Ejecuta la versión compilada (`dist/server.js`).              |
| `pnpm test`                | Suite completa con Vitest (requiere PostgreSQL levantado).    |
| `pnpm run typecheck`       | Comprueba tipos sin emitir archivos.                          |
| `pnpm run lint`            | ESLint sobre el proyecto (`lint:fix` para autocorregir).      |
| `pnpm run format:check`    | Prettier en modo comprobación (`format` para escribir).       |
| `pnpm run prisma:migrate`  | Crea y aplica migraciones (`prisma migrate dev`).             |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma.                                |
| `pnpm run prisma:studio`   | Abre Prisma Studio para explorar los datos.                   |

> `bash ./init.sh` lo ejecuta todo de una vez (typecheck + suite) y es la
> verificación que debe quedar en verde antes de cerrar cualquier feature.

## Endpoints

El contrato completo (cuerpos, respuestas y errores) vive en
[`docs/api-contract.md`](docs/api-contract.md); esta tabla es solo el índice.

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET`  | `/health`               | Liveness (el proceso responde). |
| `GET`  | `/health/db`            | Readiness (la base de datos responde). |
| `GET`  | `/health/drive`         | Comprobación de la conexión con Google Drive. |
| `POST` | `/api/accounts`         | Crea una cuenta bancaria (`iban` y `bank` obligatorios). |
| `GET`  | `/api/accounts`         | Lista las cuentas, cada una con su `balance`. |
| `GET`  | `/api/accounts/:id`     | Una cuenta por id. |
| `POST` | `/api/categories`       | Crea una categoría raíz o una subcategoría (un solo nivel). |
| `GET`  | `/api/categories`       | Las categorías raíz con sus `children`. |
| `GET`  | `/api/movements`        | Lista los movimientos, del más reciente al más antiguo. |
| `GET`  | `/api/ingesta/pending`  | Archivos de banco pendientes en Drive. |
| `POST` | `/api/ingesta/process`  | Descarga los pendientes y los mueve a `procesados/`. |
| `POST` | `/api/parser/bankinter` | Parsea un extracto `.xlsx` de Bankinter a movimientos. |

> ⚠️ **`/api/movements` es de solo lectura.** No hay alta ni borrado de
> movimientos por API: entran únicamente por importación desde los ficheros del
> banco. Si un movimiento existe, existe en el banco y llegará en su fichero.

Ejemplo de creación de una cuenta:

```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{ "iban": "ES9820385778983000760236", "bank": "bankinter" }'
```

## Estructura del proyecto

El código se organiza **por recurso** (vertical slice): cada módulo lleva su ruta,
su servicio, sus schemas y sus tipos juntos. El detalle y el porqué están en
[`docs/architecture.md`](docs/architecture.md).

```
gastos-backend/
├── prisma/
│   ├── schema.prisma        # Modelos de datos (Account, Category, Movement)
│   └── migrations/          # Historial de migraciones
├── src/
│   ├── server.ts            # Punto de entrada: carga .env y arranca el servidor
│   ├── app.ts               # Construye la app Fastify (plugins + módulos)
│   ├── config/              # Configuración por entorno, validada al arrancar
│   ├── errors/              # Clases de error de dominio (AppError y subclases)
│   ├── lib/                 # Fábricas de infraestructura (Prisma, Drive)
│   ├── plugins/             # Plugins Fastify (prisma, drive, error-handler)
│   ├── modules/             # Un directorio por recurso
│   │   ├── accounts/        #   Cuentas bancarias
│   │   ├── categories/      #   Catálogo de categorías (un nivel de subcategoría)
│   │   ├── movements/       #   Movimientos: SOLO LECTURA + helpers de dominio
│   │   ├── ingesta/         #   Lectura de archivos de banco desde Drive
│   │   ├── bankinter/       #   Parser del extracto .xlsx de Bankinter
│   │   └── health/          #   Rutas de estado
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
