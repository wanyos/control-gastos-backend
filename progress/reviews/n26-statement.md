# n26-statement (F18) — review

**Veredicto:** CHANGES_REQUESTED

Feature sin spec (`sdd: false`): se revisa contra los **13 criterios de
`acceptance`** y el `intent` de `feature_list.json`, `CHECKPOINTS.md`,
`docs/conventions.md` §Parsers de banco, ADR-013 / ADR-015 / ADR-018 y
`docs/dar-de-alta-un-banco.md`. `./init.sh` ejecutado por el revisor: **verde,
exit 0, `Test Files 32 passed`, `Tests 490 passed`, 0 saltados**.

---

## Cambios requeridos

### 1. 🔴 El saldo escrito **a la española** con `;` pierde los céntimos, en silencio

`src/modules/n26/n26.statement.parser.ts:216-230` (`findPreambleLine`, la línea
`const parts = record.cells[0].split(';')`), en combinación con
`src/modules/n26/n26.csv.ts:38` (`readCsvRecords`).

La línea de preámbulo **no va entrecomillada**, así que el lector de CSV la parte
por la coma **antes** de que el buscador de etiquetas la vea. Como el buscador
solo mira `record.cells[0]`, todo lo que hay tras la coma decimal se pierde:

| Lo que escribe el humano (forma **documentada**) | `accountBalance` que sale | Debería |
|---|---|---|
| `Saldo;1.234,56;;;` | `1234` | `1234.56` |
| `Saldo;250,75` | `250` | `250.75` |
| `Saldo;1500,00;;;` | `1500` | `1500` (correcto **por casualidad**: los céntimos son `00`) |
| `Saldo;1234.56` | `1234.56` | correcto |

Verificado ejecutando el parser real sobre el fixture del módulo.

Esto incumple tres cosas a la vez:

- **Criterio 5** (el preámbulo se escribe con `;` aunque el fichero separe por
  comas): con `;` la forma española del importe **no** se lee bien.
- **Criterio 7 / paridad con la F16** (`igual que en MyInvestor`): en MyInvestor
  `saldo;1.234,56` da `1234.56`; aquí da `1234`. Y no cae en `unparsedRows`:
  **no hay ningún aviso**, que es justo el fallo callado que la F16 y la F17
  existen para evitar.
- La documentación afirma explícitamente que esa escritura funciona:
  `docs/api-contract.md:1000` («El importe de esa línea admite las dos
  escrituras —`1.500,00` (española) y `1500.00`») y
  `docs/dar-de-alta-un-banco.md:211-215` («el importe puedes escribirlo **a la
  española** (`1.500,00`)… las dos se entienden»). Hoy es **un registro
  mintiendo**, la misma causa por la que la F15 se fue a CHANGES_REQUESTED.

Qué hay que hacer: que la línea de preámbulo se reconstruya **entera** antes de
partirla por la etiqueta (p. ej. localizarla sobre el texto crudo, o volver a
unir las celdas del registro con `,` antes de buscar la etiqueta), de modo que
`Saldo;1.234,56` y `Saldo;250,75` den el número completo. Arreglar la
documentación en vez del código **no** vale: lo que hay documentado es la forma
que el criterio 5 fija y la que ya usa el humano en MyInvestor.

### 2. Los tests del saldo están escritos de forma que no pueden ver el fallo nº 1

`src/modules/n26/n26.statement.parser.test.ts:170`, `:187`, `:195-202`, `:238-244`
y `src/modules/n26/n26.fixture.ts:216` (`n26Preamble(balance = '1500,00')`):
**todas** las aserciones de integración usan `1500,00` → `1500`, un valor cuyos
céntimos son cero y que por tanto sale bien aunque se trunque. El caso del
criterio 5 aparece cubierto en la tabla de trazabilidad del informe y en realidad
no lo está.

`src/modules/n26/n26.format.test.ts:30-35` sí prueba `-2.000,50` → `-2000.5`,
pero **solo a nivel de unidad**: el defecto está en el camino que va del lector de
CSV al buscador de preámbulo, y ninguna prueba lo recorre con un importe de
céntimos distintos de cero.

Qué hay que hacer: al menos un test de `parseN26Statement` con `Saldo;1.234,56`
(forma `;`, la documentada) y otro con `Saldo;250,75`, exigiendo el número
completo. Conviene que el valor por defecto de `n26Preamble` deje de tener los
céntimos a cero, para que este agujero no pueda reabrirse.

---

## Comprobado sin hallazgos

**Criterio 1 — módulo propio.** `src/modules/n26/` con los 12 archivos del patrón;
ni un import de otro banco. El guardián de `src/architecture.test.ts:276+` se ha
**generalizado a los tres bancos** (antes solo recorría MyInvestor), incluye el
árbol esperado, el «sin Prisma» del módulo nuevo y `normalizeBankName('N26')`.
Ningún banco nombra a otro; `app.ts` sigue siendo el único que nombra bancos.

**Criterio 2 — CSV de verdad.** `n26.csv.ts` es un lector RFC 4180 correcto,
comprobado por el revisor ejecutándolo: coma dentro de comillas no parte la fila
(`a,"b,c",d` → 3 celdas), `""` da una comilla literal, salto de línea dentro del
campo se conserva y el registro guarda la línea donde **empieza**, `\r\n` y `\n`,
última línea sin salto final, línea en blanco → registro en blanco (ignorado), y
comilla sin cerrar devuelve el registro tal cual en vez de tragárselo. Fila con
**menos** o **más** columnas que la cabecera → `unparsedRows` con
`número de columnas inesperado (N, se esperaban 11)`, verificado con 3 y con 12
columnas. Campos vacíos → `''`, nunca `null` inventado.

**Criterio 3 — fechas.** ISO sin conversión, día de calendario validado
(`2026-02-31` se reporta, no se corrige), y `valueDate` se puebla por separado;
solo cae en la contable cuando la **columna** no existe, decisión razonada en el
informe §6 y en el código (`valueDateOf`).

**Criterio 4 — importes y signo.** Columna del banco leída estricta
(`^[+-]?\d+(\.\d+)?$`), tipo derivado importando `deriveMovementTypeFromAmount`
(`0` → `neutral`), sin reimplementar la regla.

**Criterio 6 — etiquetas.** Sin distinguir mayúsculas ni acentos, con relleno
final `;;;` o `,,,` inocuo, mismo `normalizeLabel` que la F16.

**Criterio 7 — ausente / ilegible / repetida.** Comportamiento idéntico a la F16,
verificado ejecutando el parser: ausente o vacía → `null` sin fallo; `saldo;mil
quinientos` → `unparsedRows` con su nº de línea y su motivo; etiqueta repetida →
gana la primera; una fila `saldo` **debajo** de la cabecera no se lee (es data).
Lo único que falla aquí es el valor numérico del punto 1.

**Criterio 8 — sin IBAN.** No se ha escrito camino nuevo: `accountIban: null` y
el importador resuelve como ya hacía (`selectAdapter` elige por **carpeta**, así
que los dos bancos con `.csv` no se pisan; `MISSING_ACCOUNT_DATA` sigue siendo del
importador).

**Criterio 9 — UTF-8.** `decodeUtf8Strict` es lo **primero** que se ejecuta, antes
de buscar la cabecera; no aparece `toString('utf8')` en el módulo; BOM tolerado.

**Criterio 10 — contrato común.** `ParsedStatement<'n26'>`, ningún tipo
redeclarado (guardián en `architecture.test.ts`), `balance: null` por línea,
`assignDaySequence` con `oldest-first`, y una fila reportada no consume número.

**Criterio 11 — el concepto (decisión delegada).** El argumento **se sostiene** y
está resuelto por escrito en `progress/implementations/n26-statement.md` §1 y en
ADR-020 §3: contraparte + referencia libre unidas por `" - "`, sin repetir la
referencia cuando solo copia a la contraparte, y el tipo de apunte como último
recurso. Comprobado en el código (`composeDescription`) y **ejecutado**: la única
salida `''` posible ocurre cuando las tres columnas están vacías, y en ese caso la
fila se reporta con `la fila no trae ningún dato con el que componer el concepto`
en vez de generar un movimiento. **Ningún movimiento puede salir con el concepto
vacío.** Las seis columnas sin sitio en el contrato no se han inventado como
campos nuevos.

**Criterio 12 — endpoint y registro.** `POST /api/parser/n26` con la misma forma
que los otros dos; una sola línea en el registro de `src/app.ts:41`
(`{ bank: 'n26', extensions: ['.csv'], parse: parseN26Statement }`) más el
`app.register`.

**Criterio 13 y privacidad (F14).** `./init.sh` verde con **0 saltados**
verificado por el revisor: existen `var/drive-read/` y `var/parsed/`, luego la
**capa de comparación está activa** (importes y trigramas contra las capturas
reales, `var/drive-read/N26/2026/N26-2026-08-17.csv` incluida) y no ha encontrado
nada. `grep` de `no-real-data-ok` en todo el repo: **ningún marcador nuevo**; los
que hay son de `docs/`, `specs/investments-data-model/` y del propio guardián,
todos anteriores. Los fixtures son sintéticos y en memoria, el IBAN es el público
de la documentación, no hay red en ningún test.

**Documentación (aparte de la mentira del punto 1).** `docs/api-contract.md`
§Parser de N26 (endpoint, modelo, reglas, tabla de los dos saldos, `NOT_UTF8`),
`docs/dar-de-alta-un-banco.md` (el `;` en un fichero de comas, «un CSV no es *el*
CSV», N26 en la sección de UTF-8), `docs/conventions.md` (lector del formato
dentro del módulo, preámbulo con `;`, sentido de export de cada banco) y ADR-020.
**No queda ningún documento diciendo que hay dos bancos**: las apariciones que
quedan son históricas y correctas (`api-contract.md:944` «los otros dos bancos» es
desde N26; `dar-de-alta-un-banco.md:250` «los dos parsers de texto» son MyInvestor
y N26; los ADR-013/014 hablan del segundo banco de su fecha). Las dos líneas ⏳ de
`docs/roadmap.md` (51 y 149) siguen siendo ciertas mientras la feature esté
`in_progress` y están anotadas como paso de cierre.

**CHECKPOINTS.** C1 ✅ · C2 ✅ (solo la F18 `in_progress`) · C3 ✅ (estructura,
sin `console.log` ni TODOs, sin dependencias nuevas, `prettier --check` limpio
sobre lo tocado) · C4 ⚠️ (los tests corren y pasan, pero ver el punto 2: el
camino feliz del criterio 5 no está realmente verificado) · C5 ✅ hasta donde
aplica antes del cierre · C6 n/a (no cambia el contrato consumido por el
frontend más allá de un endpoint nuevo ya documentado) · C7 n/a (`sdd: false`) ·
C8 **no se ha escrito** `progress/summaries/n26-statement.md`: no procede hasta
que el veredicto sea APPROVED.

---

# Segunda pasada — 2026-08-17

**Veredicto:** APPROVED

Revisados **solo por ejecución**, sin fiarme del informe: los dos puntos que
rechacé, más una batería de regresión sobre todo lo que ya había dado por bueno.
`./init.sh` ejecutado por el revisor: **verde, exit 0, `Test Files 32 passed`,
`Tests 493 passed`, 0 saltados** (venían 490).

## El fallo del saldo está muerto

`CsvRecord` gana `raw` (`src/modules/n26/n26.csv.ts:43`, calculado con el
desplazamiento real de inicio de registro, no reconstruido) y
`findPreambleLine` (`src/modules/n26/n26.statement.parser.ts:226`) corta la línea
**solo por el primer separador** (`firstSeparatorIndex`, `:249`), tomando todo el
resto como valor. Ejecutado sobre el parser real, las dos formas de escribir la
línea:

| Línea escrita | `accountBalance` | Antes |
|---|---|---|
| `Saldo;1.234,56;;;` | `1234.56` ✅ | `1234` |
| `Saldo,1.234,56,,,` | `1234.56` ✅ | `1234` |
| `Saldo;250,75` | `250.75` ✅ | `250` |
| `Saldo;-2.000,50` | `-2000.5` ✅ | `-2000` |
| `Saldo;1500,00` · `Saldo;1234.56` · `Saldo;0` | `1500` · `1234.56` · `0` ✅ | igual |

**La red de seguridad sigue puesta**, comprobado en la misma tanda: `Saldo;mil
quinientos` (y su variante con coma) → `accountBalance: null` **y**
`unparsedRows: [{ row: 2, reason: "saldo de la cuenta no interpretable ('mil
quinientos')" }]`, con su nº de línea correcto; etiqueta ausente o vacía →
`null` sin ruido; etiqueta repetida → gana la primera; una fila `saldo` **debajo**
de la cabecera sigue siendo data y no toca el campo. El arreglo se hizo **en el
código**, no en la documentación: `docs/api-contract.md:1000` y
`docs/dar-de-alta-un-banco.md:211-215` ya no mienten.

## La línea del IBAN no ha sufrido la regresión inversa

Comparte buscador, así que la probé entera: `iban;ES…`, `IBAN;ES…;;;;`,
` Iban ; ES… `, la variante con coma `iban,ES…,,,`, `iban;` (→ `null`), `iban`
sin separador (→ `null`) y la etiqueta repetida (→ gana la primera). **Los siete
casos igual que antes.**

## El lector de CSV no se ha roto

`raw` es aditivo: `cells` y `line` salen idénticos. Reejecutado todo lo que di por
bueno en la primera pasada — coma dentro de comillas (`a,"b,c",d` → 3 celdas),
`""` → comilla literal, salto de línea dentro del campo (el registro conserva la
línea en la que **empieza** y el siguiente sigue numerado bien), `\r\n` y `\n`,
última fila sin salto final, línea en blanco, comilla sin cerrar devuelta tal
cual, fila con **3** y con **12** columnas → `unparsedRows` con
`número de columnas inesperado`. Y el fichero completo con BOM y preámbulo, en
`\n` y en `\r\n`: mismos 9 movimientos, mismos 2 `unparsedRows` con sus números
de línea, mismos importes, mismos `daySequence` y mismos conceptos compuestos.
`raw` no se filtra al volcado: es interno al lector.

## Los tests ya pueden ver el fallo

`n26Preamble()` pasa a `1.234,56` con la nota de por qué no volver a redondearlo
(`src/modules/n26/n26.fixture.ts:222`); test nuevo *keeps the cents of a balance
written the Spanish way, with `;`* (`n26.statement.parser.test.ts:181`) con cinco
casos de céntimos no nulos, cada uno exigiendo además `unparsedRows` vacío; y el
bloque *the raw line* (`n26.csv.test.ts:45`) fija qué es `raw` y comprueba que las
celdas de esa misma línea **sí** quedan partidas. Comprobado que el test nuevo
falla contra el código viejo por construcción (el valor esperado ya no es
redondo). Los cinco tests de integración que dependían del fixture exigen ahora
el número completo.

## Los 11 criterios ya aprobados siguen aprobados

Reverificados: módulo propio y guardián de arquitectura sobre los tres bancos;
fechas ISO con día validado y `valueDate` propia; importe estricto y signo por
`deriveMovementTypeFromAmount`; etiquetas sin mayúsculas/acentos y con relleno;
sin IBAN → camino existente del importador; `decodeUtf8Strict` primero y sin
`toString('utf8')`; contrato común con `balance: null` y `assignDaySequence`;
concepto compuesto que **nunca** sale vacío (la fila sin nada se reporta);
`POST /api/parser/n26` y la línea del registro en `src/app.ts:41`.

**Privacidad (F14):** `grep` de `no-real-data-ok` en `src/modules/n26/` y en los
docs tocados → **cero marcadores nuevos**; los dos que aparecen en
`docs/architecture.md:1271` y `docs/conventions.md:125` son la prosa que describe
el mecanismo, anterior a esta feature. `var/drive-read/` y `var/parsed/` existen
en la máquina, luego los **0 saltados** son reales: la capa de comparación corrió
contra las capturas (incluida la muestra real de N26) y no encontró nada. Los
fixtures siguen sintéticos y en memoria, sin red.

**CHECKPOINTS:** C1 ✅ · C2 ✅ · C3 ✅ (`prettier --check` y `tsc` limpios, sin
logs de debug ni TODOs, sin dependencias nuevas) · C4 ✅ (ahora sí: el camino
feliz del criterio 5 está verificado con un valor que puede fallar) · C5 ✅ ·
C6 n/a · C7 n/a (`sdd: false`) · C8 ✅ → resumen de cierre en
[`progress/summaries/n26-statement.md`](../summaries/n26-statement.md).

**Al cerrar quedan las tres líneas ya anotadas por el implementer** (no son
código): `docs/roadmap.md:51` y `:149` (el ⏳ de N26 y «4 parsers por escribir»),
la línea de `progress/history.md`, y `feature_list.json` a `done`.
