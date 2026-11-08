# Tasks — F69 `last-imports`

> Dos lotes en secuencia: el B lee lo que el A empieza a guardar. Los nombres de
> test entre comillas son los que filtran los `checks` de `feature_list.json`:
> tienen que existir con ese texto exacto.

## Lote A — guardar cuándo se importa cada cosa
Archivos: `prisma/schema.prisma`, `prisma/migrations/20261108120000_last_imported_at/migration.sql`, `prisma/migrations/20261108120100_last_imported_at_backfill/migration.sql`, `src/modules/import/import.service.ts`, `src/modules/investments/investments.service.ts`, `src/modules/investments/investments.types.ts`, `src/modules/import/import.last-imported.test.ts`, `src/modules/import/import.last-imported-migration.test.ts`, `docs/data-model.md`, `src/modules/investments/investments.model.test.ts` (añadido por el leader el 2026-11-08: fija la lista de columnas de `Account`)
Depende de: —

- [x] T1 — Añadir `lastImportedAt DateTime?` a `Account` y a `InvestmentProduct`
  con su comentario, y generar la migración `20261108120000_last_imported_at`.
  Cubre: R4, R6.
- [x] T2 — Migración solo de datos `20261108120100_last_imported_at_backfill`
  (SQL de `design.md` §1, con cabecera de comentario como la de la F60). Cubre: R14.
- [x] T3 — Reloj inyectable `now?: () => Date` en `ImportPendingDeps`,
  `ImportStatementDeps` e `ImportProductFileDeps`; `importStatement` escribe
  `Account.lastImportedAt` dentro de su transacción, después de
  `persistImportWarnings`. Cubre: R4, R5.
- [x] T4 — Tercer parámetro `importedAt: Date = new Date()` en
  `persistProductSnapshot` y sus tres escritores hasta `upsertProduct`, que
  escribe `lastImportedAt` en `create` y `update`; `importProductFile` le pasa
  `now()`. Cubre: R6.
- [x] T5 — `listProductsForLastImports(prisma)` y el tipo `ProductImportFacts`
  (`design.md` §3), solo `find*`. Cubre: R7 (lo usa el lote B).
- [x] T6 — Tests en `import.last-imported.test.ts`:
  `"a failed statement leaves the import date as it was"` (a una cuenta ya
  importada le llega un extracto que termina `failed` dentro de la transacción,
  como en los tests de la F66, y su `lastImportedAt` no cambia) y
  `"writes the import date of a product file"` (con `now` fijo, el producto queda
  con ese instante; también al reimportar el mismo archivo). Cubre: R5, R6.
- [x] T7 — Test en `import.last-imported-migration.test.ts`, mismo patrón que
  `movements.category-source-migration.test.ts` (ejecuta el `migration.sql` sobre
  filas sembradas con `lastImportedAt` a `NULL`):
  `"fills the import date of what was imported before the feature"` (cuenta con
  movimientos de dos `createdAt` → el más reciente; cuenta sin movimientos →
  sigue `NULL`; producto con fotos → el más reciente entre producto y fotos;
  depósito sin fotos → su `createdAt`; una fila ya rellena no cambia). Cubre: R14.
- [x] T8 — `docs/data-model.md`: las dos columnas en el bloque Prisma, el
  diagrama ER, «Columnas reservadas» y la tabla de claves naturales, comprobado
  contra `prisma/schema.prisma` (lección 2 de `docs/lessons.md`). Cubre: R4, R6.

## Lote B — la ruta `GET /api/last-imports` y su contrato
Archivos: `src/modules/last-imports/last-imports.routes.ts`, `src/modules/last-imports/last-imports.service.ts`, `src/modules/last-imports/last-imports.schema.ts`, `src/modules/last-imports/last-imports.types.ts`, `src/modules/last-imports/last-imports.test.ts`, `src/modules/last-imports/last-imports.docs.test.ts`, `src/app.ts`, `src/architecture.test.ts`, `docs/api-contract.md`, `docs/architecture.md`, `docs/vocabulary.md`, `README.md` (añadido por el leader el 2026-11-08: la fila de la ruta en la tabla de rutas)
Depende de: Lote A

- [x] T9 — Módulo `last-imports` (`design.md` §3): tipos, esquema sin parámetros
  con esquema de respuesta, servicio `getLastImports(prisma, today)` con las
  puras `accountGaps`, `missingPhotoMonths` y `closingDate`, ruta `GET /` con
  `todayInMadridAsDate()`, y registro en `src/app.ts` con prefijo
  `/api/last-imports`. Cubre: R1, R2, R3, R7, R8, R9, R10, R11, R12, R13, R15.
- [x] T10 — Tests de lo que pidió el humano, en `last-imports.test.ts` (fixtures
  inventados; los movimientos de los tests de huecos se siembran con `createdAt`
  explícito para no depender del reloj):
  - `"answers GET /api/last-imports with asOf, accounts and products"` — R1.
  - `"shows a statement with data until its last movement and the day it was imported"`
    — `importStatement` con movimientos hasta el 2026-10-15 y `now` del
    2026-11-02 → `dataUntil: "2026-10-15"`, `importedAt: "2026-11-02"`. R2, R3, R4.
  - `"keeps data until and moves the import date when a statement brings no new movements"`
    — el mismo extracto otra vez con un `now` posterior. R4.
  - `"shows a fund photo with its date and the day it was imported"` — R6, R7.
  - `"lists a live deposit as not expected every month and drops it once it matures"`
    — con `today` antes y el mismo día del vencimiento. R8, R9.
  - `"does not list a closed product"` — un fondo con `closedAt`. R8.
  - `"reports September as missing for a fund with August and October photos"`
    — `gaps: [{ from: "…-09-01", to: "…-09-30" }]`, `expectedMonthly: true`. R10, R11.
  - `"reports a gap between two statements of a current account"` — dos
    `createdAt` distintos y más de 31 días; y uno de exactamente 31 días que no
    sale. R12.
  - `"does not report a quiet stretch inside one statement"` — mismo `createdAt`,
    más de 31 días. R13.
  - `"does not change the database when listing"` — compara la base antes y
    después, como el test equivalente de la F67. R15.
  - `"serializes importedAt as the Madrid date of the stored instant"` — un
    instante a las 23:30 UTC sale con el día siguiente; `NULL` sale `null`. R3.
- [x] T11 — `docs/api-contract.md`: sección `### GET /api/last-imports` (campos,
  ejemplo JSON inventado, regla de vivo, `expectedMonthly`, las dos reglas de
  `gaps`, `importedAt` como fecha de Madrid y qué sale para lo importado antes de
  la feature). Test `"the contract describes GET /api/last-imports"` en
  `last-imports.docs.test.ts`, con el patrón de `investments.gains.docs.test.ts`.
  Cubre: R16.
- [x] T12 — `docs/architecture.md`: ADR-044 (columnas en vez de tabla, regla de
  huecos de cuenta y de producto, relleno con `createdAt`, alternativas de
  `design.md` §6). `src/architecture.test.ts`: los cinco archivos del módulo en
  la lista del árbol. `docs/vocabulary.md`: los nombres aprobados en la puerta
  (punto 🔴 6 de la hoja), con la fecha. Cubre: R16.
