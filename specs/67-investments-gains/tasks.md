# Tasks — F67 `investments-gains`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto**, ser únicos en
> su archivo y ejecutarse.
>
> **Ningún dato del humano en tests ni en ejemplos** (`docs/conventions.md` §Tests):
> importes, nombres de producto y conceptos inventados.
>
> Los nombres de ruta, campos y motivos los aprobó el humano el 2026-11-04.
>
> Un solo lote: ~9 tasks sobre el mismo módulo; partirlo cuesta más de lo que ahorra.

## Lote A — la consulta, sus tests y su documentación
Archivos: `src/modules/investments/investments.service.ts`, `src/modules/investments/investments.types.ts`, `src/modules/investments/investments.schema.ts`, `src/modules/investments/investments.routes.ts`, `src/modules/investments/investments.gains.test.ts`, `src/modules/investments/investments.gains.docs.test.ts`, `docs/api-contract.md`, `docs/architecture.md`
Depende de: —

- [x] T1 — Tipos de la respuesta en `investments.types.ts` (`design.md` §3). Cubre: R1, R8.
- [x] T2 — `getInvestmentGains` en `investments.service.ts` (`design.md` §2), reutilizando `getDepositEarnings`; solo `find*`. Cubre: R2–R13, R16.
- [x] T3 — `getInvestmentGainsSchema` y `GET /gains` en `investments.routes.ts` con `todayInMadridAsDate()` y los `depositMaturityMatchers` del plugin. Cubre: R1.
- [x] T4 — Tests en `investments.gains.test.ts` (base de tests, `today` fijo inyectado al servicio; uno por la ruta HTTP):
  - "answers asOf, total, live and closed for today" — R1 (incluye base sin productos y parámetro desconocido ignorado).
  - "a live fund whose last photo is from an earlier month comes with that photo and its date" — R4 (foto de dos meses atrás, una foto con fecha posterior a hoy no se usa; `uninvestedCash` aparte).
  - "leaves savings accounts out of the lists and the total" — R2 (una `savings_account` con `SavingsSnapshot` no aparece ni suma).
  - "a live deposit earns its expected gain spread over the days since it opened" — R6 (a mitad de plazo, en su primer día —0—, redondeo mitad hacia arriba, `currentValue` = capital + ganancia; sin `openedAt` → `missing_conditions`).
  - "a deposit cancelled before maturity comes in closed with no gain" — R3, R16 (`closedOn` = `closedAt`, ganancia `"0.00"`, no suma al total).
  - "a matured deposit with its payment found comes with what it earned" — R3, R7 (incluye uno sin `closedAt` y vencido: va a `closed` con `closedOn` = `maturityDate`).
  - "a matured deposit without its payment comes with no figure and the reason" — R8 (`maturity_not_found`).
  - "a sold fund comes in closed with its last photo before closing and does not add to the total" — R3, R5, R9 (una foto posterior al `closedAt` no se usa).
  - "a figure that cannot be obtained is null with its reason and the total lists the product" — R8, R13 (`no_photo`, `gain_not_reported`, `gain_percent_not_reported`; ninguna cifra a `0`).
  - "the total adds only live products and its percent is gain over invested" — R9–R12 (dos fondos y un depósito vivo con su ganancia repartida y su capital dentro; un fondo cerrado y un depósito vencido que no suman; `gainPercent` redondeado; `null` sin ningún vivo que entre).
  - "writes nothing in the database" — R14 (recuento y `updatedAt` máximo de `InvestmentProduct`, `Valuation` y `Movement` antes y después).
- [x] T5 — `docs/api-contract.md`: sección `GET /api/investments/gains` tras la de `deposits` (qué es, sin parámetros, vivo/cerrado y fecha de cierre, cifras por tipo con el **reparto por días** del depósito vivo y el cancelado, motivos, total y **fórmula del %**, ejemplo de respuesta con cifras inventadas que cuadren, errores); línea del lector nuevo en §«Inversiones — quién las escribe y quién las lee». Cubre: R15.
- [x] T6 — Test en `investments.gains.docs.test.ts`:
  - "the contract describes GET /api/investments/gains with the formula of its percent" — R15 (la sección existe, nombra los 7 motivos, escribe las dos fórmulas, y el ejemplo JSON parsea y su `total` cuadra con sus `live`).
- [x] T7 — `docs/architecture.md`: ADR-043 (`design.md` §6). Cubre: R1, R6, R11.
- [x] T8 — `pnpm test` entero en verde (overview, deposits y net-worth sin cambios; guardianes de `src/architecture.test.ts`). Cubre: R1–R16.
