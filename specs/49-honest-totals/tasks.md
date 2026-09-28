# Tasks — F49 `honest-totals`

## Lote A — la marca y el filtro por traspaso
Archivos: `prisma/schema.prisma`, `prisma/migrations/<ts>_movement_excluded_from_totals/migration.sql`, `src/modules/movements/movements.schema.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.routes.ts`, `src/modules/movements/movements.exclusion.test.ts`, `src/modules/overview/overview.service.ts`, `src/modules/overview/overview.test.ts`
Depende de: —

- [x] T1 — Columna `excludedFromTotals Boolean @default(false)` en `Movement` y su migración (`prisma migrate dev`); ajustar el comentario de `productId`. Cubre: R4.
- [x] T2 — `excludedFromTotals` en `TotalsMovement` y `SerializedMovement`; `serializeMovement` lo emite. Cubre: R4.
- [x] T3 — `computeTotals` descarta `excludedFromTotals = true`; los `select` de `listMovements` y de `getOverview` lo piden. Cubre: R5, R6, R8.
- [x] T4 — `excludedFromTotals` en los dos cuerpos de `PATCH`, en sus tipos y en `bulkUpdateMovementsWritableProperties`; `updateMovement` y `bulkUpdateMovements` lo escriben. Cubre: R1, R2.
- [x] T5 — `assertStrictBoolean` en el `preValidation` de los dos `PATCH` (`design.md` §3). Cubre: R3.
- [x] T6 — Parámetros `transfer` y `excluded` (`only`/`none`) en `listMovementsSchema` y `MovementListQuery`, aplicados en `movementListWhere`. Cubre: R10, R11, R16.
- [x] T7 — Tests de la marca: marcar y desmarcar de uno en uno; en bloque (solo la marca, y junto a `status`); en bloque con un id inexistente no cambia ninguno; `null`, `"true"`, `1` → 400 sin escribir; el campo sale en `GET /api/movements`; un movimiento nuevo nace a `false`. Cubre: R1, R2, R3, R4.
- [x] T8 — Tests de las sumas: marcado fuera de `totals` de `GET /api/movements`; desmarcado vuelve a la cifra de antes; importe, fechas, descripción, `balanceAfter`, `transferId`, `undoneTransferId` y el `balance` de `GET /api/accounts` idénticos antes y después. Cubre: R5, R7, R8.
- [x] T9 — Test en `overview.test.ts`: un movimiento marcado del mes fuera de `period.totals`, y dentro otra vez al desmarcarlo. Cubre: R6, R8.
- [x] T10 — Tests de los dos filtros: `transfer` y `excluded`, cada uno con `only` y `none`, devuelven sus conjuntos; combinados entre sí y con `accountId` + fechas + paginación, `pagination.total` y `totals` salen de lo filtrado; `transfer=otro` y `excluded=otro` → 400. Cubre: R10, R11, R16.

## Lote B — parejas y traspasos dudosos
Archivos: `src/modules/transfers/transfers.service.ts`, `src/modules/transfers/transfers.types.ts`, `src/modules/transfers/transfers.routes.ts`, `src/modules/transfers/transfers.routes.test.ts`
Depende de: Lote A

- [x] T11 — Extraer `readTransferCandidates` de `detectTransfers` sin cambiar lo que lee; los tests existentes de la detección siguen verdes. Cubre: R14.
- [x] T12 — `listTransferPairs` y `GET /api/transfers` (`design.md` §5). Cubre: R12.
- [x] T13 — `listAmbiguousTransfers` y `GET /api/transfers/ambiguous` (`design.md` §6). Cubre: R14.
- [x] T14 — Tests de parejas: lista vacía; dos parejas en el orden pedido, `expense` antes que `income`; tras `DELETE` la pareja desaparece y sus dos piernas suman en `GET /api/movements` (análogo sembrado de las multas: 100 € `expense` en una cuenta y 100 € `income` en otra a 3 días). Cubre: R12, R13.
- [x] T15 — Tests de marca y traspaso: marcar una pierna enlazada funciona; `POST /api/transfers` sobre un movimiento marcado funciona y la marca sigue; `DELETE` no cambia la marca; una pasada de `detectTransfers` no la cambia. Cubre: R9.
- [x] T16 — Tests de dudosos: un grupo desigualado sale con la misma forma que en el informe de importación; tras enlazar a mano uno de sus movimientos, el grupo cambia o desaparece; el número de filas y `updatedAt` de `Movement` no cambian por la llamada. Cubre: R14.

## Lote C — contrato y modelo de datos
Archivos: `docs/api-contract.md`, `docs/data-model.md`
Depende de: —

- [x] T17 — `docs/api-contract.md`: `excludedFromTotals` en §`Movement` y en los dos `PATCH` (incluido el 400 de R3); `transfer` y `excluded` en §`GET /api/movements`; la exclusión nueva en los totales de §`GET /api/movements` y §`GET /api/overview`; secciones nuevas `GET /api/transfers` y `GET /api/transfers/ambiguous` con ejemplo de respuesta. Cubre: R15.
- [x] T18 — `docs/data-model.md` §Totales globales: tercera exclusión, y que el saldo no la mira. Cubre: R15.
