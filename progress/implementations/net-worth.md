# net-worth — implementación

> Feature 42, spec aprobado el 2026-09-06 (5 decisiones confirmadas sin
> cambios). Implementada el 2026-09-06. Todas las cifras de los tests y del
> ejemplo del contrato son inventadas (ADR-017).

## Archivos modificados / creados

**Modificados**

- [`src/modules/investments/investments.types.ts`](../../src/modules/investments/investments.types.ts) — sección nueva «Read side (feature 42)»: `NetWorthIssueReason`, `NetWorthIssue`, `FluctuatingNetWorthProduct`, `DepositNetWorthProduct`, `SavingsNetWorthProduct`, `NetWorthProduct`, `InvestmentsNetWorth` (T1).
- [`src/modules/investments/investments.service.ts`](../../src/modules/investments/investments.service.ts) — `getInvestmentsNetWorth(prisma, today)`, solo `find*`, en el lado de lectura; la lectura de las tres tablas de inversión sigue viviendo únicamente en este archivo (el test de arquitectura de ADR-026 no se tocó y pasa) (T2).
- [`src/modules/investments/investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) — bloque nuevo con 9 tests de valoración, reloj fijado por el parámetro `today` (T3).
- [`src/app.ts`](../../src/app.ts) — `app.register(netWorthRoutes, { prefix: '/api/net-worth' })` (T5).
- [`docs/api-contract.md`](../../docs/api-contract.md) — sección `### GET /api/net-worth` completa (reglas de valoración, tabla del enum de `issues.reason`, umbral exacto de `stale_valuation`, ejemplo con cifras inventadas, nota «solo existe el GET»); actualizadas las dos referencias de la F39 («lo que sigue sin existir…» en §Inversiones y «la consulta de patrimonio neto es otra feature» en la vista de inversiones). La frase «único endpoint bajo `/api/investments`» queda como estaba: sigue siendo cierta, el nuevo cuelga de `/api/net-worth` (T7).

**Creados** (T4, T6)

- [`src/modules/net-worth/net-worth.types.ts`](../../src/modules/net-worth/net-worth.types.ts) — `NetWorthResponse` y `NetWorthAccounts`; importa `OverviewAccount` de overview.types (un solo dueño de la forma) e `InvestmentsNetWorth` de investments.types.
- [`src/modules/net-worth/net-worth.schema.ts`](../../src/modules/net-worth/net-worth.schema.ts) — querystring vacía con `additionalProperties: false`: todo parámetro desconocido se descarta antes del handler.
- [`src/modules/net-worth/net-worth.service.ts`](../../src/modules/net-worth/net-worth.service.ts) — `netWorthDb` + `getNetWorth`: compone `listAccounts` + `getInvestmentsNetWorth` y suma en `Prisma.Decimal`. No nombra ningún modelo Prisma de inversiones.
- [`src/modules/net-worth/net-worth.routes.ts`](../../src/modules/net-worth/net-worth.routes.ts) — `GET /` con el schema; sin POST/PATCH/DELETE.
- [`src/modules/net-worth/net-worth.test.ts`](../../src/modules/net-worth/net-worth.test.ts) — 5 tests de integración con `app.inject`.

## Decisiones tomadas

- **`staleBefore` se deriva del parámetro `today`, no de `currentMonth()` del
  reloj de pared.** El design §6 citaba `currentMonth()`/`monthRange()`, pero su
  propia firma (§4) dice que `today` se inyecta «para que los tests fijen el
  reloj»: derivar el umbral del reloj real rompería exactamente eso. Se calcula
  `Date.UTC(año, mes − 1, 1)` sobre `today`. Mismo umbral, misma semántica.
- **`matured_not_closed` se emite aunque `principal` fuera `NULL`** (caso que el
  parser impide): el aviso habla del vencimiento, no del capital, y callarlo
  ocultaría el posible doble conteo. `value` queda `null` y no suma, tal como
  fija el design («sin issue nuevo» = sin motivo nuevo en el enum).
- El comparador de fecha de `stale` es `<` estricto sobre `staleBefore` (una
  foto del día 1 del mes pasado NO es vieja), con test que fija ambos lados del
  umbral.

## Trazabilidad

Tests de `investments.service.test.ts` (bloque `getInvestmentsNetWorth`) y de
`net-worth.test.ts` (bloque `GET /api/net-worth`):

- R1 → `answers 200 with asOf (today, UTC), total and the two blocks (R1)`
- R2 → `shows each account with the SAME balance as GET /api/accounts, and their sum (R2)`
- R3 → `values a fluctuating product as marketValue + uninvestedCash of its most recent photo (R3)` y `adds only marketValue when the photo carries no uninvestedCash — no invented zero (R3)`
- R4 → `values a live deposit by its principal, without adding expectedGain (R4)`
- R5 → `values a savings account by the balance of its most recent snapshot (R5)`
- R6 → `neither lists nor sums a closed product (R6)`
- R7 → `lists a product without any photo as a null gap, out of the sum, with its reason (R7)` (incluye la foto con `date` posterior a hoy, que también es hueco)
- R8 → `still sums a photo older than the first day of last month, but warns with its date (R8)`
- R9 → `keeps summing a matured deposit that is still open, and warns about it (R9)`
- R10 → `serializes every amount exactly as stored and sums in Decimal, rounding nothing (R10)` y `publishes total = accounts.total + investments.total, two decimals (R10)`
- R11 → `ignores an unknown querystring parameter: the endpoint has none (R11)` (incluye un `?date=` que se descarta)
- R12 → `exposes no write surface: only GET exists under /api/net-worth (R12)`; además `getInvestmentsNetWorth` es `find*` de punta a punta y la comprobación de `vitest.global-setup.ts` (base del humano intacta) pasó en la suite completa
- R13 → verificado lanzando la suite completa con `./init.sh`: las suites de `overview.test.ts` e `investments` pasan sin haber modificado una sola aserción suya (58 archivos, 1139 tests, todos en verde)

## Último ./init.sh

Ejecutado el 2026-09-06, completo (los 7 pasos):

```
 Test Files  58 passed (58)
      Tests  1139 passed (1139)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

## Sugerencias fuera de scope (NO aplicadas)

- Añadir los 5 archivos de `src/modules/net-worth/` a la lista «target tree» de
  `src/architecture.test.ts` (la lista solo comprueba existencia y solo crece;
  overview y transfers están listados). No se tocó porque el archivo no está en
  la lista de archivos del spec.
- La prueba real contra la base del humano (comparar el total con sus cifras)
  queda para su checklist, como en las features 39-41.
