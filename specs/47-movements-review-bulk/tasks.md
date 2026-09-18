# Tasks — F47 `movements-review-bulk`

## Lote A — columna de búsqueda en la base de datos
Archivos: `prisma/schema.prisma`, `prisma/migrations/<ts>_movement_description_search/migration.sql`, `src/modules/movements/movements.search-column.test.ts`
Depende de: —

- [x] T1 — Migración en SQL crudo: columna `descriptionSearch` **generada y
  almacenada** (`lower(translate(description, …))`, ver `design.md` §3) e
  `@@index([categoryId])`. Cubre: R14.
- [x] T2 — Declarar `descriptionSearch String?` y `@@index([categoryId])` en
  `prisma/schema.prisma`, sin que ningún `data:` la escriba. Cubre: R14.
- [x] T3 — Test: crear un movimiento con tildes y mayúsculas por Prisma y
  comprobar que la columna sale en minúsculas y sin tildes, y que el `create` no
  la menciona. Cubre: R14.

## Lote B — filtros nuevos y cambio sobre varios movimientos
Archivos: `src/modules/movements/movements.schema.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.routes.ts`, `src/modules/movements/movements.test.ts`, `src/modules/movements/movements.bulk.test.ts`
Depende de: Lote A

- [x] T4 — Añadir `categoryId`, `uncategorized` y `q` a `listMovementsSchema` y a
  `MovementListQuery`. Cubre: R1, R2, R5.
- [x] T5 — `normalizeForSearch(q)`: minúsculas, sin tildes y con `\`, `%` y `_`
  escapados. Cubre: R5, R6.
- [x] T6 — Aplicar los tres filtros dentro de `movementListWhere` (único `where`
  compartido por página, `count` y `totals`). Cubre: R1, R2, R5, R7.
- [x] T7 — Validaciones previas en `listMovements`: `categoryId` +
  `uncategorized` juntos → `ValidationError`; categoría inexistente →
  `NotFoundError`. Cubre: R3, R4.
- [x] T8 — Tests del listado: por categoría, sin categoría, por texto con tildes
  y mayúsculas, texto con `%`, los dos filtros incompatibles, categoría
  inexistente, y la combinación con `accountId`/fechas/`type`/`status` +
  paginación comprobando `pagination.total` y `totals`. Cubre: R1, R2, R3, R4,
  R5, R6, R7.
- [x] T9 — `bulkUpdateMovementsSchema` (`ids` con `minItems: 1`,
  `maxItems: 200`, `uniqueItems: true`; `categoryId`; `status`) y los tipos
  `BulkUpdateMovementsBody` / `BulkUpdateMovementsResult`. Cubre: R11, R12.
- [x] T10 — `bulkUpdateMovements`: transacción con validación previa de ids,
  categoría, `neutral` y `kind`, `updateMany` de solo `categoryId`/`status`, y
  respuesta `{ updated, movements }`. Cubre: R8, R9, R10, R13.
- [x] T11 — Registrar `PATCH /` con su `preValidation`
  (`assertOnlyAllowedBodyProperties` + exigir `categoryId` o `status`). Cubre: R12.
- [x] T12 — Tests de la operación sobre varios: camino feliz con `status` y con
  `categoryId`, id inexistente → 404 y nada cambia, categoría inexistente → 404,
  `kind` que no casa → 400 y nada cambia, `neutral` con categoría → 400,
  `ids` vacío / repetidos / 201 elementos → 400, propiedad desconocida → 400,
  cuerpo sin `categoryId` ni `status` → 400, y que importe, fechas y descripción
  siguen idénticos. Cubre: R8, R9, R10, R11, R12, R13.

## Lote C — contrato y documentación
Archivos: `docs/api-contract.md`, `README.md`, `docs/roadmap.md`
Depende de: —

- [x] T13 — En `docs/api-contract.md` §`GET /api/movements`: tres filas nuevas en
  la tabla de querystring y los dos errores nuevos (400 por filtros
  incompatibles, 404 por categoría inexistente). Cubre: R15.
- [x] T14 — En `docs/api-contract.md`: sección `PATCH /api/movements` con cuerpo,
  tope de 200, respuesta, tabla de errores y la nota de que es todo o nada y de
  que no toca ningún otro campo. Cubre: R15.
- [x] T15 — Una línea en `README.md` y otra en `docs/roadmap.md`: estos endpoints
  desbloquean la E6 y parte de la E7 del frontend. Cubre: R15.
