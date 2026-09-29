# Tasks — F50 `deposit-earnings`

> Un solo lote: el reconocedor de MyInvestor son dos tasks y `app.ts` depende de él;
> partirlo cuesta más coordinación de la que ahorra.

## Lote A — reconocedor, lectura y contrato
Archivos: `src/modules/myinvestor/myinvestor.deposit-maturity.ts`, `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts`, `src/modules/investments/investments.types.ts`, `src/modules/investments/investments.service.ts`, `src/modules/investments/investments.schema.ts`, `src/modules/investments/investments.routes.ts`, `src/modules/investments/investments.deposits.test.ts`, `src/app.ts`, `docs/api-contract.md`, `docs/myinvestor-product-files.md`
Depende de: —

- [x] T1 — `isMyinvestorDepositMaturity` (`design.md` §4). Cubre: R11.
- [x] T2 — Tests del reconocedor: `INTERESES DEP.: <número inventado>` sí, con espacios delante sí; `APERTURA DEP.: …`, `CANCELACION DEP:…` y una descripción cualquiera no. Cubre: R11.
- [x] T3 — Tipos de `design.md` §2 en `investments.types.ts`. Cubre: R1, R2.
- [x] T4 — `getDepositEarnings(prisma, matchers, today)` con el orden de decisión de `design.md` §3, dos consultas `find*` y aritmética en `Prisma.Decimal`. Cubre: R1-R10, R12, R13, R14.
- [x] T5 — `getDepositEarningsSchema`, `GET /deposits` con `today` UTC y la opción `depositMaturityMatchers`; registro `depositMaturityMatchers` en `app.ts` pasado a `investmentsRoutes`. Cubre: R1, R11.
- [x] T6 — Tests de lista y forma: sin depósitos → `deposits: []`, `total: "0.00"`; varios depósitos (vivo, vencido, cerrado hace meses) salen todos, en el orden de R1, con sus condiciones tal cual; `asOf` es el «hoy» inyectado; un parámetro desconocido se ignora (200; ver design.md §5). Cubre: R1, R2, R9.
- [x] T7 — Tests de estado: vivo → `active` sin cifra aunque haya un vencimiento ese día futuro sembrado; vencido con un candidato → `matured`, `earned` = importe − principal y `maturity` con el id; vencido sin candidato → `maturity_not_found`; dos candidatos → `ambiguous` con ids ascendentes; `closedAt` antes de `maturityDate` → `cancelled` aunque haya candidato; candidato por debajo del principal → `below_principal` con `maturity`; vence hoy → se busca. Todo con importes inventados. Cubre: R3, R4, R5, R6, R7, R8.
- [x] T8 — Tests del enlace: candidato en una cuenta de otro banco, de `type` `expense`, en otra fecha, o con descripción de apertura/cancelación → no cuenta; dos vencimientos con el mismo número inventado en fechas distintas → cada depósito el suyo; candidato con `excludedFromTotals` `true` y `false` → los dos se encuentran; vencimiento sin producto (depósito sin `.json`) → no aparece, `total` igual, `200`; `total` suma solo los `matured`. Cubre: R9, R10, R12, R13.
- [x] T9 — Test de solo lectura: `amount`, `excludedFromTotals`, `productId`, `transferId` y `updatedAt` de los movimientos sembrados, el `balance` de `GET /api/accounts` y los productos, idénticos antes y después de la petición. Cubre: R14.
- [x] T10 — Un test por la ruta real de `buildApp()` (registro de `app.ts`, reconocedor real) con un vencimiento `INTERESES DEP` inventado en una cuenta sintética de banco `myinvestor`. Cubre: R4, R11.
- [x] T11 — `docs/api-contract.md`: sección `GET /api/investments/deposits` (cifras inventadas) y corrección de «el único endpoint» en §`GET /api/investments/overview`; nota en la plantilla B de `docs/myinvestor-product-files.md` (`design.md` §1). Cubre: R15.
