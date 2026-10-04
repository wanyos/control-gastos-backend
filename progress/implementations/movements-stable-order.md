# movements-stable-order — implementación

> Arreglo de un fallo en una feature ya cerrada (F36 `movements-filters-and-totals`),
> encargado en `../docs/handoff-paginacion-estable.md` (parte 1). No es una feature:
> no se ha tocado `feature_list.json` ni `progress/history.md`. Sin commit.
> Fecha: 2026-10-04.

## Archivos modificados / creados

| Archivo | Línea | Qué cambia |
|---|---|---|
| `src/modules/movements/movements.service.ts` | 212-223 | Constante nueva `movementListOrder`: `bookingDate desc`, `daySequence desc nulls last`, `id desc`. Es el único sitio donde se escribe el orden |
| `src/modules/movements/movements.service.ts` | 285 | El `findMany` de la página de `listMovements` (`GET /api/movements`) usa `movementListOrder` en vez del `orderBy` escrito a mano (antes línea 272) |
| `src/modules/movements/movements.service.ts` | 420 | El `findMany` de la respuesta de `bulkUpdateMovements` (`PATCH /api/movements`) usa la misma constante (antes línea 407) |
| `src/modules/movements/movements.test.ts` | 1152-1236 | Dos tests nuevos, dentro del `describe` del listado, justo detrás de `paginates keeping the order…` |
| `docs/api-contract.md` | 675-686 | §`GET /api/movements`: declara `id DESC` como último criterio, dónde van los `daySequence` nulos y la garantía de «cada movimiento una sola vez» |
| `progress/current.md` | sección del arreglo | Una nota de estado del implementer |
| `progress/implementations/movements-stable-order.md` | — | Este informe |

No hay migración ni cambio de esquema. No se ha instalado nada.

## Decisiones tomadas

- **El desempate es `id` DESCENDENTE: decisión del leader, no del humano.** El
  encargo del humano solo dice «lo natural es el `id`», sin sentido. El leader
  eligió descendente al lanzarme y así está hecho. Si el humano prefiere
  ascendente, se cambia una línea (`movements.service.ts:222`) y la aserción del
  primer test.
- **`PATCH /api/movements` (punto 2 del encargo).** Leído `docs/api-contract.md`
  §`PATCH /api/movements` (líneas 841-915 tras el cambio): de la respuesta dice
  solo «`movements`: los movimientos ya cambiados, serializados con la misma
  forma que cada elemento de `movements` en `GET /api/movements`». **No promete
  ningún orden**, así que no hay contradicción con el código y se ha aplicado la
  constante compartida. No he añadido al contrato una promesa de orden para esa
  respuesta: nadie la ha pedido (va en sugerencias).
- **Cómo se aíslan los datos de los tests nuevos.** Los dos movimientos empatados
  están en cuentas distintas, así que no vale filtrar por `accountId` como hacen
  los tests vecinos. Cada test pone en la descripción una palabra aleatoria y
  filtra el listado con `q=<esa palabra>`.
- **El segundo test afirma también el orden completo**, no solo el conjunto de
  ids: lo recibido tiene que ser igual a la lista ordenada por fecha desc,
  `daySequence` desc con los nulos al final, `id` desc. Lo recorre con
  `pageSize` 1, 4 y 7.

## Los tests nuevos

1. `breaks a (bookingDate, daySequence) tie across accounts by id descending`
   (`movements.test.ts:1156`). Dos cuentas, un movimiento en cada una, misma
   `bookingDate` y `daySequence: 1`. Con `pageSize=1`: la página 1 trae el de
   `id` mayor y la 2 el de `id` menor (se afirma qué id sale en cada una).
2. `returns every movement exactly once when walking all the pages over several ties`
   (`movements.test.ts:1182`). Tres cuentas × dos fechas × `daySequence` 1, 2 y
   nulo = 18 movimientos en seis empates de tres. Recorre todas las páginas con
   `pageSize` 1, 4 y 7 y comprueba: sin repetidos, el conjunto de ids es
   exactamente el de los creados, y el orden es el declarado.

Todos los valores son inventados (importes, fechas, descripciones). Ninguno sale
del documento del encargo.

### Salida ANTES del arreglo (los dos en rojo)

Comando: `pnpm exec vitest run src/modules/movements/movements.test.ts -t "tie"`
— código de salida **1**. (El filtro `-t "tie"` coge además tres tests antiguos
cuyo nombre contiene «tie»; por eso salen «3 passed».)

```
 ❯ src/modules/movements/movements.test.ts (91 tests | 2 failed | 86 skipped) 462ms
   ❯ movement routes (read-only) and database indexes (40)
     × breaks a (bookingDate, daySequence) tie across accounts by id descending 129ms
     × returns every movement exactly once when walking all the pages over several ties 118ms

 FAIL  ... > breaks a (bookingDate, daySequence) tie across accounts by id descending
AssertionError: expected [ 61 ] to deeply equal [ 62 ]
 ❯ src/modules/movements/movements.test.ts:1178:58
    1178|     expect(one.movements.map((movement) => movement.id)).toEqual([high…

 FAIL  ... > returns every movement exactly once when walking all the pages over several ties
AssertionError: expected 16 to be 18 // Object.is equality
 ❯ src/modules/movements/movements.test.ts:1230:38
    1230|       expect(new Set(received).size).toBe(received.length)

 Test Files  1 failed (1)
      Tests  2 failed | 3 passed | 86 skipped (91)
EXIT=1
```

Qué dice cada rojo, y qué no:

- **El primero** falla porque sin el arreglo la página 1 trajo el `id` menor. Eso
  demuestra que el orden no era `id` descendente; **por sí solo no demuestra** que
  se repitiera o se perdiera nada (la ejecución se detuvo en esa aserción y no
  llegó a mirar la página 2).
- **El segundo** sí lo demuestra en la base de pruebas: al recorrer las páginas
  llegaron 18 filas pero solo **16 ids distintos**, es decir, dos movimientos
  salieron dos veces y dos no salieron. Con esto queda comprobado lo que el
  leader marcó como no comprobado: PostgreSQL resuelve el empate de forma
  distinta entre la consulta de una página y la de otra, también en la base de
  pruebas. **No he comprobado con cuál de los tres `pageSize`** ocurrió: el test
  se detiene en el primero que falla y la salida no lo dice.

### Salida DESPUÉS del arreglo

Mismo comando — código de salida **0**:

```
 Test Files  1 passed (1)
      Tests  5 passed | 86 skipped (91)
EXIT=0
```

Los cuatro archivos de test del módulo, `pnpm exec vitest run src/modules/movements`
— código de salida **0**:

```
 Test Files  4 passed (4)
      Tests  135 passed (135)
EXIT=0
```

## Documentos actualizados

Comando lanzado: `git grep -n "daySequence DESC\|daySequence desc" -- . ":!progress" ":!specs"`

| Línea | Qué he hecho |
|---|---|
| `docs/api-contract.md:676` | **Corregida**: ahora dice `bookingDate DESC, daySequence DESC, id DESC`, que un `daySequence` nulo va detrás dentro de su fecha, y la garantía de que recorrer las páginas de un filtro devuelve cada movimiento exactamente una vez (mientras no cambien los datos), con la fecha del cambio |
| `docs/data-model.md:384` | No se toca: habla de la consulta del saldo de una cuenta (`accounts.service.ts`), que no ha cambiado |
| `src/modules/movements/movements.service.ts:61` | No se toca: es el comentario de `byMostRecent`, la comparación en memoria del saldo, que no ha cambiado |
| `src/modules/movements/movements.test.ts:743` | No se toca: el nombre del test («orders the same day by daySequence descending») sigue siendo verdad |

Otras menciones de orden en `docs/api-contract.md` (búsqueda de `orden|ordenad`):
la línea 591 (`GET /api/category-rules`, por `id`), la de `POST /api/transfers`
(«en el orden en que llegaron los ids») y la de `GET /api/transfers` (ya declara
su desempate) son de otros endpoints y no hablan de este listado. No hay ninguna
otra mención del orden de `GET /api/movements` en ese archivo.

Fuera de `gastos-backend/`: `../docs/handoff-paginacion-estable.md` tiene la
parte 1 marcada como pendiente en su tabla de estado. Es un archivo del workspace,
no de este proyecto, y no lo he tocado.

## Prueba real

**No la he hecho.** El síntoma se midió bajando las 17 páginas con
`GET /api/movements?page=N&pageSize=100` contra el backend arrancado sobre la
base del humano. Repetir esa medición con este código (solo `GET`, ninguna
escritura) y comprobar que salen tantos ids distintos como `pagination.total`
es lo que demostraría el arreglo sobre los datos reales. Lo que sí está
comprobado es lo de arriba, en la base desechable de los tests.

## Punto 6 — `accounts.service.ts:121` y `:140` (no tocados)

Las dos consultas piden, **dentro de una sola cuenta**, el movimiento con
`balanceAfter` no nulo más reciente: `orderBy bookingDate desc, daySequence desc`,
`take: 1`.

**¿Puede haber empate ahí? El esquema no lo impide.** Leído en
`prisma/schema.prisma` y en las migraciones:

- `Movement` no tiene ningún `@@unique`. `@@index([accountId, bookingDate, daySequence])`
  (`schema.prisma:187`, `Movement_accountId_bookingDate_daySequence_idx` en la
  migración `20260806191700_data_model`) es un índice **normal, no único**.
- El único índice único de la tabla es el parcial escrito en SQL en esa misma
  migración (líneas 106-108): `("accountId", "bookingDate", "type", "amount",
  "description", "daySequence") WHERE "origin" = 'imported'`. Impide dos filas
  idénticas en las **seis** columnas, no dos filas con la misma
  `(accountId, bookingDate, daySequence)`: dos movimientos de la misma cuenta y
  el mismo día con el mismo `daySequence` caben si difieren en tipo, importe o
  descripción, o si alguno es `origin = 'manual'`, o si `daySequence` es nulo
  (PostgreSQL trata los nulos como distintos).
- Si hubiera empate, `take: 1` devolvería una de las dos filas sin criterio
  definido, y su `balanceAfter` es el que entra como punto de partida del saldo.

**Lo que NO he comprobado:** si en los datos existe algún empate así. Que cada
parser numere `daySequence` sin repetir dentro de un archivo (lo dice
`docs/conventions.md`) no lo he ejecutado ni verificado para dos archivos que
solapen el mismo día. Para saberlo haría falta una consulta de solo lectura
sobre la base del humano que agrupe por `accountId, bookingDate, daySequence`
con `balanceAfter` no nulo y cuente los grupos de más de una fila; no la he
lanzado.

Una diferencia más, vista al leer: esas dos consultas escriben
`{ daySequence: 'desc' }` sin `nulls: 'last'`. En PostgreSQL un `DESC` sin más
pone los nulos **primero**, así que un movimiento con `balanceAfter` y
`daySequence` nulo ganaría a los numerados de su mismo día. No he comprobado si
existe alguna fila así.

## Último ./init.sh

`./init.sh` completo, lanzado después del arreglo y del cambio del contrato —
código de salida **0**:

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ───────────────────────────────────
[OK]    OK: pnpm run lint
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  76 passed (76)
      Tests  1349 passed (1349)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Este informe y la nota de `progress/current.md` se escribieron **después** de esa
pasada. Sobre ellos he relanzado solo `pnpm exec vitest run src/no-real-data.test.ts`
(el resultado está al final de este archivo); no he vuelto a lanzar `./init.sh`
entero tras escribirlos.

## Sugerencias fuera de scope (NO aplicadas)

- **`accounts.service.ts:121` y `:140`**: añadir `id` como último criterio y
  decidir dónde van los `daySequence` nulos, por lo descrito en el punto 6.
  Cambia qué fila da el saldo en caso de empate, así que necesita decisión.
- **`byMostRecent` (`movements.service.ts:62`)**, la ordenación en memoria que
  elige el movimiento con saldo más reciente, devuelve 0 en un empate de
  `(bookingDate, daySequence)`: mismo tipo de indefinición que el punto 6.
- **`docs/api-contract.md` §`PATCH /api/movements`** no dice en qué orden vienen
  los `movements` de la respuesta. Hoy salen en el mismo orden que el listado; si
  el frontend va a depender de ello, convendría declararlo.
- **`../docs/handoff-paginacion-estable.md`**: marcar la parte 1 como hecha
  cuando el reviewer apruebe (archivo del workspace, lo decide el leader).

## Comprobación de datos reales sobre este informe

`pnpm exec vitest run src/no-real-data.test.ts`, lanzado con este informe ya
escrito — código de salida **0**:

```
 Test Files  1 passed (1)
      Tests  36 passed (36)
EXIT=0
```
