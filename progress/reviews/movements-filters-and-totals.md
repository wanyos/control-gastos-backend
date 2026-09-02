# Review — F36 `movements-filters-and-totals`

**Fecha:** 2026-09-02. Reviewer.

**Veredicto:** APPROVED (segunda pasada, 2026-09-02; la primera fue CHANGES_REQUESTED por el punto 1, ya corregido)

## Cambios requeridos

1. `docs/data-model.md:62-65` — la nota «⏳ Estado de la regla 5» dice que
   `computeTotals` **todavía no** excluye `productId` y que «esa línea llega
   junto al escritor de `productId`». Desde esta feature las dos cosas son
   falsas: la exclusión ya está en `src/modules/movements/movements.service.ts`
   (`computeTotals`, con tests que la ven fallar — mutación comprobada), y ha
   llegado ANTES que el escritor de la columna. Actualizar la nota para que
   diga la verdad: exclusión implementada por la F36, columna aún sin escritor,
   efecto práctico hoy cero. Es una línea, pero es exactamente el tipo de resto
   que dentro de tres semanas hay que interpretar; el intent cita esta sección
   como fuente de la decisión.

Nada más. Todo lo demás se comprobó y está limpio (abajo).

## Comprobado sin hallazgos (con qué comando y qué salió)

- **`./init.sh` entero, lanzado por mí (2026-09-02):** type check OK, lint OK,
  formato OK, `Test Files 52 passed (52)`, `Tests 1015 passed (1015)`,
  «Entorno listo».
- **La afirmación del informe sobre `transferId` es VERDAD:** `git diff
  src/modules/movements/movements.service.ts` muestra que en HEAD
  `computeTotals` ya tenía `if (movement.transferId !== null) return totals`;
  el diff solo añade la línea de `productId`.
- **Mutaciones (romper → correr → restaurar), las 4 cazadas:**
  1. Quitada la exclusión de `productId` en `computeTotals` → 2 tests rojos
     (`excludes movements with a productId from the totals`, `leaves transfer
     legs and product contributions out of the response totals`).
  2. `lte` → `lt` en el extremo `to` de `movementListWhere` → 1 rojo
     (`GET /api/movements?from=&to= keeps both extreme days and drops the rest`).
  3. Quitado el `where` de la consulta de totales (totales de toda la tabla)
     → 2 rojos (`computes the totals over the FILTER…`, `answers an empty page
     with zero totals…`).
  4. Quitada la exclusión de `transferId` → 3 rojos (incluye el unitario
     preexistente y el de ruta nuevo).
  Tras restaurar: `npx vitest run src/modules/movements/movements.test.ts` →
  66/66 verdes, y `git diff --stat` del service vuelve al diff exacto del
  implementer (104 insertions, 11 deletions).
- **`where` único para página, recuento y totales:** `movementListWhere` se
  construye una vez y lo usan `count`, el `findMany` de la página y el de
  totales (movements.service.ts). La mutación 3 demuestra que un `where`
  divergente lo cazan los tests.
- **Fechas y zona horaria:** los seeds guardan `T00:00:00.000Z` (UTC), igual
  que el importer (`toDateOnly`/`dateOnlyToDate`, ambos UTC); `gte`/`lte` a
  medianoche UTC cubren los dos días extremos. Test verde + mutación 2.
- **`page` válida con total 0 → 200 vacío:** el guard es
  `query.page > 1 && query.page > totalPages`, y el test `answers an empty page
  with zero totals…` lo verifica (200, `total: 0`, `totalPages: 0`, totales
  `"0.00"`). `page` fuera de rango → 400, test verde.
- **`serializeMovement` intacto:** el diff no lo toca; el test compara el
  conjunto exacto de las 20 claves.
- **Ningún otro endpoint cambió:** `git status --short` en el momento de la
  revisión: solo movements.{routes,service,types,test,schema}, architecture.test,
  import.routes.test (adaptado solo en CÓMO lee la respuesta), api-contract,
  feature_list, current.md y el informe. `src/app.ts` y el resto de módulos, sin
  tocar.
- **`docs/api-contract.md` dice la verdad:** parámetros = esquema
  (`movements.schema.ts`: enums, `page≥1`, `pageSize` 1-200, defaults 1/50),
  errores = servicio (400 from>to y página fuera de rango, 404 cuenta
  inexistente). El «parámetro desconocido se ignora» comprobado en vivo:
  `curl "localhost:3000/api/movements?foo=bar&pageSize=1"` → 200,
  `{movements, pagination, totals}`, `total: 1520` (el número del intent).
- **Nada de datos reales en los fixtures nuevos:** IBANs vía `syntheticIban()`,
  importes redondos sintéticos, producto `Synthetic fund <timestamp>`; el test
  `no-real-data` pasó dentro de la suite.
- **`docs/conventions.md`:** inglés en código y tests, `.schema.ts` con el
  patrón de `categories.schema.ts`, imports con `.js`, informe en
  `progress/implementations/` y este veredicto en `progress/reviews/` — según
  la estructura decidida.
- **CHECKPOINTS:** C1-C4 en verde (init.sh exit 0, una sola feature
  `in_progress`, arquitectura vigilada por `architecture.test.ts` actualizado,
  tests de camino feliz y de error). C4 bis no aplica (no hay parser ni lectura
  de ficheros; la prueba real con la BD viva está en el informe y la reharé al
  aprobar si hace falta). C6: el contrato lleva la nota de breaking change y el
  frontend aún no consume. C7 no aplica (`"sdd": false`). C5 y C8 quedan para
  el cierre, tras corregir el punto 1.

## Qué falta para aprobar

Solo el punto 1. Con la nota de `docs/data-model.md` corregida, todo lo demás
ya está verificado y no lo volveré a auditar entero: relanzaré `./init.sh` y
miraré el diff de esa nota.

---

## Segunda pasada (2026-09-02) — APPROVED

El único cambio requerido (punto 1) lo corrigió el leader en
`docs/data-model.md`. Comprobado en esta pasada:

- **`git diff docs/data-model.md`:** el diff toca SOLO la nota «Estado de la
  regla 5» (líneas 62-68) y ahora dice la verdad: exclusión de `productId`
  implementada en `computeTotals` desde la F36 (2026-09-02), llegada **antes**
  que el escritor de la columna, columna aún sin escritor, efecto práctico hoy
  cero. La redacción es correcta y no introduce vocabulario nuevo.
- **`./init.sh` entero, relanzado por mí:** type check OK, lint OK, formato OK,
  `Test Files 52 passed (52)`, `Tests 1015 passed (1015)`, «Entorno listo».
- **C5:** `git status --short` no muestra archivos sin trackear sospechosos —
  solo el código de la feature, los docs, y los tres artefactos de progress
  (informe del implementer, este veredicto y el resumen de cierre). La línea de
  `progress/history.md`, el `done` en `feature_list.json` y el vaciado de
  `progress/current.md` son los pasos de cierre que siguen a esta aprobación
  (los ejecuta el implementer/leader, no yo).
- **C8:** escrito el resumen de cierre en
  `progress/summaries/movements-filters-and-totals.md` (mapa completo del
  código con archivo+símbolo, líneas solo en los puntos de entrada, y el círculo
  cerrado con los 7 puntos de `como_se_que_esta_bien`, cada uno con su test).

Todo lo demás quedó verificado en la primera pasada (mutaciones incluidas) y el
diff entre pasadas es únicamente la nota de `docs/data-model.md`, así que no se
reauditó el resto.

Resumen de cierre: `progress/summaries/movements-filters-and-totals.md`.
