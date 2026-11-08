# Resumen — feature 69 `last-imports`

Fecha de cierre: 2026-11-08
Intención original: `feature_list.json` → feature `last-imports`, bloque `intent`
Spec (SDD): `specs/69-last-imports/`

## Qué hace ahora la app que antes no

Hay una consulta nueva, `GET /api/last-imports`, que dice por cada cuenta y cada producto
de inversión vivo hasta qué fecha hay datos, qué día se importó por última vez, si se espera
un archivo cada mes y los tramos sin datos. Para saber el día de importación, la importación
guarda ahora el instante en la cuenta y en el producto (`lastImportedAt`). Antes ese día no
quedaba escrito en ningún sitio, y un extracto sin movimientos nuevos no dejaba rastro.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/last-imports` — la consulta | [last-imports.routes.ts:18](../../src/modules/last-imports/last-imports.routes.ts#L18) |
| Lo que calcula la consulta | [last-imports.service.ts:123](../../src/modules/last-imports/last-imports.service.ts#L123) → `getLastImports` |
| Dónde un extracto escribe su fecha de importación | [import.service.ts:804](../../src/modules/import/import.service.ts#L804) (dentro de `importStatement`) |
| Dónde un archivo de producto escribe su fecha de importación | [investments.service.ts:322](../../src/modules/investments/investments.service.ts#L322) (dentro de `upsertProduct`) |
| Registro de la ruta | [app.ts:127](../../src/app.ts#L127) |

## Dónde está el código

### Base de datos

| Qué hace | Dónde |
| --- | --- |
| Columna `lastImportedAt` en la cuenta y en el producto | [schema.prisma](../../prisma/schema.prisma) → `Account.lastImportedAt`, `InvestmentProduct.lastImportedAt` |
| Migración que añade las dos columnas | [migration.sql](../../prisma/migrations/20261108120000_last_imported_at/migration.sql) |
| Migración que rellena la fecha de lo importado antes | [migration.sql](../../prisma/migrations/20261108120100_last_imported_at_backfill/migration.sql) |

### Importación (escritura de la fecha)

| Qué hace | Dónde |
| --- | --- |
| Reloj inyectable para los tests | [import.service.ts](../../src/modules/import/import.service.ts) → `ImportPendingDeps.now`, `ImportStatementDeps.now`, `ImportProductFileDeps.now` |
| El extracto escribe la fecha en su transacción, al final | [import.service.ts](../../src/modules/import/import.service.ts) → `importStatement` |
| El archivo de producto pasa el instante al escritor | [import.service.ts](../../src/modules/import/import.service.ts) → `importProductFile` |
| Los tres escritores de producto reciben el instante | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `persistProductSnapshot`, `persistSavingsSnapshot`, `persistValuation`, `persistDeposit` |
| Lo escribe en `create` y en `update` | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `upsertProduct` |

### Consulta (lectura)

| Qué hace | Dónde |
| --- | --- |
| Lee cada producto con las fechas de sus fotos | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `listProductsForLastImports` |
| Tipo de lo que devuelve | [investments.types.ts](../../src/modules/investments/investments.types.ts) → `ProductImportFacts` |
| Tramos de una cuenta (más de 31 días entre dos importaciones distintas) | [last-imports.service.ts](../../src/modules/last-imports/last-imports.service.ts) → `accountGaps`, `ACCOUNT_GAP_DAYS` |
| Meses sin foto de un producto | [last-imports.service.ts](../../src/modules/last-imports/last-imports.service.ts) → `missingPhotoMonths` |
| Fecha de cierre de un producto | [last-imports.service.ts](../../src/modules/last-imports/last-imports.service.ts) → `closingDate` |
| Acceso a la base del módulo | [last-imports.service.ts](../../src/modules/last-imports/last-imports.service.ts) → `lastImportsDb` |
| Esquema (sin parámetros) y respuesta | [last-imports.schema.ts](../../src/modules/last-imports/last-imports.schema.ts) → `getLastImportsSchema` |
| Tipos de la respuesta | [last-imports.types.ts](../../src/modules/last-imports/last-imports.types.ts) → `LastImportsResponse`, `AccountImportStatus`, `ProductImportStatus`, `DateGap` |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Contrato de la ruta para el frontend | [api-contract.md](../../docs/api-contract.md) → §`GET /api/last-imports` |
| Las dos columnas | [data-model.md](../../docs/data-model.md) → bloques Prisma, diagramas ER, «Columnas reservadas», claves naturales |
| La decisión y sus alternativas | [architecture.md](../../docs/architecture.md) → ADR-044 |
| Los nombres aprobados | [vocabulary.md](../../docs/vocabulary.md) → fila de `GET /api/last-imports` |
| Fila en la tabla de rutas | [README.md](../../README.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La consulta, contra la base de la suite | [last-imports.test.ts](../../src/modules/last-imports/last-imports.test.ts) → `GET /api/last-imports (feature 69)` |
| Las tres reglas puras, sin base | [last-imports.test.ts](../../src/modules/last-imports/last-imports.test.ts) → `the rules of the last imports (feature 69)` |
| La importación escribe la fecha (y no si falla) | [import.last-imported.test.ts](../../src/modules/import/import.last-imported.test.ts) |
| El relleno de la migración | [import.last-imported-migration.test.ts](../../src/modules/import/import.last-imported-migration.test.ts) |
| El contrato publicado | [last-imports.docs.test.ts](../../src/modules/last-imports/last-imports.docs.test.ts) |
| Lista de columnas de `Account` y árbol del módulo | [investments.model.test.ts](../../src/modules/investments/investments.model.test.ts), [architecture.test.ts](../../src/architecture.test.ts) |

## Cumplimiento de la intención

- ✅ "Bankinter con movimientos hasta el 15 de octubre, importado el 2 de noviembre" → lo
  verifica `shows a statement with data until its last movement and the day it was imported`.
  Check: ✅
- ✅ "La foto de un fondo: fecha de la foto y de la importación" → `shows a fund photo with its
  date and the day it was imported`. Check: ✅
- ✅ "Un depósito vivo sin importación mensual; al vencer deja de salir" → `lists a live deposit
  as not expected every month and drops it once it matures`. Check: ✅
- ✅ "Un producto cerrado no sale" → `does not list a closed product`. Check: ✅
- ✅ "Fondo con agosto y octubre: falta septiembre" → `reports September as missing for a fund
  with August and October photos`. Check: ✅
- ✅ "Una cuenta con un hueco entre dos extractos" → `reports a gap between two statements of a
  current account` (38 días sale, 31 justos no) y `does not report a quiet stretch inside one
  statement`. Checks: ✅ ✅
- ✅ "Revolut sin movimientos nuevos: fecha de importación nueva, «datos hasta» igual" →
  `keeps data until and moves the import date when a statement brings no new movements`. Check: ✅
- ✅ "Consultar no cambia nada en la base" → `does not change the database when listing`. Check: ✅
- ✅ (añadido) Un extracto que falla no cambia la fecha → `a failed statement leaves the import
  date as it was`. Check: ✅
- ✅ (añadido) Lo importado antes de la feature → `fills the import date of what was imported
  before the feature`. Check: ✅
- ✅ (añadido) El contrato y lo de siempre → `the contract describes GET /api/last-imports` y
  `pnpm test`. Checks: ✅ ✅

Resultado real de `./init.sh --checks` el 2026-11-08: 13 de 13 en verde.

## Decisiones que se tomaron por ti

- (delegado) Tramo en una cuenta = más de 31 días entre dos movimientos de importaciones
  distintas; dentro de un mismo archivo nunca (punto 1 de la hoja).
- (delegado) Los meses sin foto se buscan en toda la historia del producto (punto 2).
- (delegado) Lo importado antes de la feature sale con el día en que entraron sus filas más
  recientes; una foto vuelta a subir conserva el día de la primera vez (punto 3).
- (delegado) Un producto sin fotos sale con «datos hasta» vacío y su vencimiento al lado (punto 4).
- (delegado) Nombres de la ruta, listas, campos y columna (punto 6).
- (añadido) Un archivo que falla no cuenta como importado; el contrato publicado para el frontend.

## Qué NO se tocó / quedó fuera

- `POST /api/import`: mismos archivos y mismo informe. Ninguna otra ruta cambia.
- El frontend: la ventana emergente la hace su sesión, contra el contrato.
- La base del humano: las dos migraciones están sin aplicar.

## Notas para el futuro (opcional)

- Solo se guarda la última importación, no un historial (técnica 1 de la hoja).
- Un depósito vencido sin `closedAt` no sale aquí, pero `GET /api/net-worth` lo sigue sumando
  (incoherencia heredada de la F67).
