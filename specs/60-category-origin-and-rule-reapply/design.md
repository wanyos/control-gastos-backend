# Design — F60 `category-origin-and-rule-reapply`

> Nombres `categorySource` / `CategorySource` / `manual` / `rule` / `closing`:
> **propuesta pendiente de aprobación** (`decisions.md` 🔴 1). Si cambian, se
> sustituyen tal cual en los tres archivos técnicos.

## 1. Modelo: una columna y un enum

`prisma/schema.prisma`:

```prisma
/// Feature 60: who wrote the current `Movement.categoryId`. NULL exactly when
/// `categoryId` is NULL. A rule only ever rewrites a `closing` one (ADR-038).
enum CategorySource {
  manual   // PATCH /api/movements/:id or PATCH /api/movements (the human)
  rule     // the categorization run of feature 43
  closing  // confirmAllMovements: the closing step of an import, or POST /api/movements/confirm-all
}

model Movement {
  // …
  category       Category?       @relation(fields: [categoryId], references: [id])
  categoryId     Int?
  /// Feature 60: see enum CategorySource. Written in the SAME `data` as
  /// `categoryId` by its four writers; never on its own.
  categorySource CategorySource?
  // …
}
```

- **Sin `CHECK` en la base** que ate `categorySource` a `categoryId`: obligaría a
  tocar los fixtures de once archivos de test que crean movimientos con
  `categoryId` directamente con Prisma. La coherencia la vigilan los cuatro
  escritores (§3) y sus tests. Un movimiento con `categoryId` y
  `categorySource` `null` (solo puede salir de un fixture, la migración no deja
  ninguno) **no es elegible** para ninguna pasada: se trata como protegido.
- El test de los valores del enum vive en `movements.test.ts`, junto al de los
  otros enums del flujo.

## 2. Migraciones (dos, a propósito)

1. `prisma/migrations/20261018120000_movement_category_source/migration.sql` —
   `CREATE TYPE "CategorySource" AS ENUM ('manual','rule','closing')` y
   `ALTER TABLE "Movement" ADD COLUMN "categorySource" "CategorySource"`.
   La genera `pnpm run prisma:migrate` contra la base de test / una base vacía;
   **nunca** se ejecuta contra la base del humano durante la implementación.
2. `prisma/migrations/20261018120100_movement_category_source_backfill/migration.sql` —
   **solo datos** (R14), sin `updatedAt`:

   ```sql
   UPDATE "Movement" m SET "categorySource" = 'closing'
   FROM "Category" c
   WHERE c.id = m."categoryId" AND c."parentId" IS NULL
     AND ((c.kind = 'expense' AND c.name = 'Otros gastos')
       OR (c.kind = 'income'  AND c.name = 'Otros ingresos'));
   UPDATE "Movement" SET "categorySource" = 'manual'
   WHERE "categoryId" IS NOT NULL AND "categorySource" IS NULL;
   ```

   Separada de la 1 para que su test pueda **volver a ejecutar el `.sql` entero**
   sobre filas sembradas en la base desechable del worker, igual que
   `movements.deposit-unmark-migration.test.ts` (F57): la plantilla ya la aplicó
   una vez sobre tablas vacías. Como el segundo `UPDATE` solo toca los `NULL`, el
   archivo es repetible. Los nombres se buscan como los busca
   `closeImportedMovements` (raíz, por nombre y `kind`).

   Comentario de cabecera del `.sql`: qué hace, por qué `manual` para lo que no se
   sabe (`decisions.md` 🔴 2) y que no escribe `updatedAt`. **Sin ningún concepto,
   importe ni cifra de la base del humano** (las migraciones están exentas del
   guardián `src/no-real-data.test.ts` y por eso mismo no se les mete nada).

## 3. Los cuatro escritores de `categoryId`

Comprobado con `grep` el 2026-10-18: no hay más escritores que estos cuatro (la
siembra de reglas no toca movimientos; borrar una categoría con movimientos es 409).

| Escritor | Archivo | Cambio |
|---|---|---|
| `updateMovement` | `movements.service.ts` | si `typeof input.categoryId === 'number'` → `data.categorySource = 'manual'`; si `input.categoryId === null` → `data.categorySource = null` (R2, R4). Solo `status`/`excludedFromTotals` → `categorySource` no se toca. El tipo local de `data` deja de ser `UpdateMovementBody` (no admite `categorySource`): `Prisma.MovementUpdateInput` o un tipo propio con los cuatro campos |
| `bulkUpdateMovements` | `movements.service.ts` | igual, dentro del mismo `updateMany` de la transacción (R3, R4) |
| `confirmAllMovements` | `movements.service.ts` | los dos `updateMany` de categoría llevan `data: { categoryId, categorySource: 'closing' }` (R5). La confirmación de `status` no cambia |
| `applyCategoryRules` | `category-rules.service.ts` | `data: { categoryId: winner.categoryId, categorySource: 'rule' }` (R6) |

`serializeMovement` añade `categorySource: movement.categorySource` después de
`categoryId` (R1). `SerializedMovement` en `movements.types.ts` gana
`categorySource: CategorySource | null` (importado del cliente generado).

## 4. La pasada de categorización con dos alcances

`category-rules.service.ts`:

```ts
/** Which movements a categorization run may write on (feature 60). */
export type CategorizationScope = 'pending' | 'pendingAndClosing'

/**
 * The single definition of "a rule may write here". `pending` is the scope of
 * feature 43 (import run and POST /apply, R12); `pendingAndClosing` adds what the
 * closing step filled (rule create/update, R7, R8). `manual` and `rule` are
 * never in either (R9). Exported so feature 61 counts exactly what a rule would
 * take (its intent: «que el número que me enseña coincida»).
 */
export function categorizationEligibleWhere(scope: CategorizationScope): Prisma.MovementWhereInput

/**
 * Pure: the rules whose category kind equals `type` and whose matchText the
 * normalized description CONTAINS. Extracted from the loop of
 * applyCategoryRules with no behaviour change; feature 61 reuses it.
 */
export function matchingRules<R extends { matchText: string; categoryId: number; category: { kind: CategoryKind } }>(
  description: string,
  type: MovementType,
  rules: R[],
): R[]

export async function applyCategoryRules(
  prisma: AppPrismaClient,
  scope: CategorizationScope = 'pending',
): Promise<CategorizationResult>
```

- `categorizationEligibleWhere('pending')` =
  `{ type: { in: ['expense','income'] }, categoryId: null, status: 'pending_review' }`
  (lo de hoy, idéntico).
- `categorizationEligibleWhere('pendingAndClosing')` =
  `{ type: { in: ['expense','income'] }, OR: [{ categoryId: null, status: 'pending_review' }, { categorySource: 'closing' }] }`.
- La **lectura** usa ese `where`; la **escritura** de cada movimiento repite el
  mismo `where` más `id` (sustituye al `{ id, categoryId: null, status: 'pending_review' }`
  de hoy): si entre la lectura y la escritura alguien le puso la categoría a mano,
  ya es `manual` y no se escribe (misma garantía que F43/F56).
- El valor por defecto `'pending'` hace que `importPending`
  (`import.service.ts`) y la ruta `POST /apply` sigan llamando
  `applyCategoryRules(prisma)` **sin cambiar una línea** (R12). `import.service.ts`
  no se toca.
- Choque de dos categorías (R10): el código de F43 ya no escribe y lo lista; con el
  alcance ampliado vale tal cual.
- Una regla que apunta a la propia `Otros gastos` y casa con un `closing`: se
  escribe (`categoryId` igual, `categorySource` pasa a `rule`) y sale en
  `categorizedMovements`. Es verdad: ahora lo dice una regla. No se filtra.
- `unmatched` con el alcance ampliado cuenta también los `closing` que no casan.
  Es el número de **esa** pasada; se dice en el contrato.

## 5. Crear y cambiar una regla: la pasada va detrás, en la misma petición

`category-rules.routes.ts`:

```ts
// POST /
const rule = await createCategoryRule(db, request.body)
const categorization = await applyCategoryRules(db, 'pendingAndClosing')
return reply.status(201).send({ ...serializeCategoryRule(rule), categorization })

// PATCH /:id — igual, 200
```

`category-rules.types.ts`:

```ts
/** What POST and PATCH answer since feature 60: the rule plus the run it triggered. */
export interface SerializedCategoryRuleWithCategorization extends SerializedCategoryRule {
  categorization: CategorizationResult
}
```

- `GET /api/category-rules` y `DELETE` no cambian (R11: `deleteCategoryRule` ya no
  toca movimientos).
- La regla se guarda **antes** y aparte de la pasada. `applyCategoryRules` nunca
  lanza (F43 R12): un fallo viaja en `categorization.error` y la regla queda
  creada; responder 500 tras haberla guardado mentiría. Un 400/404/409 de la regla
  sale **antes** de la pasada: no se recoloca nada.
- No se envuelve todo en una transacción: la pasada de F43 escribe movimiento a
  movimiento y ya es segura frente a escrituras concurrentes (§4).
- Es un cambio **aditivo** del contrato: los campos de la regla siguen en la raíz;
  `categorization` es nuevo.

## 6. Errores

Ninguno nuevo. Se reutilizan los de F43 (400/404/409) y el `error` saneado dentro
de `CategorizationResult`.

## 7. Documentos que la feature vuelve falsos

| Documento | Qué se corrige |
|---|---|
| `docs/api-contract.md` | `### Movement`: fila nueva `categorySource` y la fila `categoryId` (quién la escribe). `POST /api/category-rules`: el párrafo «Las reglas no categorizan nada por sí solas al crearse» pasa a decir qué recolocan; respuesta 201 con `categorization` y ejemplo. `PATCH /api/category-rules/:id`: ídem 200. `DELETE`: no toca categoría ni origen. `POST /apply`: su alcance no cambia y los `closing` no entran. `PATCH /api/movements/:id`, `PATCH /api/movements`, `POST /api/movements/confirm-all` y el `closing` del informe de `POST /api/import`: qué `categorySource` escribe cada uno (R15) |
| `README.md` | Filas `POST` y `PATCH /api/category-rules` de la tabla de endpoints |
| `docs/data-model.md` | Lección #2: bloque Prisma (`categorySource` y el enum), diagrama ER, tabla «Columnas reservadas» (fila `categoryId`: ahora con su origen) y tabla de claves naturales (sin cambio de clave; comprobar y decirlo) contra `prisma/schema.prisma` |
| `docs/architecture.md` | ADR-038 nuevo (§9) |
| `prisma/schema.prisma` | Comentarios del enum y de la columna (§1) |

## 8. Lo medido en la base real (2026-10-18, solo lectura)

Consultas con `SET default_transaction_read_only=on;` en `gastos-postgres`, base
`gastos`. Nada se escribió.

- Todos los movimientos están confirmados; los que no tienen categoría son piernas
  de traspaso o de producto, que el cierre deja sin categoría a propósito.
- **No hay rastro de quién puso cada categoría.** Casi todos los movimientos
  comparten un mismo `updatedAt` al milisegundo (una escritura en bloque del
  2026-10-16, compatible con `confirm-all`): esa escritura borró cualquier pista
  anterior. Después solo hay dos escrituras en bloque de la genérica y cuatro
  cambios sueltos del 2026-10-17, segundos después de crear reglas (encaja con
  cambios a mano). **No se puede distinguir una genérica puesta a mano de una
  puesta por el cierre**, ni una categoría puesta a mano de una puesta por regla.
- Cruzando la descripción (`descriptionSearch`) con las reglas actuales:
  - de los que están en las dos genéricas, **ninguno** casa hoy con reglas de una
    sola categoría; uno casa con reglas de dos categorías. Es decir: con las reglas
    de hoy, crear la columna y recolocar **no mueve nada**; lo hará la próxima
    regla nueva.
  - del resto, la gran mayoría casa con una regla de su propia categoría
    (probablemente por regla, pero podría ser a mano); menos de diez no casan con
    ninguna regla, casan con una regla de otra categoría o con dos (a mano casi
    seguro).
- Elección (R14): genéricas → `closing`; resto → `manual`. Alternativa descartada:
  `rule` para los que casan con una regla de su categoría; hoy daría el mismo
  comportamiento (ni `rule` ni `manual` son elegibles), pero si una feature futura
  hace que cambiar una regla recoloque lo suyo, movería movimientos que quizá
  puso el humano. Se cuenta en `decisions.md` 🔴 2.

## 9. ADR-038

**Título:** «De dónde salió la categoría de un movimiento se guarda en una columna
(`categorySource`), y una regla solo reescribe lo que dejó el paso de cierre».

Contexto (el cierre deja todo en la genérica y las reglas solo miraban
pendientes), decisión (§1, §4, §5), alternativas descartadas:

- **Deducir el origen al leer** (la categoría es una genérica → del cierre): no
  distingue la genérica que el humano eligió a mano, que es justo lo que no se
  puede pisar.
- **Guardar el id de la regla que categorizó** (`categoryRuleId`): permitiría que
  cambiar o borrar una regla deshaga lo suyo, pero el humano no lo pidió y añade
  una relación con su política de borrado; queda como alternativa en la hoja
  (🔴 4).
- **Recolocar solo con `POST /apply`**: el frontend tendría que encadenar dos
  peticiones y la de crear la regla no diría qué movió.

## 10. Lo que la feature 61 necesita y no se le cierra

- Saber de dónde salió cada categoría: `categorySource` en la tabla y en la API.
- Contar qué movimientos recogería una regla **sin escribir**: con
  `categorizationEligibleWhere('pendingAndClosing')` + `matchingRules`, que son
  exactamente la lectura y el filtro que usa la pasada al crear la regla. Así el
  número de su vista previa y lo que de verdad recoge salen del mismo código.
- Esta feature **no** crea ninguna consulta de vista previa ni de sugerencias.

## 11. Alternativa descartada (diseño)

- **Ejecutar solo la regla nueva** al crearla, en vez de todas: más rápido, pero un
  movimiento que casa con la nueva y con otra de distinta categoría se escribiría
  sin detectar el choque, al revés que en la importación. Correr todas cuesta unos
  milisegundos con el tamaño actual (decenas de reglas, cientos de movimientos
  `closing`) y da una sola definición de «choque».
