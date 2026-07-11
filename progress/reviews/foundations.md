# Review — feature 2 `fundamentos`

**Veredicto:** APPROVED

- **Fecha:** 2026-07-11
- **Agente:** reviewer
- **Base:** `specs/fundamentos/` (requirements R1-R18, design, tasks T1-T25),
  `docs/verification.md` §Nivel 4, `CHECKPOINTS.md`, informe
  `progress/impl_fundamentos.md`. Todo re-ejecutado y re-leído por el
  reviewer; nada tomado del informe sin comprobar.

## Trazabilidad requirements ↔ tests (SDD)

Cada test citado fue localizado por nombre y su assert leído contra el texto del R:

- R1: [x] `src/config/env.test.ts:8` `builds a typed config from a complete environment` (toEqual del objeto completo) y `:24` `applies defaults when only DATABASE_URL is present` (defaults 3000/'0.0.0.0'/'info').
- R2: [x] `src/config/env.test.ts:41` `throws naming DATABASE_URL when it is missing` y `:45` `...when it is empty` (regex `/DATABASE_URL/`).
- R3: [x] `src/config/env.test.ts:49` (`PORT: 'abc'`), `:53` (`PORT: '0'`), `:57` (`LOG_LEVEL: 'verbose'`) — cada uno lanza nombrando la variable.
- R4: [x] `src/architecture.test.ts:26` `reads process.env only in src/config/env.ts` — escanea `src/**/*.ts` (excluye `*.test.ts` y `generated/`), offenders `toEqual([])`. Verificado que `src/server.ts` no contiene la cadena (`process.exit`/`process.on`, nunca `process.env`).
- R5: [x] `src/errors/app-error.test.ts:6-49` — 6 tests: `code`, `statusCode`, `message`, `name` e `instanceof AppError` de las 3 clases, defaults incluidos.
- R6: [x] `src/modules/expenses/expenses.test.ts:97` `GET /api/expenses/99999 returns the shared error body shape` — **toEqual exacto** `{ statusCode: 404, code: 'NOT_FOUND', message: 'Expense not found' }`; unit `src/plugins/error-handler.test.ts:42` `maps an AppError to its own statusCode, code and message`.
- R7: [x] `src/modules/expenses/expenses.test.ts:108` (POST sin `amount` → 400 `VALIDATION_ERROR`) y `:119` (`GET /api/expenses/abc` → 400 `VALIDATION_ERROR`); el mapeo del detalle AJV lo cubre el unit `error-handler.test.ts:58`.
- R8: [x] `src/plugins/error-handler.test.ts:92` `responds 500 with the generic body and without internal details` — integración real con ruta `/boom` que lanza `Error('secret detail')`; toEqual del body genérico + `payload).not.toContain('secret detail')`.
- R9: [x] `src/plugins/error-handler.test.ts:26` `logs the original non-AppError via request.log.error and replies 500 generic` — spy: `request.log.error` llamado **con el error original**.
- R10: [x] `src/plugins/error-handler.test.ts:104` `responds 404 NOT_FOUND for a route that does not exist` — 404 + `code: 'NOT_FOUND'` + mensaje `Route GET /does-not-exist not found`.
- R11: [x] `src/architecture.test.ts:35` `contains the target tree of docs/architecture.md (ADR-004)` — los 10 archivos del árbol de R11, `missing toEqual([])`.
- R12: [x] `src/architecture.test.ts:54` `has no src/routes/ directory (migrated to modules/)`.
- R13: [x] `src/architecture.test.ts:58` `keeps expenses.routes.ts free of data access (no "prisma" reference)` — escaneo case-insensitive; leí `expenses.routes.ts` completo: cero referencias.
- R14: [x] verificado por diff directo `git show HEAD:src/routes/*.test.ts` vs archivos nuevos (ver §R14 abajo) + suite re-ejecutada en verde.
- R15: [x] `bash ./init.sh` re-ejecutado por el reviewer → `[OK] Entorno listo`, exit 0.
- R16: [x] manual (ver §Criterios) — contrato contrastado con los bodies exactos que asertan los tests de integración.
- R17: [x] manual (ver §Criterios) — architecture.md re-leído entero.
- R18: [x] `npm run lint` y `npm run format:check` re-ejecutados → exit 0 ambos.

## Tasks completas (SDD)

- T1-T21: [x] todas marcadas en `specs/fundamentos/tasks.md` y contrastadas con el código real.
- T22: [N/A] con justificación documentada en `tasks.md:117-120` (lint tooling ya hecho en tarea directa 2026-07-11, `progress/impl_lint-tooling.md` existe y fue APPROVED en `progress/review_lint-tooling.md`). Coherente con la decisión de la aprobación humana.
- T23-T25: [x] — re-verificados (suite 35/35, init.sh verde, mapa de trazabilidad presente en `progress/impl_fundamentos.md`).

## Criterios de aceptación (acceptance de la feature)

- [x] Config de entorno tipada y validada al arrancar → `src/config/env.ts:27` (`loadConfig`), fail-fast en `src/server.ts:9-16`; tests `env.test.ts` (9).
- [x] Manejo de errores centralizado con formato consistente → `src/plugins/error-handler.ts:20` (`handleError`) + `:46` (`setNotFoundHandler`); formato único `{ statusCode, code, message }` asertado con toEqual en 3 tests de integración.
- [x] Estructura por feature en `src/` → `src/modules/{expenses,health}/` + transversales `config/`, `errors/`, `plugins/`, `lib/`; guardado por `src/architecture.test.ts`.
- [x] Al menos un test del camino feliz pasa con `./init.sh` → 35/35 dentro de init.sh (re-ejecutado).
- [x] `docs/architecture.md` actualizado → ADR-005 (`:157`) y ADR-006 (`:180`), notas de realidad, árbol sin `(nueva)`.

### R16 — docs/api-contract.md §Errores (validación manual)

- Formato `{ statusCode, code, message }` (`docs/api-contract.md:32-40`) — **coincide** con los bodies exactos asertados por `expenses.test.ts:101-105`, `error-handler.test.ts:96-100` y `:108-112`.
- Tabla de códigos estables (`:44-48`): `VALIDATION_ERROR`/400, `NOT_FOUND`/404 (recurso **y** ruta), `INTERNAL_SERVER_ERROR`/500 — coincide con el mapeo real de `error-handler.ts`.
- Nota visible del cambio respecto a `{ message }` (`:50-56`), marcada no-breaking con la razón (discriminación por HTTP status). Presente y correcta.

### R17 — docs/architecture.md (validación manual)

- Cero marcas `(nueva)` (grep sin resultados); el árbol (`:47-68`) incluye `architecture.test.ts` y coincide con el `src/` real.
- Notas de realidad actualizadas: Principios (`:10-13`, "implementados por la feature #2... los guarda como test") y nota de migración (`:75-79`, "**ejecutada**"). Las 2 menciones restantes a `src/routes` (`:76,78`) son la referencia histórica correcta de la nota de migración, no restos.
- ADR-005 (`:157-178`) y ADR-006 (`:180-196`) presentes y **coherentes con el código** (jerarquía + `fp` + `setNotFoundHandler`; validador manual + fail-fast stderr/exit(1) + umbral de reconsideración).
- "Qué NO hacer" (`:200-201`) actualizado a la realidad con servicios.

### T21 — referencias src/routes → src/modules

- `docs/stack.md` (§Librerías clave `:28`, §Testing `:61-62`) y `docs/verification.md` (§Nivel 2 `:38-40`) apuntan a `src/modules/*`. Grep de `src/routes` en `docs/`: solo las 2 menciones históricas legítimas de architecture.md.

## R14 — regresión de los 8 tests movidos (verificado por diff)

`git show HEAD:src/routes/{expenses,health}.test.ts` comparado con los archivos reubicados:

- `expenses.test.ts`: único cambio en los 6 tests existentes = `import { buildApp } from '../app.js'` → `'../../app.js'`; los 3 tests nuevos (formato de error) son bloques añadidos aparte, permitidos por T17.
- `health.test.ts`: único cambio = el mismo import. Asserts intactos.
- Extra: `health.routes.ts` es **byte-idéntico** al antiguo `src/routes/health.ts` (T13 "sin cambios funcionales", literal).

## Re-ejecución (por el reviewer, no fiado del informe)

| Comando | Resultado |
| --- | --- |
| `npm test` | **35/35** tests, 6 archivos, verde (env 9 + app-error 6 + error-handler 5 + guardián 4 + expenses 9 + health 2) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!", exit 0 |
| `bash ./init.sh` | `[OK] Entorno listo. Puedes empezar a trabajar.`, exit 0 |

Nota de entorno (no es problema del código): con un cwd cuya letra de unidad va en minúscula (`c:\...`), Vitest 4 falla en Windows al recolectar (`Cannot read properties of undefined (reading 'config')`). Reproducido y descartado: desde la ruta canónica `C:\...` todo verde. Anotado por si algún agente futuro tropieza con ello.

## Decisiones de detalle del implementer (juicio contra design.md)

1. **`expensesDb(app)`** (`expenses.service.ts:13`): dentro del margen. El design fija que las 4 funciones del service reciben `prisma: AppPrismaClient` (firmas conservadas, verificado) y R13 exige cero `prisma` en las rutas; alguien debe suministrar el cliente y el accessor vive en el service (el acceso a datos íntegro en el service, que es el texto de R13). No es cambio de alcance encubierto.
2. **Guardián por substring** (`process.env` case-sensitive; `prisma` case-insensitive): coincide con el texto de verificación de R4 y R13. Correcto.
3. **P2025** vía `Prisma.PrismaClientKnownRequestError && code === 'P2025'` (`expenses.service.ts:57`): es literalmente lo que pide design §4 ("captura solo el record not found P2025"; lo demás propaga a 500). Correcto.
4. **Mensaje 404 de router** `Route <METHOD> <url> not found`: literal de la tabla de design §3. Correcto.
5. **Tests extra** (DATABASE_URL vacía, `silent`, mensaje multi-problema, `statusCode` explícito, mapeo AJV): dentro del alcance de R2/R3/design §2; suman cobertura sin ampliar alcance.
6. **warn vs error en logs**: exactamente la tabla de design §3 (AppError/validación → `warn`; desconocidos → `error`).

## Sin contaminación de alcance

- `git status`/diff vs HEAD: los cambios de esta feature se limitan a lo declarado en el informe (src/config, src/errors, src/plugins, src/modules, src/architecture.test.ts, app/server/lib, docs de T19-T21, specs/fundamentos/tasks.md, progress/). El resto del diff (package.json/lock, eslint.config.js, .prettierrc/.prettierignore, docker-compose.yml —solo estilo de comillas por Prettier—, docs/conventions.md §Estilo, parte de docs/stack.md) pertenece a la tarea directa de lint ya aprobada (`progress/review_lint-tooling.md`).
- `feature_list.json`: único cambio `"pending"` → `"in_progress"` en la feature 2. **No** está marcada `done`. Correcto.

## Procesos limpios (verificado por el reviewer)

- `Get-CimInstance Win32_Process` filtrando `tsx|vitest|watch` sobre node/tsx → **ningún proceso residual**.
- Puerto 3000 → **libre** (`Get-NetTCPConnection -LocalPort 3000` vacío).

## CHECKPOINTS.md

- [x] C1 — Arnés completo (`AGENTS.md`, `init.sh`, `feature_list.json`, `progress/current.md`, `docs/*.md` presentes; init.sh exit 0).
- [x] C2 — Estado coherente (1 sola `in_progress`; `done` con tests verdes; `current.md` describe la sesión activa).
- [x] C3 — Arquitectura (árbol = architecture.md y guardado por test; sin dependencias nuevas en esta feature; sin `console.log` de debug — el `console.error` de `server.ts:14` es la excepción consciente documentada en design §2 y comentada en el código; conventions respetadas: inglés, comillas simples, sin `;`, `import type`, tests junto al archivo).
- [x] C4 — Verificación real (tests por módulo nuevo; corren contra el Postgres real de verification.md; caminos feliz y de error cubiertos).
- [x] C5 — Sesión cerrada bien (untracked legítimos: specs/, progress/, código nuevo, configs de lint; history.md al día con la última sesión cerrada; feature en su estado correcto).
- [x] C6 — Coherencia con proyecto hermano (cambio de contrato documentado en api-contract.md con nota visible no-breaking; regla de related-projects.md cumplida).
- [x] C7 — SDD (specs/fundamentos/ con los 3 archivos; EARS estricto con sección de procedencia y cada R clasificado humano/delegado/añadido; tasks todas `[x]` o N/A justificada; cada R con test o validación manual justificada como excepción consciente en el propio R).
- [x] C8 — Resumen de cierre escrito (`progress/resumen_fundamentos.md`).

## Resumen de cierre

- Escrito en `progress/resumen_fundamentos.md` → **sí**.

## Observaciones no bloqueantes (para el leader, fuera del scope del spec)

1. `docs/conventions.md:87` — §Manejo de errores aún dice "Aún **no implementado** (es parte de la feature #2)". Ya está implementado; quitar la nota (el spec no ordenaba tocar esta sección).
2. `docs/stack.md:99-100` — el pie "Fuente: ... `src/server.ts` (`PORT`, `HOST`) y `src/app.ts` (`LOG_LEVEL`)" quedó obsoleto: la lectura vive en `src/config/env.ts`. Ya lo declaró el implementer como fuera de scope de T21.
3. `docs/related-projects.md:8` — sigue el placeholder "TODO-frontend/" (previo a esta feature).
4. `src/modules/expenses/expenses.test.ts:90` — el assert histórico del 404 quedó redundante con el test nuevo del body completo; se conserva por mandato de R14 (correcto); candidato a consolidar en una feature futura.

## Cambios requeridos

Ninguno.
