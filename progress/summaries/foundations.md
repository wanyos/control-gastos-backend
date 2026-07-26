# Resumen — feature 2 `fundamentos`

Fecha de cierre: 2026-07-11
Intención original: `feature_list.json` → feature `fundamentos`, bloque `intent`
Spec (SDD): `specs/fundamentos/`

## Qué hace ahora la app que antes no

La app tiene una base común que todas las features futuras van a reutilizar:

1. **La configuración se valida al arrancar.** Si falta `DATABASE_URL` o si
   `PORT`/`LOG_LEVEL` tienen valores inválidos, el servidor no arranca: muere
   con exit 1 y un mensaje que lista TODOS los problemas de una vez. Antes
   cada archivo leía `process.env` por su cuenta y un valor malo podía colarse.
2. **Todos los errores de la API salen con el mismo formato**
   `{ statusCode, code, message }`: recurso no encontrado, datos inválidos,
   ruta inexistente y errores internos (que ya no filtran detalles al cliente).
   Antes había tres formatos distintos según el tipo de error.
3. **El código está organizado por recurso** (`src/modules/expenses/`,
   `src/modules/health/`) con la capa HTTP separada del acceso a datos, y un
   test guardián vigila que nadie rompa esa estructura en el futuro.

## Por dónde se usa (puntos de entrada)

- Los endpoints no cambian: `GET/POST /api/expenses`, `GET/DELETE
  /api/expenses/:id`, `GET /health`, `GET /health/db`. Lo que cambia es la
  forma de los cuerpos de error (documentada en `docs/api-contract.md` §Errores,
  con nota de que NO rompe al frontend).
- Para features nuevas: lanzar `NotFoundError` / `ValidationError` (o una
  subclase nueva de `AppError`) desde un servicio y el handler central lo
  convierte en la respuesta HTTP correcta. La config se lee de
  `fastify.config`, nunca de `process.env`.

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de
> Markdown de VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### ⚙️ Configuración y arranque

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Valida y tipa la config al arrancar | `loadConfig` | [env.ts:35](../../src/config/env.ts#L35) |
| Arranque fail-fast (stderr + exit 1) | try/catch de `server.ts` | [server.ts:9](../../src/server.ts#L9) |
| Cableado de la app | `buildApp(config)` | [app.ts:14](../../src/app.ts#L14) |

### ⚠️ Errores con formato único

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Jerarquía de errores de dominio | `AppError` y subclases | [app-error.ts:6](../../src/errors/app-error.ts#L6) |
| Handler central error → HTTP | `handleError` | [error-handler.ts:20](../../src/plugins/error-handler.ts#L20) |
| 404 de ruta inexistente normalizado | `setNotFoundHandler` | [error-handler.ts:46](../../src/plugins/error-handler.ts#L46) |

### 📦 Módulo de ejemplo (expenses) y datos

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Único acceso a datos del módulo | `expensesDb` | [expenses.service.ts:13](../../src/modules/expenses/expenses.service.ts#L13) |
| Capa HTTP fina (sin Prisma) | `expensesRoutes` | [expenses.routes.ts:22](../../src/modules/expenses/expenses.routes.ts#L22) |
| Fábrica de Prisma (ya sin leer env) | `createPrismaClient` | [prisma.ts:13](../../src/lib/prisma.ts#L13) |

### 🧪 Tests y documentación

| Qué cubre | Código |
| --- | --- |
| Test guardián de la arquitectura | [architecture.test.ts:25](../../src/architecture.test.ts#L25) |
| Tests de config | [env.test.ts:31](../../src/config/env.test.ts#L31) |
| Tests del handler de errores | [error-handler.test.ts:25](../../src/plugins/error-handler.test.ts#L25) |
| Contrato: sección Errores + nota de cambio | [api-contract.md §Errores](../../docs/api-contract.md#L27) |
| ADR-005 (errores) y ADR-006 (env a mano) | [architecture.md:160](../../docs/architecture.md#L160) · [:188](../../docs/architecture.md#L188) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ "Cuando arranca la app, la configuración por entorno está validada; si
  falta algo obligatorio, falla al arrancar con un mensaje claro" → se cumple.
  Verificado en `src/config/env.test.ts:41` (falta `DATABASE_URL` → error que
  la nombra) y `:63` (varios problemas → un solo mensaje con todos); además el
  implementer demostró el arranque real sin `.env` → exit 1 con el mensaje
  (`progress/impl_fundamentos.md` §Smoke).
- ✅ "Cuando una feature lanza un error, sale con un formato consistente en
  toda la app" → se cumple. Verificado con cuerpos exactos en
  `src/modules/expenses/expenses.test.ts:97` (404 de recurso),
  `:108` y `:119` (400 de validación), `src/plugins/error-handler.test.ts:92`
  (500 genérico sin detalles internos) y `:104` (404 de ruta inexistente).
- ✅ "Cuando miro src/, la estructura por features ya está establecida y
  documentada" → se cumple. La estructura vive en `src/modules/` y la vigila
  `src/architecture.test.ts:35` (árbol completo), `:54` (no queda
  `src/routes/`) y `:58` (rutas sin acceso a datos); documentada en
  `docs/architecture.md:47-79`.

## Decisiones que se tomaron por ti

- **(delegado)** Patrón de manejo de errores: jerarquía `AppError` (con `code`
  estable y `statusCode`) + handler central de Fastify, sin librerías extra.
  Registrado como ADR-005 (`docs/architecture.md:157`).
- **(delegado)** Validación de la config a mano (~40 líneas) en vez de
  librería (`@fastify/env`/Zod descartadas). Registrado como ADR-006
  (`docs/architecture.md:180`), con umbral: si las variables crecen (>8-10),
  reconsiderar.
- **(añadido, aprobaste R3)** Un valor inválido de `PORT`/`LOG_LEVEL` también
  tumba el arranque (no solo las variables que faltan).
- **(añadido, aprobaste R10)** El 404 de "esta ruta no existe" también sale
  con el formato común (antes era el formato default de Fastify).
- **(dentro del margen del spec)** El cliente de datos lo obtiene el servicio
  vía `expensesDb(app)` (`expenses.service.ts:13`) para que la ruta no
  contenga ni la palabra `prisma`; y el borrado solo convierte en 404 el
  error "no existe" de Prisma (P2025) — una BD caída ahora es un 500, no un
  falso 404.
- **(ya hecho antes)** R18 (ESLint + Prettier) quedó cubierto por la tarea
  directa de lint del 2026-07-11; la task T22 se marcó N/A.

## Qué NO se tocó / quedó fuera

- Ninguna feature de negocio nueva: los endpoints y sus respuestas de éxito
  son idénticos (los 8 tests originales pasan sin cambiar ni un assert).
- El frontend no necesita cambios: el cambio de formato de error no es
  breaking (discrimina por código HTTP; ver nota en `docs/api-contract.md:50`).
- `/health` y `/health/db` conservan exactamente su forma (incluido el 503).

## Notas para el futuro

- `docs/conventions.md:87` aún dice que el manejo de errores "no está
  implementado": quitar esa nota (ya lo está).
- `docs/stack.md:99` tiene un pie obsoleto sobre dónde se leen `PORT`/`HOST`/
  `LOG_LEVEL` (ahora todo vive en `src/config/env.ts`).
- Aviso de entorno para agentes en Windows: ejecutar la suite desde la ruta
  con unidad en mayúscula (`C:\...`); con `c:\...` Vitest 4 falla al
  recolectar tests (comprobado durante esta review; no es un bug del código).
