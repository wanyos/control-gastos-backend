# Requirements — F61 `rule-suggestions`

> Fuente de verdad: el `intent` de la feature 61 en `feature_list.json`.
> Las rutas `GET /api/category-rules/suggestions` y `GET /api/category-rules/preview`
> son **propuesta pendiente de aprobación** (`decisions.md` 🔴 4). Si el humano las
> cambia, se sustituyen aquí, en `design.md` y en `tasks.md` sin cambiar nada más.
>
> Vocabulario de este archivo (descripciones literales, no términos nuevos):
> - **pasada de categorización**: `applyCategoryRules` de
>   `src/modules/category-rules/category-rules.service.ts` (features 43 y 60).
> - **alcance ampliado**: `categorizationEligibleWhere('pendingAndClosing')`: los
>   movimientos `expense`/`income` pendientes sin categoría **más** los de
>   `categorySource` `closing`. Es lo que la pasada mira al crear una regla (F60).
> - **reparto**: la decisión, para cada movimiento leído, de si se le escribe una
>   categoría (reglas de una sola categoría), si es un choque (dos o más
>   categorías) o si no casa ninguna. Hoy vive dentro del bucle de
>   `applyCategoryRules`; esta feature lo saca a una función pura (`design.md` §2).
> - **texto propuesto**: el `matchText` que se saca de la descripción de un
>   movimiento con el procedimiento de R2.
> - **lista de reglas propuestas**: la respuesta de `GET /api/category-rules/suggestions`.
> - **consulta previa**: `GET /api/category-rules/preview`.

## R1
CUANDO un cliente hace `GET /api/category-rules/suggestions`, el sistema DEBE responder `200` con un array de propuestas, cada una con `matchText` (el texto propuesto), `kind` (`expense` o `income`), `movementCount`, `movements` (los movimientos que recogería: `movementId`, `description`, `bookingDate`, `amount`, por id ascendente) y `manualMatches`, ordenado por `movementCount` descendente y, a igualdad, por `matchText` ascendente.

## R2
El sistema DEBE obtener el texto propuesto de una descripción así, en este orden: (1) `normalizeForMatch`; (2) si contiene la palabra `concepto` precedida de espacio o coma y no al principio, cortar desde ahí; (3) si empieza por entre 1 y 24 caracteres formados solo por letras, puntos y espacios seguidos de `/`, quitar esa parte, la barra y los espacios que la siguen; (4) quedarse con el primer tramo de palabras consecutivas (separadas por espacios) que no contienen ningún dígito, tal como está escrito; (5) quitar del principio y del final los caracteres que no son letra ni dígito.

## R3
El sistema DEBE producir siempre un texto propuesto que sea un trozo seguido de la descripción normalizada de la que sale, de modo que una regla con ese texto recoja ese movimiento.

## R4
SI el texto propuesto de una descripción queda vacío o con menos de 5 caracteres ENTONCES el sistema NO DEBE proponer ese texto.

## R5
El sistema DEBE sacar los textos propuestos solo de movimientos del alcance ampliado con los que no casa ninguna regla existente de su mismo `kind`.

## R6
El sistema DEBE calcular `movements` de cada propuesta como los movimientos del alcance ampliado a los que el reparto, con las reglas existentes más una regla con ese texto y una categoría de ese `kind` distinta de todas, les escribiría la categoría de esa regla; usando la misma función de reparto que la pasada de categorización.

## R7
SI una propuesta recoge menos de 3 movimientos ENTONCES el sistema NO DEBE incluirla en la respuesta.

## R8
SI todos los movimientos que recoge una propuesta los recoge también otra propuesta del mismo `kind` con más movimientos (o con los mismos y un texto más corto; a igualdad, el primero en orden alfabético) ENTONCES el sistema NO DEBE incluir la primera.

## R9
El sistema DEBE informar en `manualMatches` de cada propuesta cuántos movimientos con `categorySource` `manual` y del mismo `kind` contienen el texto propuesto, sin contarlos en `movementCount` ni en `movements`.

## R10
CUANDO un cliente hace `GET /api/category-rules/preview?matchText=…&categoryId=…`, el sistema DEBE responder `200` con `matchText` (normalizado), `categoryId` y `categorization`: el mismo resultado (`CategorizationResult`) que devolvería `POST /api/category-rules` con ese cuerpo en ese momento, con `ruleId: null` en lugar del id de la regla que aún no existe.

## R11
SI la consulta previa recibe un `matchText` de menos de 3 caracteres normalizado, un `categoryId` que no existe, o un `matchText` que ya tiene una regla ENTONCES el sistema DEBE responder `400`, `404` o `409` respectivamente, con el mismo mensaje que daría `POST /api/category-rules`.

## R12
El sistema NO DEBE escribir nada en la base al responder `GET /api/category-rules/suggestions` ni `GET /api/category-rules/preview`: ni movimientos (tampoco `updatedAt`) ni reglas.

## R13
El sistema DEBE seguir comportándose igual en la pasada de categorización (importación, `POST /apply`, `POST` y `PATCH /api/category-rules`) tras sacar el reparto a una función: los tests existentes de `category-rules` e `import` pasan sin cambiar lo que comprueban.

## R14
El sistema DEBE describir en `docs/api-contract.md` las dos consultas: parámetros, forma de la respuesta con un ejemplo inventado, cómo se saca el texto propuesto, el mínimo de 3 movimientos y 5 caracteres, que no escriben nada y que el número de la consulta previa es el que movería la regla al crearla.

## Procedencia

- R1 — (humano) «Una consulta de solo lectura que me enseñe los conceptos que más se repiten… ordenados por cuántos movimientos resolvería una regla para cada uno, con el texto de regla que se propone». (delegado) la forma: que cada propuesta traiga sus movimientos y su `kind` lo decido yo («si las dos consultas son una o dos, y su forma»); el desempate alfabético es para que el orden sea estable.
- R2 — (delegado) «Cómo se saca el texto de regla propuesto de un concepto (números, referencias, las palabras con que el banco empieza un recibo o una transferencia)». Decido: cortar la cola desde «concepto» (el texto libre que escribe quien hace una transferencia o un bizum), quitar la palabra del banco antes de la barra (`RECIBO /`, `TRANSF /`, `ANUL. /`…) y cortar en el primer número. Medido en su base: ver `design.md` §6. ← REVISAR EN APROBACIÓN (hoja 🔴 1).
- R3 — (añadido) Garantía técnica sin la cual una propuesta podría no recoger ni siquiera su propio movimiento (por ejemplo, si se quitaran números de en medio). No cambia nada que el humano vea.
- R4 — (delegado) Parte de «cuántas veces… y si se limita la lista». El mínimo de 5 caracteres lo añado porque, medido, un texto de 3 letras salido de una descripción corta recogía movimientos de diez conceptos distintos (la regla casa por «contiene», también dentro de otras palabras). ← REVISAR (hoja 🔴 2).
- R5 — (humano) «Un concepto que ya recoge una regla existente no se propone».
- R6 — (humano) «Que el número que me enseña no coincida con lo que de verdad recoge la regla al crearla» + instrucción del leader: reutilizar la misma función de casado. (delegado) Un movimiento que la regla nueva recogería pero que ya casa con otra regla se queda fuera: al crear la regla sería un choque o iría a la otra, nunca a la nueva.
- R7 — (delegado) «Cuántas veces tiene que repetirse un concepto para proponerlo, y si se limita la lista». Decido: 3 movimientos, sin límite de longitud de la lista. ← REVISAR (hoja 🔴 2).
- R8 — (añadido) No lo pidió: evita que salgan dos propuestas donde una ya incluye a la otra (p. ej. el nombre de un comercio y «recibo + nombre del comercio»). ← REVISAR (hoja 🔴 5).
- R9 — (delegado) Interpreta «que se propongan reglas que recogerían movimientos que puse yo a mano». Desde la F60 ninguna regla toca lo puesto a mano, así que ninguna propuesta lo recoge; decido proponerla igualmente y decir cuántos hay. ← REVISAR (hoja 🔴 3).
- R10 — (humano) «Una forma de saber, antes de crear una regla con un texto cualquiera, cuántos movimientos y cuáles recogería». (delegado) que sea una segunda consulta que recibe también la categoría (sin ella no se puede saber si habrá choque) y que responda con la misma forma que la creación. ← hoja 🔴 4.
- R11 — (delegado) Mismas validaciones que crear la regla: si la creación fallaría, la consulta previa no puede dar un número.
- R12 — (humano) «Ninguna de las dos consultas escribe nada» y «que la aplicación cree reglas o cambie categorías sola».
- R13 — (añadido) Consecuencia de reutilizar la función: sacarla del bucle no puede cambiar lo que ya funciona (F43, F56, F60).
- R14 — (humano) «docs/api-contract.md describe las dos consultas».
