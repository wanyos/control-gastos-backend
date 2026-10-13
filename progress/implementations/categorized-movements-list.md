# categorized-movements-list — implementación

Feature 56, flujo sin spec. Implementer, 2026-10-13. Sin commit y sin marcar `done`.

> **Una cosa que el leader tiene que mirar antes de la revisión.** El criterio 10 del
> `acceptance` dice que el campo aparece también en el informe «de `POST /api/import`
> y de `POST /api/import/local`». La ruta `POST /api/import/local` **no existe**: la
> retiró la feature 52 y responde 404 (lo comprueba `src/architecture.test.ts`, test
> `answers 404 to the eight routes retired by feature 52`, que pasa en la suite de
> abajo). Además `src/retired-routes.docs.test.ts` pone la suite en rojo si
> `docs/api-contract.md` la nombra fuera de su sección «Rutas retiradas». Por eso el
> contrato solo habla de `POST /api/import`, que es la única ruta de importación que
> hay. No he tocado el `acceptance`: el texto de ese criterio queda por corregir. Los
> `checks` no nombran esa ruta y están los siete en verde.

## Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| `src/modules/category-rules/category-rules.types.ts` | Tipo nuevo `CategorizedMovement`; `CategorizationResult` gana `categorizedMovements` |
| `src/modules/category-rules/category-rules.service.ts` | `applyCategoryRules` lee además `amount` de cada movimiento elegible y, cuando el `updateMany` devuelve `count` 1, añade el elemento a `categorizedMovements`. El `where` de la lectura, el `where` y el `data` de la escritura no cambian |
| `src/modules/category-rules/category-rules.service.test.ts` | 4 tests nuevos; en el test que ya existía `never throws: a failing read comes back inside result.error (R12)` el objeto esperado gana `categorizedMovements: []` |
| `src/modules/category-rules/category-rules.routes.test.ts` | 3 tests nuevos |
| `src/modules/category-rules/category-rules.docs.test.ts` | **Nuevo.** 1 test que lee `docs/api-contract.md` |
| `src/modules/import/import.service.test.ts` | 1 test nuevo; en dos tests que ya existían el objeto esperado de `categorization` gana `categorizedMovements: []` |
| `src/architecture.test.ts` | El archivo nuevo, añadido a la lista del test `contains the target tree of docs/architecture.md (ADR-004)` |
| `docs/api-contract.md` | Ver §Documentos actualizados |
| `progress/current.md` | El plan de esta sesión |

No hay migración, ni columna nueva, ni dependencia nueva. `docs/data-model.md` no
cambia (lección 2 de `docs/lessons.md`: no aplica, no hay columna nueva ni un
escritor nuevo de una columna). No hay fixtures `.xls` ni `.pdf` (lección 3: no aplica).

## Decisiones tomadas

- **Ninguna ruta tiene schema de respuesta que filtre el campo.** Comprobado leyendo
  `category-rules.schema.ts` (solo declara `body` y `params` de las rutas de alta,
  cambio y borrado), `category-rules.routes.ts` (`/apply` se registra sin `schema`) e
  `import.routes.ts` (`POST /` sin `schema`; ya no existe `import.schema.ts`). Y
  comprobado ejecutando: los tests de ruta leen el campo de la respuesta HTTP. No ha
  hecho falta declarar nada.
- **`amount` se serializa con `toFixed(2)`**, la misma expresión que `serializeMovement`
  en `movements.service.ts`. Un test siembra `63.8` y espera `"63.80"`.
- **`type` está tipado como `MovementType`** (el enum de Prisma, que incluye
  `neutral`), porque es el tipo de la columna que se lee. En la práctica nunca es
  `neutral`: el `where` de la lectura lo excluye, igual que antes.
- **El orden de `rules` es por `ruleId` ascendente.** Sale de que las reglas ya se
  leían con `orderBy: { id: 'asc' }`. Lo he escrito en el contrato porque es lo que
  hace el código; el `acceptance` no lo pedía.
- **Orden de las claves en el JSON:** `categorized`, `categorizedMovements`,
  `conflictCount`, `conflicts`, `unmatched`, `error`. El campo nuevo va junto al
  contador con el que cuadra.
- **Tres objetos esperados de tests que ya existían ganan `categorizedMovements: []`.**
  Son comparaciones del objeto entero (`toEqual`), así que con un campo siempre
  presente no pueden pasar sin esa línea. Lo que comprueban no cambia: los mismos
  ceros, el mismo `error`.
- **El archivo nuevo se ha añadido a la lista de `src/architecture.test.ts`** como
  pidió el leader. Esa lista no nombraba hasta hoy ningún otro archivo de
  `modules/category-rules/`, y el árbol de `docs/architecture.md` tampoco nombra ese
  módulo (ver §Sugerencias).

## Criterio de `acceptance` → test

Archivos: `service` = `src/modules/category-rules/category-rules.service.test.ts`,
`routes` = `src/modules/category-rules/category-rules.routes.test.ts`,
`docs` = `src/modules/category-rules/category-rules.docs.test.ts`,
`import` = `src/modules/import/import.service.test.ts`.

| # | Criterio | Test |
|---|---|---|
| 1 | La respuesta 200 trae `categorizedMovements`; los campos que había no cambian | `routes` › `answers each categorized movement with its id, description, date, amount, type, category and matching rules` (compara la lista de claves de la respuesta) y el que ya existía `runs the categorization on demand and answers 200 with its result (R13)` |
| 2 | Tantos elementos como `categorized`; lo que no llegó a escribirse ni suma ni sale | `service` › `lists exactly the movements the run categorized, as many as categorized says` y `neither counts nor lists a movement another request changed before the write` |
| 3 | `movementId`, `description`, `bookingDate`, `amount`, `type`, `categoryId`, `categoryName` | `routes` › `answers each categorized movement with its id, …` (gasto, `63.8` → `"63.80"`) y `service` › `lists exactly the movements…` (un gasto y un ingreso) |
| 4 | `rules` con `ruleId` y `matchText`, puede haber más de una | Los dos tests de la fila 3: un movimiento con dos reglas de la misma categoría |
| 5 | El `categoryId` es el que devuelve después `GET /api/movements` | `routes` › `every listed movement reads back from GET /api/movements with the category the list says` |
| 6 | Segunda pasada: `categorized: 0` y `[]` | `routes` › `a second run right after answers categorized 0 and an empty list` |
| 7 | Lista completa, por id ascendente | `service` › `lists exactly the movements…` (igualdad del array entero, en orden) y `routes` › `every listed movement reads back…` (tres movimientos, en el orden de sus ids) |
| 8 | Conflictos y sin regla no salen; siempre presente, `[]` si ninguno | `service` › `lists exactly the movements…` (siembra además un conflicto y uno sin regla) y `answers an empty list when the run writes nothing`; el `[]` con fallo, en `never throws: a failing read comes back inside result.error (R12)` |
| 9 | Fallo a mitad: trae lo ya escrito y cuadra con `categorized` | `service` › `keeps in the list what was written before a failure half way` |
| 10 | El campo viaja en `categorization` del informe de importación | `import` › `carries the categorized movements list inside categorization`. **La parte de `POST /api/import/local` no se puede cumplir: ver el aviso de arriba** |
| 11 | El contrato lo describe campo a campo, con ejemplo, y lo dice en `POST /api/import` | `docs` › `api-contract: describes categorizedMovements in apply and in the import report` |
| 12 | Elegibilidad, qué se escribe e idempotencia idénticos | Los tests de la feature 43 que ya existían en `service` (R6 a R14) siguen pasando; la suite entera, abajo |

Comprobado además que el test de `docs` falla cuando el documento no trae el campo:
puse en `docs/api-contract.md` el contenido de `HEAD`, lancé
`pnpm exec vitest run src/modules/category-rules/category-rules.docs.test.ts` y salió
`Tests  1 failed (1)`; después devolví el archivo a como lo había dejado.

## Documentos actualizados

Lanzado:

```
git grep -n -E "category-rules/apply|categorized|conflictCount|unmatched" -- . ':!progress' ':!specs' ':!feature_list.json' ':!src'
git grep -n -E "categorization|applyCategoryRules|CategorizationResult|conflictCount" -- . ':!progress' ':!specs' ':!feature_list.json'
```

Corregido, todo en `docs/api-contract.md`:

- `### POST /api/category-rules/apply`: la frase de la idempotencia dice ahora
  `categorized: 0` y `categorizedMovements: []`; el ejemplo trae el campo con dos
  movimientos (uno con dos reglas) y `categorized: 2`; debajo, las reglas de la lista
  y una tabla con una fila por campo; la frase final dice que el objeto que viaja en
  `categorization` de `POST /api/import` incluye `categorizedMovements`.
- `### POST /api/import`: el ejemplo del informe trae el campo dentro de
  `categorization`; la tabla de `categorization` gana la fila `categorizedMovements`,
  que dice que viaja también ahí.

Miradas y dejadas como están porque siguen siendo verdad: `README.md:78` (qué hace la
ruta `apply`), `docs/roadmap.md:92` (la fila de la feature 43) y
`docs/data-model.md:285` (quién escribe `categoryId`).

Fuera de este repositorio, sin tocar: `../docs/handoff-reglas-aplicadas.md` (su tabla
pasa la parte 1 a hecha al cerrar, con fecha y commit; lo dice `progress/current.md`).

## Prueba real

No aplica: la feature no lee ningún archivo ni dato de fuera del código. No he
lanzado la pasada contra la base de datos del humano (escribe `categoryId`, y nada
de lo que ejecuto puede escribir ahí).

## Último ./init.sh

Código de salida 0. Final de la salida:

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ───────────────────────────────────
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check

── 6. Ejecutando tests ─────────────────────────────────
 Test Files  77 passed (77)
      Tests  1358 passed (1358)
[OK]    Todos los tests pasan

── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Antes del cambio eran 76 archivos y 1349 tests (dato del leader); ahora 77 y 1358:
un archivo nuevo y 9 tests nuevos (4 + 3 + 1 + 1).

## Último ./init.sh --checks

Código de salida 0.

```
[INFO]  Feature: F56 categorized-movements-list
[1] … -t "lists exactly the movements the run categorized, as many as categorized says"
[OK]        exit 0      Tests  1 passed | 17 skipped (18)
[2] … -t "answers each categorized movement with its id, description, date, amount, type, category and matching rules"
[OK]        exit 0      Tests  1 passed | 14 skipped (15)
[3] … -t "every listed movement reads back from GET /api/movements with the category the list says"
[OK]        exit 0      Tests  1 passed | 14 skipped (15)
[4] … -t "a second run right after answers categorized 0 and an empty list"
[OK]        exit 0      Tests  1 passed | 14 skipped (15)
[5] … -t "api-contract: describes categorizedMovements in apply and in the import report"
[OK]        exit 0      Tests  1 passed (1)
[6] … -t "carries the categorized movements list inside categorization"
[OK]        exit 0      Tests  1 passed | 79 skipped (80)
[7] pnpm test
[OK]        exit 0
[OK]    Checks: 7 de 7 en verde.
```

## Sugerencias fuera de scope (NO aplicadas)

- **Corregir el criterio 10 del `acceptance`** de la feature 56 en `feature_list.json`
  quitando «y de `POST /api/import/local`»: esa ruta está retirada desde la feature 52.
- **El módulo `category-rules` no está en el árbol de `docs/architecture.md`** ni,
  salvo el archivo de hoy, en la lista de `src/architecture.test.ts`
  (`grep -n "category-rules" docs/architecture.md src/architecture.test.ts` no
  devolvía nada antes de este cambio). Tampoco están `import.warnings.docs.test.ts`
  ni `import.product-files.docs.test.ts`. Si se quiere que el árbol documentado esté
  al día, es un cambio aparte.
