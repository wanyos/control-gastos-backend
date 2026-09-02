# Tasks — Feature 2: fundamentos

> Checklist ordenada para el `implementer`. Cada task referencia los `R<n>`
> de `requirements.md` que cubre. Marcar `[x]` al completar; una task
> saltada exige justificación documentada (el reviewer rechaza si no).
>
> Orden pensado para que la suite quede rota el menor tiempo posible:
> primero la infraestructura nueva (aditiva), después la migración de
> módulos, después tests y docs, verificación al final.

## Infraestructura transversal

- [x] T1 — Crear `src/errors/app-error.ts` con `AppError`, `NotFoundError`,
      `ValidationError` (jerarquía y valores de `design.md` §3). Cubre: R5.
- [x] T2 — Crear `src/errors/app-error.test.ts` (unit: `code`, `statusCode`,
      `message`, `instanceof AppError`). Cubre: R5.
- [x] T3 — Crear `src/config/env.ts`: `AppConfig`, `LogLevel`,
      `loadConfig(env = process.env)` con las reglas de `design.md` §2
      (acumula todos los problemas en un único mensaje; acepta
      `LOG_LEVEL=silent`), y la module augmentation de `fastify.config`.
      Cubre: R1, R2, R3.
- [x] T4 — Crear `src/config/env.test.ts` (unit, con objetos env
      sintéticos): env completo → valores tipados; solo `DATABASE_URL` →
      defaults `3000`/`'0.0.0.0'`/`'info'`; sin `DATABASE_URL` → lanza con
      `DATABASE_URL` en el mensaje; `PORT: 'abc'`, `PORT: '0'`,
      `LOG_LEVEL: 'verbose'` → lanza nombrando la variable. Cubre: R1, R2, R3.
- [x] T5 — Crear `src/plugins/error-handler.ts`: `handleError` exportado +
      plugin `fp` que hace `setErrorHandler(handleError)` y
      `setNotFoundHandler` (mapeo y formato de `design.md` §3). Cubre: R6,
      R7, R8, R9, R10.

## Cableado de config (adiós a `process.env` disperso)

- [x] T6 — Modificar `src/lib/prisma.ts`: `createPrismaClient(databaseUrl:
      string)`; eliminar la lectura de `process.env` y el throw propio.
      Cubre: R4.
- [x] T7 — Modificar `src/plugins/prisma.ts`: pasar
      `fastify.config.databaseUrl` a `createPrismaClient`. Cubre: R4.
- [x] T8 — Modificar `src/app.ts`: `buildApp(config: AppConfig =
      loadConfig())`; logger con `config.logLevel`;
      `app.decorate('config', config)`; registrar `error-handler` (primero)
      y `prisma`. Cubre: R1, R4, R6.
- [x] T9 — Modificar `src/server.ts`: `loadConfig()` en `try/catch` →
      mensaje a stderr + `process.exit(1)` si falla; `buildApp(config)`;
      `listen({ port: config.port, host: config.host })`. Cubre: R2, R4.

## Migración a `modules/` (ADR-004)

- [x] T10 — Crear `src/modules/expenses/expenses.types.ts`
      (`CreateExpenseBody`, `ExpenseIdParams`) y
      `src/modules/expenses/expenses.schema.ts` (`createExpenseSchema`
      movido + `expenseIdParamsSchema` nuevo). Cubre: R7, R11.
- [x] T11 — Crear `src/modules/expenses/expenses.service.ts`
      (`listExpenses`, `getExpenseById`, `createExpense`, `deleteExpense`;
      `NotFoundError` en get/delete; delete captura solo Prisma `P2025`).
      Cubre: R6, R11, R13.
- [x] T12 — Crear `src/modules/expenses/expenses.routes.ts` (capa HTTP
      fina: schemas + servicio + 201/204; sin referencias a `prisma`, sin
      bodies de error a mano) y registrarlo en `src/app.ts` con prefijo
      `/api/expenses`. Cubre: R11, R13.
- [x] T13 — Mover `src/routes/health.ts` →
      `src/modules/health/health.routes.ts` (sin cambios funcionales;
      actualizar import en `src/app.ts`). Cubre: R11.
- [x] T14 — Mover los tests: `src/routes/expenses.test.ts` →
      `src/modules/expenses/expenses.test.ts` y `src/routes/health.test.ts`
      → `src/modules/health/health.test.ts`; único cambio en los 8 tests
      existentes: la ruta del import de `buildApp`. Cubre: R11, R14.
- [x] T15 — Eliminar `src/routes/` (ya sin archivos). Cubre: R12.

## Tests nuevos de los fundamentos

- [x] T16 — Crear `src/plugins/error-handler.test.ts`: unit de
      `handleError` con request/reply falsos (error genérico →
      `request.log.error` llamado con el error original y respuesta 500
      genérica); integración con `buildApp()`: ruta de prueba que lanza
      `new Error('secret detail')` → 500 con body exacto
      `{ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }`
      y sin `secret detail`; `GET /does-not-exist` → 404 con
      `code: 'NOT_FOUND'`. Cubre: R8, R9, R10.
- [x] T17 — Añadir a `src/modules/expenses/expenses.test.ts` los asserts
      del formato nuevo (tests nuevos, sin tocar los existentes): 404 de
      recurso → `{ statusCode: 404, code: 'NOT_FOUND', message: 'Expense
      not found' }`; POST sin `amount` → 400 con
      `code: 'VALIDATION_ERROR'`; `GET /api/expenses/abc` → 400 con
      `code: 'VALIDATION_ERROR'`. Cubre: R6, R7.
- [x] T18 — Crear `src/architecture.test.ts` (guardián): (a) ningún
      `process.env` en `src/**/*.ts` fuera de `src/config/env.ts`
      (excluyendo `*.test.ts` y `src/generated/`); (b) existen los archivos
      del árbol objetivo (R11); (c) `src/routes/` no existe; (d)
      `expenses.routes.ts` no contiene `prisma`. Cubre: R4, R11, R12, R13.

## Documentación

- [x] T19 — Actualizar `docs/api-contract.md`: sección "Errores" con el
      formato `{ statusCode, code, message }`, tabla de códigos estables
      (`VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`) y nota
      visible del cambio de forma respecto a `{ message }` (no breaking:
      discriminación por HTTP status se mantiene). Cubre: R16.
- [x] T20 — Actualizar `docs/architecture.md`: quitar las marcas `(nueva)`
      que pasen a existir; actualizar las "notas de realidad" de los
      Principios 1-5 y la nota de migración (ya ejecutada); añadir ADR-005
      (patrón de errores) y ADR-006 (validación de env a mano, con el
      umbral para reconsiderar librería). Cubre: R17.
- [x] T21 — Actualizar las referencias `src/routes/*` → `src/modules/*` en
      `docs/stack.md` (§Librerías clave, §Testing) y `docs/verification.md`
      (§Nivel 2). Cubre: R11 ("establecida y **documentada**"), R17.

## Tooling condicional (según decisión del humano en la aprobación)

- [N/A] T22 — SOLO si R18 queda aprobado: añadir ESLint + Prettier
      (devDependencies) con las reglas de `docs/conventions.md` §Estilo
      (comillas simples, sin punto y coma, 2 espacios, 100 columnas),
      scripts `lint`/`format`, dejar `npx eslint .` y
      `npx prettier --check .` en verde, y actualizar `docs/stack.md` +
      `docs/conventions.md`. Si el humano lo excluye: marcar N/A aquí con
      una línea de justificación. Cubre: R18.
      **Justificación N/A:** ya hecho en tarea directa el 2026-07-11, ver
      `progress/impl_lint-tooling.md` (R18 satisfecho: `npm run lint` y
      `npm run format:check` en verde con las reglas fijadas; docs/stack.md
      y docs/conventions.md ya actualizados entonces).

## Verificación final

- [x] T23 — `npm test`: suite completa en verde (los 8 tests reubicados +
      los nuevos). Cubre: R14. (35/35 tests, 6 archivos.)
- [x] T24 — `bash ./init.sh` → termina con `[OK] Entorno listo`. Cubre: R15.
- [x] T25 — Escribir el mapa de trazabilidad `R<n>` → test concreto en
      `progress/impl_fundamentos.md` (regla de `docs/verification.md`
      §Nivel 4). Cubre: todos.
