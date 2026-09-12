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
| `pnpm test`                | Suite completa con Vitest. Necesita PostgreSQL levantado, pero **no escribe en tu base**: cada worker usa una base desechable `gastos_test_<n>` (F27). |
| `pnpm run typecheck`       | Comprueba tipos sin emitir archivos.                          |
| `pnpm run lint`            | oxlint sobre el proyecto (`lint:fix` para autocorregir).      |
| `pnpm run format:check`    | Prettier en modo comprobación (`format` para escribir).       |
| `pnpm run prisma:migrate`  | Crea y aplica migraciones (`prisma migrate dev`).             |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma.                                |
| `pnpm run prisma:studio`   | Abre Prisma Studio para explorar los datos.                   |

> `bash ./init.sh` lo ejecuta todo de una vez (typecheck + suite) y es la
> verificación que debe quedar en verde antes de cerrar cualquier feature.

## Endpoints

El contrato completo (cuerpos, respuestas y errores) vive en
[`docs/api-contract.md`](docs/api-contract.md); esta tabla es solo el índice.

| Método   | Ruta                           | Descripción |
| -------- | ------------------------------ | ----------- |
| `GET`    | `/health`                      | Liveness (el proceso responde). |
| `GET`    | `/health/db`                   | Readiness (la base de datos responde). |
| `GET`    | `/health/drive`                | Comprobación de la conexión con Google Drive. |
| `POST`   | `/api/accounts`                | Crea una cuenta bancaria (`iban` y `bank` obligatorios). |
| `GET`    | `/api/accounts`                | Lista las cuentas, cada una con su `balance`. |
| `GET`    | `/api/accounts/:id`            | Una cuenta por id. |
| `POST`   | `/api/categories`              | Crea una categoría raíz o una subcategoría (un solo nivel). |
| `GET`    | `/api/categories`              | Las categorías raíz con sus `children`. |
| `PATCH`  | `/api/categories/:id`          | Renombra una categoría: **solo el `name`**; `kind` y `parentId` son inmutables. |
| `DELETE` | `/api/categories/:id`          | Borra una categoría **solo si está libre**: sin movimientos, sin subcategorías y sin reglas que la usen. |
| `POST`   | `/api/category-rules`          | Crea una regla de categorización: «si el concepto del movimiento contiene este texto, ponle esta categoría». |
| `GET`    | `/api/category-rules`          | Todas las reglas, cada una con su categoría embebida. |
| `PATCH`  | `/api/category-rules/:id`      | Cambia `matchText` y/o `categoryId` de una regla. **No des-categoriza** lo que ya asignó. |
| `DELETE` | `/api/category-rules/:id`      | Borra la regla sin modificar ningún movimiento. |
| `POST`   | `/api/category-rules/apply`    | Ejecuta **bajo demanda** la pasada de categorización sobre los movimientos elegibles (sin categoría y sin confirmar). |
| `GET`    | `/api/movements`               | Lista los movimientos, del más reciente al más antiguo. |
| `PATCH`  | `/api/movements/:id`           | Cambia **solo** la categoría y/o el estado de revisión. El hecho bancario (importe, fechas, descripción) no se toca. |
| `POST`   | `/api/transfers`               | Enlaza **a mano** dos movimientos como las dos piernas de un traspaso entre cuentas propias. No crea ni borra movimientos. |
| `DELETE` | `/api/transfers/:transferId`   | Deshace una pareja de traspaso y apunta el veto para que la detección no vuelva a juntar a esas dos. |
| `GET`    | `/api/overview`                | Cuánto dinero hay en total, cómo se reparte entre las cuentas, y qué entró, salió y quedó en un mes. |
| `GET`    | `/api/net-worth`               | El patrimonio neto **de hoy**: saldo de las cuentas más el valor de las inversiones, con su desglose y los avisos del dato incompleto. |
| `GET`    | `/api/investments/overview`    | Las inversiones del mes: la foto de cada producto, cuánto cambió desde la anterior y la ganancia del periodo. |
| `GET`    | `/api/ingestion/pending`       | Archivos de banco pendientes en Drive. |
| `POST`   | `/api/ingestion/process`       | Descarga los pendientes y guarda una copia local. **No mueve nada.** |
| `POST`   | `/api/import`                  | **Importa:** descarga, parsea, guarda los movimientos y solo entonces mueve el archivo a `procesados/`. |
| `POST`   | `/api/import/local`            | **Reimporta desde la copia local** de `var/drive-read/`, sin cliente de Drive: no descarga, no mueve y no borra nada. Es la vuelta atrás cuando un archivo ya está en `procesados/`. |
| `POST`   | `/api/parser/bankinter`        | Parsea un extracto `.xlsx` de Bankinter a movimientos (**ensayo**: vuelca a `var/parsed/`, sin BD). |
| `POST`   | `/api/parser/myinvestor`       | Parsea el extracto `.csv` y los `.json` de producto de MyInvestor (ensayo, sin BD). |
| `POST`   | `/api/parser/n26`              | Parsea un extracto `.csv` de N26 (ensayo, sin BD). |
| `POST`   | `/api/parser/openbank`         | Parsea un extracto `.xls` de Openbank —que por dentro es HTML— (ensayo, sin BD). |
| `POST`   | `/api/parser/trade-republic`   | Parsea el `.json` de cuenta remunerada escrito a mano; su `.pdf` se ignora (ensayo, sin BD). |

> **Dos caminos, y conviene no confundirlos.** `POST /api/parser/<banco>` es el
> **ensayo**: lee el archivo, vuelca a `var/parsed/` lo que ha entendido y **no toca la
> base de datos**. `POST /api/import` es el camino de verdad: parsea, **guarda** y solo
> entonces mueve el archivo a `procesados/`.

> ⚠️ **`/api/movements` es de solo lectura.** No hay alta ni borrado de
> movimientos por API: entran únicamente por importación desde los ficheros del
> banco. Si un movimiento existe, existe en el banco y llegará en su fichero.

> ⚠️ **Breaking change (2026-08-12, feature 12):** las rutas en español
> `/api/ingesta/*` **ya no existen** (responden 404); son ahora
> `/api/ingestion/*`. Y `POST /api/ingestion/process` **ha dejado de mover** los
> archivos a `procesados/`: mover es ahora consecuencia de **guardar** los
> movimientos, y eso lo hace `POST /api/import`. Ese endpoint sigue existiendo
> porque es lo que permite inspeccionar el archivo de un banco del que todavía no
> hay parser.

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
│   ├── schema.prisma        # Modelos: Account, Category, CategoryRule, Movement,
│   │                        #   InvestmentProduct, Valuation, SavingsSnapshot
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
│   │   ├── category-rules/  #   Reglas de categorización automática y su pasada
│   │   ├── movements/       #   Movimientos: SOLO LECTURA + categoría y estado de revisión
│   │   ├── transfers/       #   Enlace y desenlace manual de las piernas de un traspaso
│   │   ├── overview/        #   Vista del mes: dinero por cuenta y entradas/salidas
│   │   ├── net-worth/       #   Patrimonio neto de hoy: cuentas + inversiones
│   │   ├── ingestion/       #   Lectura de archivos de banco desde Drive (no mueve)
│   │   ├── import/          #   Importador: Drive -> parser -> base de datos
│   │   ├── bankinter/       #   Parser del extracto .xlsx de Bankinter
│   │   ├── myinvestor/      #   Parsers de MyInvestor: extracto .csv y .json de producto
│   │   ├── n26/             #   Parser del extracto .csv de N26
│   │   ├── openbank/        #   Parser del extracto .xls de Openbank (por dentro, HTML)
│   │   ├── trade-republic/  #   Parser del .json de cuenta remunerada escrito a mano
│   │   ├── investments/     #   Productos de inversión: el ÚNICO que escribe en sus tablas
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
