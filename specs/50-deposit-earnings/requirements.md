# Requirements — F50 `deposit-earnings`

> Fuente de verdad: el `intent` de la F50 en `feature_list.json`, incluida
> `_respuestas_del_humano` (2026-09-28: el principal sale de los `.json` de
> depósito; los depósitos antiguos no tendrán `.json` y no deben dar cifra ni
> error). Notación EARS estricta. 15 requirements.
>
> Nombres nuevos que salen al contrato — `GET /api/investments/deposits`,
> `earned`, `status` y sus seis valores, `maturity`, `candidateMovementIds`,
> `total`, `asOf` — **propuestos**, pendientes de aprobación en `decisions.md`
> 🔴 5. Si el humano los cambia, se cambian aquí y en `design.md`.
>
> Vocabulario: «depósito», «vencimiento», «principal», «apertura» y «cancelación»
> son palabras del humano (intent y extractos). Aquí «vencimiento» es el
> movimiento del extracto de MyInvestor cuya descripción empieza por
> `INTERESES DEP` (el nombre que le da el banco).
>
> «Hoy» es la fecha UTC del momento de la petición, a medianoche (mismo reloj que
> `GET /api/net-worth`), inyectable en el servicio para los tests.
>
> «Movimiento candidato» de un depósito (definición usada en R4-R8, `design.md` §3):
> un movimiento de una cuenta cuyo `bank` es el `bank` del producto, de `type`
> `income`, con `bookingDate` igual al `maturityDate` del producto, y cuya
> descripción reconoce como vencimiento el reconocedor registrado para ese banco
> (R11). No mira el número de la descripción, ni `excludedFromTotals`, ni
> `transferId`, ni `productId`.

## La vista

### R1
CUANDO un cliente hace `GET /api/investments/deposits`, el sistema DEBE responder
`200` con `{ asOf, deposits, total }`, donde `deposits` lleva una entrada por cada
`InvestmentProduct` de `type` `deposit` —sea cual sea su `closedAt` o su
`maturityDate`—, ordenadas por `maturityDate` descendente y, a igualdad, por `id`
descendente, y `asOf` es «hoy» en `YYYY-MM-DD`.

### R2
El sistema DEBE incluir en cada entrada de `deposits` los campos `id`, `bank`,
`name`, `openedAt`, `closedAt`, `principal`, `expectedGain` y `maturityDate`
exactamente como están guardados en el producto (importes con `toFixed(2)`, fechas
en `YYYY-MM-DD`, `null` donde la columna es `NULL`).

## El estado y la cifra de cada depósito

### R3
MIENTRAS el `maturityDate` de un depósito sea posterior a «hoy» y su `closedAt` no
sea anterior a su `maturityDate`, el sistema DEBE devolver esa entrada con
`status: "active"`, `earned: null`, `maturity: null` y `candidateMovementIds: []`.

### R4
CUANDO el `maturityDate` de un depósito es igual o anterior a «hoy», su `closedAt`
no es anterior a su `maturityDate`, existe exactamente un movimiento candidato y su
`amount` es mayor o igual que el `principal`, el sistema DEBE devolver esa entrada
con `status: "matured"`, `maturity: { movementId, date, amount }` de ese movimiento
y `earned` = `amount − principal` en `toFixed(2)`.

### R5
SI el `maturityDate` de un depósito es igual o anterior a «hoy», su `closedAt` no
es anterior a su `maturityDate` y no existe ningún movimiento candidato ENTONCES el
sistema DEBE devolver esa entrada con `status: "maturity_not_found"`,
`earned: null`, `maturity: null` y `candidateMovementIds: []`.

### R6
SI el `maturityDate` de un depósito es igual o anterior a «hoy», su `closedAt` no
es anterior a su `maturityDate` y existe más de un movimiento candidato ENTONCES el
sistema DEBE devolver esa entrada con `status: "ambiguous"`, `earned: null`,
`maturity: null` y en `candidateMovementIds` los ids de todos los candidatos en
orden ascendente.

### R7
SI el `closedAt` de un depósito es anterior a su `maturityDate` ENTONCES el sistema
DEBE devolver esa entrada con `status: "cancelled"`, `earned: null`,
`maturity: null` y `candidateMovementIds: []`, sin buscar movimiento candidato.

### R8
SI el único movimiento candidato de un depósito tiene un `amount` menor que el
`principal` ENTONCES el sistema DEBE devolver esa entrada con
`status: "below_principal"`, `earned: null`, `maturity: { movementId, date, amount }`
de ese movimiento y `candidateMovementIds: []`.

### R9
El sistema DEBE devolver en `total` la suma de los `earned` de las entradas con
`status: "matured"`, en `toFixed(2)`, sin sumar ninguna otra entrada; sin ninguna
entrada `matured`, `total` DEBE ser `"0.00"`.

### R10
SI existe un vencimiento en un extracto cuyo depósito no tiene producto dado de
alta (un depósito antiguo sin `.json`) ENTONCES el sistema NO DEBE incluirlo en
`deposits` ni en `total`, y DEBE seguir respondiendo `200`.

## Cómo se reconoce y se enlaza un vencimiento

### R11
El reconocedor de MyInvestor DEBE considerar vencimiento una descripción que,
quitados los espacios iniciales, empieza por `INTERESES DEP`, y NO DEBE
considerarlo una que empieza por `APERTURA DEP` o `CANCELACION DEP`.

### R12
SI dos vencimientos del mismo banco llevan el mismo número en la descripción y
fechas distintas ENTONCES el sistema DEBE asignar a cada depósito solo el que cae en
su `maturityDate`, sin usar el número de la descripción para nada.

### R13
El sistema DEBE reconocer como candidato un movimiento que cumple la definición
tenga `excludedFromTotals` a `true` o a `false`.

## Lo que no cambia

### R14
CUANDO se atiende `GET /api/investments/deposits`, el sistema NO DEBE escribir en
la base de datos: ni el `amount`, `excludedFromTotals`, `productId` o `transferId`
de ningún movimiento, ni el saldo de ninguna cuenta, ni ningún producto.

### R15
El sistema DEBE describir `GET /api/investments/deposits` en `docs/api-contract.md`
(parámetros, forma de la respuesta, los seis valores de `status` y cuándo sale cada
uno, y que es de solo lectura), para que el frontend construya contra él.

## Procedencia

- R1 — (delegado) El humano cedió «dónde se ve: en la vista de inversiones o en otro
  sitio». Decido un endpoint propio bajo `/api/investments`: la vista de la F39 es
  por mes y quita los productos cerrados antes del mes
  ([`investments.service.ts:382-385`](../../src/modules/investments/investments.service.ts#L382)),
  así que un depósito vencido en un mes desaparecería de los siguientes y el total de
  «lo que me han generado» no cabría. Sale también de «un total de lo que me han
  generado esos depósitos» (humano). Orden por vencimiento, más reciente primero:
  (añadido) ← REVISAR.
- R2 — (añadido) El humano no dijo qué acompaña a la cifra. Propongo sus
  condiciones tal como están, para que vea de qué `.json` sale cada una.
- R3 — (humano) «Un depósito que sigue vivo no sale con una ganancia inventada ni
  negativa».
- R4 — (humano) «Lo que me devolvieron al vencer menos el principal de su .json» y
  «el importe con que venció en el extracto menos el principal de su .json». La
  forma del enlace (por fecha, `bookingDate = maturityDate`) es (delegado): el
  humano cedió «cómo se relaciona cada vencimiento del extracto con el .json de su
  depósito». Comprobado en la base real el 2026-09-28 (solo lectura): el único
  depósito con `.json` ya vencido tiene su vencimiento exactamente en su
  `maturityDate`, y los 10 vencimientos de depósitos antiguos cuya apertura está en la base caen exactamente a
  uno o tres meses de la fecha valor de su apertura, con `bookingDate = valueDate`.
  Devolver el movimiento enlazado (`maturity`) es (añadido): para que el humano
  pueda comprobar con qué línea del extracto se calculó.
- R5 — (añadido) El humano no dijo qué pasa si el vencimiento no aparece (extracto
  aún no importado, o el banco lo apunta otro día). Propongo: sin cifra y con estado
  propio, nunca cero. ← REVISAR (decisions 🔴 3).
- R6 — (añadido) Dos vencimientos el mismo día para un depósito: sin cifra, con los
  candidatos a la vista. Nunca se elige uno. ← REVISAR (decisions 🔴 3).
- R7 — (delegado) El leader pidió resolver la cancelación antes de vencer. Decido que
  la señal sea el `closedAt` del `.json` anterior al `maturityDate`, y que no dé
  cifra. En los extractos, las cancelaciones que hay son de depósitos abiertos y
  cancelados el mismo día y vueltos a abrir, que no tienen `.json`: no se leen
  nunca. ← REVISAR (decisions 🔴 4).
- R8 — (añadido) Una cifra negativa en un depósito solo puede salir de un enlace
  equivocado (lo que pasó al emparejar por número en la F49). Propongo no darla y
  enseñar el movimiento.
- R9 — (humano) «Y un total de lo que me han generado esos depósitos».
- R10 — (humano) «Los depósitos antiguos sin .json no salen con ninguna cifra ni
  dan error» y `_respuestas_del_humano` del 2026-09-28.
- R11 — (delegado) Parte de «cómo se relaciona cada vencimiento». El texto
  `INTERESES DEP` es el que el humano y la F49 usan para el vencimiento; vive en el
  módulo del banco porque el módulo de inversiones no puede saber de bancos
  (guardián de [`architecture.test.ts:488`](../../src/architecture.test.ts#L488)).
- R12 — (humano) «No quiero que se deduzca el principal emparejando por el número
  del concepto: se repite y da cifras falsas».
- R13 — (humano) «No quiero tocar cómo la F49 saca movimientos de las sumas»: la
  marca de la F49 ni se lee ni se cambia para enlazar. Comprobado en la base el
  2026-09-28: los 29 movimientos de depósito de MyInvestor están marcados.
- R14 — (humano) «No quiero que cambie el saldo de ninguna cuenta ni el importe de
  ningún movimiento». Que `productId` siga sin escritor es (delegado), dentro de
  «cómo se relaciona»: el enlace se calcula al pedirlo y no se guarda.
- R15 — (humano) «docs/api-contract.md describe lo nuevo, para que el frontend
  construya contra él».
