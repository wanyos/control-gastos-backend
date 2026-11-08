# Design — F69 `last-imports`

## Resumen

Dos mitades:

1. **Escritura (importador).** Dos columnas nuevas, `Account.lastImportedAt` e
   `InvestmentProduct.lastImportedAt` (`DateTime?`, timestamp). El importador las
   escribe dentro de la transacción del archivo que guarda; nada más las escribe.
   Una migración de datos las rellena para lo importado antes de la feature.
2. **Lectura (ruta nueva).** `GET /api/last-imports`, módulo nuevo
   `src/modules/last-imports/`, solo `find*`. Las tablas de inversiones se leen a
   través de una función nueva de `investments.service.ts` (único archivo que
   puede nombrarlas, `src/architecture.test.ts`).

Sin librerías nuevas. Sin cambios en `POST /api/import` (mismo informe, mismos
archivos) ni en ninguna otra ruta.

## 1. Esquema y migraciones

`prisma/schema.prisma`:

```prisma
model Account {
  // ...
  /// Feature 69: when an import last stored a statement of this account
  /// (status imported, also when every row was a duplicate). Written only by
  /// `importStatement`, inside the file's transaction. NULL = never imported.
  lastImportedAt DateTime?
}

model InvestmentProduct {
  // ...
  /// Feature 69: when an import last stored a file of this product. Written only
  /// by `upsertProduct` (the three product writers). NOT `updatedAt`: a manual
  /// rename moves that one.
  lastImportedAt DateTime?
}
```

Dos migraciones, como la F60 (esquema y datos separados):

- `20261108120000_last_imported_at/migration.sql`: los dos `ALTER TABLE … ADD
  COLUMN "lastImportedAt" TIMESTAMP(3)` (generado con `prisma migrate dev`).
- `20261108120100_last_imported_at_backfill/migration.sql`: solo datos (R14).

  ```sql
  UPDATE "Account" a
  SET "lastImportedAt" = m.last
  FROM (SELECT "accountId", MAX("createdAt") AS last FROM "Movement" GROUP BY 1) m
  WHERE m."accountId" = a.id AND a."lastImportedAt" IS NULL;

  UPDATE "InvestmentProduct" p
  SET "lastImportedAt" = GREATEST(
    p."createdAt",
    (SELECT MAX("createdAt") FROM "Valuation" v WHERE v."productId" = p.id),
    (SELECT MAX("createdAt") FROM "SavingsSnapshot" s WHERE s."productId" = p.id)
  )
  WHERE p."lastImportedAt" IS NULL;
  ```

  `GREATEST` de PostgreSQL ignora los `NULL`. Solo toca `NULL`: volver a
  ejecutarla no cambia nada. No escribe `updatedAt` (el `UPDATE` crudo no lo
  toca). Cabecera de comentario con el porqué, como la de la F60.

Columnas `DateTime`: `src/lib/test-real-data.ts` no pide decidirlas (solo
`Decimal` y `String`).

## 2. Escritura en el importador

Reloj inyectable, por defecto `() => new Date()`:

- `ImportPendingDeps.now?: () => Date` → se pasa a `importStatement` y a
  `importProductFile`.
- `ImportStatementDeps.now?: () => Date`.
- `ImportProductFileDeps.now?: () => Date`.

`importStatement` (`src/modules/import/import.service.ts`): dentro del
`$transaction`, después de `persistImportWarnings` (último paso que puede fallar):

```ts
await tx.account.update({
  where: { id: resolution.account.id },
  data: { lastImportedAt: now() },
})
```

Al estar dentro de la transacción, un fallo de cualquier paso lo deshace (R5). Un
archivo vacío o ilegible no abre transacción y tampoco lo escribe.

`importProductFile` llama a `persistProductSnapshot(deps.prisma, {...}, now())`.

`src/modules/investments/investments.service.ts`: `persistProductSnapshot`,
`persistSavingsSnapshot`, `persistValuation` y `persistDeposit` ganan un tercer
parámetro opcional `importedAt: Date = new Date()` que llega a `upsertProduct`, y
este lo escribe en `create` y en `update` como `lastImportedAt`. No va en
`ProductFileCommon`: ese tipo es lo que devuelve un parser, y un parser no sabe
cuándo se importa. Por defecto «ahora» porque toda escritura de un archivo de
producto es una importación, también la de los tests que llaman al escritor
directamente. Así R6 queda en la misma transacción
que el producto y su foto, y la comprobación de `src/architecture.test.ts` (solo
`investments.service.ts` escribe tablas de inversiones) sigue igual.

`POST /api/import` (`import.routes.ts`) no cambia: no pasa `now`.

## 3. Lectura

### Firmas nuevas

`src/modules/investments/investments.service.ts`:

```ts
/** Feature 69: every product with what the last-imports view needs. Only find*. */
export async function listProductsForLastImports(
  prisma: AppPrismaClient,
): Promise<ProductImportFacts[]>
```

`ProductImportFacts` (en `investments.types.ts`): `{ id, bank, name, type,
closedAt: Date | null, maturityDate: Date | null, lastImportedAt: Date | null,
photoDates: Date[] }` (fechas de `Valuation` y `SavingsSnapshot` del producto,
ascendentes). La decisión de vivo/cerrado y los huecos NO van aquí: van en el
módulo nuevo, como funciones puras.

`src/modules/last-imports/`:

- `last-imports.types.ts`: `LastImportsResponse`, `AccountImportStatus`,
  `ProductImportStatus`, `DateGap { from: string; to: string }`.
- `last-imports.service.ts`:
  - `lastImportsDb(app)` (mismo patrón que `netWorthDb`).
  - `getLastImports(prisma, today: Date): Promise<LastImportsResponse>`.
  - Puras y exportadas para testearlas sin base:
    - `accountGaps(movements: { bookingDate: Date; createdAt: Date }[]): DateGap[]`
      — recibe los movimientos ya en orden `bookingDate, daySequence, id`.
    - `missingPhotoMonths(photoDates: Date[]): DateGap[]`.
    - `closingDate(product): Date | null` — la más temprana no nula de
      `closedAt`, `maturityDate`.
- `last-imports.schema.ts`: querystring sin propiedades
  (`additionalProperties: false`, como `net-worth`) y esquema de respuesta.
- `last-imports.routes.ts`: `GET /` → `getLastImports(db, todayInMadridAsDate())`.

`src/app.ts`: `app.register(lastImportsRoutes, { prefix: '/api/last-imports' })`.

### Consulta de cuentas

- `prisma.account.findMany({ orderBy: [{ bank: 'asc' }, { id: 'asc' }] })`.
- Movimientos: un `prisma.movement.findMany({ select: { accountId, bookingDate,
  createdAt }, orderBy: [{ accountId }, { bookingDate }, { daySequence }, { id }] })`
  y se agrupa en memoria (unas mil filas hoy). `dataUntil` = último
  `bookingDate` del grupo.
- `gaps` = `accountGaps(grupo)`: para cada par consecutivo `(a, b)`, si
  `a.createdAt.getTime() !== b.createdAt.getTime()` y `b.bookingDate −
  a.bookingDate > 31` días → `{ from: a + 1 día, to: b − 1 día }`.
  Constante `ACCOUNT_GAP_DAYS = 31` con comentario del porqué (medición del
  2026-11-08).

### Consulta de productos

- `listProductsForLastImports(prisma)`; en el módulo nuevo se filtran los vivos:
  `closingDate(p) === null || closingDate(p) > today` (R8).
- `dataUntil` = última de `photoDates` o `null`.
- `expectedMonthly` = `maturityDate === null` (R9, R10).
- `gaps` = `expectedMonthly ? missingPhotoMonths(photoDates) : []`. Meses en UTC
  (las fotos son `@db.Date`, medianoche UTC). Rachas consecutivas se juntan en un
  tramo; `to` = último día del mes (`Date.UTC(y, m + 1, 0)`).
- Orden: `bank`, `name`.

### Serialización

- `asOf`, `dataUntil`, `maturityDate`, `from`, `to`: `YYYY-MM-DD` (date-only).
- `importedAt`: `todayInMadrid(lastImportedAt)` o `null` (R3). Es la primera vez
  que el contrato publica un instante como fecha de Madrid; se dice en la sección.

### Forma de la respuesta

```json
{
  "asOf": "2026-11-08",
  "accounts": [
    {
      "accountId": 1, "bank": "bankinter", "alias": "Bankinter",
      "dataUntil": "2026-10-15", "importedAt": "2026-11-02",
      "expectedMonthly": true, "gaps": []
    }
  ],
  "products": [
    {
      "productId": 7, "bank": "myinvestor", "name": "Fondo X", "type": "fund",
      "maturityDate": null, "dataUntil": "2026-10-14", "importedAt": "2026-10-15",
      "expectedMonthly": true,
      "gaps": [{ "from": "2026-09-01", "to": "2026-09-30" }]
    }
  ]
}
```

(Ejemplo inventado: nombres y fechas de ejemplo, ninguna cifra.)

## 4. Errores

Ninguno nuevo. La ruta no tiene parámetros; un error de base sale por el handler
central (`500`).

## 5. Documentos que la feature vuelve falsos o incompletos

- `docs/api-contract.md`: sección nueva `### GET /api/last-imports` (R16).
- `docs/data-model.md`: las dos columnas en el bloque Prisma, el diagrama ER,
  «Columnas reservadas» y claves naturales (lección 2 de `docs/lessons.md`).
- `docs/architecture.md`: ADR-044 (columnas en vez de tabla, regla de huecos,
  relleno con `createdAt`).
- `docs/vocabulary.md`: los nombres que el humano apruebe en la puerta (punto 🔴 6).
- `src/architecture.test.ts`: los cinco archivos del módulo nuevo en la lista del
  árbol (como F42).

## 6. Alternativas descartadas

- **Tabla nueva con una fila por archivo importado** (banco, carpeta, nombre,
  cuenta o producto, primera y última fecha, instante). Daría historial y el
  rango cubierto por cada archivo contando también sus duplicados, pero lo que
  se pide es solo la última fecha, el pasado no se puede rellenar con nombres de
  archivo, y para los huecos el `createdAt` de los movimientos ya separa una
  importación de otra. Queda como alternativa del punto 🔴 1 si el humano
  prefiere un hueco más fino.
- **Leer el periodo que cubre cada extracto** (si el banco lo escribe): sería lo
  exacto, pero ningún parser lo lee y no se han abierto los archivos reales de
  los cinco bancos. Sin esa entrada no se diseña (regla 4 de `docs/specs.md`).
- **Sacar la fecha de importación al leer** (`MAX(createdAt)` cada vez) en vez de
  guardarla: no ve una importación sin movimientos nuevos (el caso de Revolut).
- **`updatedAt` del producto o de la foto**: se mueve por cambios que no son
  importaciones (renombrado a mano del 2026-11-08).
- **Umbral de 20 días** para la cuenta corriente: con los datos de hoy sacaría dos
  huecos en MyInvestor (saltos de 23 y 25 días entre dos importaciones que
  no se sabe si son huecos de verdad).
- **Ruta bajo `/api/import`** (`GET /api/import/status`): el módulo de importación
  es el que escribe; la vista mezcla cuentas e inversiones, como `net-worth`, y va
  en módulo propio.
