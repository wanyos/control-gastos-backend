# auto-categorization (F43) — implementación

> Implementer, 2026-09-06. Spec: `specs/43-auto-categorization/` (aprobado por
> el humano el 2026-09-06, 6 decisiones sin cambios). Las 11 tasks de
> `tasks.md` están hechas y marcadas `[x]`.

## Archivos modificados / creados

**Migración y esquema**
- [`prisma/schema.prisma`](../../prisma/schema.prisma) — modelo `CategoryRule` nuevo + relación inversa `rules` en `Category`.
- `prisma/migrations/20260906120000_category_rule/migration.sql` — **migración nueva** (tabla, único sobre `matchText`, FK `Restrict`). Escrita a mano siguiendo el SQL que Prisma genera (mismo estilo que `20260811152117_investments`); NO se ejecutó `prisma migrate dev` contra la base real. Que aplica limpia está comprobado: la suite re-migra la plantilla `gastos_test_template` con `migrate deploy` y los 1169 tests (que escriben en `CategoryRule`) pasaron.

**Módulo nuevo `src/modules/category-rules/`**
- [`category-rules.types.ts`](../../src/modules/category-rules/category-rules.types.ts) — shapes del CRUD, `CategorizationConflict`, `CategorizationResult`.
- [`category-rules.schema.ts`](../../src/modules/category-rules/category-rules.schema.ts) — AJV estricto (`additionalProperties: false`, `minProperties: 1` en el PATCH) + allow-lists derivadas.
- [`category-rules.service.ts`](../../src/modules/category-rules/category-rules.service.ts) — `normalizeForMatch`, CRUD, `applyCategoryRules` (nunca lanza; elegibilidad en el WHERE; re-chequeo concurrente en cada escritura; solo `categoryId` en `data`), `serializeCategoryRule`.
- [`category-rules.routes.ts`](../../src/modules/category-rules/category-rules.routes.ts) — POST/GET/PATCH/DELETE + `POST /apply`, con `assertOnlyAllowedBodyProperties` en POST y PATCH (patrón F37/F44).
- [`category-rules.seed.ts`](../../src/modules/category-rules/category-rules.seed.ts) — `defaultCategoryRules` (borrador de arranque, 61 reglas (contadas ejecutando el módulo), solo marcas/palabras públicas de 1-2 palabras; `var/` NO se abrió) + `seedDefaultCategoryRules` (idempotente por `skipDuplicates`; categoría ausente → `missingCategories`).
- [`category-rules.service.test.ts`](../../src/modules/category-rules/category-rules.service.test.ts) y [`category-rules.routes.test.ts`](../../src/modules/category-rules/category-rules.routes.test.ts).

**Integraciones**
- [`src/app.ts`](../../src/app.ts) — registro con prefijo `/api/category-rules`.
- [`src/modules/categories/categories.service.ts`](../../src/modules/categories/categories.service.ts) — `deleteCategory` cuenta también `rules` → 409 con el número (R16). Test en [`categories.test.ts`](../../src/modules/categories/categories.test.ts).
- [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts) — campo `categorization: CategorizationResult` en `ImportRunResult` y `LocalImportRunResult`, siempre presente.
- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts) y [`import.local.service.ts`](../../src/modules/import/import.local.service.ts) — `applyCategoryRules` DESPUÉS de `detectTransfers`, en las dos vías (orden fijado para informe estable).
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts) (informe con ceros en la vía Drive) y [`import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) (describe nuevo de la F43: ceros, categoriza lo importado, fallo dentro del informe).

**Siembra y docs**
- [`prisma/seed-category-rules.ts`](../../prisma/seed-category-rules.ts) + script `seed:category-rules` en [`package.json`](../../package.json). **NO ejecutado contra la base real** (el precedente de la F37 fue un accidente, no un permiso): la idempotencia y el reporte de huérfanas están probados por test contra la base desechable.
- [`docs/api-contract.md`](../../docs/api-contract.md) — los 5 endpoints de `/api/category-rules`, el campo `categorization` del informe (ambas vías), el 409 nuevo de `DELETE /api/categories/:id`, y la fila `categoryId` del modelo `Movement`.
- [`docs/data-model.md`](../../docs/data-model.md) — modelo `CategoryRule` en el esquema y fila `categoryId` de «Columnas reservadas»: ya tiene los dos escritores.

## Decisiones tomadas

- El mínimo real de 3 caracteres se valida en el servicio (sobre el texto
  normalizado), no en AJV: el schema solo rechaza el string vacío. Así el 400
  puede decir qué quedó tras normalizar.
- `describeCategorizationError` se copia del patrón de `transfers.service.ts`,
  no se comparte la función (lo dice el design §3).
- El PATCH re-usa exactamente las validaciones del alta; el 404 de regla
  inexistente se comprueba antes que nada.
- Dos reglas de la misma categoría casando a la vez = acuerdo, no conflicto
  (design §3), con test propio.

## Trazabilidad

| R | Test (archivo → nombre) |
|---|---|
| R1 | `category-rules.routes.test.ts` → «creates a rule with 201, normalized matchText and its category embedded (R1)» |
| R2 | `category-rules.routes.test.ts` → «rejects a category that does not exist with 404… (R2)», «rejects a matchText shorter than 3 chars AFTER normalizing… (R2)», «rejects a matchText that normalized already exists… (R2)», «rejects an unknown body property… (R1, R2)», «applies the alta validations on PATCH: 404 rule, 404 category, 400 short, 409 dup (R2, R4)»; `category-rules.service.test.ts` → «every draft rule is normalized, unique, at least 3 chars… (R2)» |
| R3 | `category-rules.routes.test.ts` → «lists every rule with its category embedded (R3)» |
| R4 | `category-rules.routes.test.ts` → «updates only what travels… (R4)», «rejects an empty PATCH body and an unknown property with 400 (R4)» |
| R5 | `category-rules.routes.test.ts` → «deletes a rule with 204 without un-categorizing any movement (R5)» |
| R6 | `category-rules.service.test.ts` → describe «normalizeForMatch (R6)» (2 tests), «assigns the category when the rules that match point at exactly one (R6, R7)», «never matches a rule whose category kind differs from the movement type (R6)» |
| R7 | `category-rules.service.test.ts` → «assigns the category… (R6, R7)», «treats two matching rules of the SAME category as agreement, not conflict (R7, R9)» |
| R8 | `category-rules.service.test.ts` → «touches nothing already categorized, confirmed or neutral (R8)» |
| R9 | `category-rules.service.test.ts` → «assigns nothing on a conflict of two categories and lists it in the result (R9, R10)», «counts the eligible movement no rule matches, and leaves it NULL (R9, R10)» |
| R10 | los dos de R9 (forma completa del resultado) + «runs the categorization on demand and answers 200 with its result (R13)» |
| R11 | `category-rules.service.test.ts` → «categorizes 0 on a second run and leaves the rows identical (R11)» (compara filas enteras, `updatedAt` incluido) |
| R12 | `import.local.service.test.ts` → «always carries the categorization result, with zeros… (R12)», «categorizes the movements this run just imported, after the detection (R12)», «reports a categorization failure inside the report, with the import intact (R12)»; `import.service.test.ts` → «reports nothing and touches nothing when there is no pending file» (vía Drive: campo presente con ceros, `toEqual` estricto); `category-rules.service.test.ts` → «never throws: a failing read comes back inside result.error (R12)» |
| R13 | `category-rules.routes.test.ts` → «runs the categorization on demand and answers 200 with its result (R13)» |
| R14 | `category-rules.service.test.ts` → «writes ONLY categoryId: full row and period totals identical otherwise (R14)» (fila entera antes/después + `totals` de `GET /api/movements` antes/después) |
| R15 | `category-rules.service.test.ts` → «creates the whole draft on a base with the 16 categories, and 0 on a second run (R15)», «skips and reports the rules of a category that no longer exists (R15)» |
| R16 | `categories.test.ts` → «DELETE /api/categories/:id referenced by rules returns 409 with their count (F43 R16)» (incluye que sin reglas el mismo DELETE vuelve a dar 204) |

## Último ./init.sh

Ejecutado completo el 2026-09-06, todo en verde:

```
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  60 passed (60)
      Tests  1169 passed (1169)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

## Desviaciones (con motivo)

- **El borrador trae 1 regla (no 2-6) en «Transferencias a personas» y
  «Nómina»**: `bizum` y `nomina` son los únicos marcadores públicos naturales;
  inventar más habría metido genéricos que casan con todo. El design dice
  «~2-6», con la virgulilla, y el ajuste fino es del humano por API.
- **`updatedAt` también cambia al categorizar** (es `@updatedAt` automático de
  Prisma, como en la F44, donde «solo cambiaron transferId y updatedAt»); el
  test de R14 lo excluye explícitamente de la comparación y lo deja escrito.
- **La migración se escribió a mano** en vez de generarla con
  `prisma migrate dev`, para no tocar la base real del humano; queda pendiente
  de él aplicarla ahí (`pnpm run prisma:migrate`) antes de sembrar.

## Sugerencias fuera de scope (NO aplicadas)

- El endpoint `POST /api/category-rules/apply` acepta cualquier body y lo
  ignora (no hay schema; mismo comportamiento laxo que otros POST de acción).
  Si se quiere el 400 ante un body inesperado, es un cambio aparte.
- `paymentMethod` sigue sin escritor; la fila de «Columnas reservadas» lo deja
  para «la misma feature de reglas» — esta F43 no lo toca a propósito (design §8).

## Lo que le toca al humano al cerrar

1. Aplicar la migración en su base: `pnpm run prisma:migrate`.
2. Sembrar el borrador **una vez**: `pnpm run seed:category-rules` (si renombró
   alguna de las 16, la regla huérfana se lista en vez de sembrarse).
3. Prueba real: `POST /api/category-rules/apply` y leer contadores
   (`categorized` / `conflicts` / `unmatched`); afinar reglas por API y repetir.
