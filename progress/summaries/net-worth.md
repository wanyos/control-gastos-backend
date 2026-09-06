# Resumen — feature 42 `net-worth`

Fecha de cierre: 2026-09-06
Intención original: `feature_list.json` → feature `net-worth`, bloque `intent`
Spec (SDD): `specs/42-net-worth/`

## Qué hace ahora la app que antes no

Ahora una sola consulta te dice cuánto vale todo tu dinero junto hoy: el saldo
real de las cuentas corrientes (el mismo de la F31/F38, sin segunda suma) más lo
que valen las inversiones según sus últimas fotos, con el desglose de cada pieza
y avisos cuando una está incompleta (sin foto), vieja (foto anterior al primer
día del mes pasado) o puede estar contada dos veces (depósito vencido sin
cierre escrito). Antes tenías que sumar tú las dos pantallas.

## Por dónde se usa (puntos de entrada)

- `GET /api/net-worth` — el único endpoint de la feature, solo lectura, sin
  parámetros (responde siempre a fecha de hoy, UTC). Registrado en
  [app.ts:91](../../src/app.ts#L91), handler en
  [net-worth.routes.ts:21](../../src/modules/net-worth/net-worth.routes.ts#L21).
- Contrato completo (reglas de valoración, enum de avisos, ejemplo):
  `docs/api-contract.md` §`GET /api/net-worth`.

## Dónde está el código (para revisión directa)

### La composición (módulo nuevo `src/modules/net-worth/`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Compone cuentas + inversiones y suma los dos totales en `Prisma.Decimal` | `getNetWorth` | [net-worth.service.ts:32](../../src/modules/net-worth/net-worth.service.ts#L32) |
| Punto único de acceso al cliente de datos del módulo | `netWorthDb` | [net-worth.service.ts](../../src/modules/net-worth/net-worth.service.ts) |
| Querystring vacía: todo parámetro desconocido se descarta antes del handler | `getNetWorthSchema` | [net-worth.schema.ts](../../src/modules/net-worth/net-worth.schema.ts) |
| Forma de la respuesta (importa `OverviewAccount`: un solo dueño de la forma de cuenta) | `NetWorthResponse`, `NetWorthAccounts` | [net-worth.types.ts](../../src/modules/net-worth/net-worth.types.ts) |

### La valoración (módulo investments, único lector de sus tablas — ADR-026)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Valora cada producto vivo hoy: fluctuante = marketValue + uninvestedCash (NULL → solo marketValue), depósito = principal sin expectedGain, remunerada = balance del último snapshot; cerrado fuera; sin foto → hueco `null` con motivo; foto vieja y depósito vencido → suman con aviso | `getInvestmentsNetWorth` | [investments.service.ts:523](../../src/modules/investments/investments.service.ts#L523) |
| Tipos del lado net-worth (productos discriminados por `type`, avisos con enum cerrado) | `InvestmentsNetWorth`, `NetWorthProduct`, `NetWorthIssue`, `NetWorthIssueReason` | [investments.types.ts](../../src/modules/investments/investments.types.ts) |

### Tests (14 nuevos, todos vistos pasar)

| Qué cubre | Código |
| --- | --- |
| Valoración por tipo, uninvestedCash NULL, cerrado fuera, sin foto, foto vieja (dos lados del umbral), depósito vencido, importes tal como se guardaron (R3–R10) | [investments.service.test.ts:643](../../src/modules/investments/investments.service.test.ts#L643) |
| Integración: forma y `asOf`, mismos saldos que `GET /api/accounts`, total = cuentas + inversiones, querystring ignorada, sin superficie de escritura (R1, R2, R10–R12) | [net-worth.test.ts:13](../../src/modules/net-worth/net-worth.test.ts#L13) |

## Cumplimiento de la intención

- ✅ «Una sola consulta me da el patrimonio total y el desglose» → se cumple;
  verificado en `net-worth.test.ts` (test R1: 200 con `asOf`, `total` y los dos
  bloques).
- ✅ «El lado de las cuentas usa el mismo saldo real de la F31/F38, sin una
  segunda suma» → se cumple; el test R2 compara cada `balance` contra
  `GET /api/accounts` en la misma pasada.
- ✅ «El lado de las inversiones vale lo que dicen mis últimas fotos: marketValue
  más uninvestedCash, depósito su capital, remunerada su último saldo» → se
  cumple; tests R3 (con el caso `uninvestedCash NULL` sin cero inventado), R4
  (expectedGain presente y NO sumado) y R5 (elige el snapshot más reciente).
- ✅ «Si a un producto le falta la foto, se ve qué parte del total está
  desactualizada o incompleta» → se cumple; tests R7 (sin foto → `value: null`
  fuera de la suma, con motivo `no_valuation`) y R8 (foto vieja suma pero avisa
  con `stale_valuation` y su fecha).

Los tres «que no quiero» también quedaron verificados: solo lectura (test R12 +
`find*` de punta a punta), ningún importe recalculado ni redondeado (test R10
con céntimos que un float desviaría), y `GET /api/overview` y
`GET /api/investments/overview` sin tocar una aserción (suite completa en verde).

## Decisiones que se tomaron por ti

Las 5 del bloque 🔴 de `specs/42-net-worth/decisions.md`, que aprobaste sin
cambios el 2026-09-06:

- (delegado) Endpoint nuevo `GET /api/net-worth`, no ampliación de
  `GET /api/overview`.
- (delegado) Solo «hoy», sin parámetro de fecha (se puede añadir `?date=`
  después sin romper el contrato).
- (delegado) Foto vieja = anterior al primer día del mes pasado (umbral
  estricto: con hoy en septiembre, la del 31-07 avisa, la del 01-08 no); el
  valor viejo sigue sumando.
- (añadido) Depósito vencido sin `closedAt` sigue sumando su capital, con aviso
  `matured_not_closed` — **te toca a ti** escribir el `closedAt` cuando venza,
  o el total puede contar ese dinero dos veces (el aviso existe para eso).
- (añadido) Producto cerrado no aparece ni suma: su dinero ya está en las
  cuentas.

## Qué NO se tocó / quedó fuera

- `GET /api/overview` y `GET /api/investments/overview`: intactos, ni una
  aserción de sus suites cambió.
- `prisma/`: cero cambios (ni esquema ni migraciones).
- La pantalla es del frontend: el contrato ya está en `docs/api-contract.md`,
  la interfaz se planifica en el otro proyecto, en otra sesión.
- No hay consulta a fecha pasada (`?date=`): si algún día la quieres, es una
  ampliación compatible.

## Notas para el futuro

- Cabo suelto (severidad baja, del review): añadir los 5 archivos de
  `src/modules/net-worth/` a la lista de árbol de
  `src/architecture.test.ts:39`, como hicieron overview (F38) y transfers
  (F44). Hoy no falla nada, pero es el único módulo cuyo borrado accidental
  ese test no detectaría. Chore de una línea.
- La prueba real contra tu base (comparar el total con tus cifras) queda en tu
  checklist, como en las features 39–41.
