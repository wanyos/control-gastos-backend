# gastos-backend

Backend para una aplicación de **control de gastos**, construido con
[Fastify](https://fastify.dev), **TypeScript** y [Prisma 7](https://www.prisma.io)
sobre **PostgreSQL**.

## Requisitos

- Node.js >= 24 (probado con Node 24.18). vitest 5 exige `^22.12` y `@googleapis/drive` 25 exige `>=22`, y la carga del `.env` usa `process.loadEnvFile()`, estable desde Node 24.10
- PostgreSQL (o Docker para levantarlo con `docker-compose.yml`). La suite y los
  comandos `db:backup` y `db:restore` sí necesitan Docker: usan el contenedor
  `gastos-postgres` de `docker-compose.yml`

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
| `pnpm test`                | Suite completa con Vitest. Necesita PostgreSQL levantado, pero **no escribe en tu base**: cada worker usa una base desechable `gastos_test_<n>` (F27). Desde la F55 necesita además Docker: los tests de la copia de la base de datos ejecutan `docker exec gastos-postgres`. |
| `pnpm run typecheck`       | Comprueba tipos sin emitir archivos.                          |
| `pnpm run lint`            | oxlint sobre el proyecto (`lint:fix` para autocorregir).      |
| `pnpm run format:check`    | Prettier en modo comprobación (`format` para escribir).       |
| `pnpm run prisma:migrate`  | Crea y aplica migraciones (`prisma migrate dev`).             |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma.                                |
| `pnpm run prisma:studio`   | Abre Prisma Studio para explorar los datos.                   |
| `pnpm run parse-file <banco> <ruta-del-archivo>` | Pasa **un** archivo de tu disco por el parser de ese banco y enseña solo recuentos y forma (cuántos movimientos, qué filas no se leyeron, si trae IBAN y saldo, primera y última fecha). No guarda nada, no toca la base ni Drive y no imprime importes ni conceptos. |
| `pnpm run db:backup` | Saca una copia completa de la base de datos y la sube, como un archivo nuevo con la fecha y la hora en el nombre, a la carpeta de Drive de `GOOGLE_DRIVE_BACKUP_FOLDER_ID`. No deja ningún archivo en el disco y no borra las copias anteriores. Necesita Docker en marcha. Pasos: [`docs/database-backup.md`](docs/database-backup.md). |
| `pnpm run db:restore` | Sin argumentos, lista las copias que hay en esa carpeta. Con `<archivo> <base>`, restaura esa copia en esa base de datos; si la base ya tiene tablas, pide escribir su nombre en el terminal y conserva lo que había como `<base>_before_restore_<fecha y hora>`. Necesita Docker en marcha. Pasos: [`docs/database-backup.md`](docs/database-backup.md). |

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
| `GET`    | `/api/movements`               | Lista los movimientos, del más reciente al más antiguo. Filtra por cuenta, fechas, tipo, estado, **categoría**, **«sin categoría»**, **texto de la descripción** (sin mayúsculas ni tildes), **si es pierna de un traspaso** (`transfer`) y **si está marcado como que no cuenta en las sumas** (`excluded`). |
| `PATCH`  | `/api/movements`               | Cambia la categoría, el estado de revisión y/o la marca `excludedFromTotals` de **varios movimientos a la vez** (hasta 200 ids por petición, todo o nada). |
| `PATCH`  | `/api/movements/:id`           | Cambia **solo** la categoría, el estado de revisión y/o la marca `excludedFromTotals` (`true` saca el movimiento de las sumas de ingresos y gastos). El hecho bancario (importe, fechas, descripción) no se toca. |
| `POST`   | `/api/transfers`               | Enlaza **a mano** dos movimientos como las dos piernas de un traspaso entre cuentas propias. No crea ni borra movimientos. |
| `DELETE` | `/api/transfers/:transferId`   | Deshace una pareja de traspaso y apunta el veto para que la detección no vuelva a juntar a esas dos. |
| `GET`    | `/api/transfers`               | Todas las parejas de traspaso enlazadas, con sus dos piernas. Sin paginar. Solo lectura. |
| `GET`    | `/api/transfers/ambiguous`     | Los grupos de movimientos que parecen traspasos pero la detección no puede emparejar sin ambigüedad, calculados en el momento. Solo lectura. |
| `GET`    | `/api/overview`                | Cuánto dinero hay en total, cómo se reparte entre las cuentas, y qué entró, salió y quedó en un mes. |
| `GET`    | `/api/net-worth`               | El patrimonio neto **de hoy**: saldo de las cuentas más el valor de las inversiones, con su desglose y los avisos del dato incompleto. |
| `GET`    | `/api/investments/overview`    | Las inversiones del mes: la foto de cada producto, cuánto cambió desde la anterior y la ganancia del periodo. |
| `GET`    | `/api/investments/deposits`    | Cada depósito con su archivo de producto y, si ya venció, lo que generó (importe del vencimiento menos el principal), con el total. Solo lectura. |
| `GET`    | `/api/ingestion/pending`       | Archivos de banco pendientes en Drive. |
| `POST`   | `/api/import`                  | **Importa:** descarga, parsea, guarda los movimientos y solo entonces mueve el archivo a `procesados/`. |

> **Un solo camino para los archivos de banco.** `POST /api/import` descarga cada
> archivo de Drive a memoria, lo parsea, **guarda** y solo entonces lo mueve a
> `procesados/`. El backend **no deja ninguna copia en el disco**. Para ver qué
> entiende un parser de un archivo sin importarlo hay un comando de terminal,
> `pnpm run parse-file` (ver §Scripts disponibles).
>
> ⚠️ **Breaking change (2026-10-02, feature 52):** se han retirado **ocho rutas**, las
> que solo trabajaban con una copia de los archivos en el disco. Responden 404. La
> lista, y qué se usa ahora en lugar de cada una, está en
> [`docs/api-contract.md`](docs/api-contract.md) §Rutas retiradas. El frontend no
> llamaba a ninguna.

> **Los filtros por categoría y por texto de `GET /api/movements` y el
> `PATCH /api/movements` en bloque (feature 47, 2026-09-18) son lo que el
> frontend necesita** para su pantalla de revisión (su etapa E6) y para parte de
> su vista de extracto (su etapa E7).

> ⚠️ **`/api/movements` es de solo lectura.** No hay alta ni borrado de
> movimientos por API: entran únicamente por importación desde los ficheros del
> banco. Si un movimiento existe, existe en el banco y llegará en su fichero.

> ⚠️ **Breaking change (2026-08-12, feature 12):** las rutas en español
> `/api/ingesta/*` **ya no existen** (responden 404); son ahora
> `/api/ingestion/*`. Y mover un archivo a `procesados/` es desde entonces
> consecuencia de **guardar** sus movimientos, y eso lo hace `POST /api/import`.

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
│   │   ├── backup/          #   Copia de la base de datos a Drive y su restauración (sin rutas)
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
- El `.env` **no se carga automáticamente**: lo carga
  [`src/lib/load-env-file.ts`](src/lib/load-env-file.ts), que llama a
  `process.loadEnvFile()` de Node (sin dependencia externa) y no hace nada si el
  archivo no existe. Lo importan en su primera línea `prisma.config.ts` y
  [`src/server.ts`](src/server.ts).
- El cliente se genera con el generador `prisma-client` (ESM) en
  `src/generated/prisma`. El proyecto es **ESM** (`"type": "module"`), por lo
  que las importaciones relativas usan la extensión `.js`.
