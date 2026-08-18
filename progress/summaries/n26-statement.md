# Resumen — feature 18 `n26-statement`

Fecha de cierre: 2026-08-18
Intención original: `feature_list.json` → feature `n26-statement`, bloque `intent`
Spec: no tiene (`sdd: false`); el contrato eran los **13 criterios de `acceptance`**
Origen: [`inventario-bancos-2026-08-17.md`](../explorations/inventario-bancos-2026-08-17.md)
Review: [`reviews/n26-statement.md`](../reviews/n26-statement.md) — **APPROVED** en segunda pasada

## Qué hace ahora la app que antes no

**N26 es el tercer banco que entra en el sistema.** Subes su `.csv` tal y como lo
exporta el banco —solo con tus dos líneas de preámbulo escritas arriba— y sus
movimientos entran con su fecha, su concepto y su importe:
`POST /api/parser/n26` los devuelve y `POST /api/import` deja de reportarlos como
`skipped`. Antes esa cuenta no existía para la aplicación.

Con esta feature el repo estrena además **un lector de CSV de verdad**: hasta hoy
los CSV se partían por el separador, lo que basta para MyInvestor pero destroza un
fichero donde un comercio lleva una coma en su nombre. El de N26 entiende campos
entrecomillados, comas y saltos de línea **dentro** de un campo, y `""` como
comilla literal.

Tres cosas que **no** hace, a propósito: no persiste nada (esto sigue siendo parser
y volcado), no toca los parsers de Bankinter ni de MyInvestor (ni una línea
compartida, con guardián), y no inventa campos nuevos para las seis columnas que
N26 trae y el contrato común no tiene.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/n26` — misma forma que los otros dos bancos: recorre
  `var/drive-read/n26/<año>/`, parsea los `.csv` y vuelca el JSON en
  `var/parsed/n26/<año>/`.
- `POST /api/import` — el banco está en el registro de parsers de
  [`app.ts:41`](../../src/app.ts#L41) con la extensión `.csv`, que es lo que hace
  que sus ficheros dejen de saltarse.
- El fichero que escribes tú: **las dos líneas de preámbulo, con `;`**, encima de
  la cabecera del banco — `iban;ES…;;;` y `Saldo;1.234,56;;;` —, exactamente igual
  que en MyInvestor. Cómo escribirlas, en
  [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md).
- La carpeta de Drive del banco: **`n26` en minúsculas** (ver «Notas para el
  futuro»).

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de Markdown
> de VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### El módulo nuevo (12 archivos, ni un import de otro banco)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Lector de CSV **entrecomillado** de este banco: comas y saltos de línea dentro del campo, `""` literal, `\r\n`/`\n`, y el nº de línea 1-based donde **empieza** el registro | `readCsvRecords` | [n26.csv.ts:49](../../src/modules/n26/n26.csv.ts#L49) |
| La línea **tal cual está escrita** en el fichero, sin deshacer nada: existe porque el preámbulo no es una fila de la tabla del banco | `CsvRecord.raw` | [n26.csv.ts:43](../../src/modules/n26/n26.csv.ts#L43) |
| El parser: `Buffer` → `ParsedStatement<'n26'>`. Puro, sin BD ni Drive | `parseN26Statement` | [n26.statement.parser.ts:100](../../src/modules/n26/n26.statement.parser.ts#L100) |
| Un **único** buscador de líneas de preámbulo etiquetadas, para el `iban;` y el `saldo;` (mismo patrón que la F16) | `findPreambleLine` | [n26.statement.parser.ts:226](../../src/modules/n26/n26.statement.parser.ts#L226) |
| Corta la línea **solo por el primer separador**: la etiqueta es lo de antes, el valor es **todo el resto** (aquí murió el fallo de los céntimos) | `firstSeparatorIndex` | [n26.statement.parser.ts:249](../../src/modules/n26/n26.statement.parser.ts#L249) |
| Quita el relleno **del final** (`;;;`, `,,,`, comillas) y solo del final | `cleanPreambleValue` | [n26.statement.parser.ts:269](../../src/modules/n26/n26.statement.parser.ts#L269) |
| El concepto compuesto: contraparte + `" - "` + referencia libre; tipo de apunte como último recurso | `composeDescription` | [n26.statement.parser.ts:367](../../src/modules/n26/n26.statement.parser.ts#L367) |
| La fecha de valor sale de **su** columna; solo cae en la contable si esa columna no existe en el fichero | `valueDateOf` | [n26.statement.parser.ts:341](../../src/modules/n26/n26.statement.parser.ts#L341) |
| Compara la etiqueta sin acentos, sin mayúsculas y sin espacios | `normalizeLabel` | [n26.statement.parser.ts:393](../../src/modules/n26/n26.statement.parser.ts#L393) |
| La columna del banco, **estricta**: o tiene la forma que exporta N26 o devuelve `null` (nada de adivinar) | `parseBankAmount` | [n26.format.ts:25](../../src/modules/n26/n26.format.ts#L25) |
| La línea que escribes tú, **tolerante**: `1.234,56` y `1234.56` | `parseHandwrittenAmount` | [n26.format.ts:49](../../src/modules/n26/n26.format.ts#L49) |
| Fecha ISO sin conversión, con día de calendario **real** (`2026-02-31` se reporta, no se corrige) | `parseIsoStatementDate` | [n26.format.ts:76](../../src/modules/n26/n26.format.ts#L76) |
| Solo lo suyo: alias del contrato común, sin redeclarar nada | `N26StatementResult` | [n26.types.ts:31](../../src/modules/n26/n26.types.ts#L31) |
| Recorre las copias locales, parsea y vuelca JSON determinista | `parseLocalN26Copies` | [n26.service.ts:37](../../src/modules/n26/n26.service.ts#L37) |
| El endpoint | `n26Routes` | [n26.routes.ts:30](../../src/modules/n26/n26.routes.ts#L30) |

### Lo que se tocó fuera del módulo (mínimo)

| Qué hace | Código |
| --- | --- |
| Una línea en el registro de parsers + el `app.register` | [app.ts:41](../../src/app.ts#L41) |
| El árbol esperado del módulo nuevo (12 archivos) | [architecture.test.ts:114](../../src/architecture.test.ts#L114) |
| Guardián «sin Prisma» del módulo nuevo | [architecture.test.ts:276](../../src/architecture.test.ts#L276) |
| El guardián de «un parser por banco», **generalizado a los tres bancos** (antes solo recorría uno) | [architecture.test.ts:291](../../src/architecture.test.ts#L291) |
| ADR-020: el lector de formato vive en el módulo, el preámbulo va con `;`, y el concepto se compone | [architecture.md:1396](../../docs/architecture.md#L1396) |

### Fixtures (sintéticos, en memoria)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Construye el CSV en código, con los nombres reales de columna y datos inventados | `buildStatementCsv` | [n26.fixture.ts:54](../../src/modules/n26/n26.fixture.ts#L54) |
| Las dos líneas de preámbulo. Su saldo por defecto es `1.234,56` — **céntimos ≠ 0 a propósito**, con la razón escrita al lado | `n26Preamble` | [n26.fixture.ts:222](../../src/modules/n26/n26.fixture.ts#L222) |
| El IBAN público de la documentación española, nunca uno real | `documentationIban` | [n26.fixture.ts:227](../../src/modules/n26/n26.fixture.ts#L227) |

### Tests (los 13 criterios, uno a uno)

| # | Qué cubre | Código |
| --- | --- | --- |
| 1 | Módulo propio: no importa otro banco, ni comparte lector | [parser.test.ts:60](../../src/modules/n26/n26.statement.parser.test.ts#L60) · [architecture.test.ts:291](../../src/architecture.test.ts#L291) |
| 2 | CSV de verdad: coma dentro de comillas, `""`, salto de línea, CRLF, nº de línea, comilla sin cerrar | [n26.csv.test.ts:7](../../src/modules/n26/n26.csv.test.ts#L7) · [parser.test.ts:79](../../src/modules/n26/n26.statement.parser.test.ts#L79) |
| 3 | Fechas ISO sin conversión, día imposible reportado, `valueDate` de su propia columna | [format.test.ts:46](../../src/modules/n26/n26.format.test.ts#L46) · [parser.test.ts:107](../../src/modules/n26/n26.statement.parser.test.ts#L107) |
| 4 | Punto decimal, signo dentro, `deriveMovementTypeFromAmount` sin reimplementar la regla | [format.test.ts:7](../../src/modules/n26/n26.format.test.ts#L7) · [parser.test.ts:128](../../src/modules/n26/n26.statement.parser.test.ts#L128) |
| 5 | Preámbulo con `;` en un fichero de comas, y **los céntimos no se pierden** (5 casos con céntimos ≠ 0) | [parser.test.ts:164](../../src/modules/n26/n26.statement.parser.test.ts#L164) · [parser.test.ts:181](../../src/modules/n26/n26.statement.parser.test.ts#L181) · [n26.csv.test.ts:45](../../src/modules/n26/n26.csv.test.ts#L45) |
| 6 | Etiquetas sin mayúsculas ni acentos, con relleno final, y la variante escrita con coma | [parser.test.ts:201](../../src/modules/n26/n26.statement.parser.test.ts#L201) · [parser.test.ts:216](../../src/modules/n26/n26.statement.parser.test.ts#L216) |
| 7 | Ausente o vacía → `null` sin ruido · ilegible → `unparsedRows` con su línea · repetida → gana la primera | [parser.test.ts:231](../../src/modules/n26/n26.statement.parser.test.ts#L231) · [:246](../../src/modules/n26/n26.statement.parser.test.ts#L246) · [:262](../../src/modules/n26/n26.statement.parser.test.ts#L262) |
| 8 | Sin IBAN → camino que ya existía en el importador; nunca se deduce de la tabla | [routes.test.ts:126](../../src/modules/n26/n26.routes.test.ts#L126) · [parser.test.ts:285](../../src/modules/n26/n26.statement.parser.test.ts#L285) |
| 9 | `decodeUtf8Strict` lo primero, nunca `toString('utf8')`, BOM tolerado | [parser.test.ts:333](../../src/modules/n26/n26.statement.parser.test.ts#L333) · [service.test.ts:81](../../src/modules/n26/n26.service.test.ts#L81) |
| 10 | Contrato común: cinco claves, sin tipos redeclarados, `balance` `null` por línea, `assignDaySequence` | [parser.test.ts:366](../../src/modules/n26/n26.statement.parser.test.ts#L366) |
| 11 | El concepto compuesto: **nunca vacío**, y la fila sin nada se reporta en vez de salir en blanco | [parser.test.ts:457](../../src/modules/n26/n26.statement.parser.test.ts#L457) |
| 12 | `POST /api/parser/n26`, registro en `app.ts` y volcado determinista | [routes.test.ts:37](../../src/modules/n26/n26.routes.test.ts#L37) · [service.test.ts:28](../../src/modules/n26/n26.service.test.ts#L28) |
| 13 | Fixtures sintéticos, sin red; guardián de la F14 con su capa de comparación **activa** | [parser.test.ts:568](../../src/modules/n26/n26.statement.parser.test.ts#L568) · `src/no-real-data.test.ts` |

## Cumplimiento de la intención

- ✅ «Subo el `.csv` de N26 con mis dos líneas escritas arriba y sus movimientos
  entran, con su fecha, su concepto y su importe» → se cumple; de extremo a extremo
  en [`routes.test.ts:38`](../../src/modules/n26/n26.routes.test.ts#L38) y
  [`service.test.ts:29`](../../src/modules/n26/n26.service.test.ts#L29).
- ✅ «El iban y el saldo se leen de donde los escribo, igual que en MyInvestor» →
  se cumple, y **con los céntimos completos**;
  [`parser.test.ts:164`](../../src/modules/n26/n26.statement.parser.test.ts#L164)
  y [`:181`](../../src/modules/n26/n26.statement.parser.test.ts#L181).
- ✅ «Un gasto sale como gasto y un ingreso como ingreso, sin que yo toque el
  signo» → se cumple con el helper compartido que ya existía;
  [`parser.test.ts:135`](../../src/modules/n26/n26.statement.parser.test.ts#L135).
- ✅ «Si un mes se me olvida el saldo, el archivo entra igual y el saldo sale
  vacío» → se cumple;
  [`parser.test.ts:231`](../../src/modules/n26/n26.statement.parser.test.ts#L231).
- ✅ «No quiero editar el archivo del banco más allá de esas dos líneas» → se
  cumple: el resto se lee tal cual sale de N26, comillas incluidas.
- ✅ «Que el parser de N26 no toque los de Bankinter ni MyInvestor» → se cumple,
  con guardián de arquitectura que ahora recorre **los tres** bancos.

## Decisiones que quedaron fijadas

Las tres primeras están razonadas en el informe del implementer y escritas en
**[ADR-020](../../docs/architecture.md#L1396)**:

- **(delegada al implementer, criterio 11) El concepto se COMPONE.** N26 no exporta
  ninguna columna de concepto: hay una de **contraparte** (rellena casi siempre) y
  una de **referencia libre** (rellena en 2 de 90 filas de la muestra). La regla
  fijada es *contraparte* + `" - "` + *referencia*, saltando lo vacío, sin repetir
  la referencia cuando solo copia a la contraparte, y el **tipo de apunte** como
  último recurso. Solo la contraparte dejaría dos transferencias a la misma persona
  indistinguibles; solo la referencia dejaría el 98 % de conceptos vacíos; volcar
  todas las columnas convertiría el concepto en ruido. **Ningún movimiento sale
  nunca con el concepto vacío**: la fila que no tiene nada con qué componerlo se
  reporta en `unparsedRows`.
- **(decisión del leader, criterio 5) El preámbulo se escribe con `;` también en
  este fichero de comas.** Una sola forma de escribirlo en todo el proyecto, la que
  ya está documentada y la que ya usas en MyInvestor; además, la línea tuya se
  distingue a simple vista de las del banco. El parser **entiende también** la
  variante con coma, porque no cuesta nada y evita un `null` silencioso en una
  línea que das por escrita — pero la forma documentada sigue siendo una sola.
- **(delegada) El lector de CSV vive DENTRO del módulo del banco.** El algoritmo es
  genérico y Revolut necesitará uno igual, y aun así `n26.csv.ts` no sube a `lib/`:
  lo que la norma prohíbe compartir es **el código que lee un formato**, porque un
  formato cambia sin avisar. Lo compartido sigue siendo lo que no es formato: la
  forma de la salida (ADR-013) y la codificación (ADR-018).
- **(delegada) Dos lectores de importes, a propósito.** La columna del banco se lee
  estricta —cualquier otra forma va a `unparsedRows` en vez de adivinarse—; la
  línea que escribes tú admite las dos escrituras.
- **(delegada) La divisa se lee de la cabecera** de la columna de importes, no se
  escribe `'EUR'` a mano: si algún día llega un export en otra divisa, el parser ya
  lo dice bien.
- **(delegada) `valueDate` cuando la columna no existe:** se usa la contable (decir
  «el fichero solo dio una» es mejor que inventar otra). Si la columna existe y su
  contenido no se entiende, la fila se reporta. Nunca se copia una fecha sobre la
  otra habiendo dato: en la muestra difieren en 17 de 90 filas.

## El fallo que destapó la review (y por qué importa)

La primera pasada del reviewer fue **CHANGES_REQUESTED** por un fallo **callado**,
el peor tipo que hay en este repo:

**El saldo escrito a la española con `;` perdía los céntimos, en silencio.** La
línea de preámbulo no va entrecomillada, así que el lector de CSV la partía por la
**coma de la tabla** antes de que el buscador de etiquetas la viese, y ese buscador
solo miraba `cells[0]`. Con `Saldo;1.234,56` salían dos celdas (`Saldo;1.234` y
`56;;;`) y el resultado era `accountBalance: 1234` — un número plausible, con el
fichero parseado «perfectamente» y **`unparsedRows` vacío**. La documentación decía
que esa escritura funcionaba: era **un registro mintiendo**.

**Cómo se arregló — en el código, no en la documentación.** `CsvRecord` gana `raw`
([n26.csv.ts:43](../../src/modules/n26/n26.csv.ts#L43)): la línea exacta del
fichero, calculada con el desplazamiento real de inicio de registro, no
reconstruida. `findPreambleLine` trabaja sobre `raw` y corta **solo por el primer
separador** ([n26.statement.parser.ts:249](../../src/modules/n26/n26.statement.parser.ts#L249)),
de modo que una coma decimal posterior es parte del valor. Verificado por el
reviewer ejecutando el parser: `Saldo;1.234,56` → `1234.56`, `Saldo;250,75` →
`250.75`, `Saldo;-2.000,50` → `-2000.5`, y la variante con coma igual. La red de
seguridad sigue puesta: `Saldo;mil quinientos` → `null` **y** su línea en
`unparsedRows`.

**Y por qué los tests no lo veían:** todas las aserciones de integración usaban
`1500,00`, cuyos céntimos son `00` — el único valor con el que el bug no se ve. El
criterio 5 figuraba como cubierto en la tabla de trazabilidad y no lo estaba. La
lección quedó aplicada en el código: `n26Preamble()` usa `1.234,56` con una nota
escrita al lado de por qué **no** volver a redondearlo, y hay un test nuevo con
cinco casos de céntimos ≠ 0, cada uno exigiendo además `unparsedRows` vacío.

> **Un fixture cuyos valores no pueden fallar no es un fixture.** Es el mismo
> patrón de la F17 (cp1252) y de la coma decimal de los `.json`: lo peligroso no es
> lo que revienta.

## Qué NO se tocó / quedó fuera

- **No se persiste nada.** Ni Prisma, ni migraciones, ni el importador: el resultado
  llega al volcado y al resumen del endpoint y ahí se queda. `accountBalance` sigue
  sin guardarse en base de datos (cabo abierto desde la F16, ahora con **dos**
  bancos que lo aportan).
- **No se tocaron los parsers de Bankinter ni de MyInvestor.**
- **Las seis columnas sin sitio en el contrato** (IBAN de la contraparte, alias de
  cuenta, importe y divisa de origen, tipo de cambio, y el tipo de apunte cuando no
  hace de concepto) **no se inventaron como campos nuevos**: se quedan en el
  fichero, que sigue estando ahí para releerlo.
- **No se escribió un camino nuevo para el fichero sin IBAN**: entra por el que ya
  existía en el importador (`MISSING_ACCOUNT_DATA` sigue siendo suyo).

## Números finales de la suite

`./init.sh` **verde, exit 0**: `Test Files 32 passed (32)` ·
**`Tests 493 passed (493)`**, **0 saltados**. Baseline anterior a la feature: 412 →
**+81 tests** (490 tras la primera pasada, +3 al arreglar el fallo del saldo). Type
check sin errores, `oxlint` limpio y `prettier --check` limpio sobre lo tocado.

Que los saltados sean **0** importa: significa que el guardián de privacidad de la
F14 corrió con **las dos capas**, la de forma y la de comparación contra `var/`
(incluida la muestra real de N26). **No se añadió ni un `no-real-data-ok`** en esta
feature; de hecho el guardián saltó durante el desarrollo —no por un dato tuyo,
sino porque escribir los 11 nombres de columna seguidos reproducía una secuencia de
palabras del fichero real— y se arregló en la raíz, con un comentario por línea que
rompe la secuencia y de paso documenta cada columna.

## Notas para el futuro

- **Te queda renombrar la carpeta de Drive `N26` → `n26`.** El importador normaliza
  el nombre del banco, pero la copia local se escribe con el nombre crudo
  (`ingestion.service.ts`): en Windows funciona y en Linux no encontraría la
  carpeta. No es código; está anotado desde el inventario.
- **Revolut también es CSV de comas** y la tentación de importar `n26.csv.ts` será
  grande cuando llegue. La respuesta está en el ADR-020 y en el guardián de
  arquitectura: se copia el patrón, no el archivo.
- **Gasto en moneda extranjera:** N26 es hoy la única fuente del repo con divisa e
  importe de origen y tipo de cambio. El dato existe en el fichero y no se guarda;
  si algún día quieres esa vista, sería un campo del **contrato común**, no de N26.
- Pendiente ajeno a esta feature:
  `src/modules/myinvestor/myinvestor.product.parser.test.ts` sigue sin pasar
  `prettier --check` (ya venía así). Se arregla con un `pnpm format` cuando toque.

## Cierre (lo que se hizo en esta sesión, sin tocar `src/`)

1. `./init.sh` completo reejecutado: **verde**, 32 archivos de test, **493 tests,
   0 saltados**.
2. Escrito este resumen (CHECKPOINT **C8**).
3. `feature_list.json`: F18 → `"status": "done"`. Las F19 y F20 siguen en
   `spec_ready`, sin tocar.
4. `docs/roadmap.md`: el ⏳ de la fila de N26 pasa a ✅ (línea ~149) y «4 parsers
   por escribir» pasa a **3** (líneas ~51 y ~71: la del camino E4 y la de la tabla
   de etapas, que decían lo mismo).
5. Añadida la línea de la F18 en `progress/history.md`.
