# Resumen — feature 67 `investments-gains`

Fecha de cierre: 2026-11-04
Intención original: `feature_list.json` → feature `investments-gains`, bloque `intent`
Spec (SDD): `specs/67-investments-gains/`

## Qué hace ahora la app que antes no

Hay una consulta nueva, `GET /api/investments/gains`, que dice por cada fondo, ETF,
cartera gestionada y depósito cuánto metiste, cuánto vale, cuánto ganas o pierdes en
€ y en % **desde que lo abriste**, y de qué fecha es el dato. Los vivos y los cerrados
salen en dos listas, y arriba el total de los vivos, con la fórmula de su % en el
contrato. Un depósito vivo gana su ganancia esperada repartida por días; uno
cancelado sale en cerrados con ganancia 0. Antes solo existía la foto de un mes
(`GET /api/investments/overview`). Solo lee: no guarda nada.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/investments/gains` — la ruta, a fecha de hoy en Madrid | [investments.routes.ts:61](../../src/modules/investments/investments.routes.ts#L61) |
| La consulta entera (vivo o cerrado, cifras, total) | [investments.service.ts:952](../../src/modules/investments/investments.service.ts#L952) |
| La forma de la respuesta | [investments.types.ts:553](../../src/modules/investments/investments.types.ts#L553) |
| Lo que lee el frontend: contrato de la ruta, con las fórmulas | [api-contract.md:2600](../../docs/api-contract.md#L2600) |

## Dónde está el código

### La consulta

| Qué hace | Dónde |
| --- | --- |
| Lee productos y fotos, llama a la regla de depósitos de la F50, separa vivos y cerrados, ordena y suma el total de los vivos | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `getInvestmentGains` |
| Fecha de cierre: `closedAt`, o en un depósito la primera entre `closedAt` y `maturityDate` | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `closingDate` |
| % a dos decimales, medio céntimo hacia arriba | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `percentOf` |
| Días naturales entre dos fechas | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `daysBetween` |
| Cifras de un fondo, ETF o cartera desde una foto, tal como está guardada | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `gainsFromPhoto` |
| Producto vivo; en un depósito, el reparto por días | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `gainsOfLiveProduct` |
| Producto cerrado: foto ≤ cierre, depósito vencido, cancelado o sin cobro | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `gainsOfClosedProduct` |
| Depósito sin cifras, con su motivo | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `depositWithoutFigures` |
| Entrada de `closed` con `closedOn` | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `withClosedOn` |
| Identidad común de cada producto | [investments.service.ts](../../src/modules/investments/investments.service.ts) → `gainsCommon` |

### Ruta, esquema y tipos

| Qué hace | Dónde |
| --- | --- |
| `GET /gains` bajo el prefijo `/api/investments` | [investments.routes.ts](../../src/modules/investments/investments.routes.ts) → `investmentsRoutes` |
| Querystring vacío (lo desconocido se ignora) | [investments.schema.ts](../../src/modules/investments/investments.schema.ts) → `getInvestmentGainsSchema` |
| Tipos de la respuesta | [investments.types.ts](../../src/modules/investments/investments.types.ts) → `GainsReason`, `GainsProductCommon`, `FluctuatingGainsProduct`, `DepositGainsProduct`, `GainsProduct`, `ClosedGainsProduct`, `ExcludedFromGainsTotal`, `InvestmentGainsTotal`, `InvestmentGainsResponse` |

### Documentación

| Qué hace | Dónde |
| --- | --- |
| Sección de la ruta (fórmulas, motivos, ejemplo) y los dos párrafos de lectores | [api-contract.md](../../docs/api-contract.md) → `GET /api/investments/gains` |
| La decisión y sus alternativas | [architecture.md](../../docs/architecture.md) → ADR-043 |
| Fila de la tabla de endpoints | [README.md](../../README.md) → `/api/investments/gains` |
| Nombres aprobados de la ruta, campos y motivos | [vocabulary.md](../../docs/vocabulary.md) → fila de la feature 67 |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Ruta, base vacía, parámetro desconocido ignorado | [investments.gains.test.ts](../../src/modules/investments/investments.gains.test.ts) → `answers asOf, total, live and closed for today` |
| Fondo con foto de hace dos meses; foto futura no usada | ídem → `a live fund whose last photo is from an earlier month comes with that photo and its date` |
| Cuentas remuneradas fuera | ídem → `leaves savings accounts out of the lists and the total` |
| Reparto por días (mitad de plazo, primer día, sin apertura) | ídem → `a live deposit earns its expected gain spread over the days since it opened` |
| Cancelado en cerrados con 0 | ídem → `a deposit cancelled before maturity comes in closed with no gain` |
| Vencido con cobro (también sin `closedAt`) | ídem → `a matured deposit with its payment found comes with what it earned` |
| Vencido sin cobro | ídem → `a matured deposit without its payment comes with no figure and the reason` |
| Vencido `ambiguous` y `below_principal` | ídem → `a closed deposit whose maturity is ambiguous or below its principal has no figure and says why` |
| `missing_conditions` vivo y cerrado (plazo 0 y negativo incluidos) | ídem → `a deposit with missing conditions has no figure and, while live, is listed in the total` |
| Fondo vendido con su foto ≤ cierre | ídem → `a sold fund comes in closed with its last photo before closing and does not add to the total` |
| Huecos de una foto: `no_photo`, `gain_not_reported`, `gain_percent_not_reported` | ídem → `a figure that cannot be obtained is null with its reason and the total lists the product` |
| Total y su % | ídem → `the total adds only live products and its percent is gain over invested` |
| No escribe nada | ídem → `writes nothing in the database` |
| El contrato publica la sección y las fórmulas | [investments.gains.docs.test.ts](../../src/modules/investments/investments.gains.docs.test.ts) → `the contract describes GET /api/investments/gains with the formula of its percent` |

## Cumplimiento de la intención

Resultado real de `./init.sh --checks` del 2026-11-04: 17 de 17 en verde.

- ✅ «Un fondo cuya última foto es de un mes anterior sale con esa foto y su fecha» → `a live fund whose last photo…`. Check ✅.
- ✅ «Las cuentas corrientes y remuneradas no salen» → `leaves savings accounts…`. Check ✅.
- ✅ «Un depósito vivo… ganancia repartida por días, capital invertido, suma al total» → `a live deposit earns…` y `the total adds only live products…`. Checks ✅ ✅.
- ✅ «Un depósito cancelado antes de vencer pasa a cerrados y su ganancia no cuenta» → `a deposit cancelled before maturity…`. Check ✅.
- ✅ «Cada producto cerrado sale con cuándo se cerró, su valor y lo que ganó o perdió» → `a sold fund…`, `a matured deposit with its payment found…`, `a deposit cancelled…`. Checks ✅ ✅ ✅.
- ✅ «Depósito vencido con su cobro: lo que ganó; sin cobro, sin cifra y con el motivo» → `a matured deposit with…` y `a matured deposit without…`. Checks ✅ ✅.
- ✅ «Un fondo vendido sale en cerrados con su última foto antes del cierre, y no suma» → `a sold fund…`. Check ✅.
- ✅ «Si una cifra no se puede sacar, sale vacía con un motivo, nunca 0, y el total dice qué no sumó» → `a figure that cannot be obtained…` (más los dos tests de motivos de depósito, sin check propio). Check ✅.
- ✅ «El total suma solo los vivos y la fórmula de su % está en el contrato» → `the total adds only live products…` y el test del contrato. Checks ✅ ✅.
- ✅ «Nada se escribe en la base» → `writes nothing in the database`. Check ✅.
- ✅ (añadido) La ruta responde y lo de siempre sigue igual → `answers asOf…` y `pnpm test` (1515 tests en verde). Checks ✅ ✅.

## Decisiones que se tomaron por ti

- (delegado) Ruta nueva y no ampliar `overview`: ADR-043.
- (delegado, aprobado en la puerta) Reparto lineal por días naturales, redondeo al céntimo hacia arriba.
- (delegado, aprobado) % del total = ganancia ÷ invertido de los vivos que entran, con el capital de los depósitos vivos dentro.
- (añadido) El % de un depósito es lo ganado sobre su capital, no la TAE.
- (añadido) Un depósito vivo sin apertura, sin ganancia esperada o con fechas al revés sale con `missing_conditions` y fuera del total.
- (añadido, en el informe del implementer) `valuedAt` es `null` cuando no hay cifras, y en un depósito sin cifras `invested` sigue siendo su capital: escrito en el contrato.

## Qué NO se tocó / quedó fuera

- `GET /api/investments/overview`, `GET /api/investments/deposits` y `GET /api/net-worth` siguen igual.
- Sin migraciones ni columnas nuevas. Sin series ni evolución en el tiempo.
- El frontend (su feature 40) se hace en su propia sesión contra el contrato publicado.
  **La sección `GET /api/investments/gains` de `docs/api-contract.md` ya está publicada**:
  la sesión del frontend puede relanzar el spec de su feature 40 (consecuencia 📌 de
  `specs/67-investments-gains/decisions.md`).

## Notas para el futuro

- Un depósito con `principal` 0 daría `gainPercent` `"Infinity"`: el spec no lo trata (sugerencia del implementer, no aplicada).
- Diferencias aceptadas con `Net Worth`: un depósito vivo vale aquí capital + ganancia repartida y allí solo el capital; un vencido sin `closedAt` está aquí en cerrados y allí sigue sumando con su aviso.
