# Requirements — F63 `expenses-by-category`

> Fuente de verdad: el `intent` de la feature 63 en `feature_list.json`. Las
> decisiones que el humano revisa están en `decisions.md`. Los nombres de ruta,
> columna, parámetro y campo son **propuesta pendiente de aprobación**
> (`decisions.md` 🔴 6): si cambian, el leader corrige estos nombres antes de
> lanzar los lotes.
>
> Vocabulario de este archivo (definido aquí, no son términos nuevos para el
> humano):
> - **gasto contado**: un movimiento para el que `isCountedExpense(movement,
>   deposits, ownership)` (`src/modules/movements/movements.service.ts`) da `true`,
>   con `deposits = readDepositMovements(...)` y `ownership = readOwnership(...)`,
>   las mismas lecturas que usa `GET /api/overview`. Es exactamente lo que suma
>   `expense` en `computeTotals`.
> - **periodo pedido**: el mes (`month`) o el año (`year`) de la petición.
> - **periodo comparado**: el periodo con el que se compara (R1–R4).
> - **línea**: una entrada de la respuesta para una categoría (o para «sin
>   categoría», R10), con lo del periodo pedido y lo del comparado.
> - **hoy**: `todayInMadrid()` (`src/lib/local-date.ts`).

## Consulta por mes y por año

## R1
CUANDO un cliente hace `GET /api/expenses-by-category?month=YYYY-MM` (sin
`compare` o con `compare=previous-month`), el sistema DEBE responder `200` con una
línea por categoría que tenga gasto contado en ese mes o en el mes anterior, cada
una con `amount` (gasto contado del mes), `comparedAmount` (gasto contado del mes
anterior) y `difference` (`amount − comparedAmount`), ordenadas por `amount`
descendente, después `comparedAmount` descendente y después nombre de categoría.

## R2
CUANDO la petición trae `month=YYYY-MM&compare=same-month-last-year`, el sistema
DEBE usar como periodo comparado el mismo mes del año anterior (de `2026-03`,
`2025-03`), con las mismas reglas de línea que R1.

## R3
CUANDO un cliente hace `GET /api/expenses-by-category?year=YYYY` de un año
anterior al año de hoy, el sistema DEBE comparar con el año anterior entero (1 de
enero a 31 de diciembre) y DEBE dar en cada línea `monthlyAmount` = `amount / 12`
redondeado a 2 decimales.

## R4
MIENTRAS el `year` pedido es el año de hoy, el sistema DEBE tomar como periodo
pedido de enero al último día del mes de hoy, como periodo comparado de enero al
último día del mismo mes del año anterior, y como `monthlyAmount` = `amount / n`,
siendo `n` el número de meses de enero al mes de hoy, ambos incluidos.

## R5
El sistema DEBE dar en cada línea `change: "new"` si `comparedAmount` es `0` y
`amount` no; `change: "gone"` si `amount` es `0` y `comparedAmount` no; y
`change: null` en el resto.

## Fijo y variable

## R6
El sistema DEBE repartir las líneas en dos grupos, `fixed` (categoría con
`isFixed: true`) y `variable` (el resto), cada uno con su `amount`,
`comparedAmount` y `difference` (suma de sus líneas) y sus `lines`.

## R7
CUANDO un cliente hace `PATCH /api/categories/:id` con `isFixed` (boolean), solo o
junto con `name`, el sistema DEBE guardar la marca y responder `200` con la
categoría, que trae `isFixed` también en `GET /api/categories` y en
`POST /api/categories` (donde nace `false`).

## Movimientos y cuadre con las sumas de siempre

## R8
El sistema DEBE incluir en cada línea `movements`: los gastos contados de esa
categoría **en el periodo pedido** (`id`, `bookingDate`, `description`, `amount`,
`accountId`), ordenados como `GET /api/movements` (`bookingDate` desc,
`daySequence` desc con nulos detrás, `id` desc).

## R9
El sistema DEBE sumar en cada línea solo gastos contados, de modo que el `amount`
total de la respuesta de un mes sea igual a `period.totals.expense` de
`GET /api/overview?month=` de ese mes, y el de un año, a la suma de esos valores
de sus meses.

## R10
SI hay gastos contados sin categoría en el periodo pedido o en el comparado
ENTONCES el sistema DEBE darlos en una línea con `category: null`, dentro del
grupo `variable`.

## R11
El sistema NO DEBE dar línea a una categoría cuyo gasto contado es `0` en los dos
periodos, aunque tenga movimientos en ellos (p. ej. solo aperturas de depósito).

## R12
El sistema DEBE dar a una subcategoría su propia línea, con su `parentId`, sin
sumarla a la de su padre, y en el grupo que diga **su** `isFixed`.

## Errores y solo lectura

## R13
SI la petición no trae ni `month` ni `year`, trae los dos, trae un `month` que no
es `YYYY-MM` válido o un `year` que no son 4 cifras, trae `compare` junto con
`year`, o trae un `compare` distinto de `previous-month` / `same-month-last-year`
ENTONCES el sistema DEBE responder `400 VALIDATION_ERROR` sin escribir nada.

## R14
CUANDO se atiende `GET /api/expenses-by-category`, el sistema NO DEBE escribir en
ninguna tabla.

## R15
El sistema DEBE describir en `docs/api-contract.md` `GET /api/expenses-by-category`
(parámetros, respuesta, errores, qué gasto entra), el campo `isFixed` de
`Category` y su uso en `PATCH /api/categories/:id`, y que
`GET /api/recurring-expenses` sigue respondiendo igual hasta que el frontend use la
consulta nueva y se retirará en una feature posterior.

---

## Procedencia

- R1 — (humano) «el mes con el mes anterior»; «lo gastado, lo del periodo con que se compara, la diferencia». El orden de las líneas es (delegado, técnico): de más a menos gasto, como pedía el boceto de barras.
- R2 — (humano) «el mes con el mismo mes del año anterior». El parámetro `compare` (una comparación por petición) es (delegado, técnico).
- R3 — (humano) «el año (natural, de enero a diciembre) con el año anterior»; «en el año, además, cuánto sale al mes».
- R4 — (delegado) El humano cedió «qué se entiende por cuánto sale al mes en el año en curso». Decido: el año en curso va de enero al mes de hoy, se compara con los mismos meses del año anterior y se divide por esos meses. Alternativa: comparar con el año anterior entero y dividir por 12 (todo saldría bajando hasta diciembre). ← `decisions.md` 🔴 3.
- R5 — (humano) «qué es nuevo y qué ya no está».
- R6 — (humano) «separados en gastos fijos y variables, según marque yo cada categoría como fija».
- R7 — (humano) «puedo marcar y desmarcar una categoría como fija». Que se haga en `PATCH /api/categories/:id` y que una categoría nueva nazca variable es (delegado, técnico). Nombre `isFixed` ← `decisions.md` 🔴 6.
- R8 — (humano) «cada categoría trae sus movimientos del periodo, o la forma de pedirlos». Decido traerlos dentro, solo los que cuentan y solo del periodo pedido ← `decisions.md` 🔴 4.
- R9 — (humano) «lo que suma cada periodo coincide con el gasto que dan las sumas de siempre».
- R10 — (añadido) El humano no dijo qué pasa con un gasto que cuenta y no tiene categoría. Hoy no hay ninguno, pero sin esta línea el total dejaría de cuadrar con `GET /api/overview` el día que lo haya ← `decisions.md` 🔴 5.
- R11 — (delegado) El humano cedió «cómo se cuentan Otros gastos y las que solo tienen movimientos que no cuentan». Decido: se cuentan igual que cualquier otra; si su gasto contado es 0 en los dos periodos no salen ← `decisions.md` 🔴 5.
- R12 — (delegado) El humano cedió «cómo se trata una subcategoría». Decido: línea propia con su propia marca, como el filtro `categoryId` de `GET /api/movements`. Alternativa: sumarla en la del padre. ← `decisions.md` ⚙️.
- R13 — (añadido) Errores de parámetros, con la forma de error de siempre.
- R14 — (humano) «que no cambie ninguna suma, importe o categoría existentes: es una consulta para mirar».
- R15 — (humano) «docs/api-contract.md describe la consulta nueva y qué pasa con GET /api/recurring-expenses». Qué pasa con ella es (delegado): sigue viva hasta que el frontend cambie ← `decisions.md` 🔴 1. «Solo gastos, no ingresos» (delegado) no tiene requirement propio: es la ausencia de ingresos en R1–R12 ← `decisions.md` 🔴 2.
