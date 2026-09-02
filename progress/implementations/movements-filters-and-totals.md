# movements-filters-and-totals (F36) — implementación

Fecha: 2026-09-02. Implementer.

## Archivos modificados / creados

- [`src/modules/movements/movements.schema.ts`](../../src/modules/movements/movements.schema.ts) — **nuevo**: esquema de querystring de `GET /api/movements` (filtros, `page`/`pageSize` con defaults). La validación la hace Fastify/AJV y sale por el error-handler central como `400 VALIDATION_ERROR`.
- [`src/modules/movements/movements.types.ts`](../../src/modules/movements/movements.types.ts) — `TotalsMovement` gana `productId`; tipos nuevos `MovementListQuery`, `MovementListPagination`, `SerializedMovementTotals`, `MovementListResponse`.
- [`src/modules/movements/movements.service.ts`](../../src/modules/movements/movements.service.ts) — `listMovements` pasa a recibir la query y devuelve `{ movements, pagination, totals }`; `where` construido una sola vez (`movementListWhere`) para que página, recuento y totales miren las mismas filas; `computeTotals` excluye también `productId != null` (cabo suelto 8 del roadmap); `serializeTotals` nuevo.
- [`src/modules/movements/movements.routes.ts`](../../src/modules/movements/movements.routes.ts) — el GET usa el esquema y pasa `request.query` al servicio. Sigue siendo la única ruta del módulo (solo lectura).
- [`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts) — 16 tests nuevos (filtros, paginación, totales, errores, forma) + los existentes adaptados a la respuesta nueva; helper `createProduct()` con limpieza en `afterEach`.
- [`src/modules/import/import.routes.test.ts`](../../src/modules/import/import.routes.test.ts) — el test que lee `GET /api/movements` pasa a leer `.movements` del objeto.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — `movements.schema.ts` entra en la lista de archivos permitidos; el comentario que decía «movements no tiene schema a propósito» se actualiza (sigue sin body: lo que valida es la querystring).
- [`docs/api-contract.md`](../../docs/api-contract.md) — sección `GET /api/movements` reescrita: parámetros, paginación, totales, tabla de errores y nota «⚠️ Breaking change» con el patrón de las anteriores (sin consumidor: el frontend no existe).

## Decisiones tomadas

1. **Nombres de parámetros**: `accountId`, `from`, `to` (ambos `YYYY-MM-DD`, **ambos extremos incluidos**), `type`, `status`, `page`, `pageSize`. Inglés, coherentes con los nombres de campo ya publicados en el contrato.
2. **Paginación**: `page` (def. 1) + `pageSize` (def. 50, máx. 200). Respuesta: `pagination: { page, pageSize, total, totalPages }`. `total` cuenta TODAS las coincidencias del filtro, no la página.
3. **Totales**: `totals: { income, expense, net }` como strings decimales; `net = income − expense`. Calculados sobre todas las coincidencias del filtro (test con `pageSize=1` que demuestra que no dependen de la página).
4. **Qué es 400 y qué es vacío legítimo** (documentado también en el contrato):
   - `400 VALIDATION_ERROR`: parámetro que no cumple el esquema (fecha mal escrita, `type`/`status` fuera de enum, `page` < 1, `pageSize` fuera de 1–200, `accountId` no entero); `from` posterior a `to`; `page` más allá de la última página.
   - `404 NOT_FOUND`: `accountId` que no existe (misma respuesta que `GET /api/accounts/:id`).
   - `200` vacío legítimo: filtro válido sin coincidencias (cuenta existente sin movimientos en el rango) → `movements: []`, `total: 0`, totales `"0.00"`.
   - Un parámetro de querystring desconocido **se ignora** (AJV con `removeAdditional`, comportamiento por defecto de Fastify): descartarlo ensancha el resultado, nunca lo vacía; queda escrito en el contrato.
5. **`computeTotals`**: la exclusión de `productId != null` se añade junto a la de `transferId != null` ya existente (las dos decididas en `docs/data-model.md` §Totales). Hoy ninguna fila real lleva ninguna de las dos columnas, así que ningún número visible cambia; los tests crean filas con ellas puestas para demostrar la exclusión.
6. **Forma de cada movimiento intacta**: `serializeMovement` no se toca; un test compara el conjunto exacto de claves serializado.

## Mapeo acceptance → test

Todos en [`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts) salvo indicado:

| Criterio | Test(s) |
|---|---|
| Filtros por cuenta, rango, tipo y estado, combinables | `GET /api/movements?accountId= returns only the movements of that account`, `…?from=&to= keeps both extreme days and drops the rest`, `…?type=expense returns not a single income`, `…combines account, range, type and status in one filter` |
| Respuesta paginada con total de coincidencias | `paginates keeping the order and reporting the total of ALL matches`, `answers without any filter, paginated with the defaults (page 1, 50 per page)` |
| Totales sobre EL FILTRO, no la tabla | `computes the totals over the FILTER, every page of it, not the whole table` |
| `computeTotals` excluye `productId != null` y `transferId != null` | Unitarios: `excludes movements with a productId from the totals`, `excludes a movement carrying BOTH transferId and productId exactly once`, `excludes transfer legs and neutral movements from the totals`. De ruta (con filas reales en BD, `productId` puesto vía `InvestmentProduct` creado): `leaves transfer legs and product contributions out of the response totals` |
| Valores imposibles → 4xx, nunca 500 ni vacío silencioso | `rejects a date that is not a date with 400 VALIDATION_ERROR`, `rejects an unknown type and an unknown status…`, `rejects page 0, a non-numeric accountId and an oversized pageSize…`, `rejects a range with from after to…`, `answers 404 NOT_FOUND for an accountId that does not exist`, `rejects a page past the last one with 400, never an empty 200` |
| Vacío legítimo | `answers an empty page with zero totals for an account with nothing in range` |
| `docs/api-contract.md` actualizado | Sección reescrita + nota Breaking change (no testeable) |
| Forma del movimiento serializado sin cambios | `keeps the serialized shape of each movement exactly as it was (feature 36)`; además `net` negativo en `serializeTotals ships a negative net…` |
| Ninguna otra ruta cambia | Suite completa en verde; el único otro lector de `GET /api/movements` (`import.routes.test.ts`) adaptado solo en cómo lee la respuesta |

## Último ./init.sh (completo, 2026-09-02)

```
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  52 passed (52)
      Tests  1015 passed (1015)
   Duration  8.32s
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

(Antes: type check OK, lint OK, formato OK — todo en la misma pasada.)

## Prueba real (servidor propio en el puerto 3210, solo GET; el del humano en 3000 no se tocó y sigue respondiendo 200)

```
GET /api/movements                                  → total 1520, totalPages 31, pageSize 50
GET …?from=2026-08-01&to=2026-08-31&type=expense    → total 42, expense 6636.30, net -6636.30
GET …?from=bad-date                                 → 400 VALIDATION_ERROR ("querystring/from must match format \"date\"")
GET …?accountId=99999                               → 404 NOT_FOUND ("Account not found")
GET …?page=999                                      → 400 VALIDATION_ERROR ("page 999 is out of range: 31 page(s) match this filter")
GET …?from=2026-08-31&to=2026-08-01                 → 400 VALIDATION_ERROR ("'from' … is after 'to' …")
```

Servidor propio parado tras la prueba (puerto 3210 sin escuchar; comprobado).

## Sugerencias fuera de scope (NO aplicadas)

- La nota de `docs/api-contract.md` sobre el ensayo (≈ línea 923) dice «comprueba el recuento de ese periodo en GET /api/movements»: con `pagination.total` ese recuento ahora es directo; podría enlazarse.
- `docs/roadmap.md` cabo suelto 8 queda cerrado por esta feature; el roadmap lo mantiene el leader.
- Ordenación configurable (`sort=`) y filtro por categoría: el humano dijo explícitamente que los filtros los irá pidiendo él; no se añadió ninguno más.
