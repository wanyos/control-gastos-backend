# Requirements — F60 `category-origin-and-rule-reapply`

> Fuente de verdad: el `intent` de la feature 60 en `feature_list.json`.
> Los nombres `categorySource` y sus valores `manual` / `rule` / `closing` son
> **propuesta pendiente de aprobación** (`decisions.md` 🔴 1). Si el humano los
> cambia, se sustituyen aquí, en `design.md` y en `tasks.md` sin cambiar nada más.
>
> Vocabulario de este archivo:
> - **pasada de categorización**: `applyCategoryRules` de
>   `src/modules/category-rules/category-rules.service.ts` (feature 43).
> - **paso de cierre**: `confirmAllMovements` de
>   `src/modules/movements/movements.service.ts`, que corre al final de cada
>   importación (`closeImportedMovements`) y en `POST /api/movements/confirm-all`.
> - **alcance de siempre**: movimientos con `categoryId` `null`, `status`
>   `pending_review` y `type` `expense` o `income`.
> - **alcance ampliado**: el alcance de siempre **más** los movimientos con
>   `categorySource` `closing` y `type` `expense` o `income`.

## R1
El sistema DEBE devolver en cada movimiento serializado (`serializeMovement`: `GET /api/movements`, `PATCH /api/movements/:id`, `PATCH /api/movements`) el campo `categorySource`, con valor `"manual"`, `"rule"` o `"closing"` cuando `categoryId` no es `null`, y `null` cuando `categoryId` es `null`.

## R2
CUANDO `PATCH /api/movements/:id` escribe un `categoryId` numérico, el sistema DEBE guardar `categorySource` `manual` en ese movimiento, también si el `categoryId` enviado es el que ya tenía.

## R3
CUANDO `PATCH /api/movements` escribe un `categoryId` numérico, el sistema DEBE guardar `categorySource` `manual` en todos los movimientos de `ids`, en la misma operación atómica.

## R4
CUANDO `PATCH /api/movements/:id` o `PATCH /api/movements` escribe `categoryId: null`, el sistema DEBE guardar `categorySource` `null` en esos movimientos.

## R5
CUANDO el paso de cierre pone `Otros gastos` / `Otros ingresos` (o las categorías que traiga `POST /api/movements/confirm-all`) a un movimiento sin categoría, el sistema DEBE guardar `categorySource` `closing` en ese movimiento.

## R6
CUANDO la pasada de categorización escribe una categoría en un movimiento, el sistema DEBE guardar `categorySource` `rule` en ese mismo `UPDATE`.

## R7
CUANDO `POST /api/category-rules` crea una regla, el sistema DEBE ejecutar la pasada de categorización con el alcance ampliado y devolver su resultado (la forma `CategorizationResult`, con `categorizedMovements`) en el campo `categorization` de la respuesta 201, junto a los campos de la regla.

## R8
CUANDO `PATCH /api/category-rules/:id` cambia una regla, el sistema DEBE ejecutar la pasada de categorización con el alcance ampliado y devolver su resultado en el campo `categorization` de la respuesta 200, junto a los campos de la regla.

## R9
SI un movimiento tiene `categorySource` `manual` o `rule` ENTONCES ninguna pasada de categorización (al crear o cambiar una regla, con `POST /api/category-rules/apply` o en la importación) DEBE cambiar su `categoryId` ni su `categorySource`.

## R10
SI un movimiento del alcance ampliado casa con reglas de dos o más categorías distintas ENTONCES el sistema NO DEBE escribirle nada: conserva su `categoryId` y su `categorySource`, y sale en `conflicts` del resultado.

## R11
CUANDO se borra una regla con `DELETE /api/category-rules/:id`, el sistema NO DEBE cambiar el `categoryId` ni el `categorySource` de ningún movimiento.

## R12
MIENTRAS la pasada de categorización corre dentro de una importación o con `POST /api/category-rules/apply`, el sistema DEBE limitarla al alcance de siempre, como hasta ahora.

## R13
CUANDO la pasada de categorización recoloca un movimiento, el sistema NO DEBE cambiar ninguna columna de ese movimiento salvo `categoryId`, `categorySource` y `updatedAt`, y los `totals` de `GET /api/movements` DEBEN quedar idénticos.

## R14
CUANDO se aplica la migración de datos de esta feature, el sistema DEBE dejar `categorySource` `closing` en los movimientos cuya categoría es la raíz `Otros gastos` de `kind` `expense` o la raíz `Otros ingresos` de `kind` `income`, `manual` en el resto de movimientos con categoría, y `null` en los movimientos sin categoría, sin escribir `updatedAt` ni ninguna otra columna.

## R15
El sistema DEBE describir en `docs/api-contract.md` el campo `categorySource` del movimiento con sus tres valores y quién escribe cada uno, y qué recoloca una regla al crearla o cambiarla (los movimientos `closing` y los pendientes sin categoría) y qué no (los `manual` y los `rule`; borrar una regla no toca nada).

---

## Cobertura del `como_se_que_esta_bien`

| Frase del intent | Requirements |
|---|---|
| «Si creo una regla, los movimientos que ya estaban en Otros gastos (u Otros ingresos) y la cumplen pasan a la categoría de la regla.» | R7, R8, R14 |
| «Un movimiento al que le puse yo la categoría a mano no cambia nunca por una regla, ni nueva ni cambiada.» | R2, R3, R9 |
| «Cada movimiento dice de dónde salió su categoría: a mano, por una regla o por el cierre.» | R1, R2, R3, R4, R5, R6, R14 |
| «Lo que ya funciona sigue igual: la importación aplica las reglas y cierra lo que queda; las sumas no cambian por recolocar categorías.» | R5, R12, R13 |
| «docs/api-contract.md dice qué recoloca una regla y qué no, y cómo se ve de dónde salió la categoría.» | R15 |

## Procedencia

- R1 — (humano) Sale de «cada movimiento dice de dónde salió su categoría: a mano, por una regla o por el cierre». El nombre del campo y de sus valores es propuesta (delegado en la práctica, pero es vocabulario: ← REVISAR EN APROBACIÓN, `decisions.md` 🔴 1).
- R2 — (humano) Sale de «si la puse yo a mano». **(añadido) la parte «también si el `categoryId` enviado es el que ya tenía»**: el humano no lo dijo; propongo que cualquier escritura a mano de una categoría la proteja, aunque no cambie, porque es lo que menos riesgo tiene de que una regla pise algo elegido a mano. ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 6).
- R3 — (humano) La edición en bloque es también una categoría puesta a mano. Misma frase que R2.
- R4 — (añadido) El humano no dijo qué origen tiene un movimiento al que se le quita la categoría. Propongo `null`: sin categoría no hay origen. Consecuencia menor (ese movimiento, si está confirmado, ninguna regla lo vuelve a mirar, como hoy).
- R5 — (humano) Sale de «o si la puso el cierre». Que `POST /api/movements/confirm-all` cuente igual que el cierre es (delegado): usa la misma función y hace lo mismo, rellenar lo que quedó sin categoría.
- R6 — (humano) Sale de «si la puso una regla».
- R7 — (humano) Sale de «al crear o cambiar una regla, se aplique también a los movimientos que ya están en esa categoría genérica». **(delegado)** «si recolocar se hace sola o al pedirlo, y cómo se informa»: decido que se hace sola, en la misma petición que crea la regla, y que la respuesta trae la lista de movimientos cambiados con la forma que ya tiene `POST /api/category-rules/apply` (feature 56). Corre **todas** las reglas, no solo la nueva, para que un choque entre dos reglas se detecte igual que en la importación (`decisions.md` 🔴 3).
- R8 — (humano) Misma frase que R7, para «cambiar». Misma decisión delegada.
- R9 — (humano) Para `manual`: «Un movimiento al que le puse yo la categoría a mano no cambia nunca por una regla» y «Que una regla pise una categoría que puse yo a mano» (restricción que no se negocia). Para `rule`: **(delegado)** «si cambiar o borrar una regla debe recolocar también lo que esa misma regla categorizó antes»: decido que **no**; lo que categorizó una regla se queda donde está (`decisions.md` 🔴 4).
- R10 — (delegado) «Qué pasa cuando un movimiento de la categoría genérica cumple reglas de dos categorías distintas»: decido lo mismo que la feature 43 para un pendiente, no se escribe y sale en `conflicts`; se queda en la genérica (`decisions.md` 🔴 5).
- R11 — (delegado) La parte «borrar» de la misma pregunta que R9: borrar una regla sigue sin tocar ningún movimiento, como hoy (feature 43, R5).
- R12 — (humano) Sale de «lo que ya funciona sigue igual: la importación aplica las reglas y cierra lo que queda». Que `POST /api/category-rules/apply` también conserve su alcance es (delegado): no lo pidió nadie y ampliar su alcance cambiaría el número `unmatched` que ya enseña el frontend.
- R13 — (humano) Sale de «las sumas no cambian por recolocar categorías» y de «que cambie ninguna suma ni ningún importe: solo cambia la categoría».
- R14 — (delegado) «Qué origen se les da a los movimientos que ya tienen categoría hoy, cuando no se sabe quién se la puso». Medido en la base real con consultas de solo lectura (`design.md` §8): no se puede saber; elijo `closing` para las dos genéricas (sin eso, la feature no sirve para lo que ya está en Otros gastos, que es lo que pide el intent) y `manual` para todo lo demás (lo que menos riesgo tiene de que una regla pise algo puesto a mano) (`decisions.md` 🔴 2).
- R15 — (humano) Sale de «docs/api-contract.md dice qué recoloca una regla y qué no, y cómo se ve de dónde salió la categoría».
