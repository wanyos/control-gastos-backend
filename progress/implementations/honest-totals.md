# honest-totals — implementación

## Lote C — implementación

> Implementer del lote C (T17, T18), 2026-09-27. En paralelo con el lote A.

### Archivos modificados / creados

- `docs/api-contract.md`
  - §`Movement`: fila nueva `excludedFromTotals` (qué hace, que no cambia importe
    ni saldo, que nace `false`, quién la escribe, que es independiente de
    `transferId`). La nota de traspasos enlaza las dos consultas nuevas.
  - §`GET /api/movements`: párrafo de la feature 49; filas `transfer` y
    `excluded` (`only`/`none`, otro valor → 400); `"excludedFromTotals": false`
    en el ejemplo; la frase «la forma de cada movimiento no cambia ni un campo»
    pasa a decir que hay un campo más; totales con las tres exclusiones y que
    desmarcar devuelve el movimiento; nota de que con `transfer=only` o
    `excluded=only` los `totals` salen a `"0.00"`; el 400 nuevo en la tabla de
    errores; el aviso de solo lectura cuenta ahora tres campos de anotación.
  - §`PATCH /api/movements`: `excludedFromTotals` en el body (se puede mandar
    solo), segundo ejemplo, la regla «al menos una de las tres», que los
    `totals` solo se mueven al escribir la marca, y el 400 de R3.
  - §`PATCH /api/movements/:id`: lo mismo en su versión de uno.
  - §`POST /api/transfers`: párrafo de R9 (marca y enlace independientes).
  - §`DELETE /api/transfers/:transferId`: no toca la marca; tras deshacer, las
    dos piernas vuelven a sumar si ninguna está marcada, y la pareja deja de
    salir en `GET /api/transfers` (R13).
  - Secciones nuevas `GET /api/transfers` y `GET /api/transfers/ambiguous`, entre
    `DELETE /api/transfers/:transferId` y `GET /api/overview`, con ejemplo de
    respuesta y errores.
  - §`GET /api/overview`: la exclusión nueva en la lista y que la marca no mueve
    los saldos.
- `docs/data-model.md`
  - §Totales globales: lista de las tres exclusiones (`transferId`, `productId`,
    `excludedFromTotals`), párrafo «el saldo no mira ninguna de las tres» y el
    porqué de una columna propia en vez de `productId`.
  - Bloque del esquema Prisma: línea `excludedFromTotals Boolean @default(false)`
    en `model Movement` (ver decisiones).
- `specs/49-honest-totals/tasks.md`: `[x]` en T17 y T18.
- `progress/current.md`: sección del lote C bajo la F49.

### Decisiones tomadas

- **Añadí la columna al bloque del esquema Prisma de `docs/data-model.md`.** T18
  solo nombra §Totales globales, pero ese bloque se presenta como «el real» y sin
  la línea dejaría de serlo en cuanto el lote A aplique la migración. Es un
  archivo de este lote y no añade nada que `design.md` §2 no fije.
- **No puse el número de parejas** (el «hoy hay 40» de `design.md` §5) en el
  contrato: es un dato de la base real que no he comprobado yo y que caduca.
- **No afirmé qué pasa con un parámetro de querystring desconocido** en los dos
  `GET` de traspasos (en los demás endpoints el contrato dice «se ignora»): el
  diseño no les da esquema de querystring y no lo he comprobado. Queda en la
  tabla de contraste (fila 20).
- **El orden de respaldo por id ascendente** dentro de una pareja que no fuera un
  `expense` + un `income` (`design.md` §5) no lo documenté: la escritura no
  produce ese estado y el propio diseño dice que no se inventa nada para él.
- Palabras: «traspasos dudosos» / «grupos dudosos», que ya usan el humano en
  `requirements.md` y el contrato desde la F40. Ningún término nuevo.
- No encontré ninguna contradicción entre `decisions.md`, `requirements.md` y
  `design.md` en lo que toca a este lote.

### Trazabilidad

R15 es de documentación; no tiene test. Queda cubierto por el contenido de las
secciones de arriba. Lo que falta es comprobar que esa documentación coincide
con el código de los lotes A y B, fila a fila:

### Qué contrastar contra el código de los lotes A y B

| # | Lo que dice la documentación | Dónde está en la doc | Contrastar con |
| --- | --- | --- | --- |
| 1 | Cada movimiento serializado lleva `excludedFromTotals` (boolean), en `GET /api/movements`, los dos `PATCH`, `POST /api/transfers` y `GET /api/transfers` | §`Movement`, ejemplo de §`GET /api/movements`, ejemplo de §`GET /api/transfers` | `serializeMovement` y `SerializedMovement` (lote A, T2) |
| 2 | Todo movimiento existente o nuevo nace `false`; el importador no la escribe | §`Movement`, `data-model.md` §Totales globales | Migración y `schema.prisma` (T1); `toMovementCreateInput` sin la columna |
| 3 | `computeTotals` excluye `excludedFromTotals = true` además de `transferId` y `productId`; los `neutral` fuera | §`GET /api/movements` (totals), §`GET /api/overview`, `data-model.md` | `computeTotals` y los dos `select` (T3) |
| 4 | Desmarcar devuelve el movimiento a los totales exactamente como antes | §`GET /api/movements`, §`GET /api/overview`, los dos `PATCH` | Tests T8 y T9 |
| 5 | La marca no cambia `amount`, fechas, descripción, `balanceAfter`, `transferId`, el `balance` de la cuenta ni `totalBalance` | §`Movement`, los dos `PATCH`, §`GET /api/overview`, `data-model.md` | `computeAccountBalance`/`netOf` intactos; test T8 |
| 6 | `PATCH /api/movements` acepta `{ ids, excludedFromTotals }` sin `categoryId` ni `status`; sin ninguna de las tres → 400 | §`PATCH /api/movements` | `bulkUpdateMovementsWritableProperties` (T4) |
| 7 | `PATCH /api/movements/:id` acepta `{ excludedFromTotals }` solo; `{}` sigue siendo 400 | §`PATCH /api/movements/:id` | `updateMovementSchema` (T4) |
| 8 | `null`, `"true"`, `"false"`, `0`, `1` → 400 `VALIDATION_ERROR` sin escribir, en los dos `PATCH` | los dos `PATCH` (body y errores) | `assertStrictBoolean` en `preValidation` (T5), test T7. `"false"` lo añadí yo por simetría con `"true"` (R3 dice «incluidos», no es lista cerrada): comprobar que el código lo rechaza |
| 9 | En bloque, la marca va en la misma operación todo o nada | §`PATCH /api/movements` («Es todo o nada», sin cambios) | `bulkUpdateMovements` (T4), test T7 del id inexistente |
| 10 | Se puede marcar un `neutral` y una pierna de traspaso | §`Movement`, los dos `PATCH` | T4 (sin validación de dominio nueva); T15 |
| 11 | `transfer=only` → `transferId` no nulo; `none` → nulo; `excluded=only`/`none` → `excludedFromTotals` true/false; otro valor → 400 | §`GET /api/movements` (parámetros y errores) | `listMovementsSchema` y `movementListWhere` (T6), test T10 |
| 12 | Con `transfer=only` o `excluded=only` los `totals` salen `"0.00"` los tres, y `pagination.total` cuenta los que hay | §`GET /api/movements` | Test T10 |
| 13 | `POST /api/transfers`, `DELETE /api/transfers/:transferId` y la detección no cambian la marca; enlazar un movimiento marcado funciona | §`POST /api/transfers`, §`DELETE …` | Test T15 (lote B) |
| 14 | Tras `DELETE`, las dos piernas sin marcar suman en `totals` y la pareja desaparece de `GET /api/transfers` | §`DELETE …` | Test T14 (lote B) |
| 15 | `GET /api/transfers` → `200 { pairs }`, cada una `{ transferId, movements: [expense, income] }` completas con `account` y `category`; `pairs: []` sin parejas; sin paginar ni filtros | §`GET /api/transfers` | `listTransferPairs`, `TransferPair` (T12) |
| 16 | Orden: `bookingDate` más reciente de las dos piernas, descendente; empate por `transferId` ascendente | §`GET /api/transfers` | `listTransferPairs` (T12), test T14 |
| 17 | `GET /api/transfers/ambiguous` → `200 { ambiguousCount, ambiguous }` con la misma forma que en el informe de `POST /api/import`; `ambiguousCount === ambiguous.length` | §`GET /api/transfers/ambiguous` | `listAmbiguousTransfers`, `AmbiguousTransfersResponse` (T13), test T16 |
| 18 | No escribe nada aunque haya algo emparejable | §`GET /api/transfers/ambiguous` | T13 (descarta `pairs`), test T16 (filas y `updatedAt`) |
| 19 | Un fallo de base en los dos `GET` de traspasos → 500 genérico | las dos secciones nuevas | T12/T13 (no capturan el error) |
| 20 | Ninguno de los dos `GET` de traspasos tiene parámetros. **No afirmé** qué pasa con uno desconocido | las dos secciones nuevas | `transfers.routes.ts`: si se quiere decir «se ignora», comprobarlo con una petición y añadirlo |

### Último ./init.sh

Solo `./init.sh --fast`, como pidió el leader (el lote A corre la suite
completa). Resultado del 2026-09-27: **exit 1**, en el paso 4 (tipos):

```
src/modules/movements/movements.test.ts(453,5): error TS2741: Property 'excludedFromTotals' is missing in type '{ type: "expense"; amount: string; transferId: null; productId: null; }' but required in type 'TotalsMovement'.
... (14 errores en total, todos en src/modules/movements/movements.test.ts, líneas 453–515)
[FAIL]  Type check fallido (tsc reporta errores)
```

Los pasos 1–3 (estado, archivos del arnés, `feature_list.json` y specs) salieron
`[OK]`. El rojo no es de este lote, que no toca código: `TotalsMovement` ya
exige `excludedFromTotals` (trabajo del lote A en curso; `computeTotals` ya
tiene la línea nueva en el árbol) y los tests antiguos de `computeTotals` en
`movements.test.ts` todavía no lo pasan. **Ojo:** `movements.test.ts` **no
está** en la cabecera `Archivos:` del lote A; quien lo arregle necesita que el
leader se lo asigne.

`npx prettier --check docs/api-contract.md docs/data-model.md` → «All matched
files use Prettier code style!» (además, `docs/` está en `.prettierignore`).

### Sugerencias fuera de scope (NO aplicadas)

- `README.md` tiene un índice de endpoints (la F47 lo actualizó en su lote C):
  le faltarán `GET /api/transfers` y `GET /api/transfers/ambiguous`. No está en
  la cabecera de este lote.
- `docs/data-model.md` regla 5 y §Traspasos («La regla de agregación») siguen
  hablando solo de su propia exclusión; son correctas, pero podrían enlazar a
  §Totales globales para que la lista de las tres se lea en un solo sitio.

## Lote A — implementación

> Implementer del lote A (T1–T10), 2026-09-27. En paralelo con el lote C.

### Archivos modificados / creados

- `prisma/schema.prisma` — `Movement.excludedFromTotals Boolean @default(false)`
  con su comentario; el de `productId` dice ahora que sigue excluyendo de las
  sumas pero que la marca general es `excludedFromTotals`.
- `prisma/migrations/20260927120000_movement_excluded_from_totals/migration.sql`
  (**nuevo**) — `ALTER TABLE "Movement" ADD COLUMN "excludedFromTotals" BOOLEAN NOT NULL DEFAULT false;`
- `src/modules/movements/movements.types.ts` — `excludedFromTotals` en
  `TotalsMovement`, `UpdateMovementBody`, `BulkUpdateMovementsBody` y
  `SerializedMovement`; `transfer` y `excluded` en `MovementListQuery` (tipo
  nuevo `MovementPresenceFilter = 'only' | 'none'`).
- `src/modules/movements/movements.schema.ts` — `transfer` y `excluded`
  (`enum: ['only', 'none']`) en `listMovementsSchema`; `excludedFromTotals:
  { type: 'boolean' }` en los dos cuerpos de `PATCH`;
  `bulkUpdateMovementsWritableProperties` pasa a tres campos.
- `src/modules/movements/movements.service.ts` — los cuatro `if` del filtro en
  `movementListWhere`; `excludedFromTotals` en el `select` de totales de
  `listMovements`; `updateMovement` y `bulkUpdateMovements` escriben la marca
  (en el bloque, dentro del mismo `updateMany` y la misma transacción);
  `serializeMovement` la emite; `computeTotals` descarta un marcado antes de
  mirar nada más.
- `src/modules/movements/movements.routes.ts` — `assertStrictBoolean` en el
  `preValidation` de los dos `PATCH`.
- `src/modules/overview/overview.service.ts` — `excludedFromTotals` en el
  `select` del periodo.
- `src/modules/movements/movements.exclusion.test.ts` (**nuevo**, 23 tests).
- `src/modules/overview/overview.test.ts` — 1 test nuevo.
- `src/modules/movements/movements.test.ts` — **archivo añadido al lote por el
  leader** (no estaba en la cabecera `Archivos:`). Solo lo necesario, sin cambiar
  lo que comprueban: `excludedFromTotals: false` en las 14 fixtures de
  `computeTotals`/`serializeTotals` (no compilaban porque `TotalsMovement` ya lo
  exige), y la clave `'excludedFromTotals'` en la lista del test «keeps the
  serialized shape of each movement exactly as it was (feature 36)», que es
  justo el cambio que pide R4.
- `specs/49-honest-totals/tasks.md` — `[x]` en T1–T10.
- `progress/current.md` — sección del lote A.

### La migración sobre la base de desarrollo (`gastos`)

Escrita a mano como SQL y aplicada con `pnpm exec prisma migrate deploy`, como en
la F47. Nada de `migrate dev` ni `migrate reset`. Comprobado con `psql` dentro de
`gastos-postgres`, antes y después:

| | antes | después |
| --- | --- | --- |
| filas de `Movement` | 1607 | 1607 |
| con `excludedFromTotals = false` | — | 1607 |
| con `excludedFromTotals = true` | — | 0 |
| `max(id)` | 42764 | 42764 |
| `max("updatedAt")` | 2026-09-22 19:24:12.58 | 2026-09-22 19:24:12.58 |
| md5 de todas las filas en JSON (después, quitando la columna nueva) | `b028c1fa…` | `b028c1fa…` |

Es decir: ni una fila insertada, borrada ni cambiada; todas nacen con `false`.
Después, `prisma generate` para el cliente.

### Decisiones tomadas

- **Migración escrita a mano, no con `prisma migrate dev`** (T1 y `design.md` §1
  dicen `migrate dev`): así lo pidió el leader, para no arriesgar la base con los
  datos reales. El SQL es el mismo que da `design.md` §1.
- **`assertStrictBoolean` corre después de `assertOnlyAllowedBodyProperties` y
  `assertSomethingToWrite`**, así que un cuerpo con una propiedad desconocida
  sigue dando el mismo 400 de antes. Mira el cuerpo crudo con `Object.hasOwn`:
  si la clave no viene, no hace nada.
- **R3 lo prueba el resultado, no el mecanismo.** El test manda `null`, `"true"`,
  `"false"`, `1` y `0` a los dos `PATCH` (en el bloque, también junto a un
  `status` válido) y comprueba 400 `VALIDATION_ERROR` y que ni la marca ni el
  `status` cambiaron. **No he comprobado por separado** si AJV, sin la
  comprobación de `preValidation`, convertiría esos valores (lo que `design.md`
  §3 deja como duda): para saberlo habría que quitar temporalmente la llamada y
  lanzar el test.
- `"false"` y `0` añadidos a los valores rechazados por simetría (fila 8 de la
  tabla del lote C: el código los rechaza y el test lo comprueba).
- Sin unit test nuevo de `computeTotals` en `movements.test.ts`: la exclusión la
  cubren los tests de integración de `GET /api/movements` y `GET /api/overview`,
  que pasan por la misma función. No lo añadí para no tocar ese archivo más de lo
  que el leader autorizó.

### Trazabilidad

Tests en `src/modules/movements/movements.exclusion.test.ts` salvo que se diga otro archivo.

- R1 → `marks and unmarks one movement with PATCH /api/movements/:id (R1)`;
  `marks a transfer leg and a neutral movement too: no domain rule forbids it (R1)`
- R2 → `marks several movements with PATCH /api/movements carrying only the mark (R2)`;
  `writes the mark together with status in the same bulk request (R2)`;
  `answers 404 when one id of the bulk does not exist and marks NOT ONE of the others (R2)`
- R3 → `rejects %s as excludedFromTotals with 400 on both PATCH, writing nothing (R3)`
  (5 casos: `null`, `"true"`, `"false"`, `1`, `0`)
- R4 → `ships excludedFromTotals on every movement of GET /api/movements, false by default (R4)`;
  en `movements.test.ts`, `keeps the serialized shape of each movement exactly as it was (feature 36)`.
  La parte de R4 sobre `POST /api/transfers` es del lote B (T15).
- R5 → `leaves a marked movement out of the totals and puts it back when unmarked (R5, R8)`
- R6 → `overview.test.ts`: `leaves a marked movement out of the period totals and counts it again when unmarked (R6, R8)`
- R7 → `changes neither the bank fact of the movement nor the balance of its account (R7)`
  (amount, type, las dos fechas, description, balanceAfter, transferId,
  undoneTransferId y el `balance` de `GET /api/accounts`, al marcar por el `PATCH`
  de uno y al desmarcar por el de bloque)
- R8 → los dos tests de R5 y R6 (vuelven a la cifra exacta de antes)
- R10 → `transfer=only returns only linked legs and transfer=none only the rest (R10)`;
  `combines transfer and excluded with each other (R10, R16)`;
  `combines both filters with accountId, dates and pagination: total and totals come from the filtered set (R10, R16)`
- R11 → `rejects %s=%s with 400 VALIDATION_ERROR (R11)` (6 casos:
  `transfer=yes|true|ONLY`, `excluded=yes|false|` vacío)
- R16 → `excluded=only returns only marked movements and excluded=none only the unmarked (R16)`;
  y los dos combinados de R10

R9, R12, R13, R14 son del lote B; R15 del lote C.

### Último ./init.sh

`./init.sh` completo, en solitario, 2026-09-27: **exit 1**.

- Estado, arnés, `feature_list.json` y specs: `[OK]`. Tipos: OK (tras el ajuste
  de `movements.test.ts`). Lint: `[OK]`. Formato: `[OK]`.
- Tests: `Test Files 1 failed | 72 passed (73)`, `Tests 1 failed | 1351 passed (1352)`.
- El único rojo es `src/no-real-data.test.ts > … > repeats no telling amount of
  the local captures`, que señala 8 líneas con un importe que está en `var/`:
  `feature_list.json:2051`, `progress/spec_honest-totals.md` (líneas 19, 21, 22,
  23, 24 y 38) y `specs/49-honest-totals/decisions.md:49`. **Ninguno es archivo de
  este lote ni lo he tocado**: son el intent, el informe del `spec-author` y la
  hoja de decisiones. No los he corregido (fuera de mi cabecera y, la hoja, del
  humano). Ninguna línea de código ni de test de este lote aparece en la lista.

Los archivos del lote, por separado: `pnpm exec vitest run
src/modules/movements/movements.exclusion.test.ts src/modules/overview/overview.test.ts`
→ `Test Files 2 passed (2)`, `Tests 36 passed (36)`.

### Sugerencias fuera de scope (NO aplicadas)

- Las 8 líneas que señala `no-real-data.test.ts` (ver arriba): hay que cambiar
  esos importes por otros inventados, o anotarlas con `no-real-data-ok` y su
  motivo, según `docs/conventions.md`. Le toca al leader decidir quién.
- Un unit test de `computeTotals` con `excludedFromTotals: true` en
  `movements.test.ts`, junto a los de `transferId` y `productId`, dejaría la regla
  vigilada también sin base de datos.

## Lote B — implementación

> Implementer del lote B (T11–T16), 2026-09-27. Con los lotes A y C ya en el árbol.

### Archivos modificados / creados

- `src/modules/transfers/transfers.service.ts`
  - `readTransferCandidates` (privada, nueva): la lectura de candidatos que
    estaba dentro de `detectTransfers`, movida tal cual (mismo `where`, mismo
    `select`, mismo mapeo). `detectTransfers` la llama dentro de su `try`, así que
    un fallo de lectura sigue acabando en `result.error` como antes.
  - `listTransferPairs` (nueva): un `findMany` con `transferId` no nulo e
    `include: { account, category }`, agrupado por `transferId` en memoria; dentro
    de la pareja `expense` antes que `income` (si no, por id); parejas por la
    `bookingDate` más reciente de sus piernas, descendente, empate por
    `transferId` ascendente. Serializa con `serializeMovement`.
  - `listAmbiguousTransfers` (nueva): `pairTransferCandidates(await
    readTransferCandidates(prisma))`, devuelve solo `ambiguous` y su longitud; las
    `pairs` se descartan. No captura errores.
- `src/modules/transfers/transfers.types.ts` — `TransferPair`,
  `TransferPairsResponse` y `AmbiguousTransfersResponse` (este último como
  `Pick<TransferDetectionResult, 'ambiguousCount' | 'ambiguous'>`, para que la
  forma sea la del informe de importación por construcción). Cabecera del archivo
  actualizada.
- `src/modules/transfers/transfers.routes.ts` — `GET /` y `GET /ambiguous`, sin
  esquema (no tienen entrada). Cabecera actualizada con las cuatro rutas.
- `src/modules/transfers/transfers.routes.test.ts` — bloque `describe` anidado
  nuevo con 11 tests; reutiliza los helpers y la limpieza del bloque de la F44.
  Importa `detectTransfers` para T15 y T16.
- `specs/49-honest-totals/tasks.md` — `[x]` en T11–T16.
- `progress/current.md` — sección del lote B.

### Decisiones tomadas

- **Las dos rutas nuevas no tienen esquema.** `transfers.schema.ts` no está en
  la cabecera del lote y `design.md` §6 dice que no admiten parámetros. Efecto:
  un parámetro de querystring desconocido no se valida. **No lo he comprobado con
  una petición**; para saberlo basta un `GET /api/transfers?x=1` en un test.
  Fila 20 de la tabla del lote C: el contrato no afirma nada, así que no hay
  discrepancia.
- **«Misma forma que en el informe de importación» (T16) se comprueba contra la
  propia detección:** el test llama a `GET /api/transfers/ambiguous` y después a
  `detectTransfers` sobre la misma siembra (sin nada emparejable, así que no
  escribe) y exige que `{ ambiguousCount, ambiguous }` sean iguales, además de
  comparar campo a campo con el valor esperado.
- **«Tras enlazar a mano, el grupo cambia o desaparece»:** el caso sembrado es
  dos gastos y un ingreso del mismo importe; al enlazar un gasto con el ingreso
  el gasto que queda no tiene arista y el grupo desaparece (`ambiguousCount: 0`).
- **Sin escritura (R14):** la siembra del test incluye además una pareja única
  que la detección **sí** enlazaría; tras el `GET` sigue con `transferId: null`,
  y el número de filas de `Movement` y, por fila, `transferId`,
  `undoneTransferId`, `excludedFromTotals` y `updatedAt` son idénticos.
- **El análogo de las multas** usa 173.46 (inventado) en lugar de los 100 € que
  pone T14, por la instrucción del leader de importes inventados. Todos los
  importes del bloque son inventados (247.19, 83.64, 312.77, 46.09, 173.46,
  529.08, 58.17, 91.33); `no-real-data.test.ts` pasa.
- En el test de empate, cada pareja lleva un importe distinto: con el mismo
  importe, cuenta y fecha, la siembra chocaba con `Movement_imported_dedup_key`
  (lo vi al ejecutarlo). La fecha, que es lo que se prueba, es la misma.

### Trazabilidad

Todos en `src/modules/transfers/transfers.routes.test.ts`, bloque
`GET /api/transfers, GET /api/transfers/ambiguous and the mark (F49)`.

- R9 → `lets a leg of a pair be marked and unmarked without touching its link (R9)`;
  `links a marked movement, keeps its mark, and DELETE does not clear it (R9, R4)`;
  `a detection pass links a marked leg and leaves both marks as they were (R9)`
- R4 (parte de `POST /api/transfers`) → `links a marked movement, keeps its mark, and DELETE does not clear it (R9, R4)`
- R12 → `answers 200 with pairs: [] when no movement carries a transferId (R12)`;
  `lists every pair newest first, the expense leg before the income leg (R12)`;
  `breaks a tie on the most recent date by transferId ascending (R12)`
- R13 → `after DELETE the pair leaves the list and both legs count in the totals again (R13)`
- R14 → `answers { ambiguousCount: 0, ambiguous: [] } when nothing is doubtful (R14)`;
  `returns an uneven group with the same shape as the import report (R14)`;
  `reflects a manual link at once: the group disappears (R14)`;
  `writes nothing, not even a pair it could resolve (R14)`
- T11 (extracción sin cambio de comportamiento) → los tests existentes de
  `detectTransfers` en `transfers.service.test.ts` y de las importaciones,
  todos verdes en la suite completa.

### Contraste con la tabla del lote C (filas 13–20)

Leídas las secciones `POST /api/transfers`, `DELETE /api/transfers/:transferId`,
`GET /api/transfers` y `GET /api/transfers/ambiguous` de `docs/api-contract.md`
contra el código:

- Filas 13–18: coinciden con el código y las cubren los tests de arriba.
- Fila 19 (fallo de base → 500): el código no captura el error en ninguna de las
  dos funciones, así que llega al manejador central. **No lo he comprobado
  ejecutándolo** (haría falta un test que rompa la conexión).
- Fila 20: ver «Decisiones tomadas»; el contrato no afirma nada, sin discrepancia.

No he encontrado nada en el contrato que no case con el código. No he tocado
`docs/api-contract.md`.

### Último ./init.sh

`./init.sh` completo, en solitario, 2026-09-27: **exit 0**.

- Estado, arnés, `feature_list.json` y specs: `[OK]`. Tipos: `[OK]`. Lint
  (`oxlint`): `[OK]`. Formato (`prettier --check .`): `[OK]`.
- Tests: `Test Files 73 passed (73)`, `Tests 1363 passed (1363)` (11 más que
  los 1352 del lote A). El rojo de `no-real-data.test.ts` que anotó el lote A ya
  no aparece.

### Sugerencias fuera de scope (NO aplicadas)

- `README.md` (índice de endpoints) sigue sin `GET /api/transfers` ni
  `GET /api/transfers/ambiguous` (ya lo anotó el lote C).
- Un test de que un parámetro desconocido en los dos `GET` nuevos se ignora, si
  se quiere que el contrato lo diga como en el resto de endpoints.

## Cambios de la primera revisión

Aplicados los dos cambios de `progress/reviews/honest-totals.md` §Cambios
requeridos. Solo documentación: no se ha tocado código ni tests.

### Archivos modificados

- `README.md` (asignado por el leader; ningún lote lo tenía en su cabecera):
  - Fila de `GET /api/movements`: añade los filtros `transfer` (pierna de un
    traspaso) y `excluded` (marcado como que no cuenta en las sumas).
  - Filas de `PATCH /api/movements` y `PATCH /api/movements/:id`: dicen que
    también escriben `excludedFromTotals`.
  - Dos filas nuevas tras `DELETE /api/transfers/:transferId`:
    `GET /api/transfers` y `GET /api/transfers/ambiguous`.
- `docs/api-contract.md`:
  - `GET /api/transfers`: un parámetro de query desconocido se ignora (200), y
    `page`/`pageSize` no paginan (con `?page=2` devuelve todas las parejas).
  - `GET /api/transfers/ambiguous`: un parámetro de query desconocido se ignora
    (200).
  - Comportamiento comprobado por el reviewer ejecutándolo (ver su informe);
    no lo he vuelto a ejecutar yo.

### Último ./init.sh

`./init.sh --fast` (2026-09-27), salida de 0: estado del arnés OK,
`feature_list.json` válido (50 features), specs presentes, `tsc --noEmit` sin
errores. Modo `--fast`: **la suite no se ha ejecutado** en esta pasada (el
cambio es solo de documentación).
