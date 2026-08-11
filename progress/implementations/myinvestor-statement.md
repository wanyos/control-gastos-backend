# Implementación — F10 `myinvestor-statement`

- **Fecha:** 2026-08-11 · **Agente:** implementer · **Spec:** SDD, aprobado por el
  humano ese mismo día (`decisions.md` sin ningún 🔴).
- **Alcance:** **solo el extracto CSV** de la cuenta corriente de MyInvestor. Los
  JSON de producto son la **F13** y **no se ha adelantado ni una línea** de ellos.
- **Verificación:** `bash ./init.sh` → `[OK] Entorno listo`, **280 tests en 22
  ficheros** (baseline antes de la feature: 233 en 18 → **+47 tests, +4 ficheros**).
  `pnpm run lint`, `pnpm run format:check` y `pnpm run typecheck` limpios.
- **Las 18 tasks de [`tasks.md`](../../specs/myinvestor-statement/tasks.md) quedan
  `[x]`.**

## Archivos creados

Todos en `src/modules/myinvestor/` (módulo nuevo, slug de
[`normalizeBankName`](../../src/lib/drive-structure.ts#L66)):

| Archivo | Qué es | ¿La F13 lo espera? |
| --- | --- | --- |
| [`myinvestor.types.ts`](../../src/modules/myinvestor/myinvestor.types.ts) | **Solo lo suyo**: `MyinvestorStatementResult = ParsedStatement<'myinvestor'>` + `FailedFile`, `IgnoredFile`, `ParsedStatementSummary`, `MyinvestorParseRunResult` | **Sí** (reutiliza `FailedFile`/`IgnoredFile` y añade los suyos) |
| [`myinvestor.format.ts`](../../src/modules/myinvestor/myinvestor.format.ts) | `parseAmountText` (la regla única del separador de miles) y `parseStatementDate` (`dd/mm/aaaa` → ISO) | **Sí**: la F13 **importa `parseAmountText`** y añadirá aquí `parseIsoDate` |
| [`myinvestor.statement.parser.ts`](../../src/modules/myinvestor/myinvestor.statement.parser.ts) | Parser puro `parseMyinvestorStatement(Buffer)` | No (es la entrada 1) |
| [`myinvestor.service.ts`](../../src/modules/myinvestor/myinvestor.service.ts) | `parseLocalMyinvestorCopies(sourceBaseDir, dumpBaseDir)`: recorrido, `failed[]`, `ignored[]`, aislamiento por archivo y determinismo | **Sí**: la F13 añade **una rama `.json`** a este mismo bucle |
| [`myinvestor.routes.ts`](../../src/modules/myinvestor/myinvestor.routes.ts) | `POST /api/parser/myinvestor`, con `sourceBaseDir`/`dumpBaseDir` inyectables | **Sí**: la F13 **no la toca** |
| [`myinvestor.fixture.ts`](../../src/modules/myinvestor/myinvestor.fixture.ts) | Generador de CSV **sintético** en memoria + `writeLocalCopy` | **Sí** (le añadirá el generador de JSON) |
| `myinvestor.format.test.ts`, `myinvestor.statement.parser.test.ts`, `myinvestor.service.test.ts`, `myinvestor.routes.test.ts` | Los cuatro ficheros de test | — |

**Los nombres y ubicaciones que la F13 da por hechos se han respetado exactamente:
no hay ninguna desviación en este punto.**

## Archivos modificados

- [`src/app.ts`](../../src/app.ts) — registra `myinvestorRoutes` bajo el prefijo
  `/api/parser` que ya existía.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — 10 entradas nuevas
  en el árbol esperado + **3 guardianes nuevos** (ver «Decisiones»).
- [`docs/api-contract.md`](../../docs/api-contract.md) — sección «Parser de
  MyInvestor» con el endpoint, la respuesta 200 de ejemplo y las notas de que este
  banco **no aporta saldo ni IBAN** y de que un fallo por archivo **no** cambia el
  código HTTP.
- [`docs/architecture.md`](../../docs/architecture.md) — **ADR-014** (el 013 lo
  ocupa el contrato de la F11) + `modules/myinvestor/` en el árbol de «Estructura
  de carpetas».
- [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) — el paso
  que faltaba: **crear el módulo de parser** del banco nuevo, con las tres reglas
  no negociables y enlace a `docs/conventions.md` §Parsers de banco.
- [`feature_list.json`](../../feature_list.json) — feature 10 a `in_progress`
  (**no** a `done`: eso es después del reviewer).
- [`progress/current.md`](../current.md) y
  [`specs/myinvestor-statement/tasks.md`](../../specs/myinvestor-statement/tasks.md).

**Sin tocar:** `package.json`, `pnpm-lock.yaml` (**cero dependencias nuevas**),
`.gitignore`, `prisma/`, `src/lib/`, `src/errors/`, los módulos del flujo, el módulo
de Bankinter y `specs/investments-data-model/`.

## Diseño y decisiones tomadas

1. **Consume el contrato, no lo redeclara.** El módulo importa
   [`parsed-statement.ts`](../../src/lib/parsed-statement.ts) y solo declara el
   alias del banco, igual que
   [`bankinter.types.ts:14`](../../src/modules/bankinter/bankinter.types.ts#L14).
   El guardián de la F11 («una sola declaración de `ParsedMovement`/`UnparsedRow`/
   `ParsedMovementType` en `src/`») sigue **verde** con el módulo nuevo dentro.
2. **Saldo e IBAN: `null` explícito.** Cada movimiento sale con
   `balance: null` (clave **presente y nula**, nunca ausente y nunca `0`) y el
   resultado con `accountIban: null`. **No hay ningún `providesBalance`**: el
   resultado tiene **exactamente** las cuatro claves del contrato, y el JSON volcado
   tampoco lo lleva. El parser **no acumula ningún saldo**, ni en una variable local
   (hay un test que lee el propio fuente y exige que la única línea de código con
   `balance` sea `balance: null,`).
3. **`daySequence` la emite este parser** con `assignDaySequence(drafts,
   statementOrder)` y `const statementOrder = 'newest-first'` (mismo patrón que
   [`bankinter.parser.ts:10`](../../src/modules/bankinter/bankinter.parser.ts#L10)).
   La numeración va **la última**, sobre los `ParsedMovementDraft[]` ya filtrados:
   una fila de `unparsedRows` **no consume número**.
4. **La regla del signo se importa**
   ([`deriveMovementTypeFromAmount`](../../src/modules/movements/movements.service.ts#L33)),
   nunca se reescribe; el guardián de la F11 sobre todo `*.parser.ts` sigue verde y
   un importe `0` sale `neutral`.
5. **Cabecera por nombre, no por posición.** Normalización NFD + sin diacríticos +
   minúsculas + espacios colapsados; la única columna acentuada se reconoce por su
   **prefijo ASCII** `fecha de operaci`, así que sobrevive a un acento corrompido.
   La cabecera es la primera línea con columna de concepto **y** de importe.
6. **Una sola regla de números** (`parseAmountText`): coma → decimal español; sin
   coma con puntos cada tres dígitos → miles; en otro caso, punto decimal.
7. **Extensión decide el parser** (`.csv` → extracto; el resto → `ignored[]`,
   incluidos **de momento los `.json` de producto**) y **el banco sale de la
   carpeta**. Aislamiento por archivo con un `try` por archivo; respuesta **200**
   con `failed[]` dentro.
8. **Determinismo (R55):** años y archivos recorridos **ordenados** y volcado con
   `JSON.stringify(result, null, 2)` + `\n`, con las claves construidas
   literalmente → dos ejecuciones dan volcados **idénticos byte a byte**.
9. **Tres guardianes nuevos** en `architecture.test.ts`: módulo sin `prisma`,
   aislamiento entre módulos de banco y `normalizeBankName('MyInvestor') ===
   'myinvestor'` con la carpeta del módulo existente.

## Trazabilidad `R<n>` → test concreto

> Ficheros: `F` = `src/modules/myinvestor/myinvestor.format.test.ts`,
> `P` = `…/myinvestor.statement.parser.test.ts`,
> `S` = `…/myinvestor.service.test.ts`, `R` = `…/myinvestor.routes.test.ts`,
> `A` = `src/architecture.test.ts`.

| R | Test |
| --- | --- |
| R1 | `A` → *normalizes the bank name to the slug of its Drive folder and its module* + *contains the target tree of docs/architecture.md (ADR-004)* (10 entradas del módulo) |
| R2 | `A` → *shares no parsing code between bank modules (one parser per bank)* |
| R3 | `A` → *keeps the myinvestor parser module free of data access (no "prisma" reference)* |
| R4 | `S` → *does not move, delete or modify any source file (R4)* |
| R5 | `P` → *returns one movement per interpretable line, in file order* |
| R6 | `P` → *reads the same result with and without the UTF-8 BOM* + *recovers accented characters and the euro sign intact* |
| R7 | `P` → *finds the header on the 3rd line and with the columns in another order* + *still recognizes the accented column when its accent arrives mangled* |
| R8 | `P` → *fills every field of the first data line from its five columns (R8)* |
| R9 | `F` → *converts dd/mm/yyyy into ISO YYYY-MM-DD* + *rejects a day that does not exist instead of rolling it over*; `P` → *converts dd/mm/yyyy dates and rejects a day that does not exist* |
| R10 | `F` → *reads the five numeric shapes that coexist in a single statement* (+ los otros 3 casos); `P` → *interprets the five numeric shapes that coexist in the same file* |
| R11 | `P` → *derives the type from the sign, with an amount of 0 becoming neutral*; `A` → *takes the income/expense/neutral decision in a single place (feature 11)* |
| R12 | `P` → *copies the concept whole, keeping its contract number and double spaces* |
| R13 | `P` → *does not deduplicate: two identical lines produce two movements* |
| R14 | `P` → *collects an unreadable line with its 1-based line number and reason, and goes on* (+ *reports a line with an unexpected number of columns instead of guessing*) |
| R15 | `P` → *ignores blank lines instead of reporting them as unparsable* |
| R16 | `P` → *throws a ValidationError when the file has no recognizable header*; `S` → *isolates a broken file and parses the healthy ones all the same (R47)* |
| R17 | `P` → *emits balance present and null on every movement, never 0 (R17)*; `S` → *parses each local statement and writes a JSON dump per file (R52, R54)* (el volcado) |
| R18 | `P` → *emits exactly the four keys of the contract, with no providesBalance (R18)* |
| R19 | `P` → *never accumulates a balance from the amounts (R19)* (incluye el guardián sobre el fuente del parser) |
| R20 | `P` → *emits accountIban null without inferring it from an IBAN-shaped concept (R20)*; `S` → `accountIban: null` en el resumen y en el volcado |
| R25 | `S` → *takes the bank and the year from the folder, not from the contents (R25)* |
| R47 | `S` → *isolates a broken file and parses the healthy ones all the same (R47)* |
| R49 | `S` → *reports the extensions it does not handle in ignored, not as failures (R49, R50)* |
| R50 | `S` → *reports the extensions it does not handle in ignored, not as failures (R49, R50)* |
| R51 | `R` → *returns 200 with the parse summary and writes the JSON dump (R51)* + *is registered in the real app under the /api/parser prefix* |
| R52 | `S` → *parses each local statement and writes a JSON dump per file (R52, R54)* |
| R54 | `R` → *never exposes an absolute machine path in the body (R54)*; `S` → mismo test de volcado (`dumpPath` relativa, sin `\` ni el tempdir) |
| R55 | `S` → *produces byte-identical dumps on two consecutive runs (R55)* |
| R56 | `S` → *does nothing when there are no local copies (R56)* (carpeta vacía **y** carpeta inexistente); `R` → *returns 200 with an empty summary when there are no local copies (R56)* |
| R57 | `R` → *still returns 200 when a file fails, with the failure isolated (R57)* |
| R58 | **Requirement de proceso** (checklist del reviewer): `package.json` y `pnpm-lock.yaml` **sin cambios** en el diff |
| R59 | **Requirement de proceso** + `P` → *builds the CSV in code, with the five real column names and invented data*: fixtures sintéticos, sin datos reales ni red |
| R61 | **Requirement de proceso**: sección nueva en `docs/api-contract.md` |
| R62 | **Requirement de proceso**: **ADR-014** + árbol en `docs/architecture.md` |
| R64 | **Requirement de proceso**: paso nuevo en `docs/dar-de-alta-un-banco.md` |
| R65 | `A` → *contains the target tree of docs/architecture.md (ADR-004)* |
| R66 | **Requirement de proceso**: `bash ./init.sh` → `[OK] Entorno listo`, 280 tests en 22 ficheros |
| R67 | **Requirement de proceso**: este documento |
| R68 | `P` → *numbers each day from the oldest, knowing the bank exports newest-first* + *declares the export direction as a module constant* |
| R69 | `P` → *does not let an unparsable row of that day consume a number* |
| R70 | `P` → *satisfies the shared contract type (R70)*; `A` → *declares the parsed movement contract in ONE module only (feature 11)* |

## Desviaciones, precisiones y sugerencias fuera de scope

1. **Precisión sobre la verificación de R2 (no una desviación de la decisión).** El
   texto de R2 pide un guardián que compruebe que **«ningún otro archivo de `src/`
   importa `modules/myinvestor/`»**, pero `design.md` §1 exige (correctamente)
   **modificar `src/app.ts`** para registrar la ruta. Las dos frases no pueden ser
   ciertas a la vez. El guardián implementado exige que el **único** importador
   externo sea `app.ts` (la raíz de composición) y, además, que **ningún módulo de
   banco nombre a otro**, que es el invariante que R2 protege de verdad. Si el
   reviewer prefiere la lectura literal, hay que quitar el registro de la ruta y
   R51 dejaría de poder cumplirse.
2. **`failed[]` usa `reason`, no `error`.** Es lo que dice `design.md` §13 y §9.1, y
   difiere del `error` que usa el endpoint de Bankinter. Se ha seguido el spec.
   *Sugerencia fuera de scope (NO aplicada):* unificar el nombre en los dos
   endpoints cuando alguien toque el de Bankinter.
3. **Límite conocido (ya en el ADR):** una línea del CSV con un `;` dentro de un
   campo se reporta como `número de columnas inesperado` en `unparsedRows` en vez
   de parsearse. Es visible, no silencioso, y se reevalúa con el caso real delante.
4. **Sugerencia fuera de scope (NO aplicada):** `myinvestor.fixture.ts` y
   `bankinter.fixture.ts` son helpers de test que viven junto al código de
   producción y entran en el árbol esperado; si algún día molesta, la convención de
   dónde vive un fixture merece una línea en `docs/conventions.md`. No se ha tocado.
5. **Consecuencia operativa que el humano ya aprobó** (no es trabajo de esta
   feature): sin IBAN, la cuenta corriente de MyInvestor hay que **darla de alta a
   mano** por `POST /api/accounts`, y su `initialBalance` pasa a ser el **único
   ancla** de su saldo. Está escrito en el ADR-014 y en `docs/api-contract.md`.

## Estado final en `feature_list.json`

`"status": "in_progress"`. **No se marca `done`**: falta el veredicto del
`reviewer` y su `progress/summaries/myinvestor-statement.md`.
