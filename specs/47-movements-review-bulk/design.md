# Design — F47 `movements-review-bulk`

> Se apoya en `docs/architecture.md` (capas HTTP → servicio → datos, errores de
> dominio) y en `docs/conventions.md`. Aquí solo lo que esta feature decide.

## 1. Archivos

| Archivo | Qué le pasa |
| --- | --- |
| `prisma/schema.prisma` | Campo nuevo `descriptionSearch String?` en `Movement` + `@@index([categoryId])` |
| `prisma/migrations/<ts>_movement_description_search/migration.sql` | SQL crudo: columna **generada** + índice |
| `src/modules/movements/movements.schema.ts` | 3 parámetros nuevos en `listMovementsSchema`; `bulkUpdateMovementsSchema` nuevo |
| `src/modules/movements/movements.types.ts` | `MovementListQuery` crece; `BulkUpdateMovementsBody` y `BulkUpdateMovementsResult` nuevos |
| `src/modules/movements/movements.service.ts` | `movementListWhere` crece; `bulkUpdateMovements` nueva |
| `src/modules/movements/movements.routes.ts` | Registro de `PATCH /` |
| `src/modules/movements/movements.test.ts` | Tests de los filtros nuevos |
| `src/modules/movements/movements.bulk.test.ts` | Tests de la operación sobre varios movimientos |
| `docs/api-contract.md` | §`GET /api/movements` y §`PATCH /api/movements` nueva |
| `README.md`, `docs/roadmap.md` | Una línea: esto desbloquea la E6 del frontend |

## 2. Filtros nuevos de `GET /api/movements`

Esquema (AJV, `additionalProperties: false` se mantiene):

```ts
categoryId:    { type: 'integer', minimum: 1 },
uncategorized: { type: 'boolean' },
q:             { type: 'string', minLength: 2, maxLength: 100 },
```

`coerceTypes` de Fastify convierte `uncategorized=true` de la querystring a
booleano; `q` se recorta (`trim`) en el servicio antes de usarse y una cadena que
queda por debajo de 2 caracteres es `400`.

Todo se resuelve **dentro de `movementListWhere`**, que es el único sitio donde
se construye el `where`. Es el invariante de la feature 36: la página, el
`count` y los `totals` miran exactamente las mismas filas, y por eso R7 sale
gratis en vez de ser tres implementaciones que pueden divergir.

```ts
if (query.categoryId !== undefined) where.categoryId = query.categoryId
if (query.uncategorized === true) where.categoryId = null
if (q !== undefined) where.descriptionSearch = { contains: normalizeForSearch(q) }
```

Las dos validaciones previas viven en `listMovements`, al lado de la de
`from`/`to` que ya existe: incoherencia `categoryId` + `uncategorized`
(`ValidationError`, R3) y existencia de la categoría (`NotFoundError`, R4, con el
mismo patrón que la comprobación de `accountId`).

## 3. Ignorar tildes: columna generada por PostgreSQL

**Comprobado el 2026-09-18 contra el contenedor `gastos-postgres`
(`postgres:17-alpine`), no deducido:**

- `unaccent` **está disponible** (`pg_available_extensions`) pero **no instalada**,
  y su función es `STABLE`, no `IMMUTABLE`: no vale para una columna generada ni
  para un índice sin envolverla en una función propia.
- `lower(translate(description, '<vocales acentuadas>', '<vocales sin acento>'))`
  **sí es inmutable** y se ejecutó sobre una tabla de prueba: `Peluquería JOSÉ` →
  `peluqueria jose`, `Ñandú Café` → `nandu cafe`, `COMPRA D'ALIMENTS` →
  `compra d'aliments`. La base de prueba se borró al terminar.

Decisión: columna **generada y almacenada**, escrita en SQL crudo en la
migración (mismo precedente que los índices de ADR-011, que Prisma 7 tampoco
sabe declarar):

```sql
ALTER TABLE "Movement" ADD COLUMN "descriptionSearch" text
  GENERATED ALWAYS AS (lower(translate("description",
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'))) STORED;
```

Consecuencias, por orden de importancia:

1. **Nadie la escribe y no puede desincronizarse** (R14). PostgreSQL la rellena
   sola, también en las 1.607 filas que ya existen, así que no hace falta
   backfill ni tocar el importador.
2. En `schema.prisma` se declara como `descriptionSearch String?` para poder
   filtrar por ella. Prisma **nunca** debe escribirla (PostgreSQL rechaza un
   `INSERT` sobre una columna generada): al no aparecer en ningún `data:` del
   código, no viaja. Hay test que lo comprueba creando un movimiento.
3. `normalizeForSearch(q)` aplica en TypeScript la misma transformación
   (`normalize('NFD')` + quitar diacríticos + `toLowerCase`) y **escapa** `\`,
   `%` y `_` (R6), porque el `contains` de Prisma no los escapa.

**Alternativa descartada:** instalar la extensión `unaccent` y filtrar con
`unaccent(description) ILIKE unaccent($1)` en SQL crudo. Obliga a sacar la
consulta de Prisma o a resolver antes una lista de ids, y en los dos casos rompe
el invariante de un único `where` compartido por la página, el `count` y los
`totals`. Se descartó por eso, no por la extensión en sí.

**Alternativa descartada:** una columna normal escrita por el importador. Añade
un backfill, un punto donde olvidarse de actualizarla y un guardián para que no
se olvide; la generada no tiene ninguno de los tres.

## 4. `PATCH /api/movements`

Fastify distingue `PATCH /` de `PATCH /:id` sin ambigüedad; el endpoint
individual de la feature 37 **no cambia ni un campo**.

```ts
// movements.types.ts
export interface BulkUpdateMovementsBody {
  ids: number[]
  categoryId?: number | null
  status?: MovementStatus
}
export interface BulkUpdateMovementsResult {
  updated: number
  movements: SerializedMovement[]
}

// movements.service.ts
export async function bulkUpdateMovements(
  prisma: AppPrismaClient,
  input: BulkUpdateMovementsBody,
): Promise<BulkUpdateMovementsResult>
```

Esquema del body: `ids` array de enteros ≥ 1, `minItems: 1`, `maxItems: 200`,
`uniqueItems: true` (R11); `categoryId` entero ≥ 1 o `null`; `status` del enum.
El «al menos uno de los dos» de R12 no se expresa con `minProperties` (`ids`
siempre está): se comprueba en la ruta junto a `assertOnlyAllowedBodyProperties`,
que es el mismo `preValidation` que ya usa el PATCH individual — sin él, AJV
**borra en silencio** la propiedad desconocida.

Todo o nada, en una transacción (`prisma.$transaction`), con el mismo orden que
`updateMovement`:

1. `findMany({ where: { id: { in: ids } }, select: { id, type } })`. Si faltan
   ids → `NotFoundError` nombrando los que faltan (R9).
2. Si viene `categoryId` numérico: buscar la categoría (`NotFoundError`, R9) y
   comprobar `neutral` y `kind` contra **cada** movimiento
   (`ValidationError` nombrando los ids que fallan, R10).
3. `updateMany` con `categoryId` y/o `status` y **nada más** (R13).
4. Releer los movimientos con sus relaciones y serializarlos con
   `serializeMovement`, el mismo de siempre.

Las comprobaciones de los pasos 1-3 son **las mismas reglas** que
`updateMovement`, pero aplicadas a un conjunto: no se llama a `updateMovement` en
bucle porque eso serían N validaciones y N `UPDATE`, y porque su `NotFoundError`
no sabe decir *qué* id del lote falló.

**Respuesta**: `{ updated, movements }`. Se devuelven los movimientos
serializados —y no solo el contador— porque el frontend acaba de cambiarlos en
pantalla y así no necesita releer la página; el tamaño está acotado por los 200
ids del tope, es decir exactamente una página de `GET /api/movements`.

**Alternativa descartada:** aceptar también un filtro («confirma todo lo que
cumpla estos filtros») en vez de, o además de, la lista de ids. Es el punto que
el humano tiene que decidir en la puerta (`decisions.md` 🔴 #1): por defecto se
implementa solo la lista de ids. Si elige el filtro, el diseño cambia — el tope
de 200 deja de tener sentido y hace falta una respuesta que diga cuántas filas
tocó sin enumerarlas — y se rehace esta sección.

## 5. Errores

Ninguno nuevo. `ValidationError` (400) y `NotFoundError` (404) de
`src/errors/app-error.ts`, traducidos por el handler central (ADR-005). No hace
falta un `code` nuevo: el contrato ya distingue las dos familias y el `message`
dice qué ids fallaron.

## 6. Índice y rendimiento

- `@@index([categoryId])` nuevo: el filtro por categoría y el de «sin categoría»
  son el uso principal de la pantalla de revisión.
- La búsqueda por texto hace un **escaneo secuencial** de `descriptionSearch`.
  Con 1.607 filas es irrelevante. **Límite conocido, anotado en `decisions.md`:**
  si la tabla llega a decenas de miles de filas habrá que añadir `pg_trgm` (está
  disponible en el contenedor, comprobado) y un índice GIN. No se añade ahora
  porque sería una extensión y un índice para un problema que no existe.

## 7. Qué NO toca esta feature

`PATCH /api/movements/:id`, la forma serializada de un movimiento, los `totals`,
el importador, la detección de traspasos, `POST /api/category-rules` (el frontend
lo usa tal cual) y los dashboards.
