# Requirements — F49 `honest-totals`

> Fuente de verdad: el `intent` de la F49 en `feature_list.json` (recortado el
> 2026-09-27: lo que generó cada depósito pasa a la F50). Notación EARS estricta.
> 16 requirements: uno por encima del tope de ~15, por decisión del humano del
> 2026-09-27 (filtro por la marca, R16; dicho en `decisions.md`).
>
> Nombres nuevos que salen al contrato y a la base — `excludedFromTotals`,
> `transfer=only|none`, `excluded=only|none`, `GET /api/transfers`,
> `GET /api/transfers/ambiguous` — aprobados por el humano el 2026-09-27.

## La marca de «no cuenta en las sumas»

### R1
CUANDO un cliente hace `PATCH /api/movements/:id` con `excludedFromTotals`
(`true` o `false`), el sistema DEBE guardar ese valor en el movimiento y responder
`200` con el movimiento serializado llevando el valor nuevo.

### R2
CUANDO un cliente hace `PATCH /api/movements` con `ids` y `excludedFromTotals`
(solo o junto a `categoryId`/`status`), el sistema DEBE escribir ese valor en todos
los movimientos de `ids` en una única operación de todo o nada, con las mismas
reglas y la misma respuesta `{ updated, movements }` que la F47.

### R3
SI el cuerpo de cualquiera de los dos `PATCH` trae `excludedFromTotals` con un valor
que no es literalmente `true` ni `false` (incluidos `null`, `"true"`, `0` y `1`)
ENTONCES el sistema DEBE responder `400 VALIDATION_ERROR` sin escribir nada.

### R4
El sistema DEBE incluir el campo `excludedFromTotals` (booleano, `false` por
defecto en todo movimiento existente o nuevo) en cada movimiento que serializa
`serializeMovement`, y por tanto en `GET /api/movements`, en los dos `PATCH` y en
`POST /api/transfers`.

### R5
MIENTRAS un movimiento tenga `excludedFromTotals = true`, el sistema NO DEBE sumar
su importe ni en `income` ni en `expense` de los `totals` de `GET /api/movements`.

### R6
MIENTRAS un movimiento tenga `excludedFromTotals = true`, el sistema NO DEBE sumar
su importe ni en `income` ni en `expense` de `period.totals` de `GET /api/overview`.

### R7
CUANDO se escribe `excludedFromTotals` (en cualquier sentido), el sistema NO DEBE
cambiar `amount`, `type`, `bookingDate`, `valueDate`, `description`,
`balanceAfter`, `transferId` ni `undoneTransferId` del movimiento, ni el `balance`
que `GET /api/accounts` devuelve para su cuenta.

### R8
CUANDO un movimiento pasa de `excludedFromTotals = true` a `false`, el sistema DEBE
volver a sumarlo en los `totals` de `GET /api/movements` y de `GET /api/overview`
exactamente como antes de marcarlo.

### R9
El sistema NO DEBE modificar `excludedFromTotals` al enlazar dos movimientos
(`POST /api/transfers`), al deshacer una pareja (`DELETE /api/transfers/:transferId`)
ni al ejecutar la detección de traspasos; y NO DEBE rechazar marcar un movimiento
por ser pierna de un traspaso, ni rechazar enlazar un movimiento por estar marcado.

## Filtro por traspaso en el listado

### R10
CUANDO `GET /api/movements` recibe `transfer=only`, el sistema DEBE devolver solo
los movimientos con `transferId` no nulo, y con `transfer=none` solo los que lo
tienen nulo; combinado con el resto de filtros existentes, y con `pagination` y
`totals` calculados sobre ese mismo conjunto filtrado.

### R11
SI `GET /api/movements` recibe `transfer` o `excluded` con un valor distinto de
`only` o `none` ENTONCES el sistema DEBE responder `400 VALIDATION_ERROR`.

### R16
CUANDO `GET /api/movements` recibe `excluded=only`, el sistema DEBE devolver solo
los movimientos con `excludedFromTotals = true`, y con `excluded=none` solo los que
lo tienen a `false`; combinado con el resto de filtros existentes (incluido
`transfer`), y con `pagination` y `totals` calculados sobre ese mismo conjunto
filtrado.

## Parejas de traspaso y dudosos

### R12
CUANDO un cliente hace `GET /api/transfers`, el sistema DEBE responder `200` con
`{ pairs }`, una entrada por cada `transferId` existente con ese `transferId` y sus
dos piernas serializadas (primero el `expense`, después el `income`), ordenadas de
la pareja más reciente a la más antigua según la `bookingDate` más reciente de sus
dos piernas, y `pairs: []` si no hay ninguna.

### R13
CUANDO se deshace con `DELETE /api/transfers/:transferId` una pareja cuyos dos
movimientos tienen `excludedFromTotals = false`, el sistema DEBE sumar sus dos
piernas en los `totals` de `GET /api/movements` (la de gasto en `expense`, la de
ingreso en `income`) y DEBE dejar de listar esa pareja en `GET /api/transfers`.

### R14
CUANDO un cliente hace `GET /api/transfers/ambiguous`, el sistema DEBE responder
`200` con `{ ambiguousCount, ambiguous }`, calculados en ese momento con la misma
lectura de candidatos y la misma función de emparejado que usa la detección tras
una importación, con la misma forma que esos dos campos tienen en el informe de
`POST /api/import`, y sin escribir nada en la base.

## Contrato

### R15
El sistema DEBE documentar en `docs/api-contract.md` el campo
`excludedFromTotals` del movimiento, su escritura por los dos `PATCH`, su efecto en
los `totals` de `GET /api/movements` y `GET /api/overview`, los parámetros `transfer`
y `excluded` de `GET /api/movements`, y los endpoints `GET /api/transfers` y
`GET /api/transfers/ambiguous`, con sus respuestas y errores.

---

## Procedencia

- R1 — (humano) «Marco una APERTURA DEP. de myinvestor como que no cuenta» / «poder deshacerlo». El **cómo** es (delegado): columna nueva `excludedFromTotals` en vez de dar escritor a `productId`. Razón: `productId` es una FK a `InvestmentProduct` y en la base real solo hay 3 productos `deposit` para ~12 depósitos (consulta del 2026-09-27); además no permitiría marcar un movimiento que no va a ningún producto. ← 🔴 1 de decisions.md (incluye aprobar el nombre).
- R2 — (delegado) «Si se marca de uno en uno, en bloque o las dos cosas»: las dos, reutilizando los dos `PATCH` que ya existen. ← 🔴 2.
- R3 — (añadido) El humano no dijo qué pasa con un valor que no es booleano. Propongo rechazo estricto, porque Fastify convierte tipos por defecto y un `null` podría acabar leído como `false` y desmarcar en silencio. Consecuencia técnica menor: en ⚙️.
- R4 — (humano) «GET /api/movements me dice en cada movimiento si está marcado».
- R5 — (humano) «deja de sumar en los totals de GET /api/movements».
- R6 — (humano) «… y de GET /api/overview».
- R7 — (humano) «su importe, su fecha y el saldo de la cuenta siguen igual» + que_no_quiero «que cambie el saldo» / «editar importe, fecha ni descripción».
- R8 — (humano) «Quito la marca y vuelve a sumar como antes».
- R9 — (delegado) «Si una pierna de un traspaso se puede marcar, y qué pasa si se empareja uno ya marcado»: marca y enlace son independientes; ninguno toca al otro. La detección no mira la marca (que_no_quiero: «mejorar la detección»). ← 🔴 3.
- R10 — (humano) «Pido GET /api/movements solo con traspasos emparejados, o solo sin ellos… los totals salen de lo filtrado». Nombre y valores (delegado): `transfer=only|none`. ← 🔴 4.
- R11 — (añadido) Consecuencia técnica del esquema cerrado que ya tiene el listado (F36): un valor desconocido de `transfer` o `excluded` es 400, como `type` o `status`. Sin decisión nueva.
- R16 — (humano) El humano eligió el 2026-09-27 la alternativa del 🔴 6: filtro por la marca `excluded=only|none`, gemelo del de traspasos.
- R12 — (humano) «Puedo ver qué parejas de traspaso hay, con las dos piernas y su transferId». Forma (delegado): endpoint propio `GET /api/transfers` con las parejas agrupadas y sin paginar. ← 🔴 5.
- R13 — (humano) «al deshacerla, las dos piernas vuelven a sumar» y «Las dos multas… se pueden deshacer así y vuelven a sumar». Las multas son datos reales: el test usa un análogo sembrado; el paso sobre la base real es un 📌 del humano. La condición «ninguna pierna marcada» sale de R9.
- R14 — (humano) «Puedo pedir en cualquier momento los traspasos dudosos». Calcularlos al pedirlos, sin guardarlos, lo aprobó el humano el 2026-09-27. La ruta `/api/transfers/ambiguous` es (delegado): reutiliza `ambiguous`, el nombre que ya tiene el campo en el informe de importación.
- R15 — (humano) «docs/api-contract.md describe lo nuevo».

Fuera de este spec, a propósito: ver lo que generó un depósito (F50).
