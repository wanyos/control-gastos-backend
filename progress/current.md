# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** feature #4 `drive-structure` — **CERRADA (`done`)**. Reviewer APPROVED, `./init.sh` verde (95 tests), trazabilidad R1-R28 verificada. Resumen de cierre volcado a `progress/history.md`. No quedan features `pending`: esperar el siguiente `intent` del humano.
- **Inicio:** 2026-07-23
- **Agente:** implementer (cierre) — flujo SDD: spec-author + implementer + reviewer

## Plan

1. [x] Derivar `acceptance` de la feature #4 desde su `intent` (leader).
2. [x] Redactar spec `specs/drive-structure/{requirements,design,tasks}.md` → `spec_ready`.
3. [x] ⏸ **Puerta humana:** spec aprobado (2ª pasada, 2026-07-25).
4. [x] `in_progress` + implementer: tasks T1..T19 completadas (T20 es smoke manual del humano).
   `./init.sh` verde (95 tests, baseline 61 + 34 nuevos). Informe en
   `progress/implementations/drive-structure.md`.
5. [x] reviewer → APPROVED (`progress/reviews/drive-structure.md`) → **cierre**: feature #4
   `done` en `feature_list.json` (JSON válido, 0 `in_progress`), resumen en `history.md`.

## Bitácora

- Feature 3 (drive-connection) verificada por el humano en producción: `GET /health/drive` → `{"status":"ok","drive":"up"}`, cuenta `juanjor99@gmail.com`.
- Bug de harness corregido: `.claude/agents/spec-author.md` tenía un `: ` sin entrecomillar en el `description` que rompía el registro del agente. Corregido en disco (efectivo la próxima sesión; esta sesión se usó `general-purpose` como vehículo con el rol spec-author).
- Spec de la feature #4: exposición como **servicio interno** (sin endpoints), banco = slug `^[a-z0-9-]{1,64}$`, año `^\d{4}$` en 2000-2100, raíz por env `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `ensureFolder` idempotente con lock en memoria (single-instance). Añadidos: R8 (carpetas homónimas preexistentes) y R16 (rango de año).
- Revisión del spec tras la 1ª puerta: el humano cambió el modelo de identidad de banco a **"Drive es el registro; crear banco es explícito"**. Nuevos R23-R28 (sección "Registro de bancos"): resolver-banco-existente sin crear, `createBank()` como único alta, `UnknownBankError` (code `UNKNOWN_BANK`, 404) distinto de `ValidationError` (400) y `DriveConnectionError` (503), error con lista de bancos + sugerencia por distancia de edición. Año/procesados siguen auto-creándose. ADR-008 actualizado. Añadido nuevo: R26 (umbral Levenshtein ≤ 2 y desempate alfabético). Sigue en `spec_ready`, esperando 2ª aprobación.
- **Implementación (implementer, 2026-07-25):** creado `src/lib/drive-structure.ts` (servicio interno `files.*`, sin endpoints) + `drive-structure.test.ts` (26 tests con dobles, sin red). Config: `GOOGLE_DRIVE_ROOT_FOLDER_ID` obligatoria (env.ts, vitest placeholder, env.test.ts). Error nuevo `UnknownBankError`. `driveErrorMessage` exportado de `drive.ts`. Guardianes de arquitectura (no `prisma`, no auth wiring). Docs: ADR-008, stack, api-contract, .env.example. Trazabilidad R1-R28 en `progress/implementations/drive-structure.md`. `./init.sh` verde: **95 tests** (61 baseline + 34), typecheck y format:check verdes. Feature queda `in_progress` a la espera del reviewer.
- **⚠️ Bloqueo de entorno preexistente (NO de la feature):** `pnpm lint` falla al cargar porque el árbol de trabajo trae un bump sin commitear `typescript ^6.0.3 → ^7.0.2` (+ `typescript-eslint 8.63 → 8.65`), y typescript-eslint 8.65 no soporta TS 7.0. init.sh (tsc + tests) no usa lint y está verde. Decisión de dependencias para el leader/humano (alinear versiones y actualizar `docs/stack.md`, que aún dice `typescript@^6.0.3`). No lo toco: fuera de scope.
