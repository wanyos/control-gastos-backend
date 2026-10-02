# remove-var — implementación

## Lote A — implementación

Implementer, 2026-10-02. Tasks T1 a T14 de `specs/52-remove-var/tasks.md`, todas
marcadas `[x]`. No he abierto, listado, movido ni borrado nada de la carpeta
`var/` del disco. No he hecho commit ni he tocado `feature_list.json`.

**Resultado:** `./init.sh` en verde (68 archivos de test, 1267 tests).
`./init.sh --checks 52`: 8 de 9 en verde; el que queda en rojo depende del Lote B
(detalle abajo).

### Archivos modificados / creados

**Creados (8)**

- `src/lib/drive.fixture.ts` — `driveWithPendingFiles(bankFolder, year, files)`:
  cliente de Drive simulado en memoria para los tests que entran por
  `importPending`.
- `src/modules/import/import.parse-file.ts` — `summarizeBankFile`,
  `formatBankFileSummary`, `exitCodeOf`.
- `src/modules/import/import.parse-file.test.ts` — sus 6 tests.
- `scripts/parse-bank-file.ts` — el comando `pnpm run parse-file <banco> <ruta>`.
- `src/modules/{n26,openbank,revolut,trade-republic}/<banco>.registry.test.ts` —
  los 9 tests de los `*.routes.test.ts` que no eran de la ruta, sin cambiar lo que
  afirman.

**Borrados (26)**

- Los seis `src/modules/<banco>/<banco>.routes.ts` y sus `.routes.test.ts`.
- `<banco>.service.ts` y `.service.test.ts` de bankinter, n26, openbank y revolut.
- `src/modules/import/import.local.service.ts`, `import.local.service.test.ts`,
  `import.local.routes.test.ts`, `import.schema.ts`.
- `src/lib/test-var.ts`, `src/lib/test-var.test.ts`.

**Modificados**

- `src/app.ts` — sin los seis imports ni los seis registros bajo `/api/parser`.
- `src/modules/import/import.routes.ts`, `import.service.ts`, `import.types.ts` —
  sin `POST /local`, sin `rawCopyBaseDir`, sin la escritura de la copia, sin los
  tipos `Local*`; `describeError` pasa a exportarse.
- `src/errors/app-error.ts` — sin `LocalCopyNotFoundError`.
- `src/modules/ingestion/ingestion.routes.ts`, `.service.ts`, `.types.ts` y sus
  dos tests — sin `POST /process`, `processPending` ni sus tipos.
- `src/modules/myinvestor/myinvestor.service.ts` y
  `src/modules/trade-republic/trade-republic.service.ts` — queda solo la función
  que usa `src/app.ts`; sus tests, solo los `describe` de esa función.
- Los seis `<banco>.types.ts` — sin los tipos de resumen del recorrido local.
- Los cinco `<banco>.fixture.ts` (myinvestor, n26, openbank, revolut,
  trade-republic) — comentarios, y fuera `writeLocalCopy` (ver Decisiones).
- `src/modules/n26/n26.statement.parser.ts`,
  `src/modules/revolut/revolut.statement.parser.ts`,
  `src/modules/category-rules/category-rules.seed.ts` — una línea de comentario
  cada uno.
- `src/modules/revolut/revolut.import.test.ts`,
  `src/modules/myinvestor/myinvestor.import.test.ts`,
  `src/modules/import/import.service.test.ts`,
  `src/modules/import/import.routes.test.ts` — reescritos o ampliados sobre
  `importPending` / `POST /api/import`.
- `vitest.global-setup.ts`, `src/lib/test-guard.ts`, `src/lib/test-guard.test.ts`,
  `src/lib/test-guard.e2e.test.ts` — sin la comparación de `var/`.
- `src/architecture.test.ts`, `src/no-real-data.test.ts`, `.gitignore`,
  `package.json`.

Comprobado que ningún parser cambia una línea de código:

```
$ git diff --stat -- 'src/modules/*/*.parser.ts' 'src/modules/*/*.format.ts' 'src/modules/*/*.csv.ts' 'src/modules/*/*.html.ts'
 src/modules/n26/n26.statement.parser.ts         | 2 +-
 src/modules/revolut/revolut.statement.parser.ts | 2 +-
```

Las dos líneas son de comentario (la frase «copied out of `var/`» pasa a «copied
out of his data»).

### Decisiones tomadas

1. **Orden.** Los tests que afirman algo del importador se reescribieron sobre
   `importPending` / `POST /api/import` y se lanzaron en verde **antes** de borrar
   `import.local.*` y las rutas (T2 antes que T3-T6). Durante ese paso llevaban
   todavía un directorio temporal `rawCopyBaseDir`, que se quitó en T3.
2. **`driveWithPendingFiles` no «quita» el archivo movido.** El listado es fijo:
   una segunda pasada con el mismo cliente vuelve a ver el archivo, que es como se
   ve «el humano lo devolvió a la carpeta del año». `moved()` devuelve los nombres
   movidos. Los clientes de Drive simulados que ya existían en `import.service.test.ts` e
   `import.routes.test.ts` no se han refactorizado.
3. **Qué tests de `import.local.*` se llevaron y cuáles se borraron** (repaso
   test a test, tabla en §Tests).
4. **`writeLocalCopy` se quita de cinco fixtures.** Tras los borrados no la
   importaba nadie (`git grep writeLocalCopy` → 0 resultados en `src/`), era la
   única razón por la que esos fixtures importaban `node:fs/promises`, y su
   comentario nombraba la carpeta. Los fixtures están en los `Archivos:` del lote.
   No lo pedía ninguna task de forma literal.
5. **Tipos borrados de los `<banco>.types.ts`:** cada uno tras buscar su nombre en
   `src/` y no encontrar más uso que su propia declaración: `ParsedFileSummary`,
   `FailedParse`, `ParseRunResult` (bankinter); `FailedFile`, `IgnoredFile`,
   `ParsedStatementSummary`, `<Banco>ParseRunResult` (myinvestor, n26, openbank,
   revolut); `MyinvestorProductsResult`, `ParsedProductSummary` (myinvestor);
   `FailedFile`, `IgnoredFile`, `TradeRepublicProductsResult`,
   `ParsedSavingsAccountSummary`, `TradeRepublicParseRunResult` (trade-republic).
   Se quedan los que usan los parsers (`<Banco>StatementResult`,
   `BankinterParseResult`, `ParsedProduct`, `ParsedSavingsAccount`, …).
6. **`src/lib/test-guard.e2e.test.ts`:** el proyecto de prueba que escribe guarda
   con `statSync` la fecha de modificación de un archivo inventado, la compara al
   cerrar y llama al `failRun` real con el mensaje `EL ARCHIVO VIGILADO HA CAMBIADO
   DE FECHA DURANTE LA PASADA.`. Sus dos tests siguen afirmando código de salida
   ≠ 0 y = 0. El test interno del proyecto de prueba pasa a llamarse `changes the
   date of the watched file and nothing else`.
7. **`parse-file` y el caso «banco sin parser».** `importPending` informa siempre
   del motivo del registro de extractos. El comando informa del motivo del
   registro que **sí** conoce el banco: un banco que solo tiene archivos de
   producto con una extensión que no lee sale como «extensión no soportada por el
   parser de productos de …», no como «no hay parser para el banco». Así los
   cuatro casos de R12 no se confunden. Es una decisión dentro de la función
   nueva; `selectAdapter` y `selectProductAdapter` no cambian.
8. **`parse-file` no repite la ruta en sus mensajes.** Cuando la ruta no existe
   dice «La ruta del archivo no existe.» sin escribirla: esa salida se pega en
   informes y la ruta es del humano.
9. **`git rm` por error.** Borré cuatro archivos con `git rm`, que además los
   deja en el índice. Lo deshice con `git reset -q HEAD -- <los cuatro>`: el
   índice queda como estaba y no hay nada preparado para commit.

### Tests: cuántos quedan y qué ha pasado con cada uno

| | Archivos de test | Tests |
|---|---|---|
| Partida (lanzado antes de tocar nada: `pnpm test`) | 76 | 1385 |
| Ahora (`pnpm test`) | 68 | 1267 |

- Archivos: −13 (6 `*.routes.test.ts`, 4 `*.service.test.ts`, 2
  `import.local.*.test.ts`, `test-var.test.ts`) +5 (4 `*.registry.test.ts`,
  `import.parse-file.test.ts`).
- Tests: salen 148 nombres y entran 30 (−118). Comparado nombre a nombre entre
  `HEAD` y el árbol de trabajo.

**Entran (30)**

- `src/architecture.test.ts` (4): `keeps the importer off the filesystem`,
  `mentions the var folder nowhere in the code`, `has none of the files feature 52
  removed`, `answers 404 to the eight routes retired by feature 52`.
- `src/modules/import/import.parse-file.test.ts` (6): los seis de T12.
- `<banco>.registry.test.ts` (9): n26 2, openbank 3, revolut 2, trade-republic 2.
  Son los mismos tests de antes, mudados de archivo.
- `src/modules/import/import.service.test.ts` (6) e
  `src/modules/import/import.routes.test.ts` (3): los llevados desde
  `import.local.*` (tabla siguiente).
- Renombrados en su sitio (2): `has the var folder gitignored whole, and versions
  nothing under it` (`no-real-data.test.ts`) y `changes the date of the watched
  file and nothing else` (cadena dentro de `test-guard.e2e.test.ts`).

**Reescritos sin cambiar de nombre ni de lo que afirman (15):** los 6 de
`revolut.import.test.ts` y los 9 de `myinvestor.import.test.ts`, que ahora entran
por `importPending` con `driveWithPendingFiles`.

**Llevados desde `import.local.service.test.ts` e `import.local.routes.test.ts`**

| Test de antes | Dónde queda |
|---|---|
| `categorizes the movements this run just imported, after the detection (R12)` | `import.service.test.ts`, mismo nombre |
| `reports a categorization failure inside the report, with the import intact (R12)` | `import.service.test.ts`, mismo nombre |
| `links nobody when two mirrors compete, and lists the group in the report (feature 40, R5, R6)` | `import.routes.test.ts`, mismo nombre |
| `reports a detection failure inside the 200, with the import intact (feature 40, R15)` | `import.routes.test.ts`, mismo nombre |
| `hands the parser the bytes of the copy and reads the bank from the FOLDER (C1)` | `import.service.test.ts`: `hands the parser the bytes of the download and reads the bank from the FOLDER (C1)` |
| `reimports every copy on disk when nothing is asked for in particular (C1)` | `import.service.test.ts`: `imports the pending files of every year folder of a bank (C1)` |
| `adds one row for the next month and keeps the same account (R11, R7)` | `import.service.test.ts`, mismo nombre |
| `stores the warnings with the copy they came out of and does not duplicate them on a second run (R1, R2, R6)` | `import.service.test.ts`: `stores the warnings with the file they came out of and does not duplicate them on a second run (R1, R2, R6)` |
| la segunda mitad de `pairs the imported leg with its stored mirror, and a reimport changes nothing (feature 40, R1, R8)` | `import.routes.test.ts`: `changes nothing when the same file is imported again after pairing (feature 40, R8)` |

Los cuatro primeros los pedía `design.md` §3.6. Los cinco últimos no tenían un
test equivalente en el camino de Drive y los he llevado en vez de perderlos: no
encontré en `import.service.test.ts` ni en `import.routes.test.ts` un test que
afirmara (a) una carpeta de banco escrita en mayúsculas, (b) dos carpetas de año
del mismo banco en una pasada, (c) dos meses seguidos del mismo producto con un
parser de producto declarado en el test, (d) que una segunda importación del mismo
archivo no duplica los avisos guardados, ni (e) que una segunda importación no
cambia las parejas ya enlazadas.

**Borrados de `import.local.*` por tener ya su test equivalente en el camino de
Drive** (entre paréntesis, el test de `importPending` / `POST /api/import` que
afirma lo mismo):

- `reports duplicates instead of importing again on a second pass (C2)` y `does
  not duplicate anything when the same call is made twice (C2)` (`reimports the
  same file without duplicating anything…`).
- `fails a local copy that brings no movement, storing nothing (C3, C4)` (`fails a
  file that parses with no error and brings no movement…` y `creates no account
  for a file that brings no movement`).
- `skips a copy whose bank has no parser…` (`skips a file with no parser or an
  unsupported extension…`).
- `isolates a failing copy and goes on with the rest (C6)` (`does not move a file
  whose import failed and goes on with the rest`).
- `fails a copy with no iban whose bank has no account…` (`fails with
  MISSING_ACCOUNT_DATA and creates no account…`).
- `leaves the account unanchored when its local copies bring no balance` (`imports
  a file with no balance at all and leaves the account unanchored`).
- `reports the descuadres of each copy and the total of the run…` (`reports a
  per-line descuadre, imports the file anyway and goes on with the next`).
- Productos: `persists the copy…`, `does not duplicate anything on a second
  pass…`, `leaves no trace and moves nothing when the amounts do not add up`
  (`stops reporting the .json as skipped…`, `reports created:false on the second
  pass…`, `leaves NO trace when the five amounts do not add up`).
- `always carries the categorization result, with zeros when there is no rule`
  (`reports nothing and touches nothing when there is no pending file`, que afirma
  la categorización a ceros).
- `anchors the accounts and fills the missing balances without duplicating a row
  (R15)`: sus dos afirmaciones están por separado en `anchors an account that had
  no anchor…` y `fills the balance of a row already stored empty…`. **No hay un
  test del camino de Drive que las junte en un solo archivo sobre una cuenta que
  ya existía sin ancla**; lo he dado por cubierto por las dos mitades.

**Borrados de `import.local.*` por afirmar algo que solo existía en la ruta
retirada** (no hay nada que llevar): `imports a file from its local copy with no
Drive client at all`, `leaves every local copy exactly where it was…`, `reports
movedToProcessed false for every file…`, los seis de `LOCAL_COPY_NOT_FOUND`, los
dos del nombre que es una ruta, `reimports the copy named by bank, year and
name…`, `accepts a call with no body at all…`, `drops an unknown field…`.

**Desaparecen con lo que probaban**

- `src/lib/test-var.test.ts` (10).
- `src/architecture.test.ts` (3): `keeps the local reimport away from Drive…` y
  los dos de `.gitignore`.
- `import.service.test.ts` (1): `writes the raw copy of the downloaded file before
  parsing it`.
- `ingestion.routes.test.ts` (1) e `ingestion.service.test.ts` (7): los de `POST
  /process` y `processPending`. Los de `GET /pending` y `detectPending` no cambian
  de nombre ni de afirmaciones; solo dejan de crear un directorio temporal que ya
  no usa nadie. En `registers the same capabilities under /api/ingestion/*` se
  quita la línea de `POST /api/ingestion/process`.
- Rutas y recorridos de banco: bankinter 3 + 5, myinvestor 6 + 19, n26 5 + 5,
  openbank 5 + 7, revolut 4 + 5, trade-republic 4 + 10.

Lo que **no** he comprobado: no repasé uno por uno los tests borrados de los
`<banco>.service.test.ts` y `<banco>.routes.test.ts` buscando su equivalente en
los tests de parser; `design.md` §2 manda borrarlos enteros. Lo único que miré es
que los tests de parser siguen cubriendo los rechazos por codificación:
`grep -c "UNEXPECTED_ENCODING\|UnexpectedEncodingError"` da 9 en
`openbank.statement.parser.test.ts`, y `grep -c "NOT_UTF8\|NotUtf8Error"` da 6, 2
y 9 en los de n26, revolut y myinvestor. De lo borrado, hay dos comportamientos
que desaparecen con el recorrido local y no existen en `POST /api/import`: «si dos
archivos declaran el mismo producto y fecha, se queda el primero por orden
alfabético» (MyInvestor y Trade Republic) y el volcado byte a byte idéntico.

### Trazabilidad

- R1 → los tests de `importPending` y de `POST /api/import` que ya existían
  (`import.service.test.ts`, `import.routes.test.ts`), sin cambiar lo que afirman;
  más los 15 de `revolut.import.test.ts` y `myinvestor.import.test.ts` y los 9
  llevados de la tabla de arriba.
- R2 → `keeps the importer off the filesystem` (`src/architecture.test.ts`).
- R3 → `answers 404 to the eight routes retired by feature 52`; `has none of the
  files feature 52 removed`.
- R4 → `walks every bank/year dynamically and counts pending without touching
  files`, `reports zero pending and no banks when the year folders are empty`
  (`ingestion.service.test.ts`); `returns 200 with the pending detection`,
  `returns 503 DRIVE_CONNECTION_ERROR when Drive is unreachable`
  (`ingestion.routes.test.ts`).
- R5 → `mentions the var folder nowhere in the code`.
- R6 → `mentions the var folder nowhere in the code` (incluye
  `vitest.global-setup.ts`); `has none of the files feature 52 removed` (incluye
  `lib/test-var.ts`); `EXITS NON-ZERO when a watched file was touched, with all its
  tests green` y `EXITS ZERO when nothing was touched: it does not cry wolf`
  (`test-guard.e2e.test.ts`).
- R7 → `has the var folder gitignored whole, and versions nothing under it`
  (`src/no-real-data.test.ts`).
- R8, R9, R13, R14 → Lote B.
- R10 → `summarizes a statement with counts and shape, and no value of the file`;
  `summarizes a product file by its type`.
- R11 → `takes no database nor Drive client, and imports nothing from node:fs`.
- R12 → `says there is no parser for the bank`; `says the extension is not read by
  that bank`; `reports a rejected file by its code only, never its message`; y la
  ruta que no existe, ejecutada a mano (salida abajo): `scripts/` no tiene tests.

Los dos tests nuevos que leen el código los provoqué a propósito, con dos
archivos de prueba que borré después (`src/lib/zz-probe.ts` nombrando la carpeta y
`src/modules/ingestion/zz-probe.ts` importando `node:fs/promises`):

```
$ pnpm exec vitest run src/architecture.test.ts -t "mentions the var folder nowhere in the code|keeps the importer off the filesystem"
     × keeps the importer off the filesystem 8ms
     × mentions the var folder nowhere in the code 26ms
AssertionError: expected [ 'modules/ingestion/zz-probe.ts' ] to deeply equal []
AssertionError: expected [ 'src/lib/zz-probe.ts:2', …(1) ] to deeply equal []
+   "src/lib/zz-probe.ts:2",
+   "src/lib/zz-probe.ts:3",
      Tests  2 failed | 35 skipped (37)
```

### El comando `pnpm run parse-file`, ejecutado a mano (T13)

Con archivos **inventados**, generados con `buildRevolutCsv` y `buildAccountJson`
en una carpeta de `mktemp -d`, borrada al terminar (`<tmp>` sustituye a su ruta).
Lanzado con `pnpm run --silent parse-file …`.

```
---- pnpm run parse-file revolut <tmp>/extracto-inventado.csv
Tipo de archivo: extracto de movimientos
Movimientos leídos: 6
Filas que no se han podido leer: 3 (filas 9, 11, 12)
Trae IBAN: sí
Trae saldo de la cuenta: no
Movimientos con saldo en su línea: 6 de 6
Primera fecha: 2026-07-01
Última fecha: 2026-07-03
exit=0
---- pnpm run parse-file Trade-Republic <tmp>/cuenta-inventada.json
Tipo de archivo: producto
Tipo de producto: savings_account
exit=0
---- pnpm run parse-file revolut <tmp>/no-existe.csv
La ruta del archivo no existe.
Uso: pnpm run parse-file <banco> <ruta-del-archivo>
exit=1
---- pnpm run parse-file revolut <tmp>/roto-inventado.csv
El parser ha rechazado el archivo. Código: VALIDATION_ERROR.
El motivo no se imprime porque puede citar valores del archivo.
exit=1
---- pnpm run parse-file revolut <tmp>/cuenta-inventada.json
No se ha leído el archivo: extensión no soportada por el parser de revolut.
exit=1
---- pnpm run parse-file banco-inventado <tmp>/extracto-inventado.csv
No se ha leído el archivo: no hay parser para el banco banco-inventado.
exit=1
---- pnpm run parse-file revolut
Faltan argumentos.
Uso: pnpm run parse-file <banco> <ruta-del-archivo>
exit=1
```

En los cinco casos de salida 1, `pnpm` añade debajo su línea `[ELIFECYCLE] Command
failed with exit code 1.`.

### Documentos actualizados

Ninguno: `docs/` y `README.md` son del Lote B. Lo que este lote ha vuelto falso
fuera de `progress/` y `specs/`, buscado con:

```
git grep -n "parseLocal\|importLocalCopies\|processPending\|rawCopyBaseDir\|sourceBaseDir\|dumpBaseDir\|LocalCopyNotFound\|LOCAL_COPY_NOT_FOUND\|test-var\|snapshotVarDir\|writeLocalCopy\|api/parser\|import/local\|ingestion/process" -- . ':!progress' ':!specs' ':!feature_list.json'
```

- En `src/`: solo quedan las menciones de `src/architecture.test.ts` (la lista de
  las ocho rutas y la de archivos borrados), que son las que tienen que estar.
- En documentos, **para el Lote B**: `README.md` (líneas 86-95, 111);
  `docs/api-contract.md` (120-134, 153, 271, 633, 1565-1571, 1610, 2000-2035, 2167,
  2413, 2593, 2756, 2900, 2960, 3021, 3137); `docs/architecture.md` (81, 91, 102,
  114 y los ADR); `docs/conventions.md` (231, 241); `docs/dar-de-alta-un-banco.md`
  (86); `docs/data-model.md` (446); `docs/myinvestor-product-files.md` (11, 300,
  333); `docs/roadmap.md` (159, 190, 426); `docs/trade-republic-product-files.md`
  (234).

**Dos comentarios que este lote ha vuelto falsos y que están fuera de sus
`Archivos:`** (no los he tocado; hace falta que alguien con esos archivos los
corrija):

- `src/modules/category-rules/category-rules.types.ts:5` — «travels inside the
  import report (both ways in)».
- `src/modules/transfers/transfers.types.ts:6` — «both import ways call it after
  their file loop».

Ninguno de los dos nombra la carpeta, así que no ponen rojo ningún test.

### Prueba real

No se ha hecho. Lo que lee datos de fuera en este lote es el comando `pnpm run
parse-file`, y los archivos reales del humano están en `var/`, que tengo prohibido
abrir en esta feature. Haría falta que el humano lo lance sobre un archivo suyo
(`pnpm run parse-file <banco> <ruta>`): la salida no lleva importes, IBAN, nombres
ni conceptos y se puede pegar tal cual.

### Último ./init.sh

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ───────────────────────────────────
[OK]    OK: pnpm run lint
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  68 passed (68)
      Tests  1267 passed (1267)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Código de salida: 0.

### Último ./init.sh --checks 52

Código de salida: 1 (`Checks: 8 de 9 en verde. La feature no se puede cerrar.`).

| # | Check | Resultado |
|---|---|---|
| 1 | `pnpm exec vitest run src/modules/import/import.service.test.ts src/modules/import/import.routes.test.ts` | OK, exit 0 |
| 2 | `… -t "keeps the importer off the filesystem" \| grep -E "Tests +1 passed"` | OK — `Tests  1 passed \| 36 skipped (37)` |
| 3 | `… -t "answers 404 to the eight routes retired by feature 52" \| grep …` | OK — `Tests  1 passed \| 36 skipped (37)` |
| 4 | `… -t "mentions the var folder nowhere in the code" \| grep …` | OK — `Tests  1 passed \| 36 skipped (37)` |
| 5 | `pnpm exec vitest run src/retired-routes.docs.test.ts` | **FAIL, exit 1** — `No test files found, exiting with code 1` |
| 6 | `pnpm exec vitest run src/modules/ingestion/ingestion.service.test.ts src/modules/ingestion/ingestion.routes.test.ts` | OK, exit 0 |
| 7 | `… -t "has none of the files feature 52 removed" \| grep …` | OK — `Tests  1 passed \| 36 skipped (37)` |
| 8 | `pnpm test` | OK, exit 0 |
| 9 | `pnpm exec vitest run src/modules/import/import.parse-file.test.ts` | OK, exit 0 |

El check 5 es el único que depende del Lote B: `src/retired-routes.docs.test.ts`
es un archivo de ese lote (T20) y todavía no existe. No se ha tocado ningún
`check`.

### Sugerencias fuera de scope (NO aplicadas)

- `src/lib/cp1252.ts:33` y `src/lib/cp1252.test.ts:58` hablan de que un carácter
  dañado «llegue al volcado» (`the dump`). Ya no hay volcado; la frase sigue
  siendo cierta si se lee como «llegue a la base de datos». No están en los
  `Archivos:` de ningún lote.
- `ingestion.service.test.ts` conserva en su cliente simulado las opciones
  `update`, `create` y `contents`, que solo usaban los tests borrados de
  `processPending`. No las he quitado para no cambiar los tests de `GET /pending`.

## Lote B — implementación

Implementer, 2026-10-02. Tasks T15 a T21 de `specs/52-remove-var/tasks.md`, todas
marcadas `[x]`. No he abierto, listado, movido ni borrado nada de la carpeta
`var/` del disco. No he tocado ningún archivo del Lote A, ni `feature_list.json`,
ni los `checks`. No he hecho commit.

**Resultado:** `./init.sh` en verde (69 archivos de test, 1271 tests) y
`./init.sh --checks 52` con 9 de 9 en verde.

**Tres cosas que el leader debería mirar antes de pasar al reviewer** (detalle en
§Decisiones tomadas): la 1 (cómo está escrito el nombre de un test para no chocar
con el guardián de R5), la 2 (`docs/roadmap.md` da la F52 por cerrada) y la 3
(líneas corregidas que la tabla de `design.md` §7.3 no listaba).

### Archivos modificados / creados

**Creado (1)**

- `src/retired-routes.docs.test.ts` — los cuatro tests de `design.md` §7.4.

**Modificados (13)**

- `docs/api-contract.md` — sección nueva `## Rutas retiradas` justo antes de
  `## Errores` (aviso de cambio que rompe el contrato, fecha, feature 52, tabla de
  las ocho rutas con qué hacía cada una y qué se usa ahora, y el código
  `LOCAL_COPY_NOT_FOUND` retirado). Borradas las ocho subsecciones de ruta. Las
  seis secciones `## Parser de <banco> (sin base de datos)` pasan a
  `## Qué lee el parser de <banco>`, sin los párrafos del volcado a disco.
  Corregidas las menciones sueltas. El archivo pasa de 3236 a 2762 líneas.
- `docs/architecture.md` — árbol de carpetas, ADR-032 nuevo al final de los ADR,
  ADR-029 con `Estado: superada por ADR-032`, y la línea «Revisado el 2026-10-02
  por la feature 52 `remove-var`» en los ADR-009, 010, 014, 015, 016, 017, 020,
  024, 025 y 026. En los ADR-017 y 024, que ya tenían líneas de revisión
  (incluidas las de la feature 51 de hoy), la mía va **después** de las que había,
  sin tocarlas. Ningún ADR se ha reescrito.
- `README.md` — tabla de rutas sin las siete filas de rutas retiradas que tenía
  (la de Revolut no estaba), el párrafo «Dos caminos» sustituido, la nota del
  cambio de la feature 12 corregida, y una fila para `pnpm run parse-file` en
  §Scripts disponibles.
- `docs/verification.md` — §La prueba real: el archivo real se pasa con
  `pnpm run parse-file <banco> <ruta-del-archivo>`.
- `docs/conventions.md` — borrada §Tests que tocan `var/`; la regla de `failRun`
  se muda a §Tests con base de datos; la frase de Trade Republic; y la de
  `bankinter.types.ts`.
- `docs/dar-de-alta-un-banco.md` — el esquema del módulo de un banco sin
  `service` ni `routes`, un «Quinto paso» con `pnpm run parse-file`, y las tres
  menciones a la copia en disco.
- `docs/archivos-por-banco.md`, `docs/data-model.md` — las líneas de la tabla de
  `design.md`.
- `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md` — el
  diagrama de «Dónde acaba lo que escribes», la mención a la ruta retirada y lo de
  la decisión 3 de abajo.
- `docs/vocabulary.md` — quitada la mención a la carpeta `var/` de **guardián** y
  de **red** (punto 4 de `decisions.md`, aprobado). No cambia nada más de las dos
  definiciones.
- `docs/roadmap.md` — cabos 14 y 16 tachados con «cerrado por la F52»; en la etapa
  E0, una viñeta de la F52 y su número en la fila de la tabla; y las líneas que
  describían `var/` como algo de hoy (E2, la fila de productos de MyInvestor, las
  muestras por banco y la nota de «juntar la feature»).
- `progress/current.md` — el plan del lote y la nota visible del cambio que rompe
  el contrato (las ocho rutas, la fecha y que el frontend no llama a ninguna).

### Decisiones tomadas

1. **El nombre del tercer test se compone en vez de escribirse de corrido.**
   `design.md` §7.4 pide un test llamado `the documents that describe today name no
   retired route nor var/drive-read nor var/parsed`. Ese texto, escrito tal cual en
   `src/retired-routes.docs.test.ts`, pone en rojo el test del Lote A `mentions the
   var folder nowhere in the code`, porque R5 solo admite dos archivos que nombren
   la carpeta (`src/architecture.test.ts` y `src/no-real-data.test.ts`) y el mío no
   es ninguno de los dos. Para no tocar un archivo del Lote A ni añadir una tercera
   excepción que R5 no contempla, el nombre de la carpeta se compone en el archivo
   (`['va', 'r'].join('')`) y la expresión regular la escribe como `var\/`. El
   nombre del test **al ejecutarse** es el que pide el diseño (se ve en la salida
   de abajo). **Es un rodeo y lo digo como tal:** la alternativa limpia es una
   tercera excepción declarada en `src/architecture.test.ts`, que es una decisión
   de spec (R5) y de un archivo que no es de mi lote. Si se prefiere, se cambia en
   una línea.
2. **`docs/roadmap.md` da la F52 por hecha** (viñeta con ✅ y los cabos 14 y 16
   como cerrados), como pedía la task, aunque la feature sigue `in_progress` hasta
   el veredicto del reviewer. Si se rechaza, esas tres líneas hay que revisarlas.
3. **He corregido líneas que la tabla de `design.md` §7.3 no listaba**, porque la
   feature las ha vuelto falsas y están en archivos de mi lote:
   - En los dos documentos de archivos de producto: «si dos archivos declaran el
     mismo producto y fecha, se conserva el primero por orden alfabético y el otro
     se reporta» (y su fila en la tabla de «qué pasa cuando un archivo está mal»).
     Ese comportamiento era del recorrido de la copia en disco y no existe en
     `POST /api/import` (lo dice el informe del Lote A). Ahora dicen que nadie avisa
     del choque y que la foto de esa fecha se sobrescribe.
   - En los mismos dos: «se reporta en `failed[]`» pasa a «sale con `status:
     "failed"` en el informe de `POST /api/import`»; y el motivo de la convención de
     nombre («la ingesta sobrescribe la copia local») desaparece.
   - `.pdf` de Trade Republic: «se lista como `ignored`» pasa a «sale como
     `skipped`» (`docs/trade-republic-product-files.md` y `docs/conventions.md`).
   - `docs/conventions.md`: `bankinter.types.ts` ya no tiene «los resúmenes de su
     ejecución local», y el enlace a su línea pasa de `#L14` a `#L17`.
   - `docs/api-contract.md`, sección de Trade Republic: decía que el banco «no está
     en el registro de parsers que recibe el importador»; ahora dice que no está en
     el de extractos y sí en el de archivos de producto, que es lo que afirman los
     dos tests de `trade-republic.registry.test.ts`.
4. **Una advertencia del contrato que vivía en la sección borrada se conserva.** La
   de «si el parser ha cambiado desde la primera importación, reimportar puede
   insertar copias» (la posición dentro del día se recalcula al parsear) estaba
   bajo `POST /api/import/local`. Sigue siendo cierta para un archivo que se
   devuelve a mano a la carpeta del año, así que la he dejado, resumida, en la
   viñeta de `POST /api/import` que habla de reimportar.
5. **`docs/conventions.md` línea 113 no se ha tocado.** La tabla del diseño la
   lista, pero ya decía «y, hasta la feature 52, en la carpeta gitignoreada `var/`»,
   que es cierto.
6. **ADR-029.** Su línea de estado pasa a `superada por ADR-032` y dice qué parte
   sigue en uso (`failRun`, para la comprobación de la base de datos del ADR-027).
   El cuerpo no se ha tocado.
7. **Dos comportamientos que desaparecen, apuntados en el ADR-032** tal como los
   reporta el Lote A: el de los dos archivos con el mismo producto y fecha, y el
   volcado byte a byte idéntico.
8. **Finales de línea.** `docs/architecture.md` y `docs/verification.md` están con
   CRLF en el árbol de trabajo (LF en git); los he dejado como estaban para no
   meter ruido en el diff. El test nuevo normaliza los finales de línea al leer.

### Trazabilidad

- R8 → `api-contract: names the eight retired routes only inside "Rutas retiradas"`.
- R9 → `api-contract: has the "Rutas retiradas" section before "Errores", naming
  the eight, the date and feature 52`.
- R13 → `the documents that describe today name no retired route nor var/drive-read
  nor var/parsed`.
- R14 → `architecture: ADR-032 exists, ADR-029 is superseded by it and ten ADRs
  carry the review line of feature 52`.

Los cuatro están en `src/retired-routes.docs.test.ts`. La nota de
`progress/current.md` (T19) y los cambios de `docs/vocabulary.md` y
`docs/roadmap.md` (T18) no tienen test: `requirements.md` dice que no son
requirements.

**Los cuatro tests los provoqué a propósito**, con una copia de los documentos
guardada fuera del repositorio y restaurada después. Añadí una línea con una ruta
retirada y el código de error al final del contrato, una línea con la carpeta en
`docs/archivos-por-banco.md`, una ruta en `docs/data-model.md`, cambié el nombre de
una de las ocho en la tabla del contrato, quité el `superada por ADR-032` y quité
la línea de revisión del ADR-020:

```
× api-contract: names the eight retired routes only inside "Rutas retiradas"
AssertionError: expected [ 'docs/api-contract.md:2764' ] to deeply equal []
× the documents that describe today name no retired route nor var/drive-read nor var/parsed
+   "docs/archivos-por-banco.md:68",
+   "docs/data-model.md:963",
× api-contract: has the "Rutas retiradas" section before "Errores", naming the eight, the date and feature 52
AssertionError: expected [ '/api/parser/revolut' ] to deeply equal []
× architecture: ADR-032 exists, ADR-029 is superseded by it and ten ADRs carry the review line of feature 52
AssertionError: expected '### ADR-029: La suite fotografía `var…' to contain '**Estado:** superada por ADR-032'
AssertionError: expected [ '020' ] to deeply equal []
```

Con los documentos restaurados: `Tests  4 passed (4)`.

También lancé, tras editar los documentos, los otros dos tests que leen `docs/`
(`trade-republic.docs.test.ts`, que exige frases literales, e
`import.warnings.docs.test.ts`): `Test Files  3 passed (3)`, `Tests  27 passed
(27)` junto con el nuevo.

### Documentos actualizados

Búsqueda lanzada al terminar, fuera de `progress/`, `specs/`, `feature_list.json`
y de los dos documentos que guardan historia (`docs/architecture.md`,
`docs/roadmap.md`):

```
git grep -n -I -E "api/parser|import/local|ingestion/process|LOCAL_COPY_NOT_FOUND|var/drive-read|var/parsed|test-var|rawCopyBaseDir|sourceBaseDir|dumpBaseDir|parseLocal|importLocalCopies|processPending" -- . ':!progress' ':!specs' ':!feature_list.json' ':!docs/architecture.md' ':!docs/roadmap.md'
```

Lo que queda:

- `docs/api-contract.md` líneas 43-52: la tabla y el código de error de la sección
  `## Rutas retiradas`. Es donde tienen que estar.
- `src/architecture.test.ts` (655, 661-662, 686-693): las listas del Lote A.
- `src/no-real-data.test.ts:120`: un comentario que cuenta de dónde salían unos
  avisos «when the same messages lived in the dump of `var/parsed/`». Es historia,
  está en uno de los dos archivos que R5 exceptúa y no es de mi lote.
- `src/retired-routes.docs.test.ts`: la lista de las ocho rutas del test nuevo.

Una segunda búsqueda, de «ensayo», «copia local», «copia cruda», «volcado local» y
«drive-read» en `AGENTS.md`, `CHECKPOINTS.md`, `docs/stack.md`,
`docs/related-projects.md`, `docs/specs.md`, `docs/lessons.md`, `init.sh`,
`.claude/` y `package.json`, no devolvió ninguna línea.

En `docs/architecture.md` y `docs/roadmap.md` siguen nombrándose las rutas y la
carpeta en el cuerpo de los ADR y en los cabos sueltos ya cerrados: es historia y
`decisions.md` lo declara como incoherencia heredada.

**Lo que no he comprobado:**

- No he ejecutado una importación con dos archivos de producto que declaren el
  mismo nombre y la misma fecha. Lo que escribí («la foto de esa fecha se
  sobrescribe») se apoya en lo que ya decía el contrato y en que existen y pasan
  los tests `reports created:false on the second pass of the same month (R6, R13)`
  y el que comenta «Writing the same month again overwrites the photo» en
  `import.service.test.ts`; no dice cuál de los dos archivos queda.
- No he ejecutado una importación con un `.pdf` en la carpeta de Trade Republic.
  Que sale `skipped` lo tomo de lo que ya decían el contrato («sus archivos salen
  como `skipped`») y `docs/trade-republic-product-files.md`, y de que pasa el test
  `skips a file with no parser or an unsupported extension…`.
- No he revisado `../docs/ideas.md` (nivel workspace, fuera de este repositorio).

### Prueba real

No aplica a este lote: solo cambia documentos y un test que lee documentos del
repositorio. La prueba real del comando `pnpm run parse-file` sigue pendiente, como
dice el Lote A.

### Último ./init.sh

```
── 5. Lint y formato ───────────────────────────────────
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  69 passed (69)
      Tests  1271 passed (1271)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Código de salida: 0. Son los 68 archivos y 1267 tests del Lote A más el archivo
nuevo con sus 4 tests.

### Último ./init.sh --checks 52

Código de salida: 0.

```
[OK]    Checks: 9 de 9 en verde.
```

Los nueve salieron con `exit 0`; los cuatro que filtran con `grep` imprimieron
`Tests  1 passed | 36 skipped (37)`. El check 5
(`pnpm exec vitest run src/retired-routes.docs.test.ts`), que era el que faltaba,
está en verde. No se ha tocado ningún `check`.

### Sugerencias fuera de scope (NO aplicadas)

- `docs/roadmap.md`, fila «MyInvestor · productos» de la tabla de la etapa E4:
  sigue diciendo que sus cinco `.json` «SIGUEN sin llegar a la base de datos», y el
  cabo 11 del mismo archivo dice que eso lo cerró la F29. No lo ha causado esta
  feature; solo corregí en esa fila la mención a la ruta.
- `docs/api-contract.md`, nota «`GET /api/accounts` NO cambia» de
  `POST /api/import`: dice que los descuadres «solo existen mientras dura la
  respuesta de la importación», y desde la feature 48 se guardan. Tampoco lo ha
  causado esta feature; solo quité de esa frase la ruta retirada.
- Siguen pendientes los dos comentarios que reportó el Lote A
  (`category-rules.types.ts:5` y `transfers.types.ts:6`): no están en los archivos
  de ninguno de los dos lotes.

## Cambios tras la primera revisión

Implementer, 2026-10-02. Puntos 2 y 3 de `progress/reviews/remove-var.md`. Solo
comentarios, una entrada de lista y el título de un test: ningún código de
producción cambia y ningún test afirma algo distinto.

### Punto 2 — comentarios que la feature había vuelto falsos

| Archivo | Antes | Ahora |
|---|---|---|
| `src/modules/category-rules/category-rules.types.ts:5` | «travels inside the import report (both ways in)» | «travels inside the import report» |
| `src/modules/transfers/transfers.types.ts:6` | «both import ways call it after their file loop» | «the importer calls it after its file loop» |
| `src/lib/cp1252.ts:33` | «could reach the dump with a scar inside» | «could reach the database with a scar inside» |
| `src/lib/cp1252.test.ts:58` | «no concept reaches the dump with a `U+FFFD` inside» | «no concept reaches the database with a `U+FFFD` inside» |
| `src/lib/parsed-statement.test.ts:111` | «by a consumer reading the JSON dump» | «by whoever reads the parsed statement» |

El quinto no estaba en la lista del leader: salió de la búsqueda que pidió.

```
$ grep -rniE "both ways|two ways in|both import|dump|local cop|dry.run" src vitest.global-setup.ts vitest.setup.ts scripts prisma/*.ts
```

Antes de corregir daba siete líneas: las cinco de la tabla y dos que **no** he
tocado porque siguen siendo ciertas:

- `src/modules/import/import.warnings.service.ts:184` — «The note survives both
  ways»: habla de marcar y desmarcar un descuadre, no de la importación.
- `src/no-real-data.test.ts:119` — «when the same messages lived in the dump of
  …»: está en pasado y cuenta lo que ocurrió en la feature 24.

Comprobado que el cambio en esos cinco archivos es solo de comentario
(`git diff -U0`, líneas que empiezan por `+` o `-`): las diez líneas son las de la
tabla.

### Punto 3 — `src/retired-routes.docs.test.ts`, tercera excepción declarada

- `src/architecture.test.ts`, test `mentions the var folder nowhere in the code`:
  la lista `allowed` gana `'src/retired-routes.docs.test.ts'` con el motivo «it
  looks for the name of that folder in the documents, to check none describes it
  as something of today».
- `src/retired-routes.docs.test.ts`: fuera `const localFolder = ['va',
  'r'].join('')` y el comentario que lo explicaba. El título del test se escribe
  directo y es el mismo texto de antes: `the documents that describe today name no
  retired route nor var/drive-read nor var/parsed`. El patrón
  `localFolderPattern` y las afirmaciones no cambian.

### ./init.sh

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  69 passed (69)
      Tests  1271 passed (1271)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Código de salida: 0. (69 y 1271: los 68 y 1267 del Lote A más el archivo y los
cuatro tests del Lote B.)

### ./init.sh --checks 52

```
[1] … import.service.test.ts import.routes.test.ts          [OK] exit 0
[2] … -t "keeps the importer off the filesystem"            [OK] exit 0
[3] … -t "answers 404 to the eight routes retired…"         [OK] exit 0
[4] … -t "mentions the var folder nowhere in the code"      [OK] exit 0
[5] pnpm exec vitest run src/retired-routes.docs.test.ts    [OK] exit 0
[6] … ingestion.service.test.ts ingestion.routes.test.ts    [OK] exit 0
[7] … -t "has none of the files feature 52 removed"         [OK] exit 0
[8] pnpm test                                               [OK] exit 0
[9] … import.parse-file.test.ts                             [OK] exit 0
[OK]    Checks: 9 de 9 en verde.
```

Código de salida: 0. No se ha tocado ningún `check`, ni la carpeta `var/`, ni se
ha hecho commit.
