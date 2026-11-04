# Requirements — F67 `investments-gains`

> Fuente de verdad: el `intent` de la feature 67 en `feature_list.json`. Las
> decisiones que el humano revisa están en `decisions.md`. La ruta, los nombres de
> campo y la lista de motivos los aprobó el humano el 2026-11-04 (sin `cancelled`,
> que deja de ser motivo: R16).
>
> Definiciones de este archivo (no son términos nuevos para el humano):
> - **hoy**: `todayInMadridAsDate()` (`src/lib/local-date.ts`), inyectado en el
>   servicio para que los tests fijen el reloj (igual que `GET /api/investments/deposits`).
> - **producto que fluctúa**: `type` `fund`, `etf` o `managed_portfolio`.
> - **fecha de cierre** de un producto: si fluctúa, su `closedAt`; si es `deposit`,
>   la más temprana entre `closedAt` y `maturityDate` de las que no son `NULL`.
>   `NULL` si no tiene ninguna.
> - **cerrado**: producto con fecha de cierre ≤ hoy. **Vivo**: el resto.
> - **regla de los depósitos**: el `status` / `earned` / `maturity` que calcula
>   `getDepositEarnings` (`src/modules/investments/investments.service.ts`, F50)
>   para ese depósito con el mismo hoy.
> - **cifras** de un producto: `invested`, `currentValue`, `gain`, `gainPercent`.

## La consulta

## R1
CUANDO un cliente hace `GET /api/investments/gains`, el sistema DEBE responder
`200` con `asOf` (hoy, `YYYY-MM-DD`), `total`, `live` (los productos vivos) y
`closed` (los productos cerrados), sin parámetros de querystring (uno desconocido
se ignora).

## R2
El sistema NO DEBE incluir en `live`, en `closed` ni en `total` ningún producto de
`type` `savings_account`.

## R3
El sistema DEBE colocar cada producto `fund`, `etf`, `managed_portfolio` y
`deposit` en `closed` si es cerrado y en `live` si es vivo, y DEBE dar en cada
entrada de `closed` su fecha de cierre en `closedOn`.

## Las cifras de cada producto

## R4
MIENTRAS un producto que fluctúa está vivo, el sistema DEBE dar sus cifras desde
su `Valuation` con `date` más reciente ≤ hoy, sea del mes que sea, tal como están
guardadas (`currentValue` = `marketValue`, `uninvestedCash` aparte, sin recalcular
nada), y su `date` en `valuedAt`.

## R5
MIENTRAS un producto que fluctúa está cerrado, el sistema DEBE dar sus cifras desde
su `Valuation` con `date` más reciente ≤ su fecha de cierre, con la misma regla que
R4.

## R6
MIENTRAS un `deposit` está vivo, el sistema DEBE dar `conditions` (`principal`,
`interestRate`, `expectedGain`, `maturityDate` tal como están guardados),
`invested` = `principal`, `gain` = `expectedGain × d / D` redondeado a 2 decimales
(mitad hacia arriba), siendo `d` los días de `openedAt` a hoy (0 si hoy es
anterior a `openedAt`) y `D` los días de `openedAt` a `maturityDate`,
`currentValue` = `principal + gain`, `gainPercent` = `gain / principal × 100`
redondeado a 2 decimales (mitad hacia arriba) y `valuedAt` = hoy.

## R7
CUANDO la regla de los depósitos da `matured` para un `deposit` cerrado, el sistema
DEBE dar `invested` = `principal`, `currentValue` = importe del movimiento de
vencimiento, `gain` = `earned`, `gainPercent` = `earned / principal × 100`
redondeado a 2 decimales (mitad hacia arriba) y `valuedAt` = fecha de ese
movimiento.

## R8
SI una cifra de un producto no se puede sacar ENTONCES el sistema DEBE dejarla a
`null` (nunca `0`) y dar en `reason` el motivo, de esta lista cerrada:
`no_photo` (producto que fluctúa sin foto en la fecha que le toca: las cuatro
cifras y `valuedAt` a `null`), `gain_not_reported` (`gain` `NULL` en la foto),
`gain_percent_not_reported` (solo `gainPercent` `NULL` en la foto),
`maturity_not_found` / `ambiguous` / `below_principal` (depósito
cerrado con ese `status` en la regla de los depósitos: `gain`, `gainPercent` y
`currentValue` a `null`), `missing_conditions` (depósito con `principal`,
`maturityDate`, o —si está vivo— `openedAt` o `expectedGain` a `NULL`, o con
`openedAt` ≥ `maturityDate`: `gain`, `gainPercent` y `currentValue` a `null`). Un producto con las cuatro cifras lleva `reason: null`.

## El total

## R9
El sistema NO DEBE sumar en `total` ningún producto de `closed`.

## R10
El sistema DEBE dar en `total.gain` la suma de los `gain` no nulos de los
productos de `live` (`"0.00"` si no hay ninguno).

## R11
El sistema DEBE dar en `total.invested` la suma de los `invested` de los productos
de `live` cuyo `gain` entró en `total.gain`, depósitos incluidos (su `principal`).

## R12
El sistema DEBE dar en `total.gainPercent` = `total.gain / total.invested × 100`
redondeado a 2 decimales (mitad hacia arriba), o `null` si `total.invested` es `0`.

## R13
El sistema DEBE listar en `total.excluded`, como `{ productId, name, reason }`, cada
producto de `live` cuyo `gain` es `null`.

## R16
CUANDO la regla de los depósitos da `cancelled` para un `deposit` cerrado, el
sistema DEBE dar `invested` = `currentValue` = `principal`, `gain` = `"0.00"`,
`gainPercent` = `"0.00"`, `valuedAt` = su `closedAt` y `reason: null`.

## Solo lectura y contrato

## R14
CUANDO se atiende `GET /api/investments/gains`, el sistema NO DEBE escribir nada en
la base de datos.

## R15
El sistema DEBE describir `GET /api/investments/gains` en `docs/api-contract.md`,
con un ejemplo de respuesta, la lista de motivos, la fórmula del reparto por días
de un depósito vivo (R6) y la fórmula de `total.gainPercent` (R11, R12).

## Procedencia

- R1 — (delegado) El humano cedió «endpoint nuevo o ampliación de
  `GET /api/investments/overview`». Decido **endpoint nuevo**, sin parámetros y a
  fecha de hoy como `GET /api/investments/deposits` y `GET /api/net-worth`.
  Alternativa descartada: ampliar `overview`, que es una vista **de un mes**
  (`month`) y cuyo contrato prohíbe hacer pasar `previousValuation` por la foto
  del periodo; meterle «desde que se abrió» le daría dos significados a la misma
  respuesta. Que `asOf` sea hoy sale de «a fecha de hoy» del encargo. Los nombres
  (`gains`, `live`, `closed`, `closedOn`, `currentValue`, `valuedAt`, `reason`)
  los aprobó el humano el 2026-11-04 (puntos 3 y 6).
- R2 — (humano) «Las cuentas corrientes y remuneradas no salen» (decisión 1). Las
  corrientes no son productos: no hace falta excluirlas.
- R3 — (humano) «Los cerrados salen aparte, con lo que ganaron y la fecha de
  cierre» y (2026-11-04) «cada producto cerrado sale con cómo fue: cuándo se cerró,
  su valor y lo que ganó o perdió» (R5, R7, R8, R16 dan valor y ganancia por tipo).
  (delegado, aprobado el 2026-11-04, punto 4) cerrado si la fecha de cierre es
  ≤ hoy; un depósito, en cuanto llega su `maturityDate`.
- R4 — (humano) «Un fondo cuya última foto es de un mes anterior sale con esa foto y
  su fecha, no vacío» y «se usan tal como están guardadas (ADR-012)». (aprobado el
  2026-11-04, punto 5) `currentValue` = `marketValue` sin el efectivo sin invertir.
- R5 — (humano) «Un fondo vendido sale en cerrados con lo que ganó o perdió según
  su última foto antes del cierre». «Antes del cierre» se lee como foto con fecha
  ≤ `closedAt` (la del mes del reembolso suele llevar esa fecha).
- R6 — (humano, 2026-11-04) «Un depósito vivo sale con su capital, TAE, ganancia
  esperada y vencimiento; su ganancia es la esperada al vencer repartida por días
  desde que lo abrí hasta hoy, su capital cuenta como invertido». (delegado por el
  humano en la puerta) la fórmula del reparto: proporcional a días naturales
  `d / D`, redondeo a 2 decimales mitad hacia arriba, `valuedAt` = hoy
  — aprobado por el humano en la puerta (2026-11-04).
- R7 — (humano) «Un depósito vencido con su cobro encontrado sale con lo que
  ganó», con la misma regla que `GET /api/investments/deposits` (encargo).
  (añadido, técnico) su `gainPercent` se calcula (el depósito no lo trae
  guardado): es lo ganado sobre el capital, no la TAE anual.
- R8 — (humano) «Si una cifra no se puede sacar, sale vacía con un motivo, nunca 0»
  y «si no se encontró el cobro, sin cifra y con el motivo». La lista cerrada de
  motivos la aprobó el humano (2026-11-04, punto 6); `cancelled` sale de ella al
  pasar el cancelado a R16. (añadido, técnico) `missing_conditions` cubre también
  `openedAt` / `expectedGain` nulos o fechas al revés en un depósito vivo.
- R9 — (humano) «Un fondo vendido […] no suma al total», «el total suma solo los
  vivos» (decisiones 2 y 3) y «[un cancelado] su ganancia no cuenta».
- R10 — (humano) «El total suma solo los vivos» (decisión 3); que sume solo los que
  se pueden sacar sale del encargo.
- R11 — (delegado, aprobado el 2026-11-04) % sobre lo invertido de los vivos que
  entran en la ganancia. (humano, 2026-11-04) el capital de un depósito vivo
  **entra** (rechazó la propuesta de dejarlo fuera).
- R12 — (humano) «la fórmula de su % está escrita en el contrato» (decisión 3; la
  fórmula, encargo). (añadido, técnico) redondeo a 2 decimales y `null` con
  `total.invested` = 0 (solo pasa sin ningún vivo que entre).
- R13 — (humano) «el total dice qué productos no ha podido sumar».
- R14 — (humano) «Nada se escribe en la base».
- R16 — (humano, 2026-11-04) «Un depósito cancelado antes de vencer pasa a cerrados
  y su ganancia no cuenta, porque no se cobra nada». (añadido, técnico)
  `valuedAt` = `closedAt`. Dar `0` y no `null` sigue la frase del humano; aprobado
  en la puerta (2026-11-04): «a día de hoy cualquier depósito cerrado antes de tiempo te retorna cero».
- R15 — (humano) «la fórmula de su % está escrita en el contrato»; el resto de la
  sección, porque el backend es dueño del contrato (`CLAUDE.md` del workspace).
