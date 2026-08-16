# Review — feature 16 `statement-balance`

Fecha: 2026-08-16 · Revisor: `reviewer` · Feature sin spec (`sdd: false`): el contrato
revisado es el `intent` + los **12 criterios de `acceptance`** de la feature 16 de
`feature_list.json`.

**Veredicto:** APROBADO (APPROVED)

Comprobado: los 12 criterios ↔ tests, el `que_no_quiero` entero, arquitectura
(ADR-013/018/019 y `docs/conventions.md` §Parsers de banco), convenciones,
verificación (`./init.sh` en verde: **412 tests, 0 fallos, 0 saltados**, `tsc` OK,
`oxlint` limpio, `prettier --check` limpio sobre **todos** los archivos tocados) y
CHECKPOINTS C1-C8. **Sin cambios requeridos.**

Resumen de cierre: [`../summaries/statement-balance.md`](../summaries/statement-balance.md).

---

## Juicio sobre los puntos marcados con lupa

### 1. 🔴 `accountBalance` en el contrato común obliga a Bankinter a emitir `null`

**No viola el `que_no_quiero`. La decisión del implementer es la correcta, y la
alternativa (campo solo en el resultado de MyInvestor) habría sido la equivocada.**

Qué se tocó **exactamente** de Bankinter, mirado en el diff y no en el informe:

- [`bankinter.parser.ts:94`](../../src/modules/bankinter/bankinter.parser.ts#L94) —
  una línea literal `accountBalance: null,` dentro del objeto de retorno, más su
  comentario. **Cero** cambios en `findIban`, en la detección de cabecera, en el
  mapeo de columnas o en la lectura del `.xlsx`.
- `bankinter.types.ts` — solo doc (+4 líneas de comentario). `BankinterParseResult`
  sigue siendo `ParsedStatement<'bankinter'>`, sin campos propios.
- `bankinter.parser.test.ts` — dos aserciones de **forma** actualizadas
  (`Object.keys(...)` y el `toEqual` del resultado completo). Ningún valor, ninguna
  fecha, ningún importe, ningún movimiento cambia.

Por qué no es una infracción:

- La prohibición del humano («no tocar el formato… de Bankinter») va sobre **el
  formato del fichero que él escribe y sobre cómo se lee**, que es lo que le cuesta
  trabajo y lo que se puede romper. Eso no se ha tocado en absoluto.
- La forma de la salida **no es propiedad del banco** por norma explícita:
  `docs/conventions.md` §«Lo que NO es propio de cada banco: la forma de la salida»
  dice que un banco «se adapta al contrato; no declara sus propios» tipos, y que «lo
  que solo trae algún banco —el saldo de la línea, el IBAN— es **opcional**:
  MyInvestor no los aporta y eso no se disimula inventando un cero». `accountBalance`
  es exactamente ese caso, con los papeles cambiados.
- El precedente es literal: `accountIban` ya vive en el contrato y **MyInvestor no lo
  exporta**; sale `null` allí sin que nadie lo llamara «tocar MyInvestor». Y la F11
  ya metió `daySequence` en el contrato con el mismo mecanismo.
- La alternativa habría exigido `interface MyinvestorStatementResult extends
  ParsedStatement`, que es justo lo que la norma prohíbe, y habría dejado el dato
  **invisible para el importador** (`import.service.ts` consume el contrato común y
  no puede volverse bank-specific: hay guardián en `architecture.test.ts` que lo
  impide). Coste de la vía elegida: una línea constante. Coste de la alternativa:
  romper ADR-013 y bloquear el consumo futuro.

Queda registrado y no miente: ADR-019 §1 lo dice con su alternativa descartada, y
`docs/api-contract.md:662` («Bankinter: `null`») y `:642-644` dejan escrito que el
volcado de Bankinter lleva ahora el campo. Es un cambio **aditivo** del contrato, y
la nota lo marca como aún no consumido por el frontend.

### 2. La confusión que la feature existe para evitar (criterio 6)

- **No comparten campo ni nombre.** `accountBalance` es del extracto
  ([`parsed-statement.ts:88`](../../src/lib/parsed-statement.ts#L88)); `balance` es
  del movimiento. Test que lo fija en los dos sentidos:
  [`parsed-statement.test.ts:97`](../../src/lib/parsed-statement.test.ts#L97) —
  comprueba que a nivel de resultado **no existe ninguna clave `balance`** y que un
  extracto puede tener saldo de cuenta con `balance: null` en sus líneas, sin que uno
  sea el sustituto del otro.
- [`myinvestor.statement.parser.test.ts:484`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L484)
  cierra el otro lado: ningún movimiento lleva una clave `accountBalance`.
- Los nombres no inducen a error hacia la persistencia: `accountBalance`/`accountIban`
  van emparejados (mismo prefijo, mismo nivel, mismo origen) frente a
  `ParsedMovement.balance`, y la tabla de `api-contract.md:660-669` explica los dos
  con la advertencia de no sumarlos.
- **Guardián R19 vivo y verde de verdad**:
  [`myinvestor.statement.parser.test.ts:299`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L299)
  sigue exigiendo que la **única** línea de código del parser que contiene `balance`
  sea `balance: null,`. Verificado que no se ha debilitado por accidente: el filtro es
  sensible a mayúsculas y `accountBalance` no lo satisface, así que el guardián sigue
  midiendo lo mismo que antes; corre dentro de los 412 verdes.

### 3. La etiqueta con mayúscula (criterio 2)

Fijado con la mayúscula real, no solo en minúscula:

- [`test:410`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L410)
  recorre `Saldo;…`, `SALDO;…`, ` sáldo ; … ;;;;` y `saldo;…`, los cuatro a `1500`.
- Y el fixture canónico
  [`myinvestor.fixture.ts:117-118`](../../src/modules/myinvestor/myinvestor.fixture.ts#L117)
  escribe `Saldo;` **con mayúscula y con el relleno `;;;`**, así que todos los tests
  de extremo a extremo (parser, servicio, volcado) usan la forma real del humano, no
  una cómoda. Coincide con `progress/prueba-drive-real-2026-08-15.md`.

### 4. La fila `Saldo` del final (criterio 7)

Verificado con test y con el mecanismo, no solo con la intención:

- [`test:500`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L500)
  construye un fichero con la fila de cierre `Saldo;1500,00;;;` **al final** y exige
  `accountBalance === null` y que esa fila caiga en `unparsedRows` con el motivo de
  siempre (`fecha de operación inválida`), como hasta hoy.
- Estructuralmente es imposible que la lea: `findPreambleLine` itera solo
  `index < headerLine - 1`
  ([`parser.ts:185`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L185)).
  No hay una segunda vía.

### 5. `findIbanLine` → `findPreambleLine`: ¿el IBAN se comporta igual?

Sí. Comparado el código viejo y el nuevo línea a línea:

- Mismo rango de búsqueda (solo por encima de la cabecera), misma primera celda
  exacta, mismo valor = segunda celda `trim`, mismo «gana la primera», mismo trato
  de los `;;;` de relleno.
- El «valor vacío → `null`» que antes hacía el buscador ahora lo hace el llamante
  ([`parser.ts:122`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L122)):
  resultado idéntico.
- Los 5 tests de la F12 siguen **sin tocar** y en verde (ausente, vacío, sin celda de
  valor, por debajo de la cabecera, tolerancia de espacios/mayúsculas/`;;;`, BOM):
  [`test:326-390`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L326).
- Única diferencia observable: la etiqueta se compara ahora **sin acentos**, así que
  un hipotético `Ibán;` pasaría a leerse. Es una ampliación en la dirección tolerante
  —ningún fichero antes aceptado cambia de resultado— y es coherente con lo que el
  criterio 2 pide y con la regla nueva de `conventions.md`. No es hallazgo.
- Que no queden dos buscadores gemelos lo vigila un test de fuente:
  [`test:582`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L582).

### 6. Las dos decisiones delegadas

- **Importe ilegible → `unparsedRows`**: encaja con la doctrina («lo que no está no es
  fallo; lo que está y no se entiende no se descarta en silencio») y está **probada**,
  no solo argumentada:
  [`test:534`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L534)
  fija el `row` y el `reason` exactos y que el resto del archivo se parsea igual.
  Rechazar el fichero entero queda, bien, reservado a codificación (ADR-018) y a
  cabecera ausente.
- **¿Puede confundirse con un `unparsedRows` de la tabla?** Comprobado a propósito:
  **no**, y por dos motivos independientes. (a) El `row` es el **número de línea del
  fichero** tanto para el preámbulo como para la tabla
  ([`parser.ts:100`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L100)
  y [`:112`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L112)), así
  que el número lleva al sitio correcto al abrir el archivo, que es el criterio ya
  fijado en la F12. (b) El `reason` es inconfundible (`saldo de la cuenta no
  interpretable ('…')` frente a `fecha de operación inválida` / `importe no
  interpretable` / `número de columnas inesperado`). Además se emite **antes** del
  bucle, así que la lista queda ordenada por línea como el resto.
- **Etiqueta repetida → gana la primera**: misma regla que el IBAN desde la F12 y hoy
  literalmente el mismo código; probada en
  [`test:551`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L551),
  incluido que la segunda línea **no** ensucia `unparsedRows` (está encima de la
  cabecera: no es data).

### 7. El BOM y la F17 (criterio 9)

`decodeUtf8Strict` sigue siendo **lo primero** que hace el parser
([`parser.ts:77`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L77)),
antes incluso de buscar la cabecera; la lectura del preámbulo se añadió **después** de
esa llamada, así que no la ha desplazado. Fijado por dos tests:
[`:566`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L566) (BOM
tolerado, saldo e IBAN leídos) y
[`:575`](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L575) (un
fichero cp1252 **con** línea de saldo lanza `NotUtf8Error`: el guardián actúa antes de
que el saldo llegue a leerse). Los tests de la F17 siguen intactos y verdes.

### 8. Documentación (criterio 11) — ninguna queda mintiendo

Revisado uno a uno, con el listón que tumbó a la F15:

- `docs/api-contract.md`: la forma del resultado común (`:642-644`) incluye
  `accountBalance`; §«Los dos "saldos" del contrato» (`:655-669`) explica la
  diferencia y dice **quién lo trae hoy** («Bankinter: `null`»); la nota 💶 del
  extracto de MyInvestor (`:743-765`) documenta etiqueta, normalización, ausencia,
  ilegible → `unparsedRows`, repetición, fila del final y el «no es el `balance`»; el
  ejemplo de respuesta de `POST /api/parser/myinvestor` (`:874`) y la lista de campos
  (`:905`) lo llevan.
- **Bankinter no queda desactualizado**: su resumen de ejecución (`parsed[]`) **no**
  cambió —su tipo de resumen es propio y no lleva el campo—, y el ejemplo del
  contrato (`:687-699`) sigue siendo exacto. Lo que sí cambió es su **volcado JSON**,
  y eso está dicho en `:642-644` y en la tabla de `:662`. Comprobado que no hay
  ninguna otra afirmación del tipo «el resultado tiene cuatro claves» sin actualizar.
- `docs/dar-de-alta-un-banco.md` §«El saldo de la cuenta va en la misma cabecera»:
  ejemplo con la mayúscula real y el relleno `;;;`, coma decimal, el aviso de que en
  los `.json` de producto **no** vale, el caso «se me olvidó» y el 🔴 de **borrar la
  fila del final**.
- `docs/conventions.md`: regla nueva generalizada (dato escrito a mano → línea de
  preámbulo etiquetada, y reutilizar `findPreambleLine`).
- `docs/architecture.md` **ADR-019**: completo, con las tres alternativas descartadas
  y con la consecuencia «no se persiste».
- `docs/roadmap.md`: la tabla de bancos y la lista de deberes del humano recogen la
  F16 (incluido borrar la fila del final).
- `docs/myinvestor-product-files.md` **sin tocar**, como exige el `que_no_quiero`.

### 9. Fixtures sin datos reales (criterio 12)

- Guardián de la F14 corrido **con sus dos capas**: `var/drive-read/` y `var/parsed/`
  están presentes en esta máquina, `comparisonUnavailable()` devuelve `null` y la
  suite termina con **0 saltados** (verificado ejecutando `./init.sh` yo mismo, no
  leyendo el informe).
- Cifras del fixture: `1500,00`, `12.345,67`, `-2.000`, `-60,50`, `0`, `-0,01`, todas
  inventadas y ninguna coincidente con `var/` (la capa de comparación habría fallado
  señalando archivo y línea). El IBAN es el público de la documentación española, ya
  en `allowedIbans`.
- Ningún archivo nuevo sin gitignorar, ningún dato real en los `.md` de la feature.

---

## Checkpoints

- **C1** ✅ arnés completo, `./init.sh` exit 0.
- **C2** ✅ una sola feature `in_progress` (la 16); `progress/current.md` describe la
  sesión activa y su plan.
- **C3** ✅ estructura y capas intactas (parser puro, sin Prisma; guardianes de
  `architecture.test.ts` verdes), sin dependencias nuevas, sin `console.log` ni TODOs
  añadidos, convenciones respetadas y **ampliadas** donde tocaba.
- **C4** ✅ 15 tests nuevos + los preexistentes; camino feliz y caminos de error
  (ausente, vacío, ilegible, repetido, fila del final, cp1252).
- **C5** ✅ el único archivo sin trackear es el informe de la feature; `history.md`
  tiene su línea de la última cerrada (F17). Falta solo el paso final que **no es
  mío**: el `implementer` marca `done` y añade la línea de la F16 al cerrar.
- **C6** ✅ el contrato cambió y `docs/api-contract.md` está actualizado en la misma
  feature, con la nota de «aún NO consumido por el frontend»; no se tocó nada del
  proyecto hermano.
- **C7** — no aplica (`sdd: false`).
- **C8** ✅ [`progress/summaries/statement-balance.md`](../summaries/statement-balance.md).

## Notas sin efecto sobre el veredicto

1. Las tres sugerencias fuera de scope del informe son razonables y quedan como
   están: el `prettier` pendiente de `myinvestor.product.parser.test.ts` es
   preexistente y ajeno al diff (verificado: ese archivo no está entre los
   modificados y los que sí lo están pasan `--check`); no persistir el saldo es lo
   que el `intent` pedía; y el motivo genérico de la fila del final es correcto, dar
   uno específico sería enseñarle al parser algo sobre esa fila.
2. `accountBalance` viaja hoy hasta el volcado y el resumen, y **nadie lo persiste**.
   Cuando llegue la feature que lo use, el sitio a mirar es
   `import.service.ts:119`, donde el importador ya lee `accountIban` del mismo
   contrato.
