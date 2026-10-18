## Review — 2026-10-18

**Veredicto:** APPROVED
Comprobado: requirements R1-R15 ↔ tests, arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Checks: 11 de 11 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/category-origin-and-rule-reapply.md`.

### Con qué se comprobó

- Antes de lanzar la suite: ningún proceso de vitest en marcha (líneas de comando
  de los `node.exe`: solo `pnpm dev` / `tsx watch src/server.ts` y procesos de MCP).
- `./init.sh` → `EXIT=0`; tsc OK, lint OK, format OK,
  `Test Files 86 passed (86)`, `Tests 1467 passed (1467)`.
- `./init.sh --checks 60` → `EXIT=0`, `Checks: 11 de 11 en verde.` Cada check que
  filtra por nombre imprime `Tests 1 passed | N skipped`; el 10 (`pnpm test`) exit 0.
  Los 11 checks coinciden con la tabla 🧪 de `decisions.md`.
- Base del humano sin tocar: consulta de solo lectura
  (`SET default_transaction_read_only=on`) a `gastos` en `gastos-postgres` →
  0 filas en `_prisma_migrations` para `2026101812%` y 0 columnas
  `Movement.categorySource`.
- Todos los sitios que escriben `categoryId` (búsqueda de
  `movement.(update|updateMany|create|createMany|upsert)` y `categoryId:` en `src/`,
  `scripts/` y `prisma/`): `updateMovement` y `bulkUpdateMovements` (`manual` /
  `null`), `confirmAllMovements` (`closing`), `applyCategoryRules` (`rule`); la
  importación crea con `categoryId: null`; transferencias y relleno de
  `balanceAfter` no tocan `categoryId`. No hay más.
- Una regla nunca escribe en un `manual`: `categorizationEligibleWhere` no lo
  incluye en ningún alcance y la escritura repite el mismo `where`; lo prueban
  tests de rutas (crear y cambiar, uno `manual` en la propia genérica, fila entera
  igual con `updatedAt`) y de servicio (los dos alcances).
- Migración de datos: genéricas raíz → `closing`, resto con categoría → `manual`,
  sin categoría → `NULL`, sin `updatedAt`; el `AND "categorySource" IS NULL` de más
  no cambia el resultado sobre la columna recién creada.
- Lotes: cada uno tocó solo los archivos de su `Archivos:`, más `tasks.md`,
  `progress/current.md` y su informe. `docs/vocabulary.md` y `feature_list.json`
  no los cita ningún lote como suyos.
- `docs/architecture.md`: solo se añade el ADR-038; ningún ADR anterior cambia.

### Comprobado sin hallazgos
R1-R15 ↔ tests (incluidos camino de error: 400/404/409 sin recolocar, choque de
dos categorías, lote en bloque rechazado con 404), tasks T1-T14 en `[x]`, hoja
(6 puntos 🔴 con alternativa, 15 requirements, procedencia completa), arquitectura
(capas: rutas → servicio, sin Prisma en rutas), convenciones, sumas e importes
iguales (test de `totals` antes y después, filas comparadas campo a campo),
`docs/lessons.md` #2 (bloque Prisma, ER, «Columnas reservadas», claves naturales),
#3 (no hay fixtures `.xls`/`.pdf`), datos de prueba inventados, documentos que la
feature volvía falsos (`api-contract.md`, `README.md`, `data-model.md`),
`docs/vocabulary.md` (fila `categorySource` del 2026-10-18), C1-C8.
