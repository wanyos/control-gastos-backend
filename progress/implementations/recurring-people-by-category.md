# recurring-people-by-category — implementación

F59, flujo simple (sin spec). Cabo 28 de `docs/roadmap.md`. No he escrito nada
en la base del humano: todo lo ejecutado va contra las bases de test de
`vitest.global-setup.ts`.

## Archivos modificados / creados

- `src/modules/recurring-expenses/recurring-expenses.service.ts`
  - Nueva constante exportada `transferToPeopleCategoryNames = ['Otros gastos', 'Transferencias a personas']`
    y función `staysWithPeople(categoryName)`.
  - En `getRecurringExpenses`, un gasto con palabra de transferencia o `bizum`
    va a `transfersToPeople` solo si `staysWithPeople` es verdad para el nombre
    de su categoría; si no, sigue al bloque de gasto variable de su
    `categoryId`. El nombre sale de la lista de categorías que la consulta ya
    leía (`category.findMany`): ninguna lectura nueva, ninguna escritura.
  - Comentario de cabecera de `getRecurringExpenses` actualizado.
- `src/modules/recurring-expenses/recurring-expenses.test.ts`: helper
  `seedCategory(name)` (busca la categoría raíz de gasto con ese nombre exacto
  y, si no existe en la base de test, la crea y la borra al acabar) y los
  cuatro tests de los `checks`.
- `src/modules/recurring-expenses/recurring-expenses.docs.test.ts`: el test del
  check 5.
- `docs/api-contract.md` §`GET /api/recurring-expenses`: regla 2 reescrita y un
  párrafo nuevo «Cambiar de grupo una transferencia no la saca del total».
- `docs/architecture.md`: línea «Revisado el 2026-10-17 por la feature 59…» al
  principio del ADR-037 (el cuerpo del ADR no se toca).
- `feature_list.json`: F59 `pending` → `in_progress` (solo `status`).
- `progress/current.md`: plan.

## Decisiones tomadas

1. **Un gasto de transferencia sin categoría (`categoryId: null`) se queda en
   «a personas».** El `acceptance` dice qué pasa con las dos categorías y con
   «cualquier otra categoría», pero no con ninguna. Lo he dejado como hoy (no
   tiene categoría, así que no hay categoría a la que mandarlo), en línea con la
   propuesta del cabo 28 («a «a personas» solo las que no la tengan»). Está
   escrito en el contrato. Si el humano lo quiere al revés, es cambiar
   `staysWithPeople` y una frase.
2. **Las dos categorías se reconocen por nombre exacto en cualquier nivel**
   (raíz o subcategoría, sin mirar `kind`), comparación literal con mayúsculas
   y tildes. El `acceptance` dice «la de nombre…»; la importación además exige
   raíz y `kind`. No lo he restringido a raíz porque el `acceptance` no lo pide;
   el contrato lo dice. Si el reviewer prefiere exigir raíz, es una línea.
3. **El total puede moverse un céntimo.** `monthlyTotal` suma los `monthlyCost`
   ya redondeados (decisión 6 del ADR-037, aprobada en la F58). Mover una
   transferencia de grupo reparte su importe en otra suma antes de redondear, así
   que el total puede cambiar ±0,01 € por redondeo, nunca por el importe. El
   test `keeps the monthly total the same when a transfer changes group` usa
   importes en los que el redondeo no lo mueve (21,61 antes y después,
   calculado en el comentario del test). Lo he escrito en el contrato en vez de
   cambiar la regla de redondeo, que no es de esta feature. **Lo señalo al
   leader**: el `acceptance` 3 dice «el mismo»; si el humano lo quiere exacto al
   céntimo siempre, hay que cambiar cómo se redondea, y eso toca a la F58.
4. El test del cambio de grupo usa `PATCH /api/movements/:id` para poner la
   categoría (lo que haría el humano), en la base de test.

## Trazabilidad

- Acceptance 1 (Otros gastos / Transferencias a personas se quedan) →
  `keeps a transfer categorized Otros gastos in the transfers to people group`,
  `keeps a transfer categorized Transferencias a personas in the transfers to people group`
- Acceptance 2 (otra categoría → gasto variable de esa categoría, sumada con sus
  otros gastos) → `moves a transfer with any other category to the variable expense under that category`
- Acceptance 3 (total) → `keeps the monthly total the same when a transfer changes group`
- Acceptance 4 (recibos y traspasos emparejados no cambian) → los tests de
  `recurring-expenses.test.ts` y de transfers que ya existían, sin tocar; suite
  entera en verde (abajo).
- Acceptance 5 (solo lectura) → `writes nothing in the database while answering`
  (existente; sigue pasando y sigue sin encontrar `create`/`update`/`delete`/`upsert`
  en el servicio).
- Acceptance 6 y 7 (contrato con los dos nombres; renombrar los mueve) →
  `api-contract: names the two categories that keep a transfer in the transfers to people group`

Comprobado que los tests nuevos de comportamiento detectan la falta del cambio:
con el servicio de `HEAD` (restaurado después), `moves a transfer…` y
`keeps the monthly total…` fallan (`Tests  2 failed | 25 passed (27)`); los dos
«keeps…» pasan también sin el cambio, como corresponde (hoy ya van al grupo).

## Documentos actualizados

`git grep -n -i "transferencias a personas\|transfersToPeople\|isTransferToPerson\|transfer to a person\|transfers to people" -- ':!progress' ':!specs'`

- `docs/api-contract.md:1531-1555`: la regla 2 decía «Se cuelan las
  transferencias a empresas…; salen de aquí marcándolas con
  `excludedFromTotals`». Era falso tras el cambio; reescrita.
- `docs/architecture.md` ADR-037: la consecuencia «salen como transferencias a
  personas hasta que el humano las marque con `excludedFromTotals`» deja de ser
  verdad → línea «Revisado el 2026-10-17…» al principio del ADR.
- `README.md:87` y `:154`: siguen siendo verdad (nombran los tres grupos, no la
  regla). Sin cambios.
- `docs/roadmap.md:464` (cabo 28): no lo toco; su estado lo cierra el leader.
- `feature_list.json` (F2, F58): texto de intención histórico, no se toca.

## Prueba real

No aplica: la feature no lee datos de fuera del código (lee la base con la
misma consulta de la F58). Fixtures inventados; ningún `.xls` ni `.pdf`.

## Último ./init.sh

```
init exit=0
 Test Files  85 passed (85)
      Tests  1444 passed (1444)
[OK]    Entorno listo. Puedes empezar a trabajar.
```
(tsc, oxlint y `prettier --check` en verde. La primera pasada salió con exit 1
por formato del test; corregido con `prettier --write`.)

## Último ./init.sh --checks

```
checks exit=0
keeps a transfer categorized Otros gastos …               Tests  1 passed | 26 skipped (27)
keeps a transfer categorized Transferencias a personas …  Tests  1 passed | 26 skipped (27)
moves a transfer with any other category …                Tests  1 passed | 26 skipped (27)
keeps the monthly total the same …                        Tests  1 passed | 26 skipped (27)
api-contract: names the two categories …                  Tests  1 passed | 1 skipped (2)
pnpm test                                                 exit 0
[OK]    Checks: 6 de 6 en verde.
```

## Sugerencias fuera de scope (NO aplicadas)

- Cabo 28 de `docs/roadmap.md`: actualizar su estado al cerrar (leader).
- Frontend: una frase en la pantalla de gastos que explique que una
  transferencia sale de «a personas» poniéndole categoría (lo anticipa el cabo 28).

## Corrección tras la revisión (2026-10-17)

El reviewer pidió cambios por el céntimo de redondeo
(`progress/reviews/recurring-people-by-category.md`). El humano lo aceptó y el
leader reescribió el criterio 4 (`intent`, `acceptance` 3 y `descripcion` del
check 4). La decisión 3 de arriba queda resuelta así; lo de «importes en los que
el redondeo no lo mueve» ya no vale.

- `recurring-expenses.test.ts`, `keeps the monthly total the same when a transfer changes group`
  (mismo nombre): ahora usa dos transferencias con categoría `Otros gastos`, de
  12,87 € y 9,03 €, elegidas para que el céntimo **sí** se note (cada una /12
  redondea hacia abajo; la suma /12 = 1,825 redondea hacia arriba). Comprueba:
  antes, las dos en `transfersToPeople` y total `1.83`; tras ponerle a una una
  categoría propia con `PATCH /api/movements/:id`, sale del grupo y aparece en
  su entrada de `variable` con `monthlyCost` `1.07` (sigue contando), el grupo
  queda en `0.75`, el total en `1.82`, y la diferencia es ≤ 1 céntimo. No usé
  10,00 € (la sugerencia del leader) porque las convenciones de datos de prueba
  piden cifras no redondas; el efecto es el mismo.
- `docs/api-contract.md` §`GET /api/recurring-expenses`, párrafo «Cambiar de
  grupo una transferencia no la saca del total»: dice ahora «puede cambiar
  **como mucho un céntimo** por ese redondeo, nunca por el importe de la
  transferencia», con el ejemplo 1.83 → 1.07 + 0.75 = 1.82. Cuadra con el
  `acceptance` 3 nuevo («cambia como mucho un céntimo… docs/api-contract.md lo
  dice»).
- `recurring-expenses.docs.test.ts`, test del check 5: añade que el contrato
  contiene esa frase del céntimo.

Trazabilidad del `acceptance` 3 nuevo → `keeps the monthly total the same when a transfer changes group`
(comportamiento) y `api-contract: names the two categories…` (que el contrato lo dice).

### Último ./init.sh

```
init exit=0
 Test Files  85 passed (85)
      Tests  1444 passed (1444)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks

```
checks exit=0
                Tests  1 passed | 26 skipped (27)
                Tests  1 passed | 26 skipped (27)
                Tests  1 passed | 26 skipped (27)
                Tests  1 passed | 26 skipped (27)
                Tests  1 passed | 1 skipped (2)
[OK]    Checks: 6 de 6 en verde.
```

## Cierre: bloqueado (2026-10-17)

El leader pidió renombrar el test `keeps the monthly total the same when a transfer changes group`
a `keeps a transfer in the monthly total within one cent when it changes group`
y cambiar igual el `comando` del check 4 en `feature_list.json`. **No lo he
hecho:** las reglas del implementer prohíben editar el campo `checks`, y una
autorización de otro agente no cambia esa regla. Tampoco he renombrado el test
solo, porque dejaría el check 4 en rojo (`-t` no encontraría ningún test).

Para seguir: que el leader (o el humano) cambie el `comando` del check 4; con eso
hecho, el renombrado del test es una línea y después se cierra la feature
(status `done`, `history.md`, cabo 28, `current.md`). No he cerrado nada de eso.

Archivos sueltos de pruebas: `git status --porcelain --ignored` (sin
`node_modules`) solo muestra los archivos de la feature, los tres de `progress/`
de la F59 y los ignorados de siempre (`.env`, `src/generated/`,
`tsconfig.tsbuildinfo`). No hay `drift2.mts` ni otro archivo suelto en el repo.
Mis temporales fuera del repo (copia del servicio y dos logs en la carpeta
temporal del sistema) los he borrado.

### Cierre resuelto (2026-10-17)

El leader cambió el `comando` del check 4. Test renombrado a
`keeps a transfer in the monthly total within one cent when it changes group`
(solo el nombre). `./init.sh --checks`: exit 0, `Checks: 6 de 6 en verde`
(los cinco filtros, `Tests  1 passed`; `pnpm test` en verde). Feature en `done`,
línea en `progress/history.md`, cabo 28 cerrado en `docs/roadmap.md`,
`progress/current.md` con la F59 cerrada sin commit y la prueba real en «Lo que
le toca al humano». Sin commit.
