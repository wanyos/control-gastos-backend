# Requirements — F42 `net-worth`

> EARS estricto. Fuente de verdad: el bloque `intent` de la feature 42 en
> `feature_list.json` (aprobado por el humano el 2026-09-05). Fechas "hoy" =
> fecha UTC del momento de la consulta, el mismo reloj de `bookingDate` y de
> las fotos (`date` es date-only a medianoche UTC).

## R1
CUANDO un cliente hace `GET /api/net-worth`, el sistema DEBE responder `200`
con un cuerpo que contiene `asOf` (la fecha de hoy, `YYYY-MM-DD` UTC), `total`
(string decimal), un bloque `accounts` y un bloque `investments`.

## R2
CUANDO se construye el bloque `accounts`, el sistema DEBE obtener cada saldo de
`listAccounts` (`src/modules/accounts/accounts.service.ts`, la fórmula única de
la feature 31) y publicar `accounts.total` como la suma de esos saldos, de modo
que cada cuenta muestra exactamente el mismo `balance` que `GET /api/accounts`
y `GET /api/overview` en el mismo instante.

## R3
CUANDO un producto fluctuante (`fund` | `etf` | `managed_portfolio`) vivo
(`closedAt IS NULL`) tiene al menos una `Valuation` con `date <= hoy`, el
sistema DEBE valorarlo como `marketValue + uninvestedCash` de su `Valuation`
más reciente con `date <= hoy`; SI `uninvestedCash` es `NULL` ENTONCES el valor
DEBE ser solo `marketValue` (no se inventa un cero, regla de la F9/ADR-012).

## R4
CUANDO un depósito está vivo (`closedAt IS NULL`), el sistema DEBE valorarlo
por su `principal`, sin sumarle `expectedGain` (la ganancia solo se realiza al
vencimiento).

## R5
CUANDO una cuenta remunerada (`savings_account`) viva tiene al menos un
`SavingsSnapshot` con `date <= hoy`, el sistema DEBE valorarla por el `balance`
de su `SavingsSnapshot` más reciente con `date <= hoy`.

## R6
El sistema NO DEBE listar ni sumar un producto con `closedAt` no nulo: su
dinero ya volvió a una cuenta corriente y sumarlo lo contaría dos veces.

## R7
SI un producto fluctuante o una cuenta remunerada vivos no tienen ninguna foto
con `date <= hoy` ENTONCES el sistema DEBE listar el producto con `value: null`,
excluirlo de `investments.total` y añadir una entrada
`{ productId, name, reason: "no_valuation", valuedAt: null }` a
`investments.issues` — nunca sumarlo como cero en silencio.

## R8
CUANDO la foto usada para valorar un producto (la `Valuation` o el
`SavingsSnapshot` de R3/R5) tiene `date` anterior al primer día del mes
anterior al de hoy (UTC), el sistema DEBE sumar igualmente ese valor a
`investments.total` Y añadir una entrada
`{ productId, name, reason: "stale_valuation", valuedAt: <date de la foto> }` a
`investments.issues`; además, todo producto valorado por foto DEBE llevar
`valuedAt` (la `date` de la foto usada) y `stale` (boolean) en su entrada de
`investments.products`.

## R9
SI un depósito vivo tiene `maturityDate < hoy` ENTONCES el sistema DEBE seguir
sumando su `principal` Y añadir una entrada
`{ productId, name, reason: "matured_not_closed", valuedAt: <maturityDate> }` a
`investments.issues`, porque el dinero puede estar ya también en una cuenta
corriente y el aviso es lo único que evita el doble conteo silencioso.

## R10
CUANDO se calculan los totales, el sistema DEBE publicar
`investments.total` = Σ de los `value` no nulos de `investments.products` y
`total` = `accounts.total + investments.total`, con toda la aritmética en
`Prisma.Decimal` y los importes monetarios serializados como string decimal de
dos decimales (`toFixed(2)`), sin recalcular ni redondear ningún importe
guardado (los `marketValue`, `uninvestedCash`, `principal` y `balance` de cada
producto salen tal como están almacenados).

## R11
CUANDO la petición trae un parámetro de querystring, el sistema DEBE ignorarlo
(el esquema lo descarta antes del handler): el endpoint no tiene parámetros y
responde siempre a fecha de hoy.

## R12
El sistema NO DEBE ejecutar ninguna escritura al servir `GET /api/net-worth`,
y NO DEBE existir `POST`, `PATCH` ni `DELETE` bajo `/api/net-worth`.

## R13
El sistema NO DEBE cambiar el contrato ni el comportamiento de
`GET /api/overview` ni de `GET /api/investments/overview`: sus suites actuales
pasan sin modificar una aserción.

---

## Procedencia

- R1 — (humano) Sale de «una sola consulta me da el patrimonio total y el
  desglose: cuentas corrientes por un lado, inversiones por otro».
- R2 — (humano) Sale de «el lado de las cuentas usa el mismo saldo real de la
  F31/F38, sin una segunda suma».
- R3 — (humano) Sale de «el patrimonio de un producto es marketValue más
  uninvestedCash (van aparte, regla de la F9)». La rama `uninvestedCash NULL →
  solo marketValue` es (delegado): decidí no inventar un cero, coherente con
  ADR-012 («un producto que no lo trae se guarda sin ese dato»).
- R4 — (humano) Sale de «un depósito vale su capital mientras no venza».
  (delegado) el detalle: `principal` a secas, `expectedGain` fuera — es lo que
  docs/data-model.md §Patrimonio dejó escrito y el humano cita en su intent.
- R5 — (humano) Sale de «la cuenta remunerada su último saldo».
- R6 — (añadido) El humano no dijo qué pasa con un producto cerrado. Propongo:
  no aparece ni suma, porque su dinero ya está en el saldo de las cuentas y
  sumarlo lo contaría dos veces. Alternativa descartada: mostrarlo a valor 0
  (ruido sin información). ← REVISAR EN APROBACIÓN.
- R7 — (humano) Sale de «si a un producto le falta la foto, se ve qué parte del
  total está desactualizada o incompleta». La forma exacta (lista `issues` con
  motivo, patrón `excluded` de la F39) es (delegado).
- R8 — (delegado) El humano cedió «cómo se avisa de que una pieza está
  desactualizada sin dejar de dar el total». Decido: umbral = primer día del
  mes anterior (las fotos son mensuales de fin de mes: a mitad de mes la del
  mes pasado es fresca, la de hace dos meses no); el valor viejo SÍ suma y el
  aviso lo señala con su fecha. Alternativa descartada: umbral en días fijos
  (p. ej. 45) — mismo efecto, pero corta a mitad de mes de forma arbitraria.
- R9 — (añadido) El humano no contempló el depósito vencido y aún sin
  `closedAt` en su fichero. Propongo: sigue sumando y avisa, porque dejar de
  sumar por una fecha convertiría una ausencia (no escribió el cierre) en un
  hecho, la inferencia que este modelo prohíbe (docs/data-model.md §series).
  ← REVISAR EN APROBACIÓN.
- R10 — (humano) Sale de «no quiero que recalcule ni redondee importes míos:
  se suman los que están guardados».
- R11 — (delegado) El humano cedió «si el total se pide a una fecha o solo
  hoy; propón lo más simple que sirva». Decido: solo hoy, sin parámetros; la
  consulta a fecha D se puede añadir después sin romper el contrato.
- R12 — (humano) Sale de «no quiero que escriba nada: solo lectura».
- R13 — (humano) Sale de «no quiero perder las vistas separadas: la F38 y la
  F39 siguen igual». Resuelve también la delegación endpoint nuevo vs ampliar
  `GET /api/overview`: endpoint nuevo (ver design.md §1).
