# Tasks — F61 `rule-suggestions`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto** y ejecutarse.
> Ningún test ni ejemplo lleva conceptos, nombres ni cifras de la base del humano:
> todo inventado (`docs/conventions.md` §Tests). Ojo con copiar fórmulas de banco
> de varias palabras: `src/no-real-data.test.ts` detecta secuencias de tres
> palabras que estén en su base. Usa las descripciones de `design.md` §3.
>
> Las rutas son propuesta pendiente de aprobación (`decisions.md` 🔴 4): si el
> humano las cambia, el leader corrige estos nombres antes de lanzar los lotes.
>
> ⚠️ **Nada de esta feature se ejecuta contra la base del humano** (`gastos`).
>
> Los dos lotes corren **en paralelo**: el B solo escribe documentos con las formas
> fijadas en `requirements.md` y `design.md`.

## Lote A — reparto compartido, consulta previa y lista de reglas propuestas
Archivos: `src/modules/category-rules/category-rules.service.ts`, `src/modules/category-rules/category-rules.suggestions.ts`, `src/modules/category-rules/category-rules.types.ts`, `src/modules/category-rules/category-rules.schema.ts`, `src/modules/category-rules/category-rules.routes.ts`, `src/modules/category-rules/category-rules.service.test.ts`, `src/modules/category-rules/category-rules.routes.test.ts`, `src/modules/category-rules/category-rules.suggestions.test.ts`
Depende de: —

- [x] T1 — Sacar el reparto a `planCategorization`, la lectura a `readCategorizationInput` y la conversión a `toCategorizedMovement` / `toCategorizationConflict`; `applyCategoryRules` los usa (`design.md` §2). Sin tocar los tests existentes: `category-rules.service.test.ts`, `category-rules.routes.test.ts` e `import.service.test.ts` siguen verdes tal cual. Cubre: R13.
- [x] T2 — Test en `category-rules.service.test.ts`: "planCategorization writes a single category, lists two as a conflict and counts no match" (pura, con reglas y movimientos inventados, una regla con `id: null`). Cubre: R6, R13.
- [x] T3 — `previewCategoryRule` (§4), tipos `PreviewCategorizationResult` y `CategoryRulePreview`, `previewCategoryRuleSchema` y la ruta `GET /preview`. El mensaje del 409 sale de una sola función que usan `createCategoryRule`, `updateCategoryRule` y la consulta previa. Cubre: R10, R11.
- [x] T4 — `proposedMatchText` y `listRuleSuggestions` en `category-rules.suggestions.ts` (§3, §5), tipo `RuleSuggestion` y la ruta `GET /suggestions`. Cubre: R1–R9.
- [x] T5 — Tests puros en `category-rules.suggestions.test.ts`:
  - "derives the proposed rule text from bank descriptions" — tabla de `design.md` §3. R2, R4.
  - "always proposes a piece of the normalized description itself" — con dobles espacios, acentos y símbolos, `normalizeForMatch(d).includes(texto)` para cada uno. R3.
- [x] T6 — Tests de ruta (`app.inject`) en `category-rules.suggestions.test.ts`:
  - "lists the concepts of the generic category ordered by how many movements their rule would take, each with its proposed text" — R1, R7 (uno con 2 movimientos no sale; empate ordenado por texto; `movementCount === movements.length`; `kind` de gasto y de ingreso por separado).
  - "does not propose a concept an existing rule already takes" — R5.
  - "hides a suggestion whose movements another suggestion already takes" — R8.
  - "counts the movements set by hand that contain the text but never includes them" — R9 (un `manual` con el texto: suma a `manualMatches`, no a `movements`; un `rule` tampoco entra).
  - "the count of a suggestion is what creating its rule moves by that rule" — R6 (para cada propuesta, `POST /api/category-rules` con su texto y una categoría de su `kind`: los `categorizedMovements` cuyo `rules` incluye el id nuevo son exactamente sus `movements`; borrar la regla y restaurar entre una y otra). También un elegible que casa con el texto y con una regla existente: no cuenta.
- [x] T7 — Tests de ruta en `category-rules.routes.test.ts`:
  - "previews exactly the categorization that creating the rule then returns" — R10 (preview, luego `POST` con el mismo cuerpo: iguales salvo `ruleId: null` ↔ id creado; con un choque incluido).
  - "rejects a preview like the rule would be rejected" — R11 (400, 404 y 409 con el mismo `message` que el `POST`).
  - "neither the suggestions nor the preview write anything" — R12 (foto de todas las columnas de los movimientos y de las reglas del test, `updatedAt` incluido, antes y después de las dos consultas: idénticas).
- [x] T8 — `pnpm test` entero en verde. Cubre: R13.

## Lote B — documentos
Archivos: `docs/api-contract.md`, `README.md`, `docs/architecture.md`, `src/modules/category-rules/category-rules.docs.test.ts`
Depende de: —

- [x] T9 — `docs/api-contract.md`: secciones `### GET /api/category-rules/suggestions` y `### GET /api/category-rules/preview` tras `POST /api/category-rules/apply`, con lo que pide R14 y un ejemplo JSON inventado cada una (descripciones de `design.md` §3); y en `### POST /api/category-rules` una línea que remite a la consulta previa. Cubre: R14.
- [x] T10 — `README.md`: dos filas en la tabla de endpoints. `docs/architecture.md`: ADR-039 (`design.md` §9). Cubre: R14.
- [x] T11 — Test en `category-rules.docs.test.ts`: "api-contract: describes the rule suggestions and the preview of a rule" — las dos secciones existen; los campos de `RuleSuggestion` (`matchText`, `kind`, `movementCount`, `movements`, `manualMatches`) y de la consulta previa (`matchText`, `categoryId`, `categorization`, `ruleId` a `null`) aparecen en sus ejemplos JSON, que se parsean; las secciones nombran el mínimo de 3 movimientos y de 5 caracteres y dicen que no escriben nada. Cubre: R14.
