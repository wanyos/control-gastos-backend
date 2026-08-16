# Resumen — feature 16 `statement-balance`

Fecha de cierre: 2026-08-16
Intención original: `feature_list.json` → feature `statement-balance`, bloque `intent`
Spec: no tiene (`sdd: false`); el contrato eran los 12 criterios de `acceptance`.

## Qué hace ahora la app que antes no

El extracto CSV de MyInvestor admite **una segunda línea escrita a mano en la
cabecera**, `Saldo;1500,00;;;`, justo debajo de la del `iban;`, y el parser devuelve
ese saldo como un dato del extracto: **`accountBalance`**. Antes el saldo de la cuenta
no entraba en el sistema por ningún lado (solo había movimientos sueltos sin punto de
referencia), y la fila `Saldo` del final del fichero solo servía para ensuciar
`unparsedRows` en todos los extractos.

Dos cosas que **no** hace, a propósito: no persiste ese saldo (esto sigue siendo
parser y volcado) y no lo cuadra contra la suma de los movimientos.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/myinvestor` — el resumen de cada extracto parseado trae ahora
  `accountBalance` junto a `accountIban`, y el JSON volcado en
  `var/parsed/myinvestor/<año>/<archivo>.json` también.
- El fichero que escribes tú: la línea `Saldo;<importe>;;;` **encima** de la fila de
  cabecera. Cómo escribirla, en
  [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) §«El saldo de
  la cuenta va en la misma cabecera».
- `POST /api/parser/bankinter` — sin cambios de comportamiento; su volcado JSON lleva
  el campo nuevo siempre a `null` (su `.xlsx` no trae esa línea).

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code.

### El contrato: el campo nuevo y su separación del otro «saldo»

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Declara `accountBalance: number \| null` en el contrato común de todos los bancos, con el comentario que lo distingue del saldo por movimiento | `ParsedStatement` | [parsed-statement.ts:88](../../src/lib/parsed-statement.ts#L88) |
| El saldo **por línea**, que sigue siendo otro dato y en MyInvestor es `null` para siempre | `ParsedMovement.balance` | [parsed-statement.ts](../../src/lib/parsed-statement.ts) |

### El parser de MyInvestor (donde vive la feature)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Lee la línea del saldo, la normaliza y decide si es `null` o si hay que reportarla | `parseMyinvestorStatement` | [myinvestor.statement.parser.ts:91](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L91) |
| Un **único** buscador de líneas de preámbulo etiquetadas, para el `iban;` y para el `saldo;` (antes `findIbanLine`) | `findPreambleLine` | [myinvestor.statement.parser.ts:180](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L180) |
| Compara la etiqueta sin acentos, sin mayúsculas y sin espacios (por eso vale tu `Saldo;`) | `normalizeLabel` | [myinvestor.statement.parser.ts:251](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L251) |
| Interpreta el número con el mismo normalizador que la columna `Importe` (coma decimal, punto de miles, signo, `€`) | `parseAmountText` | [myinvestor.format.ts](../../src/modules/myinvestor/myinvestor.format.ts) |
| El campo en el resumen de la ejecución (lo que devuelve el endpoint) | `ParsedStatementSummary` | [myinvestor.types.ts:54](../../src/modules/myinvestor/myinvestor.types.ts#L54) |
| Lo copia del resultado al resumen de cada archivo | `parseAndDump` | [myinvestor.service.ts:199](../../src/modules/myinvestor/myinvestor.service.ts#L199) |

### Bankinter (lo mínimo: una línea)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Emite `accountBalance: null` porque su export no trae esa línea; **nada** de cómo lee el `.xlsx` cambia | `parseBankinterXlsx` | [bankinter.parser.ts:94](../../src/modules/bankinter/bankinter.parser.ts#L94) |
| Doc del alias: su columna `Saldo` es otra cosa y sigue viajando en `balance` | `BankinterParseResult` | [bankinter.types.ts](../../src/modules/bankinter/bankinter.types.ts) |

### Fixtures

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Las dos líneas de preámbulo tal como las escribes tú (`Saldo` con mayúscula y relleno `;;;`) | `myinvestorPreamble` | [myinvestor.fixture.ts:117](../../src/modules/myinvestor/myinvestor.fixture.ts#L117) |
| El IBAN público de la documentación española, nunca uno real | `documentationIban` | [myinvestor.fixture.ts:122](../../src/modules/myinvestor/myinvestor.fixture.ts#L122) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Lee el saldo de la línea etiquetada, junto al IBAN | [parser.test.ts:400](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L400) |
| La etiqueta vale con mayúsculas, acentos y relleno (`Saldo`, `SALDO`, ` sáldo `) | [parser.test.ts:410](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L410) |
| Las cinco formas del número, con el normalizador de los importes | [parser.test.ts:427](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L427) |
| Si la línea falta o viene vacía: se parsea igual y el saldo es `null` | [parser.test.ts:445](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L445) |
| Los movimientos, su numeración y `unparsedRows` no cambian | [parser.test.ts:460](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L460) |
| No es el saldo por movimiento: ese sigue `null` en todas las líneas | [parser.test.ts:484](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L484) |
| La fila `Saldo` **del final** NO se lee | [parser.test.ts:500](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L500) |
| Se emite tal cual: no se cuadra, `0` es `0` y `-0,01` es `-0,01` | [parser.test.ts:516](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L516) |
| Importe ilegible → `unparsedRows` con su línea y su motivo (delegado) | [parser.test.ts:534](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L534) |
| Etiqueta repetida → gana la primera (delegado) | [parser.test.ts:551](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L551) |
| Fichero con BOM y fichero que no es UTF-8 (el guardián de la F17 actúa antes) | [parser.test.ts:566](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L566) |
| Un solo buscador, no dos casi iguales | [parser.test.ts:582](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L582) |
| El saldo llega al resumen del endpoint y al JSON volcado | [service.test.ts:74](../../src/modules/myinvestor/myinvestor.service.test.ts#L74) |
| Los dos «saldos» del contrato no se confunden ni se sustituyen | [parsed-statement.test.ts:97](../../src/lib/parsed-statement.test.ts#L97) |
| Guardián preexistente: el parser **nunca** acumula un saldo desde los importes (R19) | [parser.test.ts:299](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L299) |

## Cumplimiento de la intención

- ✅ «Escribo la línea del saldo bajo la del iban y el extracto parseado me devuelve ese
  saldo junto al IBAN» → se cumple; verificado en `myinvestor.statement.parser.test.ts:400`
  y de extremo a extremo (endpoint + volcado) en `myinvestor.service.test.ts:74`.
- ✅ «Los 11 movimientos se siguen leyendo igual, con sus importes y su numeración» →
  se cumple; verificado en `myinvestor.statement.parser.test.ts:460` (mismos
  movimientos y mismos motivos que sin la línea) y por los 30+ tests preexistentes del
  parser, verdes sin tocarlos.
- ✅ «Al quitar la fila `Saldo` del final, `unparsedRows` se queda vacío» → se cumple;
  verificado en `myinvestor.statement.parser.test.ts:475` (con las dos líneas de
  preámbulo, `unparsedRows` queda vacío) y en `:500` (si la fila del final se queda,
  cae ahí como hasta ahora, y **no** alimenta el saldo).
- ✅ «Si algún mes se me olvida la línea, el extracto se parsea igual y el saldo viene
  vacío» → se cumple; verificado en `myinvestor.statement.parser.test.ts:445` (ausente,
  vacía y sin celda de valor: las tres a `null`, sin nada en `unparsedRows`).

## Decisiones que se tomaron por ti

- **(delegado) La etiqueta y cómo se reconoce:** `saldo`, comparada **sin acentos, sin
  mayúsculas y sin espacios**, y solo si está **encima** de la fila de cabecera. Vive
  en `normalizeLabel` + `findPreambleLine`
  ([`myinvestor.statement.parser.ts:180`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L180)).
- **(delegado) Cómo se llama el campo:** `accountBalance`, emparejado con
  `accountIban` y nunca `balance` a nivel de resultado, para que nadie lo sume con el
  saldo por movimiento el día de la persistencia (ADR-019 §2).
- **(delegado) Cómo se interpreta el número:** con `parseAmountText`, el mismo
  normalizador de la columna `Importe`; no se escribió uno nuevo.
- **(delegado, no estaba en el `intent`) Si la etiqueta está pero el número no se
  entiende** (`saldo;mil quinientos`): no se tira en silencio, aparece en
  `unparsedRows` con su nº de línea y el motivo, y el resto del fichero se parsea
  igual. Rechazar el fichero entero sigue reservado a la codificación (F17) y a no
  tener cabecera.
- **(delegado, no estaba en el `intent`) Si la etiqueta aparece dos veces:** gana la
  **primera**, la misma regla que el IBAN desde la F12.
- **(añadido, consecuencia inevitable de compartir la forma de la salida)** El campo
  vive en el contrato común, así que **Bankinter emite `accountBalance: null`**: una
  línea, sin cambiar nada de cómo lee su `.xlsx`. El reviewer lo comprobó contra tu
  «no tocar el de Bankinter» y lo dio por bueno: lo que no se toca es su **formato de
  entrada** y su lectura; la forma de la salida es común por norma (ADR-013) y
  `accountIban` ya sentaba el precedente al revés.

## Qué NO se tocó / quedó fuera

- **No se persiste nada.** Ni Prisma, ni migraciones, ni el importador: el saldo llega
  al volcado y al resumen del endpoint y ahí se queda.
- **No se toca el formato del `.json` de producto** ni `docs/myinvestor-product-files.md`.
- **No se toca el parser de Bankinter** más allá de la línea del campo nuevo.
- **El parser no aprende la fila `Saldo` del final**: hay una sola forma de escribirlo.
  Acuérdate de borrarla al editar el fichero.
- No se cuadra el saldo contra la suma de los movimientos, ni se redondea.

## Notas para el futuro

- Cuando llegue la persistencia, `accountBalance` es el candidato natural para cuadrar
  el saldo de la cuenta de MyInvestor **sin** sumar movimientos (hoy `initialBalance`
  es el único ancla, ADR-011). Es decisión de producto y feature aparte.
- Si algún mes se te olvida borrar la fila del final, saldrá en `unparsedRows` con el
  motivo genérico `fecha de operación inválida ('Saldo')`. Es correcto así: un motivo
  específico obligaría al parser a saber algo de esa fila, que es justo lo que pediste
  evitar.
- Pendiente ajeno a esta feature: `src/modules/myinvestor/myinvestor.product.parser.test.ts`
  no pasa `prettier --check` (ya venía así). Se arregla con un `pnpm format` cuando
  toque.
