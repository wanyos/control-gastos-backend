# Resumen — feature 56 `categorized-movements-list`

Fecha de cierre: 2026-10-13
Intención original: `feature_list.json` → feature `categorized-movements-list`, bloque `intent`
Origen del encargo: `../docs/handoff-reglas-aplicadas.md` (workspace), parte 1

## Qué hace ahora la app que antes no

Al aplicar las reglas de categoría, la respuesta ya no dice solo **cuántos**
movimientos se categorizaron: trae la lista de **cuáles**. Cada uno viene con su
identificador, su concepto, su fecha, su importe, su tipo (ingreso o gasto), la
categoría que se le puso (identificador y nombre) y las reglas por las que entró.
El campo se llama `categorizedMovements` y tiene siempre tantos elementos como diga
`categorized`.

La misma lista viaja también dentro de `categorization` en el informe de
`POST /api/import`, porque es el mismo objeto.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/category-rules/apply` — aplica las reglas y responde con la lista | [category-rules.routes.ts:86](../../src/modules/category-rules/category-rules.routes.ts#L86) |
| La función que aplica las reglas y construye la lista | [category-rules.service.ts:172](../../src/modules/category-rules/category-rules.service.ts#L172) |
| `POST /api/import` — mete ese mismo resultado en `categorization` | [import.service.ts:448](../../src/modules/import/import.service.ts#L448) |
| El contrato que lee el frontend | [api-contract.md:622](../../docs/api-contract.md#L622) |

## Dónde está el código

### Aplicar las reglas

| Qué hace | Dónde |
| --- | --- |
| Lee además el importe de cada movimiento y, cuando la escritura de la categoría se hizo, añade el movimiento a la lista | [category-rules.service.ts](../../src/modules/category-rules/category-rules.service.ts) → `applyCategoryRules` |
| Forma de cada elemento de la lista | [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts) → `CategorizedMovement` |
| El resultado gana el campo `categorizedMovements` | [category-rules.types.ts](../../src/modules/category-rules/category-rules.types.ts) → `CategorizationResult` |

### Contrato

| Qué hace | Dónde |
| --- | --- |
| Describe el campo, con ejemplo y una fila por campo | [api-contract.md](../../docs/api-contract.md) → `### POST /api/category-rules/apply` |
| Dice que el campo viaja también en el informe de importación | [api-contract.md](../../docs/api-contract.md) → `### POST /api/import`, fila `categorizedMovements` de la tabla de `categorization` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La lista es exactamente lo categorizado, en orden de id; los que chocan y los que no casan no salen | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → `lists exactly the movements the run categorized, as many as categorized says` |
| Lista vacía cuando no se escribe nada | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → `answers an empty list when the run writes nothing` |
| Un movimiento que otra petición cambió justo antes de escribirlo ni suma ni sale | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → `neither counts nor lists a movement another request changed before the write` |
| Si falla a mitad, la lista trae lo que sí se escribió | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → `keeps in the list what was written before a failure half way` |
| Ayuda de esos dos tests: sustituye la escritura para provocar el caso | [category-rules.service.test.ts](../../src/modules/category-rules/category-rules.service.test.ts) → `withUpdateMany` |
| La respuesta HTTP trae cada campo, con el importe a dos decimales | [category-rules.routes.test.ts](../../src/modules/category-rules/category-rules.routes.test.ts) → `answers each categorized movement with its id, description, date, amount, type, category and matching rules` |
| Lo que dice la lista es lo que devuelve después `GET /api/movements` | [category-rules.routes.test.ts](../../src/modules/category-rules/category-rules.routes.test.ts) → `every listed movement reads back from GET /api/movements with the category the list says` |
| Aplicar dos veces seguidas: la segunda responde 0 y lista vacía | [category-rules.routes.test.ts](../../src/modules/category-rules/category-rules.routes.test.ts) → `a second run right after answers categorized 0 and an empty list` |
| El informe de importación trae la lista | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `carries the categorized movements list inside categorization` |
| El contrato describe el campo en las dos rutas | [category-rules.docs.test.ts](../../src/modules/category-rules/category-rules.docs.test.ts) → `api-contract: describes categorizedMovements in apply and in the import report` |
| El archivo de test nuevo está en la lista de archivos esperados | [architecture.test.ts](../../src/architecture.test.ts) → `contains the target tree of docs/architecture.md (ADR-004)` |

Tres comparaciones que ya existían ganaron la línea `categorizedMovements: []` y
nada más: una en `category-rules.service.test.ts` (`never throws: a failing read
comes back inside result.error (R12)`) y dos en `import.service.test.ts`.

## Cumplimiento de la intención

- ✅ «Una pasada que categoriza N movimientos devuelve una lista de N, tantos como
  diga categorized.» → se cumple; lo verifica `lists exactly the movements the run
  categorized, as many as categorized says`. Check 1: ✅ (`Tests  1 passed | 17 skipped`).
- ✅ «Cada movimiento de la lista trae su identificador, su concepto, su fecha, su
  importe, su tipo y la categoría que se le puso, con identificador y nombre.» → se
  cumple; lo verifica `answers each categorized movement with its id, …`.
  Check 2: ✅ (`Tests  1 passed | 14 skipped`).
- ✅ «Cada movimiento de la lista tiene, al leerlo después con GET /api/movements,
  la categoría que dice la lista.» → se cumple; lo verifica `every listed movement
  reads back from GET /api/movements with the category the list says`.
  Check 3: ✅ (`Tests  1 passed | 14 skipped`).
- ✅ «Una segunda pasada seguida devuelve categorized: 0 y la lista vacía.» → se
  cumple; lo verifica `a second run right after answers categorized 0 and an empty
  list`. Check 4: ✅ (`Tests  1 passed | 14 skipped`).
- ✅ «docs/api-contract.md describe el campo nuevo en POST /api/category-rules/apply,
  con su ejemplo, y dice si aparece también en el informe de POST /api/import.» → se
  cumple; lo verifica `api-contract: describes categorizedMovements in apply and in
  the import report`. Check 5: ✅ (`Tests  1 passed (1)`).
- Checks añadidos: 6 (el informe de importación trae la lista) ✅
  (`Tests  1 passed | 79 skipped`) y 7 (`pnpm test`, la suite entera) ✅ (77 archivos,
  1358 tests en `./init.sh`).

## Decisiones que se tomaron por ti

- (delegado) El campo se llama `categorizedMovements` y cada elemento trae
  `movementId`, `description`, `bookingDate`, `amount`, `type`, `categoryId`,
  `categoryName` y `rules`. Los tres primeros se llaman igual que en `conflicts`.
- (delegado) El campo aparece también en `categorization` del informe de
  `POST /api/import`. Está escrito en `docs/api-contract.md`.
- (delegado) Cada movimiento trae las reglas que casaron (`ruleId`, `matchText`),
  todas, ordenadas por `ruleId`.
- (delegado) La lista va completa, sin acotar ni paginar, por id de movimiento
  ascendente.
- (decisión del leader) Si aplicar las reglas falla a mitad, la lista trae lo que sí
  se escribió antes del fallo.
- (decisión del implementer) `amount` va como texto con dos decimales, igual que en
  `GET /api/movements`.

## Qué NO se tocó / quedó fuera

- Qué movimientos se categorizan, qué se escribe (solo `categoryId`) y que aplicar
  dos veces dé lo mismo: igual que antes.
- No hay migración, columna ni dependencia nueva.
- Ver en la pantalla qué categorizan las reglas al importar: fuera, para más adelante.
- La parte 2 del encargo (feature 30 del frontend) y pasar a hecha la parte 1 en la
  tabla de `../docs/handoff-reglas-aplicadas.md`.

## Notas para el futuro

- El módulo `category-rules` no aparece en el árbol de `docs/architecture.md`; de
  sus archivos, la lista de `src/architecture.test.ts` solo nombra el test nuevo.
  Lo anotó el implementer como sugerencia fuera de alcance, sin aplicar.
- En el tipo `CategorizedMovement`, `type` admite también `neutral` porque es el
  tipo de la columna; en la práctica nunca llega, porque un movimiento neutral no
  entra al aplicar las reglas.
