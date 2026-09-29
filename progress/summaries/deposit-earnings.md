# Resumen — feature 50 `deposit-earnings`

Fecha de cierre: 2026-09-28
Intención original: `feature_list.json` → feature `deposit-earnings`, bloque `intent`
Spec: `specs/50-deposit-earnings/`

## Qué hace ahora la app que antes no

Ahora puedes pedir la lista de tus depósitos que tienen su `.json` y, para cada uno que
ya venció, cuánto te generó: el importe con que venció en tu extracto de MyInvestor menos
el `principal` de su `.json`. También sale el total de todos. Se calcula cada vez que lo
pides y no se guarda nada: no cambia ningún saldo, ningún movimiento ni ningún producto.
Antes eso no se veía en ningún sitio, porque la F49 saca los vencimientos de las sumas.

## Por dónde se usa (puntos de entrada)

- `GET /api/investments/deposits` (sin parámetros; uno desconocido se ignora) →
  [investments.routes.ts:43](../../src/modules/investments/investments.routes.ts#L43).
- La función que calcula la respuesta →
  [`getDepositEarnings` — investments.service.ts:672](../../src/modules/investments/investments.service.ts#L672).
- La función de MyInvestor que dice si una descripción del extracto es un vencimiento
  (empieza por `INTERESES DEP`) →
  [`isMyinvestorDepositMaturity` — myinvestor.deposit-maturity.ts:11](../../src/modules/myinvestor/myinvestor.deposit-maturity.ts#L11).
- Donde se registra esa función por banco y se pasa a las rutas de inversiones →
  [`depositMaturityMatchers` — app.ts:85](../../src/app.ts#L85) (y su uso en la línea 111).

## Dónde está el código (para revisión directa)

### El cálculo

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| Lee los productos `deposit` y, si alguno ya tocaba, los movimientos `income` de esos días y bancos; decide el estado de cada uno y suma el total | `getDepositEarnings` | `src/modules/investments/investments.service.ts` |
| `closedAt` anterior a `maturityDate` = cancelado antes de vencer | `isCancelledBeforeMaturity` | `src/modules/investments/investments.service.ts` |
| Tipos de la respuesta y de la función por banco | `DepositMaturityMatcher`, `DepositMaturityMatcherRegistry`, `DepositEarningsStatus`, `DepositEarningsEntry`, `DepositEarningsResponse` | `src/modules/investments/investments.types.ts` |

### Lo que sabe MyInvestor

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| `INTERESES DEP` (con o sin espacios delante) sí; `APERTURA DEP` y `CANCELACION DEP` no | `isMyinvestorDepositMaturity` | `src/modules/myinvestor/myinvestor.deposit-maturity.ts` |

### La ruta y el registro

| Qué hace | Símbolo | Dónde |
| --- | --- | --- |
| `GET /deposits`; «hoy» = fecha UTC a medianoche | handler de `/deposits`, `InvestmentsRoutesOptions` | `src/modules/investments/investments.routes.ts` |
| Esquema sin parámetros | `getDepositEarningsSchema` | `src/modules/investments/investments.schema.ts` |
| Tercer registro por banco de `app.ts`, pasado a `investmentsRoutes` | `depositMaturityMatchers` | `src/app.ts` |

### Documentación

| Qué | Dónde |
| --- | --- |
| La consulta: condiciones del movimiento del vencimiento, los seis `status`, orden, total, ejemplo con cifras inventadas; «el único endpoint» corregido en dos sitios | `docs/api-contract.md` §`GET /api/investments/deposits` |
| En la plantilla B: `maturityDate` es lo que une el depósito con su vencimiento; cancelar antes de tiempo se dice con `closedAt` | `docs/myinvestor-product-files.md` |
| Índice de endpoints | `README.md` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Lista y forma, cada `status`, cómo se encuentra el vencimiento, total, solo lectura y la ruta real de `buildApp()` (25 tests) | `src/modules/investments/investments.deposits.test.ts` |
| La función de MyInvestor (5 tests) | `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts` |
| El archivo nuevo de MyInvestor no nombra `prisma` | `src/architecture.test.ts` — `keeps the myinvestor parser module free of data access` |
| Nombre del test de «no hay escritura» ajustado ahora que hay dos `GET` | `src/modules/investments/investments.routes.test.ts` — `exposes no write surface: no POST, PATCH, PUT or DELETE on /overview or /api/investments` |

## Cumplimiento de la intención

- ✅ «Para un depósito con su .json que ya venció, veo lo que me generó: el importe con
  que venció en el extracto menos el principal de su .json» → `gives a matured deposit
  amount minus principal, with the linked movement (R4)` y `links a real MyInvestor
  maturity through the registry of app.ts (R4, R11)`. En tu base (solo `GET`,
  2026-09-28): el depósito ya vencido sale con cifra y los otros dos como vivos.
- ✅ «Un depósito que sigue vivo no sale con una ganancia inventada ni negativa» →
  `keeps a live deposit active with no figure… (R3)`; y si el vencimiento trae menos
  que el principal no hay cifra: `says below_principal… (R8)`.
- ✅ «Los depósitos antiguos sin .json no salen con ninguna cifra ni dan error» →
  `leaves out a maturity whose deposit has no product file, and still answers (R10)`.
- ✅ «docs/api-contract.md describe lo nuevo» → sección
  `GET /api/investments/deposits`, comprobada contra el código.

Lo que no querías: no se escribe nada en la base (`writes nothing while answering
(R14)`), el número del concepto no se lee (`links each deposit only to the maturity on
its own date, whatever the number says (R12)`) y la marca de la F49 ni se lee ni se
cambia (`finds a candidate whether excludedFromTotals is true or false (R13)`).

## Decisiones que se tomaron por ti

- (delegado) Consulta propia `GET /api/investments/deposits`, fuera de la vista mensual.
- (delegado) El vencimiento se busca por fecha exacta: `bookingDate` = `maturityDate`,
  mismo banco, `income` y descripción `INTERESES DEP`. Sin días de margen.
- (delegado) Cancelar antes de vencer se dice con `closedAt` en el `.json`.
- (añadido) Estados sin cifra: `maturity_not_found`, `ambiguous` (con los ids),
  `below_principal` (con el movimiento). Nunca un cero en su lugar.
- (añadido) Orden por `maturityDate`, del más reciente al más antiguo.
- Aceptado por el leader: un parámetro desconocido en la URL se ignora (200), como en
  las demás consultas, en vez del 400 que decía el diseño.

## Qué NO se tocó / quedó fuera

- Lo generado por los depósitos no entra en las sumas de ingresos ni en la ganancia
  del mes de `GET /api/investments/overview`: solo se ve en esta consulta.
- Sin migración; `Movement.productId` sigue sin escribirse.
- El frontend, en su propia sesión, contra `docs/api-contract.md`.

## Notas para el futuro

- `specs/50-deposit-earnings/design.md` §5 y la T6 siguen diciendo 400 para un
  parámetro desconocido; el código y el contrato dicen 200.
