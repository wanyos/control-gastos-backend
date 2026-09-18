# Requirements — F48 `import-warnings-persistence`

> EARS estricto (ver `docs/specs.md`). Fuente de verdad: el bloque `intent` de la
> feature 48 en `feature_list.json`, dictado por el humano el 2026-09-17.
>
> Vocabulario: «aviso» agrupa las dos cosas que se guardan (fila que el parser no
> pudo leer, descuadre de saldo). En código se propone `warning`; **propuesto, no
> aprobado** (ver `decisions.md` 🔴 #6 y `CLAUDE.md` §Vocabulario).

## R1

CUANDO una importación —por `POST /api/import` o por `POST /api/import/local`—
termina un archivo de extracto con `status: 'imported'` y ese archivo dejó filas
que el parser no pudo leer, el sistema DEBE guardar una fila por cada una de
ellas con el banco, el año, el nombre del archivo, el número de fila y el motivo.

## R2

CUANDO una importación termina un archivo de extracto con `status: 'imported'` y
las comprobaciones de saldo encontraron descuadres en él, el sistema DEBE guardar
uno por descuadre con la cuenta, la fecha comparada, el número calculado, el
número del archivo, cuál de las dos comprobaciones lo produjo y el banco, el año
y el nombre del archivo del que salió.

## R3

CUANDO un archivo trae filas que el parser no puede leer pero al menos un
movimiento legible, el sistema DEBE importarlo y moverlo a `procesados/`
exactamente igual que antes de esta feature, con los mismos contadores en la
respuesta de la importación.

## R4

SI un archivo de extracto termina con `status: 'failed'` ENTONCES el sistema NO
DEBE guardar ningún aviso de ese archivo.

## R5

SI el guardado de los avisos de un archivo falla ENTONCES el sistema DEBE
reportar ese archivo como `failed` con su error saneado, sin movimiento a
`procesados/`.

## R6

CUANDO se vuelve a importar el mismo archivo y vuelve a producir un aviso cuya
identidad ya está guardada, el sistema DEBE actualizar el aviso existente sin
crear uno nuevo. La identidad es `(banco, año, nombre de archivo, número de
fila)` para una fila ilegible, y `(banco, año, nombre de archivo, cuenta, fecha,
comprobación, número calculado, número del archivo)` para un descuadre.

## R7

CUANDO se vuelve a importar un archivo que produce un descuadre ya marcado como
revisado, el sistema DEBE dejarlo marcado como revisado.

## R8

CUANDO una importación no deja ninguna fila ilegible ni ningún descuadre, el
sistema NO DEBE guardar ningún aviso.

## R9

CUANDO un cliente hace `GET /api/import/warnings`, el sistema DEBE responder
`200` con `{ unparsedRows, balanceMismatches, counts }`, ordenado del aviso más
reciente al más antiguo.

## R10

MIENTRAS un descuadre está marcado como revisado, el sistema NO DEBE incluirlo en
la respuesta de `GET /api/import/warnings` ni en sus `counts`.

## R11

CUANDO un cliente hace `PATCH /api/import/warnings/balance-mismatches/:id` con
`{"status": "reviewed"}` y opcionalmente `note`, el sistema DEBE marcar ese
descuadre como revisado, guardar la nota y responder `200` con el descuadre
serializado.

## R12

CUANDO ese mismo `PATCH` recibe `{"status": "pending"}`, el sistema DEBE devolver
el descuadre a pendiente conservando su nota.

## R13

SI el `:id` de ese `PATCH` no corresponde a ningún descuadre guardado ENTONCES el
sistema DEBE responder `404` con `code: "NOT_FOUND"`.

## R14

SI el cuerpo de ese `PATCH` está vacío, trae propiedades no admitidas o valores
fuera de la enumeración ENTONCES el sistema DEBE responder `400` con
`code: "VALIDATION_ERROR"` sin modificar nada.

## R15

El sistema DEBE describir las dos rutas nuevas y la forma de sus respuestas en
`docs/api-contract.md`, en esta misma feature.

---

## Procedencia

- **R1** — (humano) «esas filas quedan guardadas con el archivo del que salen y
  el motivo».
- **R2** — (humano) «qué avisos siguen sin resolver: las filas de un archivo que
  no se pudieron leer y los descuadres de saldo».
- **R3** — (humano) `que_no_quiero`: «No quiero que un archivo con filas
  ilegibles deje de entrar ni deje de moverse a `procesados/`».
- **R4** — (añadido) El humano no dijo qué pasa con un archivo que falla entero.
  Decido no guardar sus avisos: ese archivo **no** se mueve a `procesados/` y se
  volverá a intentar, así que guardarlos llenaría la lista de pendientes de
  avisos que se repetirán solos en la siguiente pasada. ← REVISAR EN APROBACIÓN.
- **R5** — (añadido) El humano no dijo qué pasa si la base de datos falla al
  guardar el aviso. Decido fallar ruidosamente (el archivo sale `failed` y no se
  mueve) en vez de tragarme el error: perder un aviso en silencio es justo lo que
  esta feature viene a impedir. Coste asumido: los movimientos ya están guardados
  y el archivo se reintentará; el índice de deduplicación lo hace inofensivo.
  ← REVISAR EN APROBACIÓN.
- **R6** — (delegado) Resuelve «qué hace que un aviso sea el mismo al reimportar
  el mismo archivo». Decido una clave natural con `@@unique` + `upsert`: el
  archivo que lo produjo más el contenido del aviso. Alternativa descartada: una
  huella calculada en una sola columna (opaca al depurar y al consultar).
- **R7** — (delegado) Resuelve «si un descuadre que una importación posterior
  cuadra sola desaparece por su cuenta o se queda». Decido que se queda hasta que
  el humano lo marque, y que una reimportación **no** resucita lo ya revisado.
  Alternativa descartada: borrar en cada importación lo que la comprobación ya no
  encuentra (hace desaparecer un aviso sin que nadie lo haya visto).
- **R8** — (humano) «Una importación sin nada raro no deja ningún aviso
  pendiente».
- **R9** — (delegado) Resuelve «cómo se consultan (rutas y forma de la
  respuesta)». Decido una ruta de lectura bajo el prefijo que ya existe y dos
  listas separadas con la misma forma que ya viaja en el informe de la
  importación. Alternativa descartada: una sola lista mezclada con un campo
  `kind` y columnas nulas para la mitad de los casos.
- **R10** — (humano) «deja de aparecer entre los pendientes».
- **R11** — (humano) «De un descuadre puedo decir que lo he revisado, con una
  nota mía si quiero».
- **R12** — (añadido) El humano no pidió deshacer el marcado. Lo añado por
  simetría con `PATCH /api/movements/:id`, cuyo `status` ya funciona en los dos
  sentidos, para que un clic equivocado no sea irreversible. ← REVISAR EN
  APROBACIÓN.
- **R13** — (añadido) Caso de error que el humano no contempló; es la convención
  del contrato (`docs/api-contract.md` §Errores).
- **R14** — (añadido) Ídem: body vacío o con propiedades de más es `400`, nunca
  se ignora en silencio (misma regla que `PATCH /api/movements/:id`).
- **R15** — (humano) «`docs/api-contract.md` describe lo nuevo, para que el
  frontend construya contra él».

### Qué queda fuera, dicho por él

Traspasos dudosos, choques de reglas de categorización, arreglar o borrar una
fila ilegible (cabo suelto 23 del roadmap), histórico completo de cada
importación, y cualquier cambio sobre movimientos ya guardados.
