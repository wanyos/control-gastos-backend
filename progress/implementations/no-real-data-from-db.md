# no-real-data-from-db — implementación

Feature 51, Lote A (único), tasks T1 a T13. Implementado el 2026-10-02.

## Bloqueo devuelto en la primera entrega, ya resuelto

El comentario de `src/modules/trade-republic/trade-republic.fixture.ts` (líneas 14 a
17) nombraba `unwatchedBanks`, que ya no existe, y el archivo no era del lote. El
leader decidió el 2026-10-02 añadirlo al Lote A **solo para ese comentario**
(`AGENTS.md` §3: lo viejo se quita en la misma sesión). Corregido: el comentario dice
ahora que el guardián compara contra la base de datos y no lee ese `.pdf`. No se ha
tocado código de ese archivo.

## Archivos modificados / creados

Creados:

- `src/lib/test-real-data.ts` — `RealDataReference`, `comparedColumns`,
  `notComparedColumns`, `withReadOnlyClient`, `readRealDataReference`.
- `src/lib/test-real-data.test.ts` — 4 tests.

Modificados:

- `vitest.global-setup.ts` — recibe `project`, lee las columnas comparadas de la base
  del humano con `readRealDataReference(realDatabaseUrl)` y hace
  `project.provide('realDataReference', …)`. Cabecera corregida. La comparación de
  antes y después de la base y la de `var/` no se han tocado.
- `src/no-real-data.test.ts` — la comparación usa `inject('realDataReference')`;
  borrado todo lo de `design.md` §5. Queda con 36 tests.
- `src/modules/trade-republic/trade-republic.fixture.ts` — solo el comentario de
  cabecera (añadido al lote por el leader).
- `src/modules/investments/investments.deposits.test.ts`,
  `src/modules/transfers/transfers.service.test.ts` — un importe inventado cada uno.
- `progress/history.md`, `progress/summaries/drive-connection.md`,
  `progress/reviews/data-model.md`, `progress/reviews/import-run-totals.md`,
  `progress/explorations/prueba-real-importacion-2026-09-12.md`,
  `specs/20-trade-republic-product-file/decisions.md` — las líneas que coincidían.
- `docs/conventions.md`, `docs/architecture.md`, `docs/data-model.md`,
  `docs/trade-republic-product-files.md`, `docs/myinvestor-product-files.md`.
- `specs/51-no-real-data-from-db/tasks.md` (las 13 marcadas), `progress/current.md`.

No se ha añadido ningún fixture `.xls` ni `.pdf` (lección 3 de `docs/lessons.md`).
No se ha hecho commit ni se ha tocado `feature_list.json`.

## Decisiones tomadas

1. **DESVIACIÓN DEL DESIGN, aceptada por el leader el 2026-10-02: los importes
   escritos dentro de un `ImportUnparsedRow.reason` también se comparan.** `design.md` §4 dice que los importes salen de `amounts`; T7 y R6 piden
   que «los importes de dentro del mensaje sigan saltando». He hecho las dos cosas:
   `comparisonOf` une los importes de las columnas de dinero con los que `amountsOf`
   saca de cada mensaje. Es más vigilancia, no menos, y no contradice `decisions.md`.
2. **`versionedFiles` ya no llama a `existsSync`.** Para que de `node:fs` queden solo
   `readFileSync` y `writeSync` (R1, T8), el archivo que git lista pero está borrado
   del árbol de trabajo se descarta en `versionedSources`, al dar `ENOENT` la lectura.
   Cualquier otro error de lectura se relanza.
3. **Si `vitest.global-setup.ts` no entrega nada, los tres tests de comparación
   fallan** con un mensaje que lo dice, en vez de tratarlo como base vacía. Base vacía
   son cuatro listas vacías; que no llegue nada es un cableado roto.
4. **El tipo del parámetro `project` del global setup es una interfaz local** con el
   único método que usa (`provide`): `tsconfig.json` no tipa ese archivo y la
   declaración de la clave vive en `src/no-real-data.test.ts`, como pide `design.md` §2.
5. **En `docs/data-model.md` se han quitado el comentario y las dos marcas
   `no-real-data-ok`** del enum. Comprobado: sin las marcas, el guardián no señala esas
   dos líneas contra la base (`pnpm exec vitest run src/no-real-data.test.ts` → 36
   passed). La coincidencia era solo con `var/`.
6. **En la hoja de la feature 20** la coincidencia se ha quitado cambiando el orden de
   dos palabras de la frase, no sustituyendo una: el sentido queda igual.
7. **El importe inventado de `transfers.service.test.ts` se cambió dos veces:** el
   primer valor nuevo también coincidía con la base. Es el caso que `decisions.md` 📌
   avisa para los importes de menos de cien euros.

## Trazabilidad

Tests de `src/no-real-data.test.ts` salvo donde se dice otro archivo.

- R1 → `imports nothing that can list or walk a folder`
- R2 → `reads the compared columns of a database` (`src/lib/test-real-data.test.ts`);
  y los tres tests de comparación, que fallan si el global setup no entrega nada
- R3 → `rejects a write through the read-only connection`
  (`src/lib/test-real-data.test.ts`)
- R4 → `catches an amount of the database copied into a versioned file`;
  `compares an amount by its absolute value, and leaves a short or round one out`;
  `repeats no telling amount of the database`
- R5 → `catches a concept of the database copied into a versioned document`;
  `copies no telling phrase of the database`
- R6 → los trece tests de `the guardian tells our own words from his data inside a
  message (feature 24)`, entre ellos `reports NOTHING about a rejection message of ours
  that the documentation publishes`, `KEEPS WATCHING a value of his echoed inside the
  message, quoted`, `KEEPS WATCHING a value of his echoed WITHOUT quotes: the second
  condition`, `KEEPS WATCHING a value of his with an APOSTROPHE inside single quotes` y
  `KEEPS WATCHING the five amounts that live inside that same message`
- R7 → `catches an IBAN of the database copied into a versioned file`;
  `compares neither of the two documented synthetic IBANs, even if an account has one`;
  `repeats no IBAN of the database`
- R8 → `says nothing about an invented amount, concept or IBAN that is not in the database`
- R9 → las aserciones `not.toContain` de los tres `catches …`
- R10 → `reads an empty reference from a database with no application tables`
  (`src/lib/test-real-data.test.ts`); `skips the comparison and says so when the
  database has nothing to compare against`
- R11 → `skips the comparison and says so when the database has nothing to compare
  against`, y la pasada provocada de más abajo
- R12 → `versions no well-formed Spanish IBAN other than the documented synthetic ones`
  (sin tocar); `recognizes a real Spanish IBAN and rejects a malformed one`
- R13 → `keeps the path and marker exceptions for amounts and phrases, never for an
  IBAN`; `is not on its own exception list: it guards itself like any other file`
- R14 → `holds the inventory of money and text columns EXACTLY, so a new column turns
  it red` (`src/lib/test-real-data.test.ts`)
- R15 → **no tiene test**: son documentos. Lo que hay es el `git grep` de la sección
  siguiente.

## Documentos actualizados

`git grep` lanzados fuera de `progress/`, `specs/` y `feature_list.json`:

```
git grep -n -E "captureRoot|looksBinary|decodeCapture|readCapture|allFiles|captureFiles|looksLikeMarkup|markupText|captureBranches|missingCaptureBranches|comparisonUnavailable|captureContent|captureText|capturePhraseSources|fileNameKeys|bankCoverage|unwatchedNow|unwatchedBanks|unwatchedAnnouncement|announceUnwatched|publishedFilenames|letThrough|ourProseKeys"
git grep -n -i -E "capturas de .var|contra .var/|comparaci[oó]n contra|var/parsed.*guardi|guardi.*var/"
git grep -n "no-real-data\|Convención recomendada"
```

Corregido:

- `docs/conventions.md` §Tests: el punto «Los datos reales viven en…» y todo el bloque
  del guardián (de dónde salen los datos, qué mira, qué no caza, base vacía, columna
  nueva). Quitados los puntos de la F23 y de la F34; el de la F24 queda referido a
  `ImportUnparsedRow.reason`. §Tests con base de datos: el global setup lee además las
  columnas comparadas, en solo lectura.
- `docs/architecture.md`: línea «Revisado el 2026-10-02 por la feature 51» encima del
  ADR-017 y encima del ADR-027. Los ADR no se han reescrito: las menciones a
  `unwatchedBanks`, `fileNameKeys` y `letThrough` que quedan están dentro del cuerpo de
  los ADR-017 y ADR-024, y la línea de revisión dice que son historia.
- `docs/data-model.md`: el comentario «colisiona con `var/`» y sus dos marcas.
- `docs/trade-republic-product-files.md`: quitada la nota «Esta línea la lee un test».
- `docs/myinvestor-product-files.md`: quitada la nota «Ojo con el guardián».

Líneas que salen en el `git grep` y se dejan, con el motivo:

- `src/lib/test-var.ts` tiene su propia función `allFiles`: es otra, no la del guardián.
- `docs/roadmap.md` (una línea, «al haber capturas nuevas en `var/`») y
  `docs/verification.md` (dos líneas): cuentan lo que pasó en features cerradas.
- `docs/lessons.md` entrada 3: sigue siendo cierta (leído en el código:
  `scannedExtensions` no incluye `.xls` ni `.pdf`).
- `docs/architecture.md`: las seis menciones a `unwatchedBanks`, `fileNameKeys` y
  `letThrough` están en la línea de revisión nueva o dentro del cuerpo de los ADR-017 y
  ADR-024, que no se reescriben.

Segunda pasada del `git grep`, pedida por el leader, con la lista ampliada
(`publishedFilenameOf`, `compilePublishedFilename`, `isPublishedDoc`,
`datePlaceholder`, `maxCaptureBytes`, `temporaryCaptureRoot`, `writeCapture`): la
única línea falsa era la de `src/modules/trade-republic/trade-republic.fixture.ts`,
ya corregida. **Ninguna referencia en código fuera del lote.**

## Prueba real

Hecha el 2026-10-02 con la base del humano, leída solo por
`vitest.global-setup.ts` por la conexión de solo lectura. Solo recuentos; ningún
valor se ha impreso ni escrito.

Los recuentos se sacaron añadiendo una línea temporal a `src/no-real-data.test.ts`
que escribía al descriptor 2 los tamaños de las listas, lanzando
`pnpm exec vitest run src/no-real-data.test.ts` y restaurando el archivo.

| Qué | Recuento |
|---|---|
| Valores distintos leídos de las columnas de dinero | 1445 |
| De ellos, importes comparables | 1065 |
| Valores distintos leídos de las columnas de texto | 499 |
| Frases comparables que salen de ellos | 336 |
| Filas de `ImportUnparsedRow.reason` | 0 |
| IBAN | 5 (uno no es español) |

Los tres recuentos comparables coinciden con los medidos en `design.md` §3.
Con `ImportUnparsedRow.reason` en cero filas, **R6 no está probado con datos
reales**, solo con datos inventados.

Coincidencias del repositorio contra la base:

| Momento | Importes | Frases | IBAN |
|---|---|---|---|
| Antes de T11 (`pnpm exec vitest run src/no-real-data.test.ts src/lib/test-real-data.test.ts`: 2 failed, 38 passed) | 8 líneas | 2 líneas seguidas (una frase) | 0 |
| Después de T11 (`pnpm exec vitest run src/no-real-data.test.ts`: 36 passed) | 0 | 0 | 0 |

Las diez líneas eran las de `design.md` §6, en los mismos archivos. La línea de
`progress/explorations/prueba-real-importacion-2026-09-12.md` queda sin ninguna cifra.
Ninguna se arregló con la marca `no-real-data-ok`.

Ese rojo de antes de T11 lo vi con `vitest run`, no con `./init.sh`, y **no capturé el
código de salida**. No lo he vuelto a provocar: haría falta volver a escribir en un
archivo versionado un valor que está en la base.

### El aviso con la base sin datos, provocado a propósito

`./init.sh` entero con `DATABASE_URL` apuntando a `gastos_test_template` (migrada y
sin filas, del mismo servidor; la base del humano no se abre en esa pasada).
Código de salida: `0`. Líneas donde se ve el aviso:

```
[no-real-data] THE DATABASE HAS NOTHING TO COMPARE AGAINST FOR: amounts
[no-real-data]   that comparison was SKIPPED on this run: a datum of that kind copied into the repository is not caught by it.
[no-real-data]   the check of Spanish IBANs by their shape did run: it needs no database.
[no-real-data] THE DATABASE HAS NOTHING TO COMPARE AGAINST FOR: phrases
(las mismas dos líneas)
[no-real-data] THE DATABASE HAS NOTHING TO COMPARE AGAINST FOR: IBAN
(las mismas dos líneas)
 Test Files  76 passed (76)
      Tests  1382 passed | 3 skipped (1385)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### La columna sin decidir, provocada a propósito

Quitando temporalmente la entrada `ImportBalanceMismatch.check` de
`notComparedColumns` y lanzando
`pnpm exec vitest run src/lib/test-real-data.test.ts -t "holds the inventory"`:
1 failed, con `expected [ 'ImportBalanceMismatch.check' ] to deeply equal []`.
Archivo restaurado después. No lo he probado añadiendo una columna de verdad a
`prisma/schema.prisma`: ese archivo no es del lote.

### Lo que no se ha comprobado

- Que la suite funciona con la carpeta `var/` borrada de verdad: no la he borrado (es
  del humano y la feature 52 la necesita). Lo que hay es el test de los nombres
  importados de `node:fs`.
- Que la suite no arranca si PostgreSQL no responde: habría que pararlo.

## Último ./init.sh

Lanzado después del último cambio de código y de documentos. Código de salida `0`.

```
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  76 passed (76)
      Tests  1385 passed (1385)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Punto de partida: 75 archivos y 1393 tests. Ahora 76 archivos (el nuevo
`src/lib/test-real-data.test.ts`) y 1385 tests: el guardián pierde los tests de lo
borrado en `design.md` §5 y gana los de T6 a T10.

La comprobación de `vitest.global-setup.ts` que compara la base del humano antes y
después de la suite no dio ningún aviso en esa pasada.

## Último ./init.sh --checks

`./init.sh --checks 51`, código de salida `0`:

```
$ pnpm exec vitest run src/no-real-data.test.ts -t "catches an? (amount|concept|IBAN) of the database" | grep -E "Tests +3 passed"
[OK] exit 0      Tests  3 passed | 33 skipped (36)
$ … -t "says nothing about an invented amount, concept or IBAN that is not in the database" …
[OK] exit 0      Tests  1 passed | 35 skipped (36)
$ … -t "imports nothing that can list or walk a folder" …
[OK] exit 0      Tests  1 passed | 35 skipped (36)
$ pnpm exec vitest run src/lib/test-real-data.test.ts -t "rejects a write through the read-only connection" …
[OK] exit 0      Tests  1 passed | 3 skipped (4)
$ pnpm test
[OK] exit 0
$ … -t "skips the comparison and says so when the database has nothing to compare against" …
[OK] exit 0      Tests  1 passed | 35 skipped (36)
$ … -t "versions no well-formed Spanish IBAN other than the documented synthetic ones" …
[OK] exit 0      Tests  1 passed | 35 skipped (36)
[OK]    Checks: 7 de 7 en verde.
```

## Sugerencias fuera de scope (NO aplicadas)

- El título del ADR-017 sigue diciendo «comparación contra `var/`» (ya está en
  `decisions.md` como incoherencia heredada).
- El test `has the local captures gitignored, so a capture is never versioned` y la
  frase de `docs/verification.md` sobre `var/drive-read/` son de la feature 52.
