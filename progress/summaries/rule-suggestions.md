# Resumen — feature 61 `rule-suggestions`

Fecha de cierre: 2026-10-18
Intención original: `feature_list.json` → feature `rule-suggestions`, bloque `intent`
Spec (SDD): `specs/61-rule-suggestions/`

## Qué hace ahora la app que antes no

Ahora la app te propone reglas. Saca de `Otros gastos` / `Otros ingresos` (y de lo
pendiente sin categoría) los conceptos que más se repiten. Cada uno viene con el
texto de regla propuesto y los movimientos que recogería, de más a menos. Además,
antes de crear cualquier regla puedes preguntar qué movería exactamente, sin crearla.
Las dos consultas solo leen: crear la regla sigue siendo el `POST` de siempre, y
la categoría la eliges tú.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/category-rules/suggestions`: la lista de reglas propuestas | [category-rules.routes.ts:117](../../src/modules/category-rules/category-rules.routes.ts#L117) |
| `GET /api/category-rules/preview?matchText=…&categoryId=…`: qué haría crear la regla | [category-rules.routes.ts:122](../../src/modules/category-rules/category-rules.routes.ts#L122) |
| Calcula la lista de propuestas | [category-rules.suggestions.ts:111](../../src/modules/category-rules/category-rules.suggestions.ts#L111) |
| Calcula la consulta previa | [category-rules.service.ts:410](../../src/modules/category-rules/category-rules.service.ts#L410) |
| La única función que decide qué escribe una regla | [category-rules.service.ts:246](../../src/modules/category-rules/category-rules.service.ts#L246) |

## Dónde está el código

### Decidir qué escribe una regla (compartido)

| Qué hace | Dónde |
| --- | --- |
| Para cada movimiento: una sola categoría → se escribe; dos o más → choque; ninguna → no casa | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `planCategorization` (tipos `PlannableRule`, `PlannedMovement`, `PlannedWrite`, `PlannedConflict`, `CategorizationPlan`) |
| Lee reglas y movimientos elegibles igual para la categorización, la consulta previa y la lista | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `readCategorizationInput` |
| Da forma a cada movimiento escrito y a cada choque en la respuesta | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `toCategorizedMovement`, `toCategorizationConflict`, `toDateOnly` |
| La categorización por reglas, ahora apoyada en lo anterior | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `applyCategoryRules` |

### Consulta previa

| Qué hace | Dónde |
| --- | --- |
| Valida como el `POST` (400, 404, 409) y calcula sin escribir | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `previewCategoryRule`, `existingCategoryOrThrow`, `duplicateMatchTextMessage` |
| Parámetros de la URL | [category-rules.schema.ts](../../src/modules/category-rules/category-rules.schema.ts) → `previewCategoryRuleSchema`, `previewCategoryRuleQueryProperties` |
| Tipos de la respuesta | [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts) → `CategoryRulePreview`, `PreviewCategorizationResult`, `CategoryRulePreviewQuery` |

### Lista de reglas propuestas

| Qué hace | Dónde |
| --- | --- |
| Saca el texto propuesto de una descripción | [category-rules.suggestions.ts](../../src/modules/category-rules/category-rules.suggestions.ts) → `proposedMatchText` |
| Arma la lista: aplica los mínimos, quita lo que ya recoge una regla o lo que repite el texto de una, quita lo que otra propuesta ya incluye y ordena | [category-rules.suggestions.ts](../../src/modules/category-rules/category-rules.suggestions.ts) → `listRuleSuggestions`, `isCoveredBy`, `minimumSuggestionLength`, `minimumSuggestionMovements` |
| Tipo de cada propuesta | [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts) → `RuleSuggestion` |

### Documentos

| Qué | Dónde |
| --- | --- |
| Las dos rutas, con ejemplos inventados | [api-contract.md](../../docs/api-contract.md) → `GET /api/category-rules/suggestions`, `GET /api/category-rules/preview` |
| La decisión y sus alternativas | [architecture.md](../../docs/architecture.md) → ADR-039 |
| Dos filas en la tabla de endpoints | [README.md](../../README.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La decisión compartida | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → «planCategorization writes a single category, lists two as a conflict and counts no match» |
| El texto propuesto | [category-rules.suggestions.test.ts](../../src/modules/category-rules/category-rules.suggestions.test.ts) → «derives the proposed rule text…», «always proposes a piece of the normalized description itself» |
| La lista: orden y mínimos; lo que ya recoge una regla; textos que ya son de una regla; lo que otra incluye; lo puesto a mano; el número que mueve el `POST` | [category-rules.suggestions.test.ts](../../src/modules/category-rules/category-rules.suggestions.test.ts) → «lists the concepts…», «does not propose a concept…», «never proposes a text that is already the matchText…», «hides a suggestion…», «counts the movements set by hand…», «the count of a suggestion is what creating its rule moves…» |
| La consulta previa igual al `POST`, sus errores, y que nada escribe | [category-rules.routes.test.ts](../../src/modules/category-rules/category-rules.routes.test.ts) → «previews exactly the categorization…», «rejects a preview like the rule would be rejected», «rejects a preview missing a parameter…», «neither the suggestions nor the preview write anything» |
| El contrato | [category-rules.docs.test.ts](../../src/modules/category-rules/category-rules.docs.test.ts) → «api-contract: describes the rule suggestions and the preview of a rule» |

## Cumplimiento de la intención

- ✅ «La consulta devuelve los conceptos de la categoría genérica ordenados por
  cuántos movimientos recogería su regla, cada uno con el texto de regla
  propuesto» → se cumple; lo verifican «lists the concepts…» y «derives the
  proposed rule text…». Checks [1] y [2]: ✅.
- ✅ «Un concepto que ya recoge una regla existente no se propone» → se cumple;
  lo verifica «does not propose a concept an existing rule already takes».
  Check [3]: ✅.
- ✅ «Antes de crear una regla puedo saber cuántos movimientos y cuáles
  recogería, sin que se escriba nada» → se cumple; lo verifican «previews
  exactly the categorization…» y «the count of a suggestion is what creating its
  rule moves…». Checks [4] y [5]: ✅.
- ✅ «Ninguna de las dos consultas escribe nada» → se cumple; lo verifica
  «neither the suggestions nor the preview write anything». Check [6]: ✅.
- ✅ «docs/api-contract.md describe las dos consultas» → se cumple; check [7]: ✅.
- ✅ (añadido) Lo que ya funciona sigue igual → check [8] `pnpm test`: ✅
  (1481 tests en verde).

## Decisiones que se tomaron por ti

- (delegado) Cómo se saca el texto: corta desde «concepto», quita la palabra del
  banco antes de la barra y corta en el primer número (hoja 🔴 1).
- (delegado) Mínimo de 3 movimientos y de 5 caracteres; la lista no se corta
  (hoja 🔴 2).
- (delegado) Una propuesta que también aparece en movimientos puestos a mano se
  enseña igual, con cuántos son (`manualMatches`) (hoja 🔴 3).
- (delegado) Dos rutas, `suggestions` y `preview` (hoja 🔴 4).
- (añadido) Si otra propuesta más amplia ya recoge todo, solo sale la amplia
  (hoja 🔴 5).
- (añadido en la revisión) No se propone un texto que ya es el `matchText` de una
  regla de cualquier tipo: el texto es único entre todas las reglas y crearla daría
  409. En tu base no quitaba ninguna propuesta: el leader cruzó las 67 propuestas
  con las 68 reglas y no salió ninguna coincidencia.

## Qué NO se tocó / quedó fuera

- La pantalla de propuestas y la pregunta «¿aplicar a todos los que contienen…?»
  son de la sesión del frontend.
- Las propuestas no se guardan: se calculan en cada petición.
- No cambia el modelo de datos.

## Notas para el futuro

- Si `GET /api/category-rules/preview` recibe un parámetro desconocido, el 400 dice
  `Unknown body property` aunque el parámetro venga en la URL.
- `GET /api/category-rules/suggestions` respondió en 0,11 s en el servidor de
  desarrollo, con tu base (medido una vez durante la revisión).
