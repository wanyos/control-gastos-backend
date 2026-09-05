# Requirements — F41 `transfer-batch-pairing`

> EARS estricto (ver `docs/specs.md`). Fuente de verdad: el bloque `intent` de la
> feature 41 en `feature_list.json` (dictado por el humano el 2026-09-03 tras la
> primera pasada real de la F40). Esta feature **refina la regla de emparejamiento**
> de la F40 sin tocar nada más: ni la ventana de 3 días, ni la transaccionalidad,
> ni la idempotencia, ni el esquema, ni la forma del informe.

## Definiciones previas

Se reutilizan tal cual las de `specs/40-transfer-detection/requirements.md`:
**candidato válido** (mismo importe, `type` opuesto, cuentas distintas, fechas a
≤ 3 días naturales, `transferId = null`) y **pareja inequívoca** (unicidad mutua).

**Grupo dudoso** es lo que la F40 deja en `ambiguous`: un conjunto de movimientos
conectados entre sí por la relación de candidatura que no forman parejas
inequívocas. Dentro de un grupo dudoso, las **salidas** son sus movimientos
`expense` y las **entradas** sus movimientos `income` (todos comparten `amount`
por construcción).

**Condición de resolución de un grupo dudoso** (las dos letras se citan desde
los requirements; no es un término del proyecto, es una etiqueta de este
documento):

- **(a)** el número de salidas es **igual** al número de entradas, y
- **(b)** **cada** salida cumple con **cada** entrada todas las condiciones de
  candidato válido (cuentas distintas y ≤ 3 días entre sí, para todas las
  combinaciones salida–entrada del grupo).

---

## R1
CUANDO la detección de traspasos deja un grupo dudoso que cumple las condiciones
(a) y (b), el sistema DEBE emparejar sus salidas con sus entradas según el orden
de R2, escribiendo en cada par un `transferId` compartido por sus dos piernas y
distinto del de cualquier otro par.

## R2
CUANDO el sistema empareja un grupo por R1, DEBE ordenar por separado las salidas
y las entradas por `bookingDate` ascendente, después `daySequence` ascendente
(un `daySequence` ausente ordena como 0), después `id` ascendente, y emparejar la
salida en la posición k con la entrada en la posición k.

## R3
SI un grupo dudoso tiene distinto número de salidas que de entradas ENTONCES el
sistema NO DEBE emparejar a ningún movimiento del grupo (ni parcialmente): el
grupo entero sigue saliendo en `ambiguous` como hasta ahora.

## R4
SI un grupo dudoso tiene igual número de salidas que de entradas pero alguna
combinación salida–entrada incumple una condición de candidato válido (misma
cuenta, o más de 3 días entre ellas) ENTONCES el sistema NO DEBE emparejar a
ningún movimiento del grupo: el grupo entero sigue saliendo en `ambiguous`.

## R5
CUANDO los candidatos forman parejas inequívocas según la regla de la F40, el
sistema DEBE producir exactamente las mismas parejas que producía antes de esta
feature (verificable: los tests existentes de la F40 pasan sin modificar sus
expectativas).

## R6
CUANDO la detección se ejecuta una segunda vez sin movimientos nuevos, el sistema
DEBE dejar exactamente las mismas parejas: un movimiento con `transferId != null`
no se reevalúa, no se reempareja y no se desempareja (incluidas las parejas ya
escritas en la base de datos antes de desplegar esta feature).

## R7
El sistema NO DEBE modificar ningún campo de ningún movimiento distinto de
`transferId`, ni crear o borrar movimientos, ni tocar el ancla, saldos o el
descarte de duplicados (verificable comparando la fila entera antes y después,
excepto `transferId` y `updatedAt`).

## R8
CUANDO el sistema escribe un par procedente de R1, DEBE escribir sus dos piernas
en una sola transacción con el mismo mecanismo de la F40: SI solo una de las dos
puede escribirse ENTONCES no se escribe ninguna y el resto de pares no se ve
afectado.

## R9
CUANDO una pasada resuelve un grupo por R1, ese grupo NO DEBE aparecer en
`ambiguous` del informe y sus pares DEBEN contarse en `pairsCreated` (la forma
del campo `transfers` del informe no cambia; solo qué cae en cada lado).

## R10
El sistema DEBE actualizar la descripción de la regla de emparejamiento en
`docs/api-contract.md` (la nota de `POST /api/import/local` y la tabla del campo
`transfers`) y en `docs/data-model.md` §Traspasos: dejan de decir que **solo** se
emparejan parejas inequívocas.

---

## Procedencia

- R1 — (humano) Sale de «cuando entre dos cuentas mías hay el mismo número de
  salidas que de entradas del mismo importe dentro de la ventana, que las
  empareje». La condición (b) —cada salida con cada entrada— es la parte
  (delegado) de «cómo se separa un grupo dudoso por pareja de cuentas»: la
  separación por pareja de cuentas ya la hace la agrupación de la F40 (dos
  parejas de cuentas sin movimiento en común nunca caen en el mismo grupo
  dudoso), y cuando un grupo mezcla destinos porque comparte una pierna (el
  cruce del punto 2), lo que lo hace resoluble es que todas las combinaciones
  sean válidas: las salidas son indistinguibles y da igual cuál casa con cuál.
  ← 🔴 2 en decisions.md.
- R2 — (delegado) El humano cedió «el criterio exacto de orden… y qué pasa con
  empates de fecha». Decido: fecha → posición dentro del día (`daySequence`) →
  `id`. Alternativa descartada: fecha → `id` a secas (ignora el orden intradía
  que el extracto sí trae). ← 🔴 1 en decisions.md.
- R3 — (humano) Sale de «no quiero que un lote desigualado… se empareje
  parcialmente adivinando: sigue dudoso entero» y del punto 4 real (2×500 con
  una sola entrada).
- R4 — (añadido) El humano no contempló el grupo con números iguales pero
  encadenado por la ventana (alguna combinación a más de 3 días). Decido: sigue
  dudoso entero, porque emparejar ahí sí es adivinar. ← 🔴 3 en decisions.md;
  REVISAR EN APROBACIÓN.
- R5 — (humano) Sale de «todo lo que la F40 ya emparejaba se sigue emparejando
  igual; ninguna pareja ya hecha cambia».
- R6 — (humano) Sale de «correr la pasada dos veces deja exactamente las mismas
  parejas (sigue siendo idempotente)» y de «las ya escritas en la base de datos
  no se tocan».
- R7 — (humano) Sale de «ningún otro campo de ningún movimiento cambia» y de
  «no quiero tocar el esquema… ni el resto de reglas de la F40».
- R8 — (humano) Sale de «no quiero cambiar… el resto de reglas de la F40»: la
  transaccionalidad por pareja (R11 de la F40) se hereda sin cambios para los
  pares nuevos.
- R9 — (humano) Sale de «el informe [no cambia] más allá de que los grupos
  resueltos dejen de salir como dudosos».
- R10 — (humano) Acceptance: «docs/api-contract.md y docs/data-model.md
  actualizados si cambia algo visible del informe» — la forma no cambia, pero la
  regla descrita en prosa sí.

### Cobertura de `como_se_que_esta_bien`

| Punto del intent | Cubierto por |
| --- | --- |
| Los tres grupos aprobados quedan emparejados solos | R1, R2, R9 (fixtures sintéticos de los puntos 1, 2 y 3 en tasks.md) |
| El punto 4 (2×500, una entrada) sigue dudoso | R3 |
| Lo de la F40 se empareja igual; ninguna pareja hecha cambia | R5, R6 |
| Dos pasadas → mismas parejas | R6 |
| Ningún otro campo cambia | R7 |
