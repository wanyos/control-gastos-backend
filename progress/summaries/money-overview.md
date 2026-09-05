# Resumen — feature 38 `money-overview`

Fecha de cierre: 2026-09-05
Intención original: `feature_list.json` → feature `money-overview`, bloque `intent`
Spec: no hay (feature sin spec, `sdd: false`)

## Qué hace ahora la app que antes no

Hay una sola consulta que te dice, de un vistazo, cuánto dinero tienes en
total, cómo está repartido entre tus cuentas (con el saldo real de cada una),
y cuánto entró, cuánto salió y cuánto quedó (el ahorro) en el mes que pidas.
Antes, para saber cuánto tenías, había que pedir las cuentas y sumarlas a mano.

## Por dónde se usa (puntos de entrada)

- `GET /api/overview` — todo el dinero: total, desglose por cuenta y totales
  del mes en curso. Handler en [overview.routes.ts:21](../../src/modules/overview/overview.routes.ts#L21),
  registrado en [app.ts:87](../../src/app.ts#L87).
- `GET /api/overview?month=2026-06` — lo mismo, con los totales del mes pedido.
  Un mes mal formado (`2026-13`, `june`) responde `400 VALIDATION_ERROR`, nunca
  adivina.

Los saldos no dependen del mes: solo `period.totals` cambia con `?month=`.

## Dónde está el código (para revisión directa)

### La consulta (módulo nuevo `src/modules/overview/`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Capa HTTP: solo el `GET`, nada más | `overviewRoutes` | [overview.routes.ts](../../src/modules/overview/overview.routes.ts) |
| La lectura entera: saldos + totales del mes. **No calcula nada propio**: los saldos vienen de `listAccounts` (F31) y los totales de `computeTotals`/`serializeTotals` (F36) | `getOverview` | [overview.service.ts:46](../../src/modules/overview/overview.service.ts#L46) |
| Primer y último día de un `YYYY-MM` (bisiestos incluidos) | `monthRange` | [overview.service.ts](../../src/modules/overview/overview.service.ts) |
| El mes en curso en UTC, el fallback cuando no mandas `month` | `currentMonth` | [overview.service.ts](../../src/modules/overview/overview.service.ts) |
| Validación del querystring: `month` opcional con patrón `YYYY-MM` | `getOverviewSchema` | [overview.schema.ts](../../src/modules/overview/overview.schema.ts) |
| Tipos de la respuesta; reusa `SerializedMovementTotals` de movements | `OverviewResponse`, `OverviewAccount`, `OverviewPeriod`, `OverviewQuery` | [overview.types.ts](../../src/modules/overview/overview.types.ts) |
| Punto único de acceso a datos del módulo (las rutas no tocan `prisma`) | `overviewDb` | [overview.service.ts](../../src/modules/overview/overview.service.ts) |

### Lo que reutiliza (no se tocó, solo se importa)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| La fórmula del saldo real (ancla + movimientos posteriores), la misma de `GET /api/accounts` | `listAccounts` | [accounts.service.ts](../../src/modules/accounts/accounts.service.ts) |
| La única suma de entradas/salidas, que ya excluye traspasos (`transferId`), aportaciones a producto (`productId`) y `neutral` | `computeTotals`, `serializeTotals` | [movements.service.ts](../../src/modules/movements/movements.service.ts) |

### Registro y guardián de estructura

| Qué hace | Código |
| --- | --- |
| Registro del módulo con prefijo `/api/overview` (2 líneas) | [app.ts:87](../../src/app.ts#L87) |
| Los 5 archivos nuevos en el árbol esperado y `overview.routes.ts` en la lista de rutas sin acceso a datos | [architecture.test.ts](../../src/architecture.test.ts) |

### Tests (12, todos vistos pasar)

| Qué cubre | Código |
| --- | --- |
| El desglose dice **el mismo número** que `GET /api/accounts` (cuenta anclada y sin ancla) | [overview.test.ts:124](../../src/modules/overview/overview.test.ts#L124) |
| Entradas, salidas y ahorro del mes pedido, extremos del mes incluidos y sin fugas de otro mes | [overview.test.ts](../../src/modules/overview/overview.test.ts) |
| Sin `month` → mes en curso; mes mal formado → `400 VALIDATION_ERROR`; parámetro desconocido → se ignora | [overview.test.ts](../../src/modules/overview/overview.test.ts) |
| Mes sin movimientos → 200 con `"0.00"` en los tres totales, y los saldos siguen ahí | [overview.test.ts](../../src/modules/overview/overview.test.ts) |
| Las dos piernas de un traspaso, la aportación a un producto y los `neutral` quedan fuera de los totales | [overview.test.ts](../../src/modules/overview/overview.test.ts) |
| Solo existe el `GET`: ni POST, ni PATCH, ni PUT, ni DELETE bajo `/api/overview` | [overview.test.ts](../../src/modules/overview/overview.test.ts) |
| `monthRange`: mes de 31 días, febrero bisiesto y común, diciembre | [overview.test.ts](../../src/modules/overview/overview.test.ts) |

### Documentación

| Qué | Dónde |
| --- | --- |
| Contrato de la API: sección `GET /api/overview` completa (parámetros, respuesta, errores, nota de solo-lectura) | [docs/api-contract.md](../../docs/api-contract.md) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien`:

- ✅ «Me dice el total de dinero y el desglose por cuenta, con el saldo real de
  cada una» → se cumple; verificado en el test que compara número a número
  contra `GET /api/accounts` (`overview.test.ts:124`).
- ✅ «Me dice cuánto entró, cuánto salió y cuánto ahorré en el periodo que pido»
  → se cumple; test `returns income, expense and net (income − expense) of the
  month asked for`.
- ✅ «El ahorro cuadra con entradas menos salidas, y mover dinero entre mis
  cuentas no cuenta» → se cumple; `net` sale de `serializeTotals`
  (`income − expense`) y el test de exclusión siembra un traspaso completo de
  500 EUR que no mueve ningún total.
- ✅ «Puedo pedir el mes que quiera» → se cumple; `?month=YYYY-MM`, testeado con
  meses pasados (2026-06, 2024-02).
- ✅ «Un mes sin movimientos me lo dice con ceros y no con un error» → se
  cumple; test `answers a month with no movements with zeros and 200`.

Y los tres `que_no_quiero`: no escribe nada (solo `findMany`; test de que solo
existe el `GET`), no hay nada de presentación (JSON puro), y las inversiones
quedan fuera (F39 tendrá su propia vista; dicho en el contrato).

## Decisiones que se tomaron por ti

Lo que el intent delegaba, decidido y documentado por el implementer:

- (delegado) **Endpoint nuevo, no colgado de uno existente**: `GET /api/overview`
  en su propio módulo. No encajaba ni en `accounts` ni en `movements` porque
  cruza los dos.
- (delegado) **El periodo se pide como mes**: `?month=YYYY-MM`, porque tu intent
  habla siempre de meses. Sin él, el mes en curso (UTC, el mismo reloj de las
  fechas de los movimientos). La respuesta te devuelve el mes resuelto y sus
  fechas (`period.month`, `period.from`, `period.to`) para que sepas qué
  periodo se usó.
- (añadido) Un `month` mal formado es un error 400 explícito, nunca un fallback
  silencioso al mes en curso.
- (añadido) Los saldos no dependen del mes pedido: son «cuánto dinero hay hoy».
  Solo los totales del periodo cambian con `?month=`.

## Qué NO se tocó / quedó fuera

- Las inversiones: ni los productos ni sus fotos mensuales aparecen aquí (F39).
- El schema de Prisma y las migraciones: cero cambios.
- Los cálculos existentes: `listAccounts` (F31) y `computeTotals` (F36) se
  importan tal cual, sin modificarlos.

## Notas para el futuro

- El comentario de `prisma/schema.prisma` sobre `Movement.transferId` («Nothing
  writes it yet») está desactualizado desde la F40. No se tocó aquí (schema
  prohibido); pendiente para la próxima feature que sí toque el schema.
- El cabo suelto 8 del roadmap puede darse por cerrado en su parte de
  `productId`: la exclusión ya vive en `computeTotals` desde la F36
  (comprobado en esta review leyendo la función y viendo pasar su test).
