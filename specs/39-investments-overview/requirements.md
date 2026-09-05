# Requirements — F39 `investments-overview`

> Formato EARS (`docs/specs.md`). Fuente de verdad: el bloque `intent` de la
> feature 39 en `feature_list.json`. Vista de **solo lectura** sobre la capa de
> inversiones (`InvestmentProduct`, `Valuation`, `SavingsSnapshot`), que hoy se
> escribe (F26, F29) y nadie lee.

En todo el documento, «el periodo» es el mes resuelto por la consulta
(`?month=YYYY-MM`, o el mes en curso en UTC si no se pidió ninguno), con
`from` = su primer día y `to` = su último día, ambos incluidos — el mismo
encaje que `GET /api/overview` (F38). «Foto del periodo» es la fila de
`Valuation` (o `SavingsSnapshot`) de un producto cuya `date` cae dentro de
`[from, to]`; por `@@unique([productId, date])` y cadencia mensual real, como
mucho hay una por producto (si hubiera más de una, manda la de `date` mayor).

## R1
CUANDO un cliente hace `GET /api/investments/overview` sin parámetros, el
sistema DEBE responder `200` con el cuerpo `{ period, products, periodGain }`
calculado sobre el mes en curso (UTC), donde `period` trae `month`, `from` y
`to` resueltos.

## R2
CUANDO un producto de tipo `fund`, `etf` o `managed_portfolio` tiene foto del
periodo, el sistema DEBE devolverla en su campo `valuation` con su `date` y sus
cinco importes (`invested`, `marketValue`, `gain`, `gainPercent`,
`uninvestedCash`) **tal como están guardados**, sin recalcular ni redondear
ninguno (regla 4 del modelo: nunca se deriva `gain = marketValue − invested`).

## R3
CUANDO un producto que fluctúa tiene además una foto anterior (la `Valuation`
suya de `date` más reciente anterior a la foto del periodo — o anterior a
`from`, si el periodo no tiene foto), el sistema DEBE devolverla en
`previousValuation` (misma forma que `valuation`, con su `date`) y, si la foto
del periodo existe, el campo `change` con `amount` = `gain` del periodo −
`gain` anterior (euros, con signo) y `percentPoints` = `gainPercent` del
periodo − `gainPercent` anterior (puntos porcentuales, con signo).
⚠️ La base de la medida (los `gain` del banco y no `marketValue`) es decisión
del spec — ver `decisions.md` 🔴 2.

## R4
SI la variación no es computable — no hay foto del periodo, no hay foto
anterior, o el `gain` / `gainPercent` implicado es `NULL` en alguna de las dos
fotos — ENTONCES el sistema DEBE devolver a `null` el campo `change` (o el
componente concreto que no se pueda calcular), nunca un cero ni un valor
inventado.

## R5
El sistema DEBE devolver cada producto de tipo `deposit` con sus cuatro
condiciones (`principal`, `interestRate`, `expectedGain`, `maturityDate`) tal
como están guardadas, en un campo `conditions`, y **sin** los campos
`valuation`, `previousValuation` ni `change` (un depósito no fluctúa y no tiene
valoraciones, ADR-012).

## R6
CUANDO un producto de tipo `savings_account` tiene foto del periodo, el sistema
DEBE devolverla en su campo `snapshot` con su `date` y sus cinco importes
(`openingBalance`, `moneyIn`, `moneyOut`, `interest`, `balance`) tal como están
guardados.

## R7
SI un producto con serie (los que fluctúan y la cuenta remunerada) no tiene
foto del periodo ENTONCES el sistema DEBE devolver su campo `valuation` /
`snapshot` a `null` **y** listarlo en `periodGain.excluded` con su motivo
(`no_photo_in_period`), sin presentar jamás una foto anterior como si fuera la
del periodo (la anterior puede aparecer, pero solo en `previousValuation`, con
su propia fecha).

## R8
El sistema DEBE devolver `periodGain` con `fluctuation` = Σ de las variaciones
en euros (R3) de los productos que fluctúan y son computables, `interest` = Σ
del `interest` de los `SavingsSnapshot` con `date` dentro del periodo (los
intereses cuentan en el mes en que se abonaron, que es el de la `date` de su
foto), `total` = `fluctuation + interest`, y `excluded` con una entrada
`{ productId, name, reason }` por cada producto con serie que no pudo entrar
en la suma (`no_photo_in_period`, `no_previous_photo`, `gain_not_reported`).

## R9
SI un producto tiene `closedAt` anterior al primer día del periodo ENTONCES el
sistema NO DEBE incluirlo en `products` ni en ninguna suma de ese periodo.

## R10
CUANDO se pide `?productId=<n>` y ese producto existe, el sistema DEBE limitar
`products` y `periodGain` a ese único producto.

## R11
SI el `productId` pedido no corresponde a ningún `InvestmentProduct` ENTONCES
el sistema DEBE responder `404` con `code: NOT_FOUND` (mismo criterio que el
`accountId` de `GET /api/movements`).

## R12
CUANDO se pide `?type=<t>` con uno de los cinco valores de
`InvestmentProductType`, el sistema DEBE limitar `products` y `periodGain` a
los productos de ese tipo (combinable con `month` y `productId`).

## R13
CUANDO se pide `?month=YYYY-MM` válido, el sistema DEBE calcular la respuesta
entera sobre ese mes, sea cual sea (no solo el último).

## R14
SI `month`, `productId` o `type` no cumplen el esquema (mes mal formado, tipo
fuera de la enumeración, id no entero ≥ 1) ENTONCES el sistema DEBE responder
`400` con `code: VALIDATION_ERROR`, sin adivinar nunca un valor.

## R15
El sistema NO DEBE ejecutar ninguna escritura al servir esta consulta ni
alterar ningún endpoint existente: bajo `/api/investments` solo existe este
`GET` (sin `POST`/`PATCH`/`DELETE`) y la respuesta de `GET /api/accounts`
queda exactamente igual que antes de la feature.

---

## Procedencia

- R1 — (delegado) El humano cedió la forma del endpoint y el encaje del
  periodo; decido **un solo endpoint** `GET /api/investments/overview` que
  devuelve lista y ganancia del periodo juntas, con `?month=YYYY-MM` y el mes
  en curso por defecto, calcado de `GET /api/overview` (F38). Alternativa
  descartada: dos endpoints (lista / ganancia) — dos peticiones para una sola
  pantalla y dos sitios donde divergir. ← el default «mes en curso» está en
  `decisions.md` 🔴 6.
- R2 — (humano) Sale de «veo cada producto con lo que vale hoy» y de «no quiero
  que se calcule ni se redondee ningún importe que yo escribo».
- R3 — (humano) Sale de «cuánto ha cambiado desde la foto anterior, en euros y
  en porcentaje» y «la fecha de cada foto». ⚠️ La **base** de la medida (los
  `gain` que escribe él, no `marketValue`, que subiría con cada aportación) es
  decisión mía — REVISAR EN APROBACIÓN (`decisions.md` 🔴 2).
- R4 — (humano) Sale de «sin inventar datos»: un hueco es un hueco.
- R5 — (humano) Sale de «los depósitos aparecen sin fingir una subida ni una
  bajada: lo suyo son sus condiciones» + ADR-012 (los depósitos no guardan
  valoraciones a propósito).
- R6 — (humano) Sale de «los intereses de la cuenta remunerada cuentan como
  ganancia del mes en que se abonaron» (la foto es la fuente).
- R7 — (delegado) El humano cedió «cómo se dice “esta foto falta” sin inventar
  datos»; decido: el hueco va a `null` en su sitio y el producto sale además en
  `periodGain.excluded` con motivo legible por máquina. Alternativa descartada:
  omitir el producto entero (parecería que no existe, que es peor que decir que
  falta su foto).
- R8 — (humano) Sale de «cuánto he ganado en total en el mes que pida, sumando
  todos los productos» + «los intereses cuentan en el mes en que se abonaron».
  El desglose `fluctuation`/`interest`/`excluded` es la forma de que la suma
  sea auditable, no alcance nuevo.
- R9 — (añadido) El humano no dijo qué pasa con un producto ya cerrado
  (`closedAt`). Propongo: un producto cerrado **antes** del periodo no aparece;
  cerrado dentro o después, sí. ← REVISAR EN APROBACIÓN.
- R10 — (humano) Sale de «poder mirarlo por producto o todo junto».
- R11 — (añadido) Error concreto para un producto inexistente; copia el
  criterio ya vigente de `GET /api/movements?accountId=`.
- R12 — (delegado) El humano cedió «qué filtros tienen sentido además de por
  producto y por periodo»; decido añadir **solo** `type` (los cinco valores del
  enum) y nada más — con un banco de inversión y seis productos, un filtro por
  banco o por estado sería catálogo vacío. ← `decisions.md` 🔴 5.
- R13 — (humano) Sale de «el mes que pida».
- R14 — (añadido) Validación estándar del proyecto (mismo patrón y mismo código
  de error que `GET /api/overview` y `GET /api/movements`).
- R15 — (humano) Sale de «no quiero que escriba nada: los datos entran por
  importación» y del acceptance «`GET /api/accounts` no cambia».

Cobertura de `como_se_que_esta_bien`: punto 1 → R2, R3; punto 2 → R8, R13;
punto 3 → R5; punto 4 → R6, R8; punto 5 → R4, R7.
