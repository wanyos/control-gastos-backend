# Design — F63 `expenses-by-category`

> Nombres de ruta, columna, parámetro y campo: propuesta (`decisions.md` 🔴 6).

## 1. Archivos

| Archivo | Qué |
|---|---|
| `prisma/schema.prisma` | `Category.isFixed Boolean @default(false)` con comentario `///` (F63: la marca la pone el humano; solo la lee `GET /api/expenses-by-category`) |
| `prisma/migrations/<timestamp>_category_is_fixed/migration.sql` | `ALTER TABLE "Category" ADD COLUMN "isFixed" BOOLEAN NOT NULL DEFAULT false;` Todas las existentes quedan variables |
| `src/modules/categories/categories.{schema,service,types,routes}.ts` | `PATCH` acepta `name` y/o `isFixed`; `serializeCategory` saca `isFixed` |
| `src/modules/categories/categories.test.ts` | tests de R7 y ajuste de los que hoy comprueban la forma exacta de la categoría o que el `PATCH` rechaza todo lo que no sea `name` |
| `src/modules/expenses-by-category/expenses-by-category.{routes,schema,service,types}.ts` | módulo nuevo |
| `src/modules/expenses-by-category/expenses-by-category.test.ts` | tests R1–R6, R8–R14 |
| `src/modules/expenses-by-category/expenses-by-category.docs.test.ts` | test de R15 (lee `docs/api-contract.md`) |
| `src/app.ts` | registrar con prefijo `/api/expenses-by-category` y `depositMaturityMatchers`, como `recurringExpensesRoutes` |
| `src/architecture.test.ts` | añadir `modules/expenses-by-category/expenses-by-category.routes.ts` a la lista de rutas sin `prisma` |
| `src/modules/movements/movements.service.ts` | solo el comentario de `isCountedExpense`: nombrar a la consulta nueva entre quien la usa |
| `docs/data-model.md` | lección #2: columna nueva en el bloque Prisma, diagrama ER, «Columnas reservadas» (nace con su escritor) y claves naturales (no cambian; comprobarlo) |
| `docs/api-contract.md`, `README.md`, `docs/architecture.md` (ADR-041), `docs/roadmap.md`, `docs/vocabulary.md` | ver §7 |

`src/modules/recurring-expenses/` **no se toca** (`decisions.md` 🔴 1).
`docs/conventions.md` no se toca: la columna nueva no es de texto.

## 2. Ruta y parámetros

`GET /api/expenses-by-category`, querystring (`additionalProperties: false`):

| Parámetro | Patrón | Notas |
|---|---|---|
| `month` | `^\d{4}-(0[1-9]|1[0-2])$` (el de `getOverviewSchema`) | excluyente con `year` |
| `year` | `^\d{4}$` | excluyente con `month` |
| `compare` | `previous-month` \| `same-month-last-year` | solo con `month`; por defecto `previous-month` |

La exclusión mutua y «falta uno» se comprueban en el servicio (o `oneOf` en el
schema) y salen como `ValidationError` → `400 VALIDATION_ERROR` (R13).

## 3. Periodos

Funciones puras en el servicio, testeables sin base (`today` se inyecta, como en
`getRecurringExpenses`; la ruta pasa `todayInMadrid()`):

```ts
export function resolvePeriods(query: ExpensesByCategoryQuery, today: string): {
  period: PeriodRange      // { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', months: string[] }
  compared: PeriodRange
}
```

- Mes `M`: `period = monthRange(M)`; `compared = monthRange(M − 1 mes)` o
  `monthRange(M − 12 meses)`. `monthRange` se importa de
  `src/modules/overview/overview.service.ts` (ya lo importa `recurring-expenses`).
  `addMonths` existe en `recurring-expenses.service.ts`: si se necesita, se copia la
  función pequeña al módulo nuevo **o** se mueve a `src/lib/local-date.ts`; no se
  importa del módulo que se va a retirar.
- Año `Y` < año de hoy: `period` = enero–diciembre de `Y`, `compared` = enero–diciembre
  de `Y−1`, `n = 12`.
- Año `Y` = año de hoy, mes de hoy `m`: `period` = enero–`m` de `Y`, `compared` =
  enero–`m` de `Y−1`, `n = m` (R4).
- Año `Y` > año de hoy: como un año cerrado (todo a 0, sin líneas). No es error.

## 4. Cálculo (`getExpensesByCategory(prisma, matchers, query, today)`)

1. En paralelo: `prisma.movement.findMany` con `type: 'expense'` y `bookingDate`
   entre `min(period.from, compared.from)` y `max(period.to, compared.to)`
   (select: `id, type, amount, transferId, productId, excludedFromTotals,
   categoryId, bookingDate, daySequence, description, accountId`);
   `prisma.category.findMany` (`id, name, parentId, isFixed`);
   `readDepositMovements(prisma, matchers)` (historia entera, como overview);
   `readOwnership(prisma)`.
2. Se queda con los que cumplen `isCountedExpense(row, deposits, ownership)`. **Es
   la única regla**: no se reescribe ninguna condición (R9). `computeTotals` suma
   `expense` solo por esa función, así que el total cuadra con overview por
   construcción.
3. Cada gasto contado va al periodo pedido o al comparado según su `bookingDate`
   (los dos rangos no se solapan nunca) y a la clave `categoryId` (`null` = R10).
4. Por clave: `amount`, `comparedAmount` (`Prisma.Decimal`), `difference`,
   `change` (R5), `monthlyAmount` (solo año: `amount.dividedBy(n).toFixed(2)`;
   en mes, `null`), `movements` (solo los del periodo pedido, R8).
5. Se descartan las claves con `amount = 0` y `comparedAmount = 0` (R11; con
   importes de gasto siempre positivos, solo pasa si no hay gasto contado).
6. Reparto `fixed` / `variable` por `category.isFixed` de **esa** categoría (R6,
   R12); la línea `null` va a `variable`. Orden de R1 dentro de cada grupo.
7. Totales de grupo y total general: suma de los `Decimal` sin redondear,
   serializados con `toFixed(2)`.

Solo `findMany` (R14).

## 5. Respuesta (forma)

```jsonc
{
  "period":   { "month": "YYYY-MM" | null, "year": "YYYY" | null, "from": "…", "to": "…", "months": 1 },
  "compared": { "from": "…", "to": "…", "months": 1 },
  "compare":  "previous-month" | "same-month-last-year" | "previous-year",
  "amount": "…", "comparedAmount": "…", "difference": "…",
  "fixed":    { "amount": "…", "comparedAmount": "…", "difference": "…", "lines": [Line] },
  "variable": { "amount": "…", "comparedAmount": "…", "difference": "…", "lines": [Line] }
}
// Line
{
  "category": { "id": 1, "name": "…", "parentId": null, "isFixed": false } | null,
  "amount": "…", "comparedAmount": "…", "difference": "…",
  "change": "new" | "gone" | null,
  "monthlyAmount": "…" | null,
  "movements": [{ "id": 1, "bookingDate": "YYYY-MM-DD", "description": "…", "amount": "…", "accountId": 1 }]
}
```

Importes: string decimal con 2 decimales, como todo el contrato. `difference`
puede ser negativo (`"-…"`). Los ejemplos del contrato usan importes y conceptos
inventados (`src/no-real-data.test.ts`).

## 6. Categorías: `PATCH /api/categories/:id`

- Body: `name` (string no vacío) y/o `isFixed` (boolean); `minProperties: 1`;
  cualquier otra propiedad sigue siendo `400` (`renameCategoryBodyProperties` pasa a
  `['name', 'isFixed']`; se puede renombrar a `updateCategoryBodyProperties`).
- `renameCategory` → `updateCategory`: escribe solo lo que viaja. El `409` de nombre
  repetido sigue igual.
- `isFixed` no se hereda: marcar un padre no marca a sus hijas (R12).
- `POST /api/categories` no acepta `isFixed` (nace `false`); el seed no cambia.

## 7. Documentos

- `docs/api-contract.md`: sección nueva `GET /api/expenses-by-category` (parámetros,
  respuesta, errores, «qué gasto entra» enlazando a las secciones de depósitos y de
  cuentas propias como hace la de recurrentes); `isFixed` en el modelo `Category`,
  en `GET`/`POST` y en el `PATCH` (que deja de ser «solo cambia el `name`»); y una
  nota al principio de `GET /api/recurring-expenses`: sigue respondiendo igual,
  la sustituye la consulta nueva y se retirará cuando el frontend la use.
- `README.md`: fila nueva en la tabla de endpoints, fila del `PATCH` de categorías,
  y el módulo en el árbol de carpetas.
- `docs/architecture.md`: ADR-041 «El gasto por categoría se agrupa al leer, con
  `isCountedExpense`, y el corte fijo/variable es una marca del humano en
  `Category`»; alternativa descartada: arreglar `GET /api/recurring-expenses`.
- `docs/roadmap.md`: cabo suelto nuevo (29): retirar `GET /api/recurring-expenses`
  (módulo, tests, contrato en «Rutas retiradas») cuando el frontend use la consulta
  nueva. El 28 se queda como está.
- `docs/vocabulary.md`: los nombres que el humano apruebe en la puerta
  (`decisions.md` 🔴 6), con «Propuesto en `specs/63-expenses-by-category/decisions.md` punto 6».

## 8. Errores

Ninguno nuevo: `ValidationError` (400) y, en el `PATCH`, los `NotFoundError` /
`ConflictError` que ya hay.

## 9. Alternativas descartadas

- **Corregir `GET /api/recurring-expenses`** (agrupar por categoría y quitar la
  media de 12 meses): su forma (recibos, «a personas», variable) es justo lo que el
  humano descartó; cambiarla rompería la pantalla actual del frontend a la vez.
- **Dar solo la forma de pedir los movimientos** (`GET /api/movements?categoryId=&from=&to=`):
  esa lista trae también lo que no cuenta (en `Otros gastos`, las aperturas de
  depósito), y los movimientos no sumarían lo de la línea.
- **Las dos comparaciones del mes en una sola respuesta**: duplica cada campo de
  la línea; una comparación por petición deja la línea plana y la frontend pide dos.
- **Guardar los resultados** (tabla por mes y categoría): habría que recalcularla
  con cada cambio de categoría, marca o tabla de cuentas propias; al leer cuadra
  siempre (ADR-040 hace lo mismo con las cuentas propias).
