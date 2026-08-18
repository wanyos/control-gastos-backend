# n26-statement (F18) — implementación

> Feature sin spec (`sdd: false`): se trabajó del bloque `intent` y de los **13
> criterios de `acceptance`** de `feature_list.json`. Tercer banco del repo y
> **primer fichero que exige un lector de CSV de verdad**.
>
> 🔒 Todo lo que aparece en tests y documentación es **sintético**. La muestra real
> vive en `var/drive-read/`, gitignoreada: se leyó para entender la forma
> (separadores, comillas, nº de columnas, recuentos), y ni un dato suyo se ha
> escrito en un archivo versionado.

## Archivos modificados / creados

**Nuevos — `src/modules/n26/`**

| Archivo | Qué es |
|---|---|
| [`n26.csv.ts`](../../src/modules/n26/n26.csv.ts) | Lector de CSV **con comillas** de este banco: comas y saltos de línea dentro de un campo, `""` como comilla literal, `\r\n`/`\n`, y el **nº de línea 1-based** de cada registro |
| [`n26.format.ts`](../../src/modules/n26/n26.format.ts) | Números y fechas de este banco: `parseBankAmount` (estricto, punto decimal), `parseHandwrittenAmount` (la línea que escribe el humano) y `parseIsoStatementDate` (ISO + día real) |
| [`n26.statement.parser.ts`](../../src/modules/n26/n26.statement.parser.ts) | El parser: `Buffer` → `ParsedStatement<'n26'>`. Puro, sin BD ni Drive |
| [`n26.types.ts`](../../src/modules/n26/n26.types.ts) | Solo lo suyo: `N26StatementResult = ParsedStatement<'n26'>` y los tipos del run local |
| [`n26.service.ts`](../../src/modules/n26/n26.service.ts) | Recorre `var/drive-read/n26/<año>/`, parsea los `.csv` y vuelca JSON a `var/parsed/` |
| [`n26.routes.ts`](../../src/modules/n26/n26.routes.ts) | `POST /api/parser/n26` |
| [`n26.fixture.ts`](../../src/modules/n26/n26.fixture.ts) | Fixtures **sintéticos en memoria**: constructor del CSV (entrecomillando solo lo que hace falta), variante cp1252 y las dos líneas de preámbulo |
| `n26.csv.test.ts`, `n26.format.test.ts`, `n26.statement.parser.test.ts`, `n26.service.test.ts`, `n26.routes.test.ts` | 78 tests nuevos |

**Modificados**

- [`src/app.ts`](../../src/app.ts): import del parser y de las rutas, **una línea**
  en el registro (`{ bank: 'n26', extensions: ['.csv'], parse: parseN26Statement }`)
  y `app.register(n26Routes, { prefix: '/api/parser' })`.
- [`src/architecture.test.ts`](../../src/architecture.test.ts): los 12 archivos del
  módulo en el árbol esperado, guardián «sin Prisma» para el módulo nuevo, el
  guardián de «un parser por banco» **generalizado a los tres bancos** (antes solo
  recorría uno de ellos) y `normalizeBankName('N26') === 'n26'` con su carpeta.
- `docs/api-contract.md`: §Parser de N26 completa (endpoint, modelo, reglas), la
  tabla de los dos «saldos», la nota de `NOT_UTF8` y qué bancos lee hoy el
  importador.
- `docs/dar-de-alta-un-banco.md`: «un CSV no es *el* CSV» (separador y comillas),
  N26 en el IBAN a mano y en el saldo, y en la sección de UTF-8.
- `docs/conventions.md`: el lector del formato es del banco aunque el algoritmo sea
  genérico; el preámbulo va con `;` sea cual sea el separador; dirección de export
  de cada banco.
- `docs/architecture.md`: **ADR-020**.
- `feature_list.json`: F18 a `in_progress`. `progress/current.md`: plan y estado.

## Segunda pasada — corregido lo que pidió el reviewer (2026-08-17)

Veredicto de la primera revisión: **CHANGES_REQUESTED**
([`reviews/n26-statement.md`](../reviews/n26-statement.md)), dos puntos. Los dos
arreglados; **el fallo estaba en el código, no en la documentación**.

### 🔴 1. El saldo escrito a la española perdía los céntimos, en silencio

**Qué pasaba.** La línea de preámbulo **no es una fila de la tabla del banco**:
la escribe el humano, a mano y con `;`. Pero el lector de CSV la partía por la
**coma de la tabla** antes de que nadie la mirase, y el buscador de etiquetas solo
leía `record.cells[0]`. Con `Saldo;1.234,56` el lector devolvía dos celdas
(`Saldo;1.234` y `56;;;`) y el buscador se quedaba con la primera: salía `1234` en
vez de `1234.56`, **sin una línea en `unparsedRows`**. Exactamente el fallo callado
que existen para evitar la F16 y la F17. Solo se salvaba `1500,00` — de casualidad,
porque sus céntimos son `00`—, que es justo el valor que usaban todos mis tests.

**Cómo se ha arreglado.** La línea se lee **entera**, del texto tal cual está
escrito, y nunca de una celda:

1. [`n26.csv.ts`](../../src/modules/n26/n26.csv.ts) — `CsvRecord` gana el campo
   **`raw`**: el registro exacto como está en el fichero, sin terminador y sin
   deshacer nada (comillas, separadores y espacios siguen ahí). Se calcula con el
   desplazamiento donde empieza cada registro, así que no es una reconstrucción
   aproximada: es el texto.
2. [`n26.statement.parser.ts`](../../src/modules/n26/n26.statement.parser.ts) —
   `findPreambleLine` trabaja sobre `record.raw`. La **etiqueta** es lo que hay
   antes del **primer** separador (`;` o `,`, el que aparezca antes) y el
   **valor** es **todo el resto de la línea**. Como el corte es solo el primero,
   una coma decimal posterior es parte del valor y no lo parte.
3. `cleanPreambleValue` sigue quitando el relleno del **final** (`;;;`, `,,,`,
   comillas) y **solo del final**: un separador en medio pertenece al valor.

**Efecto colateral bueno:** ahora la variante con coma también conserva los
céntimos (`Saldo,1.234,56` → `1234.56`); antes habría dado `1234` igualmente.

**Lo que NO se tocó:** la documentación. `docs/api-contract.md` y
`docs/dar-de-alta-un-banco.md` decían que la forma española funciona; era la
documentación la que tenía razón y el código el que mentía.

### 2. Los tests no podían ver ese fallo

Todas las aserciones de integración usaban `1500,00`, cuyos céntimos son cero.
Corregido para que el agujero no pueda reabrirse:

- `n26Preamble()` **ya no tiene los céntimos a cero**: su valor por defecto pasa a
  `1.234,56`, con una nota en el fixture explicando por qué **no** se debe
  redondear otra vez. Los cinco tests de integración que dependían de él exigen
  ahora el número completo (`n26.statement.parser.test.ts`, `n26.service.test.ts`,
  `n26.routes.test.ts`).
- Test nuevo **`keeps the cents of a balance written the Spanish way, with ;`**,
  con cinco casos, todos con céntimos distintos de cero: `Saldo;1.234,56`,
  `Saldo;250,75`, `Saldo;1.234,56;;;`, `saldo;-2.000,05` y `Saldo;1234.56`. Cada
  uno exige además que **no** haya nada en `unparsedRows` (nada se perdió en
  silencio) y que el fichero se parsee igual.
- Los otros dos tests de etiquetas y el de «gana la primera» pasan a usar cifras
  con céntimos.
- Bloque nuevo en `n26.csv.test.ts` (**`the raw line`**, 2 tests) que fija qué es
  `raw`: la línea tal cual, sin deshacer comillas ni recortar, y sin terminador
  (`\r\n` incluido). Con la comprobación explícita de que **las celdas de esa
  misma línea sí quedan partidas**, que es la razón de existir del campo.

**Recuento:** 493 tests (antes 490): +3 netos y varias aserciones reforzadas.

## Decisiones tomadas

### 1. 🔴 El concepto (criterio 11 — decisión delegada, resuelta por escrito)

**N26 no exporta ninguna columna de concepto.** Lo que hay es una columna que
nombra a la **contraparte** (rellena en las 90 filas de la muestra) y otra de
**referencia libre** (rellena en 2 de 90). La decisión:

> `description` = **contraparte** + `" - "` + **referencia libre**, saltando lo que
> esté vacío; si la referencia solo repite a la contraparte, no se escribe dos
> veces; si no hay ninguna de las dos, se usa el **tipo de apunte** del banco.

**Por qué las dos y no una:**

- *Solo la contraparte* pierde información en las filas que sí traen referencia:
  dos transferencias a la misma persona quedarían **indistinguibles** entre sí en
  la lista de movimientos, que es justo donde el humano las lee.
- *Solo la referencia* deja el 98 % de los movimientos con el concepto **vacío**.
- *Concatenar todo lo demás* (tipo, alias de la cuenta, divisa de origen…)
  convertiría el concepto en un volcado de la fila: ruido en el sitio donde el
  humano busca reconocer un gasto de un vistazo.

**Por qué el tipo de apunte como último recurso y no una fila reportada:** el tipo
viene siempre relleno y dice poco (`Card Payment`…), pero **tirar una fila cuya
fecha e importe se leen perfectamente cuesta más que un concepto pobre**. Solo
cuando no hay ni contraparte, ni referencia, ni tipo, la fila se reporta en
`unparsedRows`: **ningún movimiento sale nunca con el concepto vacío ni con un
nombre inventado**.

**Lo que NO se hizo:** las seis columnas que no tienen sitio en el contrato (IBAN
de la contraparte, alias de la cuenta, importe y divisa de origen, tipo de cambio,
y el tipo de apunte cuando no hace de concepto) **no se inventan como campos
nuevos**. Se quedan en el fichero, que sigue estando ahí para releerlo.

### 2. El lector de CSV vive dentro del módulo del banco

El algoritmo es genérico y Revolut va a necesitar uno igual, y aun así
`n26.csv.ts` **no** sube a `lib/`. La norma no prohíbe compartir «lo difícil»:
prohíbe compartir **el código que lee un formato**, porque un formato cambia sin
avisar. Lo que se comparte es lo que no es formato: la forma de la salida
(ADR-013) y la codificación (ADR-018). El banco siguiente copia el patrón.

### 3. Dos lectores de importes, a propósito

La **columna del banco** se lee estricta (`^[+-]?\d+(\.\d+)?$`): cualquier otra
forma va a `unparsedRows` en vez de adivinarse, porque confundir punto decimal con
punto de miles produce un número que nadie va a notar que está mal. La **línea de
preámbulo** la escribe una persona, así que admite `1.500,00` y `1500.00`.

### 4. La divisa sale de la cabecera de la columna de importes

El fichero la declara una vez (`Amount (EUR)`), así que se lee de ahí en vez de
escribir `'EUR'` a mano en el código: si algún día llega un export en otra divisa,
el parser ya lo dice bien (hay test).

### 5. Se lee también el preámbulo escrito con la coma del fichero

El criterio 5 fija el `;` y así está implementado y documentado. Entender además la
variante con coma no cuesta nada y evita un **`null` silencioso** en una línea que
el humano da por escrita — que es exactamente el tipo de fallo callado que este
proyecto ya ha pagado dos veces. La forma documentada sigue siendo una sola.

### 6. `valueDate` cuando el fichero no trae esa columna

El contrato no admite `null` en `valueDate`. Si la columna **no existe** en el
fichero, se usa la fecha contable (decir «el fichero solo dio una» es mejor que
inventar otra); si la columna **existe** y su contenido no se entiende, la fila se
reporta. Nunca se copia una fecha sobre la otra habiendo dato: en la muestra
difieren en 17 de 90 filas.

## Trazabilidad — cada criterio con su test

| # | Criterio | Test |
|---|---|---|
| 1 | Módulo propio, sin heredar de otro banco | `n26.statement.parser.test.ts` › *one parser per bank* (2) · `architecture.test.ts` › *shares no parsing code between bank modules* (ahora recorre los **tres**), *keeps the n26 parser module free of data access*, árbol esperado |
| 2 | CSV de verdad: comas dentro de comillas | `n26.csv.test.ts` (10 tests: comas, `""`, saltos de línea, CRLF, nº de línea, comilla sin cerrar) · `parser.test` › *the file is read as a real CSV* (3) |
| 3 | Fechas ISO sin conversión, contable y valor **por separado** | `n26.format.test.ts` › *parseIsoStatementDate* (3) · `parser.test` › *dates* (3, incluida la fila con fechas distintas y el día imposible) |
| 4 | Punto decimal, signo dentro, `deriveMovementTypeFromAmount` | `n26.format.test.ts` › *parseBankAmount* (2) · `parser.test` › *amounts and the sign* (4, incluye `0` → `neutral` y que no se reimplementa la regla del signo) |
| 5 | Preámbulo con `;` en un fichero de comas | `parser.test` › *reads the iban and the balance written with `;`…*, ***keeps the cents of a balance written the Spanish way, with `;`* (5 casos con céntimos ≠ 0)**, *reads only ABOVE the header*, *single finder* · `n26.csv.test.ts` › *the raw line* (2) |
| 6 | Etiquetas sin mayúsculas/acentos y con relleno final | `parser.test` › *recognizes the labels whatever their casing…*, *also understands the line if he wrote it with the comma* (ambos con céntimos ≠ 0) |
| 7 | Opcionales: ausente/vacía · ilegible · repetida | `parser.test` › *parses the file all the same when a line is absent or empty*, *reports an unreadable balance with its line number*, *keeps the first line when a label is written twice* |
| 8 | Sin IBAN → camino existente del importador | `n26.routes.test.ts` › *leaves the account to the existing importer path (C8)* · `parser.test` › *never infers the account iban from an IBAN-shaped string* |
| 9 | `decodeUtf8Strict`, nunca `toString('utf8')` | `parser.test` › *a file that is not UTF-8* (4: código `NOT_UTF8`, byte `0xF3`, que no aparece `toString('utf8')` en el código, acento intacto en el camino sano) · `n26.service.test.ts` › *reports a file that is not UTF-8 as a failure of that file* |
| 10 | Contrato común, `balance` `null`, `assignDaySequence` | `parser.test` › *the shared contract* (6: claves del contrato, ningún tipo redeclarado, `balance` una sola vez en el código, ningún campo inventado, numeración `oldest-first`, una fila ilegible no consume número) |
| 11 | Concepto compuesto y no vacío | `parser.test` › *the composed concept* (6: contraparte sola, contraparte + referencia, referencia sola, tipo como último recurso, sin repetir, y la fila sin nada → reportada) |
| 12 | `POST /api/parser/n26` + registro en `app.ts` | `n26.routes.test.ts` (7: 200 con resumen, sin rutas absolutas, fallo aislado, vacío, la línea del registro, ruta registrada en la app real) · `n26.service.test.ts` (5, incluye determinismo) |
| 13 | Fixtures sintéticos, sin red, y `./init.sh` verde | `parser.test` › *the fixture stays synthetic* · `no-real-data.test.ts` **en verde con su capa de comparación activa** (0 tests saltados) |

## Último `./init.sh`

**Verde** (tras la corrección de la review). `Test Files 32 passed (32)` ·
**`Tests 493 passed (493)`**, **0 saltados** (baseline anterior a la feature: 412 →
**+81**). Type check sin errores, `oxlint` limpio y `prettier --check` limpio sobre
lo tocado.

Que los saltados sean 0 importa: significa que el guardián de privacidad de la F14
corrió con **las dos capas**, la de forma y la de comparación contra `var/`. De
hecho **saltó durante el desarrollo** y con razón — no por un dato del humano, sino
porque escribir los nombres de las 11 columnas seguidos reproduce una secuencia de
palabras que está en el fichero real. Se arregló en la raíz (un comentario por línea
que rompe la secuencia y de paso documenta cada columna), no silenciando el
guardián: no se ha añadido **ningún** `no-real-data-ok` en esta feature.

## Pendiente al cerrar (después del veredicto del reviewer)

`docs/roadmap.md` sigue diciendo ⏳ en la fila de N26 (línea 149) y «4 parsers por
escribir» (línea 51). **No se ha tocado a propósito**: es el paso de cierre de
sesión, y hasta que la feature no esté aprobada y en `done` esas dos líneas son
ciertas. Son las **dos líneas** que hay que cambiar entonces, junto a la de
`progress/history.md`.

## Lo que aprendió esta feature

**Un fixture cuyos valores no pueden fallar no es un fixture.** El saldo de todos
los tests de integración era `1500,00`: forma correcta, cifra redonda… y céntimos
`00`, que es precisamente el único valor con el que el bug no se ve. El criterio 5
figuraba como cubierto en esta misma tabla de trazabilidad y no lo estaba. La
lección aplicada: los importes de fixture llevan **céntimos distintos de cero**, y
la razón está escrita al lado del valor por defecto para que nadie lo redondee de
vuelta.

**Y el corolario de siempre en este repo:** el fallo no daba error. Devolvía un
número plausible, con el fichero parseado «perfectamente» y `unparsedRows` vacío.
Es el mismo patrón de la F17 (cp1252) y de la coma decimal de los `.json`: lo
peligroso no es lo que revienta.

## Sugerencias fuera de scope (NO aplicadas)

1. **`n26.csv.ts` es reutilizable a nivel de patrón para Revolut** (que también es
   CSV de comas). Cuando llegue esa feature, la tentación de importarlo será
   grande: la respuesta ya está en el ADR-020 y en el guardián de arquitectura.
2. **El importador sigue sin persistir `accountBalance`** (cabo abierto desde la
   F16). N26 lo aporta igual que MyInvestor, así que ahora hay dos bancos con el
   dato en el contrato y ninguno en la base de datos.
3. **Las seis columnas que N26 trae y el contrato no tiene** (divisa e importe de
   origen, tipo de cambio) son la única fuente de «gasto en moneda extranjera» del
   repo. Si algún día se quiere esa vista, el dato existe en el fichero pero hoy no
   se guarda; sería un campo nuevo del contrato común, no un campo de N26.
4. **El humano todavía tiene que renombrar la carpeta de Drive `N26` → `n26`.** El
   importador normaliza el nombre, pero la copia local se escribe con el nombre
   crudo (`ingestion.service.ts`), así que en Windows funciona y en Linux no
   encontraría la carpeta. Ya estaba anotado en el inventario; sigue pendiente y
   **no es código**.
5. **`myinvestor.product.parser.test.ts` sigue sin pasar `prettier --check`** (ya
   venía así de antes; no se ha tocado).
