# Design — F54 `unparsed-row-review`

> Modelo: la feature 48 (ADR-031). Todo lo de aquí copia lo que ya hace la ruta
> de los descuadres de saldo; las únicas diferencias están en §3.

## 1. Lo que hay hoy (leído el 2026-10-02)

- `prisma/schema.prisma`: `ImportUnparsedRow` tiene `id`, `bank`, `year`,
  `fileName`, `rowNumber`, `reason`, `createdAt`, `updatedAt` y la clave
  `@@unique([bank, year, fileName, rowNumber], map: "ImportUnparsedRow_identity_key")`.
  **No tiene columnas de revisión.** `ImportBalanceMismatch` sí:
  `status ImportWarningStatus @default(pending)`, `note String?`,
  `reviewedAt DateTime?`. El enumerado `ImportWarningStatus` (`pending`,
  `reviewed`) ya existe.
- `src/modules/import/import.warnings.service.ts`, `persistImportWarnings`: la
  fila se guarda con `upsert` sobre la clave natural y su rama `update` escribe
  **solo** `reason` y `updatedAt`. Es decir: reimportar **no reescribe la fila
  entera**; unas columnas nuevas quedan intactas sin tocar esta función.
- `listPendingImportWarnings`: devuelve todas las filas de `ImportUnparsedRow`
  y los descuadres `pending`; `counts` es el tamaño de cada lista.
- `import.warnings.routes.ts`: `GET /warnings` y
  `PATCH /warnings/balance-mismatches/:id`, con
  `assertOnlyAllowedBodyProperties` en `preValidation`.
- `import.warnings.schema.ts`: `reviewBalanceMismatchSchema` (params `id` entero
  ≥ 1; body `status` enum, `note` string|null máx. 500, `minProperties: 1`,
  `additionalProperties: false`).
- `src/lib/test-real-data.ts`: toda columna `String` o `Decimal` nueva del
  esquema pone la suite en rojo hasta que se apunta en `comparedColumns` o
  `notComparedColumns`.
- `docs/data-model.md` no nombra `ImportUnparsedRow`, `ImportBalanceMismatch`
  ni `ImportWarningStatus` (búsqueda sin resultados).
- En `gastos-frontend/src` no hay ninguna aparición de `import/warnings`
  (búsqueda sin resultados): nadie consume todavía la consulta.

## 2. Cambios

### 2.1 Esquema y migración (aditiva)

`prisma/schema.prisma`, modelo `ImportUnparsedRow`, tres columnas con los mismos
nombres y tipos que en `ImportBalanceMismatch`:

```prisma
status     ImportWarningStatus @default(pending)
note       String?
reviewedAt DateTime?
```

Sin `@@index([status])`: ninguna consulta filtra por esa columna (§2.3).

Migración nueva `prisma/migrations/20261002120000_unparsed_row_review/migration.sql`:

```sql
ALTER TABLE "ImportUnparsedRow"
  ADD COLUMN "status" "ImportWarningStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);
```

Solo añade: no borra ni reescribe ninguna columna, y las filas que existan
quedan `pending` sin nota (R9). Se genera con `pnpm run prisma:migrate` contra
la base de desarrollo o se escribe a mano; en los dos casos el SQL final tiene
que ser ese y `prisma migrate diff` no debe dejar drift.

### 2.2 Tipos (`import.warnings.types.ts`)

```ts
export interface SerializedUnparsedRow {
  id: number
  file: WarningFileRef
  row: number
  reason: string
  status: 'pending' | 'reviewed'
  note: string | null
  /** When the human gave it for reviewed, ISO UTC; null while pending. */
  reviewedAt: string | null
  detectedAt: string
}

/** Same shape and same rules as ReviewBalanceMismatchPatch. */
export type ReviewUnparsedRowPatch = ReviewBalanceMismatchPatch
```

`ImportWarningsReport` no cambia de forma.

### 2.3 Servicio (`import.warnings.service.ts`)

- `serializeUnparsedRow`: añade `status`, `note`, `reviewedAt`
  (`row.reviewedAt?.toISOString() ?? null`), en el orden de §2.2.
- `listPendingImportWarnings`: la consulta de filas no cambia (todas, mismo
  orden). `counts.unparsedRows` pasa a ser el número de filas con
  `status === 'pending'`, contado en memoria sobre la lista ya leída (R7). La
  parte de los descuadres no se toca. El nombre de la función se queda (lo
  importan la ruta y los tests de la feature 48); se corrige su comentario.
- Nueva:

```ts
export async function reviewUnparsedRow(
  prisma: AppPrismaClient,
  id: number,
  patch: ReviewUnparsedRowPatch,
): Promise<SerializedUnparsedRow>
```

  Mismo cuerpo que `reviewBalanceMismatch`: `findUnique`; si no existe,
  `throw new NotFoundError(`Unparsed row ${id} not found`)`; si llega `status`,
  escribe `status` y `reviewedAt` (`new Date()` si `reviewed`, `null` si
  `pending`); si llega `note`, la escribe (`null` la borra). Nunca `delete`.
- `persistImportWarnings`: **no se toca**. Su `update` ya escribe solo `reason`
  y `updatedAt`; se actualiza el comentario para decir que las tres columnas
  nuevas son del humano, igual que en el descuadre (R8).

### 2.4 Esquema HTTP y ruta

`import.warnings.schema.ts`:

```ts
export const reviewUnparsedRowSchema = {
  params: reviewBalanceMismatchSchema.params,
  body: reviewBalanceMismatchSchema.body,
} as const
```

El conjunto de propiedades admitidas es el mismo
(`reviewBalanceMismatchBodyProperties`); `reviewBalanceMismatchSchema` no se
modifica.

`import.warnings.routes.ts`: una ruta más, calcada de la existente:

```
PATCH /api/import/warnings/unparsed-rows/:id
```

con `schema: reviewUnparsedRowSchema`, el mismo `preValidation` y el handler que
llama a `reviewUnparsedRow`. `src/app.ts` no se toca.

### 2.5 Errores

Ninguno nuevo. `NotFoundError` (404 `NOT_FOUND`) y el `VALIDATION_ERROR` (400)
que ya produce el handler central.

### 2.6 Comprobación de datos reales

`src/lib/test-real-data.ts`: `{ table: 'ImportUnparsedRow', column: 'note', kind: 'text' }`
en `comparedColumns`, junto a `ImportBalanceMismatch.note` (es texto del
humano). `status` es un enumerado y `reviewedAt` una fecha: si la suite las
pide decidir, van a `notComparedColumns` con su motivo; si no las pide, no se
apuntan.

## 3. En qué se diferencia de los descuadres (y por qué)

| | Descuadre de saldo | Fila que el parser no pudo leer |
|---|---|---|
| Tras revisarla, en la consulta | deja de salir | **sigue saliendo**, con `status: "reviewed"` |
| `reviewedAt` | se guarda, no se serializa | **se serializa** |
| `counts` | tamaño de la lista | solo las `pending` |

El `intent` pide ver la fila revisada «con su nota y cuándo la revisé» al
consultar; por eso no se copia el comportamiento de los descuadres en la lista.

## 4. Documentos

- `docs/api-contract.md`, sección «Lo que una importación deja sin resolver»:
  ejemplo JSON y tabla de `unparsedRows[]` con los tres campos nuevos; sustituir
  el punto «Las filas ilegibles no tienen estado y salen todas» por el
  comportamiento nuevo (salen todas, revisadas incluidas; `counts.unparsedRows`
  cuenta solo las `pending`); corregir la frase de `counts` y la del `PATCH` de
  descuadres que dice que una fila ilegible «no tiene estado»; subsección nueva
  `### PATCH /api/import/warnings/unparsed-rows/:id` con params, body, respuesta
  y errores; nota fechada al principio de la sección (feature 54, 2026-10-02,
  cambio visible para el frontend: la lista incluye revisadas y el contador ya
  no es su tamaño). Las frases que comprueba hoy
  `import.warnings.docs.test.ts` sobre los descuadres se conservan literales.
- `docs/data-model.md`: sección nueva al final de la Parte 1, antes de
  «Puntos abiertos», con los dos modelos y el enumerado copiados de
  `prisma/schema.prisma`; las dos entidades en el diagrama ER de la Parte 1
  (`ACCOUNT ||--o{ IMPORT_BALANCE_MISMATCH`, `IMPORT_UNPARSED_ROW` suelta); las
  dos claves naturales (en la tabla «Claves naturales» o en una tabla igual
  dentro de la sección nueva). La tabla «Columnas reservadas» no cambia: las
  tres columnas nacen con escritor.
- `docs/architecture.md`: encima del ADR-031, la línea «Revisado el 2026-10-02
  por la feature 54 `unparsed-row-review`: una fila que el parser no pudo leer
  ya tiene estado, nota y fecha de revisión, y se revisa por
  `PATCH /api/import/warnings/unparsed-rows/:id`; a diferencia del descuadre,
  sigue saliendo en la consulta una vez revisada». El ADR no se reescribe.
- `docs/roadmap.md`: fila 23 tachada, «cerrado por la F54 (2026-10-02)»: la fila
  se puede dar por revisada con una nota; crear el movimiento a mano quedó
  descartado por el humano ese día («si en el futuro noto que es un problema ya
  haremos algo»). La fila E5 nombra la F54.
- `docs/conventions.md` §Tests: `ImportUnparsedRow.note` en la lista de textos
  que compara `src/no-real-data.test.ts`.

## 5. Alternativas descartadas

- **Consulta que devuelve solo las filas sin revisar, y las revisadas con un
  parámetro** (`?unparsedRows=all`): simétrica con los descuadres, pero añade un
  esquema de query y un caso más, y el humano pide verlas al consultar.
- **Ruta única `PATCH /api/import/warnings/:kind/:id`**: obligaría a tocar la
  ruta de los descuadres, que el `intent` prohíbe cambiar.
- **Extraer un esquema de cuerpo compartido** con nombre neutro: es renombrar
  código de la feature 48 sin necesidad; se referencia el existente.
- **Borrar la fila al revisarla**: prohibido por el `intent`, y la reimportación
  la volvería a crear como no revisada.
