# recurring-expenses — implementación

## Lote A — implementación

No se ha escrito nada en la base del humano: todo lo ejecutado usa la base desechable de los tests (`gastos_test_<n>`).

### Archivos modificados / creados

- `src/modules/movements/movements.service.ts` — nueva `isCountedExpense(movement, deposits)` exportada; `computeTotals` la usa para la rama de gasto. Las comprobaciones de depósito siguen yendo primero y la rama de ingreso no cambia.
- `src/modules/transfers/transfers.service.ts` — `transferWords` pasa a `export const`. Nada más.
- `src/modules/recurring-expenses/recurring-expenses.types.ts` (nuevo) — tipos de `design.md` §5.
- `src/modules/recurring-expenses/recurring-expenses.service.ts` (nuevo) — `recurringExpensesDb`, `getRecurringExpenses(prisma, matchers, today)`, y las puras `billKey`, `billPeriodicity`, `isBill`, `isTransferToPerson`, `periodMonthsBefore`. Solo `findMany` (movimientos `expense`, categorías) y `readDepositMovements`.
- `src/modules/recurring-expenses/recurring-expenses.schema.ts` (nuevo) — esquema de respuesta `200` con todas las claves de §5; `previousMonth`, `previousMonthAmount`, `change`, `category` y `category.parentId` admiten `null`.
- `src/modules/recurring-expenses/recurring-expenses.routes.ts` (nuevo) — `GET /`, opción `depositMaturityMatchers`, pasa `todayInMadrid()`. El archivo no contiene la palabra «prisma».
- `src/modules/recurring-expenses/recurring-expenses.test.ts` (nuevo) — los 14 tests de T4 más 9 unitarios de `billKey` y `billPeriodicity` (23 en total).
- `src/app.ts` — registro con prefijo `/api/recurring-expenses` y `depositMaturityMatchers`.
- `specs/58-recurring-expenses/tasks.md` — T1 a T4 marcadas `[x]`.

### Decisiones tomadas

- **`Category` no tiene columna `updatedAt`** (solo `createdAt`), así que el test «writes nothing in the database while answering» no puede comparar su `max(updatedAt)` como dice T4. Para `Category` compara **todas las filas** (`findMany` ordenado por `id`) antes y después; para `Movement`, `Account` y `CategoryRule` compara recuento y `max(updatedAt)`, como pide la task. Es más estricto que lo pedido, no menos.
- La comprobación de que el código no escribe busca en `recurring-expenses.service.ts`, en minúsculas, `create`, `update`, `delete`, `upsert` y `$executeRaw`.
- Orden de los movimientos «del más reciente al más antiguo»: `bookingDate` desc, luego `daySequence` desc (nulo como 0), luego `id` desc. El spec no fija el desempate dentro del mismo día; se usa el mismo orden del día que el resto del backend.
- Para los meses del periodo se reutiliza `monthRange` de `overview.service.ts` (primer y último día de un mes), en vez de escribir otra igual.
- Un recibo cuyo concepto no deja ninguna palabra sin dígitos ni de recibo toma como clave la primera palabra de recibo (§3 paso 5); si tampoco hubiera ninguna (no puede pasar: solo se llama con conceptos que empiezan por una), devuelve cadena vacía.
- El orden de `variable` por nombre de categoría usa `localeCompare`.

### Trazabilidad

- R1 → `excludes the current month from the period`
- R2 → `leaves out paired transfers, movements excluded from totals and deposit movements` (también ingreso, neutral y `productId`)
- R3 → `lists a bill on its own by its concept even when it was charged once`, `lists a bill with no charge in the period with a monthly cost of zero`
- R4 → `groups the charges of one bill whose concept changes only in digits or after its second word`; unitarios `billKey`
- R5 → `classifies a bill charged once a year as annual`, `classifies a bill charged twice a month as twice monthly`, `classifies a bill charged every two months as every two months`; unitarios `billPeriodicity` (`once`, `monthly`, `every_three_months`, `every_six_months`, mediana inferior)
- R6 → `lists a bill on its own by its concept even when it was charged once` (compara la entrada entera), `groups the charges of one bill…` (`usualAmount`, `name`)
- R7 → `marks a bill as increased when its last month is one cent above the previous one` (sube un céntimo y baja un céntimo); `classifies a bill charged twice a month…` (dos cuotas del mismo mes comparadas como total: `change` `0.00`)
- R8 → `puts transfers and bizum to people in their own group and in the monthly total`
- R9 → `groups the variable expense by its category summed per month` (dos categorías y la entrada `null`)
- R10 → `writes nothing in the database while answering`; además `groups the variable expense…` cuenta las categorías antes y después
- R11 → `counts an annual bill as one twelfth of its amount in the monthly total` (40,525 → `40.53`, mitad hacia arriba), `lists a bill with no charge in the period…`
- R12 → `counts an annual bill as one twelfth…`, `puts transfers and bizum to people…`
- R13 → `groups the variable expense…` (solo los del periodo, ordenados), `groups the charges of one bill…` y `lists a bill on its own…` (toda la historia)
- R14 → `answers an empty database with empty groups and a zero total`
- R15 → Lote B (no hecho aquí)

### Documentos actualizados

Ninguno: los documentos de esta feature (`docs/api-contract.md`, `README.md`, `docs/architecture.md`) son del Lote B.

`git grep -n "transferWords\|isCountedExpense\|recurring-expenses" -- ':!progress' ':!specs'`: solo salen `feature_list.json` (los `checks`), `src/app.ts`, `movements.service.ts` y `transfers.service.ts`. Ninguna línea queda falsa.

`git grep -n "computeTotals" -- docs README.md`: `docs/data-model.md` (64, 418, 437, 1114), `docs/architecture.md` (792, 925, 3030) y `docs/roadmap.md` (330, 441). Las he leído: siguen siendo verdad, porque `computeTotals` sigue excluyendo lo mismo, ahora preguntando a `isCountedExpense` en la rama de gasto. Ninguna corrección.

### Prueba real

No hecha. La consulta lee los movimientos de la base del humano; según `decisions.md` §📌, la prueba con sus datos la hace él con `GET /api/recurring-expenses` cuando la feature esté hecha. Los tests usan solo datos inventados en la base desechable.

### Último ./init.sh

Código de salida 0. Extracto:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  84 passed (84)
      Tests  1438 passed (1438)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

En una pasada anterior, `src/no-real-data.test.ts` marcó una línea de este test (un total derivado de las cifras inventadas coincidía con un importe de la base). Se cambió el importe inventado del que salía (y los resultados que dependen de él); no se usó la marca de excepción.

### Último ./init.sh --checks

Código de salida 1: **14 de 15 en verde**. Todos los del Lote A pasan (1 a 12, 14 y 15, este último `pnpm test` entero). Falla solo el **check 13**, «docs/api-contract.md describe la consulta, su respuesta y cómo se piden los movimientos de cada recurrente.», porque `src/modules/recurring-expenses/recurring-expenses.docs.test.ts` todavía no existe (`No test files found`): es T6, del Lote B.

### Sugerencias fuera de scope (NO aplicadas)

- `docs/roadmap.md:441` enlaza a `movements.service.ts#L335` para `computeTotals`; la función ya no está en esa línea (lo estaba antes de esta feature también). Es una fila tachada e histórica: se deja como está.

## Lote B — implementación

No se ha escrito nada en la base del humano: lo único que la ha leído es `src/no-real-data.test.ts`, en su conexión de solo lectura, dentro de `./init.sh`.

### Archivos modificados / creados

- `docs/api-contract.md` — sección nueva `### \`GET /api/recurring-expenses\`` después de `GET /api/overview`: qué movimientos entran (`isCountedExpense`, enlazando a `GET /api/movements` y a la regla de depósitos), los tres grupos en orden con las palabras que se buscan (`recibo`, `recib`, `tributo`; las de transferencia de la detección de traspasos y `bizum`), la `key` de un recibo, el periodo, `monthlyCost` y `monthlyTotal`, un ejemplo JSON completo con datos inventados, una tabla con cada campo de un recibo, otra con los siete valores de `periodicity` y su regla, `transfersToPeople` y `variable`, que los movimientos vienen en la respuesta (toda la historia en un recibo, el periodo en los otros), la respuesta vacía, errores y que es de solo lectura. El contrato no tiene un índice de endpoints: no hay fila que añadir.
- `src/modules/recurring-expenses/recurring-expenses.docs.test.ts` (nuevo) — el test de T6, con el patrón de `movements.deposits.docs.test.ts`.
- `README.md` — fila de `GET /api/recurring-expenses` en la tabla de endpoints y línea `recurring-expenses/` en el árbol de `modules/`.
- `docs/architecture.md` — ADR-037 añadido al final de los ADR. Ningún ADR anterior se ha tocado.
- `specs/58-recurring-expenses/tasks.md` — T5, T6 y T7 marcadas `[x]`.

### Decisiones tomadas

- El contrato describe lo que hace el código del Lote A, leído en `recurring-expenses.service.ts` y `recurring-expenses.types.ts`: el nombre de un recibo es el concepto de su cargo **más reciente**; `variable` solo trae categorías con gasto en el periodo; una subcategoría es su propia entrada; el orden de `bills` y `variable`; `transfersToPeople` con los 12 meses a `"0.00"` en la respuesta vacía.
- El ejemplo JSON está hecho para cuadrar con el cálculo: periodo pedido el 2026-10-17, un recibo anual (1/12 de su cargo del periodo), uno de una sola vez con redondeo hacia arriba en la mitad del céntimo, uno sin cargos en el periodo (`monthlyCost: "0.00"`), el grupo de transferencias a personas y dos entradas de gasto variable (una con `category: null`). El test comprueba que `monthlyTotal` es la suma de los `monthlyCost` del ejemplo.
- El test de T6 comprueba, además de lo que pide la task, el orden de las claves de cada objeto del ejemplo (igual que el código las escribe), que cada campo de un recibo tiene su fila en la tabla, y que cada grupo trae los 12 meses del periodo.
- En una primera pasada, `src/no-real-data.test.ts` marcó un importe del ejemplo (`docs/api-contract.md`, un `monthlyCost` derivado de un cargo inventado) por coincidir con uno de la base. Se cambió el importe inventado del que salía y todos los que dependen de él; no se usó la marca de excepción.
- El árbol de módulos de `docs/architecture.md` (§estructura) no lista varios módulos existentes (`overview/`, `net-worth/`, `transfers/`…); no se ha añadido `recurring-expenses/` ahí porque T7 solo pide el ADR. Ver sugerencias.

### Trazabilidad

- R15 → `api-contract: describes GET /api/recurring-expenses, its groups, its monthly total and the movements of each one` (`recurring-expenses.docs.test.ts`)

Con el Lote A, los quince requirements tienen al menos un test.

### Documentos actualizados

`git grep -n "recurring-expenses\|isCountedExpense\|transferWords" -- ':!progress' ':!specs' ':!src'`: salen solo `README.md` (87, 154), `docs/api-contract.md` (1500, 1502, 1514, 1772), `docs/architecture.md` (ADR-037) y `feature_list.json` (los `checks`). Todo lo añadido en este lote; ninguna otra línea queda falsa.

### Prueba real

No hecha, como en el Lote A: según `decisions.md` §📌, la prueba con sus datos la hace el humano con `GET /api/recurring-expenses`.

### Último ./init.sh

Código de salida 0:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  85 passed (85)
      Tests  1439 passed (1439)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks

Código de salida 0:

```
[INFO]  [13] docs/api-contract.md describe la consulta, su respuesta y cómo se piden los movimientos de cada recurrente.
[OK]        exit 0
                Tests  1 passed (1)
...
[OK]    Checks: 15 de 15 en verde.
```

### Sugerencias fuera de scope (NO aplicadas)

- El árbol de `src/modules/` de `docs/architecture.md` (§estructura) se quedó atrás hace varias features: le faltan `overview/`, `net-worth/`, `transfers/`, `category-rules/`, `openbank/`, `n26/` y ahora `recurring-expenses/`. Ponerlo al día es un cambio solo de `docs/`.
