# Resumen — feature 49 `honest-totals`

Fecha de cierre: 2026-09-27
Intención original: `feature_list.json` → feature `honest-totals`, bloque `intent`
Spec: `specs/49-honest-totals/`

## Qué hace ahora la app que antes no

Ahora puedes decirle al backend que un movimiento concreto **no cuenta en las
sumas de ingreso y gasto** (pensado para las aperturas y cancelaciones de
depósitos de myinvestor), y quitarlo después. El importe, las fechas y el saldo
de la cuenta no cambian. También puedes filtrar el listado por «es pierna de un
traspaso» o no, y por «está marcado» o no. Puedes ver todas las parejas de
traspaso con sus dos piernas, para deshacer las falsas con el `DELETE` que ya
existía, y pedir en cualquier momento los traspasos dudosos, que antes solo se
veían en el informe de la importación.

## Por dónde se usa (puntos de entrada)

- `PATCH /api/movements/:id` y `PATCH /api/movements` con `excludedFromTotals: true|false`: marcan o desmarcan uno o varios movimientos. [movements.routes.ts:107](../../src/modules/movements/movements.routes.ts#L107) y [movements.routes.ts:92](../../src/modules/movements/movements.routes.ts#L92).
- `GET /api/movements?transfer=only|none&excluded=only|none`: los dos filtros nuevos. Se aplican en [`movementListWhere` — movements.service.ts:158](../../src/modules/movements/movements.service.ts#L158).
- `GET /api/transfers`: todas las parejas enlazadas. [transfers.routes.ts:35](../../src/modules/transfers/transfers.routes.ts#L35).
- `GET /api/transfers/ambiguous`: los grupos dudosos, calculados al pedirlos. [transfers.routes.ts:37](../../src/modules/transfers/transfers.routes.ts#L37).
- La suma que deja fuera los marcados: [`computeTotals` — movements.service.ts:477](../../src/modules/movements/movements.service.ts#L477).

## Dónde está el código (para revisión directa)

### La marca en la base de datos

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| Columna nueva, `false` por defecto | `Movement.excludedFromTotals` | `prisma/schema.prisma` |
| Migración que la añade (ya aplicada a tu base, sin cambiar ninguna fila) | `ALTER TABLE "Movement" ADD COLUMN` | `prisma/migrations/20260927120000_movement_excluded_from_totals/migration.sql` |

### Escribir la marca

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| Rechaza cualquier valor que no sea `true`/`false` literal, antes del esquema | `assertStrictBoolean` | `src/modules/movements/movements.routes.ts` |
| La marca en el esquema de los dos `PATCH` y en la lista de campos que se pueden escribir en bloque | `updateMovementSchema`, `bulkUpdateMovementsSchema`, `bulkUpdateMovementsWritableProperties` | `src/modules/movements/movements.schema.ts` |
| Guarda la marca de un movimiento | `updateMovement` | `src/modules/movements/movements.service.ts` |
| Guarda la marca de varios, en la misma transacción de todo o nada | `bulkUpdateMovements` | `src/modules/movements/movements.service.ts` |
| Tipos de los cuerpos | `UpdateMovementBody`, `BulkUpdateMovementsBody` | `src/modules/movements/movements.types.ts` |

### Mostrar la marca y sacarla de las sumas

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| Cada movimiento serializado lleva el campo | `serializeMovement`, `SerializedMovement` | `movements.service.ts`, `movements.types.ts` |
| La suma única descarta los marcados | `computeTotals`, `TotalsMovement` | `movements.service.ts`, `movements.types.ts` |
| Los totales del listado piden la columna | `select` dentro de `listMovements` | `src/modules/movements/movements.service.ts` |
| Los totales del mes piden la columna | `select` dentro de `getOverview` | `src/modules/overview/overview.service.ts` |

### Filtros del listado

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| `transfer` y `excluded` aceptan solo `only`/`none` (cualquier otro valor da 400) | `listMovementsSchema` | `src/modules/movements/movements.schema.ts` |
| Los aplica en el `where` que comparten la página, el recuento y los totales | `movementListWhere` | `src/modules/movements/movements.service.ts` |
| Tipos | `MovementPresenceFilter`, `MovementListQuery` | `src/modules/movements/movements.types.ts` |

### Parejas y traspasos dudosos

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| Lista las parejas: el gasto primero y el ingreso después, de la más reciente a la más antigua | `listTransferPairs`, `byLegOrder` | `src/modules/transfers/transfers.service.ts` |
| Lee los movimientos que pueden formar pareja; es la misma lectura que usa la detección, sacada a su propia función | `readTransferCandidates` | `src/modules/transfers/transfers.service.ts` |
| Calcula los dudosos sin escribir nada | `listAmbiguousTransfers` | `src/modules/transfers/transfers.service.ts` |
| La detección llama ahora a esa lectura compartida | `detectTransfers` | `src/modules/transfers/transfers.service.ts` |
| Tipos de respuesta | `TransferPair`, `TransferPairsResponse`, `AmbiguousTransfersResponse` | `src/modules/transfers/transfers.types.ts` |

### Documentación

| Qué | Dónde |
| --- | --- |
| Campo, `PATCH`, filtros, totales, los dos `GET` nuevos | `docs/api-contract.md` (§`Movement`, §`GET /api/movements`, los dos §`PATCH`, §`POST`/§`DELETE /api/transfers`, §`GET /api/transfers`, §`GET /api/transfers/ambiguous`, §`GET /api/overview`) |
| Las tres cosas que dejan un movimiento fuera de las sumas; el saldo no mira ninguna | `docs/data-model.md` §Totales globales |
| Índice de endpoints | `README.md` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Marcar y desmarcar, uno y en bloque; valores no booleanos → 400 sin escribir; el campo en el listado; sumas; el hecho bancario y el saldo intactos; los dos filtros y sus combinaciones | `src/modules/movements/movements.exclusion.test.ts` |
| La marca en los totales del mes | `src/modules/overview/overview.test.ts` («leaves a marked movement out of the period totals…») |
| Parejas, orden, deshacer, marca y enlace independientes, dudosos sin escribir | `src/modules/transfers/transfers.routes.test.ts`, bloque `GET /api/transfers, GET /api/transfers/ambiguous and the mark (F49)` |

## Cumplimiento de la intención

- ✅ «Marco una APERTURA DEP. como que no cuenta: deja de sumar en los totals de GET /api/movements y de GET /api/overview, y su importe, su fecha y el saldo siguen igual» → verificado con un movimiento sintético en `movements.exclusion.test.ts`, en los tests `leaves a marked movement out of the totals…` y `changes neither the bank fact…`, y en `overview.test.ts`, en `leaves a marked movement out of the period totals…`.
- ✅ «Quito la marca y vuelve a sumar como antes» → los mismos tres tests comparan con la cifra exacta de antes de marcar.
- ✅ «GET /api/movements me dice en cada movimiento si está marcado» → `ships excludedFromTotals on every movement…` y la lista de claves de `movements.test.ts`.
- ✅ «Pido GET /api/movements solo con o sin traspasos, combinado con filtros y paginación; los totals salen de lo filtrado» → los cuatro tests de filtros de `movements.exclusion.test.ts`, incluido `combines both filters with accountId, dates and pagination…`.
- ✅ «Veo las parejas con sus dos piernas y su transferId, deshago una y sus dos piernas vuelven a sumar» → `lists every pair newest first…` y `after DELETE the pair leaves the list and both legs count in the totals again (R13)`.
- ⚠️ «Las dos multas se pueden deshacer así y vuelven a sumar» → el mecanismo está verificado con un análogo sintético (el mismo test R13). **Sobre tus datos reales no lo he comprobado**: deshacerlas es un paso tuyo (ver `decisions.md` §📌) y escribe en tu base.
- ✅ «Puedo pedir en cualquier momento los traspasos dudosos» → los cuatro tests R14 de `transfers.routes.test.ts`. Uno comprueba que la respuesta es idéntica a la de la detección y otro que la petición no escribe nada.
- ✅ «docs/api-contract.md describe lo nuevo» → contrastado sección por sección contra el código en la revisión. Las dos cosas que no cubrían los tests (un fallo de la base da 500 y un parámetro desconocido se ignora) las comprobé ejecutándolas (`progress/reviews/honest-totals.md`).

## Decisiones que se tomaron por ti

- (delegado) La marca es una columna propia, `excludedFromTotals`, y no `productId`: así se puede marcar cualquier movimiento, vaya o no a un producto. `productId` se queda como estaba, sin nada que lo escriba.
- (delegado) Se marca de uno en uno y en bloque, con los dos `PATCH` que ya existían.
- (delegado) La marca y el enlace de traspaso no dependen el uno del otro: se puede marcar una pierna, y ni enlazar, ni deshacer, ni la detección cambian la marca.
- (delegado) `GET /api/transfers` es un endpoint propio y sin paginar. `page`/`pageSize` se ignoran.
- (añadido) Un valor que no sea literalmente `true` o `false` (`null`, `"true"`, `"false"`, `0`, `1`) da 400. Sin esto Fastify los convertía solo: `null` habría desmarcado sin avisar.
- (añadido) Un valor desconocido de `transfer` o `excluded` da 400.

## Qué NO se tocó / quedó fuera

- El saldo de las cuentas y su cálculo.
- La detección automática de traspasos. Solo se sacó a una función la lectura de los movimientos que pueden formar pareja, sin cambiar lo que lee.
- Cuánto generó cada depósito: va en la F50. Hasta entonces, un vencimiento marcado sale entero de las sumas, intereses incluidos.
- El frontend (partes 2 y 3 del traspaso).
- Marcar los depósitos y deshacer las dos multas en tu base: son acciones tuyas (`decisions.md` §📌).

## Notas para el futuro

- No hay test unitario de `computeTotals` con `excludedFromTotals: true` (sí lo
  hay para `transferId` y `productId`). La regla la cubren los tests de
  integración de los dos `GET`. El implementer lo sugirió.
- Si alguna vez un `transferId` quedara en una sola fila, `listTransferPairs` no
  lo mostraría. Hoy nada escribe ese estado.
