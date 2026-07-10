# Bitácora histórica (append-only)

> Cada vez que se cierra una sesión, su resumen se añade aquí.
> No edites entradas anteriores. Solo añades al final.

---

<!--
Plantilla para cada entrada nueva:

## YYYY-MM-DD — Feature N: nombre_de_la_feature
- **Agente:** quién/qué modelo
- **Plan:** descripción breve del enfoque tomado
- **Cambios:** lista de archivos tocados (alto nivel, no diff)
- **Verificación:** resultado de ./init.sh, número de tests
- **Cierre:** estado final de la feature, próxima feature
-->

## 2026-07-08 → 2026-07-10 — Tarea directa: english-migration

- **Agente:** implementer (verificación final: leader)
- **Plan:** migrar el dominio de español a inglés (schema Prisma + migración
  init reescrita para reset + rutas/mensajes/comentarios), sin cambiar
  comportamiento ni infraestructura.
- **Cambios:** `prisma/schema.prisma` (Categoria/Gasto → Category/Expense),
  `prisma/migrations/20260707171322_init/migration.sql`, `src/routes/gastos.ts`
  → `src/routes/expenses.ts`, `src/app.ts` (prefix `/api/expenses`),
  traducciones en server/health/plugins/lib/prisma.config.
  Detalle: `progress/impl_english-migration.md`.
- **Verificación:** `prisma generate` OK; `typecheck` 0 errores. 2026-07-10:
  usuario ejecutó `prisma migrate reset --force` (esquema inglés aplicado);
  smoke-test niveles 2-3 de docs/verification.md en verde (health, health/db,
  POST 201, GET, 400 sin `amount`, 404, DELETE 204; BD limpia al terminar).
- **Cierre:** completa y verificada end-to-end. No era feature de
  `feature_list.json` (tarea directa). Siguiente: configurar test runner y
  luego feature 1 (bootstrap).

## 2026-07-10 — Feature 1: bootstrap (+ fix init.sh y tarea test-runner)

- **Agente:** leader (orquestando) + implementer + reviewer (Claude).
- **Plan:** sesión en tres tramos: (a) desbloquear `./init.sh` en Windows;
  (b) tarea directa test-runner (configurar Vitest y portar el smoke-test
  manual a tests automáticos); (c) feature 1 `bootstrap` en flujo simple —
  el proyecto ya existía, así que el enfoque fue verificar cada criterio de
  aceptación contra la realidad con evidencia ejecutable, sin reconstruir
  nada ni robar trabajo a la feature 2 (migración a `modules/`).
- **Cambios:**
  - init.sh (leader): el alias falso `python.exe` de la Microsoft Store
    engañaba a `command -v`; ahora se comprueba que el binario responde a
    `--version` (fallback a Node). Post-cierre (leader): añadida también
    normalización del casing del cwd con `cygpath -m` — vitest 4.1.10 falla
    si la letra de unidad va en minúscula (`c:/`), y algunos shells heredan
    ese casing; verificado init.sh verde desde ambos casings.
  - test-runner (implementer, APPROVED): `vitest@4.1.10` + `vitest.config.ts`,
    scripts `test`/`test:watch`, 8 tests de integración (`buildApp()` +
    `app.inject()` contra Postgres real): `src/routes/health.test.ts` y
    `src/routes/expenses.test.ts`. Leader actualizó docs/stack.md (§Testing)
    y docs/verification.md. Informes: impl_/review_test-runner.md.
  - Feature 1 bootstrap (implementer): **0 cambios en código fuente y 0
    dependencias nuevas** — los 4 criterios ya se cumplían; se produjo la
    evidencia (arranque real `npm run dev` → /health y /health/db 200;
    stack.md contrastado dato a dato con `npm ls`; init.sh verde; árbol de
    src/ coincidente archivo a archivo con el estado presente de
    architecture.md). Se detectó y limpió un servidor dev huérfano en :3000.
    Primer veredicto del reviewer: **REJECTED** (quedaron watchers `tsx
    watch` vivos y el informe afirmaba una limpieza completa falsa);
    corregido (3 árboles de proceso matados de verdad, verificación por
    lista de procesos Win32_Process, informe reescrito con la lección de
    re-parenting en Windows) → **APPROVED** en re-review. Informes:
    impl_/review_/resumen_bootstrap.md.
- **Verificación:** `bash ./init.sh` → stack node (v24.11.0), typecheck 0
  errores, tests 8/8, `[OK] Entorno listo` (re-ejecutado también por el
  reviewer). Arranque real demostrado y proceso parado sin huérfanos.
- **Cierre:** feature 1 `bootstrap` → **done** en feature_list.json.
  ⚠️ Decisión pendiente del humano: colisión del puerto 5432 (PostgreSQL
  17.6 nativo de Windows responde en localhost:5432 en lugar del contenedor
  `gastos-postgres`; app y tests usan coherentemente el nativo) — parar el
  servicio nativo o remapear el contenedor (ej. 5433) y ajustar
  DATABASE_URL. Próxima feature: 2 `fundamentos` (SDD: requiere spec_author
  y aprobación humana antes de implementar).

## 2026-07-10 — Tarea directa: resolver colisión de puerto de PostgreSQL

- **Agente:** leader (solo configuración; decisión tomada por el humano:
  remapear el contenedor, no parar el servicio nativo).
- **Cambios:** `docker-compose.yml` → `5434:5432` (5433 también estaba
  ocupado, por el relay de WSL/Docker); `DATABASE_URL` en `.env` y
  `.env.example` → `localhost:5434`; docs/stack.md (§BD reescrita: colisión
  resuelta, razón del 5434) y docs/verification.md (puerto del smoke).
- **Verificación:** contenedor recreado y healthy en 5434;
  `prisma migrate deploy` aplicó la migración init a la BD del contenedor
  (estaba vacía); `SELECT version()` vía DATABASE_URL → "PostgreSQL 17.9 on
  x86_64-pc-linux-musl" (es el contenedor, ya no el nativo de Windows);
  `./init.sh` → typecheck OK + 8/8 tests + `[OK] Entorno listo`.
- **Cierre:** app y tests trabajan contra el contenedor. El PostgreSQL
  nativo de Windows sigue corriendo con su BD `gastos` residual (sin uso;
  el humano puede pararlo o borrarla cuando quiera).
