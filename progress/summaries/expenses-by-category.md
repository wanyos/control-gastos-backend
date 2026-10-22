# Resumen — feature 63 `expenses-by-category`

Fecha de cierre: 2026-10-21
Intención original: `feature_list.json` → feature `expenses-by-category`, bloque `intent`
Spec (SDD): `specs/63-expenses-by-category/`

## Qué hace ahora la app que antes no

Una consulta nueva, `GET /api/expenses-by-category`, da lo gastado por categoría en
un mes o en un año natural, frente al mes anterior, al mismo mes del año pasado o al
año anterior: la diferencia, si la categoría es nueva o ya no está, sus movimientos
y, en el año, cuánto sale al mes; todo separado en fijo y variable. Y cada categoría
tiene ahora una marca `isFixed` que pones tú con `PATCH /api/categories/:id`. Antes
la única vista parecida era `GET /api/recurring-expenses`, que agrupaba por el
concepto del banco y daba medias de 12 meses; esa sigue respondiendo igual hasta que
el frontend use la nueva.

## Lo que tienes que hacer tú (en este orden)

1. **Copia de seguridad de tu base** (`docs/database-backup.md`).
2. **Aplicar la migración:** `pnpm exec prisma migrate deploy`. Añade la columna
   `isFixed` a `Category`, con todas tus categorías en `false` (variables).
3. **Reiniciar el servidor de desarrollo** (`pnpm run dev`): hasta entonces la
   consulta nueva no puede leer la columna.
4. **Marcar tus categorías fijas** (por ejemplo vivienda, suministros, telefonía)
   con `PATCH /api/categories/:id` y `{ "isFixed": true }`. Hasta que lo hagas, todo
   sale en `variable`.

Después, la sesión del frontend hace la vista nueva y quita Recurrentes; cuando
esté, una feature del backend retira `GET /api/recurring-expenses` (cabo suelto 29
de `docs/roadmap.md`).

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/expenses-by-category?month=YYYY-MM[&compare=…]` o `?year=YYYY` | [expenses-by-category.routes.ts:32](../../src/modules/expenses-by-category/expenses-by-category.routes.ts#L32) |
| El cálculo de la consulta | [expenses-by-category.service.ts:155](../../src/modules/expenses-by-category/expenses-by-category.service.ts#L155) |
| `PATCH /api/categories/:id` con `name` y/o `isFixed` | [categories.routes.ts:66](../../src/modules/categories/categories.routes.ts#L66) |
| Registro de la ruta en la app | [app.ts:123](../../src/app.ts#L123) |

## Dónde está el código

### La consulta

| Qué hace | Dónde |
| --- | --- |
| Decide el periodo pedido y el comparado (mes, año cerrado, año en curso) y rechaza combinaciones de parámetros que no valen | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `resolvePeriods` |
| Lee los gastos, se queda con los que cuentan (la misma función que las sumas de siempre) y arma líneas y grupos | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `getExpensesByCategory` |
| «Nueva» / «ya no está» | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `changeOf` |
| Orden de las líneas y totales de cada grupo | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `byLineOrder`, `buildGroup` |
| Suma de meses sobre un `YYYY-MM` | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `addMonths` |
| Acceso a la base del módulo | [expenses-by-category.service.ts](../../src/modules/expenses-by-category/expenses-by-category.service.ts) → `expensesByCategoryDb` |
| La ruta | [expenses-by-category.routes.ts](../../src/modules/expenses-by-category/expenses-by-category.routes.ts) → `expensesByCategoryRoutes` |
| Parámetros y forma de la respuesta | [expenses-by-category.schema.ts](../../src/modules/expenses-by-category/expenses-by-category.schema.ts) → `getExpensesByCategorySchema` |
| Tipos | [expenses-by-category.types.ts](../../src/modules/expenses-by-category/expenses-by-category.types.ts) → `ExpensesByCategoryQuery`, `PeriodRange`, `AskedPeriod`, `ExpensesByCategoryLine`, `ExpensesByCategoryGroup`, `ExpensesByCategoryResponse` |
| Registro con los mismos reconocedores de depósito que el resumen del mes | [app.ts](../../src/app.ts) → `buildApp` |
| La regla de qué es un gasto (solo cambió su comentario) | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `isCountedExpense` |

### La marca de categoría fija

| Qué hace | Dónde |
| --- | --- |
| Columna `isFixed` | [schema.prisma](../../prisma/schema.prisma) → `model Category` |
| Migración | [migration.sql](../../prisma/migrations/20261021120000_category_is_fixed/migration.sql) |
| Escribe solo lo que viaja (`name` y/o `isFixed`) | [categories.service.ts](../../src/modules/categories/categories.service.ts) → `updateCategory` |
| Saca `isFixed` en la categoría | [categories.service.ts](../../src/modules/categories/categories.service.ts) → `serializeCategory` |
| `isFixed` tiene que llegar como `true` o `false` de verdad | [categories.routes.ts](../../src/modules/categories/categories.routes.ts) → `assertStrictIsFixed` |
| Schema del `PATCH` | [categories.schema.ts](../../src/modules/categories/categories.schema.ts) → `updateCategorySchema`, `updateCategoryBodyProperties` |
| Tipos | [categories.types.ts](../../src/modules/categories/categories.types.ts) → `UpdateCategoryBody`, `SerializedCategory` |

### Documentos

| Qué | Dónde |
| --- | --- |
| Contrato de la consulta, `isFixed` en `Category` y en el `PATCH`, nota de retirada de recurrentes | [api-contract.md](../../docs/api-contract.md) → §`GET /api/expenses-by-category`, §`PATCH /api/categories/:id`, §`GET /api/recurring-expenses` |
| La decisión y su porqué | [architecture.md](../../docs/architecture.md) → ADR-041 |
| Modelo de datos | [data-model.md](../../docs/data-model.md) → `Category`, «Columnas reservadas» |
| Retirar la ruta vieja más adelante | [roadmap.md](../../docs/roadmap.md) → cabo suelto 29 |
| Nombres aprobados | [vocabulary.md](../../docs/vocabulary.md) → fila de `isFixed` |
| Tabla de endpoints y árbol de módulos | [README.md](../../README.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| R1–R6, R8–R14 (13 tests) | [expenses-by-category.test.ts](../../src/modules/expenses-by-category/expenses-by-category.test.ts) |
| R7: marcar y desmarcar; `isFixed` no booleano da 400 | [categories.test.ts](../../src/modules/categories/categories.test.ts) → `marks and unmarks a category as fixed`, `PATCH /api/categories/:id rejects kind, extra properties and an empty body (R12)` |
| R15: el contrato | [expenses-by-category.docs.test.ts](../../src/modules/expenses-by-category/expenses-by-category.docs.test.ts) |
| La ruta no nombra la capa de datos | [architecture.test.ts](../../src/architecture.test.ts) |

## Cumplimiento de la intención

Resultados reales de `./init.sh --checks 63` (2026-10-21): 12 de 12 en verde.

- ✅ «Para un mes, cada categoría de gasto sale con lo gastado ese mes, lo del mes
  anterior y la diferencia» → `a month lists each category with its amount, the previous month and the difference`. Check ✅.
- ✅ «Para un mes, también se compara con el mismo mes del año anterior» →
  `compares a month with the same month of the previous year`. Check ✅.
- ✅ «Para un año natural… y cuánto sale al mes» → `a closed year compares with the whole previous year and divides by twelve`
  y `the year in progress compares with the same months of the previous year`. Checks ✅ ✅.
- ✅ «Nueva / ya no está» → `marks a category as new or gone against the compared period`. Check ✅.
- ✅ «Fijos y variables según las que marque, y marcar y desmarcar» →
  `splits the lines into fixed and variable by the category mark` y
  `marks and unmarks a category as fixed`. Checks ✅ ✅.
- ✅ «Cada categoría trae sus movimientos del periodo» → `each line carries the counted movements of the period`
  (un excluido de la misma categoría no sale). Check ✅.
- ✅ «Coincide con `GET /api/overview`: mismas exclusiones» → `the month and the year add up to the expense of GET /api/overview`. Check ✅.
- ✅ «`docs/api-contract.md` describe la consulta nueva y qué pasa con recurrentes» →
  `the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses`. Check ✅.
- ✅ (añadido) «No escribe nada» → `writes nothing in the database`. Check ✅.
- ✅ (añadido) «Lo que ya funciona sigue igual» → `pnpm test`. Check ✅.

## Decisiones que se tomaron por ti

- (delegado) Recurrentes sigue viva hasta que el frontend use la vista nueva; luego
  se retira (cabo 29). Hoja, punto 1.
- (delegado) Solo gastos, sin ingresos. Punto 2.
- (delegado) El año en curso se compara con los mismos meses del anterior y «al mes»
  divide por los meses que lleva. Punto 3.
- (delegado) Cada línea trae dentro solo los movimientos que cuentan. Punto 4.
- (delegado) `Otros gastos` como cualquier otra; una categoría a 0 en los dos
  periodos no sale; una subcategoría tiene su propia línea y su propia marca.
- (añadido) Los gastos que cuentan sin categoría salen en una línea `category: null`,
  en variable, para que el total cuadre con el resumen del mes. Punto 5.
- (añadido) Errores 400 de parámetros y la comprobación de que no escribe nada.

## Qué NO se tocó / quedó fuera

- `GET /api/recurring-expenses` y su módulo: intactos.
- Ninguna suma, importe ni categoría de movimiento cambia.
- Ni ingresos ni agrupación por el concepto del banco.

## Notas para el futuro

- El implementer propone dos limpiezas sin aplicar: exportar el orden de
  `GET /api/movements` (`movementListOrder`) para no escribirlo dos veces, y llevar a
  `src/lib/strict-body.ts` la comprobación de booleano estricto, que ya está en
  movimientos y en categorías.
- `year=0000` y `month=0000-01` pasan el schema y `resolvePeriods` les calcula un
  periodo comparado con fechas mal formadas (comprobado llamando a la función con
  `tsx`). No lo he comprobado por HTTP; no afecta a ningún año real.
