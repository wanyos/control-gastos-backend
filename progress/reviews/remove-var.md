# remove-var — revisión

## Review (2026-10-02)

**Veredicto:** CHANGES_REQUESTED

El código, los tests y los `checks` están en verde y el traslado de tests está bien
hecho. Lo que impide aprobar son líneas que la feature ha vuelto falsas y siguen
sin corregir, un archivo que nombra la carpeta esquivando al guardián de R5, y un
deber del humano sin apuntar.

### Cambios requeridos

1. `docs/data-model.md:251` — la fila de `transferId` dice que la detección de
   traspasos «corre al final de cada pasada de importación (las dos vías)». Desde
   esta feature solo hay una (`POST /api/import`). El mismo documento se corrigió en
   la línea 446 y esta quedó. Quitar «(las dos vías)». El test de R13 no la ve
   porque solo busca las rutas y los nombres de carpeta.
2. `src/modules/category-rules/category-rules.types.ts:5` («travels inside the
   import report (both ways in)») y `src/modules/transfers/transfers.types.ts:6`
   («both import ways call it after their file loop») — comentarios que la feature
   ha vuelto falsos. Los dos lotes los reportaron y ninguno los corrigió porque no
   están en sus `Archivos:`. Hace falta una pasada del `implementer` con esos dos
   archivos en su lista. En la misma pasada: `src/lib/cp1252.ts:33` y
   `src/lib/cp1252.test.ts:58` hablan de que un concepto «reach the dump»; ese
   volcado a disco ya no existe.
3. `src/retired-routes.docs.test.ts:46-47` — el archivo nombra la carpeta
   componiendo el texto (`['va', 'r'].join('')`) y con la expresión `var\/`, y su
   propio comentario (líneas 43-45) dice que es para que no lo vea el guardián
   `mentions the var folder nowhere in the code`. R5 dice «dos únicas excepciones
   declaradas con su motivo» y el ADR-032 (decisión 4) repite «dos excepciones
   declaradas»: hoy hay un tercer archivo que la nombra, sin declarar. El Lote B lo
   avisó en su informe (decisión 1) como algo a decidir. Hay que decidirlo, no
   dejarlo así: o bien se declara este archivo como tercera excepción en la lista
   `allowed` de `src/architecture.test.ts` (y se corrigen «dos» por «tres» en
   `requirements.md` R5 y en el ADR-032, con el visto bueno del humano, que aprobó
   R5 con dos), o bien el test de R13 deja de necesitar el nombre de la carpeta.
4. `docs/roadmap.md` — la prueba con un archivo real del comando
   `pnpm run parse-file` no se ha hecho (el informe dice por qué: los archivos
   reales están en `var/`, que no se abre) y **no está apuntada como deber del
   humano** (`grep -n -i "parse-file|prueba real" docs/roadmap.md` solo devuelve la
   línea 368, que describe el comando, y la 465, de la F47). `CHECKPOINTS.md` C4 bis
   lo exige. Tampoco están apuntados los tres deberes del bloque 📌 de
   `decisions.md` (mirar que no haya en `var/` nada que no esté en Drive, borrar la
   carpeta, pasar `./init.sh` después). Es trabajo del leader.

### Comprobado sin hallazgos

Con qué comando y qué salió:

- **`./init.sh`** (lanzado por mí): exit 0, `Test Files 69 passed (69)`,
  `Tests 1271 passed (1271)`, typecheck, lint y formato en `[OK]`. Coincide con el
  informe (68 y 1267 tras el Lote A, más el archivo del Lote B con 4 tests).
- **`./init.sh --checks 52`** (lanzado por mí): exit 0, **9 de 9 en verde**. Los
  cuatro que filtran por nombre imprimieron `Tests  1 passed | 36 skipped (37)`. Los
  otros cinco no filtran; lanzados aparte para ver qué ejecutan: importador 78
  tests, `retired-routes.docs` 4, ingestion 7, `parse-file` 6, y `pnpm test` es la
  suite entera. Ninguno puede pasar sin ejecutar su test: los filtrados exigen
  exactamente `Tests +1 passed` (cero tests o un test en rojo no casan), y `vitest`
  sale con 1 si no encuentra el archivo (es lo que le pasó al check 5 tras el Lote A).
- **Checks ↔ tabla 🧪 de `decisions.md`**: `git diff HEAD -- feature_list.json`
  muestra los nueve checks añadidos y el paso a `in_progress`; cubren las siete
  filas de la tabla y los nombres de test son los de `tasks.md` T10, T12 y T20.
- **Los 118 tests de menos**: comparados nombre a nombre entre `HEAD` y el árbol de
  trabajo con un script propio (no con el informe). Lo que desaparece es de las
  ocho rutas, del recorrido de la copia en disco, de `test-var` y de `.gitignore`
  con tres líneas. Lo que afirmaba algo del importador existe ahora por
  `importPending` / `POST /api/import`: los 6 de `revolut.import.test.ts` y los 9
  de `myinvestor.import.test.ts` (el diff solo cambia cómo llega el archivo, ninguna
  afirmación), los dos de categorización en `import.service.test.ts`, los dos de
  traspasos y la segunda importación tras emparejar en `import.routes.test.ts`, y
  los cinco que el Lote A llevó de más. Los 14 tests del camino de Drive que el
  informe cita como equivalentes de los borrados existen (localizados por nombre en
  `import.service.test.ts`). Los 9 de `<banco>.registry.test.ts` son los mismos de
  antes, mudados.
- **Parsers y guardado sin cambios**: `git diff HEAD` sobre `*.parser.ts`,
  `*.format.ts`, `*.csv.ts`, `*.html.ts` da dos líneas, las dos de comentario;
  `prisma/` sin diff. En `import.service.ts` solo sale la escritura de la copia y
  `describeError` pasa a exportarse.
- **Respuesta de `POST /api/import` y `GET /api/ingestion/pending`**: en sus tests
  de antes las únicas líneas quitadas son las del directorio temporal y el test de
  la copia en disco; ninguna afirmación cambia.
- **Las ocho rutas, 404 en la aplicación real**: test `answers 404 to the eight
  routes retired by feature 52`, con `buildApp()` e `inject` (check 3 en verde).
- **Referencias a `var/`**: `git grep` en `src`, `scripts`, `prisma`, configuración
  de vitest, `package.json` e `init.sh` solo devuelve `src/no-real-data.test.ts`
  (excepción declarada) y lo del punto 3. `.gitignore` queda con la única línea
  `var/`.
- **Comando `parse-file`**, ejecutado por mí con un `.csv` inventado (generado con
  `buildRevolutCsv` en una carpeta temporal) y con `DATABASE_URL` apuntando a un
  servidor que no existe: imprime recuentos y fechas, exit 0; ninguna de las cifras,
  conceptos, IBAN ni nombre de archivo que puse aparece en la salida (búsqueda con
  `grep -c`: 0 en los siete casos). Archivo rechazado, ruta que no existe, banco sin
  parser y falta de argumentos: exit 1 con su mensaje. `git status --short` idéntico
  antes y después; la carpeta temporal solo tiene los dos archivos que creé yo.
- **Documentos**: «Rutas retiradas» está en la línea 31 del contrato y «Errores» en
  la 65; las seis secciones se llaman «Qué lee el parser de `<banco>`». ADR-032
  nuevo; ADR-029 `superada por ADR-032`; las diez líneas de revisión están. En el
  diff de `docs/architecture.md` las únicas líneas quitadas son del árbol de
  carpetas y la línea de estado del ADR-029: ningún cuerpo reescrito, y las líneas
  de revisión de la feature 51 (ADR-017, 024 y 027) intactas, con la de la 52
  después. `docs/vocabulary.md` solo cambia las dos definiciones del punto 4 de la
  hoja. `docs/roadmap.md` tacha los cabos 14 y 16.
- **Alcance**: ningún archivo del motor del harness en `git status`; el diff del
  repositorio del frontend no contiene nada de `src/` (tiene cambios propios sin
  commitear en su `feature_list.json`, `progress/` y `specs/`, que no he atribuido a
  esta feature). Cada lote tocó solo sus `Archivos:`.
- **Carpeta `var/`**: 72 archivos antes y después de mi revisión (contados con
  `find var -type f | wc -l`, sin abrir ninguno).
- **«La suite pasa con `var/` borrada»**: no lo he comprobado y no se puede
  comprobar sin borrarla, que solo puede hacerlo el humano. Lo que sí demuestran los
  tests: que ningún archivo de código, script ni configuración de la suite nombra la
  carpeta (check 4, con la salvedad del punto 3), que el importador y la detección
  de pendientes no usan `node:fs` (check 2) y que `vitest.global-setup.ts` ya no la
  lee ni la compara.
- **SDD**: `decisions.md` con 5 puntos en 🔴, cada uno con su alternativa; 14
  requirements; procedencia de R1 a R14; T1 a T21 en `[x]`; trazabilidad de cada
  `R<n>` a un test que existe y pasa.
- **Datos reales**: no he visto ninguno en el diff, en el informe ni en este
  veredicto; `src/no-real-data.test.ts` pasa dentro de la suite.

## Review (2026-10-02, segunda pasada)

**Veredicto:** APPROVED
Comprobado: acceptance/requirements ↔ tests, arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Checks: 9 de 9 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/remove-var.md`.

Los cuatro cambios pedidos, comprobados ejecutando:

1. `docs/data-model.md:251` ya no dice «(las dos vías)». `git grep -n -i -E "las dos
   vías|both ways in|both import ways|the dump\b"` en `docs`, `README.md` y `src`
   (sin `docs/architecture.md` ni `docs/roadmap.md`, que guardan historia) solo
   devuelve `src/no-real-data.test.ts:119`, un comentario que cuenta algo pasado.
2. `git diff HEAD` sobre `category-rules.types.ts`, `transfers.types.ts`,
   `cp1252.ts` y `cp1252.test.ts`: cinco líneas cambiadas, las cinco de comentario.
3. `src/retired-routes.docs.test.ts` ya no compone el nombre de la carpeta y está en
   la lista `allowed` de `src/architecture.test.ts` (líneas 604-610) con su motivo.
   `requirements.md` R5 y el ADR-032 dicen «tres excepciones». Es una decisión del
   leader sobre un requirement cuyo alcance estaba delegado; `decisions.md` no daba
   número. El humano todavía no lo sabe: el leader se lo dice al cerrar.
4. `docs/roadmap.md` §Deberes tuyos pendientes (líneas 455-466) lleva los tres
   pasos de borrar `var/` y la prueba de `pnpm run parse-file` con un archivo real.

`./init.sh` (lanzado por mí): exit 0, `Test Files 69 passed (69)`, `Tests 1271
passed (1271)`. `./init.sh --checks 52`: exit 0, 9 de 9; los cuatro filtrados
imprimen `Tests  1 passed | 36 skipped (37)`. Carpeta `var/`: 72 archivos
(`find var -type f | wc -l`, sin abrir ninguno).

Sigue sin poder comprobarse por ningún agente: que la suite pasa con `var/`
borrada de verdad, y `parse-file` con un archivo real. Las dos están en el roadmap
como deberes del humano.
