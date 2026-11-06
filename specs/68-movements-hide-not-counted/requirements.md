# Requirements — F68 `movements-hide-not-counted`

> Fuente de verdad: el `intent` de la feature 68 en `feature_list.json` (aprobado
> por el humano el 2026-11-06). Entrada: el encargo del frontend,
> `../gastos-frontend/progress/backend-hide-not-counted.md`. Las decisiones que el
> humano revisa están en `decisions.md`.
>
> El nombre del parámetro (`hideNotCounted`) es una **propuesta** pendiente de
> aprobación (`decisions.md` 🔴 3). Si el humano lo cambia, se cambia en los cuatro
> archivos y en los nombres de test; el comportamiento no.
>
> Definiciones de este archivo (no son términos nuevos para el humano):
> - **marcado**: `excludedFromTotals = true`.
> - **emparejado**: `transferId` no nulo.
> - **movimiento de depósito**: el que tiene entrada en el mapa que devuelve
>   `readDepositMovements` (F57), es decir, `deposit` no nulo en la respuesta.
> - **suma algo**: movimiento de depósito cuyo `counted` (el `deposit.countedAmount`
>   de la respuesta) es distinto de 0. Hoy solo puede serlo un vencimiento con
>   capital cierto e interés mayor que 0.
> - **la misma petición sin el filtro**: la misma querystring quitando
>   `hideNotCounted` (y con `page=1`).

## Qué esconde y qué no

## R1
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=true`, el sistema
NO DEBE devolver ni contar ningún movimiento marcado o emparejado que no sea un
movimiento de depósito.

## R2
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=true`, el sistema
DEBE devolver todo movimiento de depósito que suma algo que coincida con el resto
del filtro, esté marcado, emparejado, las dos cosas o ninguna.

## R3
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=true`, el sistema
NO DEBE devolver ningún movimiento de depósito marcado o emparejado que no suma
algo (vencimiento dudoso, apertura, cancelación, o vencimiento con capital cierto e
interés exactamente 0).

## R4
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=true`, el sistema
DEBE devolver todo movimiento que no esté ni marcado ni emparejado y que coincida
con el resto del filtro, sea o no de depósito y sea cual sea su `ownership`, su
`productId` o su `type`.

## R5
El sistema DEBE decidir si un movimiento de depósito suma algo con la regla de la
F57 sobre toda la historia de su cuenta, no sobre los movimientos que deja el
filtro: un vencimiento cuya apertura queda fuera del rango pedido sigue saliendo si
su interés es mayor que 0.

## Lo que devuelve

## R6
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=true`, el sistema
DEBE calcular `pagination` y `totals` sobre exactamente los movimientos que ese
filtro deja, igual que con el resto de parámetros.

## R7
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=true`, el sistema
DEBE devolver unos `totals` (`income`, `expense`, `net`) idénticos a los de la misma
petición sin el filtro.

## R8
CUANDO un cliente hace la misma petición con `hideNotCounted=true` y sin él, la
diferencia entre los dos `pagination.total` DEBE ser igual al número de movimientos
que R1 y R3 dejan fuera, de modo que lo que se ve más lo escondido son todos los
movimientos de la petición sin el filtro.

## El parámetro

## R9
CUANDO un cliente hace `GET /api/movements` con `hideNotCounted=false` o sin el
parámetro, el sistema DEBE responder exactamente lo mismo que respondía antes de
esta feature.

## R10
SI `hideNotCounted` llega con un valor que no es `true` ni `false` ENTONCES el
sistema DEBE responder `400 VALIDATION_ERROR`, con el mismo criterio que
`uncategorized`.

## R11
CUANDO un cliente combina `hideNotCounted=true` con cualquier otro parámetro de
`GET /api/movements` (incluidos `excluded`, `transfer` y `ownership`), el sistema
DEBE devolver solo los movimientos que cumplen a la vez ese otro parámetro y R1–R4.

## R12
El sistema NO DEBE cambiar lo que suma cada movimiento, los `totals` de una
petición sin `hideNotCounted`, ni lo que devuelven `excluded=only|none`,
`transfer=only|none` y `ownership=doubtful` sin `hideNotCounted`.

## R13
El sistema DEBE documentar en `docs/api-contract.md` §`GET /api/movements` el
parámetro `hideNotCounted`: qué deja fuera, la excepción de los movimientos de
depósito que suman algo, que los `totals` no cambian, cómo se combina con los demás
parámetros, su error 400, y cómo se obtiene el número de escondidos (la misma
petición sin el parámetro, restando los dos `pagination.total`).

---

## Procedencia

- R1 — (humano) «Un movimiento normal marcado o emparejado no sale» y «escondiendo
  lo marcado como que no cuenta y lo emparejado como traspaso» [encargo].
- R2 — (humano) «Un vencimiento de depósito con capital, marcado como que no
  cuenta, sale con el filtro» y «Lo mismo si está emparejado como traspaso»
  [encargo]. (delegado, forma del filtro) el criterio es «suma algo»
  (`counted ≠ 0`), no «es un vencimiento con capital»: es la frase literal del
  `que_quiero` («los movimientos de depósito que suman algo»).
- R3 — (humano) «Un vencimiento dudoso (suma 0) marcado o emparejado no sale» y
  «Una apertura o cancelación de depósito (suman 0) marcada o emparejada no sale»
  [frontend, a confirmar] ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 1).
  (añadido) el vencimiento con capital cierto e interés exactamente 0 también se
  esconde: suma 0, como los otros tres. El humano no lo dijo; sale de aplicar
  «suma algo» al pie de la letra (`decisions.md` ⚙️ 1).
- R4 — (añadido) El humano no dijo qué pasa con lo que no está marcado ni
  emparejado. Propongo: nada, sale como hoy, también lo que es dinero entre tus
  cuentas (`own`/`mine`), los `neutral` y los de `productId`, aunque no sumen.
  Es lo que hace hoy `excluded=none&transfer=none` y lo que necesita R8 para que el
  contador cuadre ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 4).
- R5 — (añadido, técnico) No lo dijo el humano; es la regla de la F57 («toda la
  historia, no el filtro») aplicada al filtro. Sin ella, pedir solo octubre
  escondería un vencimiento cuya apertura es de septiembre.
- R6 — (humano) «sigue en la lista y en los totales del mes» [encargo]; el encargo
  pide «su `pagination` y sus `totals` calculados sobre ese mismo filtro».
- R7 — (humano) «Los totales del mes con el filtro son exactamente los mismos que
  sin él, porque lo que se esconde ya no sumaba» [leader]. Comprobado antes de
  redactar sobre `computeTotals` (ver `design.md` §5).
- R8 — (humano) «Lo que se ve con el filtro más lo que esconde son todos los
  movimientos del mes» [encargo]. (delegado) «Cómo pide el frontend el número de
  escondidos»: como hoy, con una segunda petición sin el filtro y restando los dos
  `pagination.total`; sin campo nuevo en la respuesta (`decisions.md` 🔴 2).
- R9 — (humano) «Que cambie […] los totales sin el filtro» [encargo, `que_no_quiero`].
  (delegado, forma del parámetro) `false` no filtra, como `uncategorized=false`.
- R10 — (delegado) forma del parámetro: booleano con el mismo criterio que
  `uncategorized`, que es el precedente del módulo.
- R11 — (añadido) El humano no dijo cómo se combina con `excluded`, `transfer` y
  `ownership`. Propongo: se combinan como todos los demás (se cumplen a la vez),
  sin 400 ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 5).
- R12 — (humano) «Que cambie lo que suma cada movimiento ni los totales sin el
  filtro» y «Que cambien excluded=only/none y transfer=only/none tal como
  funcionan hoy» [encargo]. `ownership=doubtful` se añade por el mismo motivo.
- R13 — (humano) «cuando esté publicado el contrato» [encargo]; el backend es dueño
  del contrato (`CLAUDE.md` del workspace). (delegado) que el contrato diga cómo se
  cuentan los escondidos sale del segundo punto de `delego_en_agente`.
