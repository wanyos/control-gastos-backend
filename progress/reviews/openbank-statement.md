# Review — F19 `openbank-statement`

**Fecha:** 2026-08-19 · **Revisor:** subagente `reviewer` · **Feature:** 19, SDD,
`in_progress` en `feature_list.json` (única).

## Veredicto

**CHANGES_REQUESTED** — 5 puntos.

`./init.sh` ejecutado por el revisor: **verde**, `Test Files 39 passed (39)`,
`Tests 628 passed (628)`, **0 saltados** (el conteo del informe es exacto).
`package.json` y `pnpm-lock.yaml` **sin tocar** frente a git: cero dependencias
nuevas, confirmado contra el índice, no contra el informe.

El motivo del rechazo es **uno solo y es el 🔒**: hay **importes reales del
fichero de Openbank del humano en archivos versionados**. El resto de la feature
está, en mi lectura, correcta y bien hecha.

---

## Cambios requeridos

### 1. Importes reales copiados al fixture «sintético»

- [`src/modules/openbank/openbank.fixture.ts:176`](../../src/modules/openbank/openbank.fixture.ts#L176)
  — **el par (importe, saldo) de esa fila es un movimiento real** de
  `var/drive-read/openbank/2026/movimientos-2026-08-17.xls`: las dos cifras
  aparecen en el fichero real **contiguas** (a 10 caracteres una de otra), en ese
  mismo orden. No es una colisión: es una fila copiada.
- [`:161`](../../src/modules/openbank/openbank.fixture.ts#L161),
  [`:162`](../../src/modules/openbank/openbank.fixture.ts#L162),
  [`:167`](../../src/modules/openbank/openbank.fixture.ts#L167),
  [`:170`](../../src/modules/openbank/openbank.fixture.ts#L170) — los **importes**
  de esas cuatro filas son también importes reales del fichero, y **en el mismo
  orden relativo** que las primeras filas del extracto real (los saldos sí están
  cambiados; los importes no).

Qué hacer: **inventar esas cifras de verdad** (que no coincidan con ninguna del
fichero real) y corregir la cabecera del archivo
[`openbank.fixture.ts:1-15`](../../src/modules/openbank/openbank.fixture.ts#L1),
que hoy afirma que **todas** las cifras están inventadas y no es cierto. Los
conceptos, el titular y el CCC sí están inventados: ahí no hay nada que tocar
(comprobado palabra a palabra contra el fichero real; el único solape son
palabras de formato y verbos genéricos de banca).

### 2. El saldo real de la cuenta, en un docstring

- [`src/modules/openbank/openbank.format.ts:45`](../../src/modules/openbank/openbank.format.ts#L45)
  — la cifra que el comentario presenta como «el saldo del preámbulo con la
  divisa pegada» **es el saldo real de su cuenta**: aparece dos veces en el
  fichero real, una de ellas justo detrás de la etiqueta `Saldo`. Es el dato más
  sensible de los cinco puntos de esta lista.
- [`:42`](../../src/modules/openbank/openbank.format.ts#L42) — las tres cifras de
  ejemplo de ese mismo docstring son **importes reales** del fichero.

### 3. Los mismos importes reales, aseverados en tests

- [`src/modules/openbank/openbank.format.test.ts:38`](../../src/modules/openbank/openbank.format.test.ts#L38),
  [`:40`](../../src/modules/openbank/openbank.format.test.ts#L40),
  [`:46`](../../src/modules/openbank/openbank.format.test.ts#L46) — tres
  `expect(parseAmountText(...))` sobre cifras reales del fichero (la de `:46` es
  la mitad del par real del punto 1).

### 4. Un importe real en la documentación pública del contrato

- [`docs/api-contract.md:1123`](../../docs/api-contract.md#L1123) — el ejemplo de
  «importe con punto de miles y coma decimal» es un importe real del fichero.

### 5. El informe afirma lo contrario de lo que ocurre

- [`progress/implementations/openbank-statement.md:213`](../../progress/implementations/openbank-statement.md#L213)
  — «Fixtures: **importes**, conceptos, titular y CCC **inventados**». Es falso
  para los importes.
- [`:206`](../../progress/implementations/openbank-statement.md#L206) — criterio
  13 dado por cumplido («ni un nombre real»): el criterio del `intent` habla de
  nombres, pero el 🔒 de
  [`specs/openbank-statement/tasks.md:8`](../../specs/openbank-statement/tasks.md#L8)
  dice literalmente «ni un **importe**, concepto, IBAN, CCC ni nombre del fichero
  real», y el ADR-017 va de datos financieros reales, no solo de nombres.
  Corregir la afirmación cuando se corrijan las cifras.

---

## ⚠️ Hallazgo colateral (no bloquea esta feature, pero explica el fallo)

El guardián de la F14 **corrió con su capa de comparación activa** (los dos tests
de comparación no se saltaron: la suite reporta 0 saltados) y aun así **no podía
ver esta fuga**:

- [`src/no-real-data.test.ts:74`](../../src/no-real-data.test.ts#L74) —
  `captureExtensions` es `.txt .csv .json .md .tsv`: **el `.xls` de Openbank no se
  lee**, aunque sea texto plano (HTML) y perfectamente comparable.
- Y **no existe `var/parsed/openbank/`**, que es la otra vía por la que un fichero
  no legible entra a la comparación.

Resultado: el banco cuyo fichero trae **nombres de personas** es, hoy, el único
que el guardián no compara por ninguna de las dos vías. La afirmación del informe
«el guardián corrió con su capa de comparación activa» es cierta y a la vez **no
prueba nada para este banco**. Recomiendo al `leader` abrir una tarea (añadir
`.xls`/`.html` a `captureExtensions`, o exigir el volcado antes de cerrar un
banco nuevo); no la exijo dentro de esta feature porque toca la F14.

Nota de método: la comprobación se hizo localmente comparando el fichero
gitignoreado con los archivos versionados. **Ninguna de las cifras se reproduce
en este informe**, que también es un archivo versionado.

---

## Comprobado sin hallazgos

- **Puerta de aprobación (las decisiones son ley).** Los 6 puntos 🔴 aprobados el
  2026-08-19, uno por uno contra el código: (1) sin dependencia nueva —
  `package.json`/`pnpm-lock.yaml` intactos en git, lector propio en
  [`openbank.html.ts`](../../src/modules/openbank/openbank.html.ts); (2) cp1252
  solo aquí; (3) rechazo del fichero entero si no declara `iso-8859-1`; (4) IBAN
  en comentario HTML de la primera línea; (5) preámbulo ignorado en silencio;
  (6) divisa vacía. Ninguna alternativa tomada.
- **Guardia de la F17 no debilitada.** `decodeUtf8Strict` conserva su
  comportamiento; lo extraído es solo `assertNoReplacementCharacter`, con el
  motivo y el código a cargo de quien llama
  ([`src/lib/utf8.ts:40`](../../src/lib/utf8.ts#L40)), y hay test de regresión
  explícito ([`src/lib/utf8.test.ts:105`](../../src/lib/utf8.test.ts#L105)).
  Ningún concepto puede llegar al volcado con `U+FFFD`: guardia en
  [`cp1252.ts`](../../src/lib/cp1252.ts) más la aserción de que el resultado
  serializado no contiene el carácter de sustitución
  ([`parser.test.ts:57`](../../src/modules/openbank/openbank.statement.parser.test.ts#L57)).
- **R3 fijado por test:** sin `<meta>` y con otro charset → `UNEXPECTED_ENCODING`
  422, cero movimientos
  ([`parser.test.ts:69`](../../src/modules/openbank/openbank.statement.parser.test.ts#L69)).
  La declaración se lee de los bytes en `latin1` **antes** de decodificar.
- **IBAN:** solo de comentario anterior a `<table>`, con `;` y no con `:`, el
  primero gana, nunca derivado del CCC ni de un concepto con forma de IBAN
  ([`parser.test.ts:254`](../../src/modules/openbank/openbank.statement.parser.test.ts#L254)).
- **`unparsedRows`:** preámbulo y filas decorativas fuera; fila con forma de
  movimiento ilegible dentro, con nº de fila 1-based y todos sus motivos a la vez
  ([`parser.test.ts:320`](../../src/modules/openbank/openbank.statement.parser.test.ts#L320)).
- **ADR-013 intacto:** `balance: null` y `currency: ''` en todos los movimientos,
  `accountBalance` leído de la fila `Saldo:` del propio fichero (divisa
  descartada), ausente → `null`, ilegible → `unparsedRows`
  ([`parser.test.ts:192`](../../src/modules/openbank/openbank.statement.parser.test.ts#L192)).
- **Contrato común:** `ParsedStatement<'openbank'>` sin redeclarar nada
  ([`openbank.types.ts`](../../src/modules/openbank/openbank.types.ts)),
  `assignDaySequence(drafts, 'newest-first')` y `deriveMovementTypeFromAmount`
  importados; una fila no parseada no consume número de día.
- **HTTP:** `POST /api/parser/openbank` registrado bajo `/api/parser` y la línea
  del registro de parsers en [`src/app.ts:44`](../../src/app.ts#L44), con test de
  que `/api/import` deja de reportar sus `.xls` como `skipped`.
- **Arquitectura y convenciones:** guardianes de
  [`architecture.test.ts`](../../src/architecture.test.ts) ampliados a cuatro
  bancos (inventario de archivos, sin `prisma` en el módulo, sin código
  compartido entre bancos); `cp1252.ts` justificado en `lib/`; sin `console.log`
  ni TODOs.
- **Constancia del saldo por línea** (criterio 6 del `acceptance`): informe §4,
  docstrings del parser y de `openbank.types.ts`, y `api-contract.md`.
- **Decisiones delegadas resueltas por escrito:** IBAN →
  `docs/dar-de-alta-un-banco.md` §nueva; codificación → **ADR-022** en
  `docs/architecture.md` (+ nota en ADR-018), con nota de numeración que explica
  el `ADR-020` que decía el `design.md`.
- **C7 (SDD):** `decisions.md` de una página con sus bloques, 🔴 = 6 puntos cada
  uno con su alternativa; **15 requirements**, dentro del tope; procedencia
  completa y cada `R<n>` clasificado (`humano`/`delegado`/`añadido`); **T1-T29
  todas `[x]`**; cada `R1`-`R15` con al menos un test concreto, verificado uno a
  uno.
- **CHECKPOINTS C1, C2, C4, C5, C6.** C3 falla solo por el 🔒 de arriba (dato real
  versionado); **C8 no procede** todavía: **no se ha escrito
  `progress/summaries/openbank-statement.md`** porque el veredicto no es
  APPROVED.

---

# §Segunda pasada — 2026-08-19

**Veredicto:** **APPROVED**.

Los 5 puntos de la primera pasada están corregidos, **verificados con mi propio
método y no con el suyo**. Resumen de cierre:
[`progress/summaries/openbank-statement.md`](../summaries/openbank-statement.md).

## 1. Comprobación de fuga, rehecha desde cero

Método propio, ejecutado contra el `.xls` gitignoreado y **sin reproducir aquí
ninguna cifra**:

- Extraigo **todas** las celdas numéricas del fichero real (286 cifras distintas)
  y **los 399 pares contiguos** (importe, saldo) tal y como aparecen en el
  documento.
- Los cruzo contra **todas las líneas añadidas por esta feature**: los archivos
  nuevos enteros (`src/modules/openbank/*`, `src/lib/cp1252*`, el informe y este
  informe de review) más las **líneas `+` del diff** de los 14 archivos
  modificados, incluidos `docs/api-contract.md`, `docs/dar-de-alta-un-banco.md`,
  `docs/conventions.md`, `docs/architecture.md` y `progress/current.md`.

Resultado: **61 cifras escritas por la feature, 0 coincidencias** y **0 pares
contiguos** coincidentes. El solape de palabras (≥6 letras) con el fichero real
se reduce a un verbo genérico de banca; ni un nombre, ni un CCC, ni un IBAN.

- Los cuatro archivos que señalé están limpios:
  [`openbank.fixture.ts:171`](../../src/modules/openbank/openbank.fixture.ts#L171)
  (las diez filas reescritas, importes **y** saldos),
  [`openbank.format.ts:40`](../../src/modules/openbank/openbank.format.ts#L40),
  [`openbank.format.test.ts:35`](../../src/modules/openbank/openbank.format.test.ts#L35)
  y el ejemplo de `docs/api-contract.md`.
- **Orden relativo:** ya no hay nada que reproducir, porque ninguna de las cifras
  del fixture existe en el fichero real; y ningún par (importe, saldo) del
  fixture es un par del extracto.
- Las coincidencias que quedan en el repositorio son **cifras redondas de
  secciones de otros bancos anteriores a esta feature** (no están en líneas
  añadidas aquí). Coinciden por casualidad, no son «telling» para el guardián y
  no las escribió esta feature: **fuera del alcance**, como dice el informe.

## 2. Cabecera del fixture e informe

- [`openbank.fixture.ts:1`](../../src/modules/openbank/openbank.fixture.ts#L1) —
  ahora dice la verdad («concepto, número de cuenta, titular **y cifra**») y
  añade el bloque 🔴 con el fallo y la instrucción para quien toque cifras
  (inventar, no perturbar; cuidar los pares; comprobar antes de comitear).
- Informe: la fila del criterio 13 de la tabla de `acceptance` y la viñeta de
  fixtures del §Guardián **ya no afirman lo falso**; el error queda señalado en
  vez de reescrito, que es la forma útil de dejarlo.

## 3. Nada más se movió

- **Ni un `no-real-data-ok` nuevo**: las únicas apariciones del marcador en lo
  añadido son prosa que dice que no se ha usado.
- `package.json` y `pnpm-lock.yaml` **intactos** frente a git.
- Lo que aprobé en la primera pasada sigue igual, comprobado uno a uno: los 6
  puntos de la puerta (cp1252 solo aquí, rechazo entero sin `<meta>`, IBAN en
  comentario HTML, preámbulo en silencio, divisa vacía, sin dependencias),
  `balance: null` y `currency: ''` en el parser, `assignDaySequence` y
  `deriveMovementTypeFromAmount` importados, la línea del registro en
  [`src/app.ts:44`](../../src/app.ts#L44), la guardia de la F17
  ([`src/lib/utf8.ts:25`](../../src/lib/utf8.ts#L25) con su regresión en
  [`utf8.test.ts:111`](../../src/lib/utf8.test.ts#L111)) y el ADR-022. Los diffs
  de los archivos tracked son idénticos a los de la primera pasada salvo
  `progress/current.md`.

## 4. Los tests que cambiaron de cifra prueban lo mismo

[`openbank.format.test.ts:35`](../../src/modules/openbank/openbank.format.test.ts#L35)
conserva —y amplía— la cobertura: punto de miles, coma decimal, signo negativo y
positivo, **céntimos ≠ 00** en todos los casos donde importaba, el `0,00` del
caso neutral, la divisa pegada que se descarta, la cifra sin miles ni decimales y
los `null` de lo que no es un número. Ninguna aserción se borró ni se relajó
(`toBe` sigue siendo exacto). En el parser, la aserción del array de importes
mantiene sus ocho posiciones con el `0` en su sitio y las dos filas repetidas
idénticas; y las de `unparsedRows` siguen exigiendo `toEqual` con **el número de
fila y el motivo literales**
([`parser.test.ts:346`](../../src/modules/openbank/openbank.statement.parser.test.ts#L346)).

## 5. `./init.sh`, ejecutado por mí

`Test Files 39 passed (39)` · `Tests 628 passed (628)` · **0 saltados** · exit 0.

⚠️ **Nota honesta, y coincide con la que el implementer anotó:** de mis tres
ejecuciones de la suite completa, **una salió roja** con un único fallo,
`src/modules/import/import.routes.test.ts:163` («lists the imported movements most
recent first»), un `GET /api/movements` que devolvió 500. Ese archivo es de la
**F12 y esta feature no lo toca**; ejecutado solo, pasa; las otras dos pasadas
completas, verdes. Lo leo como **flakiness preexistente** de la suite de
integración contra Postgres cuando corre en paralelo, no como un fallo de la F19,
y por eso no bloquea. **Sí merece tarea propia**: un test que falla una de cada
tres veces acaba enseñando a ignorar el rojo, que es lo caro.

## Comprobado sin hallazgos

Todo lo de la primera pasada (que no se repite aquí) más: leak check sobre
**todos** los archivos versionados tocados en esta pasada, marcadores, integridad
de dependencias, equivalencia de las aserciones reescritas, `feature_list.json`
con una sola feature `in_progress` y `CHECKPOINTS` C1-C7. **C8 cumplido**:
[`progress/summaries/openbank-statement.md`](../summaries/openbank-statement.md).
