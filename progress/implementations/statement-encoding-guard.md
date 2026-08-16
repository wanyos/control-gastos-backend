# statement-encoding-guard (F17) — implementación

> Rechazar el extracto que no venga en UTF-8. Sin spec (`sdd: false`): se trabaja del
> `intent` + `acceptance` de la feature 17 de `feature_list.json`.
> Origen del hallazgo: [`prueba-drive-real-2026-08-15.md`](../prueba-drive-real-2026-08-15.md) §🔴 E.

## Archivos modificados / creados

**Creados**

- [`src/lib/utf8.ts`](../../src/lib/utf8.ts) — `decodeUtf8Strict(content: Buffer): string`.
  El guardián: descodifica en UTF-8 estricto o lanza `NotUtf8Error`.
- [`src/lib/utf8.test.ts`](../../src/lib/utf8.test.ts) — 9 tests del guardián, con los
  bytes escritos en código.

**Modificados**

- [`src/errors/app-error.ts`](../../src/errors/app-error.ts) — clase `NotUtf8Error`
  (código estable `NOT_UTF8`, 422).
- [`src/modules/myinvestor/myinvestor.statement.parser.ts`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L64)
  — `content.toString('utf8')` → `decodeUtf8Strict(content)`, **antes** de buscar la
  cabecera. Es el único cambio de comportamiento del parser.
- [`src/modules/myinvestor/myinvestor.fixture.ts`](../../src/modules/myinvestor/myinvestor.fixture.ts)
  — `buildCp1252StatementCsv()` y `toCp1252()`: el mismo CSV sintético, guardado en
  cp1252. Ningún archivo real se copia; `toCp1252` **lanza** si un carácter no cabe en
  cp1252, para que el fixture sea exactamente los bytes que dice ser.
- [`src/modules/myinvestor/myinvestor.statement.parser.test.ts`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts)
  — bloque nuevo «a file that is not UTF-8» (5 tests).
- [`src/modules/myinvestor/myinvestor.service.test.ts`](../../src/modules/myinvestor/myinvestor.service.test.ts)
  — 2 tests: aislamiento por archivo en un lote mixto, y volcado sin `U+FFFD`.
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts)
  — 1 test: el importador propaga el rechazo como fallo del archivo (`NOT_UTF8`) y **no
  lo mueve** a `procesados/`.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — `lib/utf8.ts` y su test
  añadidos al árbol esperado (ADR-004).
- Documentación: [`docs/architecture.md`](../../docs/architecture.md) (**ADR-018**),
  [`docs/api-contract.md`](../../docs/api-contract.md) (código `NOT_UTF8` en la tabla de
  códigos estables, en la tabla de códigos por archivo de `POST /api/import`, nota nueva,
  bloque 🔴 en §Parser de MyInvestor y `failed[]` de `POST /api/parser/myinvestor`),
  [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) (§«El fichero se
  guarda en UTF-8, siempre»), [`docs/conventions.md`](../../docs/conventions.md)
  (§Parsers de banco: `decodeUtf8Strict` en vez de `toString('utf8')`).

**No tocados, a propósito** (los `que_no_quiero`): esquema Prisma, migraciones,
`myinvestor.product.parser.ts`, `bankinter.parser.ts`, `bankinter.service.ts`. Ninguna
dependencia nueva: `TextDecoder` es de Node.

## Las tres decisiones delegadas

### 1. Cómo se detecta — por los BYTES (`TextDecoder` con `fatal: true`)

El veredicto es «estos bytes no son UTF-8 válido», no «apareció un `�`». Razones:

- Es **el hecho real**. El `�` es la consecuencia de la decodificación, no la causa, y
  mirar la consecuencia obliga a confiar en cómo la produjo `Buffer.toString`.
- Un `U+FFFD` **puede venir legítimamente** en un fichero UTF-8 perfectamente válido que
  ya lo contenga (bytes `ef bf bd`), así que como criterio único sería una heurística con
  falsos positivos.
- `Buffer.toString('utf8')` **no lanza nunca**: hacía falta algo más, y `TextDecoder` con
  `{ fatal: true }` es la vía nativa de Node, sin dependencias.

Hay una **guardia secundaria**: si los bytes son válidos pero el texto contiene `U+FFFD`,
también se rechaza, **con su propio motivo**. No es el criterio principal, es el cierre
del criterio de aceptación «ningún concepto llega al volcado con un carácter de
sustitución»: un `�` dentro de un extracto es la cicatriz de una decodificación fallida
*anterior* (texto ya corrompido antes de llegar aquí), como dice la propia prueba real
—«un `�` en el texto es prueba concluyente de una decodificación fallida»—. El coste es
teórico: un extracto bancario con un `U+FFFD` deliberado no existe.

El motivo nombra el **byte** y la **línea** (`byte 0xD3 no válido en la línea 4`), que es
lo que el humano puede localizar en su editor. El byte que se reporta es siempre el que
**empieza** la secuencia inválida, no el de continuación: para `Ó` en cp1252 sale `0xD3`,
el mismo que midió la prueba, y no el `0x4E` de la `N` siguiente.

### 2. Alcance del rechazo — el FICHERO ENTERO

Coincide con la inclinación del humano, y estas son las razones:

- La codificación es una propiedad **del flujo de bytes**, no de una fila. Si el fichero
  se guardó en cp1252, se guardó entero.
- Un rechazo por filas dejaría pasar **todas las líneas de puro ASCII** y descartaría las
  que llevan acentos. El resultado sería un extracto **con pinta de completo** que no lo
  es: exactamente la clase de fallo silencioso que esta feature existe para eliminar, con
  el agravante de que el número de movimientos ya no cuadraría con el del banco.
- **El arreglo es atómico** —volver a guardar el fichero en UTF-8—, así que la unidad de
  rechazo tiene que ser la misma unidad que se arregla. Rechazar filas dejaría un fichero
  medio importado cuyo reintento sería un lío de duplicados parciales.
- Como el rechazo ocurre **antes** de tocar la base de datos, el importador no mueve el
  fichero a `procesados/` (R10 de la F12): sigue pendiente y se reintenta sin más.

Nota deliberada: la comprobación es **lo primero** que hace el parser, antes incluso de
buscar la cabecera. La cabecera sobrevive a una decodificación mala (se reconoce por su
prefijo ASCII, `bookingDatePrefix`), así que dejarla ir primero volvería a producir el
«parece que fue bien» del hallazgo E.

### 3. Dónde encaja — `src/lib/utf8.ts`, llamado DENTRO del parser

- **En `lib/`, no en el módulo del banco:** la codificación no es un formato. No hay
  conocimiento de ningún banco en `utf8.ts`, así que compartirlo no rompe la norma «un
  parser por banco» (§Parsers de banco), igual que ya se comparte la *forma* de la salida
  en `lib/parsed-statement.ts` (ADR-013). `architecture.test.ts` sigue verde: no nombra
  bancos y el módulo del banco solo importa de `../../lib/`, que ya está permitido.
- **Llamado dentro del parser, no en los servicios:** hay **dos** caminos hacia el parser
  —[`myinvestor.service.ts:189`](../../src/modules/myinvestor/myinvestor.service.ts#L189)
  y [`import.service.ts:268`](../../src/modules/import/import.service.ts#L268)— y los dos
  ya aíslan el fallo por archivo en su `try/catch`. Poniendo el guardián en el único sitio
  por el que los dos pasan, **los dos quedan cubiertos sin duplicar una línea** y sin que
  el importador (que no puede nombrar bancos) tenga que saber nada de esto.
- **Sale como fallo POR ARCHIVO, no de la petición:** `NotUtf8Error` extiende `AppError`,
  así que el aislamiento existente lo convierte en un elemento de `failed[]` (en
  `POST /api/parser/myinvestor`, como `reason` de texto) o de `files[].error`
  (`POST /api/import`, con `code: 'NOT_UTF8'`), **dentro de un 200**. El resto del lote se
  parsea igual.
- **Por qué un código estable nuevo (`NOT_UTF8`, 422) y no `VALIDATION_ERROR`:** es un
  fallo con una acción concreta y distinta («vuelve a guardar el fichero en UTF-8»), que
  el frontend podrá distinguir de «este fichero no es un extracto reconocible». Sigue el
  precedente de `MISSING_ACCOUNT_DATA`: 422, y viaja dentro de un informe de fichero.
- **Idioma del motivo:** el mensaje va en **español**, como el resto de `reason` que lee
  el humano en `failed[]` y en `unparsedRows` (`importe no interpretable…`,
  `extensión no soportada…`). El código, los nombres y los comentarios, en inglés.

## Trazabilidad: criterio de aceptación ↔ test que lo cubre

| # | Criterio de aceptación (F17) | Test que lo cubre |
|---|---|---|
| 1 | Un `.csv` que NO es UTF-8 válido se reporta como fallido, y el motivo dice que no está en UTF-8 y que hay que volver a guardarlo | `utf8.test.ts` › *rejects the file and names the byte, its line and what to do*; `myinvestor.statement.parser.test.ts` › *rejects the whole file and tells the human to save it again as UTF-8*; `myinvestor.service.test.ts` › *reports a statement that is not UTF-8 as a failed FILE…* (comprueba el `reason` en `failed[]`) |
| 2 | El parser NO aprende cp1252 ni ninguna otra codificación: se rechaza, nunca se decodifica ni se repara | `utf8.test.ts` › *never repairs or decodes it as cp1252: nothing is returned at all*; `myinvestor.statement.parser.test.ts` › *never decodes it as cp1252: the accent is not recovered, the file is refused* |
| 3 | Un extracto correcto en UTF-8, con tildes y eñes, se parsea exactamente igual que antes (mismos movimientos, importes, numeración y `unparsedRows`) | `myinvestor.statement.parser.test.ts` › *parses the very same statement, saved properly, exactly as before* (compara el resultado **entero** con el de referencia); y las 32 pruebas previas del parser, intactas |
| 4 | Ningún concepto llega al volcado con un `U+FFFD` dentro | `myinvestor.service.test.ts` › *writes no replacement character to any dump* (mira el JSON volcado de verdad); `myinvestor.statement.parser.test.ts` › *lets no replacement character reach any parsed field*; `utf8.test.ts` › *never returns a string holding a replacement character* + *rejects text that already carries the replacement character* |
| 5 | El fallo sale por el camino POR ARCHIVO (`failed[]` del 200), no como error de la petición; los archivos buenos del lote se parsean igual | `myinvestor.service.test.ts` › *reports a statement that is not UTF-8 as a failed FILE, sparing the rest* (lote de 3: extracto malo + extracto bueno + producto); `import.service.test.ts` › *reports a file its parser refuses for not being UTF-8 with NOT_UTF8, and does not move it* (código `NOT_UTF8`, `movedToProcessed: false`, el otro archivo importado) |
| 6 | NO toca Prisma ni la BD, NO persiste nada, NO cambia el parser de productos `.json` ni el de Bankinter `.xlsx` | Sin cambios en esos archivos (ver §Archivos modificados); `architecture.test.ts` › *keeps the myinvestor parser module free of data access* y *shares no parsing code between bank modules*; las suites de `bankinter` y `myinvestor.product.parser` pasan sin tocarse |
| 7 | El BOM inicial de UTF-8 se sigue tolerando: es UTF-8 válido y no es una codificación mala | `utf8.test.ts` › *keeps a leading BOM instead of editing the text*; `myinvestor.statement.parser.test.ts` › *reads the same result with and without the UTF-8 BOM* (test previo, sigue verde) |
| 8 | Fixtures sintéticos, sin datos reales ni red; `./init.sh` verde con el guardián de la F14 entre los tests | `myinvestor.fixture.ts` (`buildCp1252StatementCsv`, bytes construidos en código); `no-real-data.test.ts` verde; ver §Último `./init.sh` |

## Último `./init.sh`

**2026-08-15, suite completa: 396 tests, 393 pasan, 3 fallan, 0 saltados.** Estado y
tipos OK (`--fast` verde: `tsc --noEmit` sin errores, `feature_list.json` válido).

- **+17 tests** respecto de los 379 de la F15, todos verdes: los 9 de `utf8.test.ts`,
  los 5 del parser, los 2 del servicio de MyInvestor y el 1 del importador.
- Las 26 suites restantes pasan; **el guardián de la F14 corrió con su capa de
  comparación activa** (no se saltó: `var/` está presente y completa).

### 🔴 Los 3 tests rojos NO son de esta feature — bloquean el cierre

Los tres son de [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) (el guardián
de la F14) y **ninguno señala un archivo escrito o modificado por la F17**. Comprobado
además contra el árbol limpio: `git stash -u` + `vitest run src/no-real-data.test.ts`
deja el guardián **igualmente rojo**. La causa es que la prueba real del 2026-08-15 dejó
capturas nuevas en `var/`, y varios documentos versionados **anteriores** repiten ahora
datos que han pasado a ser reales.

| Test | Ofensores (todos ajenos a la F17) |
|---|---|
| *versions no well-formed Spanish IBAN…* | `progress/prueba-drive-real-2026-08-15.md:204` — **el IBAN real del humano, con checksum válido, versionado en `progress/`** |
| *repeats no telling amount…* | `progress/prueba-drive-real-2026-08-15.md` (12 líneas con importes reales del humano) y `feature_list.json:684` (el `intent` de la **F16**, que citaba su saldo real) |
| *copies no telling phrase…* | `docs/api-contract.md`, `docs/data-model.md`, `docs/myinvestor-product-files.md`, `specs/investments-data-model/design.md`, `specs/myinvestor-products/design.md` y `progress/prueba-drive-real-2026-08-15.md` — todas por «el nombre del ejemplo de la plantilla» / `producto-de-ejemplo` |

Las dos naturalezas son distintas y merecen respuestas distintas (ambas **fuera del
scope de la F17**, por eso no se han tocado):

1. **Aciertos de verdad, no falsos positivos:** el informe de la prueba real y el
   `intent` de la F16 llevan el **IBAN real**, el **saldo real** y varios importes reales
   del humano, en archivos versionados. Es exactamente lo que la F14 existe para impedir.
   Toca sanearlos (inventar los números, recortar el IBAN) igual que la F14 saneó el
   histórico; no lo hace la F17 porque son el informe de otro agente y el `intent` de otra
   feature, y cambiar el `intent` de la F16 sin el humano no me corresponde.
2. **Falso positivo, y con gracia:** «el nombre del ejemplo de la plantilla» es el **ejemplo de la
   plantilla** de `docs/myinvestor-product-files.md`. Aparece en `var/` porque el humano
   subió su ETF de oro **sin editar el nombre del ejemplo** (hallazgo 🔴 D de la misma
   prueba): el dato real copió a la documentación, no al revés. La salida documentada en
   `docs/conventions.md` §Tests es un `no-real-data-ok` **por línea con su motivo**, y se
   cerrará sola en cuanto el humano corrija su archivo y se rehaga la captura.

## Sugerencias fuera de scope (NO aplicadas)

1. **El JSON de producto se lee con `readFile(path, 'utf8')`**
   ([`myinvestor.service.ts:132`](../../src/modules/myinvestor/myinvestor.service.ts#L132)),
   que tiene exactamente el mismo silencio que `toString('utf8')`. Hoy no ha dado
   problemas (el humano los escribe en UTF-8) y el `que_no_quiero` de la F17 pide no tocar
   el formato del JSON de producto, así que **no se ha cambiado**. Es un `readFile` sin
   encoding + `decodeUtf8Strict` cuando se quiera cerrar del todo.
2. Los otros dos hallazgos de la prueba real siguen abiertos: **motivo de la coma decimal
   en el JSON** (§A) y **archivo nativo de Google mal reportado como `Cannot reach Google
   Drive`** (§B). Candidatos a feature propia.
3. **F16 `statement-balance`** (pendiente) tocará este mismo parser para leer la línea
   `saldo;…` del preámbulo. No hay conflicto con lo de aquí.
