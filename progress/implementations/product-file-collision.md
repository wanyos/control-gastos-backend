# product-file-collision — implementación

Feature 53, SDD, un solo lote (Lote A). Implementada el 2026-10-02. Sin commit y sin
marcar `done`: espera al reviewer.

## Archivos modificados / creados

Código:

- `src/errors/app-error.ts` — clase `DuplicateProductFileError`
  (`DUPLICATE_PRODUCT_FILE`, 422).
- `src/modules/import/import.types.ts` — tipos `StoredProductFileRef` y
  `ProductFilesStoredInRun`.
- `src/modules/import/import.service.ts` — `productFileKey`; los campos opcionales
  `year` y `storedInRun` de `ImportProductFileDeps`; en `importPending`, un `Map` por
  ejecución que se pasa a cada `importProductFile` con el nombre de la carpeta de
  año; en `importProductFile`, la comprobación después de `adapter.parse` y antes de
  `persistProductSnapshot`, y el apunte del archivo después de guardar.
  `importDriveFile`, `totals` e `importStatement` no cambian.

Tests:

- `src/modules/import/import.service.test.ts` — bloque nuevo
  `importPending: two product files of one run declaring the same product and date (feature 53)`,
  10 tests.
- `src/modules/myinvestor/myinvestor.import.test.ts` — bloque nuevo con 2 tests, con el
  registro real de `src/app.ts`.
- `src/modules/import/import.product-files.docs.test.ts` — **nuevo**, 3 tests que leen
  los documentos.

Documentos: `docs/api-contract.md`, `docs/myinvestor-product-files.md`,
`docs/trade-republic-product-files.md`, `docs/data-model.md`, `docs/architecture.md`
(ADR-033 y la línea de revisión encima del ADR-026), `docs/roadmap.md`.

Otros: `specs/53-product-file-collision/tasks.md` (las 11 tasks en `[x]`),
`progress/current.md` (línea de avance).

**No tocados:** `src/modules/investments/investments.service.ts`, ningún parser,
`src/architecture.test.ts` (su lista de árbol comprueba que existen los archivos que
nombra, no que sean los únicos; la suite pasa sin añadir el test nuevo),
`feature_list.json` (ni `checks` ni estado). No se ha creado ninguna ruta.

## Decisiones tomadas

Ninguna nueva de diseño: todo sale de `design.md`. Elecciones menores dentro de lo que
el design deja abierto:

- Los dos tipos van en `import.types.ts` (el design lo permitía en cualquiera de los
  dos archivos) y `productFileKey` en `import.service.ts`.
- Si `importProductFile` se llama con `storedInRun` pero sin `year`, el archivo se
  apunta con la carpeta de año vacía. `importPending`, que es quien la llama hoy,
  siempre pasa las dos cosas.
- En `import.service.test.ts` el bloque nuevo arma su propio árbol de Drive (varias
  carpetas de banco y de año) encima de `buildDrive`, porque `treeWith` solo sabe hacer
  un banco y un año. `buildDrive`, `treeWith` y `fakeProductAdapter` no se han tocado.
- T5: **ningún test existente se ha modificado.** `git diff --numstat -- src` da 0
  líneas borradas en los cinco archivos de `src/` cambiados (15/0, 347/0, 31/0, 8/0,
  47/0).

Una observación sobre un comportamiento que ya existía y no se ha cambiado: cuando el
valor de un archivo de producto se guarda y lo que falla es moverlo a `procesados/`,
su informe sale `status: "failed"` pero conserva `product` y `snapshot` (los copia
`importDriveFile` antes del movimiento), así que suma a `failedCount` **y** a
`importedProductCount`. No lo he tocado: `importDriveFile` y `totals` quedan fuera de
esta feature por el design. Va en «Sugerencias».

## Trazabilidad

Los tests de `import.service.test.ts` son los del bloque nuevo; los de
`myinvestor.import.test.ts`, los del bloque `two product files of one run declaring the
same product and date (feature 53)`.

- R1 → `rejects the second product file of a run that declares the same bank, name and date, naming the first`;
  `holds a stored file against the next one even when its move to procesados failed`
- R2 → `rejects the second product file of a run that declares the same bank, name and date, naming the first`;
  `rejects the second file across two year folders of the same bank, and not across two banks`
- R3 → `keeps the value the first file stored exactly as it stored it`;
  `holds a stored file against the next one even when its move to procesados failed`;
  `rejects the second file of the same fund and date in one run`;
  `rejects the second file of the same deposit and date in one run`
- R4 → `leaves the rejected product file pending in Drive and moves only the first`
- R5 → `counts only the stored file in importedProductCount and the rejected one in failedCount`
- R6 → `goes on with the files that come after the rejected one`
- R7 → `imports two files of the same product with different dates in one run`
- R8 → `still replaces the value when a corrected file of the same product and date arrives in a later run`
- R9 → `rejects the second file of the same fund and date in one run` (`Valuation`);
  `rejects the second file of the same deposit and date in one run` (`deposit`);
  los tests de `import.service.test.ts` (`savings_account`)
- R10 → `does not hold a file that failed against the next one with the same product and date`
- R11 → `rejects the second file across two year folders of the same bank, and not across two banks`
- R12 → la suite entera: los tests de extractos de `import.service.test.ts`,
  `import.routes.test.ts` y los módulos de banco pasan sin haber cambiado una línea
- R13 → `api-contract: describes the rejection of the second product file of one import`
- R14 → `product-file documents: say the second file is rejected, not that nobody warns`
- R15 → `roadmap: closes loose end 21 with feature 53 and leaves 24 open`

**Comprobación de que los tests comprueban algo.** Con la comparación desactivada a
propósito (en `importPending`, `storedInRun: undefined` en vez del `Map`) y lanzando
`pnpm exec vitest run src/modules/import/import.service.test.ts src/modules/myinvestor/myinvestor.import.test.ts -t "feature 53"`:
`Tests  9 failed | 3 passed | 78 skipped (90)`. Los tres que siguen pasando son los
que describen lo que **no** cambia (R7, R8 y R10). Después se restauró el archivo y
`git diff --stat` volvió a dar las mismas 31 líneas añadidas.

## Documentos actualizados

Búsquedas lanzadas, fuera de `progress/` y `specs/`:

- `git grep -n -i "nadie te avisa\|avisa del choque\|pisarse\|sin que nada avise"` →
  antes del cambio, los párrafos de `docs/myinvestor-product-files.md` y
  `docs/trade-republic-product-files.md` (corregidos). Después del cambio quedan: la
  fila 21 de `docs/roadmap.md`, que es el texto original del cabo, ahora tachado; y
  dos líneas de `feature_list.json` de otra feature, que hablan de valores de fechas
  **distintas** y siguen siendo verdad.
- `git grep -n "EMPTY_STATEMENT\|ALL_ROWS_UNPARSED"` fuera de `src/`, para ver dónde
  se listan los códigos por archivo → solo la tabla de `docs/api-contract.md` que
  recibe la fila nueva (la otra tabla donde aparecen es de extractos de movimientos).
- `git grep -n "DUPLICATE_PRODUCT_FILE"` → solo los archivos de este lote.

Líneas corregidas:

- `docs/api-contract.md`, sección `POST /api/import`: párrafo nuevo en «Archivos de
  producto» (qué se compara, cuál se rechaza, que cruza carpetas de año, que solo
  compara archivos de una misma llamada y qué pasa si el rechazado se vuelve a
  importar sin corregir); «Idempotencia» precisa que sustituir es lo que pasa en
  **otra** llamada; nota de `importedProductCount`; fila `DUPLICATE_PRODUCT_FILE` en
  «Códigos que aparecen por archivo (dentro del 200)».
- `docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md`: el
  párrafo de los dos archivos con el mismo `name` y la misma `date`, y una fila en
  «Qué pasa cuando un archivo está mal». `trade-republic.docs.test.ts` sigue en verde.
- `docs/data-model.md`: nota bajo la tabla que compara las dos resoluciones de
  conflicto. Lección 2: esta feature **no añade ni empieza a escribir ninguna
  columna** (`git status` no muestra cambios en `prisma/`), así que la tabla
  «Columnas reservadas», el bloque Prisma, el diagrama ER y la tabla de claves
  naturales no cambian.
- `docs/architecture.md`: ADR-033 nuevo y la línea «Revisado el 2026-10-02 por la
  feature 53…» encima del ADR-026. Ningún ADR reescrito.
  `src/retired-routes.docs.test.ts` sigue en verde.
- `docs/roadmap.md`: fila 21 tachada y cerrada por la F53; fila E5 con la F53. La
  fila 24 no se ha tocado.

Vocabulario: en lo que he escrito (documentos, mensaje de error, este informe) no uso
«foto», «pisar» ni «colisión»; se describe literalmente. Esas palabras siguen en texto
que ya existía y que no he reescrito (por ejemplo la frase de «Idempotencia» del
contrato y el texto original del cabo 21).

## Prueba real

**No se ha hecho.** La feature no cambia cómo se lee un archivo (ningún parser
cambia): cambia lo que hace `POST /api/import` cuando hay dos archivos de producto
con el mismo banco, nombre y fecha en la misma llamada. Probarlo con datos reales
exige lanzar `POST /api/import` contra el Drive y la base de datos del humano con dos
archivos suyos repetidos, y eso escribe en su base y mueve archivos en su Drive: no
lo puede hacer un agente. `pnpm run parse-file` no sirve aquí porque lee un solo
archivo y no pasa por `importPending`. Lo que haría falta: que el humano deje dos
`.json` de producto con el mismo `name` y `date` en una carpeta de banco y lance la
importación; debe salir el primero `imported` y el segundo `failed` con
`DUPLICATE_PRODUCT_FILE`, sin moverse.

## Último ./init.sh

Primera pasada completa: **roja**, exit 1. `src/no-real-data.test.ts` señaló
`src/modules/myinvestor/myinvestor.import.test.ts:321`: un importe inventado de esa
línea coincidía con uno de la base de datos. Se inventaron otros tres importes en esa
línea (siguen cuadrando entre sí) y se relanzó.

Segunda pasada, `./init.sh`, exit 0:

```
[OK]    feature_list.json válido (53 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  70 passed (70)
      Tests  1286 passed (1286)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Recuento: de 69 archivos y 1271 tests a **70 archivos y 1286 tests** (+1 archivo,
+15 tests: 10 + 2 + 3).

Por separado, antes de `./init.sh`: `pnpm run typecheck` (`tsc --noEmit`, sin
salida de error), `pnpm run lint` (`oxlint`, sin salida de error) y
`pnpm run format:check` (`All matched files use Prettier code style!`).

## Último ./init.sh --checks 53

Exit 0:

```
$ pnpm exec vitest run src/modules/import/import.service.test.ts -t "rejects the second product file of a run that declares the same bank, name and date, naming the first" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 78 skipped (79)
$ pnpm exec vitest run src/modules/myinvestor/myinvestor.import.test.ts -t "rejects the second file of the same" | grep -E "Tests +2 passed"
[OK]        exit 0
                Tests  2 passed | 9 skipped (11)
$ pnpm exec vitest run src/modules/import/import.service.test.ts -t "leaves the rejected product file pending in Drive and moves only the first" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 78 skipped (79)
$ pnpm exec vitest run src/modules/import/import.service.test.ts -t "keeps the value the first file stored exactly as it stored it" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 78 skipped (79)
$ pnpm exec vitest run src/modules/import/import.service.test.ts -t "imports two files of the same product with different dates in one run" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 78 skipped (79)
$ pnpm exec vitest run src/modules/import/import.service.test.ts -t "still replaces the value when a corrected file of the same product and date arrives in a later run" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 78 skipped (79)
$ pnpm exec vitest run src/modules/import/import.product-files.docs.test.ts -t "api-contract: describes the rejection of the second product file of one import" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 2 skipped (3)
[OK]        exit 0            (el octavo: pnpm test)
[OK]    Checks: 8 de 8 en verde.
```

Los `checks` de `feature_list.json` no se han modificado.

## Sugerencias fuera de scope (NO aplicadas)

- Un archivo de producto cuyo valor se guarda y que Drive no consigue mover a
  `procesados/` sale `failed` con `product` presente, y suma a la vez a `failedCount`
  y a `importedProductCount`. Ya era así antes de esta feature. Si se quiere que el
  total diga otra cosa, es un cambio en `importDriveFile` o en `totals`.
- El frontend no conoce el código `DUPLICATE_PRODUCT_FILE` (lo dice `decisions.md`):
  es una sesión aparte del frontend.
