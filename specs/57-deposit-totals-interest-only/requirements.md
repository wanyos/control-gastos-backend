# Requirements — F57 `deposit-totals-interest-only`

> Fuente de verdad: el `intent` de la feature 57 en `feature_list.json` y
> `../docs/handoff-depositos.md`. Las decisiones para el humano están en
> `decisions.md`; aquí va la maquinaria para el implementer y el reviewer.
>
> **Nombres propuestos, pendientes de aprobación en la puerta** (`decisions.md`
> 🔴 5): el campo `deposit` de cada movimiento y sus claves `kind`
> (`opening` | `cancellation` | `maturity`), `principal`, `countedAmount`,
> `ambiguous`, `reason` (`principal_not_found` | `several_principals` |
> `opening_not_found`) y `candidateMovementIds`. Si el humano los cambia, se
> cambian aquí y en `design.md` antes de implementar.

## Vocabulario de este documento (descripciones literales, no términos nuevos)

- **Movimiento de depósito**: un movimiento que el reconocedor del banco de su
  cuenta clasifica como apertura, cancelación o vencimiento de depósito (R1).
- **Capital** de un vencimiento: el importe que se metió en el depósito; el
  interés es `amount − capital`.
- **Apertura aún no devuelta**: una apertura de la misma cuenta que todavía no
  ha servido de capital a ningún vencimiento ni ha sido devuelta por ninguna
  cancelación, recorriendo los movimientos de depósito de esa cuenta en orden
  `bookingDate`, `daySequence` (nulo = 0), `id`.
- **Condición de importe**: para un capital candidato `C` y un vencimiento de
  importe `M`, `C ≤ M` y `M − C < C` (el interés no es negativo y no llega al
  propio capital).

## R1
El sistema DEBE clasificar como movimiento de depósito, mediante el reconocedor
del banco de la cuenta del movimiento inyectado desde `src/app.ts`, un movimiento
cuya descripción ese banco reconoce como apertura (y es `expense`), cancelación (y
es `income`) o vencimiento (y es `income`) de depósito; para `myinvestor`, las
descripciones que, sin los espacios iniciales, empiezan por `APERTURA DEP`,
`CANCELACION DEP` e `INTERESES DEP` respectivamente.

## R2
CUANDO se calculan los `totals` de `GET /api/movements`, el sistema DEBE sumar
`0` a `income` y a `expense` por cada apertura y por cada cancelación de depósito.

## R3
CUANDO se calculan los `totals` de `GET /api/movements` y un vencimiento de
depósito tiene capital cierto (R4 o R5), el sistema DEBE sumar a `income`
exactamente `amount − capital` de ese vencimiento.

## R4
CUANDO existe exactamente un producto `deposit` del mismo `bank` que la cuenta
del vencimiento, con `maturityDate` igual al `bookingDate` del vencimiento y cuyo
`principal` cumple la condición de importe, el sistema DEBE tomar ese
`principal` como capital del vencimiento.

## R5
CUANDO no hay ningún producto `deposit` que cumpla R4 y todas las aperturas aún
no devueltas de la misma cuenta, anteriores al vencimiento y que cumplen la
condición de importe tienen un mismo importe, el sistema DEBE tomar ese importe
como capital del vencimiento.

## R6
El sistema DEBE dar por devuelta cada apertura una sola vez y en el orden del
recorrido: la más antigua de importe igual al capital de cada vencimiento con
capital cierto (venga de R4 o de R5), y la más antigua de importe exactamente
igual al de cada cancelación.

## R7
SI un vencimiento de depósito no tiene capital cierto (ningún candidato por R4 ni
por R5, más de un producto por R4, o candidatos por R5 de importes distintos)
ENTONCES el sistema DEBE sumarlo `0` a `income` y a `expense`, y NO DEBE dar
por devuelta ninguna apertura por él.

## R8
SI una cancelación de depósito no encuentra ninguna apertura aún no devuelta de
exactamente su importe ENTONCES el sistema DEBE señalarla como dudosa con
`reason: "opening_not_found"`.

## R9
CUANDO un movimiento de depósito entra en una suma, el sistema NO DEBE consultar
su `excludedFromTotals`, su `transferId` ni su `productId`: lo que suma es solo
lo que dicen R2, R3 y R7.

## R10
CUANDO un cliente pide `GET /api/movements`, el sistema DEBE devolver en cada
movimiento el campo `deposit`: `null` si no es movimiento de depósito, y si lo es
un objeto con `kind`, `principal` (capital como cadena decimal, o `null` si no es
cierto), `countedAmount` (lo que suma a `income` o `expense`, como cadena
decimal), `ambiguous`, `reason` y `candidateMovementIds`.

## R11
SI un vencimiento queda sin capital cierto ENTONCES el sistema DEBE devolverlo con
`deposit.ambiguous: true`, `deposit.reason` igual a `principal_not_found` (ningún
candidato) o `several_principals` (varios), y en `deposit.candidateMovementIds`
los ids de las aperturas candidatas por R5 en orden ascendente (vacío si no hay o
si la duda viene de varios productos).

## R12
El sistema NO DEBE cambiar el `amount` ni el `type` de ningún movimiento de
depósito, ni en la base ni en ninguna respuesta.

## R13
CUANDO un cliente pide `GET /api/overview`, el sistema DEBE calcular
`period.totals` con la misma regla de R2, R3, R7 y R9, por la misma función que
`GET /api/movements`.

## R14
CUANDO se aplica la migración de esta feature, el sistema DEBE poner
`excludedFromTotals = false` en los movimientos de cuentas `myinvestor` que R1
clasifica como de depósito, y NO DEBE cambiar ninguna otra fila ni columna.

## R15
El sistema DEBE calcular la clasificación, el capital y lo que cuenta cada
movimiento de depósito en cada lectura, sin escribir nada en la base: un
movimiento de depósito que entra por una importación posterior cuenta según
R2–R7 en la siguiente lectura sin ninguna otra acción.

## R16
`docs/api-contract.md` DEBE describir cómo cuenta en los `totals` cada clase de
movimiento de depósito, el campo `deposit` con sus claves y valores, cómo se
señala uno dudoso, y que `excludedFromTotals` no cambia lo que suma un
movimiento de depósito.

---

## Cobertura de `como_se_que_esta_bien`

| Frase del humano | Requirements |
|---|---|
| Octubre de 2026 con datos reales: aperturas y cancelaciones fuera, del vencimiento solo el interés | R2, R3, R4, R6, R13 (y la prueba real del humano: ver `decisions.md` 🧪) |
| Agosto de 2025 a septiembre de 2026 recuperan los intereses | R3, R5, R6, R9, R14 |
| Cada movimiento de depósito sigue enseñando el importe del banco | R12, R10 |
| Uno sin capital cierto no se adivina: dudoso, cuál y por qué | R7, R8, R11 |
| `docs/api-contract.md` lo describe | R16 |

## Procedencia

- R1 — (delegado) El humano cedió cómo se reconoce cada clase. Uso los prefijos
  que ya cita el handoff y que ya usa la F50 para `INTERESES DEP`, en el módulo
  del banco (ADR-015). Exigir el `type` es mío: una apertura que entrase como
  `income` no es lo que el humano describe y se queda contando como hoy.
- R2 — (humano) «abrir un depósito no suma… cancelarlo no suma».
- R3 — (humano) «que venza suma a income solo su interés (el importe del
  movimiento menos el capital del depósito), el día del vencimiento».
- R4 — (delegado) «Puede apoyarse en los productos deposit»: la misma unión por
  fecha que ya hace la F50. La condición de importe aplicada al producto es
  añadido mío (un `.json` cuyo principal no casa con el importe es una unión
  equivocada).
- R5 — (delegado) «cada vencimiento llega con una apertura del mismo banco por el
  mismo capital antes». **(añadido) la condición «el interés es menor que el
  capital»**: sin ella el vencimiento de julio de 2026 queda dudoso entre dos
  aperturas (comprobado con los datos, ver `design.md` §6). ← REVISAR EN
  APROBACIÓN (`decisions.md` 🔴 2).
- R6 — (delegado) «las cancelaciones devuelven exactamente el capital de la
  apertura». Que cada apertura se devuelva una sola vez es lo que permite
  distinguir dos depósitos del mismo importe sin leer el número de la descripción.
- R7 — (añadido) El humano dijo «no se adivina», no cuánto cuenta un dudoso.
  Propongo `0`. ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 1).
- R8 — (añadido) Cancelación sin apertura → dudosa, aunque siga sumando 0. Sale
  de «lo que no cuadre, dudoso» del delegado, pero el humano no habló de
  cancelaciones dudosas. ← REVISAR EN APROBACIÓN (`decisions.md` 🔴 6).
- R9 — (delegado) «Qué pasa con excludedFromTotals… si la regla nueva la
  sustituye». Decido que la sustituye en movimientos de depósito; que tampoco se
  miren `transferId` ni `productId` es añadido mío (hoy ningún movimiento de
  depósito tiene ninguno de los dos; comprobado).
- R10 — (delegado) «Qué campo, si alguno, enseña en cada movimiento cuánto cuenta».
  Nombres propuestos (`decisions.md` 🔴 5).
- R11 — (delegado) «cómo se señala un movimiento dudoso» y «la respuesta dice cuál
  es y por qué».
- R12 — (humano) «El movimiento sigue enseñando el importe que dio el banco. No
  se parte en dos ni se cambia su amount».
- R13 — (humano) «y todo lo que se calcule de la misma forma, como los
  period.totals de GET /api/overview».
- R14 — (delegado) «si hay que limpiar las 29 marcas actuales». Decido quitarlas
  con la migración (`decisions.md` 🔴 3).
- R15 — (humano) «Vale para los movimientos que ya están en la base y para los que
  entren en cada importación» y «sin que nadie marque nada». Calcular al leer es
  delegado (`decisions.md` 🔴 4).
- R16 — (humano) Frase 5 de `como_se_que_esta_bien`.

**Tamaño: 16 requirements**, uno por encima del tope de ~15. Lo dice
`decisions.md` ⚙️.
