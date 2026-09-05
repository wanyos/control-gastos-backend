# investments-overview — implementación

> F39, implementada el 2026-09-05 contra el spec aprobado
> (`specs/39-investments-overview/`). Todas las cifras citadas aquí y en los
> tests son inventadas.

## Archivos modificados / creados

| Archivo | Qué |
| --- | --- |
| [`src/modules/investments/investments.types.ts`](../../src/modules/investments/investments.types.ts) | modificado — tipos de la query y de la respuesta (T1); la parte de escritura no se tocó |
| [`src/modules/investments/investments.schema.ts`](../../src/modules/investments/investments.schema.ts) | nuevo — querystring con `month` (patrón F38), `productId` (entero ≥ 1), `type` (enum de 5), `additionalProperties: false` (T2) |
| [`src/modules/investments/investments.service.ts`](../../src/modules/investments/investments.service.ts) | modificado — `investmentsDb` + `getInvestmentsOverview` y serializadores, añadidos debajo de los escritores, que quedan intactos (T3, T4) |
| [`src/modules/investments/investments.routes.ts`](../../src/modules/investments/investments.routes.ts) | nuevo — plugin con el único `GET /overview` (T5) |
| [`src/modules/investments/investments.routes.test.ts`](../../src/modules/investments/investments.routes.test.ts) | nuevo — 18 tests de integración con `app.inject()` (T6–T9) |
| [`src/app.ts`](../../src/app.ts) | modificado — `app.register(investmentsRoutes, { prefix: '/api/investments' })` (T5) |
| [`docs/api-contract.md`](../../docs/api-contract.md) | modificado — sección `GET /api/investments/overview` completa y la nota «Inversiones — se ESCRIBEN, todavía no se LEEN» pasa a «quién las escribe y quién las lee» (T10) |
| `specs/39-investments-overview/tasks.md` | las 10 tasks marcadas `[x]` |

Cero cambios en `prisma/schema.prisma`, cero migraciones, cero dependencias
nuevas.

## Decisiones tomadas

1. **`change.percentPoints` se serializa con `Decimal.toString()`, no con
   `toFixed(2)`.** El design §5 fija `toString()` para los porcentajes («sin
   relleno de ceros»), pero su ejemplo §6 muestra `"0.90"`. Las dos cosas no
   pueden ser verdad a la vez (4.07 − 3.17 = `"0.9"` con `toString()`). Elegí
   la regla sobre el ejemplo: un `toFixed(2)` redondearía una diferencia con
   cuatro decimales (los `gainPercent` son `Decimal(7,4)`), que es exactamente
   lo que R2/decisions ✅ prohíben. El ejemplo del contrato quedó escrito con
   `"0.9"` para que no vuelva a divergir.
2. **`productId` existente pero cerrado antes del periodo → 200 con `products`
   vacío, no 404.** El design §4 dice «si se pidió `productId` y no hay fila →
   404», pero R11 acota el 404 a un id «que no corresponde a ningún
   `InvestmentProduct`». Un producto cerrado existe (R9 solo lo saca de la
   lista), así que la existencia se comprueba sin el filtro de vigencia y el
   filtro se aplica después. Es el mismo criterio de movements: filtro válido
   con resultado vacío = 200.
3. **Exclusión de la suma decidida por el componente en euros.** R8 define
   `fluctuation` como Σ de variaciones **en euros**; por eso un producto con
   `gain` presente en ambas fotos pero `gainPercent` `NULL` sí suma (y su
   `percentPoints` va a `null`), y uno con `gain` `NULL` va a `excluded` como
   `gain_not_reported` aunque sus porcentajes se puedan restar (que se restan
   y se muestran). Hay test de las dos caras.
4. **T9 («no ejecuta escrituras») probado por ejecución, no por lectura de
   código:** se fotografían las tres tablas antes y después del `GET`
   (`findMany` completo, con `updatedAt`) y se exige igualdad profunda. Además
   `app.hasRoute` verifica que bajo `/api/investments` solo existe el `GET`.
5. `currentMonth()` / `monthRange()` **importadas** de
   `overview.service.ts` (design §3): una sola resolución de mes en el backend.

## Trazabilidad (R → test)

Todos en [`src/modules/investments/investments.routes.test.ts`](../../src/modules/investments/investments.routes.test.ts):

- **R1** (200 con `{period, products, periodGain}`, mes en curso por defecto) →
  `defaults to the current month when no month is sent`; forma completa en
  `returns the stored photos verbatim…`
- **R2** (foto verbatim, sin recalcular: `gain` sembrado ≠ `marketValue −
  invested` y vuelve intacto) → `returns the stored photos verbatim with the
  change measured on gain, in euros and percent points`
- **R3** (previousValuation con su fecha; change = diferencia de `gain` y de
  `gainPercent`) → el mismo test, y `takes the LATEST photo of the period when
  a month holds two, and the earlier one as previous`
- **R4** (componente no computable → `null`, nunca cero) → `nulls exactly the
  component whose gain is missing, and excludes only when the euro sum is
  impossible`
- **R5** (depósito con `conditions` y SIN `valuation`/`previousValuation`/
  `change`) → `returns a deposit with its four conditions and WITHOUT
  valuation, previousValuation or change`
- **R6** (snapshot de la cuenta remunerada tal cual) → `counts the interest of
  a savings account in the month its photo was paid, added to the fluctuation`
- **R7** (sin foto del periodo: `null` + `excluded`, la anterior solo como
  anterior) → `flags a product without a photo in the period instead of
  passing the previous one off as current`; para la cuenta remunerada, `flags
  a savings account without a photo in the period`
- **R8** (`fluctuation`/`interest`/`total` y los tres motivos de `excluded`) →
  `counts the interest…` (suma mixta 120.50 + 8.40 = 128.90), `flags the first
  photo of a series…` (`no_previous_photo`), `nulls exactly the component…`
  (`gain_not_reported`), `flags a product without a photo…`
  (`no_photo_in_period`)
- **R9** (cerrado antes del periodo fuera; dentro del periodo o después,
  dentro) → `leaves a product closed before the period out, and keeps one
  closed inside it`
- **R10** (`?productId=` limita lista y suma) → `limits products and
  periodGain to the productId asked for`
- **R11** (`productId` inexistente → 404 `NOT_FOUND`) → `answers 404 NOT_FOUND
  for a productId that does not exist`
- **R12** (`?type=` filtra, combinable) → `filters by type, combinable with
  month`
- **R13** (cualquier mes pedido) → todos los tests de `?month=` (2026-07,
  2026-06, 2024-02) y `answers a period with no photo at all with 200 and
  zeroed sums, never an error`
- **R14** (mes/tipo/id mal formados → 400 `VALIDATION_ERROR`) → `rejects a
  malformed month, a type outside the enum and a bad productId with 400
  VALIDATION_ERROR`; parámetro desconocido ignorado → `ignores an unknown
  querystring parameter, same as GET /api/overview`
- **R15** (solo lectura, superficie intacta) → `exposes no write surface: only
  GET /overview exists under /api/investments` y `writes nothing while
  answering: the three investment tables are byte-identical after the read`;
  `GET /api/accounts` lo cubre además su propia suite, que pasa entera sin
  tocarse (56 archivos / 1098 tests en verde).

## Último ./init.sh

Ejecutado completo el 2026-09-05, todo en verde:

```
Test Files  56 passed (56)
     Tests  1098 passed (1098)
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

(El archivo nuevo aporta 18 tests; antes de la feature la suite tenía 55
archivos / 1080 tests.)

## Sugerencias fuera de scope (NO aplicadas)

- El guardián de rutas sin acceso a datos de `src/architecture.test.ts`
  (`keeps the flow module routes free of data access`) lista las rutas una a
  una; `investments.routes.ts` cumple el mismo patrón (`investmentsDb`) pero no
  está en esa lista. Añadirlo es una línea en un test que no es de esta
  feature.
- `docs/roadmap.md` menciona como cabo suelto 12 que nada lee la capa de
  inversiones; con esta feature queda cerrado, pero tachar la fila es del
  leader al cerrar.
