# investments-gains — implementación

## Lote A — implementación

Feature 67, SDD, un solo lote. Trabajado desde `specs/67-investments-gains/` con la
versión final de `decisions.md` (aprobada el 2026-11-04). No he encontrado nada en
`requirements.md`, `design.md` ni `tasks.md` que contradiga a `decisions.md`.

Nada de lo ejecutado ha escrito en la base del humano: los tests usan la base
desechable de la suite.

## Archivos modificados / creados

- `src/modules/investments/investments.types.ts` — tipos nuevos: `GainsReason`,
  `GainsProductCommon`, `FluctuatingGainsProduct`, `DepositGainsProduct`,
  `GainsProduct`, `ClosedGainsProduct`, `ExcludedFromGainsTotal`,
  `InvestmentGainsTotal`, `InvestmentGainsResponse`.
- `src/modules/investments/investments.service.ts` — `getInvestmentGains(prisma,
  matchers, today)` y sus funciones privadas (`closingDate`, `percentOf`,
  `daysBetween`, `gainsFromPhoto`, `gainsOfLiveProduct`, `gainsOfClosedProduct`,
  `depositWithoutFigures`, `withClosedOn`). Llama a `getDepositEarnings` para los
  depósitos cerrados; solo `findMany`.
- `src/modules/investments/investments.schema.ts` — `getInvestmentGainsSchema`
  (querystring vacío, mismo patrón que `getDepositEarningsSchema`).
- `src/modules/investments/investments.routes.ts` — `GET /gains` con
  `todayInMadridAsDate()` y los `depositMaturityMatchers` del plugin.
- `src/modules/investments/investments.gains.test.ts` — nuevo, 13 tests (11 + 2 añadidos tras la review, ver «Cambios tras la review»).
- `src/modules/investments/investments.gains.docs.test.ts` — nuevo, 1 test.
- `docs/api-contract.md` — sección `GET /api/investments/gains` tras la de
  `deposits`; el lector nuevo citado en §«Inversiones — quién las escribe y quién
  las lee» y en la introducción de `GET /api/investments/overview`.
- `docs/architecture.md` — ADR-043.
- `specs/67-investments-gains/tasks.md` — T1–T8 marcadas `[x]`.
- `progress/current.md` — plan del lote.

Sin migración ni columna nueva: la lección 2 de `docs/lessons.md` no aplica.

## Decisiones tomadas

Todas dentro del spec; las anoto porque el spec no las dice con esas palabras:

1. **`valuedAt` es `null` cuando no hay cifras** (depósito con `reason`
   `missing_conditions`, `maturity_not_found`, `ambiguous` o `below_principal`, y
   producto con `no_photo`). R8 no lo nombra para los depósitos; sin cifra no hay
   fecha del dato. Está escrito así en la tabla de motivos del contrato.
2. **En un depósito sin cifras, `invested` es su `principal`** si existe (R6/R7
   dicen `invested` = `principal`; R8 solo deja a `null` `gain`, `gainPercent` y
   `currentValue`). Escrito en el contrato.
3. **Dos estados imposibles lanzan un `Error` en vez de dar una cifra:** un depósito
   cerrado que la regla de la F50 viera `active` o no viera, y un `matured` sin su
   movimiento. Por construcción no pueden darse (un cerrado está cancelado o ya
   vencido, y las dos lecturas ven los mismos productos). Preferí un 500 a
   inventar un motivo.
4. **Orden de las claves de una entrada de `closed`:** `closedOn` va justo antes de
   las cifras, como en el ejemplo de `design.md` §3.
5. **El total se suma con la ganancia ya redondeada de cada depósito** (`design.md`
   §2 paso 5), y un vivo con `gain` `null` entra en `excluded` con su `reason`.

## Trazabilidad (solo SDD)

Todos en `src/modules/investments/investments.gains.test.ts` salvo R15.

- R1 → `answers asOf, total, live and closed for today` (base vacía por el servicio;
  por la ruta HTTP con `?month=2026-05`, que se ignora; `asOf` = hoy en Madrid)
- R2 → `leaves savings accounts out of the lists and the total`
- R3 → `a deposit cancelled before maturity comes in closed with no gain`,
  `a matured deposit with its payment found comes with what it earned` (incluye un
  depósito vencido sin `closedAt`: `closedOn` = `maturityDate`),
  `a sold fund comes in closed with its last photo before closing and does not add to the total`
- R4 → `a live fund whose last photo is from an earlier month comes with that photo and its date`
  (foto de dos meses atrás; una foto posterior a hoy no se usa; `uninvestedCash` aparte)
- R5 → `a sold fund comes in closed with its last photo before closing and does not add to the total`
  (una foto posterior al `closedAt` no se usa)
- R6 → `a live deposit earns its expected gain spread over the days since it opened`
  (a mitad de plazo con redondeo del medio céntimo hacia arriba, primer día = 0,
  sin `openedAt` → `missing_conditions`); el redondeo también en
  `the total adds only live products and its percent is gain over invested`
- R7 → `a matured deposit with its payment found comes with what it earned`
- R8 → `a figure that cannot be obtained is null with its reason and the total lists the product`
  (`no_photo`, `gain_not_reported`, `gain_percent_not_reported`, ninguna cifra a 0),
  `a matured deposit without its payment comes with no figure and the reason`
  (`maturity_not_found`),
  `a closed deposit whose maturity is ambiguous or below its principal has no figure and says why`
  (`ambiguous` y `below_principal`: entrada completa, `invested` = `principal`,
  `currentValue` / `gain` / `gainPercent` / `valuedAt` a `null`; en `below_principal`
  el importe del movimiento no se cuela como `currentValue`),
  `a deposit with missing conditions has no figure and, while live, is listed in the total`
  (`missing_conditions` vivo por `expectedGain` vacío, `maturityDate` vacía,
  plazo de 0 días y plazo negativo —el caso `term <= 0`—, y cerrado por `principal`
  vacío y por `maturityDate` vacía; los cuatro vivos en `total.excluded`, los
  cerrados no), `a live deposit earns…` (`missing_conditions` por `openedAt` vacío)
- R9 → `the total adds only live products and its percent is gain over invested`,
  `a sold fund comes in closed…`, `a deposit cancelled before maturity…`
- R10, R11, R12 → `the total adds only live products and its percent is gain over invested`
  (dos fondos y un depósito vivo con su capital dentro; un fondo cerrado y un
  depósito vencido que no suman; `gainPercent` redondeado; `null` sin ningún vivo
  que entre)
- R13 → `a figure that cannot be obtained is null with its reason and the total lists the product`,
  `the total adds only live products…`,
  `a deposit with missing conditions has no figure and, while live, is listed in the total`
- R14 → `writes nothing in the database` (recuento y `updatedAt` máximo de
  `InvestmentProduct`, `Valuation` y `Movement` antes y después de leer por el
  servicio y por la ruta)
- R15 → `the contract describes GET /api/investments/gains with the formula of its percent`
  (`src/modules/investments/investments.gains.docs.test.ts`: la sección existe, nombra
  los 7 motivos, escribe las dos fórmulas, el ejemplo JSON se lee y su `total` cuadra
  con sus `live`, y el párrafo de lectores enlaza la sección)
- R16 → `a deposit cancelled before maturity comes in closed with no gain`

Comprobé además que los tests detectan un fallo del redondeo: cambiando a mano
`ROUND_HALF_UP` por `ROUND_HALF_EVEN` en el reparto del depósito vivo fallaron 2
tests (`a live deposit earns…` y `the total adds only live products…`); lo devolví a
su estado y volvieron a pasar.

## Cambios tras la review (2026-11-04)

Cambio requerido 1 de `progress/reviews/investments-gains.md` (los tests de R8 que
faltaban). Los cambios 2, 3 y 4 son de documentos y los hace el leader; no los he
tocado.

- Dos tests nuevos en `investments.gains.test.ts`:
  `a closed deposit whose maturity is ambiguous or below its principal has no figure and says why`
  y `a deposit with missing conditions has no figure and, while live, is listed in the total`.
  Mapeo en «Trazabilidad» (R8 y R13).
- **No han destapado ningún fallo**: pasaron a la primera y el código no ha cambiado.
- Comprobé que fallan si el código falla: quitando a mano la condición `term <= 0`
  falla el de `missing_conditions`; haciendo que `below_principal` devuelva el
  importe del movimiento como `currentValue` falla el de `ambiguous` /
  `below_principal`. Devolví el código a su estado (`git diff --stat` del servicio
  igual que antes) y volvieron a pasar.
- Los nombres nuevos no contienen ninguno de los nombres que filtran los `checks`:
  cada check sigue ejecutando un solo test (`Tests  1 passed | 12 skipped (13)`).

## Documentos actualizados

```
git grep -n "investments/deposits" -- . ':!progress' ':!specs' ':!docs/api-contract.md' ':!feature_list.json'
git grep -n "/api/investments/" -- src
```

- `docs/api-contract.md`: la introducción de §«Inversiones — quién las escribe y
  quién las lee» y la de `GET /api/investments/overview` enumeraban los lectores bajo
  `/api/investments`; ahora citan también `GET /api/investments/gains`.
- `src/modules/investments/investments.routes.ts`: el comentario con la lista de
  rutas incluye la nueva.
- Resto de coincidencias (`docs/architecture.md:3062`,
  `docs/myinvestor-product-files.md:160`, tests de la F50): siguen siendo verdad.

- `README.md` (fuera del lote A, **autorizado por el leader** el 2026-11-04 solo
  para esto): añadida la fila de `GET /api/investments/gains` a la tabla de
  endpoints, tras la de `GET /api/investments/deposits` y con el mismo formato.

## Prueba real (si la feature lee datos de fuera)

No aplica en sentido estricto: la consulta no lee ningún archivo ni API externa,
solo la base de datos. No la he lanzado contra la base del humano: los tests no
pueden abrirla y no he arrancado el servidor contra ella. Para verlo con datos
reales haría falta `pnpm run dev` y un `GET /api/investments/gains`.

## Último ./init.sh

`./init.sh` (2026-11-04, tras los tests de la review), código de salida 0:

```
 Test Files  93 passed (93)
      Tests  1515 passed (1515)
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

En la primera pasada (antes de la review) `src/no-real-data.test.ts` señaló un
importe inventado de `investments.gains.test.ts` (el `moneyOut` de la foto de la
cuenta remunerada) que coincidía con uno de la base del humano. Lo cambié por otro
valor inventado (y el `balance` para que la foto siga cuadrando).

## Último ./init.sh --checks (si la feature tiene checks)

`./init.sh --checks` (2026-11-04, tras los tests de la review), código de salida 0.
Los 15 comandos sobre `investments.gains.test.ts` salieron `exit 0` con
`Tests  1 passed | 12 skipped (13)`; el de `investments.gains.docs.test.ts` con
`Tests  1 passed (1)`; el último (`pnpm test`), `exit 0`. Línea final:

```
[OK]    Checks: 17 de 17 en verde.
```

## Sugerencias fuera de scope (NO aplicadas)

- **Depósito con `principal` 0:** `readNumberField` del parser de MyInvestor solo
  pide un número finito, y no he encontrado otra comprobación del signo (leído, no
  probado con un archivo). `gainPercent` dividiría por cero: comprobado con `tsx`
  que `new Prisma.Decimal('1.00').dividedBy(0).times(100).toDecimalPlaces(2,
  ROUND_HALF_UP).toFixed(2)` da `"Infinity"` sin lanzar, así que en
  `GET /api/investments/gains` saldría ese texto. El spec no lo trata; si se
  quiere cubrir, sería un caso más de `missing_conditions` o un rechazo en el parser.
