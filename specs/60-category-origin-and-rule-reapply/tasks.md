# Tasks — F60 `category-origin-and-rule-reapply`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto** y ejecutarse.
> Ningún test lleva cifras ni conceptos de la base del humano: todo inventado
> (`docs/conventions.md` §Tests, `docs/lessons.md` #3).
>
> `categorySource` y sus valores son propuesta pendiente de aprobación
> (`decisions.md` 🔴 1): si el humano los cambia, el leader corrige estos nombres
> antes de lanzar el Lote A.
>
> ⚠️ **Nada de esta feature se ejecuta contra la base del humano** (`gastos`): ni
> `prisma:migrate`, ni el `.sql` de datos, ni una consulta que escriba. La migración
> se genera y se prueba en las bases de test; aplicarla a la suya es del humano
> (`decisions.md` 📌).

## Lote A — la columna, la migración y los tres escritores de `movements`
Archivos: `prisma/schema.prisma`, `prisma/migrations/20261018120000_movement_category_source/migration.sql`, `prisma/migrations/20261018120100_movement_category_source_backfill/migration.sql`, `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.test.ts`, `src/modules/movements/movements.bulk.test.ts`, `src/modules/movements/movements.confirm-all.test.ts`, `src/modules/movements/movements.category-source-migration.test.ts`, `docs/data-model.md`
Depende de: —

- [x] T1 — Enum `CategorySource` y columna `Movement.categorySource` con sus comentarios (`design.md` §1); migración de esquema `20261018120000_movement_category_source` y migración de datos `20261018120100_movement_category_source_backfill` (§2); `pnpm run prisma:generate`. Cubre: R1, R14.
- [x] T2 — `updateMovement`, `bulkUpdateMovements` y `confirmAllMovements` escriben `categorySource` en el mismo `data` que `categoryId` (§3); `serializeMovement` y `SerializedMovement` llevan `categorySource` (§3). Cubre: R1, R2, R3, R4, R5.
- [x] T3 — Tests en `movements.test.ts`:
  - "marks the category as set by hand when PATCH /api/movements/:id writes it" — R1, R2 (también con el mismo `categoryId` que ya tenía un movimiento `closing`: pasa a `manual`).
  - "clears the category source when PATCH /api/movements/:id removes the category" — R1, R4.
  - "keeps the category source when PATCH /api/movements/:id changes only the status" — R2.
  - Actualizar "keeps the serialized shape of each movement exactly as it was (feature 36)" con `categorySource` en su lista, y el test de la línea ~2005 (`untouched`) para que excluya también `categorySource` y compruebe que vale `manual`. Añadir `CategorySource` a "CategoryKind, PaymentMethod, MovementOrigin and MovementStatus hold their values" o a un `it` hermano: `['manual', 'rule', 'closing']`. Cubre: R1.
- [x] T4 — Test en `movements.bulk.test.ts`: "marks the category of every listed movement as set by hand" — R3; y en el mismo archivo, que `categoryId: null` en bloque deja `categorySource` `null` — R4.
- [x] T5 — Test en `movements.confirm-all.test.ts`: "marks the category it fills as written by the closing step" — R5 (los que ya tenían categoría conservan su `categorySource`).
- [x] T6 — `movements.category-source-migration.test.ts`, siguiendo `movements.deposit-unmark-migration.test.ts` (ejecuta el `.sql` de datos sobre filas sembradas en la base del worker): "gives closing to the generic categories and manual to every other categorized movement" — R14 (una raíz `Otros gastos` expense, una raíz `Otros ingresos` income, otra categoría cualquiera, un movimiento sin categoría y uno ya con `categorySource`; comprueba los cuatro resultados y que `updatedAt` y el resto de columnas no cambian). Ojo: las dos raíces genéricas pueden existir ya en la base del worker (las crea también `import.service.test.ts`); buscar o crear, y borrar solo lo creado.
- [x] T7 — `docs/data-model.md` (lección #2): bloque Prisma, diagrama ER, tabla «Columnas reservadas» (fila `categoryId` con su origen) y tabla de claves naturales, comprobados contra `prisma/schema.prisma`. Cubre: R1.

## Lote B — la pasada con dos alcances, las rutas de reglas y los documentos
Archivos: `src/modules/category-rules/category-rules.service.ts`, `src/modules/category-rules/category-rules.types.ts`, `src/modules/category-rules/category-rules.routes.ts`, `src/modules/category-rules/category-rules.service.test.ts`, `src/modules/category-rules/category-rules.routes.test.ts`, `src/modules/category-rules/category-rules.docs.test.ts`, `src/modules/import/import.service.test.ts`, `docs/api-contract.md`, `README.md`, `docs/architecture.md`
Depende de: Lote A

- [x] T8 — `CategorizationScope`, `categorizationEligibleWhere`, `matchingRules` y el parámetro `scope` de `applyCategoryRules` con valor por defecto `'pending'`; la escritura lleva `categorySource: 'rule'` y repite el `where` del alcance (`design.md` §4). Cubre: R6, R9, R10, R12, R13.
- [x] T9 — `POST /` y `PATCH /:id` ejecutan `applyCategoryRules(db, 'pendingAndClosing')` tras guardar la regla y responden con `categorization` (`design.md` §5); tipo `SerializedCategoryRuleWithCategorization`. Cubre: R7, R8.
- [x] T10 — Tests en `category-rules.routes.test.ts`:
  - "moves the movements the closing step left in the generic category when a rule is created" — R7 (y la respuesta 201 trae `categorization.categorizedMovements` con ellos).
  - "moves the movements the closing step left in the generic category when a rule is changed" — R8.
  - "never changes a movement whose category was set by hand, on creating or changing a rule" — R9 (incluye uno `manual` en la propia genérica).
  - "never changes a movement a rule already categorized, on creating or changing a rule" — R9.
  - "leaves a generic movement that rules of two categories match where it was and lists the conflict" — R10.
  - "deleting a rule changes neither the category nor its source on any movement" — R11.
  - "does not recategorize anything when the rule is rejected" — R7 (un 409 por `matchText` repetido no mueve ningún `closing`).
- [x] T11 — Tests en `category-rules.service.test.ts`:
  - "marks the category it writes as set by a rule" — R6.
  - "keeps the default run to uncategorized pending movements and leaves closing ones alone" — R12.
  - "recategorizing a closing movement changes only its category and its source, and no total" — R13.
  - Actualizar "writes ONLY categoryId: full row and period totals identical otherwise (R14)" para excluir también `categorySource` y comprobar que vale `rule`. Los demás tests de F43/F56 siguen pasando sin cambiar lo que comprueban. Cubre: R6, R13.
- [x] T12 — Test en `import.service.test.ts`, en el `describe` del paso de cierre: "an import still applies the rules to its new movements and closes the rest, marked as closing" — R5, R12 (un movimiento `closing` previo que casa con una regla **no** se mueve en la importación).
- [x] T13 — `docs/api-contract.md` según `design.md` §7, con ejemplo JSON de la respuesta 201 que incluya `categorization`; `README.md` (filas `POST` y `PATCH /api/category-rules`); `docs/architecture.md` ADR-038 (`design.md` §9). Cubre: R15.
- [x] T14 — Test en `category-rules.docs.test.ts`: "api-contract: says what a rule recategorizes and what not, and describes categorySource" — R15 (la sección `### Movement` tiene la fila `categorySource` con `manual`, `rule` y `closing`; `### POST /api/category-rules` nombra `categorization`, `closing` y `manual`, y su ejemplo JSON parsea y trae `categorization`; `### DELETE /api/category-rules/:id` dice que no cambia el origen).
