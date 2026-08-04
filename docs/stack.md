# Stack del proyecto

> **Rellenado a partir de la inspección del repo** (`package.json`,
> `tsconfig.json`, `prisma/`, `docker-compose.yml`, `src/`). Son datos
> descubribles del proyecto real, no propuestas. Actualízalo si cambia el stack.

## Lenguaje

- **TypeScript** (`typescript@^6.0.3`), compilado a **ES2022**.
- **Modo estricto activado.** `tsconfig.json` con `"strict": true`,
  `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.
- Proyecto **ESM** (`"type": "module"` en `package.json`): las importaciones
  relativas usan extensión `.js` (ej. `import { buildApp } from './app.js'`).

## Framework / Runtime

- **Framework:** Fastify `^5.11.2`.
- **Runtime:** Node.js — probado con `v24.11.0`; `engines.node` exige `>=20`.

## Librerías clave

- **ORM / DB:** Prisma `^7.9.1` (CLI `prisma` + `@prisma/client`), conectado
  con el **driver adapter** `@prisma/adapter-pg@^7.9.1` sobre `pg@^8.22.0`.
  El cliente se genera en `src/generated/prisma/` (generador `prisma-client`, ESM).
- **Validación de schemas:** JSON Schema **nativo de Fastify** (AJV integrado).
  No hay Zod/Typebox instalado; los schemas viven en el `*.schema.ts` de cada
  módulo (ej. `createExpenseSchema` en
  [`src/modules/expenses/expenses.schema.ts`](../src/modules/expenses/expenses.schema.ts)).
- **Encapsulación de plugins:** `fastify-plugin@^6.0.0`.
- **Google Drive:** `@googleapis/drive@^21.0.0` (cliente Drive v3 + `auth`
  reexportado; **no** se declara `google-auth-library` aparte, ver ADR-007). Se
  eligió frente al monolito `googleapis` (~85x más pesado) por peso. Auth OAuth2
  con refresh token; el cliente se expone como `fastify.drive`.
- **Carga de entorno:** `dotenv@^17.4.2` (Prisma 7 no autocarga `.env`).
- **Lectura de `.xlsx`:** `exceljs@^4.4.0` (MIT). Lee el extracto `.xlsx` de
  Bankinter (feature 6 `bankinter-parser`) desde un `Buffer` y **escribe** libros
  en memoria, lo que permite generar los fixtures sintéticos de test en código
  (sin datos reales ni red). Se eligió frente a SheetJS `xlsx`, cuya versión
  publicada en npm está **congelada en 0.18.5** con CVEs sin parchear (las
  versiones corregidas solo viven en el CDN de SheetJS, lo que rompería el flujo
  pnpm/lockfile). Coste asumido: árbol de dependencias más pesado (`jszip`,
  `unzipper`, `archiver`, `fast-csv`, `saxes`, `dayjs`). Ver ADR-010. El parser
  vive en `src/modules/bankinter/` y **no** toca Prisma ni la BD.
- **Estado / routing cliente / estilos:** N/A (backend sin UI).

## Build / Dev tooling

- **Gestor de paquetes:** **pnpm** `11.10.0`, fijado en el campo
  `packageManager` de `package.json`. El lockfile versionado es
  `pnpm-lock.yaml`; `init.sh` detecta el gestor por el lockfile y corre
  `pnpm test`. **Usa siempre `pnpm`, nunca `npm`**: mezclarlos genera un
  `node_modules` distinto del que valida `init.sh`.
- **Arranque dev (recarga en caliente):** `pnpm run dev` → `tsx watch src/server.ts`
  (`tsx@^4.23.5`).
- **Build:** `pnpm run build` → `prisma generate && tsc` (salida a `dist/`).
- **Arranque producción:** `pnpm start` → `node dist/server.js`.
- **Type check:** `pnpm run typecheck` → `tsc --noEmit`.
- **Lint:** `pnpm run lint` → `eslint .` (ESLint `10.7.0` flat config +
  `typescript-eslint` 8 sobre `src/**/*.ts`, `eslint-config-prettier` al
  final; ignora `src/generated/` y `dist/`). `lint:fix` para autofix.
- **Format:** `pnpm run format:check` / `format` → Prettier `3.9.5`
  (`.prettierrc`: comillas simples, sin punto y coma, 2 espacios,
  100 columnas). `.prettierignore` excluye artefactos generados, el
  lockfile, los `.md` del harness y `feature_list.json`.

## Testing

- **Test runner:** **Vitest** `^4.1.10` (elegido 2026-07-10; alternativa
  `node:test` descartada por requerir cablear el loader tsx a mano).
  - `pnpm test` → `vitest run` (suite completa, la ejecuta también `./init.sh`).
  - `pnpm run test:watch` → `vitest` (modo watch en desarrollo).
- **Config:** `vitest.config.ts` — `environment: 'node'`, `.env` cargado vía
  `setupFiles: ['dotenv/config']` (mismo mecanismo que producción),
  `LOG_LEVEL=silent` para no ensuciar la salida.
- **Estilo:** tests de integración con `buildApp()` + `app.inject()` de
  Fastify contra el PostgreSQL real, sin mocks; limpian las filas que crean.
- **Ubicación:** junto al archivo bajo test (ej.
  `src/modules/expenses/expenses.test.ts`), según `docs/conventions.md` §Tests.

## Base de datos / Persistencia

- **Motor:** PostgreSQL **17** (imagen `postgres:17-alpine` en `docker-compose.yml`).
- **Local:** `docker compose up -d` levanta el contenedor `gastos-postgres`
  en **`localhost:5434`** (BD `gastos`, credenciales `postgres` / `postgres`).
- **Por qué 5434 y no 5432 (decidido por el humano, 2026-07-10):** en esta
  máquina `5432` lo ocupa un PostgreSQL 17.6 nativo de Windows (servicio
  `postgresql-x64-17`) y `5433` el relay de WSL/Docker. El contenedor se
  remapeó a `5434:5432` y `DATABASE_URL` apunta ahí; migraciones aplicadas al
  contenedor y suite verificada contra él (versión servida: 17.9 linux-musl).
  El PostgreSQL nativo conserva una BD `gastos` residual que ya no se usa.
- **Migraciones:** Prisma Migrate → `pnpm run prisma:migrate` (`prisma migrate dev`).
  Historial en `prisma/migrations/`.
- **Conexión:** el CLI la lee de `prisma.config.ts` (Prisma 7); en runtime se
  pasa vía el driver adapter en [`src/lib/prisma.ts`](../src/lib/prisma.ts).

## Restricciones / decisiones de versionado

- **Prisma fijado a la major 7.** Prisma 7 cambió el modelo de configuración:
  la URL ya no vive en `schema.prisma` (se usa `prisma.config.ts` + driver
  adapter) y `.env` no se autocarga. No bajar a 6.x sin revisitar esa config.
- Versiones declaradas con rango caret (`^`) en `package.json`; el pin exacto
  vive en `pnpm-lock.yaml`.
- **Librerías explícitamente prohibidas:** ninguna registrada todavía
  (decisión del humano — añádelas aquí si las hay).

## Variables de entorno requeridas

| Nombre                       | Descripción                              | Obligatoria         | Ejemplo                                                              |
| ---------------------------- | ---------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`               | Cadena de conexión a PostgreSQL.         | **sí**              | `postgresql://postgres:postgres@localhost:5434/gastos?schema=public` |
| `PORT`                       | Puerto HTTP del servidor.                | no (def. `3000`)    | `3000`                                                              |
| `HOST`                       | Interfaz de escucha.                     | no (def. `0.0.0.0`) | `0.0.0.0`                                                          |
| `LOG_LEVEL`                  | Nivel de log de Fastify.                 | no (def. `info`)    | `info`                                                              |
| `GOOGLE_DRIVE_CLIENT_ID`     | Client id OAuth de Google Cloud (Drive). | **sí**              | `xxxx.apps.googleusercontent.com`                                  |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Client secret OAuth de Google Cloud.     | **sí**              | `GOCSPX-…`                                                          |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Refresh token OAuth de larga duración.   | **sí**              | `1//…`                                                              |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Carpeta raíz `notas-banco/` creada a mano. Acepta el fileId pelado **o** la URL de la carpeta (se normaliza al arrancar al fileId). | **sí** | `1AbCdEfGhIj...` o `https://drive.google.com/drive/folders/1AbCdEfGhIj...` |

> Fuente: `.env.example`, [`src/server.ts`](../src/server.ts) (`PORT`, `HOST`),
> [`src/app.ts`](../src/app.ts) (`LOG_LEVEL`) y
> [`src/config/env.ts`](../src/config/env.ts) (las tres de Drive y
> `GOOGLE_DRIVE_ROOT_FOLDER_ID`). Cómo obtener las de Drive:
> `specs/drive-connection/design.md` §10 (pasos manuales del humano); cómo obtener
> el fileId de la raíz: `specs/drive-structure/design.md` §9 (de la URL de la
> carpeta). `GOOGLE_DRIVE_ROOT_FOLDER_ID` admite tanto el fileId pelado como la
> URL de la carpeta; `normalizeDriveFolderId` en
> [`src/config/env.ts`](../src/config/env.ts) extrae el id al arrancar.
