# Resumen — feature 37 `categories-and-tagging`

Fecha de cierre: 2026-09-02
Intención original: `feature_list.json` → feature `categories-and-tagging`, bloque `intent`
Spec: `specs/37-categories-and-tagging/`

## Qué hace ahora la app que antes no

Ahora puedes mantener tu catálogo de categorías (renombrarlas y borrarlas,
además de crearlas y listarlas, que ya existían), ponerle una categoría a un
movimiento —y quitársela—, dar un movimiento por revisado y volver atrás, y dar
de alta tus 16 categorías de arranque con un comando. Nada de esto toca
importes, saldos, totales ni la importación, y los movimientos siguen sin poder
crearse ni borrarse por la API.

## Por dónde se usa (puntos de entrada)

- `PATCH /api/categories/:id` — renombra una categoría (solo el nombre) —
  [categories.routes.ts:49](../../src/modules/categories/categories.routes.ts#L49)
- `DELETE /api/categories/:id` — borra una categoría libre; 409 si está en uso —
  [categories.routes.ts:65](../../src/modules/categories/categories.routes.ts#L65)
- `PATCH /api/movements/:id` — asigna/quita categoría y/o cambia el estado de
  revisión — [movements.routes.ts:40](../../src/modules/movements/movements.routes.ts#L40)
- `pnpm run seed:categories` — siembra las 16 de arranque (idempotente, manual) —
  [seed-categories.ts:24](../../prisma/seed-categories.ts#L24)

## Dónde está el código (para revisión directa)

### Categorías: renombrar y borrar

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Renombra solo el `name` (404 / 409 por duplicado) | `renameCategory` | [categories.service.ts](../../src/modules/categories/categories.service.ts) |
| Borra solo si está libre; 409 con el nº de movimientos | `deleteCategory` | [categories.service.ts](../../src/modules/categories/categories.service.ts) |
| Esquemas del rename (`name` y nada más) y del delete | `renameCategorySchema`, `deleteCategorySchema`, `renameCategoryBodyProperties` | [categories.schema.ts](../../src/modules/categories/categories.schema.ts) |
| Tipos del body y los params | `RenameCategoryBody`, `CategoryIdParams` | [categories.types.ts](../../src/modules/categories/categories.types.ts) |

### Movimientos: categoría y estado

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Valida (404, compatibilidad de `kind`, `neutral`) y escribe solo `categoryId`/`status` | `updateMovement` | [movements.service.ts](../../src/modules/movements/movements.service.ts) |
| Body con `additionalProperties: false` + `minProperties: 1` | `updateMovementSchema`, `updateMovementBodyProperties` | [movements.schema.ts](../../src/modules/movements/movements.schema.ts) |
| Tipos del body y los params | `UpdateMovementBody`, `MovementIdParams` | [movements.types.ts](../../src/modules/movements/movements.types.ts) |
| Rechazo con 400 de propiedades no admitidas (AJV las descartaría en silencio) | `assertOnlyAllowedBodyProperties` | [strict-body.ts](../../src/lib/strict-body.ts) |

### Siembra de la lista de arranque

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Las 16 literales (13 gasto, 3 ingreso, todas raíz) | `defaultCategories` | [categories.seed.ts](../../src/modules/categories/categories.seed.ts) |
| Crea solo lo que falta, jamás toca una fila (`createMany` + `skipDuplicates`) | `seedDefaultCategories` | [categories.seed.ts](../../src/modules/categories/categories.seed.ts) |
| Envoltorio CLI + script `"seed:categories"` | — | [seed-categories.ts](../../prisma/seed-categories.ts), [package.json](../../package.json) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Renombrar/borrar categorías: R1–R6, R11, R12 (12 tests) | [categories.test.ts:206](../../src/modules/categories/categories.test.ts#L206) |
| PATCH de movimientos: R7–R12, R15 (11 tests, incluye saldo y totales antes/después) | [movements.test.ts:1206](../../src/modules/movements/movements.test.ts#L1206) |
| Siembra: R13, R14 (4 tests, lista literal e idempotencia) | [categories.seed.test.ts](../../src/modules/categories/categories.seed.test.ts) |

### Documentación

| Qué | Código |
| --- | --- |
| Tres endpoints nuevos, nota de la siembra, filas `categoryId`/`category`/`status`, nota de solo-lectura reescrita | [api-contract.md](../../docs/api-contract.md) |
| «Columnas reservadas» (`categoryId`, `status` ganan escritor manual) y reglas de categorías | [data-model.md](../../docs/data-model.md) |

## Cumplimiento de la intención

- ✅ «Puedo crear una categoría, listarlas y cambiarle el nombre a una sin tocar
  código ni base de datos a mano» → crear/listar se conservan (test de
  no-regresión R1/R2) y el rename es nuevo; verificado en
  `src/modules/categories/categories.test.ts` (R3, R4, R1/R2).
- ✅ «Puedo ponerle una categoría a un movimiento y quitársela» → verificado en
  `src/modules/movements/movements.test.ts` (R7, R8).
- ✅ «Al empezar, la lista genérica ya está dada de alta y no tengo que
  escribirla yo entera» → `pnpm run seed:categories`; verificado en
  `src/modules/categories/categories.seed.test.ts` (R13). ⚠️ Ya está ejecutada
  contra tu base (ver «Notas para el futuro»): las 16 existen.
- ✅ «Un movimiento que ya he revisado puedo darlo por bueno, y se distingue de
  los que no he mirado todavía» → `status` en el PATCH, en los dos sentidos, y
  el filtro `status` de la F36 los distingue; verificado en
  `movements.test.ts` (R10).
- ✅ «Borrar o cambiar una categoría no borra ningún movimiento» → borrar una en
  uso es 409 y renombrar no toca movimientos; verificado en
  `categories.test.ts` (R5, R6).

## Decisiones que se tomaron por ti

Las cuatro del bloque 🔴 de `decisions.md`, que aprobaste en la puerta:

- (delegado) Borrar una categoría **en uso se impide** (409 con el recuento);
  vive en `deleteCategory`.
- (delegado) La siembra es un **comando manual** (`pnpm run seed:categories`),
  ni migración ni al arrancar; vive en `categories.seed.ts`.
- (delegado) Categoría y estado **viajan juntos** en `PATCH /api/movements/:id`,
  y nada más puede cambiarse por ahí.
- (añadido) La categoría **tiene que casar** con el movimiento
  (gasto↔gasto, ingreso↔ingreso; un `neutral` no se categoriza); vive en
  `updateMovement`.
- (añadido, bloque ⚙️) Renombrar **solo cambia el nombre**: el `kind` y el
  `parentId` son inmutables por esa vía.

## Qué NO se tocó / quedó fuera

- Ni una migración ni un cambio en `prisma/schema.prisma`: las columnas existen
  desde la F8.
- Los movimientos siguen **sin** poder crearse ni borrarse por API; el importe,
  tipo, fechas, descripción… siguen siendo intocables.
- Sin subcategorías nuevas, sin categorías de traspaso/aportación, sin
  categorización automática por reglas (features posteriores).
- `POST /api/accounts` y `POST /api/categories` conservan su comportamiento de
  siempre (una propiedad extra se descarta en silencio; ver Notas).

## Notas para el futuro

- ⚠️ **Tu deber de `decisions.md` §📌 ya está hecho**: el implementer ejecutó la
  siembra contra tu base real por accidente al probar el CLI (lo declaró en su
  informe). Las 16 existen; re-ejecutar el comando no hace nada
  (`created 0, skipped 16`, comprobado). Recuerda el aviso: si renombras una
  sembrada y vuelves a ejecutar, el nombre viejo reaparece.
- El rechazo estricto de propiedades extra (400 en vez de descartarlas) solo lo
  tienen los dos `PATCH` nuevos. Si algún día se quiere en `POST /api/accounts`
  y `POST /api/categories`, es reutilizar `assertOnlyAllowedBodyProperties`.
- Tus 1520 movimientos siguen todos `pending_review` y sin categoría: la
  herramienta está; categorizarlos es trabajo tuyo (a mano por API hasta que el
  frontend tenga pantalla).
