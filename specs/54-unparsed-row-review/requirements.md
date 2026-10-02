# Requirements — F54 `unparsed-row-review`

> EARS estricto. Fuente de verdad: el `intent` de la feature 54 en
> `feature_list.json`. Estado de partida, comprobado el 2026-10-02 ejecutando
> `./init.sh`: verde, 70 archivos de test y 1286 tests. La tabla
> `ImportUnparsedRow` de la base del humano tiene 0 filas (consulta de solo
> lectura de ese día). Lo que se cita de código está leído ese día.

Definiciones que usan todos los requirements, y ninguna más:

- **Fila guardada** = una fila de la tabla `ImportUnparsedRow`: una fila de un
  archivo de extracto que el parser no pudo leer, guardada por la feature 48.
- **La ruta nueva** = `PATCH /api/import/warnings/unparsed-rows/:id`, donde `:id`
  es el `id` de una fila guardada.
- **La consulta** = `GET /api/import/warnings`.
- **Fila serializada** = el objeto con exactamente estos campos, en este orden:
  `id`, `file` (`bank`, `year`, `name`), `row`, `reason`, `status`
  (`"pending"` | `"reviewed"`), `note` (string | `null`), `reviewedAt`
  (ISO 8601 UTC | `null`), `detectedAt`.

## R1
CUANDO un cliente hace `PATCH` a la ruta nueva con `status: "reviewed"` (con o
sin `note`) sobre una fila guardada, el sistema DEBE responder `200` con la fila
serializada, con `status: "reviewed"`, la `note` recibida y `reviewedAt` igual
al momento de esa petición.

## R2
CUANDO un cliente hace `PATCH` a la ruta nueva con `status: "pending"` sobre una
fila guardada ya revisada, el sistema DEBE responder `200` con la fila
serializada con `status: "pending"`, `reviewedAt: null` y la `note` que tenía.

## R3
CUANDO un cliente hace `PATCH` a la ruta nueva solo con `note` (un texto, o
`null` para borrarla), el sistema DEBE guardar esa nota sin modificar `status`
ni `reviewedAt` de la fila guardada.

## R4
SI el `:id` de la ruta nueva no corresponde a ninguna fila guardada ENTONCES el
sistema DEBE responder `404` con `code: "NOT_FOUND"`.

## R5
SI el cuerpo de la ruta nueva está vacío (`{}`), trae una propiedad distinta de
`status` y `note`, un `status` fuera de `"pending"` / `"reviewed"`, una `note`
de más de 500 caracteres, o el `:id` no es un entero ≥ 1 ENTONCES el sistema
DEBE responder `400` con `code: "VALIDATION_ERROR"` sin modificar ninguna fila
guardada.

## R6
CUANDO un cliente hace la consulta, el sistema DEBE devolver en `unparsedRows`
todas las filas guardadas, revisadas y sin revisar, cada una como fila
serializada, en el orden que ya tiene la consulta (`detectedAt` descendente; a
igualdad, `id` descendente).

## R7
CUANDO un cliente hace la consulta, el sistema DEBE devolver en
`counts.unparsedRows` el número de filas guardadas con `status: "pending"`.

## R8
CUANDO la importación vuelve a guardar una fila que ya existe (mismo `bank`,
`year`, `fileName` y `rowNumber`), el sistema NO DEBE modificar su `status`, su
`note` ni su `reviewedAt`.

## R9
CUANDO la importación guarda por primera vez una fila que el parser no pudo
leer, el sistema DEBE guardarla con `status: "pending"`, `note` nula y
`reviewedAt` nula.

## R10
CUANDO una fila guardada se da por revisada, el sistema NO DEBE borrarla de la
tabla `ImportUnparsedRow`.

## R11
El sistema NO DEBE cambiar el comportamiento de
`PATCH /api/import/warnings/balance-mismatches/:id` ni de la lista
`balanceMismatches` y el contador `counts.balanceMismatches` de la consulta.

## R12
El sistema NO DEBE cambiar el informe de `POST /api/import` (mismos campos y
mismos contadores) ni cuándo un archivo se mueve a `procesados/`.

## R13
El documento `docs/api-contract.md` DEBE describir la ruta nueva (parámetros,
cuerpo, respuesta y errores), los campos `status`, `note` y `reviewedAt` de cada
elemento de `unparsedRows` y que `counts.unparsedRows` cuenta solo las filas sin
revisar.

## R14
El documento `docs/data-model.md` DEBE describir el modelo `ImportUnparsedRow`
tal como queda en `prisma/schema.prisma`, con sus columnas `status`, `note` y
`reviewedAt`, en el bloque Prisma, en el diagrama de entidades y en la tabla de
claves naturales.

## R15
El documento `docs/roadmap.md` DEBE dejar cerrado el cabo suelto 23 por la
feature 54, diciendo que crear el movimiento a mano quedó descartado por el
humano.

---

## Procedencia

- R1 — (humano) «Puedo dar por revisada una fila que el parser no pudo leer,
  escribiendo una nota». La forma de la ruta y que la nota sea **opcional** son
  (delegado): copia exacta de la ruta de los descuadres de saldo, donde la nota
  ya es opcional.
- R2 — (humano) «Puedo quitarle la marca de revisada a una fila si me equivoqué».
  Que la nota se conserve al quitar la marca es (delegado): igual que en los
  descuadres.
- R3 — (delegado) «que se parezca lo más posible a la que ya existe para los
  descuadres»: allí se puede mandar solo la nota, y `null` la borra.
- R4 — (humano) «Si pido revisar una fila que no existe, me responde con un
  error claro».
- R5 — (delegado) Forma de la petición: los mismos rechazos que la ruta de los
  descuadres, sin ningún código de error nuevo.
- R6 — (humano) «una fila revisada sale como revisada, con su nota y cuándo la
  revisé» y «pueda distinguir las filas que ya he revisado de las que no».
  Que **no haya filtro** y salgan todas es (delegado, «si la consulta filtra y
  cómo»). Alternativa descartada: devolver solo las no revisadas y pedir las
  revisadas con un parámetro (más código, y la frase del humano pide verlas al
  consultar). ← REVISAR EN APROBACIÓN: es distinto de los descuadres, que al
  revisarse dejan de salir.
- R7 — (añadido) El humano no dijo qué cuenta el contador. Hoy es el tamaño de la
  lista; como la lista pasa a incluir las revisadas, propongo que cuente solo
  las que quedan sin revisar. ← REVISAR EN APROBACIÓN.
- R8 — (humano) «Volver a importar el mismo archivo no le quita a la fila la
  marca de revisada ni la nota».
- R9 — (añadido) Consecuencia técnica de añadir las tres columnas: valor inicial
  de una fila nueva y de las filas que ya existan al aplicar la migración.
- R10 — (humano) «No quiero que la fila se borre de la base de datos al
  revisarla».
- R11 — (humano) «No quiero que cambie cómo se revisa un descuadre de saldo».
- R12 — (humano) «No quiero que cambie nada de la importación: mismos contadores
  y el archivo se sigue moviendo a procesados/».
- R13 — (humano) «docs/api-contract.md describe lo nuevo».
- R14 — (añadido) Lo exige la lección 2 de `docs/lessons.md`. Además
  `docs/data-model.md` hoy no nombra ninguna de las dos tablas de la feature 48
  (comprobado con una búsqueda el 2026-10-02): se documentan las dos, porque el
  enumerado de estado es común. ← REVISAR EN APROBACIÓN (alternativa: solo
  `ImportUnparsedRow`).
- R15 — (humano) Decisión de la conversación del 2026-10-02, citada en
  `_procedencia` del `intent`; el cierre del cabo es la regla de `AGENTS.md` §5.
