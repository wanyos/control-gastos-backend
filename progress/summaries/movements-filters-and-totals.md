# Resumen — feature 36 `movements-filters-and-totals`

Fecha de cierre: 2026-09-02
Intención original: `feature_list.json` → feature `movements-filters-and-totals`, bloque `intent`

## Qué hace ahora la app que antes no

Antes `GET /api/movements` devolvía los 1520 movimientos de golpe (821 KB), sin
un solo filtro. Ahora puedes pedir los movimientos de una cuenta, de un rango de
fechas (extremos incluidos), de un tipo y de un estado, combinándolos como
quieras; la respuesta viene siempre paginada (50 por página por defecto, 200
como máximo), te dice cuántos movimientos coinciden en total, y trae los totales
de LO QUE PEDISTE: cuánto entró, cuánto salió y la diferencia. Además,
`computeTotals` deja fuera de los totales las aportaciones a productos de
inversión (`productId != null`), igual que ya dejaba fuera las dos piernas de un
traspaso — cierra el cabo suelto 8 del roadmap; hoy no cambia ningún número
porque ninguna fila real lleva esas columnas todavía.

## Por dónde se usa (puntos de entrada)

- `GET /api/movements` — único punto de entrada; la ruta está en
  [movements.routes.ts:23](../../src/modules/movements/movements.routes.ts#L23).
  Parámetros: `accountId`, `from`, `to`, `type`, `status`, `page`, `pageSize`.
- El servicio que lo resuelve todo: `listMovements`,
  [movements.service.ts:182](../../src/modules/movements/movements.service.ts#L182).
- El contrato completo (parámetros, errores, forma de la respuesta):
  [docs/api-contract.md:437](../../docs/api-contract.md#L437) §`GET /api/movements`.

⚠️ **Breaking change documentado en el contrato**: la respuesta deja de ser un
array y pasa a ser `{ movements, pagination, totals }`. La forma de cada
movimiento NO cambia ni un campo. El frontend aún no consume este endpoint.

## Dónde está el código (para revisión directa)

### Filtro, paginación y totales

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Orquesta todo: valida rango, 404 de cuenta, página fuera de rango, y devuelve página + recuento + totales | `listMovements` | [movements.service.ts](../../src/modules/movements/movements.service.ts#L182) |
| EL `where` único que comparten página, recuento y totales | `movementListWhere` | [movements.service.ts](../../src/modules/movements/movements.service.ts#L155) |
| Fecha `YYYY-MM-DD` → medianoche UTC (extremos incluidos) | `dateOnlyToDate` | [movements.service.ts](../../src/modules/movements/movements.service.ts#L145) |
| Totales: excluye `transferId != null` (ya estaba) y `productId != null` (nuevo) | `computeTotals` | [movements.service.ts](../../src/modules/movements/movements.service.ts#L285) |
| Totales como strings decimales, `net = income − expense` | `serializeTotals` | [movements.service.ts](../../src/modules/movements/movements.service.ts#L303) |
| Forma de cada movimiento — **sin tocar** en esta feature | `serializeMovement` | [movements.service.ts](../../src/modules/movements/movements.service.ts#L232) |

### Validación de la querystring

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Esquema AJV: enums, formato de fecha, `page ≥ 1`, `pageSize` 1–200, defaults 1/50; lo desconocido se descarta | `listMovementsSchema` | [movements.schema.ts](../../src/modules/movements/movements.schema.ts#L10) — archivo **nuevo** |
| Tipos de la query y de la respuesta (`MovementListQuery`, `MovementListPagination`, `SerializedMovementTotals`, `MovementListResponse`; `TotalsMovement` gana `productId`) | ver símbolos | [movements.types.ts](../../src/modules/movements/movements.types.ts#L48) |

### Tests (todos en [movements.test.ts](../../src/modules/movements/movements.test.ts))

| Qué cubre | Código |
| --- | --- |
| Unitarios de `computeTotals`: excluye `productId`; excluye `transferId`+`productId` a la vez | [movements.test.ts:467](../../src/modules/movements/movements.test.ts#L467) y [:478](../../src/modules/movements/movements.test.ts#L478) |
| Unitarios de `serializeTotals` (incluido `net` negativo) | [movements.test.ts:497](../../src/modules/movements/movements.test.ts#L497) |
| Filtro por cuenta / rango con extremos / tipo / los cuatro combinados | [movements.test.ts:915](../../src/modules/movements/movements.test.ts#L915), [:930](../../src/modules/movements/movements.test.ts#L930), [:958](../../src/modules/movements/movements.test.ts#L958), [:973](../../src/modules/movements/movements.test.ts#L973) |
| Paginación con recuento de TODAS las coincidencias; defaults sin filtro | [movements.test.ts:1005](../../src/modules/movements/movements.test.ts#L1005), [:1028](../../src/modules/movements/movements.test.ts#L1028) |
| Totales del filtro (no de la página ni de la tabla); exclusiones con filas reales en BD | [movements.test.ts:1043](../../src/modules/movements/movements.test.ts#L1043), [:1063](../../src/modules/movements/movements.test.ts#L1063) |
| Forma serializada intacta (las 20 claves exactas) | [movements.test.ts:1090](../../src/modules/movements/movements.test.ts#L1090) |
| Errores: fecha mala, enums desconocidos, page 0 / pageSize 500 / accountId no numérico, from posterior a to, cuenta inexistente (404), página pasada la última | [movements.test.ts:1123](../../src/modules/movements/movements.test.ts#L1123)–[:1175](../../src/modules/movements/movements.test.ts#L1175) |
| Vacío legítimo: 200 con página vacía y totales a cero | [movements.test.ts:1188](../../src/modules/movements/movements.test.ts#L1188) |

### Adaptaciones colaterales (solo lectura de la forma nueva)

| Qué | Código |
| --- | --- |
| El test de importación que leía el listado lee ahora `.movements` | [import.routes.test.ts](../../src/modules/import/import.routes.test.ts) |
| `movements.schema.ts` entra en la lista de archivos permitidos por módulo | [architecture.test.ts](../../src/architecture.test.ts) |
| Nota «Estado de la regla 5» actualizada: la exclusión de `productId` ya está implementada (corrección del leader tras la review) | [docs/data-model.md](../../docs/data-model.md#L62) |

## Cumplimiento de la intención

- ✅ «Cuando pido los movimientos de UNA cuenta, solo me llegan los de esa cuenta» → `movements.test.ts:915`.
- ✅ «Cuando pido un rango de fechas… incluidos los de los dos días extremos» → `movements.test.ts:930` (y la mutación `lte`→`lt` la caza: comprobado en la review).
- ✅ «Cuando pido solo gastos, no me llega ni un ingreso» → `movements.test.ts:958`.
- ✅ «La respuesta me dice cuántos movimientos hay en total para lo que he pedido» → `movements.test.ts:1005`.
- ✅ «Los totales que vienen en la respuesta son los del filtro que he pedido, no los de toda la base de datos» → `movements.test.ts:1043` (y la mutación «totales sin where» la caza).
- ✅ «Si no pido ningún filtro, sigo pudiendo leer los movimientos, pero paginados: nunca más una respuesta de 1520» → `movements.test.ts:1028`; comprobado además contra la app viva: 200 con `pageSize` 50 por defecto y `total: 1520` paginado.
- ✅ «Una aportación mía a una cuenta de inversión no cuenta como gasto, y un traspaso entre mis propias cuentas no cuenta ni como gasto ni como ingreso» → `movements.test.ts:467`, `:478` y `:1063` (con filas reales en BD). OJO: hoy ninguna fila real lleva `productId` ni `transferId` — la regla queda lista para cuando lleguen sus escritores.

## Decisiones que se tomaron por ti

- (delegado) **Nombres de parámetros**: `accountId`, `from`, `to`, `type`,
  `status`, `page`, `pageSize` — en inglés, como los campos ya publicados del
  contrato. Viven en `movements.schema.ts`.
- (delegado) **Límites de paginación**: 50 por defecto, 200 máximo, y
  `pagination: { page, pageSize, total, totalPages }` en la respuesta.
- (añadido, y razonado en el contrato) **Dónde está la raya entre error y vacío**:
  cuenta inexistente → 404; `from` posterior a `to` → 400; página más allá de la
  última → 400; filtro válido sin coincidencias → 200 vacío con totales a cero.
  Un parámetro desconocido en la querystring **se ignora** (nunca estrecha ni
  vacía el resultado).

## Qué NO se tocó / quedó fuera

- La forma de cada movimiento serializado: ni un campo (test de las 20 claves).
- La importación y los saldos: intactos (el diff no toca esos módulos).
- Ningún filtro extra (categoría, ordenación configurable): los irás pidiendo tú.
- El escritor de `productId` y el detector de traspasos (`transferId`): features
  posteriores; esta solo dejó los totales preparados.
- `docs/roadmap.md` (el cabo suelto 8 queda cerrado por esta feature): lo
  mantiene el leader.

## Notas para el futuro

- La nota del ensayo en `docs/api-contract.md` (≈ línea 980) dice «comprueba el
  recuento de ese periodo en GET /api/movements»: con `pagination.total` ese
  recuento ahora es directo; se podría enlazar.
- El frontend aún no consume el endpoint: su feature se planifica contra la
  forma nueva `{ movements, pagination, totals }`.
