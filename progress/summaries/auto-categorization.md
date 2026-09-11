# Resumen — feature 43 `auto-categorization`

Fecha de cierre: 2026-09-06
Intención original: `feature_list.json` → feature `auto-categorization`, bloque `intent`
Spec (SDD): `specs/43-auto-categorization/`

## Qué hace ahora la app que antes no

Ahora la app pone sola la categoría a los movimientos: una pasada recorre lo
que está sin categoría y sin confirmar, y si el concepto contiene el texto de
una regla (sin importar mayúsculas ni tildes) le escribe esa categoría. Las
reglas viven en una tabla nueva con su propia API, así que las añades, cambias
o borras sin tocar código. La pasada corre sola al final de cada importación y
también cuando tú la pidas. Antes, categorizar era movimiento a movimiento con
el PATCH manual de la F37.

## Por dónde se usa (puntos de entrada)

- `POST /api/category-rules` — crea una regla ([category-rules.routes.ts:42](../../src/modules/category-rules/category-rules.routes.ts#L42)).
- `PATCH /api/category-rules/:id` y `DELETE /api/category-rules/:id` — corregir o quitar una regla ([category-rules.routes.ts:63](../../src/modules/category-rules/category-rules.routes.ts#L63)).
- `POST /api/category-rules/apply` — lanza la pasada bajo demanda y devuelve cuántos categorizó, los choques y cuántos quedaron sin casar ([category-rules.routes.ts:86](../../src/modules/category-rules/category-rules.routes.ts#L86)).
- `pnpm run seed:category-rules` — siembra el borrador de 61 reglas de arranque, una vez ([seed-category-rules.ts:26](../../prisma/seed-category-rules.ts#L26)).
- Además, toda importación (Drive o copias locales) trae ahora un campo `categorization` en su informe.

## Dónde está el código (para revisión directa)

### La tabla de reglas

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Modelo Prisma de la regla | `CategoryRule` | [schema.prisma:110](../../prisma/schema.prisma#L110) |
| Migración (solo esta tabla) | — | [20260906120000_category_rule/migration.sql](../../prisma/migrations/20260906120000_category_rule/migration.sql) |

### El CRUD de reglas

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Rutas HTTP (CRUD + apply) | `categoryRulesRoutes` | [category-rules.routes.ts](../../src/modules/category-rules/category-rules.routes.ts) |
| Esquemas AJV estrictos | `createCategoryRuleSchema`, `updateCategoryRuleSchema` | [category-rules.schema.ts](../../src/modules/category-rules/category-rules.schema.ts) |
| Alta con normalización y 404/400/409 | `createCategoryRule` | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) |
| Cambio parcial con las mismas validaciones | `updateCategoryRule` | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) |
| Borrado sin des-categorizar nada | `deleteCategoryRule` | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) |
| Forma API de la regla | `serializeCategoryRule` | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) |
| Tipos del módulo | `CategorizationResult`, `CategorizationConflict` | [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts) |
| Registro en la app | prefijo `/api/category-rules` | [app.ts](../../src/app.ts) |

### La pasada

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| La pasada entera (nunca lanza; solo escribe `categoryId`) | `applyCategoryRules` | [category-rules.service.ts:168](../../src/modules/category-rules/category-rules.service.ts#L168) |
| La normalización del casado (minúsculas, sin tildes) | `normalizeForMatch` | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) |
| Enganche tras la detección, vía Drive | campo `categorization` | [import.service.ts:437](../../src/modules/import/import.service.ts#L437) |
| Enganche tras la detección, vía copias locales | campo `categorization` | [import.local.service.ts:134](../../src/modules/import/import.local.service.ts#L134) |
| El campo en los informes de importación | `ImportRunResult.categorization`, `LocalImportRunResult.categorization` | [import.types.ts](../../src/modules/import/import.types.ts) |

### El borrador de arranque y la guarda de borrado

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Las 61 reglas de arranque (marcas públicas) | `defaultCategoryRules` | [category-rules.seed.ts](../../src/modules/category-rules/category-rules.seed.ts) |
| Siembra idempotente que reporta huérfanas | `seedDefaultCategoryRules` | [category-rules.seed.ts](../../src/modules/category-rules/category-rules.seed.ts) |
| Envoltorio CLI | script `seed:category-rules` | [seed-category-rules.ts](../../prisma/seed-category-rules.ts) |
| 409 al borrar categoría con reglas | `deleteCategory` (cuenta `rules`) | [categories.service.ts:105](../../src/modules/categories/categories.service.ts#L105) |

### Tests

| Qué cubre | Código |
| --- | --- |
| La pasada: asigna, protege, conflictos, idempotencia, solo `categoryId`, nunca lanza; y la siembra | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) |
| El CRUD por HTTP: 201/400/404/409, PATCH parcial, DELETE 204, apply 200 | [category-rules.routes.test.ts](../../src/modules/category-rules/category-rules.routes.test.ts) |
| El informe de importación trae `categorization` (ambas vías) y un fallo viaja dentro | [import.local.service.test.ts:810](../../src/modules/import/import.local.service.test.ts#L810), [import.service.test.ts](../../src/modules/import/import.service.test.ts) |
| El 409 de borrar una categoría con reglas | [categories.test.ts](../../src/modules/categories/categories.test.ts) |

### Documentación

- [api-contract.md](../../docs/api-contract.md) — los 5 endpoints, el campo `categorization`, el 409 nuevo.
- [data-model.md](../../docs/data-model.md) — modelo `CategoryRule` y la fila `categoryId` de «Columnas reservadas».

## Cumplimiento de la intención

- ✅ «Después de una pasada, la mayoría de mis movimientos tienen categoría sin
  que yo haya escrito nada» → el mecanismo está y verificado en
  `category-rules.service.test.ts` («assigns the category when the rules that
  match point at exactly one»); la cobertura real sobre TUS 1520 movimientos se
  mide en tu prueba real (paso 3 de abajo).
- ✅ «Lo que ninguna regla reconoce se queda sin categoría, visible» →
  «counts the eligible movement no rule matches, and leaves it NULL» y
  «assigns nothing on a conflict of two categories…» (mismo archivo).
- ✅ «Un movimiento que yo ya categoricé o confirmé a mano no me lo pisa una
  regla» → «touches nothing already categorized, confirmed or neutral (R8)».
- ✅ «Puedo añadir o cambiar una regla sin tocar código, y volver a pasar las
  reglas» → todo el CRUD en `category-rules.routes.test.ts` + «runs the
  categorization on demand and answers 200 with its result (R13)».
- ✅ «Los movimientos nuevos que entren por importación se categorizan solos» →
  «categorizes the movements this run just imported, after the detection
  (R12)» en `import.local.service.test.ts`.

## Decisiones que se tomaron por ti

- (delegado) Las reglas viven en una tabla con API, no en un archivo — es lo
  que permitirá el editor del frontend en otra sesión.
- (delegado) Una regla casa por «contiene», sin mayúsculas ni tildes, y solo si
  el tipo de la categoría coincide con el del movimiento.
- (delegado) Corre tras cada importación Y bajo demanda.
- (delegado) Dos reglas de categorías distintas sobre el mismo movimiento → no
  se asigna nada y el choque sale en el informe.
- (delegado) Borrar o cambiar una regla no des-categoriza lo ya puesto.
- (añadido) Mínimo 3 caracteres tras normalizar y textos únicos (aprobaste el
  spec con esto marcado «REVISAR EN APROBACIÓN»).
- (añadido) Borrar una categoría con reglas da 409 con el recuento, como ya
  pasaba con movimientos e hijas (por esto el spec tiene 16 requirements).

## Qué NO se tocó / quedó fuera

- Ningún editor de reglas con interfaz: solo API (frontend, otra sesión).
- La pasada nunca confirma: tus 1520 movimientos seguirán `pending_review`
  después de categorizarse (cabo de la F37, abierto a propósito).
- `paymentMethod` sigue sin escritor automático (a propósito, design §8).
- El PATCH manual de movimientos, la detección de traspasos, el dedup, el ancla
  y los saldos: cero cambios.

## Notas para el futuro

**Te quedan 3 pasos a ti** (la migración y la siembra NO se ejecutaron contra
tu base, comprobado en la revisión):

1. `pnpm run prisma:migrate` — aplica la migración de la tabla de reglas.
2. `pnpm run seed:category-rules` — siembra el borrador de 61 reglas, una vez.
3. `POST /api/category-rules/apply` — la prueba real: lee `categorized` /
   `conflicts` / `unmatched`, afina reglas por API y repite.

Menor: `POST /api/category-rules/apply` acepta cualquier body y lo ignora
(mismo comportamiento laxo que otros POST de acción); endurecerlo sería un
cambio aparte.
