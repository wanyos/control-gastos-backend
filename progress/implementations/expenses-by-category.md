# expenses-by-category — implementación

## Lote A — implementación

Implementer, 2026-10-21. Tasks T1–T4 (marca de categoría fija). No se ha escrito
nada en la base de datos del humano: la migración solo llegó a las bases de tests
(la suite vuelve a migrar sola su plantilla), y `./init.sh` confirma al final que
la base del humano quedó igual (exit 0).

### Archivos modificados / creados

- `prisma/schema.prisma`: `Category.isFixed Boolean @default(false)` con comentario `///`.
- `prisma/migrations/20261021120000_category_is_fixed/migration.sql` (nuevo):
  `ALTER TABLE "Category" ADD COLUMN "isFixed" BOOLEAN NOT NULL DEFAULT false;`.
  Comprobado sin base contra lo que genera Prisma:
  `prisma migrate diff --from-schema <schema de HEAD> --to-schema prisma/schema.prisma --script`
  da exactamente esa sentencia.
- `src/modules/categories/categories.schema.ts`: `renameCategorySchema` →
  `updateCategorySchema` (`name` y/o `isFixed`, `minProperties: 1`);
  `renameCategoryBodyProperties` → `updateCategoryBodyProperties` (`['name', 'isFixed']`).
- `src/modules/categories/categories.types.ts`: `RenameCategoryBody` →
  `UpdateCategoryBody` (`name?`, `isFixed?`); `SerializedCategory.isFixed`.
- `src/modules/categories/categories.service.ts`: `renameCategory` → `updateCategory`
  (escribe solo lo que llega; el `409` de nombre repetido sigue igual);
  `serializeCategory` saca `isFixed`.
- `src/modules/categories/categories.routes.ts`: usa lo anterior y comprueba en
  `preValidation`, sobre el cuerpo sin tocar, que `isFixed` sea literalmente
  `true` o `false`.
- `src/modules/categories/categories.test.ts`: test nuevo y dos ajustados (ver Trazabilidad).
- `docs/data-model.md`: ver «Documentos actualizados».

`categories.seed.test.ts` y `category-rules.routes.test.ts` no se han tocado: pasan
sin cambios con el campo nuevo (los dos entraron en la pasada de abajo, 53 tests en verde).

### Decisiones tomadas

- **`isFixed` se comprueba sobre el cuerpo sin tocar, antes del schema.** El AJV de
  Fastify convierte tipos por defecto: `"true"`, `1` o `null` llegarían como
  booleanos y podrían desmarcar una categoría sin que nadie lo pidiera. Es la misma
  comprobación que ya hace `movements.routes.ts` con `excludedFromTotals` (F49),
  copiada en una función pequeña dentro de `categories.routes.ts`, porque la de
  movimientos es privada de su archivo y `src/lib/strict-body.ts` no está en el lote.
- **Cuerpo vacío**: lo rechazan el schema (`minProperties: 1`) y, además, el servicio
  (`'name or isFixed is required'`), por si se le llama sin pasar por la ruta.
- Nombre de la migración: `20261021120000_category_is_fixed` (fecha de hoy y la
  misma hora `120000` que usan las anteriores).

### Trazabilidad (solo SDD)

- R7 → `marks and unmarks a category as fixed` (`categories.test.ts`): nace `false`
  en `POST` (raíz y subcategoría), `PATCH { isFixed: true }` → 200 con la marca,
  `GET /api/categories` la trae, la subcategoría sigue en `false` (no se hereda,
  R12), `name` + `isFixed: false` juntos, renombrar solo no toca la marca, y se
  comprueba lo guardado en la base de tests.
- R7 → `PATCH /api/categories/:id rejects kind, extra properties and an empty body (R12)`
  (ajustado): `isFixed: 'true'`, `null` y `1` → 400 `VALIDATION_ERROR` sin cambiar
  la marca; `{ isFixed: true }` solo → 200.
- R7 → `keeps POST 201 and GET 200 responding exactly as before (R1, R2)` (ajustado):
  la categoría creada trae `isFixed: false`.
- R12 (parte de categorías: la marca no se hereda) → `marks and unmarks a category as fixed`.
- El resto de R1–R15 son de los lotes B y C.

### Documentos actualizados

`docs/data-model.md` (lección #2), comprobado contra `prisma/schema.prisma`:

- Diagrama ER: `boolean isFixed` en `CATEGORY`.
- Bloque Prisma: línea `isFixed Boolean @default(false)` con su comentario.
- «Columnas reservadas»: fila `Category.isFixed`, nace con su escritor (`PATCH /api/categories/:id`),
  y la migración que la trae.
- «Reglas de negocio», párrafo de categorías: frase sobre la marca.
- Claves naturales (índice 2, unicidad de categoría raíz): `isFixed` no entra en
  la clave; la F63 no cambia ninguna clave ni índice.

Búsqueda lanzada (fuera de `progress/` y `specs/`):

```
git grep -n -i "PATCH /api/categories\|renameCategory\|rename only\|isFixed\|parentId: number | null"
git grep -n -i "renombr\|solo cambia el .name\|/api/categories"
```

`renameCategory` / `RenameCategoryBody` ya no aparecen en ningún sitio. Líneas que el
cambio vuelve falsas y están **fuera de los archivos del Lote A**; las corrige el
Lote C, que las tiene en sus tasks:

- `README.md:72`: «Renombra una categoría: **solo el `name`**…» → T9.
- `docs/api-contract.md:544-567` (`PATCH /api/categories/:id`: «**Solo cambia el `name`**»)
  y la forma de `Category` en `GET`/`POST /api/categories` (483-540), sin `isFixed` → T8.

Las formas de categoría que llevan dentro `category-rules.types.ts:38`,
`movements.types.ts:270` y `recurring-expenses.types.ts:62` son las de esos
endpoints, no `SerializedCategory`, y no cambian.

### Prueba real

No aplica: el Lote A no lee datos de fuera del código.

### Último ./init.sh

Antes de lanzarlo, ningún proceso de `vitest` en marcha (consulta de procesos
`node.exe` con `vitest` en la línea de comandos: 0).

```
── 5. Lint y formato ──
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ──
 Test Files  91 passed (91)
      Tests  1500 passed (1500)
[OK]    Todos los tests pasan
── 7. Resumen ──
[OK]    Entorno listo. Puedes empezar a trabajar.
exit=0
```

### Último ./init.sh --checks 63

Salida `exit=1`, **2 de 12 en verde**:

- [7] `categories.test.ts -t "marks and unmarks a category as fixed"` → **OK**.
- [12] `pnpm test` → **OK**.
- [1] «a month lists each category…», [2] «compares a month with the same month…»,
  [3] «a closed year…», [4] «the year in progress…», [5] «marks a category as new
  or gone…», [6] «splits the lines into fixed and variable…», [8] «each line carries
  the counted movements…», [9] «the month and the year add up…», [11] «writes nothing
  in the database» → FAIL, `No test files found`: `expenses-by-category.test.ts` es
  del **Lote B**.
- [10] «the contract describes GET /api/expenses-by-category…» → FAIL,
  `No test files found`: `expenses-by-category.docs.test.ts` es del **Lote C**.

### Sugerencias fuera de scope (NO aplicadas)

- La comprobación «un booleano tiene que llegar como booleano» ya está escrita dos
  veces (`movements.routes.ts` y ahora `categories.routes.ts`). Podría vivir una sola
  vez en `src/lib/strict-body.ts`. Coste: mover una función de 8 líneas y cambiar
  dos llamadas.

## Lote B — implementación

Implementer, 2026-10-21. Tasks T5–T7 (la consulta `GET /api/expenses-by-category`).
No se ha escrito nada en la base de datos del humano: todos los tests van contra la
base desechable del worker, y la pasada de `./init.sh` terminó en verde, con la
comprobación de antes y después de su base incluida.

### Archivos modificados / creados

- `src/modules/expenses-by-category/expenses-by-category.types.ts` (nuevo): query,
  periodos, línea, grupo y respuesta (`design.md` §5).
- `src/modules/expenses-by-category/expenses-by-category.schema.ts` (nuevo):
  querystring (`month` con el patrón de `getOverviewSchema`, `year` `^\d{4}$`,
  `compare` con sus dos valores) y el schema de respuesta con todas las claves.
- `src/modules/expenses-by-category/expenses-by-category.service.ts` (nuevo):
  `expensesByCategoryDb`, `resolvePeriods` (§3) y `getExpensesByCategory` (§4).
- `src/modules/expenses-by-category/expenses-by-category.routes.ts` (nuevo): la ruta,
  que pasa `todayInMadrid()`; sin ninguna referencia a la capa de datos.
- `src/modules/expenses-by-category/expenses-by-category.test.ts` (nuevo): los 13 tests de T7.
- `src/app.ts`: registro con prefijo `/api/expenses-by-category` y `depositMaturityMatchers`.
- `src/architecture.test.ts`: la ruta nueva entra en la lista de rutas que no pueden
  nombrar `prisma`.
- `src/modules/movements/movements.service.ts`: solo el comentario de `isCountedExpense`
  (nombra a la consulta nueva entre quien la usa).

### Decisiones tomadas

- **La regla no se copia.** Se lee `type: 'expense'` en el rango que cubre los dos
  periodos y cada fila pasa por `isCountedExpense(row, deposits, ownership)`, con
  `readDepositMovements` (historia entera) y `readOwnership`, las mismas lecturas que
  `getOverview`. Ninguna condición de la regla está escrita en el módulo.
- **Orden de los movimientos (R8):** el `findMany` pide el mismo `orderBy` que
  `GET /api/movements` (`bookingDate` desc, `daySequence` desc con nulos detrás, `id`
  desc) y las líneas conservan ese orden. Ese `orderBy` (`movementListOrder`) es
  privado de `movements.service.ts` y el lote solo permite tocar su comentario, así que
  las tres claves están escritas otra vez en la consulta nueva. El test R8 compara el
  orden con el de `GET /api/movements`.
- **`addMonths`** se copia (4 líneas) en el servicio nuevo, como permite `design.md` §3;
  no se importa del módulo de recurrentes.
- **Exclusión mutua y `compare` con `year`** se comprueban en `resolvePeriods` y salen
  como `ValidationError` (400 `VALIDATION_ERROR`); el formato de cada parámetro, en el
  schema (también 400 `VALIDATION_ERROR`, por el manejador central). Un parámetro
  desconocido se ignora, como en `GET /api/overview`.
- **Orden de las líneas (R1):** `amount` desc, `comparedAmount` desc y nombre de
  categoría (`localeCompare`); la línea sin categoría, detrás en caso de empate total.
- **`monthlyAmount`** solo con `year` (`amount / months`, `toFixed(2)`); con `month`,
  `null`.

### Trazabilidad (solo SDD)

Todos en `src/modules/expenses-by-category/expenses-by-category.test.ts`:

- R1 → `a month lists each category with its amount, the previous month and the difference`
  (orden con empates en `amount` y en los dos importes; `compare=previous-month` da lo mismo que sin `compare`).
- R2 → `compares a month with the same month of the previous year`.
- R3 → `a closed year compares with the whole previous year and divides by twelve`.
- R4 → `the year in progress compares with the same months of the previous year`
  (`today` = `2025-04-17` inyectado; además febrero bisiesto y un año posterior a hoy con `resolvePeriods`).
- R5 → `marks a category as new or gone against the compared period`.
- R6 → `splits the lines into fixed and variable by the category mark` (la marca se pone con `PATCH /api/categories/:id`).
- R8 → `each line carries the counted movements of the period` (un excluido de la misma
  categoría no sale; lo del mes comparado tampoco; orden igual que `GET /api/movements`).
- R9 → `the month and the year add up to the expense of GET /api/overview`: traspaso
  emparejado, `excludedFromTotals`, apertura y vencimiento de depósito, aportación a
  producto, movimiento reconocido como propio, uno dudoso, un ingreso y un `neutral`;
  el mes es igual a `period.totals.expense` de `GET /api/overview?month=2025-09` (y el
  mes comparado al de agosto), el año a la suma de los 12 meses de 2025.
- R10 → `puts counted expenses without category in their own line`.
- R11 → `leaves out a category whose movements count nothing`.
- R12 → `a subcategory is its own line`.
- R13 → `rejects a malformed period with 400 and writes nothing` (los seis casos).
- R14 → `writes nothing in the database` (recuento y `updatedAt` máximo de movimientos,
  cuentas y reglas, y todas las filas de categorías, antes y después; y el servicio no
  contiene ninguna llamada de escritura).
- R7 y R15 no son de este lote (A y C).

### Documentos actualizados

Ninguno: los documentos de esta feature son del Lote C. Búsqueda lanzada (fuera de
`progress/` y `specs/`):

```
git grep -n -i "expenses-by-category\|isCountedExpense"
```

- `docs/architecture.md:3137` (ADR-037) y `:3369` (ADR-040) cuentan quién usaba
  `isCountedExpense` cuando se decidieron; son el registro de esas decisiones y siguen
  siendo ciertos. La consulta nueva entra en el ADR-041 (Lote C, T9).
- `docs/api-contract.md` y `README.md` todavía no tienen `GET /api/expenses-by-category`:
  los escribe el Lote C (T8, T9).

### Prueba real

No aplica: la consulta no lee datos de fuera del código (solo la base).

### Último ./init.sh

Antes de lanzarlo, ningún proceso de `vitest` en marcha (consulta de procesos
`node.exe` con `vitest` en la línea de comandos: 0). Las dos primeras pasadas salieron
en rojo por `src/no-real-data.test.ts`: cuatro importes inventados del test nuevo
coincidían con importes de la base del humano (líneas 283, 309, 561 y 612). Se
cambiaron por otros inventados, ajustando las sumas que dependían de ellos.

```
── 5. Lint y formato ──
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ──
 Test Files  92 passed (92)
      Tests  1513 passed (1513)
[OK]    Todos los tests pasan
── 7. Resumen ──
[OK]    Entorno listo. Puedes empezar a trabajar.
exit=0
```

### Último ./init.sh --checks 63

Salida `exit=1`, **11 de 12 en verde**:

- [1] a [9], [11] y [12] → **OK** (exit 0).
- [10] «the contract describes GET /api/expenses-by-category and what happens to
  GET /api/recurring-expenses» → FAIL, `No test files found`:
  `expenses-by-category.docs.test.ts` es del **Lote C** (T10) y aún no existe.

### Sugerencias fuera de scope (NO aplicadas)

- Exportar `movementListOrder` de `movements.service.ts` y usarlo en la consulta nueva,
  para que el orden de los movimientos no esté escrito dos veces. Coste: una palabra
  (`export`) y cambiar tres líneas por una.

## Lote C — implementación

Implementer, 2026-10-21. Tasks T8–T10 (documentos y el test del contrato). No se
ha escrito nada en la base de datos del humano: este lote solo toca documentos y
un test que lee `docs/api-contract.md`; la pasada de `./init.sh` terminó en verde,
con la comprobación de antes y después de su base incluida.

### Archivos modificados / creados

- `docs/api-contract.md` (T8):
  - §`Category`: fila `isFixed` (nace `false`, solo la cambia el `PATCH`, no se
    hereda, solo la lee la consulta nueva).
  - §`GET /api/categories`: `isFixed` en el ejemplo, en la raíz y en la hija, en el
    orden de `serializeCategory`.
  - §`POST /api/categories`: `isFixed` no está en el body; la creada trae `isFixed: false`.
  - §`PATCH /api/categories/:id`: deja de decir «Solo cambia el `name`»; tabla con
    `name` e `isFixed` (al menos uno), que `"true"`, `1` o `null` dan 400 (lo que
    hace `assertStrictIsFixed` y comprueba el test ajustado del Lote A), y la fila
    de errores al día.
  - §Movimientos entre tus cuentas en las sumas: una frase que dice que la
    consulta nueva sale de la misma regla.
  - §`GET /api/expenses-by-category` (nueva, entre `GET /api/overview` y
    `GET /api/recurring-expenses`): parámetros, periodos (mes, año cerrado, año en
    curso, año posterior a hoy), qué gasto entra, reglas de línea (R10, R11, R12),
    ejemplo de un mes con importes y conceptos inventados, tabla de campos de la
    línea, orden, forma con `year` (con un `monthlyAmount` de ejemplo), respuesta
    vacía, errores y solo lectura.
  - §`GET /api/recurring-expenses`: nota al principio, «Se retirará (decidido en la
    feature 63)»: la sustituye la consulta nueva, **sigue respondiendo igual** y se
    retirará en una feature posterior del backend **cuando el frontend use la
    consulta nueva**; entonces pasará a «Rutas retiradas».
- `README.md` (T9): fila del `PATCH` de categorías (`name` y `isFixed`), fila nueva
  de `GET /api/expenses-by-category`, la de `GET /api/recurring-expenses` dice que se
  retirará, y el módulo en el árbol de carpetas.
- `docs/architecture.md` (T9): ADR-041 nuevo al final de los ADR. Ningún ADR anterior
  se ha tocado.
- `docs/roadmap.md` (T9): cabo suelto 29, «Retirar `GET /api/recurring-expenses`»,
  **sin abrir, hasta que el frontend use la consulta nueva**, con lo que habrá que
  quitar ese día. El 28 se queda como está.
- `docs/vocabulary.md` (T9): **sin cambios míos.** La fila de los nombres aprobados
  (`isFixed`, la ruta, `month` / `year`, `compare` y sus dos valores, `change` con
  `new` / `gone`, grupos `fixed` / `variable`) ya estaba en el árbol de trabajo al
  empezar este lote, con «Propuesto en `specs/63-expenses-by-category/decisions.md`
  punto 6» y fecha 2026-10-21; la he comprobado contra la hoja y coincide.
- `src/modules/expenses-by-category/expenses-by-category.docs.test.ts` (nuevo, T10).
- `specs/63-expenses-by-category/tasks.md`: T8, T9 y T10 marcadas.

### Decisiones tomadas

- **El `POST /api/categories` con `isFixed`:** el contrato dice que `isFixed` no
  está entre los campos del body y que la categoría nace con `false`. No dice si
  responde 400 o si lo descarta, porque no lo he comprobado (el `POST` no tiene la
  comprobación del cuerpo sin tocar que tiene el `PATCH`).
- **Parámetro de querystring desconocido:** el Lote B dice que se ignora, pero no
  hay test que lo compruebe, así que el contrato de la consulta nueva no lo afirma.
- **El test del contrato comprueba algo más que las palabras** que pide T10: que el
  ejemplo se puede leer como JSON, que trae todas las claves en el orden del schema
  de respuesta, que cada línea de `fixed` tiene `isFixed: true` y cada una de
  `variable` `false` o `null`, y que las sumas del ejemplo cuadran (diferencias,
  movimientos de cada línea, grupos y raíz). Es lo mismo que hacen los tests de
  contrato de las F58 y F62.

### Trazabilidad (solo SDD)

- R15 → `the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses`
  (`expenses-by-category.docs.test.ts`): la sección existe; filas de `month`,
  `year` y `compare` y los dos valores de `compare`; el año en curso con los mismos
  meses; `isCountedExpense`, `excludedFromTotals` y `period.totals.expense`; el
  ejemplo (claves, orden, marca por grupo, nueva, ya no está, sin categoría, sumas);
  una fila por campo de la línea; `"previous-year"`; fila `400` `VALIDATION_ERROR`;
  solo lectura; `isFixed` en §`Category`, en el `PATCH` (y ya no «Solo cambia el
  `name`») y en el ejemplo de `GET /api/categories`; y en §`GET /api/recurring-expenses`,
  que sigue respondiendo igual y que se retirará cuando el frontend use la consulta nueva.

### Documentos actualizados

Búsquedas lanzadas (fuera de `progress/` y `specs/`):

```
git grep -n -i "solo cambia el .name\|solo el .name\|renombra una categor\|isFixed\|recurring-expenses\|Recurrentes" -- ':!progress' ':!specs' ':!src' ':!prisma'
git grep -n "tres sumas\|expenses-by-category" -- ':!progress' ':!specs' ':!feature_list.json' ':!src'
```

- `README.md:72` y `docs/api-contract.md` §`PATCH /api/categories/:id` («solo el
  `name`»), que el Lote A dejó apuntadas: corregidas.
- `docs/api-contract.md` §Movimientos entre tus cuentas en las sumas («Vale igual
  para las tres sumas»): añadida la consulta nueva.
- `docs/api-contract.md:1682` y `:1697` (en `PATCH /api/movements/:id`, «sale de
  las tres sumas») y `docs/architecture.md` ADR-040 («las tres sumas»): siguen
  siendo ciertos (hablan de los `totals` de movimientos, del resumen y de
  recurrentes), y ADR-040 es un registro que no se reescribe. No los he tocado.
- `docs/architecture.md` ADR-037 sobre `GET /api/recurring-expenses`: sigue siendo
  cierto mientras la ruta viva; no se reescribe.

### Prueba real

No aplica: el lote no lee datos de fuera del código.

### Último ./init.sh

Antes de lanzarlo, ningún proceso de `vitest` en marcha (consulta de procesos
`node.exe` con `vitest` en la línea de comandos: 0).

```
── 4. Type checking (tsc) ──
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ──
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ──
 Test Files  93 passed (93)
      Tests  1514 passed (1514)
[OK]    Todos los tests pasan
── 7. Resumen ──
[OK]    Entorno listo. Puedes empezar a trabajar.
exit=0
```

### Último ./init.sh --checks 63

```
[1]  … [OK] exit 0
[2]  … [OK] exit 0
[3]  … [OK] exit 0
[4]  … [OK] exit 0
[5]  … [OK] exit 0
[6]  … [OK] exit 0
[7]  … [OK] exit 0
[8]  … [OK] exit 0
[9]  … [OK] exit 0
[10] docs/api-contract.md describe la consulta nueva y qué pasa con GET /api/recurring-expenses. [OK] exit 0
[11] … [OK] exit 0
[12] … [OK] exit 0
[OK]    Checks: 12 de 12 en verde.
exit=0
```

### Sugerencias fuera de scope (NO aplicadas)

- Los dos deberes del humano de la hoja (📌: aplicar la migración en su base con
  `pnpm exec prisma migrate deploy` y marcar sus categorías fijas) no están en
  `docs/roadmap.md` §Deberes tuyos pendientes: T9 solo pedía el cabo 29. Si el
  leader quiere que queden ahí, son dos líneas.
- La fila E7 de la tabla de etapas de `docs/roadmap.md` no nombra la F63; lo hace
  el leader al cerrar, como con las anteriores.
