# Requirements — F40 `transfer-detection`

> EARS estricto (ver `docs/specs.md`). Fuente de verdad: el bloque `intent` de la
> feature 40 en `feature_list.json`. Vocabulario: "las dos piernas de un traspaso"
> es la expresión que ya usa `docs/data-model.md` §Traspasos; no se introduce
> ningún término nuevo.

## Definición previa: candidato válido

Para un movimiento `M` con `transferId = null` y `type` `expense` o `income`, un
**candidato válido** es otro movimiento `C` que cumple **todas** estas
condiciones:

- `C.transferId = null`
- `C.amount = M.amount` (los importes son siempre positivos; el signo va en `type`)
- `C.type` es el opuesto de `M.type` (`expense` ↔ `income`; `neutral` queda fuera
  por construcción)
- `C.accountId ≠ M.accountId`
- `|C.bookingDate − M.bookingDate| ≤ 3` días naturales

Una **pareja inequívoca** es un par `(E, I)` donde `I` es el **único** candidato
válido de `E` **y** `E` es el único candidato válido de `I` (unicidad mutua).

---

## R1
CUANDO termina una pasada de `POST /api/import` o de `POST /api/import/local`
(después de procesar todos sus archivos), el sistema DEBE ejecutar la detección
de traspasos sobre **todos** los movimientos de la base de datos con
`transferId = null` y `type` distinto de `neutral`.

## R2
CUANDO la detección encuentra una pareja inequívoca, el sistema DEBE escribir el
**mismo** `transferId` en las dos piernas.

## R3
El sistema DEBE generar para cada pareja un `transferId` nuevo que no coincida
con el de ninguna otra pareja (dos traspasos distintos nunca comparten
`transferId`).

## R4
SI un movimiento no tiene ningún candidato válido (una transferencia a una
cuenta de un tercero, un Bizum) ENTONCES el sistema NO DEBE escribirle
`transferId` ni listarlo en el informe.

## R5
SI un movimiento tiene candidatos válidos pero no forma una pareja inequívoca
(más de un candidato, o su candidato tiene a su vez otros) ENTONCES el sistema
NO DEBE emparejar a ninguno de los movimientos implicados.

## R6
CUANDO una pasada deja movimientos sin emparejar por la regla R5, el sistema
DEBE listarlos en el informe de esa pasada, agrupados por su relación de
candidatura, con datos suficientes para localizarlos (`id`, cuenta, `type`,
`bookingDate`, `amount`, `description`).

## R7
El informe de cada pasada (`POST /api/import` y `POST /api/import/local`) DEBE
incluir cuántas parejas ha creado esa pasada.

## R8
CUANDO la detección se ejecuta una segunda vez sin movimientos nuevos (incluida
la reimportación de los mismos archivos), el sistema DEBE dejar exactamente las
mismas parejas: un movimiento con `transferId != null` no se reevalúa, no se
reempareja y no se desempareja.

## R9
CUANDO una importación posterior trae la pierna espejo de un movimiento que
quedó sin emparejar, el sistema DEBE emparejar los dos en esa misma pasada.

## R10
El sistema NO DEBE modificar ningún campo de ningún movimiento distinto de
`transferId`, ni el ancla de ninguna cuenta, ni ningún saldo, ni crear o borrar
movimientos (verificable comparando la fila entera antes y después).

## R11
CUANDO el sistema escribe una pareja, DEBE escribir las dos piernas en una sola
transacción: SI solo una de las dos puede escribirse ENTONCES no se escribe
ninguna.

## R12
CUANDO las dos piernas de un traspaso comparten `transferId`, los `totals` de
`GET /api/movements` DEBEN dejarlas fuera de `income` y `expense` (la exclusión
la implementó la F36; aquí se prueba de punta a punta: detección → totales).

## R13
El sistema DEBE actualizar `docs/api-contract.md`: la forma nueva del informe de
`POST /api/import` y `POST /api/import/local`, y la nota de `Movement.transferId`
(deja de viajar siempre `null`).

## R14
El sistema DEBE actualizar `docs/data-model.md`: `transferId` sale de la tabla
de columnas sin escritor y §Traspasos deja de decir que quién lo rellena es una
feature posterior.

## R15
SI la detección falla ENTONCES el sistema DEBE reportar el fallo dentro del
informe de la pasada (código estable + mensaje sanitizado) sin cambiar el
`status` de los archivos ya importados ni el código HTTP de la respuesta.

---

## Procedencia

- R1 — (delegado) El humano cedió «cuándo corre exactamente». Decido: al final
  de cada pasada de importación (las dos vías), sin endpoint propio. Alternativa
  descartada: `POST` dedicado bajo demanda (un endpoint más en el contrato para
  algo que ya dispara cada importación; la primera pasada sobre lo ya guardado
  se consigue con `POST /api/import/local`). ← 🔴 en decisions.md.
- R2 — (humano) Sale de «encuentra las dos piernas del mismo traspaso (mismo
  importe, direcciones opuestas, dos cuentas mías, fechas pegadas) y las deja
  enlazadas». La ventana de 3 días naturales es la parte (delegado) de
  «la ventana de fechas del emparejamiento». ← 🔴 en decisions.md.
- R3 — (añadido) El humano no dijo cómo se distinguen dos traspasos entre sí.
  Sin esto, dos traspasos con el mismo `transferId` serían un solo grupo de
  cuatro piernas. ← REVISAR EN APROBACIÓN (es técnica, pero es alcance no dicho).
- R4 — (humano) Sale de «como no tienen pierna espejo en mis cuentas, no se
  emparejan nunca». Que tampoco aparezcan en el informe es (añadido): listar
  cada Bizum como «sin pareja» enterraría los ambiguos de verdad.
- R5 — (delegado) El humano cedió «qué hacer cuando hay más de un candidato con
  el mismo importe» y fijó el criterio: «antes un traspaso sin marcar que dos
  movimientos ajenos enlazados». Decido unicidad mutua estricta. Alternativa
  descartada: elegir el candidato de fecha más cercana (empareja en silencio
  justo el caso dudoso). ← 🔴 en decisions.md.
- R6 — (humano) Sale de «un emparejamiento dudoso… queda visible en el informe
  de la pasada» (acceptance 4).
- R7 — (añadido) Contador de parejas creadas. Sin él, el informe diría qué quedó
  dudoso pero no qué se hizo; es el gemelo de `balanceMismatchCount`.
- R8 — (humano) Sale de «reimportar los mismos archivos no duplica marcas ni
  cambia parejas ya hechas» y del acceptance de idempotencia.
- R9 — (humano) Sale de «si la segunda pierna llega semanas después… el
  emparejamiento la encuentra en la siguiente pasada».
- R10 — (humano) Sale de «ningún dato del movimiento cambia» y de «no quiero que
  se toque el ancla, ningún saldo ni el dedup».
- R11 — (añadido) El humano no habló de fallos a mitad de escritura. Una pierna
  marcada sola sería un traspaso a medias: excluiría un gasto real de los
  totales sin excluir su espejo. ← REVISAR EN APROBACIÓN.
- R12 — (humano) Sale de «los totales de la feature 36… dejan fuera las dos
  piernas», y del aviso técnico «las dos cosas se prueban juntas».
- R13 — (humano) Acceptance: «docs/api-contract.md … actualizados».
- R14 — (humano) Acceptance: «docs/data-model.md … (el segundo deja de decir que
  nada escribe transferId)».
- R15 — (añadido) El humano no dijo qué pasa si la detección revienta después de
  guardar los movimientos. Decido: los movimientos ya guardados no se
  desguardan y el fallo viaja en el informe, como todo fallo parcial de la
  importación. ← REVISAR EN APROBACIÓN.
