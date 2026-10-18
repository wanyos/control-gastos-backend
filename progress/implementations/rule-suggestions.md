# rule-suggestions — implementación

> Nada de lo ejecutado ha escrito en la base del humano: todos los tests van contra la
> base desechable de cada worker (`gastos_test_<n>`), y `./init.sh` terminó en verde,
> incluida la foto de solo lectura que el `globalSetup` hace de su base antes y después.

## Lote A — implementación

### Archivos modificados / creados

| Archivo | Qué |
|---|---|
| `src/modules/category-rules/category-rules.service.ts` | T1: la decisión de qué movimiento se escribe, cuál choca y cuál no casa sale del bucle de `applyCategoryRules` a `planCategorization` (pura, exportada) con los tipos `PlannableRule`, `PlannedMovement`, `PlannedWrite`, `PlannedConflict`, `CategorizationPlan`; la lectura a `readCategorizationInput(prisma, scope)`; la conversión a `toCategorizedMovement` / `toCategorizationConflict` (privadas) y `toDateOnly` (exportada, la usa `listRuleSuggestions`). `applyCategoryRules` los usa. T3: `previewCategoryRule`; `assertCategoryExists` pasa a `existingCategoryOrThrow` (devuelve la categoría, hace falta su nombre y su `kind`); el mensaje del 409 sale de `duplicateMatchTextMessage`, que usan `createCategoryRule`, `updateCategoryRule` y `previewCategoryRule`. |
| `src/modules/category-rules/category-rules.suggestions.ts` (nuevo) | T4: `proposedMatchText` (pura, `design.md` §3), `listRuleSuggestions` (§5), constantes `minimumSuggestionLength = 5` y `minimumSuggestionMovements = 3`. |
| `src/modules/category-rules/category-rules.types.ts` | `CategorizationConflict` y `CategorizedMovement` pasan a genéricos en el tipo de `ruleId` (por defecto `number`: nada cambia para quien ya los usaba); nuevos `PreviewCategorizationResult`, `CategoryRulePreviewQuery`, `CategoryRulePreview`, `RuleSuggestion`. |
| `src/modules/category-rules/category-rules.schema.ts` | `previewCategoryRuleSchema` (querystring: `matchText` string `minLength 1`, `categoryId` entero `minimum 1`, los dos obligatorios, `additionalProperties: false`) y `previewCategoryRuleQueryProperties`. |
| `src/modules/category-rules/category-rules.routes.ts` | `GET /suggestions` y `GET /preview`; cabecera del archivo con las dos rutas. |
| `src/modules/category-rules/category-rules.service.test.ts` | Solo añadido (56 líneas, 0 quitadas): T2. |
| `src/modules/category-rules/category-rules.routes.test.ts` | Solo añadido (160 líneas, 0 quitadas): T7 y un test más de los parámetros de `GET /api/category-rules/preview`. |
| `src/modules/category-rules/category-rules.suggestions.test.ts` (nuevo) | T5 y T6. |
| `specs/61-rule-suggestions/tasks.md` | `[x]` en T1–T8. |

Ningún test existente se ha tocado: `git diff --numstat` da 0 líneas quitadas en
`category-rules.service.test.ts` y `category-rules.routes.test.ts`, y
`import.service.test.ts` no aparece en el diff.

### Decisiones tomadas

1. **Si `applyCategoryRules` falla a medias, `conflicts`, `conflictCount` y `unmatched` salen
   ya completos.** El diseño dice que salen del plan (`design.md` §2), y el plan está
   hecho antes de la primera escritura. Antes de la F61 se iban sumando en el bucle,
   así que tras un fallo a medias llevaban solo lo recorrido, y `conflictCount` se
   quedaba en 0 aunque `conflicts` tuviera elementos (se asignaba al final del bucle).
   `categorized` y `categorizedMovements` siguen igual: solo lo escrito antes del
   fallo. Ningún test ni línea de `docs/api-contract.md` describe aquel recuento
   parcial (lo he buscado en la tabla de campos de `categorization`, líneas
   2722-2731, y en la sección de `POST /api/category-rules/apply`).
2. **Un texto propuesto solo se considera si `normalizeForMatch(texto) === texto`.**
   El `POST` guarda `normalizeForMatch(matchText)`; si el texto cambiara al
   normalizarlo otra vez, la regla creada no sería la que se contó (R6). Con lo que
   hace hoy `proposedMatchText` solo podría pasar con letras cuyo paso a minúscula
   añade una marca combinante (p. ej. la `İ` turca). No cambia nada que el humano vea.
3. **Parámetro desconocido en `GET /api/category-rules/preview` → 400.** `design.md` §4 manda
   comprobar si AJV lo quita en silencio y, si lo quita, usar
   `assertOnlyAllowedBodyProperties` sobre `request.query`. Lo quita: otras rutas
   `GET` con `additionalProperties: false` tienen tests que lo comprueban
   (`src/modules/investments/investments.routes.test.ts`, `overview.test.ts`,
   `net-worth.test.ts`: «ignores an unknown querystring parameter»). Así que lo
   uso, y lo cubre el test «rejects a preview missing a parameter or carrying an
   unknown one with 400». El mensaje que da esa función dice `Unknown body property
   'x'` (ver sugerencias).
4. **En `listRuleSuggestions`, antes de llamar a `planCategorization` se dejan solo los
   movimientos que contienen el texto** (lo permite `design.md` §5.3). `planCategorization`
   decide movimiento a movimiento, así que el resultado no cambia.
5. **El filtro `winner.id === null` de `listRuleSuggestions`** (§5.3) no cambia el resultado en
   ningún caso que yo haya podido montar: con la categoría `-1`, un movimiento que
   casa la regla hipotética y una existente siempre sale como choque. Lo dejo porque
   es lo que pide el diseño y protege si un día cambia `planCategorization`. Al quitarlo, los
   tests siguen en verde (comprobado: ver más abajo).

### Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `category-rules.suggestions.test.ts` «lists the concepts of the generic category ordered by how many movements their rule would take, each with its proposed text» (forma completa con `toEqual`, orden por número y empate por texto, gasto e ingreso por separado, `movementCount === movements.length`, movimientos `pending_review` sin categoría y con `categorySource` `closing` juntos) |
| R2 | «derives the proposed rule text from bank descriptions» (la tabla de `design.md` §3 entera y dos casos más) |
| R3 | «always proposes a piece of the normalized description itself» (dobles espacios, acentos, eñes, símbolos, comillas) |
| R4 | «derives the proposed rule text from bank descriptions» (`ABC 1234` → `null`, `1234 5678` → `null`) |
| R5 | «does not propose a concept an existing rule already takes» (incluye un caso donde solo R5 decide: la regla casa con un trozo de después del primer número); y «never proposes a text that is already the matchText of a rule of either kind» (corrección tras la revisión) |
| R6 | «the count of a suggestion is what creating its rule moves by that rule» (por cada propuesta, `POST` y comparación con su lista; un movimiento que casa también con una regla existente no cuenta); y `category-rules.service.test.ts` «planCategorization writes a single category, lists two as a conflict and counts no match» |
| R7 | «lists the concepts…» (uno con 2 movimientos no sale) |
| R8 | «hides a suggestion whose movements another suggestion already takes» (contenida en otra con más movimientos, y dos con los mismos movimientos: queda la de texto más corto) |
| R9 | «counts the movements set by hand that contain the text but never includes them» (un `manual` del mismo tipo suma; uno `rule` y un `manual` de ingreso no) |
| R10 | `category-rules.routes.test.ts` «previews exactly the categorization that creating the rule then returns» (con un choque, un pendiente, un ingreso y un movimiento que el `POST` mueve por la regla existente) |
| R11 | «rejects a preview like the rule would be rejected» (400, 404 y 409 con la misma respuesta entera que el `POST`); y «rejects a preview missing a parameter or carrying an unknown one with 400» |
| R12 | «neither the suggestions nor the preview write anything» (todas las columnas de los movimientos del test, `updatedAt` incluido, y todas las reglas: iguales antes y después; las dos consultas devuelven algo que movería) |
| R13 | Los tests existentes de `category-rules.service.test.ts`, `category-rules.routes.test.ts` e `import.service.test.ts` sin tocar y en verde; «planCategorization writes…»; `pnpm test` entero |
| R14 | Lote B |

**Comprobación de que los tests de R5 y R8 pueden fallar** (cambiando el código a
mano y volviéndolo a dejar como estaba, con `git status` y lectura de las líneas
después):

- Quitar el filtro de R8 → falla «hides a suggestion whose movements another
  suggestion already takes» (`Tests  1 failed | 6 passed (7)`).
- Quitar el filtro de R5 → con la primera versión del test **no fallaba** (la
  propuesta caía igual por R6 y R7), así que añadí el caso de la regla `<tag> 12`;
  con él, falla «does not propose a concept an existing rule already takes»
  (`Tests  1 failed | 6 passed (7)`).
- Quitar `winner.id === null` → `Tests  7 passed (7)` (ver decisión 5).

### Datos de prueba

Todo inventado. Las descripciones son las de `design.md` §3 y otras del mismo
estilo, con una etiqueta de seis consonantes al azar en cada test para que ningún
texto se cruce con otro. Importes de tres cifras significativas o menos.
`src/no-real-data.test.ts` señaló en la primera ejecución de `./init.sh` dos líneas de
`category-rules.suggestions.test.ts` (47 y 48: secuencias de tres palabras que
están en la base del humano; una era la fórmula del banco de una transferencia).
Las reescribí, junto con la de al lado, y pasa. No hay fixtures `.xls` ni `.pdf`.

### Documentos actualizados

Ninguno: lo que hay que escribir en documentos es el Lote B. Búsquedas lanzadas:

- `git grep -n "assertCategoryExists" -- . ':!progress' ':!specs'` → sin resultados.
- `git grep -n "inline\|loop of applyCategoryRules\|matchingRules" -- docs README.md` →
  `docs/architecture.md:3226` (ADR-038: «exportada, `matchingRules`, sin cambiar lo
  que hace»), que sigue siendo verdad.
- `git grep -n "category-rules/apply" -- docs README.md` → la fila de `README.md:78`
  y las secciones de `docs/api-contract.md`; ninguna se vuelve falsa. Faltan las dos
  filas y las dos secciones nuevas, que son T9 y T10 (Lote B).
- `git grep -n -i "conflictCount" -- docs README.md` → nada describe el recuento
  tras un fallo a medias (decisión 1).

### Prueba real

No se ha hecho ni se debe hacer desde aquí: la feature no lee un archivo ni una API
de fuera, lee la base, y el encargo prohíbe ejecutar nada contra la base del humano.
La prueba con sus datos la hace él (`decisions.md` §📌).

### Corrección tras la revisión del 2026-10-18 (`progress/reviews/rule-suggestions.md`, punto 1 y 2)

**Qué fallaba:** `listRuleSuggestions` proponía un texto que ya era el `matchText` de
una regla del otro tipo. Como `matchText` es único en toda la tabla, crear esa regla
(o pedir `GET /api/category-rules/preview` con él) da 409, y la propuesta enseñaba
movimientos que su regla no podía mover nunca.

**Arreglo** (`src/modules/category-rules/category-rules.suggestions.ts`, bucle de
candidatos): se descarta todo candidato igual al `matchText` de cualquier regla
existente, sea del tipo que sea (`existingMatchTexts`, sacado de las mismas reglas
que lee `readCategorizationInput`).

**Tests** (`category-rules.suggestions.test.ts`):

- «does not propose a concept an existing rule already takes»: la regla de ingreso
  que antes tenía justo el texto propuesto (`libreria <tag>`) pasa a `<tag> 5`, un
  texto que esos gastos contienen pero que no es el propuesto. El test sigue
  comprobando que una regla del otro tipo no impide proponer por casar, y ya no da
  por buena una propuesta imposible de crear.
- Nuevo: «never proposes a text that is already the matchText of a rule of either
  kind»: regla de ingreso `libreria <tag>` y tres gastos `LIBRERIA <tag> 5` → no se
  propone (sí `papeleria <tag>`, de control), y `GET /api/category-rules/preview`
  con ese texto da 409.
- Comprobado que el test nuevo puede fallar: desactivando a mano el descarte
  (`existingMatchTexts.has(text) && false`) → `Tests  1 failed | 7 passed (8)`, falla
  justo él; restaurado después (línea 141 leída de vuelta).

**Contrato (Lote B, no lo he tocado):** con el arreglo, los párrafos de
`docs/api-contract.md:816-818` y `:921-925` vuelven a ser verdad para toda propuesta
de la lista. Lo que no dice el contrato es la nueva regla de exclusión: en «De qué
movimientos sale» (`:822-827`) o en «Qué propuestas salen» faltaría una línea del
estilo «no se propone un texto que ya es el `matchText` de una regla, de cualquier
tipo: no se podría crear». Es del Lote B.

Antes de lanzar la suite: ningún `node.exe` con `vitest` en la línea de comandos
(`Get-CimInstance Win32_Process` → 0).

### Último ./init.sh

`./init.sh` → `exit=0` (tras la corrección):

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  87 passed (87)
      Tests  1481 passed (1481)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 61

`./init.sh --checks 61` → `exit=0`, **8 de 8 en verde** (tras la corrección):

```
[1] … -t "lists the concepts of the generic category ordered by …"   [OK] exit 0  Tests  1 passed | 7 skipped (8)
[2] … -t "derives the proposed rule text from bank descriptions"     [OK] exit 0  Tests  1 passed | 7 skipped (8)
[3] … -t "does not propose a concept an existing rule already takes" [OK] exit 0  Tests  1 passed | 7 skipped (8)
[4] … -t "previews exactly the categorization that creating the rule then returns"  [OK] exit 0  Tests  1 passed | 25 skipped (26)
[5] … -t "the count of a suggestion is what creating its rule moves by that rule"   [OK] exit 0  Tests  1 passed | 7 skipped (8)
[6] … -t "neither the suggestions nor the preview write anything"    [OK] exit 0  Tests  1 passed | 25 skipped (26)
[7] … category-rules.docs.test.ts -t "api-contract: describes the rule suggestions and the preview of a rule"  [OK] exit 0  Tests  1 passed | 2 skipped (3)
[8] pnpm test                                                         [OK] exit 0
[OK]    Checks: 8 de 8 en verde.
```

### Sugerencias fuera de scope (NO aplicadas)

- `assertOnlyAllowedBodyProperties` (`src/lib/strict-body.ts`, fuera del Lote A)
  responde `Unknown body property 'x'` también cuando lo desconocido es un parámetro
  de la URL de `GET /api/category-rules/preview`. Un parámetro con el nombre de lo que valida
  (cuerpo o URL) haría el mensaje exacto. Coste: una función y su test.
- No he medido el tiempo de respuesta de `GET /api/category-rules/suggestions` con un
  volumen como el de la base del humano (unos 1.500 gastos). El coste crece con
  textos candidatos × movimientos del mismo tipo; para medirlo haría falta sembrar
  ese volumen inventado en la base de tests y cronometrar la consulta.

## Lote B — implementación

> Nada de lo ejecutado ha escrito en la base del humano: solo `./init.sh` y
> `./init.sh --checks 61`, que van contra las bases desechables de los tests.

### Archivos modificados / creados

| Archivo | Qué |
|---|---|
| `docs/api-contract.md` | T9: secciones `` ### `GET /api/category-rules/suggestions` `` y `` ### `GET /api/category-rules/preview` `` justo después de `POST /api/category-rules/apply` (antes de `GET /api/movements`), cada una con parámetros, ejemplo JSON inventado, tabla de campos y errores; en la de la lista, cómo se saca el texto propuesto (los 5 pasos de R2 y una tabla de ejemplos de `design.md` §3), el mínimo de 5 caracteres y de 3 movimientos, lo que no cuenta (R5, R6, R8, R9) y que el número es el que mueve el `POST`. En `### POST /api/category-rules`, un párrafo que remite a `GET /api/category-rules/preview`. |
| `README.md` | T10: dos filas en la tabla de endpoints, tras `POST /api/category-rules/apply`. |
| `docs/architecture.md` | T10: ADR-039, tras ADR-038. ADR-038 no se ha tocado. |
| `src/modules/category-rules/category-rules.docs.test.ts` | T11: un `describe` nuevo al final con el test «api-contract: describes the rule suggestions and the preview of a rule». Los dos tests que ya había, sin tocar. |
| `specs/61-rule-suggestions/tasks.md` | `[x]` en T9–T11. |

`progress/current.md` no lo he tocado (no está en `Archivos:` del lote): falta
anotar ahí que el Lote B está hecho.

### Decisiones tomadas

1. **Títulos con comillas invertidas**, `` ### `GET /api/category-rules/suggestions` ``,
   como todas las secciones de rutas del contrato (la T9 los escribe sin ellas). El
   test busca el título con ellas.
2. **El título del ADR-039 no es literal el de `design.md` §9.** Aquel dice «la
   consulta previa» y «la misma función de reparto», que son descripciones de
   `requirements.md` y no están en `CLAUDE.md` ni en `docs/vocabulary.md`. En el
   ADR y en el contrato he puesto en su lugar las rutas
   (`GET /api/category-rules/preview`) y los nombres de las funciones
   (`planCategorization`, «la misma función que decide qué escribe la
   categorización por reglas»). El contenido es el de §9; añadí también la
   alternativa de una sola ruta (`design.md` §10). «Pasada» sí aparece, como ya
   la usaba el contrato en las secciones de `category-rules`.
3. **Dos ejemplos independientes.** El de la lista usa `supermercado inventado`,
   `academia ficticia norte` y `cooperativa sintetica` (tres propuestas: una con 4 y
   dos con 3, para que se vea el desempate alfabético y una de ingreso); el de
   `GET /api/category-rules/preview` usa `kiosco de prueba` con un choque contra
   una regla existente. Si compartieran texto, los dos ejemplos tendrían que cuadrar
   movimiento a movimiento entre sí.
4. **En el contrato digo que la regla que aún no existe va siempre la última** en
   `rules` y en `matches`. Lo he comprobado en el código, no ejecutándolo:
   `previewCategoryRule` la añade al final de la lista de reglas
   (`[...rules, notCreatedYet]`) y `matchingRules` es un `filter`, que conserva el
   orden. Lo comprueba el test de la T7 «previews exactly the categorization that
   creating the rule then returns», que compara con el `POST`.
5. **El 400 por parámetro desconocido** está en el contrato sin citar el mensaje,
   que hoy dice `Unknown body property` (ver la sugerencia del Lote A).

### Trazabilidad

| R | Test |
|---|---|
| R14 | `category-rules.docs.test.ts` «api-contract: describes the rule suggestions and the preview of a rule»: las dos secciones existen; el ejemplo JSON de cada una se parsea; cada propuesta tiene exactamente `matchText`, `kind`, `movementCount`, `movements`, `manualMatches` en ese orden, con `movementCount === movements.length`, al menos 3 movimientos, texto de al menos 5 caracteres, movimientos por id ascendente con sus cuatro campos, y el ejemplo va en el orden que el contrato dice; el de `GET /api/category-rules/preview` tiene `matchText`, `categoryId`, `categorization` con los campos del `POST` sin `error`, y cada movimiento lleva la regla nueva al final con `ruleId: null`, igual que cada choque; las dos secciones nombran el mínimo de 3 movimientos y de 5 caracteres, dicen «no escribe nada», cómo se saca el texto, que el número es el que mueve la regla, los tres errores con el mismo `message`, y `POST /api/category-rules` enlaza a `GET /api/category-rules/preview`. |

**Comprobación de que el test puede fallar:** cambiando en el ejemplo de
`GET /api/category-rules/preview` `"ruleId": null` por `99` →
`Tests  1 failed | 2 passed (3)` (`AssertionError: expected { ruleId: 99, …(1) } to
deeply equal { ruleId: null, …(1) }`). Restaurado desde una copia del archivo;
después, `Tests  3 passed (3)`.

### Documentos actualizados

Los de la tabla de arriba. Búsqueda lanzada para ver si algo más lista las rutas
de `category-rules` o describe el bucle de `applyCategoryRules`:

`git grep -n "category-rules/apply\|category-rules\.routes\|planCategorization" -- . ':!progress' ':!specs' ':!src'`
→ `README.md:78` (la fila de `apply`, sigue siendo verdad), `docs/architecture.md`
(ADR-038 y el nuevo ADR-039), `docs/data-model.md:295` (escritores de `categoryId`:
las dos rutas nuevas no escriben nada, sigue siendo verdad) y `feature_list.json`
(histórico de features). Ninguna línea se vuelve falsa.

### Prueba real

No aplica: el Lote B solo escribe documentos y un test que lee `docs/api-contract.md`.

### Último ./init.sh

`./init.sh` → `exit=0`:

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ───────────────────────────────────
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  87 passed (87)
      Tests  1480 passed (1480)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Antes de lanzarlo comprobé que no había otro vitest en marcha (ningún `node.exe`
con `vitest` en su línea de órdenes).

### Último ./init.sh --checks 61

`./init.sh --checks 61` → `exit=0`, **8 de 8 en verde**:

```
[1] … -t "lists the concepts of the generic category ordered by …"   [OK] exit 0  Tests  1 passed | 6 skipped (7)
[2] … -t "derives the proposed rule text from bank descriptions"     [OK] exit 0  Tests  1 passed | 6 skipped (7)
[3] … -t "does not propose a concept an existing rule already takes" [OK] exit 0  Tests  1 passed | 6 skipped (7)
[4] … -t "previews exactly the categorization that creating the rule then returns"  [OK] exit 0  Tests  1 passed | 25 skipped (26)
[5] … -t "the count of a suggestion is what creating its rule moves by that rule"   [OK] exit 0  Tests  1 passed | 6 skipped (7)
[6] … -t "neither the suggestions nor the preview write anything"    [OK] exit 0  Tests  1 passed | 25 skipped (26)
[7] … category-rules.docs.test.ts -t "api-contract: describes the rule suggestions and the preview of a rule"  [OK] exit 0  Tests  1 passed | 2 skipped (3)
[8] pnpm test                                                         [OK] exit 0
[OK]    Checks: 8 de 8 en verde.
```

### Sugerencias fuera de scope (NO aplicadas)

- La línea del árbol de `README.md` para `category-rules/` («Reglas de
  categorización automática y su pasada») no nombra las propuestas. No es falsa;
  se podría ampliar con «y las reglas propuestas».

### Lote B — corrección tras la revisión (2026-10-18)

Lo que pedía la subsección «Corrección tras la revisión» del Lote A:

- `docs/api-contract.md`, `GET /api/category-rules/suggestions` §«Qué propuestas
  salen»: nueva línea «**No se propone un texto que ya es el `matchText` de una
  regla**, de cualquier tipo (también de una regla de ingresos para una propuesta de
  gastos): `matchText` es único entre todas las reglas, así que crearla daría 409.»
- `docs/architecture.md`, ADR-039 decisión 3: la misma regla en una frase.
- `category-rules.docs.test.ts`, el mismo test de la T11: ahora exige esa frase.
  Comprobado que puede fallar: quitando la línea del contrato →
  `Tests  1 failed | 2 passed (3)`; restaurado desde copia → `Tests  3 passed (3)`.

Antes de la suite: 0 procesos con `vitest` en la línea de órdenes
(`Get-CimInstance Win32_Process`).

**Último ./init.sh** → `exit=0`: tsc OK, lint OK, format:check OK,
`Test Files  87 passed (87)`, `Tests  1481 passed (1481)`, «Entorno listo».

**Último ./init.sh --checks 61** → `exit=0`, **8 de 8 en verde** ([1], [2], [3], [5]:
`Tests  1 passed | 7 skipped (8)`; [4], [6]: `1 passed | 25 skipped (26)`; [7]:
`1 passed | 2 skipped (3)`; [8] `pnpm test` exit 0).
