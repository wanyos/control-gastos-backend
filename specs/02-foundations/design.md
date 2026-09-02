# Design — Feature 2: fundamentos

> CÓMO se construye lo descrito en `requirements.md`. No reinventa
> decisiones: aplica ADR-004 (módulos), el árbol objetivo y los Principios
> 1-5 de `docs/architecture.md`, y el boceto de errores de
> `docs/conventions.md`. Las dos decisiones delegadas se resuelven aquí con
> su alternativa descartada.

## 1. Estado actual → estado final

Hoy `src/routes/{health,expenses}.ts` mezclan ruta + schema + acceso a
Prisma; los errores se arman a mano por ruta (`{ message }`) o salen con el
formato default de Fastify (validación 400, rutas inexistentes 404);
`process.env` se lee en `src/app.ts`, `src/server.ts` y `src/lib/prisma.ts`.

Árbol final (el objetivo ya decidido en `docs/architecture.md`):

```
src/
  server.ts                      # MODIFICAR: usa loadConfig(); fail-fast con mensaje claro
  app.ts                         # MODIFICAR: buildApp(config?); registra error-handler + módulos
  config/
    env.ts                       # CREAR: AppConfig + loadConfig() (R1-R4)
    env.test.ts                  # CREAR: tests unitarios de loadConfig
  plugins/
    prisma.ts                    # MODIFICAR: toma la URL de fastify.config, no de process.env
    error-handler.ts             # CREAR: setErrorHandler + setNotFoundHandler (R6-R10)
    error-handler.test.ts        # CREAR: unit (handleError) + integración (500, 404 ruta)
  lib/
    prisma.ts                    # MODIFICAR: createPrismaClient(databaseUrl: string)
  errors/
    app-error.ts                 # CREAR: AppError, NotFoundError, ValidationError (R5)
    app-error.test.ts            # CREAR: test unitario de la jerarquía
  modules/
    expenses/
      expenses.routes.ts         # CREAR (desde src/routes/expenses.ts): solo capa HTTP
      expenses.service.ts        # CREAR: lógica + único acceso a Prisma del recurso
      expenses.schema.ts         # CREAR: createExpenseSchema + expenseIdParamsSchema
      expenses.types.ts          # CREAR: CreateExpenseBody, ExpenseIdParams
      expenses.test.ts           # MOVER desde src/routes/ (imports + asserts nuevos de formato)
    health/
      health.routes.ts           # MOVER desde src/routes/health.ts (sin cambios funcionales)
      health.test.ts             # MOVER desde src/routes/ (solo imports)
  architecture.test.ts           # CREAR: test guardián (R4, R11, R12, R13)
  generated/prisma/              # sin cambios
src/routes/                      # ELIMINAR (R12)
```

`vitest` no necesita cambios: su patrón de include por defecto ya cubre
`src/**/*.test.ts` en las nuevas ubicaciones.

## 2. Configuración de entorno — `src/config/env.ts`

### Firmas

```typescript
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'

export interface AppConfig {
  databaseUrl: string
  port: number      // default 3000
  host: string      // default '0.0.0.0'
  logLevel: LogLevel // default 'info'
}

/** Validates and types the environment. Throws on any problem (fail-fast). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
  }
}
```

### Reglas de validación

| Variable       | Regla                                                            | Si falla        |
| -------------- | ---------------------------------------------------------------- | --------------- |
| `DATABASE_URL` | obligatoria, no vacía                                            | throw (R2)      |
| `PORT`         | opcional; si presente: entero en `[1, 65535]`                    | throw (R3)      |
| `HOST`         | opcional; string no vacío                                        | default         |
| `LOG_LEVEL`    | opcional; si presente: uno de los 7 niveles (incluye `silent`)   | throw (R3)      |

- `loadConfig` acumula **todos** los problemas y lanza un único `Error` cuyo
  mensaje los lista (`Invalid environment configuration:\n- DATABASE_URL is required\n- ...`),
  no solo el primero: un arranque roto se arregla en una pasada.
- `silent` es válido a propósito: `vitest.config.ts` fija `LOG_LEVEL=silent`.
- El parámetro `env` inyectable hace `loadConfig` puro y testeable sin tocar
  el `process.env` real.

### Integración

- `src/server.ts`: `import 'dotenv/config'` → `loadConfig()` dentro de
  `try/catch`; si lanza, escribe `error.message` en **stderr** y
  `process.exit(1)`. *Excepción consciente a "no console para errores"
  (`docs/conventions.md`): el logger de Fastify aún no existe — su nivel
  depende precisamente de esta config.* Después: `buildApp(config)` y
  `listen({ port: config.port, host: config.host })`.
- `src/app.ts`: `buildApp(config: AppConfig = loadConfig())`. Usa
  `config.logLevel` para el logger y hace `app.decorate('config', config)`
  antes de registrar plugins. El default `loadConfig()` mantiene la firma
  usable por los tests actuales (`buildApp()` sin argumentos).
  - *Matiz sobre el Principio 5 ("config como plugin"):* el nivel de log se
    necesita **al construir** la instancia, antes de que ningún plugin corra;
    por eso la carga es una función síncrona invocada por `buildApp` y el
    acceso compartido se expone igualmente vía la instancia
    (`fastify.config`). Prisma y error-handler sí son plugins `fp`.
- `src/lib/prisma.ts`: `createPrismaClient(databaseUrl: string)` — deja de
  leer `process.env` (R4). `src/plugins/prisma.ts` le pasa
  `fastify.config.databaseUrl`.

### Decisión delegada #2 — ¿librería de validación o a mano? → **a mano**

- **Decisión:** validador manual (~40 líneas tipadas) en `src/config/env.ts`.
  Son 4 variables, 1 obligatoria; las reglas caben en un `if` por variable y
  el mensaje de error queda exactamente como lo queremos.
- **Alternativa descartada — `@fastify/env` (o Zod/znv):** declarativo y
  alineado con el espíritu JSON-Schema de ADR-003, pero (a) añade una
  dependencia para validar 4 claves, contra la preferencia registrada de no
  meter dependencias no imprescindibles; (b) `@fastify/env` valida dentro del
  ciclo de plugins, demasiado tarde para el `logLevel` que se necesita al
  crear la instancia; (c) Zod contradice la decisión de ADR-003 de no sumar
  librerías de schema. **Trade-off aceptado:** menos declarativo y sin
  coerción automática; si las variables crecen (>8-10) o aparecen tipos
  complejos, reconsiderar `@fastify/env` (se anota en el ADR-006, ver §7).

## 3. Errores — `src/errors/app-error.ts` + `src/plugins/error-handler.ts`

### Decisión delegada #1 — patrón de manejo de errores

**Decisión:** clases de error de dominio + `setErrorHandler` central de
Fastify (el mecanismo idiomático del framework), con `setNotFoundHandler`
para normalizar también el 404 de router (R10, añadido).

### Jerarquía (R5)

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request data') {
    super(message, 'VALIDATION_ERROR', 400)
  }
}
```

Jerarquía mínima a propósito: nuevas subclases (p. ej. `ConflictError`) se
añaden cuando una feature las necesite, no antes.

### Formato del body de error (único en toda la app)

```json
{ "statusCode": 404, "code": "NOT_FOUND", "message": "Expense not found" }
```

Es la forma ya fijada en `docs/conventions.md` §Manejo de errores. `code` es
el identificador **estable** para máquinas (el frontend puede discriminar
por él); `message` es para humanos y puede cambiar sin aviso.

### Mapeo error → respuesta (`src/plugins/error-handler.ts`)

| Error capturado                                  | Status               | `code`                  | `message`               | Log                      |
| ------------------------------------------------ | -------------------- | ----------------------- | ----------------------- | ------------------------ |
| `AppError` (y subclases)                         | `error.statusCode`   | `error.code`            | `error.message`         | `request.log.warn`       |
| Validación Fastify/AJV (`error.validation` set)  | 400                  | `VALIDATION_ERROR`      | detalle de AJV          | `request.log.warn`       |
| Cualquier otro (`Error` genérico, Prisma, ...)   | 500                  | `INTERNAL_SERVER_ERROR` | `Internal server error` | `request.log.error` (R9) |
| Ruta inexistente (`setNotFoundHandler`)          | 404                  | `NOT_FOUND`             | `Route GET /x not found`| —                        |

### Firmas

```typescript
// src/plugins/error-handler.ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

/** Exported separately so it can be unit-tested with fake request/reply (R9). */
export function handleError(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply

export default fp(errorHandlerPlugin, { name: 'error-handler' })
// errorHandlerPlugin: app.setErrorHandler(handleError) + app.setNotFoundHandler(...)
```

Registrado con `fastify-plugin` (sin encapsular) y **el primero** en
`buildApp`, de modo que cubre todos los módulos.

### Alternativas descartadas

1. **Seguir armando respuestas por ruta (statu quo):** cada handler repite
   `reply.status(404).send({ message })`; el formato deriva con el tiempo y
   la validación de Fastify queda con otro shape. Es exactamente la
   incoherencia que el `intent` quiere impedir.
2. **`http-errors` / `@fastify/sensible`:** resuelven el status pero no dan
   un `code` de dominio estable (solo el texto HTTP genérico), y añaden una
   dependencia para lo que son 3 clases pequeñas. Contra la preferencia
   registrada de dependencias mínimas.

## 4. Migración a `modules/` (R11-R14)

### `modules/expenses/`

- **`expenses.types.ts`**

  ```typescript
  export interface CreateExpenseBody {
    description: string
    amount: number
    date?: string
    categoryId?: number
  }

  export interface ExpenseIdParams {
    id: number // AJV coerces the ':id' path param to integer via the params schema
  }
  ```

- **`expenses.schema.ts`** — `createExpenseSchema` se mueve tal cual desde
  la ruta actual. **Nuevo** `expenseIdParamsSchema`:

  ```typescript
  export const expenseIdParamsSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' } },
    },
  } as const
  ```

  Sustituye la comprobación manual `Number.isInteger` de GET/DELETE por
  validación declarativa (Principio 1). El status 400 se conserva; el body
  pasa a ser el formato `VALIDATION_ERROR` común y el texto cambia (de
  `'The id must be an integer'` al detalle de AJV). Ningún test actual
  asegura ese texto.

- **`expenses.service.ts`** — único que habla con Prisma (Principio 2).
  Funciones puras que reciben el cliente (sin clase: no hay estado que
  encapsular y se testean pasando `app.prisma`):

  ```typescript
  import type { AppPrismaClient } from '../../lib/prisma.js'
  import type { CreateExpenseBody } from './expenses.types.js'

  export function listExpenses(prisma: AppPrismaClient)                       // ordered date desc, include category
  export async function getExpenseById(prisma: AppPrismaClient, id: number)   // throws NotFoundError('Expense not found')
  export function createExpense(prisma: AppPrismaClient, input: CreateExpenseBody) // include category
  export async function deleteExpense(prisma: AppPrismaClient, id: number)    // throws NotFoundError('Expense not found')
  ```

  *Refinamiento en `deleteExpense`:* hoy la ruta convierte **cualquier**
  error del delete en 404. El servicio captura solo el "record not found"
  de Prisma (`PrismaClientKnownRequestError` con `code === 'P2025'`) →
  `NotFoundError`; cualquier otro error se propaga → 500 del handler
  central. El caso testeado (borrar id inexistente → 404) no cambia; deja
  de disfrazarse de 404 una BD caída. (Forma parte del patrón delegado de
  errores.)

- **`expenses.routes.ts`** — capa HTTP fina: aplica schemas, llama al
  servicio, formatea (201/204). Sin `try/catch` ni `reply.status(4xx)` a
  mano: los `NotFoundError` del servicio los traduce el handler central.
  Export default `expensesRoutes` (plugin async), registrado en `app.ts`
  con `{ prefix: '/api/expenses' }` (ADR-004).

### `modules/health/`

`health.routes.ts` se mueve sin cambios funcionales. **Sin service**: el
árbol de `docs/architecture.md` lo decide así — `/health/db` es un ping de
infraestructura (`SELECT 1` vía `fastify.prisma`), no lógica de negocio; el
503 con `{ status: 'error', database: 'down' }` es una respuesta de
readiness deliberada (no un throw) y **conserva su shape actual**.

### Tests movidos (R14)

`src/routes/expenses.test.ts` → `src/modules/expenses/expenses.test.ts` y
`src/routes/health.test.ts` → `src/modules/health/health.test.ts`. Único
cambio en los 8 tests existentes: `import { buildApp } from '../app.js'` →
`'../../app.js'`. El assert existente
`toMatchObject({ message: 'Expense not found' })` sigue pasando porque el
nuevo body **conserva** ese `message` y `toMatchObject` es de subconjunto.

## 5. Cambios observables (impacto en contrato — R16)

**No cambia:** métodos, rutas, status codes, bodies de éxito (200/201/204),
serialización de `amount`/fechas, payloads de `/health` y `/health/db`
(incluido el 503).

**Cambia (solo bodies de error):**

| Caso                          | Antes                                                          | Después                                                      |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| 404 recurso / 400 id inválido | `{ message }` (texto del 400 de id: `'The id must be an integer'`) | `{ statusCode, code, message }` (400 de id: detalle AJV)  |
| 400 validación de body        | default Fastify `{ statusCode, code: 'FST_ERR_VALIDATION', error, message }` | `{ statusCode: 400, code: 'VALIDATION_ERROR', message }` |
| 404 ruta inexistente          | default Fastify `{ message, error, statusCode }`                | `{ statusCode: 404, code: 'NOT_FOUND', message }`            |
| 500                           | default Fastify (podía incluir `error.message` interno)         | body genérico fijo, sin detalles internos                    |

**No breaking para el frontend:** el contrato vigente ya avisa de que el
formato con `code` "está previsto en la feature de fundamentos" y que hasta
entonces el frontend discrimina **por código HTTP**, que no cambia. Aun
así, `docs/api-contract.md` se actualiza en esta misma feature con el
formato nuevo y una nota visible del cambio (regla de
`docs/related-projects.md`).

## 6. Diseño de tests nuevos

| Archivo                                  | Cubre        | Contenido                                                                 |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------- |
| `src/config/env.test.ts`                 | R1, R2, R3   | unitarios de `loadConfig` con objetos env sintéticos                       |
| `src/errors/app-error.test.ts`           | R5           | jerarquía: `code`/`statusCode`/`message`/`instanceof`                      |
| `src/plugins/error-handler.test.ts`      | R6, R8, R9, R10 | unit de `handleError` (spies de `request.log`) + integración: ruta de prueba que lanza `Error`, ruta inexistente |
| `src/modules/expenses/expenses.test.ts`  | R6, R7, R14  | los 6 existentes + asserts nuevos: 404 con `code: 'NOT_FOUND'`, 400 body y 400 id con `code: 'VALIDATION_ERROR'` |
| `src/modules/health/health.test.ts`      | R14          | los 2 existentes, sin cambios                                              |
| `src/architecture.test.ts`               | R4, R11, R12, R13 | guardián: no `process.env` fuera de `config/env.ts`; árbol de archivos existe; `src/routes/` no existe; `expenses.routes.ts` sin `prisma` |

Nota: `src/architecture.test.ts` vive en la raíz de `src/` porque guarda
invariantes de todo el árbol, no de un archivo concreto (excepción
consciente y única a "el test junto al archivo bajo test").

## 7. Documentación a actualizar (R16, R17)

- `docs/api-contract.md`: sección de errores reescrita (formato, tabla de
  `code`, nota de cambio visible).
- `docs/architecture.md`: quitar `(nueva)` de `config/`, `errors/`,
  `plugins/error-handler.ts`, `modules/*`; actualizar la "nota de realidad"
  de los Principios (la migración deja de ser pendiente); añadir **ADR-005**
  (patrón de errores: jerarquía + handler central + formato) y **ADR-006**
  (validación de env a mano; umbral para reconsiderar librería).
- Referencias de rutas obsoletas `src/routes/*` en `docs/stack.md`
  (§Librerías clave, §Testing) y `docs/verification.md` (§Nivel 2) →
  `src/modules/*`.
- Si R18 se aprueba: `docs/stack.md` §Build/Dev tooling (ESLint + Prettier y
  versiones) y `docs/conventions.md` (quitar el "aún no instalados").

## 8. Riesgos y notas para el implementer

- **Orden de registro en `buildApp`:** `error-handler` → `prisma` → módulos.
  Ambos plugins con `fastify-plugin` (sin encapsulación).
- El type-check es estricto: al mover archivos, recordar la extensión `.js`
  en imports relativos (ESM/NodeNext, ADR-001).
- No tocar `vitest.config.ts` ni `tsconfig.json`: no hace falta.
- La suite corre contra el Postgres real de `localhost:5434`
  (`docker compose up -d` previo, ver `docs/stack.md`).
