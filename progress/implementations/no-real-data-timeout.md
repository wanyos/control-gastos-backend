# no-real-data-timeout — implementación

Tarea de mantenimiento sin feature en `feature_list.json`: que
`src/no-real-data.test.ts` deje de fallar de vez en cuando por el límite de 5 s
(revisión del 2026-11-04, `progress/reviews/audit-2026-11-04.md`, «Paso 2»).

No se ha escrito nada en la base del humano ni en sus carpetas. La única lectura
de la base fue la de la prueba del punto «Lo que vigila sigue igual», con la
conexión de solo lectura de `src/lib/test-real-data.ts`.

## Por qué tardaba: mediciones

Mediciones con un test temporal añadido al final del archivo (ya quitado), que
cronometraba cada parte con `performance.now()`, el archivo lanzado solo, dos
pasadas:

| Parte | Pasada 1 | Pasada 2 |
|---|---|---|
| `git ls-files` (666 archivos, 154 175 líneas, 8,4 MB) | 22 ms | 23 ms |
| Leer los 666 archivos | 75 ms | 74 ms |
| Vocabulario de nuestro código (`ownSourceVocabulary`) | 14 ms | 14 ms |
| Recorrido de importes | 101 ms | 109 ms |
| **Recorrido de frases (ventana de 2 líneas)** | **1305 ms** | **1419 ms** |
| Recorrido de IBAN | 196 ms | 189 ms |
| Recorrido vacío con ventana 2 (solo trocear y unir líneas) | 57 ms | 66 ms |
| `trigramsOf` sobre cada línea, una vez | 685 ms | 692 ms |

Datos de la referencia en esas pasadas: 1121 importes, 344 frases, 5 IBAN.

Conclusiones medidas:

- El coste está en **el recorrido de frases**, no en git ni en la base. Con la
  ventana de 2 líneas, cada línea se partía en palabras **dos veces** (como parte
  de su trozo y del trozo anterior): 2 × ~690 ms ≈ los 1,3-1,4 s del total.
- Dentro de eso, `words()` sola se llevaba 550-579 ms en una pasada por todas las
  líneas (`toLowerCase` + `replace(/[^\p{L}]+/gu, ' ')` + `split` + `filter`).
  Con `toLowerCase().match(/\p{L}+/gu)` tardaba 279-282 ms, y daba **las mismas
  palabras en las 154 175 líneas** (0 líneas distintas, comparado una a una).
- Construir el texto de cada trío de palabras para buscarlo en el conjunto costaba
  ~350 ms; construyéndolo solo cuando la primera palabra empieza alguna frase de
  la referencia, 130-151 ms.
- Además, cada uno de los cuatro recorridos del repositorio y el vocabulario de
  nuestro código volvían a lanzar `git ls-files` y a leer los 666 archivos
  (~100 ms cada vez).

## Archivos modificados / creados

- `src/no-real-data.test.ts` (único archivo de código tocado).
- `progress/implementations/no-real-data-timeout.md` (este informe).

`src/lib/test-real-data.ts`, `vitest.config.ts`, `package.json` y
`pnpm-lock.yaml` no se han tocado.

## Qué se ha cambiado

1. **`words()`**: una sola `match(/\p{L}+/gu)` sobre el texto en minúsculas, en
   vez de `replace` + `split` + `filter`. Mismo resultado (medido arriba).
2. **`versionedSources()`** lee los archivos **una vez por pasada del archivo de
   test** y la guarda en una variable del módulo; la lectura pasa a
   `readVersionedSources()`. La usan los cuatro recorridos y el vocabulario de
   nuestro código.
3. **`scanSources()`** le pasa a la función que comprueba cada trozo, además del
   texto unido, sus líneas por separado (tipo nuevo `LineCheck`). Las de importes
   y de IBAN no cambian: siguen usando el texto unido.
4. **`phraseLeak()`**:
   - parte cada línea en palabras una sola vez (guardadas en un `Map` por línea) y
     las palabras del trozo son las de sus líneas una detrás de otra. Es lo mismo
     que partir el texto unido, porque el espacio que une las líneas no es una
     letra;
   - solo construye el trío cuando su primera palabra es la primera de alguna
     frase de la referencia; si no lo es, ese trío no puede estar en el conjunto.

   Si se la llama sin líneas, usa `[text]`, así que sigue valiendo igual para un
   texto suelto.
5. **Test nuevo**: `catches a concept of the database split across two lines,
   however it is punctuated`. Comprueba con un concepto inventado, partido en dos
   líneas y con signos en medio, que la ventana de 2 líneas lo detecta y que línea
   a línea no.

**No se ha puesto un límite de tiempo propio**: con la suite entera en marcha, el
test más lento tarda ahora 0,98 s y 1,34 s (ver «Comprobación»), frente a los
5,4-7,4 s de las pasadas en rojo de la revisión.

## Lo que vigila sigue igual

**a) Mismo resultado que el código anterior, sobre el repositorio real.** Test
temporal (ya quitado) que llevaba una copia literal del `words()` +
`trigramsOf` + `phraseLeak` anteriores y comparaba la lista de avisos completa
de los dos sobre los 666 archivos reales, con ventana 1 y 2. Dos referencias: la
de la base (344 frases) y otra hecha con 1 de cada 50 tríos del propio
repositorio (18 314 frases), para que hubiera muchos avisos que comparar:

```
EQUIV real window=1 phrases=344 old=0 new=0 same=true
EQUIV real window=2 phrases=344 old=0 new=0 same=true
EQUIV sample window=1 phrases=18314 old=61735 new=61735 same=true
EQUIV sample window=2 phrases=18314 old=92931 new=92931 same=true
      Tests  38 passed (38)
```

**b) Un dato prohibido de verdad en un archivo temporal.** Un script en la
carpeta temporal de la sesión (fuera del repo) leía la base con
`readRealDataReference` (conexión de solo lectura), cogía **un** valor del tipo
pedido y lo escribía en `probe-no-real-data.tmp.md` en la raíz del repo, sin
añadirlo a git (comprobado con `git check-ignore` que no estaba ignorado, para
que el test lo leyera). El valor no se imprimió en ningún momento: solo
`found=true`. Después se lanzaba el test y se borraba el archivo. Una pasada por
tipo:

| Tipo metido | exit | Test en rojo | Aviso (solo archivo y línea) |
|---|---|---|---|
| un importe | 1 | `repeats no telling amount of the database` | `probe-no-real-data.tmp.md:3 — an amount on this line is in the database…` |
| un texto | 1 | `copies no telling phrase of the database` | `probe-no-real-data.tmp.md:2` y `:3 — a three-word sequence copied from the database…` |
| un IBAN | 1 | `repeats no IBAN of the database` | `probe-no-real-data.tmp.md:3 — an IBAN of the database is on this line…` |

En cada pasada, los otros dos tests de la base salieron en verde. Al terminar, `ls
probe-no-real-data.tmp.md` → `No such file or directory`, y `git status --short`
no lo lista.

## Comprobación

### El test solo, 3 veces, `--reporter=verbose`

Antes del cambio (mismo equipo, misma sesión):

| Pasada | importes | frases | IBAN | Duración del archivo |
|---|---|---|---|---|
| 1 | 285 ms | 1272 ms | 226 ms | 2,89 s |
| 2 | 325 ms | 1358 ms | 272 ms | 2,98 s |
| 3 | 284 ms | 1349 ms | 244 ms | 2,79 s |

Después del cambio (versión final, ya formateada):

| Pasada | importes | frases | IBAN | Duración del archivo |
|---|---|---|---|---|
| 1 | 119 ms | 504 ms | 157 ms | 1,64 s |
| 2 | 114 ms | 487 ms | 150 ms | 1,60 s |
| 3 | 122 ms | 526 ms | 162 ms | 1,71 s |

`Tests  37 passed (37)` en las tres (36 de antes + el nuevo).

### Los mismos tests con la suite entera en marcha (`pnpm exec vitest run --reporter=verbose`)

| Pasada | importes | frases | IBAN | Duración de la suite |
|---|---|---|---|---|
| 1 | 269 ms | 982 ms | 311 ms | 49,41 s |
| 2 | 334 ms | 1336 ms | 412 ms | 59,17 s |

Las dos con `Tests  1516 passed (1516)`.

### `./init.sh`, 5 veces seguidas

| # | Fin (UTC) | exit | Resultado | Duración de vitest |
|---|---|---|---|---|
| 1 | 16:27:44 | 0 | 93 archivos, 1516 en verde | 26,53 s |
| 2 | 16:28:18 | 0 | 93 archivos, 1516 en verde | 25,42 s |
| 3 | 16:28:52 | 0 | 93 archivos, 1516 en verde | 25,49 s |
| 4 | 16:29:37 | 0 | 93 archivos, 1516 en verde | 36,67 s |
| 5 | 16:30:35 | 0 | 93 archivos, 1516 en verde | 37,54 s |

La duración total de cada `./init.sh` no la tengo: el comando que la calculaba
(`bc`) no existe en este equipo. La columna es la línea `Duration` de vitest. En
las cinco, `tsc`, `pnpm run lint` y `pnpm run format:check` en verde.

No ha salido ningún otro rojo (tampoco el de las filas de más en las bases de
test del paso 1), así que no se ha añadido nada a
`progress/explorations/init-intermitente-2026-11-04.md`.

## Documentos actualizados

```
$ git grep -n -E "scanSources|phraseLeak|versionedSources|trigramsOf" -- ':!progress' ':!specs'
```

Solo aparece `src/no-real-data.test.ts`. Ningún documento nombra lo que ha
cambiado; no hay nada que corregir.

## Sugerencias fuera de scope (NO aplicadas)

- Ninguna.

## Segunda pasada — cambio requerido 3 de la revisión

`progress/reviews/no-real-data-timeout.md`, cambio 3: el bloque de `LineCheck`
(su comentario y el `type`) había quedado entre el comentario
`/** Runs \`check\` over every line… */` y `function scanSources`. Se ha movido
encima de ese comentario, que vuelve a quedar pegado a `function scanSources`.
No cambia código: solo el orden de esas líneas en `src/no-real-data.test.ts`.

Los cambios 1 y 2 de la revisión no se han tocado en esta pasada.

Comprobación tras el cambio:

```
$ pnpm exec vitest run src/no-real-data.test.ts --reporter=verbose
 ✓ … repeats no telling amount of the database 313ms
 ✓ … copies no telling phrase of the database 1186ms
 ✓ … repeats no IBAN of the database 389ms
      Tests  37 passed (37)
   Duration  3.85s
exit 0

$ pnpm run lint
$ oxlint
exit 0

$ pnpm exec prettier --check src/no-real-data.test.ts
All matched files use Prettier code style!
```

En esta pasada el test de frases ha tardado 1186 ms, más que los 487-526 ms de
las tres pasadas de arriba. No he comprobado por qué; el cambio de esta pasada
solo mueve un comentario y un `type`, que no se ejecutan. Para saberlo habría que
repetir las tres pasadas con el equipo sin otra carga y comparar.
