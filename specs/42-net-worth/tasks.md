# Tasks — F42 `net-worth`

## Lote A — valoración de inversiones (módulo investments)
Archivos: `src/modules/investments/investments.types.ts`,
`src/modules/investments/investments.service.ts`,
`src/modules/investments/investments.service.test.ts`
Depende de: —

- [x] T1 — Tipos del lado net-worth en `investments.types.ts`
      (`NetWorthIssueReason`, `NetWorthIssue`, los tres `*NetWorthProduct`,
      `InvestmentsNetWorth`), sección comentada "Read side (feature 42)".
      Cubre: R3, R4, R5, R7, R8, R9.
- [x] T2 — `getInvestmentsNetWorth(prisma, today)` en `investments.service.ts`
      (solo `find*`, design §6): cerrado fuera (R6), fluctuante =
      marketValue + uninvestedCash con NULL → solo marketValue (R3), depósito =
      principal sin expectedGain (R4), remunerada = balance del último snapshot
      (R5), sin foto → value null + issue `no_valuation` (R7), foto anterior al
      primer día del mes anterior → suma + issue `stale_valuation` (R8),
      depósito vencido vivo → suma + issue `matured_not_closed` (R9), total en
      `Prisma.Decimal` y `toFixed(2)` (R10). Cubre: R3–R10.
- [x] T3 — Tests en `investments.service.test.ts` (BD desechable, fechas
      controladas vía el parámetro `today`): un caso por regla de valoración,
      uno por cada `reason`, el caso `uninvestedCash NULL`, el caso producto
      cerrado, y la aserción de que los importes salen tal como se guardaron
      (sin redondeo nuevo). Cubre: R3, R4, R5, R6, R7, R8, R9, R10.

## Lote B — endpoint, registro y contrato
Archivos: `src/modules/net-worth/net-worth.types.ts`,
`src/modules/net-worth/net-worth.schema.ts`,
`src/modules/net-worth/net-worth.service.ts`,
`src/modules/net-worth/net-worth.routes.ts`,
`src/modules/net-worth/net-worth.test.ts`,
`src/app.ts`, `docs/api-contract.md`
Depende de: Lote A

- [x] T4 — Módulo `src/modules/net-worth/`: tipos de la respuesta (importando
      `OverviewAccount` de overview.types), schema de querystring vacía,
      `netWorthDb` + `getNetWorth` (compone `listAccounts` +
      `getInvestmentsNetWorth`, suma los dos totales), ruta `GET /` solo
      lectura. Cubre: R1, R2, R10, R11, R12.
- [x] T5 — Registro en `src/app.ts` con `prefix: '/api/net-worth'`.
      Cubre: R1.
- [x] T6 — Tests de integración `net-worth.test.ts` (`app.inject`): forma de la
      respuesta y `asOf` (R1); mismo `balance` por cuenta que
      `GET /api/accounts` en la misma pasada y `accounts.total` = suma (R2);
      `total` = accounts + investments con dos decimales (R10); un parámetro
      de querystring desconocido se ignora (R11); `hasRoute` confirma que no
      existe POST/PATCH/DELETE bajo `/api/net-worth` (R12); y las suites de
      overview e investments quedan sin tocar — verificarlo lanzando la suite
      completa (R13). Cubre: R1, R2, R10, R11, R12, R13.
- [x] T7 — `docs/api-contract.md`: sección `GET /api/net-worth` (design §8),
      con el enum de `issues.reason`, el umbral de `stale_valuation` y el
      ejemplo con cifras inventadas; actualizar la referencia «la consulta de
      patrimonio neto es otra feature» de la sección F39. Cubre: R1, R7, R8,
      R9 (documentación del contrato).
