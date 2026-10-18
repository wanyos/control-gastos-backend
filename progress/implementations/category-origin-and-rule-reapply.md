# category-origin-and-rule-reapply — implementación

## Lote A — implementación

Nada se ha escrito en la base de datos del humano (`gastos`): ni `prisma migrate`, ni
el `.sql` de datos. La migración de esquema se escribió a partir de
`prisma migrate diff --from-schema <schema de HEAD> --to-schema prisma/schema.prisma --script`,
que compara dos archivos y no abre ninguna base. Las dos migraciones solo se han
aplicado a la plantilla de tests `gastos_test_template` (la vuelve a migrar sola la
suite) y, el `.sql` de datos, a la base desechable del worker en su test. La
comprobación de solo lectura de `vitest.global-setup.ts` sobre la base del humano
pasó en verde en las dos pasadas de `./init.sh`.

### Archivos modificados / creados

- `prisma/schema.prisma` — enum `CategorySource` (`manual`, `rule`, `closing`) y
  columna `Movement.categorySource CategorySource?`, con los comentarios de
  `design.md` §1. Pasado por `prisma format` (solo realinea las columnas del bloque
  de relaciones de `Movement`).
- `prisma/migrations/20261018120000_movement_category_source/migration.sql` (nuevo) —
  `CREATE TYPE` + `ALTER TABLE ... ADD COLUMN`, tal como lo genera Prisma.
- `prisma/migrations/20261018120100_movement_category_source_backfill/migration.sql`
  (nuevo) — solo datos: raíz `Otros gastos` (`expense`) y raíz `Otros ingresos`
  (`income`) → `closing`; resto con categoría → `manual`; sin categoría → `NULL`. No
  escribe `updatedAt`. Cabecera con qué hace y por qué; sin ningún dato del humano.
- `src/generated/prisma/` — regenerado con `pnpm run prisma:generate` (no versionado).
- `src/modules/movements/movements.types.ts` — `SerializedMovement.categorySource`;
  tipo nuevo `MovementWritableFields` (los campos del body más `categorySource`) para
  el `data` de los dos `PATCH`.
- `src/modules/movements/movements.service.ts` — `updateMovement` y
  `bulkUpdateMovements` escriben `categorySource: 'manual'` con un `categoryId`
  numérico y `null` con `categoryId: null`, en el mismo `data`/`updateMany`;
  `confirmAllMovements` escribe `categorySource: 'closing'` en sus dos `updateMany` de
  categoría; `serializeMovement` devuelve `categorySource` detrás de `categoryId`.
- `src/modules/movements/movements.test.ts`, `movements.bulk.test.ts`,
  `movements.confirm-all.test.ts` — tests de T3, T4 y T5 (ver Trazabilidad).
- `src/modules/movements/movements.category-source-migration.test.ts` (nuevo) — T6.
- `docs/data-model.md` — T7 (ver Documentos actualizados).
- `specs/60-category-origin-and-rule-reapply/tasks.md` — T1 a T7 marcadas `[x]`.

### Decisiones tomadas

- **El primer `UPDATE` del `.sql` de datos lleva además `AND m."categorySource" IS NULL`**,
  que el SQL de `design.md` §2 no tiene. Así los **dos** `UPDATE` solo tocan `NULL` y
  el archivo es repetible de verdad (el diseño lo pide: «el archivo es repetible»).
  Sobre la base del humano el resultado es idéntico, porque al aplicarse la columna
  recién creada está entera a `NULL`. El test lo comprueba con un movimiento en
  `Otros gastos` que ya trae `rule`: sigue en `rule`; y ejecutando el archivo dos
  veces.
- El test de la migración añade dos casos que T6 no pide y que vigilan el criterio
  «solo la raíz»: un movimiento en una **subcategoría** llamada `Otros gastos` acaba
  `manual`.
- `MovementWritableFields` en vez de `Prisma.MovementUpdateInput` (las dos las
  admitía `design.md` §3): el tipo propio deja fuera cualquier columna del hecho
  bancario, igual que hacía `UpdateMovementBody`.
- En `docs/data-model.md` no uso «paso de cierre» (no está en `docs/vocabulary.md`):
  lo describo como «la función `confirmAllMovements`, que pone `Otros gastos` /
  `Otros ingresos` a lo que queda sin categoría al final de cada importación y en
  `POST /api/movements/confirm-all`».

### Trazabilidad (solo SDD, lo del Lote A)

- R1 → `keeps the serialized shape of each movement exactly as it was (feature 36)`
  (lista con `categorySource`), `CategorySource holds manual | rule | closing (feature 60, R1)`,
  `changes nothing else: fields, account balance and totals stay identical (R15)`
  (excluye `categorySource` y comprueba `manual`), y los de R2/R4, que leen el campo
  de la respuesta — `movements.test.ts`.
- R2 → `marks the category as set by hand when PATCH /api/movements/:id writes it`
  (incluye el mismo `categoryId` que ya tenía un movimiento `closing`) y
  `keeps the category source when PATCH /api/movements/:id changes only the status`
  (también solo `excludedFromTotals`) — `movements.test.ts`.
- R3 → `marks the category of every listed movement as set by hand` (incluye que un
  lote rechazado con 404 no escribe origen, y que un movimiento no listado conserva
  `closing`) — `movements.bulk.test.ts`.
- R4 → `clears the category source when PATCH /api/movements/:id removes the category`
  (`movements.test.ts`) y
  `clears the category source of every listed movement when the category is removed`
  (`movements.bulk.test.ts`).
- R5 → `marks the category it fills as written by the closing step` (los que ya tenían
  `manual` / `rule` los conservan; una pierna de traspaso queda `null`/`null`) —
  `movements.confirm-all.test.ts`.
- R14 → `gives closing to the generic categories and manual to every other categorized movement`
  — `movements.category-source-migration.test.ts` (ejecuta el `.sql` real dos veces
  sobre filas sembradas; compara la fila entera, `updatedAt` incluido, salvo
  `categorySource`).
- R6 a R13 y R15 son del Lote B.

### Documentos actualizados

`git grep -n "excludedFromTotals"` y `git grep -n "confirmAllMovements\|confirm-all"`
fuera de `progress/` y `specs/` (las dos cosas que cambia el lote: la forma del
movimiento serializado y lo que escriben los dos `PATCH` y `confirm-all`).

Corregido en `docs/data-model.md` (mío):
- Diagrama ER: `CategorySource categorySource` en `MOVEMENT`.
- Bloque Prisma: el enum `CategorySource` y la columna `categorySource` en `Movement`.
- Tabla «Columnas reservadas», fila `categoryId`: quién escribe cada valor de
  `categorySource`, qué puede reescribir una regla y qué hizo la migración de datos.
- «Reglas de negocio», bullet de categorías: decía «La asignación automática por
  reglas será una feature posterior», falso desde la F43; ahora lo dice y añade
  `categorySource`.
- «Índices personalizados», dedup de movimientos: `categorySource` no entra en la
  clave; la F60 no cambia ninguna clave natural ni índice. La tabla «Claves
  naturales» (Parte 2, inversiones) no cambia: comprobado contra
  `prisma/schema.prisma`, la F60 no toca ningún `@@unique` ni `@@index`.

Líneas que el lote vuelve falsas y que están **fuera de mis archivos**, todas en
`docs/api-contract.md`, que es del Lote B (T13, `design.md` §7 ya las cubre):
- `docs/api-contract.md:849-853` — «desde la feature 49 lleva un campo más,
  `excludedFromTotals`, y desde la feature 57 otro más, `deposit`»: ahora hay uno
  más, `categorySource`.
- `docs/api-contract.md:837` (ejemplo JSON de `GET /api/movements`) y la tabla de
  `### Movement` (fila `categoryId`, ~281): sin `categorySource`.
- `docs/api-contract.md:1138` (`POST /api/movements/confirm-all`): «No toca ningún
  otro campo»; ahora escribe también `categorySource: "closing"`.
- `docs/api-contract.md:1034-1040` y `1180-1186` (los dos `PATCH`): no dicen que
  escribir una categoría la deja `manual` y quitarla deja `null`.
`README.md:80-81` no se vuelve falso (habla de qué puede mandar el cliente, que no
cambia).

### Prueba real

No aplica en este lote: no lee datos de fuera. La migración de datos no se ha
ejecutado sobre la base del humano, por instrucción: la aplica él
(`pnpm run db:backup` y luego `pnpm run prisma:migrate`, `decisions.md` 📌).

### Último ./init.sh

Exit 0.

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──       [OK] OK: pnpm run lint
                              All matched files use Prettier code style!
                              [OK] OK: pnpm run format:check
── 6. Ejecutando tests ──      Test Files  86 passed (86)
                              Tests  1452 passed (1452)
                              [OK] Todos los tests pasan
── 7. Resumen ──               [OK] Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 60

Exit 1: 4 de 11 en verde. Los 7 en rojo son tests del Lote B que todavía no existen:

| # | Check | Resultado |
|---|---|---|
| 1 | `category-rules.routes.test.ts` «moves the movements the closing step left in the generic category when a rule is created» | FAIL (Lote B, T10) |
| 2 | ídem «… when a rule is changed» | FAIL (Lote B, T10) |
| 3 | «never changes a movement whose category was set by hand, on creating or changing a rule» | FAIL (Lote B, T10) |
| 4 | `movements.test.ts` «marks the category as set by hand when PATCH /api/movements/:id writes it» | OK — `Tests 1 passed \| 97 skipped (98)` |
| 5 | `category-rules.service.test.ts` «marks the category it writes as set by a rule» | FAIL (Lote B, T11) |
| 6 | `movements.confirm-all.test.ts` «marks the category it fills as written by the closing step» | OK — `Tests 1 passed \| 3 skipped (4)` |
| 7 | `movements.category-source-migration.test.ts` «gives closing to the generic categories and manual to every other categorized movement» | OK — `Tests 1 passed (1)` |
| 8 | `import.service.test.ts` «an import still applies the rules to its new movements and closes the rest, marked as closing» | FAIL (Lote B, T12) |
| 9 | `category-rules.service.test.ts` «recategorizing a closing movement changes only its category and its source, and no total» | FAIL (Lote B, T11) |
| 10 | `pnpm test` | OK |
| 11 | `category-rules.docs.test.ts` «api-contract: says what a rule recategorizes and what not, and describes categorySource» | FAIL (Lote B, T14) |

### Sugerencias fuera de scope (NO aplicadas)

- El diagrama ER de `docs/data-model.md` (entidad `MOVEMENT`) ya no traía, antes de
  esta feature, `note`, `descriptionSearch`, `excludedFromTotals`, `productId`,
  `createdAt` ni `updatedAt`; y el bloque Prisma de la Parte 1 no trae
  `descriptionSearch`. No los he añadido porque no son de la F60.
- Hasta que termine el Lote B, `applyCategoryRules` sigue escribiendo `categoryId`
  sin `categorySource`: un movimiento que categorice una regla entre los dos lotes
  quedaría con `categorySource` `null`. Solo importa si alguien usara este estado
  intermedio sin el Lote B.

## Lote B — implementación

Nada se ha escrito en la base de datos del humano (`gastos`). Todos los tests corren
contra la base desechable del worker; la comprobación de solo lectura de
`vitest.global-setup.ts` pasó en verde en `./init.sh`.

### Archivos modificados / creados

- `src/modules/category-rules/category-rules.service.ts` — tipo
  `CategorizationScope` (`'pending' | 'pendingAndClosing'`),
  `categorizationEligibleWhere(scope)` y `matchingRules(description, type, rules)`
  exportadas; `applyCategoryRules(prisma, scope = 'pending')` lee con el `where` del
  alcance, compara con `matchingRules` y escribe con
  `where: { ...eligible, id }` y `data: { categoryId, categorySource: 'rule' }`.
- `src/modules/category-rules/category-rules.types.ts` —
  `SerializedCategoryRuleWithCategorization` (la regla más `categorization`).
- `src/modules/category-rules/category-rules.routes.ts` — `POST /` y `PATCH /:id`
  llaman a `applyCategoryRules(db, 'pendingAndClosing')` después de guardar la regla
  y responden con `categorization`. `GET`, `DELETE` y `POST /apply` sin cambios.
- `src/modules/category-rules/category-rules.service.test.ts`,
  `category-rules.routes.test.ts`, `category-rules.docs.test.ts`,
  `src/modules/import/import.service.test.ts` — tests de T10, T11, T12 y T14.
- `docs/api-contract.md`, `README.md`, `docs/architecture.md` (ADR-038) — T13.
- `specs/60-category-origin-and-rule-reapply/tasks.md` — T8 a T14 marcadas `[x]`.
- `progress/current.md` — una línea con el estado del lote.

### Decisiones tomadas

- **`categorizationEligibleWhere('pendingAndClosing')`** es
  `{ type: { in: ['expense','income'] }, OR: [{ categoryId: null, status: 'pending_review' }, { categorySource: 'closing' }] }`,
  tal cual `design.md` §4; `'pending'` devuelve el `where` de siempre, idéntico (lo
  comprueba un `toEqual` en el test de R12).
- **Tests de más, además de los nombrados en T10/T11:** en el servicio,
  «never writes on a manual or rule movement, in either scope (R9)», «leaves a
  closing movement that rules of two categories match where it was (R10)» y un
  `describe` de `matchingRules`. Vigilan R9 y R10 en la función, no solo por HTTP.
- **El test de R12 en la importación** siembra un movimiento `closing` de una
  importación anterior (cuenta propia, con el mismo `bank` del test para que su
  `afterEach` lo borre) que casa con la regla, y comprueba que sigue idéntico,
  `updatedAt` incluido. Si la importación usara el alcance ancho, el test se pondría
  rojo.
- **Ejemplo JSON de la respuesta 201** con datos inventados (`sintetico gimnasio`,
  `34.95`); `categorization` sin `error`. La forma de `categorization` se comprueba
  en el test de T14 contra la misma lista de campos que ya usa el test de la F56.
- **Vocabulario:** en el contrato uso «cierre automático» y «pasada de
  categorización», que ya estaban escritos en `docs/api-contract.md` (desde el
  2026-10-16 y la F43); no he usado «paso de cierre». En el ADR-038 nombro la función
  (`confirmAllMovements`) en vez de darle un nombre corto.

### Trazabilidad (solo SDD, lo del Lote B)

- R6 → `marks the category it writes as set by a rule` (los dos alcances) y
  `writes ONLY categoryId and categorySource: full row and period totals identical otherwise (R14)`
  (renombrado desde «writes ONLY categoryId…»; ahora excluye `categorySource` y
  comprueba que vale `rule`) — `category-rules.service.test.ts`; y el test de
  importación de R12 (el movimiento que reconoce la regla queda `rule`).
- R7 → `moves the movements the closing step left in the generic category when a rule is created`
  (201 con `categorization.categorizedMovements`; un `closing` que no casa y uno de
  ingreso con el mismo texto no se mueven) y
  `does not recategorize anything when the rule is rejected` (409, 404 y 400: el
  `closing` queda idéntico) — `category-rules.routes.test.ts`.
- R8 → `moves the movements the closing step left in the generic category when a rule is changed`
  (cambiando la categoría y después el texto) — `category-rules.routes.test.ts`.
- R9 → `never changes a movement whose category was set by hand, on creating or changing a rule`
  (incluye uno `manual` en la propia genérica) y
  `never changes a movement a rule already categorized, on creating or changing a rule`
  — `category-rules.routes.test.ts`; `never writes on a manual or rule movement, in either scope (R9)`
  — `category-rules.service.test.ts`.
- R10 → `leaves a generic movement that rules of two categories match where it was and lists the conflict`
  — `category-rules.routes.test.ts`; `leaves a closing movement that rules of two categories match where it was (R10)`
  — `category-rules.service.test.ts`.
- R11 → `deleting a rule changes neither the category nor its source on any movement`
  — `category-rules.routes.test.ts`.
- R12 → `keeps the default run to uncategorized pending movements and leaves closing ones alone`
  — `category-rules.service.test.ts`; `an import still applies the rules to its new movements and closes the rest, marked as closing`
  — `import.service.test.ts`.
- R13 → `recategorizing a closing movement changes only its category and its source, and no total`
  — `category-rules.service.test.ts`.
- R15 → `api-contract: says what a rule recategorizes and what not, and describes categorySource`
  — `category-rules.docs.test.ts`.

Los tests de F43/F56 que ya existían pasan sin cambiar lo que comprueban, salvo el de
R14 de la F43, que T11 pide ampliar.

### Documentos actualizados

`git grep -n -i "por sí solas\|al crearse\|applyCategoryRules\|/api/category-rules\b\|solo toca movimientos sin categoría\|sin categoría, sin confirmar\|des-categoriza"`
fuera de `progress/` y `specs/`, más las líneas que el Lote A dejó señaladas.

Corregido en `docs/api-contract.md`:
- `### Movement`: fila `categoryId` (quién la escribe: los dos `PATCH`, las reglas y
  `confirm-all`) y fila nueva `categorySource` con sus tres valores, quién escribe
  cada uno y qué hizo la migración de datos.
- `### POST /api/category-rules`: el párrafo «Las reglas no categorizan nada por sí
  solas al crearse», que ya no era verdad, pasa a decir qué recoloca la regla y qué
  no; respuesta 201 con `categorization` y su ejemplo; qué pasa si la pasada falla o
  si la regla se rechaza.
- `### GET /api/category-rules`: su forma es la del `POST` **sin** `categorization`.
- `### PATCH /api/category-rules/:id`: ejecuta la misma pasada; respuesta 200 con
  `categorization`.
- `### DELETE /api/category-rules/:id`: no cambia la categoría ni `categorySource`.
- `### POST /api/category-rules/apply`: su alcance no cambia; escribe también
  `categorySource: "rule"`.
- `### GET /api/movements`: `categorySource` en el ejemplo JSON y en la frase de
  campos añadidos (antes `api-contract.md:849-853`).
- `### PATCH /api/movements` y `### PATCH /api/movements/:id`: un `categoryId`
  numérico deja `manual`; `null` deja `null`.
- `### POST /api/movements/confirm-all`: lo que escribe lleva `closing`.
- `### POST /api/import`: la fila `categorized` de `categorization` y el bullet de
  `closing` (lo que escribe queda `closing`; la importación no recoloca los
  `closing` anteriores).

Corregido en `README.md`: filas `POST` y `PATCH /api/category-rules`.
Añadido en `docs/architecture.md`: ADR-038, delante de «Qué NO hacer». No revisa
ningún ADR anterior: la F43 no tenía ADR propio (buscar «categorización» en el
archivo solo da la línea 738, dentro del ADR-011, histórica, que no se toca).

Líneas que el `grep` encuentra y **no** he cambiado, porque siguen siendo verdad:
`README.md:78` (`/apply` sigue igual), `docs/data-model.md:242` y
`prisma/schema.prisma:124` (comentarios que dicen que la pasada escribe
`categoryId`: lo sigue escribiendo, ahora junto a `categorySource`; los dos archivos
son del Lote A y ya nombran `categorySource` en otros puntos).

### Prueba real

No aplica: la feature no lee datos de fuera del código. La prueba con los datos del
humano la hace él (`decisions.md` 📌), después de aplicar la migración.

### Último ./init.sh

Exit 0.

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──       [OK] OK: pnpm run lint
                              All matched files use Prettier code style!
                              [OK] OK: pnpm run format:check
── 6. Ejecutando tests ──      Test Files  86 passed (86)
                              Tests  1467 passed (1467)
                              [OK] Todos los tests pasan
── 7. Resumen ──               [OK] Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 60

Exit 0. `Checks: 11 de 11 en verde.`

| # | Check | Resultado |
|---|---|---|
| 1 | `category-rules.routes.test.ts` «moves the movements the closing step left in the generic category when a rule is created» | OK — `Tests 1 passed \| 21 skipped (22)` |
| 2 | ídem «… when a rule is changed» | OK — `Tests 1 passed \| 21 skipped (22)` |
| 3 | «never changes a movement whose category was set by hand, on creating or changing a rule» | OK — `Tests 1 passed \| 21 skipped (22)` |
| 4 | `movements.test.ts` «marks the category as set by hand when PATCH /api/movements/:id writes it» | OK — `Tests 1 passed \| 97 skipped (98)` |
| 5 | `category-rules.service.test.ts` «marks the category it writes as set by a rule» | OK — `Tests 1 passed \| 23 skipped (24)` |
| 6 | `movements.confirm-all.test.ts` «marks the category it fills as written by the closing step» | OK — `Tests 1 passed \| 3 skipped (4)` |
| 7 | `movements.category-source-migration.test.ts` «gives closing to the generic categories and manual to every other categorized movement» | OK — `Tests 1 passed (1)` |
| 8 | `import.service.test.ts` «an import still applies the rules to its new movements and closes the rest, marked as closing» | OK — `Tests 1 passed \| 84 skipped (85)` |
| 9 | `category-rules.service.test.ts` «recategorizing a closing movement changes only its category and its source, and no total» | OK — `Tests 1 passed \| 23 skipped (24)` |
| 10 | `pnpm test` | OK — exit 0 |
| 11 | `category-rules.docs.test.ts` «api-contract: says what a rule recategorizes and what not, and describes categorySource» | OK — `Tests 1 passed \| 1 skipped (2)` |

### Sugerencias fuera de scope (NO aplicadas)

- Los comentarios de `prisma/schema.prisma:124` (modelo `CategoryRule`) y
  `docs/data-model.md:242` dicen que la pasada «escribe `categoryId`»; no son falsos,
  pero podrían añadir que escribe también `categorySource` `rule` y que al crear o
  cambiar una regla mira también los `closing`. Son archivos del Lote A.
