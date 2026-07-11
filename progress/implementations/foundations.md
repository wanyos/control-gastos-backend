# Informe de implementación — Feature 2: fundamentos

- **Fecha:** 2026-07-11
- **Agente:** implementer
- **Spec:** `specs/fundamentos/` (aprobado por el humano el 2026-07-11;
  R3 y R10 incluidos por decisión de la aprobación; R18 satisfecho por la
  tarea directa de lint del mismo día).
- **Estado en `feature_list.json`:** `in_progress` (no se marca `done`
  hasta el veredicto del reviewer).

## Tasks

T1-T21 y T23-T25 completadas y marcadas `[x]` en `specs/fundamentos/tasks.md`.

- **T22 — N/A**: ya hecho en tarea directa el 2026-07-11, ver
  `progress/impl_lint-tooling.md`. ESLint 10 + Prettier 3 instalados y en
  verde con las reglas de `docs/conventions.md`; R18 ya se satisface.

## Archivos creados

| Archivo | Contenido |
| --- | --- |
| `src/config/env.ts` | `AppConfig`, `LogLevel`, `loadConfig(env)` (acumula todos los problemas en un único error); module augmentation `fastify.config` |
| `src/config/env.test.ts` | 9 tests unitarios de `loadConfig` |
| `src/errors/app-error.ts` | `AppError`, `NotFoundError`, `ValidationError` |
| `src/errors/app-error.test.ts` | 6 tests unitarios de la jerarquía |
| `src/plugins/error-handler.ts` | `handleError` exportado + plugin `fp` con `setErrorHandler` y `setNotFoundHandler` |
| `src/plugins/error-handler.test.ts` | 3 unit (`handleError` con spies) + 2 integración (500 genérico, 404 de router) |
| `src/modules/expenses/expenses.types.ts` | `CreateExpenseBody`, `ExpenseIdParams` |
| `src/modules/expenses/expenses.schema.ts` | `createExpenseSchema` (movido) + `expenseIdParamsSchema` (nuevo) |
| `src/modules/expenses/expenses.service.ts` | `expensesDb`, `listExpenses`, `getExpenseById`, `createExpense`, `deleteExpense` (P2025 → `NotFoundError`) |
| `src/modules/expenses/expenses.routes.ts` | capa HTTP fina, sin referencia alguna a `prisma` |
| `src/modules/expenses/expenses.test.ts` | los 6 tests movidos (solo cambió el import) + 3 nuevos de formato de error |
| `src/modules/health/health.routes.ts` | movido de `src/routes/health.ts` sin cambios funcionales |
| `src/modules/health/health.test.ts` | los 2 tests movidos (solo cambió el import) |
| `src/architecture.test.ts` | guardián: `process.env` centralizado, árbol ADR-004, no `src/routes/`, rutas sin `prisma` |

## Archivos modificados

- `src/app.ts` — `buildApp(config: AppConfig = loadConfig())`; logger con
  `config.logLevel`; `app.decorate('config', config)`; orden de registro:
  `error-handler` → `prisma` → módulos.
- `src/server.ts` — `loadConfig()` en `try/catch` → mensaje a stderr +
  `process.exit(1)`; `listen({ port: config.port, host: config.host })`.
- `src/lib/prisma.ts` — `createPrismaClient(databaseUrl: string)`; sin
  lectura de env ni throw propio.
- `src/plugins/prisma.ts` — pasa `fastify.config.databaseUrl`.
- `docs/api-contract.md` — sección "Errores" nueva: formato
  `{ statusCode, code, message }`, tabla de códigos estables y nota visible
  del cambio respecto a `{ message }` (no breaking).
- `docs/architecture.md` — notas de realidad actualizadas (principios ya
  implementados y guardados por test), árbol sin marcas `(nueva)` (añadido
  `architecture.test.ts`), nota de migración marcada como ejecutada,
  **ADR-005** y **ADR-006** añadidos, línea de "Qué NO hacer" sobre Prisma
  en rutas actualizada a la realidad con servicios.
- `docs/stack.md` — referencias `src/routes/*` → `src/modules/*`
  (§Librerías clave, §Testing).
- `docs/verification.md` — ejemplos vivos de §Nivel 2 → `src/modules/*`.
- `specs/fundamentos/tasks.md` — checklist marcada.

## Eliminados

- `src/routes/` completo (expenses.ts, health.ts y sus 2 tests, ya movidos).

## Decisiones de detalle (dentro del margen del spec)

1. **`expensesDb(app)` en `expenses.service.ts`.** R13 exige (verificación
   literal) que `expenses.routes.ts` no contenga la cadena `prisma`, pero el
   design fija que las funciones del service reciben `prisma: AppPrismaClient`
   — alguien debe suministrarlo. Resolución: el service expone un accessor
   `expensesDb(app: FastifyInstance): AppPrismaClient` (el acceso a datos,
   incluida la obtención del cliente, vive íntegro en el service, que es el
   texto de R13); las rutas hacen `const db = expensesDb(fastify)` y las 4
   funciones del design conservan sus firmas exactas. El guardián de R13
   escanea case-insensitive (ni `prisma` ni `Prisma` aparecen en las rutas).
2. **Guardián de `process.env` por substring.** El escaneo es de substring
   sobre `src/**/*.ts` (excluyendo `*.test.ts` y `src/generated/`), comentarios
   incluidos; detectó un comentario en `src/lib/prisma.ts` que citaba
   `process.env` y se reformuló. `src/server.ts` no contiene la cadena (el
   import de efecto `dotenv/config` no la usa), así que no hizo falta
   excepción explícita en el test.
3. **Error de Prisma P2025**: se detecta con
   `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'`,
   importando `Prisma` del cliente generado (`src/generated/prisma/client.js`),
   que re-exporta la clase del runtime.
4. **Mensaje del 404 de router**: `Route <METHOD> <url> not found`
   (ej. `Route GET /does-not-exist not found`), según design §3.
5. **Tests extra** dentro del alcance de los R: `DATABASE_URL` vacía (R2),
   `LOG_LEVEL=silent` aceptado y mensaje multi-problema (diseño §2), AppError
   con `statusCode` explícito, y unit del mapeo AJV en `handleError`.
6. Los errores de validación y los `AppError` se loguean con
   `request.log.warn`; solo los desconocidos con `request.log.error` (tabla
   del design §3).

## Comandos ejecutados y resultados

| Comando | Resultado |
| --- | --- |
| `npm test` | **35/35 tests, 6 archivos, todo verde** (los 8 reubicados sin cambiar asserts + 27 nuevos) |
| `npm run typecheck` | 0 errores (exit 0) |
| `npm run lint` | 0 errores (exit 0) |
| `npm run format:check` | "All matched files use Prettier code style!" (exit 0) |
| `bash ./init.sh` | termina con `[OK] Entorno listo. Puedes empezar a trabajar.` |

Salida final de `npm test` (dentro de `bash ./init.sh`):

```
 Test Files  6 passed (6)
      Tests  35 passed (35)
   Start at  11:24:44
   Duration  765ms
[OK]    Todos los tests pasan
── 6. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Smoke de arranque real

- `npm run dev` → arranca (`PostgreSQL connection established (Prisma)`) y
  responde:
  - `GET /health` → `{"status":"ok","timestamp":"2026-07-11T09:25:49.654Z"}`
  - `GET /health/db` → `{"status":"ok","database":"up"}`
  - `GET /does-not-exist` → `{"statusCode":404,"code":"NOT_FOUND","message":"Route GET /does-not-exist not found"}`
  - `GET /api/expenses` → 200
- Camino de fallo (sin `.env`, sin `DATABASE_URL`):
  `npx tsx src/server.ts` → stderr
  `Invalid environment configuration:\n- DATABASE_URL is required (PostgreSQL connection string)`
  y **exit code 1**.
- Camino de fallo (valores inválidos): `PORT=abc LOG_LEVEL=verbose` →
  lista ambos problemas en un solo mensaje y **exit code 1**.
- Limpieza: proceso `tsx watch` matado por PID (árbol completo vía
  `taskkill /T`); verificado por **lista de procesos**
  (`Get-CimInstance Win32_Process`, patrón `tsx.*watch` → "NO tsx watch
  processes remaining") y puerto 3000 libre.

## Trazabilidad R → test

| R | Evidencia |
| --- | --- |
| R1 | `src/config/env.test.ts` → `builds a typed config from a complete environment`, `applies defaults when only DATABASE_URL is present` |
| R2 | `src/config/env.test.ts` → `throws naming DATABASE_URL when it is missing`, `throws naming DATABASE_URL when it is empty` |
| R3 | `src/config/env.test.ts` → `throws naming PORT when it is not an integer`, `throws naming PORT when it is out of range`, `throws naming LOG_LEVEL when the level is unknown` |
| R4 | `src/architecture.test.ts` → `reads process.env only in src/config/env.ts` |
| R5 | `src/errors/app-error.test.ts` → los 6 tests de la jerarquía (`code`, `statusCode`, `message`, `instanceof`) |
| R6 | `src/modules/expenses/expenses.test.ts` → `GET /api/expenses/99999 returns the shared error body shape` (body exacto `{404, NOT_FOUND, 'Expense not found'}`); unit `src/plugins/error-handler.test.ts` → `maps an AppError to its own statusCode, code and message` |
| R7 | `src/modules/expenses/expenses.test.ts` → `POST /api/expenses without amount returns 400 with code VALIDATION_ERROR`, `GET /api/expenses/abc returns 400 with code VALIDATION_ERROR` |
| R8 | `src/plugins/error-handler.test.ts` → `responds 500 with the generic body and without internal details` (integración con ruta que lanza `Error('secret detail')`) |
| R9 | `src/plugins/error-handler.test.ts` → `logs the original non-AppError via request.log.error and replies 500 generic` (unit con spies) |
| R10 | `src/plugins/error-handler.test.ts` → `responds 404 NOT_FOUND for a route that does not exist` |
| R11 | `src/architecture.test.ts` → `contains the target tree of docs/architecture.md (ADR-004)` |
| R12 | `src/architecture.test.ts` → `has no src/routes/ directory (migrated to modules/)` |
| R13 | `src/architecture.test.ts` → `keeps expenses.routes.ts free of data access (no "prisma" reference)` |
| R14 | `npm test` verde con los 8 tests reubicados intactos (6 en `expenses.test.ts` + 2 en `health.test.ts`; diff limitado al import de `buildApp`) |
| R15 | Ejecución real de `bash ./init.sh` → `[OK] Entorno listo` (ver arriba) |
| R16 | Manual (checklist reviewer): `docs/api-contract.md` §Errores — formato, tabla de códigos, nota de cambio visible; contrastable con las respuestas reales de los tests de integración |
| R17 | Manual (checklist reviewer): `docs/architecture.md` — marcas `(nueva)` eliminadas, notas de realidad actualizadas, ADR-005 y ADR-006 añadidos |
| R18 | `npm run lint` y `npm run format:check` en verde (tooling de la tarea directa 2026-07-11; T22 N/A) |

## Sugerencias fuera de scope (NO aplicadas)

- `docs/stack.md` §Variables de entorno: el pie "Fuente: `.env.example`,
  `src/server.ts` (`PORT`, `HOST`) y `src/app.ts` (`LOG_LEVEL`)" quedó
  desactualizado — la lectura vive ahora en `src/config/env.ts`. T21 solo
  ordenaba tocar §Librerías clave y §Testing, así que no lo cambié.
- El assert histórico `GET /api/expenses/99999 returns 404 with "Expense not
  found"` en `expenses.test.ts` quedó redundante con el test nuevo del body
  completo; se conserva intacto por mandato de R14.
