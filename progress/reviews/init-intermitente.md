# Revisión — init-intermitente (mantenimiento, sin feature)

## Review — 2026-11-05

**Veredicto:** APPROVED
Comprobado: los tres arreglos aprobados ↔ tests, arquitectura (ADR-027), convenciones,
`docs/lessons.md`, vocabulario, `./init.sh` (2 de 2 en verde). Checks: `./init.sh --checks 67`
→ 17 de 17 en verde. Sin hallazgos. Sin resumen de cierre: es mantenimiento, no hay feature.

### Qué ejecuté y qué salió

- `./init.sh > init1.log` (20:16:50 → 20:17:18 UTC): exit=0, `Test Files 93 passed (93)`,
  `Tests 1521 passed (1521)`. `./init.sh > init2.log` justo después (20:17:22 → 20:17:50):
  exit=0, mismos números. `grep -ciE "fail|warn|skip|Ya hay otra"` sobre los dos logs: 0 y 0.
- `./init.sh --checks 67` justo después (17 `vitest` uno tras otro): exit=0,
  `Checks: 17 de 17 en verde.` Cada check filtrado muestra `Tests 1 passed | 12 skipped (13)`
  (o `1 passed (1)` en el de docs); el de `pnpm test`, `1521 passed`. Ningún log de
  `/tmp/harness_check_*.log` contiene «Ya hay otra» (`grep -l … | wc -l` → 0): el bloqueo
  se suelta entre ejecuciones seguidas.
- **Rechazo de una segunda ejecución, sin lanzar dos vitest.** Un script de node (en la
  carpeta temporal de la sesión, no vitest) se conecta a la base `postgres` y toma
  `pg_try_advisory_lock(20271104)` → `held=true`. Con él vivo,
  `pnpm exec vitest run src/lib/test-db.test.ts` → exit=1 con
  `Error: Ya hay otra ejecución de la suite de tests en marcha contra ese PostgreSQL (localhost:5434). Hay que esperar a que acabe y volver a lanzarla: …` desde
  `vitest.global-setup.ts:70` (antes de `prepareTestDatabases`). Mensaje en español, sin
  contraseña.
- **Proceso muerto a mitad.** `kill -9` al script que tenía el bloqueo, sin soltarlo;
  el mismo `vitest run` después → exit=0, `Tests 20 passed (20)`. PostgreSQL soltó el
  bloqueo al cerrarse la conexión.
- Al final, consulta de solo lectura: `pg_locks` con `locktype='advisory'` → 0; bases
  `gastos%`: `gastos`, `gastos_test_1..8`, `gastos_test_template`. `dist/` no existe.
- **`architecture.test.ts` sigue comprobando lo mismo.** Archivo temporal
  `src/modules/n26/zz-review-tmp.ts` que nombra `revolut` → exit=1,
  `expected [ 'app.ts', …(1) ] to deeply equal [ 'app.ts' ]`. Borrado después;
  `git status --short src/` igual que al empezar.

### Comprobado sin hallazgos

- **Alcance.** Solo los tres arreglos aprobados: `src/lib/test-db.ts` (`lockTestSuite`),
  `vitest.global-setup.ts` (bloqueo antes de nada; se suelta en el `finally` del teardown
  y en el `catch` si la preparación falla), `backup.service.test.ts:212` (`}, 60_000)`, una
  línea) y `architecture.test.ts:496-543` (una lectura de `src/`, mismos tres bloques de
  `expect`, sin límite de tiempo nuevo).
- **Tests.** `src/lib/test-db.test.ts`: rechazo con la misma clave, entrada tras soltarlo
  (y soltar dos veces), bloqueo de la propia ejecución ya tomado, host sí y contraseña no,
  y el orden en `vitest.global-setup.ts`. Comprueban el texto del mensaje, no solo que lance.
- **ADR-027** (`docs/architecture.md:2296-2316`) describe el bloqueo, la base `postgres`,
  el porqué, la alternativa descartada y el caso del proceso muerto, y coincide con el
  código. `git grep` de «a la vez|simult|dos ejecuciones|concurren» en `docs/`, `README.md`
  y `AGENTS.md`: ninguna línea dice que se puedan lanzar dos ejecuciones a la vez.
- **Convenciones.** Comentarios y nombres de test en inglés, mensaje al humano en español;
  el `throw` está en el setup, no en el teardown (que sigue usando `failRun`).
  `tsc`, `pnpm run lint` y `pnpm run format:check` en `[OK]` en las dos ejecuciones de `./init.sh`.
- **`docs/lessons.md`.** Las lecciones activas 1-3 (archivos del humano, `data-model.md`,
  fixtures `.xls`/`.pdf`) no aplican: no hay columnas ni fixtures.
- **Vocabulario.** «bloqueo consultivo» y «base de mantenimiento `postgres`» son los nombres
  de PostgreSQL de esas cosas, no términos del proyecto. «guardián» en
  `test-db.test.ts` ya estaba antes del cambio. No hay palabras nuevas para mecanismos
  del proyecto.
- **Datos reales.** La tabla de tiempos de `progress/explorations/init-intermitente-2026-11-04.md`
  (§d) tiene las duraciones en segundos enteros, y `src/no-real-data.test.ts` pasa en las
  dos ejecuciones de `./init.sh`.
- **CHECKPOINTS.** No aplican como feature: no hay entrada en `feature_list.json` ni spec.
