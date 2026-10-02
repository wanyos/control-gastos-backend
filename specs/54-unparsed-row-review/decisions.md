# Decisiones — F54 `unparsed-row-review`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** te deja dar por revisada, con una nota, una fila que el parser no
pudo leer, y quitarle esa marca. Lleva **una ruta nueva** y **una migración que
solo añade tres columnas**. **No toca** la importación, ni cómo se revisa un
descuadre de saldo, ni crea movimientos. Son 15 requirements.

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **La ruta es `PATCH /api/import/warnings/unparsed-rows/:id`**, con el mismo cuerpo que la de los descuadres: `status` (`"reviewed"` o `"pending"`) y `note`. | Otro nombre de ruta: es cambiar una línea, pero dilo ahora, porque el frontend construirá contra él. |
| 2 | **La nota es opcional** (máximo 500 caracteres), igual que en los descuadres: puedes dar la fila por revisada sin escribir nada. | Obligatoria al dar por revisada: un rechazo más, y dejaría de ser igual que los descuadres. |
| 3 | **Una fila revisada sigue saliendo al consultar**, marcada como revisada, con su nota y la fecha en que la revisaste. No hay filtro: salen todas. Es **distinto de los descuadres**, que al revisarlos desaparecen de la consulta. | Que desaparezca como los descuadres y se pida aparte con un parámetro: más código, y tu frase pedía verla con su nota al consultar. |
| 4 | **El contador de filas de la consulta cuenta solo las que quedan sin revisar**, no todas las de la lista. | Que cuente todas: el número ya no serviría para saber cuánto te queda por mirar. |
| 5 | **`docs/data-model.md` no nombra hoy ninguna de las dos tablas de la feature 48** (lo he buscado). Esta feature escribe ahí las dos: la de las filas, que es la que cambia, y la de los descuadres. | Solo la de las filas: el documento seguiría sin la de los descuadres hasta otra feature. |

## ✅ Ya las cerraste tú (4)

- **No se puede crear un movimiento a mano a partir de la fila.** Si algún día es un problema, será otra feature.
- **La fila no se borra de la base de datos al revisarla.**
- **La importación no cambia**: mismos contadores y el archivo se sigue moviendo a `procesados/`.
- **Revisar un descuadre de saldo no cambia.**

## 🧪 Cómo se comprobará que está hecho

> Los `checks` de `feature_list.json`: se ejecutan al cerrar y, si uno falla, la
> feature no se cierra. Si falta un caso, es aquí donde se pide.

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Puedo dar por revisada una fila que el parser no pudo leer, escribiendo una nota. | El test que llama a la ruta nueva con una nota y espera la fila revisada, con la nota, y que sigue en la tabla. |
| Al consultar…, una fila revisada sale como revisada, con su nota y cuándo la revisé. | El test que revisa una de dos filas, consulta y espera las dos, cada una con su estado; y el del contador, que espera 1. |
| Puedo quitarle la marca de revisada a una fila si me equivoqué. | El test que la devuelve a no revisada y espera la nota intacta y la fecha vacía. |
| Si pido revisar una fila que no existe, me responde con un error claro. | El test que pide un id inexistente y espera `404 NOT_FOUND`. |
| Volver a importar el mismo archivo no le quita a la fila la marca de revisada ni la nota. | El test que guarda la fila, la revisa, la vuelve a guardar como hace la importación y espera marca, nota y fecha intactas. |
| `docs/api-contract.md` describe lo nuevo. | El test que lee el documento y busca la ruta nueva y sus campos. |
| (añadido) La importación y los descuadres siguen igual. | La suite entera. |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Reimportar ya no reescribía la fila entera**: solo actualiza el motivo y una fecha. Las tres columnas nuevas quedan intactas sin tocar ese código; se añade el test que lo demuestra.
2. **La migración solo añade** estado, nota y fecha de revisión a la tabla de filas. Las filas que existan quedan como no revisadas.
3. **Quitar la marca conserva la nota** y vacía la fecha de revisión; mandar solo la nota no cambia el estado. Igual que en los descuadres.
4. **Ningún código de error nuevo**: `404` si la fila no existe, `400` si el cuerpo está vacío o trae algo no admitido.
5. **La nota entra en la lista de textos que el guardián `src/no-real-data.test.ts` compara** contra los archivos del repositorio, como la nota de los descuadres.

## 📌 Consecuencias que te tocan a ti (no son código)

- **La migración se aplica a tu base** con `pnpm run prisma:migrate` (o al desplegar). Hoy esa tabla tiene 0 filas, medido hoy.
- **Sin pantalla**: hasta que el frontend lo use, se prueba llamando a la ruta a mano.
- **El frontend va en otra sesión, después.** Hoy no llama a `GET /api/import/warnings` (lo he buscado en su código), así que el cambio del contador y de la lista no rompe nada suyo.
- **El cabo suelto 23 se cierra** diciendo que crear el movimiento a mano lo descartaste tú el 2026-10-02.

## ⚠️ Incoherencias conocidas que se heredan

- **Las filas revisadas no salen nunca de la consulta**, que sigue sin paginar. Con lo poco que esperas que pase, se queda así.
- **La función que sirve la consulta sigue llamándose `listPendingImportWarnings`** aunque ya devuelve también filas revisadas: no se renombra para no tocar código de la feature 48.
