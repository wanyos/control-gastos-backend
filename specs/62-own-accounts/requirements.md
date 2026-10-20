# Requirements — F62 `own-accounts`

> Fuente de verdad: el `intent` de la feature 62 en `feature_list.json`. Las
> decisiones que el humano revisa están en `decisions.md`; los nombres de tabla,
> columna, ruta y campo son **propuesta pendiente de aprobación** (`decisions.md`
> 🔴 6): si cambian, el leader corrige estos nombres antes de lanzar los lotes.
>
> Vocabulario de este archivo (definido aquí, no son términos nuevos para el
> humano):
> - **tabla de cuentas propias**: la tabla `OwnAccount` con sus textos
>   (`OwnAccountText`).
> - **formas del nombre del titular**: las filas de `AccountHolderName`.
> - **texto normalizado**: minúsculas, sin diacríticos, cada tramo de caracteres
>   que no sean `a-z` ni `0-9` cambiado por un espacio, sin espacios al principio ni
>   al final (`design.md` §3).
> - **casa**: un texto normalizado `t` casa con una descripción normalizada `d`
>   cuando `" " + d + " "` contiene `" " + t + " "` (palabras enteras).
> - **texto de banco**: un texto de cuenta cuyo texto normalizado es igual al
>   `bank` normalizado de **alguna** fila de la tabla de cuentas propias.
> - **sumas**: los `totals` de `GET /api/movements`, los `period.totals` de
>   `GET /api/overview` y lo que `GET /api/recurring-expenses` cuenta como gasto
>   (las tres pasan por `computeTotals` / `isCountedExpense`).

## Tabla de cuentas propias y nombre del titular

## R1
CUANDO un cliente hace `POST /api/own-accounts` con `name`, `bank`, `type`
válidos y, opcionalmente, `accountNumber`, `openedAt`, `closedAt` y `texts`, el
sistema DEBE responder `201` con la fila creada y DEBE devolverla después en
`GET /api/own-accounts`, cuya lista va ordenada por `bank` y luego por `name`.

## R2
CUANDO un cliente hace `PATCH /api/own-accounts/:id` con uno o varios de esos
campos, el sistema DEBE cambiar solo los campos enviados (`texts`, si viaja,
sustituye la lista entera) y responder `200` con la fila completa; SI el `id` no
existe ENTONCES DEBE responder `404 NOT_FOUND` sin escribir nada.

## R3
SI el cuerpo de `POST` o `PATCH /api/own-accounts` trae un `name` o un `bank`
vacío, un `type` fuera de la lista, una fecha que no es `YYYY-MM-DD`, un
`closedAt` anterior a `openedAt`, un texto cuyo texto normalizado tiene menos de
3 caracteres, o una propiedad no admitida ENTONCES el sistema DEBE responder
`400 VALIDATION_ERROR` sin escribir nada.

## R4
CUANDO un cliente hace `PUT /api/own-accounts/holder-names` con
`{ "names": [...] }`, el sistema DEBE sustituir las formas del nombre del titular
por exactamente esa lista y `GET /api/own-accounts/holder-names` DEBE devolverla;
SI alguna forma tiene menos de 3 caracteres una vez normalizada ENTONCES DEBE
responder `400 VALIDATION_ERROR` sin escribir nada.

## Reconocimiento

## R5
CUANDO la descripción normalizada de un movimiento casa con una forma del nombre
del titular o con un texto de cuenta que **no** es texto de banco, el sistema
DEBE dejar ese movimiento fuera de las tres sumas, con `ownership.status: "own"`.

## R6
SI la descripción de un movimiento no casa con ninguna forma del nombre del
titular ni con ningún texto de cuenta ENTONCES el sistema NO DEBE sacarlo de las
sumas por la tabla de cuentas propias, aunque el banco de su cuenta, o un banco
nombrado en su descripción, esté en esa tabla (el campo `bank` nunca se usa como
texto).

## R7
CUANDO la descripción normalizada de un movimiento casa con uno o más textos de
banco y con ningún otro texto ni forma del nombre del titular, y el movimiento no
lleva `transferId`, ni `excludedFromTotals: true`, ni `ownershipDecision`, el
sistema DEBE devolverlo con `ownership.status: "doubtful"` y seguir contándolo en
las sumas como hasta ahora.

## R8
SI un movimiento lleva `transferId` o `excludedFromTotals: true` ENTONCES el
sistema NO DEBE darle `ownership.status: "doubtful"`, y NO DEBE cambiar lo que ya
dejaba fuera de las sumas.

## R9
SI un movimiento es de depósito (tiene entrada en `readDepositMovements`)
ENTONCES lo que suma DEBE seguir siendo lo que dice la regla de depósitos de la
feature 57, sea cual sea su `ownership`.

## R10
CUANDO un cliente hace `PATCH /api/movements/:id` con `ownershipDecision`
`"mine"`, `"not_mine"` o `null`, el sistema DEBE guardarlo y, desde ese momento,
`"mine"` DEBE dejar el movimiento fuera de las sumas, `"not_mine"` DEBE hacer
que la tabla de cuentas propias no lo saque de ellas (cuenta como contaría sin la
tabla: una pierna de traspaso o un marcado siguen fuera) y `null` DEBE
devolverlo al reconocimiento; la decisión manda sobre lo que diga la tabla.

## R11
CUANDO un cliente hace `GET /api/movements`, cada movimiento de `movements` DEBE
llevar `ownership`: `null` si no casa con nada y no tiene `ownershipDecision`, o
`{ status, ownAccountId, ownAccountName, matchedText }` con `status` uno de
`"own"`, `"doubtful"`, `"mine"`, `"not_mine"`.

## R12
CUANDO un cliente hace `GET /api/movements?ownership=doubtful`, el sistema DEBE
devolver solo los movimientos con `ownership.status: "doubtful"`, y la paginación
y los `totals` DEBEN ser los de ese filtro.

## R13
El sistema DEBE calcular el reconocimiento al leer, sobre lo que haya en la base
en ese momento: vale igual para un movimiento que ya estaba antes de dar de alta
la cuenta propia y para uno que entra después en una importación, sin volver a
ejecutar nada.

## R14
El reconocimiento NO DEBE escribir en ningún movimiento: `amount`, `type`,
`balanceAfter`, el `balance` de las cuentas, `transferId`, `excludedFromTotals`
y las parejas que forma la detección de traspasos (`detectTransfers`) DEBEN
quedar exactamente como estarían sin la tabla de cuentas propias.

## Contrato

## R15
El sistema DEBE tener `docs/api-contract.md` describiendo las rutas de
`/api/own-accounts`, cómo se reconoce un movimiento como propio, cuándo queda
dudoso, el campo `ownership`, el filtro `ownership` y el campo
`ownershipDecision` de `PATCH /api/movements/:id`.

## Procedencia

- R1 — (humano) «Puedo dar de alta, cambiar y consultar mis cuentas y productos
  con sus datos y los textos…»; «organizados por banco» → orden por `bank`.
  Los campos salen de «nombre, banco, número de cuenta, tipo, fecha de apertura,
  fecha de cierre… y los textos». El `type` como lista cerrada es (delegado):
  `checking`, `savings`, `investment`, `deposit`, `crypto`, `other`.
- R2 — (humano) «cambiar». El 404 es (añadido) menor, como en el resto de rutas.
- R3 — (añadido) Validación. El mínimo de 3 caracteres es mío: un texto de 1-2
  letras casaría con medio extracto. Sin borrado de filas: el humano dijo «alta,
  cambiar y consultar»; una cuenta que ya no se quiere se deja sin textos.
- R4 — (delegado) «Cómo se guarda mi nombre como titular y con qué variantes
  aparece»: una lista de formas que escribe él, sustituida entera en cada `PUT`.
  Medido: su nombre aparece completo, con los apellidos delante, recortado por el
  banco y con guiones bajos en lugar de espacios; la normalización junta esta
  última con la forma completa.
- R5 — (humano) «si su concepto nombra una cuenta o un producto míos, o a mí, no
  cuenta ni como gasto ni como ingreso, solo, sin pareja y sin que yo lo revise»;
  «movimientos dentro de un mismo banco entre mis cosas tampoco cuentan» (es el
  mismo mecanismo: el texto de la cartera o del fondo). Las «tres sumas» salen
  de la orden del leader: lo que deje de contar, en todas por igual.
- R6 — (humano) «Una transferencia a otra persona cuenta como gasto o ingreso
  normal aunque vaya a un banco donde yo también tengo cuenta»; «Que no se
  reconozca una cuenta mía solo por el nombre del banco».
- R7 — (delegado) «Cuándo exactamente un movimiento es no claro»: cuando lo único
  que lo reconoce es un texto que es el nombre de uno de sus bancos. Que siga
  contando mientras tanto sale de «Lo que no se reconozca como mío cuenta como
  gasto o ingreso normal». ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 1 y 2).
- R8 — (delegado) «Qué pasa con los 53 movimientos marcados… cómo conviven»: la
  marca se queda y manda; un marcado o una pierna de traspaso nunca queda dudoso.
  Hoy son 55, no 53 (medido el 2026-10-20). ← `decisions.md` 🔴 4.
- R9 — (añadido) La regla de depósitos de la F57 ya decide sola lo que suma un
  movimiento de depósito; la tabla no la pisa. Sin esto, un texto que nombre un
  depósito quitaría su interés de los ingresos.
- R10 — (humano) «la veo y la resuelvo a mano, y mi decisión se respeta». Que la
  decisión valga también sobre un reconocimiento claro, y que `null` la deshaga,
  es (delegado) «cómo se resuelve uno dudoso».
- R11 — (delegado) «Cómo se ve en cada movimiento que no cuenta por ser mío».
- R12 — (humano) «la veo» → poder pedir solo las dudosas.
- R13 — (humano) «Vale para los movimientos que ya están en la base y para los
  que entren en cada importación»; «Tener que marcar a mano, en cada importación…»
  (no quiero). Calcular al leer es (delegado), como la regla de depósitos.
- R14 — (humano) «Los traspasos que ya se emparejan solos siguen igual»; «Que
  cambie ningún importe ni ningún saldo: solo si cuenta en las sumas».
- R15 — (humano) «docs/api-contract.md describe la tabla, cómo se reconoce un
  movimiento como mío, cómo se señala uno dudoso y cómo se resuelve».

> Son 15 requirements: el tope. La relación con `Account` y con
> `InvestmentProduct` (delegada) se resuelve sin requirement propio: la tabla es
> independiente y no se enlaza (`design.md` §1, `decisions.md` 🔴 5).
