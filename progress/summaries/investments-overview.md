# Resumen — feature 39 `investments-overview`

Fecha de cierre: 2026-09-05
Intención original: `feature_list.json` → feature `investments-overview`, bloque `intent`
Spec: `specs/39-investments-overview/` (aprobado por ti el 2026-09-05, las 6 decisiones confirmadas)

## Qué hace ahora la app que antes no

Los JSON de inversión que llevas meses subiendo por fin se pueden **leer**: una
consulta te enseña cada producto con su foto del mes (tal como la tecleaste,
sin recalcular nada), cuánto cambió desde la foto anterior (en euros y en
puntos de porcentaje, medido sobre TU número de ganancia, no sobre el valor de
mercado) y cuánto ganaste en total en el mes que pidas (fluctuación de los
fondos + intereses abonados en la cuenta remunerada). Si un mes falta la foto
de un producto, lo dice — hueco y motivo — en vez de darte el mes anterior por
bueno. Antes esos datos eran invisibles: se escribían y nadie los leía.

## Por dónde se usa (puntos de entrada)

- `GET /api/investments/overview` — todo junto, mes en curso. Handler en
  [investments.routes.ts:19](../../src/modules/investments/investments.routes.ts#L19),
  registrado en [app.ts:89](../../src/app.ts#L89).
- `GET /api/investments/overview?month=2026-07` — el mes que pidas.
- `?productId=3` — solo ese producto (inexistente → `404 NOT_FOUND`).
- `?type=deposit` — solo un tipo (`fund`/`etf`/`managed_portfolio`/`deposit`/`savings_account`).
- Los tres filtros se combinan; mal formados → `400 VALIDATION_ERROR`, nunca se
  adivina. Es el **único** endpoint bajo `/api/investments`: no hay POST, ni
  PATCH, ni DELETE — los datos siguen entrando solo por la importación.

## Dónde está el código (para revisión directa)

### La lectura (dentro del módulo `src/modules/investments/`, junto a los escritores de las F26/29, que no se tocaron)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| La consulta entera: productos vigentes del periodo, foto del mes y anterior, variación y suma del periodo | `getInvestmentsOverview` | [investments.service.ts:355](../../src/modules/investments/investments.service.ts#L355) |
| Punto único de acceso a datos (la ruta no toca `prisma`) | `investmentsDb` | [investments.service.ts](../../src/modules/investments/investments.service.ts) |
| Foto de un producto que fluctúa, tal cual se guardó (`toFixed(2)` los monetarios, `toString()` los porcentajes: ni relleno ni redondeo) | `serializeValuation` | [investments.service.ts](../../src/modules/investments/investments.service.ts) |
| Foto de la cuenta remunerada, tal cual | `serializeSavingsSnapshot` | [investments.service.ts](../../src/modules/investments/investments.service.ts) |
| Las cuatro condiciones de un depósito, tal cual | `depositConditions` | [investments.service.ts](../../src/modules/investments/investments.service.ts) |
| Capa HTTP: solo el `GET /overview` | `investmentsRoutes` | [investments.routes.ts](../../src/modules/investments/investments.routes.ts) |
| Validación del querystring (`month`, `productId`, `type`; lo desconocido se descarta) | `getInvestmentsOverviewSchema` | [investments.schema.ts](../../src/modules/investments/investments.schema.ts) |
| Tipos de la query y la respuesta: la forma de cada producto depende de su tipo, así un `null` nunca es ambiguo | `InvestmentsOverviewResponse`, `FluctuatingProductOverview`, `DepositProductOverview`, `SavingsProductOverview`, `PeriodGain` | [investments.types.ts](../../src/modules/investments/investments.types.ts) |

### Lo que reutiliza (no se tocó, solo se importa)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| La única resolución de mes del backend (`YYYY-MM` → primer/último día; mes en curso UTC), la misma de la F38 | `monthRange`, `currentMonth` | [overview.service.ts](../../src/modules/overview/overview.service.ts) |

### Registro

| Qué | Código |
| --- | --- |
| Registro del módulo con prefijo `/api/investments` (2 líneas) | [app.ts:89](../../src/app.ts#L89) |

### Tests (18 nuevos, todos vistos pasar uno a uno)

| Qué cubre | Código |
| --- | --- |
| Los importes vuelven **exactamente** como se guardaron (siembra un `gain` que a propósito no es `marketValue − invested`) y la variación se mide sobre `gain`/`gainPercent`, nunca sobre `marketValue` | [investments.routes.test.ts:120](../../src/modules/investments/investments.routes.test.ts#L120) |
| Intereses de la cuenta remunerada en el mes en que se abonaron, sumados a la fluctuación (una foto de otro mes no se cuela) | [investments.routes.test.ts](../../src/modules/investments/investments.routes.test.ts) |
| Depósito con sus cuatro condiciones y SIN `valuation`/`previousValuation`/`change` (los campos ni existen), jamás en `excluded` | [investments.routes.test.ts](../../src/modules/investments/investments.routes.test.ts) |
| Huecos: sin foto del periodo (`null` + `excluded`, la anterior solo con su propia fecha), primera foto de la serie, `gain` a `NULL`, periodo sin ninguna foto (200 con `"0.00"`) | [investments.routes.test.ts](../../src/modules/investments/investments.routes.test.ts) |
| Producto cerrado antes del periodo fuera de la lista y de las sumas; cerrado dentro del periodo, dentro; en un mes en que vivía, reaparece | [investments.routes.test.ts](../../src/modules/investments/investments.routes.test.ts) |
| Filtros `productId` y `type` (limitan lista Y suma), 404 para id inexistente, 400 para mes/tipo/id mal formados, mes en curso por defecto, parámetro desconocido ignorado | [investments.routes.test.ts](../../src/modules/investments/investments.routes.test.ts) |
| Solo lectura **probada por ejecución**: foto completa de las tres tablas antes y después del `GET`, igualdad exacta; y ninguna ruta de escritura bajo `/api/investments` | [investments.routes.test.ts:446](../../src/modules/investments/investments.routes.test.ts#L446) |

### Documentación

| Qué | Dónde |
| --- | --- |
| Contrato de la API: sección `GET /api/investments/overview` completa (reglas, parámetros, respuesta con ejemplo, motivos de exclusión, errores) y la nota «Inversiones» actualizada: ya tienen lector | [docs/api-contract.md](../../docs/api-contract.md) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien`:

- ✅ «Veo cada producto con lo que vale hoy y cuánto ha cambiado desde la foto
  anterior, en euros y en porcentaje» → se cumple; test verbatim
  (`investments.routes.test.ts:120`): fotos con su fecha, `change.amount` en
  euros y `change.percentPoints` en puntos.
- ✅ «Veo cuánto he ganado en total en el mes que pida, sumando todos los
  productos» → se cumple; `periodGain.total = fluctuation + interest`, testeado
  con suma mixta (120.50 + 8.40 = 128.90) y con meses pasados (2026-07,
  2026-06, 2024-02).
- ✅ «Los depósitos aparecen sin fingir una subida ni una bajada: lo suyo son sus
  condiciones» → se cumple; test del depósito: los campos de variación ni
  existen en su forma.
- ✅ «Los intereses de la cuenta remunerada cuentan como ganancia del mes en que
  se abonaron» → se cumple; test del interés: cuenta el de la foto del periodo
  y solo ese.
- ✅ «Si un mes no subí ningún archivo de un producto, se ve que falta esa foto
  en vez de dar por bueno el mes anterior» → se cumple; tests de huecos:
  `valuation`/`snapshot` a `null` + entrada en `excluded` con motivo, y la
  anterior solo como `previousValuation` con su fecha.

Y los tres `que_no_quiero`: ningún importe tuyo se recalcula ni se redondea
(test verbatim), no se mezcla con las cuentas corrientes (no hay patrimonio
total; `marketValue` y `uninvestedCash` van separados), y no escribe nada
(probado fotografiando las tres tablas antes y después del `GET`).

## Decisiones que se tomaron por ti

Las 6 🔴 las confirmaste al aprobar el spec. Además, durante la implementación
(documentadas en `progress/implementations/investments-overview.md` y juzgadas
correctas en la review):

- (delegado→resuelto) `change.percentPoints` sale **sin relleno de ceros**
  (`"0.9"`, no `"0.90"`): el design se contradecía consigo mismo y ganó tu
  regla de no redondear/rellenar. El contrato quedó escrito así.
- (añadido) Pedir un producto que **existe pero estaba cerrado antes** del mes →
  `200` con lista vacía, no `404` (el 404 es solo para un id que no existe;
  mismo criterio que los filtros de movements).
- (añadido) Un producto entra en la suma en euros si su `gain` está en las dos
  fotos, aunque le falte un `gainPercent` (entonces su componente de puntos va
  a `null`); si le falta un `gain`, va a `excluded` como `gain_not_reported`
  aunque los porcentajes sí se puedan restar (y se muestran).

## Qué NO se tocó / quedó fuera

- El **patrimonio neto** (sumar `marketValue` + `uninvestedCash` + saldos): es
  otra feature, ya prevista en `docs/data-model.md` §Patrimonio.
- Los **escritores** de las F26/29 (`persistProductSnapshot` y hermanos): ni una
  línea; el único cambio en su archivo fue añadir la lectura debajo.
- El **schema de Prisma y las migraciones**: cero cambios.
- `GET /api/accounts` y el resto de endpoints: intactos (suite entera en verde).
- La **pantalla**: es del frontend, se planifica en el otro proyecto contra el
  contrato actualizado, en otra sesión.

## Notas para el futuro

- El guardián de rutas sin acceso a datos (`src/architecture.test.ts:224`) no
  vigila `investments.routes.ts` (cumple la regla, pero nadie la vigila ahí).
  Una línea, para la próxima feature que toque ese test.
- El caso «`?productId=` de un producto cerrado antes del periodo → 200 vacío»
  funciona pero no tiene test dedicado; si se vuelve a tocar el módulo,
  clavarlo con un test.
- `docs/roadmap.md` cabo suelto 12 («nada lee la capa de inversiones») queda
  cerrado con esta feature; tachar la fila es del leader al cerrar.
