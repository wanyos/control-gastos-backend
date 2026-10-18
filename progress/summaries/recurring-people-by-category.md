# Resumen: feature 59 `recurring-people-by-category`

Fecha de cierre: 2026-10-17
Intención original: `feature_list.json` → feature `recurring-people-by-category`, bloque `intent`
Viene del cabo 28 de `docs/roadmap.md`. Retoca la F58 (`progress/summaries/recurring-expenses.md`).
Spec: ninguno (flujo simple).

## Qué hace ahora la app que antes no

En `GET /api/recurring-expenses`, una transferencia o un bizum solo se queda en el
grupo de transferencias a personas si su categoría es `Otros gastos` o
`Transferencias a personas`, o si no tiene categoría. Si le pones cualquier otra
categoría (por ejemplo, la del taller), pasa al gasto variable, en esa categoría
y sumada con el resto de sus gastos, y sigue contando en el total. Antes, la
única forma de sacarla del grupo era marcarla con `excludedFromTotals`, y eso la
quitaba de todas las sumas.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/recurring-expenses`: la consulta entera | [recurring-expenses.routes.ts:32](../../src/modules/recurring-expenses/recurring-expenses.routes.ts#L32) |
| Donde se decide a qué grupo va cada transferencia | [recurring-expenses.service.ts:329](../../src/modules/recurring-expenses/recurring-expenses.service.ts#L329) |
| La regla: qué categorías la dejan en «a personas» | [recurring-expenses.service.ts:59](../../src/modules/recurring-expenses/recurring-expenses.service.ts#L59) |
| La regla escrita en el contrato | [api-contract.md:1500](../../docs/api-contract.md#L1500) |

## Dónde está el código

### Regla de agrupación

| Qué hace | Dónde |
| --- | --- |
| Los dos nombres de categoría que dejan una transferencia en «a personas» | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `transferToPeopleCategoryNames` |
| Dice si una transferencia se queda en «a personas» (sin categoría o con uno de los dos nombres) | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `staysWithPeople` |
| Busca el nombre de la categoría de cada gasto en la lista de categorías que la consulta ya leía, y lo manda a su grupo | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `getRecurringExpenses` |

### Documentación

| Qué hace | Dónde |
| --- | --- |
| Regla 2 reescrita: qué pasa al renombrar una de las dos categorías, y que cambiar de grupo una transferencia mueve el total como mucho un céntimo | [api-contract.md](../../docs/api-contract.md) → §`GET /api/recurring-expenses` |
| Línea «Revisado el 2026-10-17…» al principio del ADR | [architecture.md](../../docs/architecture.md) → ADR-037 |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Con `Otros gastos` se queda en «a personas» | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `keeps a transfer categorized Otros gastos in the transfers to people group` |
| Con `Transferencias a personas` se queda | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `keeps a transfer categorized Transferencias a personas in the transfers to people group` |
| Con otra categoría va al gasto variable, sumada con los otros gastos de esa categoría | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `moves a transfer with any other category to the variable expense under that category` |
| Al ponerle una categoría con `PATCH`, la transferencia sigue contando y el total se mueve como mucho un céntimo | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `keeps the monthly total the same when a transfer changes group` |
| Helper que crea la categoría con uno de los dos nombres en la base de test, si no existe ya | [recurring-expenses.test.ts](../../src/modules/recurring-expenses/recurring-expenses.test.ts) → `seedCategory` |
| El contrato dice la regla, lo que pasa al renombrar y lo del céntimo | [recurring-expenses.docs.test.ts](../../src/modules/recurring-expenses/recurring-expenses.docs.test.ts) → `api-contract: names the two categories that keep a transfer in the transfers to people group` |

## Cumplimiento de la intención

- ✅ «Una transferencia con categoría Otros gastos sale en «a personas».» → se
  cumple. Check: ✅ `keeps a transfer categorized Otros gastos…` (`Tests 1 passed`).
- ✅ «Una transferencia con categoría Transferencias a personas sale en «a
  personas».» → se cumple. Check: ✅ `keeps a transfer categorized Transferencias a personas…` (`Tests 1 passed`).
- ✅ «Una transferencia con otra categoría sale en el gasto variable, dentro de
  esa categoría, y no en «a personas».» → se cumple. Check: ✅ `moves a transfer with any other category…` (`Tests 1 passed`).
- ✅ «El total no cambia por mover una transferencia de grupo, salvo como mucho un
  céntimo por redondeo.» → se cumple. El test lo comprueba con importes con los que
  sí se nota (`1.83` → `1.82`). El reviewer comprobó aparte, con la misma fórmula del
  servicio, que el total no se mueve nunca más de un céntimo. Check: ✅ `keeps the monthly total the same…` (`Tests 1 passed`).
- ✅ «docs/api-contract.md dice qué transferencias van a «a personas» y cuáles a su
  categoría.» → se cumple. Check: ✅ `api-contract: names the two categories…` (`Tests 1 passed`).
- ✅ (añadido) La suite entera pasa. Check: ✅ `pnpm test`. Resultado real de
  `./init.sh --checks`: **6 de 6 en verde**.

Lo que no querías: los recibos y los traspasos emparejados no cambian (los tests
que ya había siguen igual y pasan), y la consulta no escribe en la base.

## Decisiones que se tomaron por ti

- Una transferencia **sin categoría** se queda en «a personas». Si saliera, los
  tests de la F58 dejarían de pasar. Está escrito en el contrato.
- Las dos categorías se reconocen por su **nombre exacto**, mayúsculas y tildes
  incluidas, sean categoría o subcategoría. Si renombras una, sus transferencias
  pasan al gasto variable con el nombre nuevo. Lo decidió el leader y está en el
  contrato.
- El céntimo de redondeo: lo aceptaste el 2026-10-17. El total sigue siendo la
  suma de lo que se ve en cada grupo.

## Qué NO se tocó / quedó fuera

- No se ha tocado cómo se reconoce un recibo ni la detección de traspasos.
- No se ha cambiado cómo se redondea el total (decisión 6 del ADR-037).
- El backend no escribe ni cambia categorías: las pones tú con `PATCH /api/movements/:id`.
- El frontend: falta la frase en la pantalla de gastos que explique que una
  transferencia sale de «a personas» si le pones su categoría (cabo 28).
