# deposit-totals-interest-only — implementación

## Lote B — implementación

No se ha escrito nada en la base de datos del humano ni en sus carpetas: la
migración no se ha aplicado con `prisma migrate`; su SQL solo se ha ejecutado en
el test, contra la base desechable del worker.

### Archivos modificados / creados

- `prisma/migrations/20261016120000_deposit_movements_unmark/migration.sql` (nuevo):
  solo el `UPDATE` de `design.md` §5, con un comentario que remite a
  `src/modules/myinvestor/myinvestor.deposit-maturity.ts`
  (`classifyMyinvestorDepositMovement`). Sin cifras ni textos de la base del humano.
  No escribe `updatedAt` ni ninguna otra columna.
- `src/modules/movements/movements.deposit-unmark-migration.test.ts` (nuevo): lee
  `migration.sql` y lo lanza con `$executeRawUnsafe` sobre filas sembradas en la base
  desechable.
- `src/modules/movements/movements.deposits.docs.test.ts` (nuevo): test del contrato
  (R16), con el patrón de `category-rules.docs.test.ts`.
- `docs/api-contract.md`, `docs/data-model.md`, `docs/architecture.md`.
- `README.md` (línea 81) y comentarios de `prisma/schema.prisma`: ampliación del lote
  autorizada por el leader (ver «Documentos actualizados»).
- `specs/57-deposit-totals-interest-only/tasks.md`: `[x]` en T11–T15, nada más.

### Decisiones tomadas

- **Test de la migración:** además de las cinco filas de `design.md` §5 (apertura,
  cancelación y vencimiento marcados de `myinvestor`; un movimiento marcado que no es
  de depósito; un movimiento con descripción de depósito en una cuenta de otro banco),
  siembra una sexta: un texto de apertura con `type` `income`, que tiene que seguir
  marcado porque R1 exige el `type`. La cancelación lleva espacios iniciales, para
  probar el `ltrim`. Comprueba además que, salvo `excludedFromTotals`, ninguna columna
  de las seis filas cambia (`updatedAt` incluido). Importes y descripciones inventados
  (`PRUEBA SINTETICA`).
- **Contrato (`design.md` §8):** sección nueva «Movimientos de depósito en las sumas»
  (`####` dentro de `GET /api/movements`), tabla de claves de `deposit` y un bloque
  `json` con una apertura, una cancelación, un vencimiento con capital y uno dudoso
  (cifras inventadas). Además he corregido las frases que la feature vuelve falsas:
  - la fila `excludedFromTotals` de `Movement` y la fila `excluded` del listado;
  - el párrafo de exclusiones de `totals`, y la frase «con `transfer=only` o
    `excluded=only` los `totals` salen siempre a `"0.00"`», que deja de ser cierta si
    el filtro deja un vencimiento con capital;
  - `PATCH /api/movements`, `PATCH /api/movements/:id`, `POST /api/transfers` y
    `GET /api/transfers` decían «la misma forma que cada elemento de `movements` en
    `GET /api/movements`»: ahora dicen «salvo `deposit`» (`design.md` §4: `deposit`
    solo viaja en `GET /api/movements`);
  - los dos `PATCH`: «los `totals` solo cambian al escribir `excludedFromTotals`»,
    ahora con la excepción de los movimientos de depósito;
  - `DELETE /api/transfers/:transferId`: lo que vuelve a sumar una pierna de depósito;
  - `GET /api/overview`: `period.totals` sigue la misma regla;
  - `GET /api/investments/deposits`: la nota final decía que lo que generan los
    depósitos «no entra en las sumas de ingresos»; ahora dice que sí entra desde la
    F57, por su propia regla, y que este endpoint no cambia. También he quitado
    «para no sumar» de «un vencimiento marcado se encuentra igual».
- **`docs/architecture.md`:** ADR-035 nuevo. Como la feature cambia la regla de
  suma del ADR-011 (decisión 2, `transferId`) y del ADR-012 (regla 5, `productId`)
  para los movimientos de depósito, he añadido arriba de cada uno la línea «Revisado
  el 2026-10-16 por la feature 57…», sin reescribirlos (AGENTS.md §3). El árbol de
  §estructura lista `investments/` por archivo: he añadido
  `investments.deposit-movements.ts`.
- **`docs/data-model.md`:** párrafo nuevo en §Totales globales y una aclaración en el
  comentario de `excludedFromTotals` del bloque Prisma. **No hay columnas nuevas**
  (la migración es solo `UPDATE`), así que la lección #2 no pide tocar la tabla de
  columnas reservadas, el diagrama ER ni las claves naturales; este lote no toca
  `prisma/schema.prisma`.
- **No he escrito en los documentos recuentos de filas** ni «hoy ningún movimiento de
  depósito tiene `productId`»: lo midió el spec-author y yo no lo he comprobado.

### Trazabilidad (solo este lote)

- R14 → `the deposit unmark migration unmarks the deposit movements and leaves any other mark`
  (`src/modules/movements/movements.deposit-unmark-migration.test.ts`)
- R16 → `api-contract: describes how each kind of deposit movement counts, the deposit field, the ambiguous ones and excludedFromTotals`
  (`src/modules/movements/movements.deposits.docs.test.ts`)
- R9, R15 (la parte de documentación, T15) → `docs/data-model.md` §Totales globales y
  ADR-035; el comportamiento lo cubren los tests del Lote A.

### Documentos actualizados

Lanzado (fuera de `progress/` y `specs/`):

```
git grep -n -i -E "ninguna suma|no entra|no suma|incoherencia|excludedFromTotals.*(dep|DEP)|INTERESES DEP|APERTURA DEP|CANCELACION DEP" -- . ':!progress' ':!specs' ':!src'
git grep -n -i -E "excludedFromTotals|totales|totals" -- docs/data-model.md docs/architecture.md README.md docs/roadmap.md docs/myinvestor-product-files.md
git grep -n -E "excludedFromTotals.*(saca|sumas|totals)|marked this movement as not counting" -- README.md prisma/schema.prisma docs/myinvestor-product-files.md docs/roadmap.md
```

Más la lectura de cada sección del contrato que nombra `excludedFromTotals`,
`totals` o «la misma forma que … `GET /api/movements`». Corregido en mis archivos:
todo lo listado en «Decisiones tomadas».

**Ampliación del lote, autorizada por el leader el 2026-10-16.** Estas dos líneas
estaban fuera de la cabecera `Archivos:` de los dos lotes; las devolví como bloqueo y
el leader amplió el Lote B a ellas:

- `README.md:81`: la fila de `PATCH /api/movements/:id` decía «`true` saca el
  movimiento de las sumas de ingresos y gastos». Ahora añade «salvo en un movimiento de
  depósito, donde la marca no cambia lo que suma: feature 57».
- `prisma/schema.prisma`: **solo comentarios**. Una línea en el de `productId` (no se
  aplica a un movimiento de depósito) y tres en el de `excludedFromTotals` (en un
  movimiento de depósito la marca se guarda pero no cambia lo que suma, y la migración
  `20261016120000_deposit_movements_unmark` quitó esas marcas). `git diff` del archivo:
  4 líneas añadidas, todas `//`, ninguna quitada. Comprobado que no genera ninguna
  migración: `pnpm exec prisma migrate diff --from-schema <schema.prisma de HEAD> --to-schema prisma/schema.prisma --script`
  → `-- This is an empty migration.`, exit 0.

Después de la ampliación (sin relanzar `./init.sh` completo, como pidió el leader):
`pnpm run format:check` → «All matched files use Prettier code style!», exit 0; los dos
comandos de `checks` de este lote → `Tests  1 passed (1)`, exit 0 cada uno.

Leído y sin cambios:

- `docs/myinvestor-product-files.md:159-163` habla solo de
  `GET /api/investments/deposits` (F50), que no cambia: lo he leído y sigue siendo
  cierto.

### Prueba real

No aplica a este lote: la migración no lee datos de fuera del código, y no se puede
aplicar a la base del humano (instrucción del leader). La prueba con sus datos
(`decisions.md` 🧪) es suya, tras `prisma migrate deploy`.

### Último ./init.sh

`./init.sh` completo, 2026-10-16: **exit 1**. Type check en rojo y 5 tests rotos
(1386 pasan), en archivos del Lote A, todavía en curso; ninguno es de este lote:

- `tsc`: `src/modules/investments/investments.deposits.test.ts(22,3)` y `(23,3)`:
  falta `classifyDepositMovement` en el matcher del test (tipo nuevo de T2).
- `movements.test.ts` › «keeps the serialized shape of each movement exactly as it
  was (feature 36)»: recibe la clave `deposit` nueva (T6).
- `investments.routes.test.ts` (4 tests): `Connection terminated unexpectedly`; y tres
  archivos (`retired-routes.docs.test.ts`, `myinvestor.statement.parser.test.ts`,
  `trade-republic.product.parser.test.ts`) en rojo por filas dejadas en la base del
  worker. Lanzados solos, esos tres pasan (3 archivos, 104 tests). Puede ser la
  pasada de la suite del Lote A corriendo a la vez sobre las mismas bases
  `gastos_test_<n>`; **no lo he comprobado**: haría falta relanzar `./init.sh` con un
  solo implementer activo.
- La comprobación de la base del humano no dio aviso en esa pasada.

Mis tests, lanzados solos (después de `prettier --write`):

```
pnpm exec vitest run src/modules/movements/movements.deposit-unmark-migration.test.ts -t "the deposit unmark migration unmarks the deposit movements and leaves any other mark" | grep -E "Tests +1 passed"
      Tests  1 passed (1)        exit=0
pnpm exec vitest run src/modules/movements/movements.deposits.docs.test.ts -t "api-contract: describes how each kind of deposit movement counts, the deposit field, the ambiguous ones and excludedFromTotals" | grep -E "Tests +1 passed"
      Tests  1 passed (1)        exit=0
```

`oxlint` y `prettier --check` sobre mis dos tests: limpios. `src/no-real-data.test.ts`
no marca ninguno de mis archivos; en la última pasada marcó una línea del Lote A:
`src/modules/overview/overview.test.ts:367 — an amount on this line is in the database`.

### Último ./init.sh --checks

No lanzado entero: 9 de los 11 checks dependen de tests del Lote A que aún no están.
Los dos de este lote, arriba, en verde.

### Sugerencias fuera de scope (NO aplicadas)

- El árbol de §estructura de `docs/architecture.md` está desfasado en `movements/`
  («solo GET /», «sin *.schema.ts») e `investments/` («CARPETA PARCIAL», sin
  `investments.service.ts`). No lo vuelve falso esta feature; se podría poner al día
  aparte.

### Corrección tras la review (2026-10-16, CHANGES_REQUESTED)

Lo que pidió `progress/reviews/deposit-totals-interest-only.md`, en `docs/api-contract.md`:

- Fila `excludedFromTotals` del body de `PATCH /api/movements` y de
  `PATCH /api/movements/:id`: añadido «**Desde la feature 57, salvo en un movimiento de
  depósito, donde la marca se guarda pero no cambia lo que suma**», con el enlace a
  §Movimientos de depósito en las sumas.
- Nota de traspasos de `### Movement`: las dos piernas no cuentan en los totales
  «salvo, desde la feature 57, una pierna que sea un movimiento de depósito», que suma
  su `deposit.countedAmount`.

Búsqueda de otras frases con la misma afirmación:
`git grep -n -E "marcad|saca|los saca|no cuenta|fuera de las sumas|no inflan|deja fuera|dejan fuera|quedan fuera|traspaso.*(totales|sumas)" -- docs/api-contract.md`
y lectura de cada línea. Dos más corregidas:

- Informe de `POST /api/import`, campo `transfers`: «los `totals` de `GET /api/movements`
  las dejan fuera de `income` y `expense`» → misma salvedad para una pierna de depósito.
- Entrada de la feature 49 en `GET /api/movements`: «los `totals` dejan fuera también los
  movimientos marcados» → «(desde la feature 57, salvo los movimientos de depósito: ver
  el párrafo siguiente)».

Las demás que devuelve ya llevaban la salvedad en la misma fila o en el párrafo
siguiente (fila `excludedFromTotals` de `Movement`, exclusiones de `totals`,
`DELETE /api/transfers/:transferId`, `GET /api/overview`), o no hablan de las sumas.

Test ajustado: `movements.deposits.docs.test.ts` comprueba ahora también la salvedad
en las dos filas de los `PATCH` y en la nota de traspasos. Pasa con el contrato
corregido. Con `docs/api-contract.md` devuelto a su versión de `HEAD` (con `git stash`)
falla, pero en esa versión falta también todo lo demás del lote B, así que eso no
demuestra que fallen precisamente las aserciones nuevas. No he probado cada una por
separado.

Tras la corrección, sin nadie más ejecutando la suite:

- `./init.sh` → exit 0: `Type check OK`, `OK: pnpm run lint`,
  `OK: pnpm run format:check`, `Test Files 81 passed (81)`, `Tests 1392 passed (1392)`,
  `Entorno listo`.
- `./init.sh --checks` → exit 0, `Checks: 11 de 11 en verde.`

## Lote A — implementación

No se ha escrito nada en la base de datos del humano ni en sus carpetas: todos los
tests de este lote siembran y borran sus filas en la base desechable del worker.

### Archivos modificados / creados

- `src/modules/myinvestor/myinvestor.deposit-maturity.ts`: nueva
  `classifyMyinvestorDepositMovement` (una sola lista de los tres prefijos);
  `isMyinvestorDepositMaturity` pasa a llamarla.
- `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts`: tests de la clasificación.
- `src/modules/investments/investments.types.ts`: `DepositMovementKind`,
  `DepositAmbiguityReason`, `DepositMovementInput`, `DepositProductInput`,
  `DepositMovementReading`; `classifyDepositMovement` en `DepositMaturityMatcher`.
- `src/modules/investments/investments.deposit-movements.ts` (nuevo):
  `resolveDepositMovements`, pura (sin base de datos, sin nombre de banco).
- `src/modules/investments/investments.deposit-movements.test.ts` (nuevo): 16 tests de la pura.
- `src/modules/investments/investments.service.ts`: `readDepositMovements` (solo `findMany`).
- `src/app.ts`: la entrada `myinvestor` del registro de vencimientos gana
  `classifyDepositMovement`; el registro se pasa también a `movementsRoutes` y `overviewRoutes`.
- `src/modules/movements/movements.types.ts`: `TotalsMovement.id`, `SerializedDeposit`,
  `ListedMovement`; `MovementListResponse.movements` es `ListedMovement[]`.
- `src/modules/movements/movements.service.ts`: `computeTotals(movements, deposits)`;
  `listMovements(prisma, query, matchers)` añade `deposit` a cada fila.
- `src/modules/movements/movements.routes.ts`: opción `depositMaturityMatchers`.
- `src/modules/movements/movements.deposits.test.ts` (nuevo): los 9 tests HTTP de T8.
- `src/modules/movements/movements.test.ts`: los tests directos de `computeTotals` llevan
  `id` y `new Map()`; un test nuevo de `computeTotals` con el mapa; la lista de claves
  del movimiento serializado gana `deposit`.
- `src/modules/overview/overview.service.ts`, `overview.routes.ts`: mismo registro;
  `computeTotals` con el mapa.
- `src/modules/overview/overview.test.ts`: test de R13.
- `specs/57-deposit-totals-interest-only/tasks.md`: `[x]` en T1–T10.
- **No tocados:** `src/modules/movements/movements.schema.ts` ni
  `src/modules/movements/movements.exclusion.test.ts` (ver Decisiones).

### Decisiones tomadas

- **`movements.schema.ts` no cambia.** `design.md` §1 pedía añadir `deposit` al esquema
  de respuesta «si no, Fastify lo quita al serializar»; `GET /api/movements` **no tiene
  esquema de respuesta** (solo `querystring`), así que nada quita el campo. Comprobado
  ejecutando: los tests de `movements.deposits.test.ts` leen `deposit` de la respuesta
  HTTP y pasan. Añadir un esquema de respuesta entero sería una decisión nueva.
- **El tipo de las tres clases se declara también en el módulo del banco**
  (`MyinvestorDepositMovementKind = 'opening' | 'cancellation' | 'maturity'`), no se
  importa de `investments.types.ts`: el test `shares no parsing code between bank modules`
  de `src/architecture.test.ts` no deja a un módulo de banco importar de `../investments/`,
  y el de «sin la palabra prisma» tampoco deja nombrar la carpeta de migraciones en su
  comentario. Por estructura es el mismo tipo que `DepositMovementKind`.
- **`movements.exclusion.test.ts` no llama a `computeTotals`** (comprobado con
  `git grep`): no había llamada que ajustar.
- Los tests de la clasificación prueban espacios iniciales y no un tabulador: es lo que
  dice R1 («sin los espacios iniciales»). Ver la sugerencia del final.
- Un vencimiento con producto quita la apertura más antigua de su capital **si la hay**;
  si no la hay, el capital sigue siendo cierto (`design.md` §3a).

### Ampliación autorizada: un archivo fuera de los dos lotes

**Resuelto.** El leader amplió el Lote A a
`src/modules/investments/investments.deposits.test.ts` para este arreglo. Se añadió
`classifyDepositMovement: () => null` a la entrada `synthbank` y
`classifyDepositMovement: classifyMyinvestorDepositMovement` a la entrada `myinvestor`
del registro de prueba, más su import. Ningún test cambia lo que comprueba. Lo que había
antes del arreglo:

`pnpm run typecheck` estaba **rojo** por un archivo que no era de ningún lote:

```
src/modules/investments/investments.deposits.test.ts(22,3): error TS2741: Property 'classifyDepositMovement' is missing in type '{ bank: string; isDepositMaturity: (text: string) => boolean; }' but required in type 'DepositMaturityMatcher'.
src/modules/investments/investments.deposits.test.ts(23,3): error TS2741: Property 'classifyDepositMovement' is missing in type '{ bank: string; isDepositMaturity: (description: string) => boolean; }' but required in type 'DepositMaturityMatcher'.
```

Es la consecuencia directa de la firma de `design.md` §2 (`classifyDepositMovement`
obligatorio en `DepositMaturityMatcher`): el registro de prueba de la F50 no lo lleva. Lo
que haría falta, en las líneas 22-23 de ese archivo: añadir
`classifyDepositMovement: () => null` a la entrada `synthbank` y
`classifyDepositMovement: classifyMyinvestorDepositMovement` (importado de
`../myinvestor/myinvestor.deposit-maturity.js`) a la entrada `myinvestor`. No lo he
tocado porque no está en la cabecera `Archivos:` del Lote A. Vitest no comprueba tipos,
así que la suite pasa entera; lo único rojo de `./init.sh` es el paso de tipos.

### Trazabilidad

- R1 → los 5 tests de `classifyMyinvestorDepositMovement (feature 57, R1)` en
  `myinvestor.deposit-maturity.test.ts`; `a deposit text with an unexpected type is not a deposit movement (R1)`
  y `a movement of a bank without matcher or with another text is not a deposit one (R1)`
  (pura); `returns deposit null on a movement that is not a deposit one` (HTTP).
- R2 → `counts a deposit opening and cancellation as zero in the totals`;
  `counts a deposit movement only by its reading, ignoring the mark, transferId and productId` (unitario).
- R3 → `counts a deposit maturity only by its interest over the principal of its product file`;
  `takes the principal of a maturity without product file from the earlier opening not yet returned`;
  `computes the deposit rule over the whole history and not only over the filtered month`.
- R4 → `takes the principal of a maturity from its product file (R4)`,
  `ignores a product file of another bank or another day (R4)` (pura);
  `counts a deposit maturity only by its interest over the principal of its product file` (HTTP).
- R5 → `takes the principal from the earlier opening not yet returned (R5, R6)`,
  `takes an opening of the same day only when it comes before the maturity`,
  `a later opening of the same day is not a candidate even when it is the only one`,
  `lets the amount condition pick one of two openings of different amounts (R5)` (pura);
  `takes the principal of a maturity without product file from the earlier opening not yet returned`,
  `computes the deposit rule over the whole history and not only over the filtered month` (HTTP).
- R6 → `a cancellation returns its opening, which then serves no maturity (R6)`,
  `a maturity with a product file returns the oldest opening of its principal (R6)` (pura);
  segunda mitad de `takes the principal of a maturity without product file from the earlier opening not yet returned` (HTTP).
- R7 → `marks principal_not_found when there is no opening and no product file (R7, R11)`,
  `an ambiguous maturity returns no opening (R7)` (pura);
  `marks a maturity whose principal is not certain as ambiguous counting zero with reason and candidates` (HTTP).
- R8 → `marks a cancellation with no opening of its amount as opening_not_found (R8)` (pura).
- R9 → `counts a deposit maturity marked excludedFromTotals by its interest` (HTTP);
  `counts a deposit movement only by its reading, ignoring the mark, transferId and productId` (unitario).
- R10 → `keeps the bank amount and type of every deposit movement in the listing`;
  `returns deposit null on a movement that is not a deposit one`;
  `counts a deposit maturity only by its interest over the principal of its product file`
  (el objeto `deposit` entero); `keeps the serialized shape of each movement exactly as it was (feature 36)`.
- R11 → `marks several_principals with the ascending ids when two amounts meet the condition (R11)`,
  `marks several_principals with no ids when two product files mature that day (R4, R11)` (pura);
  `marks a maturity whose principal is not certain as ambiguous counting zero with reason and candidates` (HTTP).
- R12 → `keeps the bank amount and type of every deposit movement in the listing`
  (en la respuesta y en las filas de la base).
- R13 → `period totals of GET /api/overview apply the deposit rule` (además compara con los
  `totals` de `GET /api/movements` del mismo mes y cuenta).
- R14 → Lote B.
- R15 → `counts a deposit maturity added after the first read without any other action`.
- R16 → Lote B.
- T10 (`GET /api/net-worth` no cambia) → `net-worth.test.ts` sin tocar, en verde dentro de `pnpm test`.

### Documentos actualizados

```
git grep -n "computeTotals\|isMyinvestorDepositMaturity\|isDepositMaturity\|DepositMaturityMatcher\b\|listMovements(\|getOverview(" -- ':!progress' ':!specs' ':!src'
```

Salen `docs/architecture.md` (792 y 925: ADR antiguos, no se reescriben; 3030: el ADR
nuevo del Lote B, ya con la firma nueva), `docs/data-model.md` (64, 418, 437, 1114: del
Lote B; 437 ya describe la regla nueva), `docs/roadmap.md` (330 y 441: el cabo 8, ya
cerrado) y `feature_list.json` (texto de features cerradas). Ninguna línea que corregir
fuera de los archivos del Lote B.

Dentro de `src/` (`git grep -n "computeTotals\|single sum" -- src ':!*.test.ts'`) solo salen
los dos servicios tocados. Comentarios puestos al día en este lote: el de `computeTotals`,
`getOverview`, `listMovements`, `movementsRoutes`, el del registro en `src/app.ts`, el de
`isMyinvestorDepositMaturity` y el de `TotalsMovement.excludedFromTotals`.

### Prueba real

No aplica en el sentido de `CHECKPOINTS.md §C4 bis`: la feature no lee ningún archivo del
humano; lee su base de datos. La prueba con sus datos (octubre de 2026 y los meses
anteriores, por `GET /api/movements`) la hace él tras aplicar la migración, como dice
`decisions.md` 🧪. No la he hecho: exigiría arrancar el servidor contra su base, y la
migración del Lote B escribe en ella.

### Último ./init.sh

Exit 0, tras la ampliación de arriba:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  81 passed (81)
      Tests  1392 passed (1392)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Una pasada anterior salió con 3 fallos en `net-worth.test.ts` (y 26 archivos rojos en el
check 11), todos con `terminating connection due to administrator command` /
`Connection terminated unexpectedly`. No lo he comprobado, pero la causa probable es otra
pasada de la suite lanzada a la vez (la del Lote B), que vuelve a preparar las mismas bases
desechables. Repetida sola, verde. Otra pasada anterior marcó una cifra inventada de
`overview.test.ts:367` en `src/no-real-data.test.ts`: se inventaron otras.

### Último ./init.sh --checks

Exit 0, tras la ampliación. `[OK] Checks: 11 de 11 en verde.`

### Sugerencias fuera de scope (NO aplicadas)

- `classifyMyinvestorDepositMovement` quita cualquier blanco inicial (`trimStart`, como ya
  hacía la F50) y el SQL de la migración solo espacios (`ltrim`). Con un tabulador inicial
  dirían cosas distintas; por R9 la suma no cambiaría, solo el filtro `excluded=only`. No he
  comprobado si hay alguna descripción así en la base.
- Dos implementers lanzando la suite a la vez pueden tumbarse las bases desechables el uno al
  otro: en lotes en paralelo convendría que solo uno lance `./init.sh` completo a la vez.
