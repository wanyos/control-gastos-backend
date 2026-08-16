# statement-balance (F16) — implementación

> Feature sin spec (`sdd: false`): se trabajó del `intent` + los **12 criterios de
> `acceptance`** de `feature_list.json`, más la sección «Decisión del humano sobre el
> saldo» de [`../prueba-drive-real-2026-08-15.md`](../prueba-drive-real-2026-08-15.md).

## Qué hace ahora que antes no

El extracto `.csv` de MyInvestor admite una **segunda línea de preámbulo etiquetada**,
`saldo;<importe>`, junto a la del `iban;` que ya funcionaba, y el resultado parseado
expone ese saldo como **`accountBalance`** (nivel extracto), separado para siempre del
`balance` de cada movimiento.

## Archivos modificados / creados

Ninguno creado. Modificados:

| Archivo | Qué |
|---|---|
| [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) | `accountBalance: number \| null` en el contrato común `ParsedStatement`, con el comentario que lo distingue de `ParsedMovement.balance` |
| [`src/modules/myinvestor/myinvestor.statement.parser.ts`](../../src/modules/myinvestor/myinvestor.statement.parser.ts) | `findIbanLine` → `findPreambleLine(lines, headerLine, label)`; lectura del saldo con `parseAmountText`; `normalizeLabel` (sin acentos ni mayúsculas) |
| [`src/modules/myinvestor/myinvestor.types.ts`](../../src/modules/myinvestor/myinvestor.types.ts) | `accountBalance` en `ParsedStatementSummary` + doc del alias |
| [`src/modules/myinvestor/myinvestor.service.ts`](../../src/modules/myinvestor/myinvestor.service.ts) | el resumen de la ejecución lleva el saldo, junto al IBAN |
| [`src/modules/myinvestor/myinvestor.fixture.ts`](../../src/modules/myinvestor/myinvestor.fixture.ts) | `myinvestorPreamble()` y `documentationIban`: las dos líneas tal como las escribe él (`Saldo` con mayúscula y relleno `;;;`) |
| [`src/modules/bankinter/bankinter.parser.ts`](../../src/modules/bankinter/bankinter.parser.ts) · [`.types.ts`](../../src/modules/bankinter/bankinter.types.ts) | **una línea**: `accountBalance: null` (su export no trae esa línea). No cambia **nada** de cómo lee su `.xlsx` |
| Tests | `myinvestor.statement.parser.test.ts` (13 casos nuevos), `myinvestor.service.test.ts` (1), `parsed-statement.test.ts` (1), y la adaptación de 6 aserciones de forma preexistentes (`Object.keys`, dobles del importador) |
| Docs | `api-contract.md`, `dar-de-alta-un-banco.md`, `architecture.md` (**ADR-019**), `conventions.md`, `roadmap.md` |

## Decisiones tomadas

### 1. `accountBalance` vive en el contrato común, no en el módulo del banco

Lo delegado era «cómo se llama el campo sin que se confunda con el `balance` por
movimiento»; la pregunta de dónde vive la traía el enunciado. **Va en
`src/lib/parsed-statement.ts`**, con Bankinter emitiendo `null`.

- `docs/conventions.md` §Parsers de banco es explícito: lo que **no** se comparte es
  el código que **lee** el formato; la **forma de la salida sí**, y el módulo de un
  banco «solo declara lo suyo… su alias `<Banco>StatementResult`». Declarar aquí un
  `interface MyinvestorStatementResult extends ParsedStatement` habría sido justo lo
  que la norma prohíbe: un banco declarando su propia forma de resultado.
- El precedente es exacto: **`accountIban` ya está en el contrato** y MyInvestor no lo
  exporta tampoco. «Lo que el banco no aporta es `null` explícito» es la regla, no la
  excepción.
- Si viviera solo en el módulo, el **importador** (que consume el contrato común) no
  podría verlo nunca sin volverse bank-specific.
- Coste real: **una línea** en Bankinter. Ni su lectura del `.xlsx` ni su columna
  `Saldo` (que es otra cosa: el saldo por fila, y sigue en `balance`) se tocan.

### 2. El nombre: `accountBalance`, nunca `balance` a nivel de resultado

Es el saldo **de la cuenta** en la fecha del extracto: **uno por archivo**.
`ParsedMovement.balance` es el saldo **tras una línea**: uno por movimiento, y `null`
para siempre en MyInvestor (ADR-013). Comparten la palabra «saldo» en castellano y
nada más. Emparejarlo con `accountIban` (mismo prefijo, mismo nivel, mismo origen: una
línea que escribe el humano) hace que el par se lea solo. Queda escrito en tres sitios
que alguien leerá antes de persistirlo: el comentario del contrato, la tabla «Los dos
«saldos» del contrato» de `api-contract.md` y el ADR-019.

### 3. Etiqueta presente + importe ilegible → `unparsedRows` (delegado, no resuelto en el intent)

Las tres opciones eran: saldo vacío en silencio, `unparsedRows`, o fallo del archivo.
**`unparsedRows`**, con el nº de línea y el motivo `saldo de la cuenta no interpretable
('…')`. Por qué encaja con la doctrina del parser:

- **La ausencia no es un fallo** (criterio 4) y se respeta: línea que falta **o valor
  vacío** → `accountBalance: null`, `unparsedRows` intacto. Exactamente lo que hace el
  IBAN, y cubre el «algún mes se me olvida».
- **Lo que está y no se entiende no se descarta en silencio.** Es la regla que rige
  todo este parser desde la F6 («una fila que no se puede interpretar no se pierde: se
  reporta con su fila y su motivo»). Un `saldo;1.5OO,00` con una letra O tragado en
  silencio sería un dato perdido sin rastro, que es el pecado que la F17 acaba de
  cerrar por otro camino.
- **Rechazar el archivo entero sería desproporcionado.** Ese martillo está reservado a
  lo que es propiedad del **fichero completo**: su codificación (ADR-018) o no tener
  cabecera reconocible. El extracto sigue siendo perfectamente utilizable sin esa
  línea, así que tirarlo entero por ella castigaría 11 movimientos buenos por un typo.
- **Bonus de coherencia:** el humano pidió esta feature en parte para *limpiar*
  `unparsedRows` (la fila del final lo ensuciaba en todos los extractos). Con esta
  regla, `unparsedRows` vuelve a significar «mira esto», que es justo lo que él quería.

### 4. Etiqueta repetida → gana la primera

Misma regla que el IBAN desde la F12 (el buscador devuelve la primera coincidencia), y
ahora es literalmente el mismo código para las dos. Una segunda línea etiquetada no es
data (está encima de la cabecera), así que no va a `unparsedRows`. Documentado y con
test.

### 5. Un solo buscador, no dos casi iguales

`findIbanLine` se generalizó a `findPreambleLine(lines, headerLine, label)`. La feature
se eligió precisamente por reutilizar ese mecanismo; dejar dos funciones gemelas habría
dejado dos sitios donde arreglar el mismo bug. Hay un test que lo vigila
(`no debe existir findIbanLine`, `findPreambleLine` declarada una sola vez).

La etiqueta se normaliza **sin acentos y sin mayúsculas** (`normalizeLabel`): su
archivo real **ya dice `Saldo;` con mayúscula**, así que exigir minúscula habría roto
un archivo que él da por bueno.

### 6. El número, con `parseAmountText`

El normalizador que este banco ya tiene para su columna `Importe`. Cubre coma decimal,
punto de miles, signo y el `€`, y ya está probado contra las cinco formas numéricas que
conviven en el mismo fichero. Escribir un segundo normalizador para el mismo fichero
sería garantizar que un día divergen.

## Mapeo criterio ↔ test

Los tests nuevos están en
[`src/modules/myinvestor/myinvestor.statement.parser.test.ts`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts)
§«the labelled saldo preamble line (feature 16)» salvo donde se indica.

| # | Criterio | Test |
|---|---|---|
| 1 | Línea de preámbulo antes de la cabecera; campo propio del extracto | `reads the balance of the account from the labelled line, next to the iban (C1)` · `reads both labelled lines with a single finder, not two near-copies (C1)` · extremo a extremo: `carries the balance of the account to the summary and to the dump (C1)` (`myinvestor.service.test.ts`) |
| 2 | Etiqueta sin distinguir mayúsculas ni acentos | `recognizes the label whatever its casing, accents or padding (C2)` (`Saldo`, `SALDO`, ` sáldo `, `saldo`, con relleno `;;;`) |
| 3 | Mismo normalizador que los importes, sin escribir uno nuevo | `interprets the number with the same normalizer as the amounts (C3)` (5 formas) + la aserción de fuente `parseAmountText(accountBalanceLine.value)` |
| 4 | Ausente → se parsea igual y el saldo viene vacío; no es fallo | `parses the file all the same when the line is absent or empty (C4)` |
| 5 | Movimientos, importes, numeración y `unparsedRows` sin cambios | `changes nothing about the movements, their numbering or unparsedRows (C5)` · `does not let the saldo line reach unparsedRows nor the movements (C5)` · y los 30+ tests preexistentes del parser, verdes sin tocar su comportamiento |
| 6 | No se confunde con el `balance` por movimiento | `is NOT the per-movement balance: that one stays null on every line (C6)` · `keeps the account balance and the per-movement balance apart` (`src/lib/parsed-statement.test.ts`) · el guardián preexistente `never accumulates a balance from the amounts (R19)`, **intacto y verde** |
| 7 | No aprende a leer la fila `Saldo` del final | `does not learn to read the closing Saldo row at the END of the file (C7)` |
| 8 | Se emite tal cual: no se calcula, no se cuadra, no se redondea | `emits the balance exactly as written, without cuadrar it against anything (C8)` (incluye `0` → `0`, no `null`) |
| 9 | BOM tolerado y guardián UTF-8 actuando antes que nada | `reads the balance of a file written with the UTF-8 BOM his editor adds (C9)` · `never reaches the balance of a file that is not UTF-8: the guard acts first (C9)` |
| 10 | Ni Prisma, ni BD, ni JSON de producto, ni Bankinter | guardián preexistente `keeps the myinvestor parser module free of data access` (`architecture.test.ts`); la suite de producto y la de Bankinter, verdes sin cambios de comportamiento |
| 11 | `api-contract.md` + el documento del formato del fichero | `docs/api-contract.md` §Los dos «saldos» del contrato y §nota del extracto de MyInvestor; `docs/dar-de-alta-un-banco.md` §El saldo de la cuenta va en la misma cabecera (incluye que la fila del final **hay que borrarla**); ADR-019 y `conventions.md` |
| 12 | Fixtures sintéticos, guardián F14 verde, 0 saltados | `./init.sh` abajo; toda cifra es inventada y redonda, y el IBAN es el público de la documentación española |
| — | Delegado: importe ilegible | `reports the line, instead of dropping it, when the figure is unreadable (delegated)` |
| — | Delegado: etiqueta repetida | `keeps the first labelled line when it is written twice (delegated)` |

## Último `./init.sh`

```
── 4. Type checking (tsc) ── [OK] Type check OK
── 5. Ejecutando tests ────── Test Files 27 passed (27) · Tests 412 passed (412)
── 6. Resumen ────────────── [OK] Entorno listo.
```

**412 pasan, 0 fallan, 0 saltados** (baseline antes de la feature: 396). Los 0 saltados
importan: el guardián de la F14 corrió con su capa de comparación contra `var/` activa,
no solo la de forma. `pnpm lint` (oxlint) limpio y `prettier --check` limpio en todo lo
tocado.

## Sugerencias fuera de scope (NO aplicadas)

1. **`src/modules/myinvestor/myinvestor.product.parser.test.ts` no pasa
   `prettier --check`**, y ya no pasaba antes de esta feature (no está entre los
   archivos modificados). Un `pnpm format` lo arregla, pero es ruido ajeno a la F16 y
   ensuciaría su diff.
2. **El saldo no se persiste todavía.** Cuando llegue la persistencia de inversiones o
   la del flujo, `Account` tiene `initialBalance` como único ancla para MyInvestor
   (ADR-011): `accountBalance` es el candidato natural a cuadrar esa cuenta **sin**
   sumar movimientos, pero eso es una decisión de producto y una feature aparte.
3. **La fila `Saldo` del final ya solo produce ruido.** El humano la borra a mano y así
   se decidió (una sola forma de escribirlo). Si algún mes se le olvida borrarla,
   aparecerá en `unparsedRows` con el motivo genérico «fecha de operación inválida
   ('Saldo')»; un motivo que dijera «esta fila ya no se usa: el saldo va arriba» sería
   más útil, pero es enseñarle al parser algo sobre esa fila, que es justo lo que el
   criterio 7 prohíbe. Queda anotado, sin aplicar.
