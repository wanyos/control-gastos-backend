# Resumen — feature 58 `recurring-expenses`

Fecha de cierre: 2026-10-17
Intención original: `feature_list.json` → feature `recurring-expenses`, bloque `intent`
Spec (SDD): `specs/58-recurring-expenses/`

## Qué hace ahora la app que antes no

Hay una consulta, `GET /api/recurring-expenses`, que dice cuánto te cuesta un mes:
tus recibos uno por uno (con su periodicidad, su importe habitual, el último cargo,
cuántas veces se han visto y si han subido o bajado respecto al mes con cargo
anterior), tus transferencias y bizum a personas en un grupo, y tu gasto variable
por categoría, cada uno sumado por mes, más el total de todo. Los movimientos de
cada entrada vienen en la misma respuesta. Se calcula en el momento y no escribe
nada. Antes no había forma de verlo.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/recurring-expenses` — la consulta | [recurring-expenses.routes.ts:32](../../src/modules/recurring-expenses/recurring-expenses.routes.ts#L32) |
| El cálculo entero: qué entra, a qué grupo va, cuánto cuesta al mes | [recurring-expenses.service.ts:247](../../src/modules/recurring-expenses/recurring-expenses.service.ts#L247) |
| Qué es un gasto, la misma regla que las sumas de siempre | [movements.service.ts:601](../../src/modules/movements/movements.service.ts#L601) |
| Registro de la ruta con el reconocimiento de depósitos por banco | [app.ts:117](../../src/app.ts#L117) |

## Dónde está el código

### La consulta (módulo nuevo `recurring-expenses`)

| Qué hace | Dónde |
| --- | --- |
| Si un concepto es un recibo (empieza por `recibo`, `recib` o `tributo`) | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `isBill` |
| Si un gasto va a una persona (palabra de transferencia o `bizum`) | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `isTransferToPerson` |
| Lo que junta los cargos de un mismo recibo: las dos primeras palabras sin las de recibo ni las que llevan cifras | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `billKey` |
| Cada cuánto se cobra un recibo (siete valores) | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `billPeriodicity` |
| Monta la entrada de un recibo: importe habitual, último mes, el anterior, cambio, coste al mes, movimientos | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `buildBill` |
| Monta un grupo sumado por mes (personas y cada categoría) | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `buildGroup`, `monthAmounts`, `monthlyCostOf` |
| Los 12 meses completos anteriores al actual | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `periodMonthsBefore` |
| Orden de los movimientos, del más reciente al más antiguo | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `byRecency` |
| Único sitio donde el módulo obtiene el cliente de la base | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `recurringExpensesDb` |
| Forma de la respuesta | [recurring-expenses.types.ts](../../src/modules/recurring-expenses/recurring-expenses.types.ts) → `RecurringExpensesResponse`, `RecurringBill`, `RecurringGroup`, `RecurringCategoryGroup`, `BillPeriodicity` |
| Esquema de la respuesta (lo que Fastify serializa) | [recurring-expenses.schema.ts](../../src/modules/recurring-expenses/recurring-expenses.schema.ts) → `getRecurringExpensesSchema` |
| Opción con el reconocimiento de depósitos | [recurring-expenses.routes.ts](../../src/modules/recurring-expenses/recurring-expenses.routes.ts) → `RecurringExpensesRoutesOptions` |

### Lo que se tocó fuera del módulo

| Qué hace | Dónde |
| --- | --- |
| La regla «qué es un gasto» sale a una función que usan las sumas y esta consulta; las sumas no cambian | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `isCountedExpense`, `computeTotals` |
| Las palabras de transferencia de la detección de traspasos, ahora exportadas | [transfers.service.ts](../../src/modules/transfers/transfers.service.ts) → `transferWords` |
| Registro de la ruta | [app.ts](../../src/app.ts) → `buildApp` |

### Documentación

| Qué hace | Dónde |
| --- | --- |
| La consulta, cada campo, las siete periodicidades, ejemplo completo | [api-contract.md](../../docs/api-contract.md) → §`GET /api/recurring-expenses` |
| La decisión y su porqué | [architecture.md](../../docs/architecture.md) → ADR-037 |
| Fila de la tabla de endpoints y línea del árbol de módulos | [README.md](../../README.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Clave y periodicidad, caso a caso | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `billKey`, `billPeriodicity` |
| La consulta por HTTP: recibo de un solo cargo, recibo con concepto cambiante, anual, dos veces al mes, cada dos meses, subida de un céntimo, personas, variable por categoría, 1/12 de un anual, exclusiones, no escribe, base vacía, recibo sin cargos en el periodo, mes en curso fuera | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `GET /api/recurring-expenses` |
| El contrato describe la consulta | [recurring-expenses.docs.test.ts](../../src/modules/recurring-expenses/recurring-expenses.docs.test.ts) → `api-contract: describes GET /api/recurring-expenses, its groups, its monthly total and the movements of each one` |

## Cumplimiento de la intención

Resultado real de `./init.sh --checks` (2026-10-17): **15 de 15 en verde**.

- ✅ "Un recibo sale por separado por su concepto, aunque haya aparecido una sola vez."
  Checks: ✅ `lists a bill on its own by its concept even when it was charged once`;
  ✅ `groups the charges of one bill whose concept changes only in digits or after its second word`.
- ✅ "Un recibo anual sale como anual; uno que se paga dos veces al mes sale como tal."
  Checks: ✅ `classifies a bill charged once a year as annual`;
  ✅ `classifies a bill charged twice a month as twice monthly`;
  ✅ (añadido) `classifies a bill charged every two months as every two months`.
- ✅ "El gasto variable sale agrupado por su categoría y sumado al mes; la consulta no
  inventa categorías." Checks: ✅ `groups the variable expense by its category summed per month`;
  ✅ `writes nothing in the database while answering`.
- ✅ "Si un importe ha subido un euro, ha subido, sin umbral." Check:
  ✅ `marks a bill as increased when its last month is one cent above the previous one`.
- ✅ "Las transferencias a personas salen en su propio grupo y suman en el total."
  Check: ✅ `puts transfers and bizum to people in their own group and in the monthly total`.
- ✅ "Hay un total de cuánto suma todo al mes." Check:
  ✅ `counts an annual bill as one twelfth of its amount in the monthly total`.
- ✅ "Los traspasos emparejados y lo marcado con excludedFromTotals no aparecen."
  Check: ✅ `leaves out paired transfers, movements excluded from totals and deposit movements`.
- ✅ "La consulta no escribe ni guarda nada." Check:
  ✅ `writes nothing in the database while answering`.
- ✅ "docs/api-contract.md describe la consulta, su respuesta y cómo se piden los
  movimientos de cada recurrente." Check: ✅ `api-contract: describes GET /api/recurring-expenses, …`.
- ✅ (añadido) Base vacía y el resto igual. Checks:
  ✅ `answers an empty database with empty groups and a zero total`; ✅ `pnpm test`.

**Con tus datos reales no lo he comprobado**: es tu prueba, con
`GET /api/recurring-expenses`; los tests usan datos inventados.

## Decisiones que se tomaron por ti

- (delegado) Un recibo es un gasto cuyo concepto empieza por `recibo`, `recib` o
  `tributo`; las suscripciones con tarjeta salen en su categoría.
- (delegado) Los cargos de un recibo se juntan por las dos primeras palabras de su
  concepto, sin las de recibo ni las que llevan cifras.
- (añadido) Siete periodicidades: `once`, `twice_monthly`, `monthly`,
  `every_two_months`, `every_three_months`, `every_six_months`, `annual`.
- (delegado) «Ha subido» compara el total del último mes con cargo con el del mes con
  cargo anterior.
- (delegado) Lo que cuesta al mes = lo gastado en los 12 meses completos anteriores
  al actual, entre 12; el total es la suma de esas partes ya redondeadas.
- (delegado) «A personas» = palabra de transferencia o `bizum`, en un solo grupo.
- (delegado) Una subcategoría es su propia entrada; los gastos sin categoría, una
  entrada `null`.
- (añadido) Se listan también los recibos que ya no se cobran, con coste al mes 0.
- (delegado) Los movimientos de cada entrada vienen en la respuesta.

## Qué NO se tocó / quedó fuera

- Las sumas de `GET /api/movements` y `GET /api/overview` (misma regla, ahora en una
  función compartida), el esquema de la base, las categorías y las reglas.
- Presupuestos, avisos, marcar algo a mano como recurrente y el interruptor para sacar
  del total las transferencias a personas.
- La parte 2, en el frontend.

## Notas para el futuro

- Lo que no quieras ver (la aportación a la cartera, las transferencias a una
  plataforma de inversión o a empresas) sale de aquí y de las sumas marcándolo con
  `excludedFromTotals`.
- Un banco que escriba sus recibos con otra palabra (p. ej. `adeudo`) no tendrá
  recibos hasta que se añada.
- El árbol de `src/modules/` de `docs/architecture.md` no lista varios módulos, este
  tampoco (lo anotó el implementer, fuera de esta feature).
