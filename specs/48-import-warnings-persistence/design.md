# Design — F48 `import-warnings-persistence`

> Material del implementer y del reviewer. Se apoya en `docs/architecture.md`
> (ADR-015, ADR-025, ADR-030) y en `docs/conventions.md`; aquí solo está lo que
> esta feature añade o roza.

## 0. Punto de partida comprobado (leído en el código, no deducido)

- `importStatement` es el núcleo compartido por las dos entradas: lo llaman el
  camino de Drive (`importDriveFile` → `store`, `import.service.ts:386`) y el
  local (`import.local.service.ts`). Enganchar ahí cubre las dos de una vez.
- Un archivo con filas ilegibles y al menos un movimiento legible entra y se
  mueve: `assertTheFileBringsMovements` solo lanza cuando no hay ni uno
  (`import.service.ts:602-660`, `:662-679`).
- `unparsedRows` (`UnparsedRow`, `src/lib/parsed-statement.ts:60`) y
  `balanceMismatches` (`BalanceMismatch`,
  `src/modules/import/import.balance.service.ts:22`) hoy solo viajan en el
  informe; no hay ningún modelo para ellos en `prisma/schema.prisma`.
- El guardián del árbol de `src/architecture.test.ts:39` comprueba **existencia**
  de los archivos listados, no que sean los únicos: añadir archivos nuevos al
  módulo `import/` no lo rompe y **no** exige tocarlo.

## 1. ADR que esta feature deroga en parte

**ADR-030 decisión 3** («El descuadre NO se persiste. No hay migración, no hay
columna nueva») queda superada. Su argumento —«un aviso viejo que dice hay
descuadre es peor que no tenerlo»— se respeta así: lo que se guarda es **el hecho
de que el día X, al importar el archivo Y, estos dos números no cuadraban**, con
los números congelados tal como se calcularon. **Nunca se recalcula al leer**, y
por eso no puede quedarse viejo diciendo algo falso: dice algo que pasó. Quién lo
da por cerrado es el humano (R11), no el sistema.

Se añade **ADR-031** con esta decisión y una nota en ADR-030 apuntando a él.

## 2. Modelo de datos (`prisma/schema.prisma` + una migración)

```prisma
enum ImportWarningStatus {
  pending
  reviewed
}

/// A row of a statement file the parser could not interpret (feature 48).
/// It is NOT a movement: nothing about it reaches the Movement table.
model ImportUnparsedRow {
  id        Int      @id @default(autoincrement())
  bank      String
  year      String
  fileName  String
  /// 1-based row number in the file, as UnparsedRow.row carries it.
  rowNumber Int
  reason    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([bank, year, fileName, rowNumber], map: "ImportUnparsedRow_identity_key")
}

/// A descuadre found by one of the two checks of feature 32, kept as the FACT
/// it was when it was found: computed and fromFile are never recalculated.
model ImportBalanceMismatch {
  id          Int                 @id @default(autoincrement())
  bank        String
  year        String
  fileName    String
  account     Account             @relation(fields: [accountId], references: [id])
  accountId   Int
  /// The compared point; serialized as `date`, the name the report already uses.
  bookingDate DateTime            @db.Date
  /// 'per-line' | 'statement-balance', verbatim as the report writes it. A
  /// String and not an enum on purpose: the hyphen is not a valid Prisma enum
  /// identifier and the contract value must not be re-mapped in two places.
  check       String
  computed    Decimal             @db.Decimal(10, 2)
  fromFile    Decimal             @db.Decimal(10, 2)
  status      ImportWarningStatus @default(pending)
  note        String?
  reviewedAt  DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@unique([bank, year, fileName, accountId, bookingDate, check, computed, fromFile],
           map: "ImportBalanceMismatch_identity_key")
  @@index([status])
}
```

- `Account` gana la relación inversa `importBalanceMismatches ImportBalanceMismatch[]`
  (lo exige Prisma; no cambia la forma de `GET /api/accounts`).
- El `map:` de los dos `@@unique` es obligatorio: el nombre por defecto de un
  índice de ocho columnas se pasa del límite de 63 caracteres de Postgres.
- `difference` **no se guarda**: es `computed − fromFile` y se calcula al
  serializar, para que no pueda divergir de sus dos sumandos.
- `accountAlias` tampoco: sale de la relación con `Account`, que es de donde sale
  hoy en el informe.
- Migración con `pnpm prisma migrate dev --name import_warnings`. Cero SQL crudo:
  aquí no hay índice parcial que Prisma no sepa expresar (a diferencia del dedup
  de `Movement`, ADR-011).

## 3. Persistencia (`src/modules/import/import.warnings.service.ts`, nuevo)

```ts
export interface WarningFileRef { bank: string; year: string; name: string }

/** Upserts the warnings of ONE imported statement file. Never deletes. */
export async function persistImportWarnings(
  prisma: AppPrismaClient,
  file: WarningFileRef,
  warnings: { unparsedRows: UnparsedRow[]; balanceMismatches: BalanceMismatch[] },
): Promise<void>

export async function listPendingImportWarnings(
  prisma: AppPrismaClient,
): Promise<ImportWarningsReport>

export async function reviewBalanceMismatch(
  prisma: AppPrismaClient,
  id: number,
  patch: { status?: 'pending' | 'reviewed'; note?: string | null },
): Promise<SerializedBalanceMismatch>   // throws NotFoundError
```

- `persistImportWarnings` hace un `upsert` por aviso dentro de **una
  transacción** (`prisma.$transaction`): o entran los avisos de ese archivo
  enteros o ninguno. Un archivo sin avisos no abre transacción (R8).
- El `update` del upsert de un descuadre toca **solo** `updatedAt` (y `reason` en
  el caso de una fila ilegible): **no** toca `status`, `note` ni `reviewedAt`.
  Eso es R7, y es la línea que impide que una reimportación resucite lo revisado.
- `listPendingImportWarnings` filtra `status: 'pending'` en los descuadres y
  devuelve **todas** las filas ilegibles guardadas (no tienen estado: hoy no hay
  forma de darlas por resueltas, cabo suelto 23). Orden: `createdAt DESC, id DESC`.
- Sin paginación: la lista es la de lo pendiente, que se espera corta. Si crece,
  es otra feature; queda dicho en el contrato.

## 4. Enganche en la importación (`src/modules/import/import.service.ts`)

Dentro de `importStatement`, **después** de las dos comprobaciones de saldo y
**antes** de `result.status = 'imported'`:

```ts
await persistImportWarnings(deps.prisma, deps.file, {
  unparsedRows: statement.unparsedRows,
  balanceMismatches: result.balanceMismatches,
})
result.status = 'imported'
```

- `ImportStatementDeps` gana `file: WarningFileRef`, así que **los dos llamadores
  de `importStatement` se tocan**: el de Drive (`import.service.ts`, que ya tiene
  los tres datos en `location`) y el local (`import.local.service.ts`, que los
  tiene en el `bank`/`year`/`name` de su recorrido). **Ningún banco se nombra** en el importador: el
  `bank` viaja como el slug que ya usa el resto (ADR-015 y su guardián siguen
  intactos).
- Al estar **dentro del `try`** existente, un fallo de escritura cae en el
  `catch` que ya hay: `status: 'failed'` + `describeError` → el archivo no se
  mueve. Eso es R5, sin una rama nueva.
- Al estar **después** del `assertTheFileBringsMovements`, un archivo que falla
  entero no llega aquí: R4 sale del orden de las líneas, no de un `if`.
- Un archivo de producto (`importProductFile`) no pasa por aquí y no deja avisos.

## 5. Capa HTTP

`src/modules/import/import.warnings.routes.ts` (nuevo), registrado desde
`import.routes.ts` bajo el prefijo `/api/import` que ya existe (`src/app.ts` no
se toca). Esquemas en `import.warnings.schema.ts` (nuevo), JSON Schema nativo de
Fastify (ADR-003), `additionalProperties: false`, `note` con `maxLength: 500`.

```
GET   /api/import/warnings
PATCH /api/import/warnings/balance-mismatches/:id
```

Respuesta de la consulta (R9):

```json
{
  "unparsedRows": [
    { "id": 3,
      "file": { "bank": "bankinter", "year": "2026", "name": "extracto.xlsx" },
      "row": 14, "reason": "importe vacío", "detectedAt": "2026-09-18T10:00:00.000Z" }
  ],
  "balanceMismatches": [
    { "id": 7,
      "file": { "bank": "bankinter", "year": "2026", "name": "extracto.xlsx" },
      "accountId": 1, "accountAlias": "bankinter ···0000",
      "date": "2026-09-14",
      "computed": "100.00", "fromFile": "90.00", "difference": "10.00",
      "check": "per-line",
      "status": "pending", "note": null,
      "detectedAt": "2026-09-18T10:00:00.000Z",
      "lastSeenAt": "2026-09-18T10:00:00.000Z" }
  ],
  "counts": { "unparsedRows": 1, "balanceMismatches": 1 }
}
```

Los campos `row`/`reason` y `date`/`computed`/`fromFile`/`difference`/`check` son
**exactamente** los que el frontend ya recibe hoy dentro del informe de la
importación: quien ya pinta el modal reutiliza su renderizado. Los importes van
como string decimal de dos posiciones (convención del contrato); las marcas de
tiempo en ISO UTC y la fecha comparada como `YYYY-MM-DD` date-only.

El `PATCH` responde `200` con **un** descuadre serializado con esa misma forma.
Errores: `404 NOT_FOUND` (R13) y `400 VALIDATION_ERROR` (R14), los dos del
handler central (ADR-005); **ningún código de error nuevo** en el contrato.

## 6. Alternativas descartadas

1. **Una sola tabla `ImportWarning` con un discriminador `kind` y columnas
   nulas.** Descartada: una fila ilegible y un descuadre no comparten ni una
   columna de contenido (`row`/`reason` contra `accountId`/`computed`/`fromFile`),
   así que la mitad de cada fila serían `NULL` y la clave de deduplicación no
   podría escribirse como un `@@unique` honesto. Dos tablas mantienen el índice
   exacto y la respuesta ya separa las dos listas de todos modos.
2. **Guardar el aviso dentro de la misma transacción que los movimientos.**
   Descartada: obligaría a abrir `persistMovements` para pasarle algo que no es un
   movimiento, y el ancla y las comprobaciones de saldo (que corren después)
   quedarían fuera igual. La transacción por archivo de §3 da la atomicidad que
   hace falta sin tocar el camino de escritura de los movimientos.
3. **Borrar el descuadre cuando una importación posterior ya no lo encuentra.**
   Descartada: es una desaparición silenciosa de una señal de seguridad, y además
   el `per-line` de un archivo reimportado da siempre el mismo resultado, así que
   «ya no lo encuentra» casi siempre significaría «este archivo no se ha vuelto a
   importar», no «ya cuadra».
4. **Reutilizar `PATCH /api/movements/:id`.** Descartada: un descuadre no es un
   movimiento y no tiene ninguno al que colgarse (puede salir de una comparación
   entre dos líneas o del preámbulo del archivo).
