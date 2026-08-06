# Convenciones de código

> Este documento es la referencia de convenciones del backend y lo posees tú
> (humano). Recoge las decisiones tomadas. Donde el código actual todavía
> diverge, se indica explícitamente.

## Idioma

- **Todo el proyecto en inglés**: nombres de variables, funciones, clases,
  tipos, archivos, comentarios y mensajes de commit. No se mezclan idiomas.
- **Incluye el dominio**: los conceptos de negocio se nombran en inglés
  (`Account`, `Movement`, `Category`, `description`, `amount`, `categoryId`,
  `bookingDate`), no en español.
- **Excepción — identificadores de infraestructura:** se mantienen en español
  por decisión (no los ve el frontend ni forman parte del dominio): el nombre de
  la BD `gastos`, el contenedor docker `gastos-postgres`, `package.name`
  (`gastos-backend`) y la carpeta del repo. El esquema de BD (tablas y columnas)
  **sí** va en inglés (`Account`, `Movement`, `Category`, `amount`, …).
- **Prosa de la documentación:** los `docs/` se redactan en español (idioma de
  trabajo); solo los identificadores de código, rutas y modelos citados en ellos
  van en inglés.
- **Nombres de archivos y carpetas SIEMPRE en inglés** (decidido 2026-07-11),
  incluidos los artefactos del harness y los `name` de las features en
  `feature_list.json`. La única excepción sigue siendo la prosa (contenido)
  de los documentos, que va en español. Estructura de `progress/` por tipo:
  - `progress/current.md` e `progress/history.md` — en la raíz.
  - `progress/implementations/<feature>.md` — informes del implementer.
  - `progress/reviews/<feature>.md` — veredictos del reviewer.
  - `progress/summaries/<feature>.md` — resúmenes de cierre (C8).
  - `progress/explorations/<topic>.md` — investigaciones previas.

## Estilo del lenguaje

- **TypeScript estricto, target ES2022, ESM.** *(observado en `tsconfig.json`)*
- **Linter + formatter: ESLint + Prettier.** Instalados y configurados
  (2026-07-11, tarea directa): ESLint 10 flat config + typescript-eslint 8
  sobre `src/**/*.ts`, Prettier 3. Comandos: `pnpm run lint` / `lint:fix` /
  `format` / `format:check`. Prettier no formatea los `.md` del harness ni
  `feature_list.json` (ver `.prettierignore`). Reglas fijadas:
  - Comillas **simples**.
  - **Sin** punto y coma.
  - Indentación de **2 espacios**.
  - Longitud de línea: **100 columnas**.

## Imports

- Orden: **vendor** (`fastify`, `@prisma/*`) → **relativos** (`./`, `../`).
- Imports relativos **con extensión `.js`** (obligatorio por ESM/NodeNext).
- **Sin alias de paths** (`@/…`) mientras el árbol sea plano; introducirlos solo
  si la anidación crece.
- `import type { … }` para lo que sea solo tipo.

## Nombres

| Tipo                        | Convención                                                    | Ejemplo                              |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Archivos                    | `kebab-case` / nombre del recurso                            | `accounts.routes.ts`, `error-handler.ts` |
| Clases / tipos / interfaces | `PascalCase`, **sin** prefijo `I`                            | `Account`, `CreateAccountBody`       |
| Funciones / variables       | `camelCase`                                                  | `buildApp`, `createPrismaClient`     |
| Constantes                  | `camelCase` (o `UPPER_SNAKE` si es constante global de módulo) | `createAccountSchema`              |
| Booleanos                   | prefijo `is` / `has`                                        | `isLoading`, `hasError`              |

## Estructura de archivo

```typescript
// 1. Vendor imports
import type { FastifyInstance } from 'fastify'

// 2. Relative imports (with .js)
import { createPrismaClient } from '../lib/prisma.js'

// 3. Local types / schemas
interface CreateAccountBody { /* ... */ }
const createAccountSchema = { /* ... */ } as const

// 4. Main export (async routes plugin)
export default async function accountRoutes(fastify: FastifyInstance) {
  // handlers...
}
```

## Tests

- **Ubicación: junto al archivo** (`accounts.test.ts` al lado de
  `accounts.routes.ts`).
- **Runner:** **Vitest** (configurado 2026-07-10; ver `docs/stack.md`
  §Testing y `docs/verification.md`).
- **Integración de API:** con `app.inject()` sobre `buildApp()`, contra la BD
  real de `docker-compose.yml`.
- **Nombres de test:** descriptivos, en inglés.
- **Estructura:** AAA (Arrange-Act-Assert); comprobar el **resultado concreto**,
  no solo "no lanza".

## Manejo de errores

> Implementado por la feature #2 "foundations" (2026-07-11): jerarquía en
> `src/errors/app-error.ts`, handler central en `src/plugins/error-handler.ts`
> (ver ADR-005 en `docs/architecture.md`).

- Errores de dominio extienden una base `AppError` con un `code` string y un
  `statusCode`.
- La capa HTTP **no** arma respuestas de error a mano: un `setErrorHandler`
  central traduce `AppError` → `{ statusCode, code, message }`.
- Nunca `throw` de strings sueltos.
- Se loguea con `fastify.log` / `request.log` (nunca `console.log`); se registra
  el error interno pero **no** se filtran detalles sensibles al cliente.

```typescript
class AppError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode = 400) {
    super(message)
  }
}
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') { super(message, 'NOT_FOUND', 404) }
}
```

## Estructura de carpetas (recordatorio)

> Coherente con `docs/architecture.md`. Si hay conflicto, manda architecture.md.

## Comentarios

- **Los mínimos y lo más cortos posible.** Solo se comenta cuando es realmente
  necesario; si el código se explica solo, no se comenta.
- No se comenta el *qué* (lo dice el código); se comenta el *por qué* cuando una
  decisión no es obvia.
- En inglés, como el resto del código.
- `TODO:` con formato `// TODO: <acción concreta>`. No dejar `TODO` sin dueño en
  features marcadas `done`.

## Estilos / UI

N/A — este proyecto es backend, no hay capa de UI.
