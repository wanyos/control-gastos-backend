# movements-hide-not-counted — implementación

F68, SDD, Lote A (único). Fecha: 2026-11-06. No se ha escrito nada en la base de
datos del humano: todo lo que se ha ejecutado es la suite, que va contra las bases
desechables `gastos_test_<n>`.

## Lote A — implementación

### Archivos modificados / creados

- `src/modules/movements/movements.schema.ts` — `hideNotCounted: { type: 'boolean' }` en
  `listMovementsSchema.querystring.properties`, junto a `ownership` (mismo tipo que
  `uncategorized`). (T1)
- `src/modules/movements/movements.types.ts` — `hideNotCounted?: boolean` en
  `MovementListQuery`. (T1)
- `src/modules/movements/movements.service.ts` — (T2)
  - `movementListWhere` recibe un tercer argumento, `deposits:
    Map<number, DepositMovementReading>`, y con `hideNotCounted === true` añade a
    `where.AND` la condición `OR: [{ excludedFromTotals: false, transferId: null },
    { id: { in: <ids de depósito con counted ≠ 0> } }]`, tal como `design.md` §2.
  - `listMovements` lee `readDepositMovements(prisma, matchers)` antes de construir el
    `where` (después de `readOwnership`) y lo saca del `Promise.all`; el mismo mapa se
    sigue usando para `serializeDeposit` y `computeTotals`. `computeTotals` no cambia.
  - Comentario de cabecera de `listMovements` con una frase de la F68.
- `src/modules/movements/movements.hide-not-counted.test.ts` — nuevo, 13 tests (T3).
- `src/modules/movements/movements.hide-not-counted.docs.test.ts` — nuevo, 1 test (T5).
- `docs/api-contract.md` §`GET /api/movements` — párrafo «Desde la feature 68», fila
  `hideNotCounted` en la tabla de parámetros, frase en la nota de `totals`, subsección
  nueva `#### Esconder lo que no cuenta` (qué sale, qué no, totales, combinación,
  cómo contar los escondidos) y `hideNotCounted` en la fila 400 de errores. (T4)
- `specs/68-movements-hide-not-counted/tasks.md` — T1 a T6 marcadas `[x]`.

No se ha tocado `progress/current.md`: el leader limitó los archivos a los del lote,
`tasks.md`, `README.md` (si el spec lo pedía) y este informe.

### Decisiones tomadas

- Ninguna fuera del spec. La condición, su sitio (`where.AND`) y el orden de lecturas
  son los de `design.md` §2.
- Prettier reescribió el `OR` de la condición en una sola línea (cabe en 100
  columnas); es el mismo código.
- Datos de los tests: todo inventado (importes, conceptos, número de depósito
  `640923`, la forma del nombre `Marta Lozano Ruiz`, `Cuenta inventada`). Los textos
  de depósito son los que reconoce MyInvestor (`APERTURA DEP`, `CANCELACION DEP`,
  `INTERESES DEP`), como en `movements.deposits.test.ts`. Los tests que miran el mes
  entero usan noviembre de 2024, que no siembra ningún otro archivo. No hay fixtures
  `.xls` ni `.pdf` (lección 3 no aplica).
- «Emparejado» se siembra con un `transferId` escrito a mano (`f68-pair-…`), como dice
  `tasks.md`.

### Trazabilidad

Todos en `src/modules/movements/movements.hide-not-counted.test.ts` salvo R13 y R12.

- R1 → `hides a normal movement that is marked or paired`; también
  `what it shows plus what it hides is every movement of the month` y
  `combines hideNotCounted with excluded, transfer and ownership`
- R2 → `keeps a marked maturity with interest and counts its interest`,
  `keeps a paired maturity with interest and counts its interest` (emparejado, y
  marcado + emparejado)
- R3 → `hides a doubtful maturity that is marked or paired`,
  `hides a deposit opening or cancellation that is marked or paired`,
  `hides a maturity whose interest is exactly zero when marked` (cada uno comprueba
  antes, sin el parámetro, que el movimiento es de depósito y suma `0.00`)
- R4 → `keeps everything that is neither marked nor paired` (un `own` por forma del
  nombre, un `neutral` de 0, uno con `productId`, una apertura sin marcar)
- R5 → `keeps a maturity whose opening is before the requested range`
- R6 → `keeps a marked maturity with interest and counts its interest` y
  `keeps a paired maturity with interest and counts its interest` (`pagination.total`
  y `totals` sobre lo filtrado)
- R7 → `gives the same totals with and without hideNotCounted` (mes con todos los
  casos, también un `own` marcado y un `mine` emparejado; y comprueba que
  `excluded=none&transfer=none` da 58.35 menos de `income`: el interés de los tres
  vencimientos marcados o emparejados)
- R8 → `what it shows plus what it hides is every movement of the month` (resta de los
  dos `pagination.total`, la segunda con `pageSize=1`; 8 escondidos sembrados; y la
  unión de lo visible con lo escondido es el mes entero)
- R9 → `hideNotCounted=false or absent does not filter` (respuesta entera igual)
- R10 → `rejects a hideNotCounted that is not true or false` (`yes` → 400
  `VALIDATION_ERROR`)
- R11 → `combines hideNotCounted with excluded, transfer and ownership`
  (`excluded=only`, `transfer=none`, `transfer=only`, `ownership=doubtful`)
- R12 → `pnpm test` entero en verde (1535 tests), con `movements.test.ts`,
  `movements.exclusion.test.ts`, `movements.deposits.test.ts` y los de `own-accounts`
  sin tocar
- R13 → `the contract describes hideNotCounted and how to count what it hides`
  (`movements.hide-not-counted.docs.test.ts`)

### Documentos actualizados

```
git grep -n "ownership=doubtful" -- . ':!progress' ':!specs'
git grep -n "readDepositMovements(prisma, matchers)" -- src
git grep -n "hideNotCounted" -- . ':!progress' ':!specs'
```

- `docs/api-contract.md`: actualizado (T4).
- `docs/vocabulary.md:46` ya tenía `hideNotCounted` (lo puso el leader); no lo he tocado.
- `docs/architecture.md:3421` habla solo de `ownership=doubtful`: sigue siendo cierto.
- Las otras dos llamadas a `readDepositMovements` (`overview`, `expenses-by-category`)
  no cambian.

**Dos líneas fuera de los archivos del lote que quedan incompletas (no las he tocado;
decide el leader):**

1. `README.md:81` — la fila de `GET /api/movements` enumera los filtros («Filtra por
   cuenta, fechas, … y si es dudoso … (`ownership=doubtful`, feature 62)») y no nombra
   `hideNotCounted`. No dice nada falso, pero la lista ya no está completa. El spec no
   pide tocar el README, por eso no lo he editado.
2. `src/modules/movements/movements.routes.ts:91-97` — comentario de cabecera de la
   ruta con una frase por feature (36, 57, 62); no menciona la 68. Tampoco es falso.
   `movements.routes.ts` no está en `Archivos:` del lote (el design dice «Nada»).

### Prueba real

No aplica: la feature no lee datos de fuera del código (ni archivos del banco ni de
producto, ni API externa). Es un filtro más de una consulta de la base.

### Último ./init.sh

```
$ ./init.sh > "$TMP/f68-init.txt" 2>&1; echo exit=$?
exit=0
[OK]    feature_list.json válido (68 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  95 passed (95)
      Tests  1535 passed (1535)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 68

```
$ ./init.sh --checks 68 > "$TMP/f68-checks.txt" 2>&1; echo exit=$?
exit=0
[1] … "keeps a marked maturity with interest and counts its interest"   exit 0  Tests 1 passed | 12 skipped (13)
[2] … "keeps a paired maturity with interest and counts its interest"   exit 0  Tests 1 passed | 12 skipped (13)
[3] … "hides a normal movement that is marked or paired"                exit 0  Tests 1 passed | 12 skipped (13)
[4] … "hides a doubtful maturity that is marked or paired"              exit 0  Tests 1 passed | 12 skipped (13)
[5] … "hides a deposit opening or cancellation that is marked or paired" exit 0 Tests 1 passed | 12 skipped (13)
[6] … "gives the same totals with and without hideNotCounted"           exit 0  Tests 1 passed | 12 skipped (13)
[7] … "what it shows plus what it hides is every movement of the month" exit 0  Tests 1 passed | 12 skipped (13)
[8] … "the contract describes hideNotCounted and how to count what it hides" exit 0 Tests 1 passed (1)
[9] pnpm test                                                           exit 0
[OK]    Checks: 9 de 9 en verde.
```

(Las líneas [1] a [8] están resumidas: cada una es `pnpm exec vitest run <archivo> -t
"<nombre>" | grep -E "Tests +1 passed"`, tal como está en `feature_list.json`.)

Las dos ejecuciones se lanzaron una detrás de otra, nunca a la vez. No se hizo build,
así que no hay `dist/` que borrar.

### Sugerencias fuera de scope (NO aplicadas)

- Añadir `hideNotCounted` a la fila de `README.md:81` y una frase de la F68 al
  comentario de `movements.routes.ts` (ver «Documentos actualizados»).

## Cambios tras la review 1

La review 1 (`progress/reviews/movements-hide-not-counted.md`, cambio requerido 1) pidió
añadir `hideNotCounted` a la fila de `GET /api/movements` de `README.md`. El leader
amplió el Lote A a esa línea; queda apuntado en la cabecera `Archivos:` del Lote A de
`specs/68-movements-hide-not-counted/tasks.md`.

### Archivos modificados

- `README.md:81` (fila de `GET /api/movements`): añadida, tras el filtro
  `ownership=doubtful`, la frase «Con `hideNotCounted=true` esconde lo marcado como que
  no cuenta o emparejado como traspaso, salvo los movimientos de depósito que suman
  algo, sin cambiar los totales (feature 68)». Coherente con la fila del parámetro en
  `docs/api-contract.md:1177` y con `docs/vocabulary.md:46`. Nada más cambiado en
  `README.md` (`git diff --stat README.md`: 1 insertion, 1 deletion).
- `specs/68-movements-hide-not-counted/tasks.md`: cabecera `Archivos:` del Lote A con
  `README.md` (solo esa fila; ampliado por la review 1).

El comentario de `movements.routes.ts` que se mencionaba en «Sugerencias fuera de
scope» sigue sin tocar: no está en el lote.

### Verificación

```
$ pnpm run format:check > <scratchpad>/fmt.txt 2>&1; echo fmt=$?
fmt=0
All matched files use Prettier code style!

$ pnpm exec vitest run src/no-real-data.test.ts > <scratchpad>/nrd.txt 2>&1; echo nrd=$?
nrd=0
 Test Files  1 passed (1)
      Tests  37 passed (37)
```

Lanzadas una detrás de otra, sin dos vitest a la vez. No se relanzó `./init.sh`
completo: el cambio es solo de texto en `README.md` y `tasks.md`.
