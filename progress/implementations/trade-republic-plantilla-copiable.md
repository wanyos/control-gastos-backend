# trade-republic-plantilla-copiable — implementación

Añadido único de test sobre la feature 20 (`trade-republic-product-file`), ya
cerrada. **No se ha tocado el parser ni `feature_list.json`.**

## Archivos modificados

- `src/modules/trade-republic/trade-republic.docs.test.ts` — un `describe` nuevo
  al final del archivo y un import ampliado (`mandatoryKeys` del fixture).

## Qué comprueba lo añadido

`describe('docs/plantillas/trade-republic-cuenta-remunerada.json — the copyable file (R1)')`,
tres tests:

1. **byte a byte === el primer bloque ```json del documento.** Sin `.trim()`: la
   captura del bloque termina en la valla de cierre, así que las dos cadenas
   acaban en `}\n` y un salto de línea final divergente rompe el test — que es
   justo la deriva que se quiere cazar. Queda anotado en un comentario.
2. **byte a byte === `tradeRepublicTemplate`** del fixture. Cerrada la identidad
   a tres bandas: archivo de disco = documento = fixture.
3. **ningún valor copiable:** todos los valores de la plantilla de disco son
   marcadores `<…>` (misma regla que ya se aplicaba a los bloques del markdown),
   y las claves son exactamente `mandatoryKeys` + `closedAt`. Un valor real
   filtrado aquí se copiaría sin leerlo.

El comentario de cabecera del bloque explica por qué existe: una tercera copia
de la plantilla es una tercera cosa que puede desviarse, y el documento ya le
promete al humano que no puede.

## Último `./init.sh`

Verde. `Test Files 43 passed (43)` — `Tests 724 passed (724)` (antes 721).
Incluidos `src/no-real-data.test.ts` y `src/architecture.test.ts`.

## Observación (NO aplicada, fuera de scope)

En una de las ejecuciones de `./init.sh` falló
`src/modules/movements/movements.test.ts:318` («GET /api/movements orders the
same day by daySequence descending», `response.json(...).filter is not a
function`). Es un test de base de datos, ajeno a este cambio, y pasó en la
ejecución inmediatamente anterior (`pnpm test`) y en la siguiente. Parece un
flake pre-existente del entorno de DB; se deja anotado, no se ha tocado.
