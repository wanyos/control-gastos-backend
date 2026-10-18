# Resumen — feature 60 `category-origin-and-rule-reapply`

Fecha de cierre: 2026-10-18
Intención original: `feature_list.json` → feature `category-origin-and-rule-reapply`, bloque `intent`
Spec (SDD): `specs/60-category-origin-and-rule-reapply/`

## Qué hace ahora la app que antes no

Cada movimiento guarda quién le puso la categoría, en el campo `categorySource`:
`manual` (tú, con cualquiera de los dos `PATCH` de movimientos), `rule` (una regla
de categorización) o `closing` (la función `confirmAllMovements`, que al final de
cada importación y en `POST /api/movements/confirm-all` pone `Otros gastos` /
`Otros ingresos` a lo que ninguna regla reconoció). Al **crear o cambiar** una
regla, el servidor aplica en ese momento todas las reglas también a lo que está en
`closing`, y la respuesta trae la lista de movimientos que ha cambiado. Antes una
regla nueva solo servía para lo que importaras después.

## Lo que tienes que hacer tú

1. **Copia de tu base:** `pnpm run db:backup`.
2. **Aplicar las dos migraciones** (`20261018120000_movement_category_source` y
   `20261018120100_movement_category_source_backfill`). La hoja dice
   `pnpm run prisma:migrate` (`prisma migrate dev`); para tu base,
   `pnpm exec prisma migrate deploy` es la variante que solo aplica lo pendiente y
   nunca propone vaciarla, la que ya se usó en `deposit-totals-interest-only` y `unparsed-row-review`. Nadie las ha aplicado: he
   comprobado con una consulta de solo lectura que tu base `gastos` no tiene ni las
   migraciones ni la columna.
3. **Reinicia `pnpm run dev`** después de migrar. Ahora mismo lo tienes arrancado y
   el cliente de Prisma ya conoce la columna nueva; no he comprobado qué hace contra
   una base que todavía no la tiene, pero lo seguro es no usar la app hasta migrar.
4. **La prueba con tus datos:** crea una regla para algo que tengas en
   `Otros gastos` y mira la lista `categorization.categorizedMovements` de la
   respuesta.
5. **Frontend** (otra sesión): enseñar `categorySource` y la lista de movimientos
   que mueve una regla al crearla o cambiarla, y comprobar si su pantalla de
   revisión manda la categoría al guardar aunque no la toques (si la manda, ese
   movimiento queda `manual` y ninguna regla lo vuelve a tocar; hoja 🔴 6).

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/category-rules` — crea la regla y aplica las reglas a lo pendiente sin categoría y a lo `closing` | [category-rules.routes.ts:50](../../src/modules/category-rules/category-rules.routes.ts#L50) |
| `PATCH /api/category-rules/:id` — cambia la regla y hace lo mismo | [category-rules.routes.ts:76](../../src/modules/category-rules/category-rules.routes.ts#L76) |
| Qué movimientos puede reescribir una regla, según desde dónde se llame | [category-rules.service.ts:165](../../src/modules/category-rules/category-rules.service.ts#L165) |
| La función que aplica las reglas y escribe `categorySource: 'rule'` | [category-rules.service.ts:209](../../src/modules/category-rules/category-rules.service.ts#L209) |
| `PATCH /api/movements/:id` — una categoría puesta a mano queda `manual` | [movements.service.ts:365](../../src/modules/movements/movements.service.ts#L365) |
| `confirmAllMovements` — lo que rellena queda `closing` | [movements.service.ts:502](../../src/modules/movements/movements.service.ts#L502) |

## Dónde está el código

### Base de datos

| Qué hace | Dónde |
| --- | --- |
| Enum de los tres valores y columna nueva del movimiento | [schema.prisma](../../prisma/schema.prisma) → `enum CategorySource`, `Movement.categorySource` |
| Migración que crea el enum y la columna | [migration.sql](../../prisma/migrations/20261018120000_movement_category_source/migration.sql) |
| Migración de solo datos: raíz `Otros gastos` / `Otros ingresos` → `closing`, resto con categoría → `manual`; no toca `updatedAt` | [migration.sql](../../prisma/migrations/20261018120100_movement_category_source_backfill/migration.sql) |

### Movimientos (quién escribe la categoría)

| Qué hace | Dónde |
| --- | --- |
| `PATCH` de un movimiento: `manual` con un `categoryId`, `null` al quitarla | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `updateMovement` |
| `PATCH` en bloque: lo mismo, en la misma transacción | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `bulkUpdateMovements` |
| Rellenar con las dos genéricas: `closing` | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `confirmAllMovements` |
| `categorySource` en cada movimiento de la API | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `serializeMovement` |
| Tipos: campo en la respuesta y lo que pueden escribir los dos `PATCH` | [movements.types.ts](../../src/modules/movements/movements.types.ts) → `SerializedMovement`, `MovementWritableFields` |

### Reglas de categorización

| Qué hace | Dónde |
| --- | --- |
| Los dos conjuntos de movimientos que puede reescribir una regla: `pending` (importación y `POST /apply`, como antes) y `pendingAndClosing` (crear o cambiar una regla) | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `CategorizationScope`, `categorizationEligibleWhere` |
| Qué reglas casan con una descripción (sacada de la función sin cambiarla; la reutilizará la feature 61) | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `matchingRules` |
| Aplicar las reglas, con el conjunto como parámetro | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `applyCategoryRules` |
| Rutas `POST` y `PATCH` que aplican las reglas tras guardar | [category-rules.routes.ts](../../src/modules/category-rules/category-rules.routes.ts) → `categoryRulesRoutes` |
| Forma de la respuesta: la regla más `categorization` | [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts) → `SerializedCategoryRuleWithCategorization` |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Campo `categorySource`, qué mueve una regla al crearla o cambiarla y qué no | [api-contract.md](../../docs/api-contract.md) → `### Movement`, `### POST /api/category-rules`, `PATCH`, `DELETE`, `/apply`, los dos `PATCH /api/movements`, `confirm-all`, `POST /api/import` |
| Decisión técnica con alternativas | [architecture.md](../../docs/architecture.md) → `ADR-038` |
| Modelo de datos (bloque Prisma, diagrama, «Columnas reservadas», claves) | [data-model.md](../../docs/data-model.md) → `CategorySource`, fila `categoryId` |
| Tabla de endpoints | [README.md](../../README.md) → filas `POST` y `PATCH /api/category-rules` |
| Término aprobado | [vocabulary.md](../../docs/vocabulary.md) → `categorySource` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Crear una regla mueve lo `closing` que casa y lo lista; un ingreso con el mismo texto no | [category-rules.routes.test.ts](../../src/modules/category-rules/category-rules.routes.test.ts) → `moves the movements the closing step left in the generic category when a rule is created` |
| Cambiar categoría y texto de una regla hace lo mismo | ídem → `… when a rule is changed` |
| Un `manual` (también en `Otros gastos`) no cambia nunca, fila entera igual | ídem → `never changes a movement whose category was set by hand, on creating or changing a rule` |
| Un `rule` tampoco cambia | ídem → `never changes a movement a rule already categorized, on creating or changing a rule` |
| Choque de dos categorías: no se mueve y sale en `conflicts` | ídem → `leaves a generic movement that rules of two categories match where it was and lists the conflict` |
| Borrar una regla no toca ningún movimiento | ídem → `deleting a rule changes neither the category nor its source on any movement` |
| Regla rechazada (409, 404, 400): no se mueve nada | ídem → `does not recategorize anything when the rule is rejected` |
| La función escribe `rule` en los dos conjuntos | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → `marks the category it writes as set by a rule` |
| Importación y `/apply` siguen sin tocar lo `closing` | ídem → `keeps the default run to uncategorized pending movements and leaves closing ones alone` |
| `manual` y `rule` fuera de los dos conjuntos | ídem → `never writes on a manual or rule movement, in either scope (R9)` |
| Solo cambian categoría y origen; `totals` idénticos | ídem → `recategorizing a closing movement changes only its category and its source, and no total`, `writes ONLY categoryId and categorySource: …` |
| Comparación de descripciones con reglas | ídem → `describe('matchingRules …')` |
| `PATCH` de un movimiento: `manual`, `null`, y sin cambio si solo cambia el estado | [movements.test.ts](../../src/modules/movements/movements.test.ts) → `marks the category as set by hand when PATCH /api/movements/:id writes it`, `clears the category source …`, `keeps the category source …`, `CategorySource holds manual \| rule \| closing` |
| `PATCH` en bloque | [movements.bulk.test.ts](../../src/modules/movements/movements.bulk.test.ts) → `marks the category of every listed movement as set by hand`, `clears the category source of every listed movement …` |
| `confirm-all` escribe `closing` y respeta lo que ya tenía categoría | [movements.confirm-all.test.ts](../../src/modules/movements/movements.confirm-all.test.ts) → `marks the category it fills as written by the closing step` |
| La migración de datos sobre filas inventadas, dos veces | [movements.category-source-migration.test.ts](../../src/modules/movements/movements.category-source-migration.test.ts) → `gives closing to the generic categories and manual to every other categorized movement` |
| La importación no mueve lo `closing` anterior | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `an import still applies the rules to its new movements and closes the rest, marked as closing` |
| El contrato lo dice | [category-rules.docs.test.ts](../../src/modules/category-rules/category-rules.docs.test.ts) → `api-contract: says what a rule recategorizes and what not, and describes categorySource` |

## Cumplimiento de la intención

Resultados reales de `./init.sh --checks 60` el 2026-10-18: 11 de 11 en verde.

- ✅ «Si creo una regla, los movimientos que ya estaban en Otros gastos (u Otros
  ingresos) y la cumplen pasan a la categoría de la regla.» → se cumple; lo
  verifican los tests de crear y cambiar regla. Checks 1 y 2: ✅.
- ✅ «Un movimiento al que le puse yo la categoría a mano no cambia nunca por una
  regla, ni nueva ni cambiada.» → se cumple; `never changes a movement whose
  category was set by hand…` y, en la función, `never writes on a manual or rule
  movement, in either scope`. Check 3: ✅.
- ✅ «Cada movimiento dice de dónde salió su categoría: a mano, por una regla o por
  el cierre.» → se cumple; un test por cada valor y el de la migración. Checks 4,
  5, 6 y 7: ✅.
- ✅ «Lo que ya funciona sigue igual: la importación aplica las reglas y cierra lo
  que queda; las sumas no cambian por recolocar categorías.» → se cumple; test de
  importación, test de `totals` antes y después, y la suite entera (1467 tests).
  Checks 8, 9 y 10: ✅.
- ✅ «docs/api-contract.md dice qué recoloca una regla y qué no, y cómo se ve de
  dónde salió la categoría.» → se cumple. Check 11: ✅.

## Decisiones que se tomaron por ti

- (delegado, hoja 🔴 2) Lo que ya tenía categoría: raíz `Otros gastos` /
  `Otros ingresos` → `closing`; el resto → `manual`. Si alguna vez pusiste a mano
  algo en `Otros gastos`, quedará `closing` y una regla podrá moverlo.
- (delegado, 🔴 3) Mover lo `closing` es automático al crear o cambiar una regla, y
  se aplican **todas** las reglas. Importar y `POST /api/category-rules/apply` siguen
  mirando solo lo pendiente sin categoría.
- (delegado, 🔴 4) Cambiar o borrar una regla no deshace lo que ya categorizó.
- (delegado, 🔴 5) Un movimiento `closing` que casa con reglas de dos categorías no
  se mueve y sale en `categorization.conflicts`.
- (añadido, 🔴 6) Cualquier categoría puesta a mano queda `manual`, también si es la
  misma que tenía o `Otros gastos`. Quitar la categoría deja `categorySource` a `null`.
- (técnica) Una regla que apunta a la propia `Otros gastos` deja ese movimiento en
  la misma categoría pero lo pasa a `rule`.
- (técnica) Si aplicar las reglas falla a mitad, la regla queda creada y el error va
  en `categorization.error`.

## Qué NO se tocó / quedó fuera

- La importación y `POST /api/category-rules/apply` no cambian lo que miran.
- Ningún importe, saldo, estado ni fecha: solo `categoryId`, `categorySource` y
  `updatedAt` del movimiento que se mueve.
- No hay consulta de vista previa ni sugerencias de reglas: es la feature 61, que
  reutilizará `categorizationEligibleWhere` y `matchingRules`.
- No se guarda qué regla categorizó cada movimiento.

## Notas para el futuro

- El campo `unmatched` de la respuesta de `POST` / `PATCH /api/category-rules`
  cuenta también los `closing` que no casan con ninguna regla, así que no es el
  mismo número que el de `POST /api/category-rules/apply` (dicho en el contrato).
- El implementer apunta que el diagrama ER de `docs/data-model.md` ya no traía,
  desde antes de esta feature, varias columnas de `Movement` (`note`,
  `descriptionSearch`, `excludedFromTotals`, `productId`, `createdAt`,
  `updatedAt`). No es de esta feature.
