# movements-review-bulk — implementación

> Un archivo por feature, una sección por lote. Los lotes B y C añaden la suya
> **al final**; esta es la del lote A.

## Lote A — columna de búsqueda en la base de datos (2026-09-18)

Tasks T1, T2 y T3 de [`specs/47-movements-review-bulk/tasks.md`](../../specs/47-movements-review-bulk/tasks.md),
marcadas `[x]`. Cubren R14.

### Archivos modificados / creados

| Archivo | Qué le pasa |
| --- | --- |
| [`prisma/migrations/20260918140000_movement_description_search/migration.sql`](../../prisma/migrations/20260918140000_movement_description_search/migration.sql) | **Nuevo.** SQL escrito a mano: `ALTER TABLE "Movement" ADD COLUMN "descriptionSearch" TEXT GENERATED ALWAYS AS (lower(translate(...))) STORED` + `CREATE INDEX "Movement_categoryId_idx"`. Sin ningún `INSERT`, `UPDATE` ni `DELETE`. |
| [`prisma/schema.prisma`](../../prisma/schema.prisma#L136) | `descriptionSearch String?` en `Movement` (con el comentario de que la escribe PostgreSQL y ningún `data:` puede tocarla) y `@@index([categoryId])`. |
| [`src/modules/movements/movements.search-column.test.ts`](../../src/modules/movements/movements.search-column.test.ts) | **Nuevo.** Tres tests de integración contra PostgreSQL con `buildApp()` + `app.prisma`. |

Fuera del lote no se ha tocado nada: ni `src/modules/movements/*.ts` de
producción, ni `docs/`, ni `README.md`.

### Decisiones tomadas

1. **La migración se aplicó con `prisma migrate deploy`, no con `migrate dev`.**
   La base `gastos` de `localhost:5434` es la real del humano y `migrate dev`
   puede proponer un reset ante cualquier drift; `deploy` solo aplica lo
   pendiente. Salida: `Applying migration 20260918140000_movement_description_search`
   → `All migrations have been successfully applied.`
2. **El SQL se ensayó antes en una base de usar y tirar** (`scratch_f47`, creada
   y borrada en el mismo paso, con una tabla `Movement` de juguete de 2 filas
   inventadas) para no estrenar la sintaxis de la columna generada sobre sus
   1.607 filas. Allí se comprobaron el `ALTER`, el índice y el resultado
   (`Peluquería JOSÉ` → `peluqueria jose`).
3. **Comprobación del efecto sobre su base, ejecutada (no deducida):**
   `select count(*), count("descriptionSearch") from "Movement"` → `1607 | 1607`;
   `information_schema.columns` devuelve `is_generated = ALWAYS` con la
   expresión esperada, y `pg_indexes` lista `Movement_categoryId_idx`. No se
   insertó, actualizó ni borró ninguna fila suya.
4. **`ñ` también pierde la tilde** (`ñoña` → `nona`). Es lo que dice la lista de
   `translate` del `design.md` §3 y coincide con lo que hará
   `normalizeForSearch` en TypeScript (`normalize('NFD')` quita la virgulilla),
   así que los dos lados de la búsqueda concuerdan. Escrito como comentario en
   el test porque es lo primero que sorprende al leerlo.
5. **Cómo se demuestra que «ningún código la escribe»:** además de que el
   `create` del test no la menciona y la columna sale rellena, hay un tercer
   test que **sí** la menciona y comprueba que PostgreSQL rechaza la escritura y
   no deja ninguna fila. Es más fuerte que un guardián por texto sobre `src/`,
   que además chocaría con el `where: { descriptionSearch: { contains: … } }`
   del lote B.

### Trazabilidad (SDD)

| Requirement | Test |
| --- | --- |
| R14 — la columna se deriva sola al insertar | `Movement.descriptionSearch (generated column) > fills it in lowercase and without diacritics from a create that never mentions it` |
| R14 — se deriva sola al cambiar la `description` | `… > re-derives it when the description changes, with nothing updating it` |
| R14 — ningún código de la aplicación puede escribirla ni mantenerla | `… > is rejected by PostgreSQL if a write mentions it, so no code can keep its own copy` |

Los tres viven en
[`src/modules/movements/movements.search-column.test.ts`](../../src/modules/movements/movements.search-column.test.ts).
El resto de requirements (R1–R13, R15) son de los lotes B y C.

### Último `./init.sh`

<!-- La línea de tiempo de vitest no se transcribe: el guardián de datos reales
     la lee como un importe. -->

Ejecutado el 2026-09-18 al cerrar el lote A, con el lote C trabajando en `docs/`
en paralelo:

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──       [OK] Lint OK   [OK] Formato OK
── 6. Ejecutando tests ──     Test Files  71 passed (71)
                              Tests  1299 passed (1299)
                              [OK] Todos los tests pasan
── 7. Resumen ──              [OK] Entorno listo. Puedes empezar a trabajar.
```

Segunda pasada solo para leer el código de salida: `init.sh exit: 0`. Los
guardianes de la base del humano y de `var/` no dijeron nada, y `Movement` sigue
con 1.607 filas después de la suite (comprobado con `psql`).

- `pnpm exec prettier --check` sobre el test nuevo: `All matched files use Prettier code style!`
- `pnpm exec oxlint` sobre el test nuevo: sin avisos.

### Sugerencias fuera de scope (NO aplicadas)

- `docs/architecture.md` no tiene todavía ADR de esta columna generada; el lote C
  solo lleva `api-contract.md`, `README.md` y `roadmap.md`. Si el reviewer quiere
  dejar escrito el porqué de «generada y almacenada» frente a `unaccent`, hoy
  solo vive en `specs/47-movements-review-bulk/design.md` §3.
- El `descriptionSearch` de un movimiento viaja en la respuesta de cualquier
  `prisma.movement.findMany` que no use `select`; hoy el listado serializa campo
  a campo (`serializeMovement`), así que no se filtra al contrato — pero conviene
  que el lote B lo confirme al tocar el servicio.

---

## Lote C — contrato y documentación (2026-09-18)

Tasks T13, T14 y T15 de [`specs/47-movements-review-bulk/tasks.md`](../../specs/47-movements-review-bulk/tasks.md),
marcadas `[x]`. Cubren R15.

> Escrito **antes de que existiera el código del lote B**: ver §Qué está
> documentado por adelantado.

### Archivos modificados / creados

| Archivo | Qué le pasa |
| --- | --- |
| [`docs/api-contract.md`](../../docs/api-contract.md) | §`GET /api/movements`: tres filas nuevas en la tabla de querystring (`categoryId`, `uncategorized`, `q`), un párrafo de entrada que las sitúa, una nota «Cómo busca `q`» y las dos condiciones nuevas en la tabla de errores. **Sección nueva `### PATCH /api/movements`**, colocada entre `GET /api/movements` y `PATCH /api/movements/:id`, con enlaces cruzados en los dos sentidos. |
| [`README.md`](../../README.md) | §Endpoints: fila nueva `PATCH /api/movements`; la fila de `GET /api/movements` enumera ahora los filtros; y una nota de que esto es lo que el frontend necesita. |
| [`docs/roadmap.md`](../../docs/roadmap.md) | §E7, viñeta de los filtros: los dos que faltaban (categoría y texto del concepto) los añade la F47, y esa viñeta dice que desbloquea la E6 y parte de la E7 **del frontend**, apuntando a la parte 1 de `../../docs/handoff-pantalla-revision.md`. |

**No se tocó nada más**: ni `prisma/`, ni `src/`, ni `feature_list.json`, ni la
tabla de etapas de `docs/roadmap.md` (§El recorrido en etapas), que afirma
estados «✅» de features ya cerradas y la F47 todavía no lo está.

### Decisiones tomadas

1. **La sección nueva va ANTES de `PATCH /api/movements/:id`**: se lee primero la
   operación sobre varios y después la de uno, que es el orden en que el frontend
   las va a usar. Las anclas (`#patch-apimovements` / `#patch-apimovementsid`)
   siguen la forma que el archivo ya usaba.
2. **«Cómo busca `q`» se escribió como nota entera**, no como celda de tabla: son
   cinco reglas (trozo de texto, tildes, `%`/`_` literales, recorte de espacios,
   solo `description`) y quien lee el contrato no ha leído el spec.
3. **Se dice explícitamente lo que NO se ofrece**, porque es lo que un consumidor
   da por supuesto: `categoryId` de una categoría padre **no** arrastra las
   subcategorías, `q` **no** tiene comodines y **no** mira `note`, cuenta,
   categoría ni importe, y `PATCH /api/movements` **no** acepta pedirlo por
   filtro. Los tres salen de leer el `design.md` literalmente.
4. **`uncategorized=false` se documenta como «no filtra nada»**, que es lo que
   hace el `=== true` de `design.md` §2. Sin decirlo, un cliente puede creer que
   `false` significa «solo los que sí tienen categoría».
5. **No se documenta `descriptionSearch`** (lote A): es interna, no se serializa
   y el modelo `Movement` del contrato es lo que la API devuelve. Lo que el
   consumidor necesita saber —que la búsqueda no distingue tildes— está en la
   nota de `q`.
6. **Vocabulario:** ningún término nuevo. Se describe «cambiar varios movimientos
   en una sola petición» / «en bloque», y **«aviso» no aparece**, que es de la
   F48 y aquí no pinta nada.

### Qué está documentado por adelantado (para el reviewer)

Cuando se escribió esto, `src/modules/movements/` **no tenía** ni los filtros ni
el `PATCH /`. Todo lo de abajo sale de `design.md` y `requirements.md` y hay que
**contrastarlo contra el código del lote B** cuando exista:

| Lo documentado | De dónde sale | Qué contrastar |
| --- | --- | --- |
| `categoryId` entero ≥ 1; `uncategorized` booleano; `q` string 2–100 | `design.md` §2 | `listMovementsSchema` |
| `q` se recorta y **después** debe medir 2–100; si no, 400 | `design.md` §2 | **El punto más fino:** AJV mide *antes* del recorte, así que `"  a  "` solo da 400 si el servicio lo comprueba aparte |
| `categoryId` es coincidencia exacta, sin subcategorías | R1 + `design.md` §2 (`where.categoryId = query.categoryId`) | Que no haya un `in` con los hijos |
| `uncategorized=false` no filtra | `design.md` §2 | El `=== true` |
| `%` y `_` literales, sin comodines | R6 + `design.md` §3 | Que `normalizeForSearch` escape `\`, `%` y `_` |
| La búsqueda mira solo `description` | `design.md` §3 | La columna generada del lote A |
| 400 por `categoryId` + `uncategorized=true`; 404 por categoría inexistente | R3, R4 | Las dos validaciones previas de `listMovements` |
| Body `{ ids, categoryId?, status? }`; 1–200 ids, sin repetidos | R11 + `design.md` §4 | `bulkUpdateMovementsSchema` |
| Propiedad desconocida, o sin `categoryId` ni `status` → 400 | R12 + `design.md` §4 | El `preValidation` de la ruta |
| Respuesta `{ updated, movements }` con `updated === ids.length` | `design.md` §4 | `BulkUpdateMovementsResult` |
| Todo o nada en transacción; el `message` nombra los ids que fallan | R9, R10 + `design.md` §4 | Que el `message` los nombre de verdad |
| 400 por `neutral` con categoría o `kind` que no casa; 404 por id o categoría inexistente | R9, R10 | Los `code` y los HTTP |

**Discrepancias `design.md` ↔ `requirements.md`: no he encontrado ninguna.** Lo
más cercano es el mínimo de 2 caracteres de `q`: R5 no fija longitud y
`design.md` §2 la pone. No es una contradicción —el diseño concreta lo que el
requirement deja abierto—, pero **queda escrito en el contrato**: si el lote B lo
implementa de otra forma, manda el código y esta documentación hay que
corregirla.

### Trazabilidad (SDD)

- **R15 → este lote no trae test propio.** Son tres archivos de prosa y T13–T15
  no piden ninguno. Lo que sí se ejecutó verde es la suite entera, que incluye
  los dos guardianes que miran estos archivos (`src/no-real-data.test.ts` sobre
  todo fichero versionado, `docs/` incluidos).
  **Si el reviewer exige un test que ate R15** —hay precedente: la F48 tiene
  [`src/modules/import/import.warnings.docs.test.ts`](../../src/modules/import/import.warnings.docs.test.ts),
  que comprueba que el contrato nombra la ruta—, ese archivo vive en
  `src/modules/movements/` y es por tanto **del lote B**: no puedo crearlo sin
  pisar sus archivos.
- R1–R14 → lotes A y B.

### Último `./init.sh`

<!-- La línea de tiempo de vitest no se transcribe: el guardián de datos reales
     la lee como un importe. -->

Ejecutado al cerrar el lote C, con los archivos del **lote A ya en el árbol**
(migración `20260918140000_movement_description_search`, `prisma/schema.prisma` y
`movements.search-column.test.ts`) y **sin nada del lote B**:

```
── 3. Validando feature_list.json ──  [OK] válido (48 features)
                                      [OK] Specs presentes para features sdd
── 4. Type checking (tsc) ──          [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──               [OK] Lint OK   [OK] Formato OK
── 6. Ejecutando tests ──             Test Files  71 passed (71)
                                      Tests  1299 passed (1299)
                                      [OK] Todos los tests pasan
── 7. Resumen ──                      [OK] Entorno listo.
```

Código de salida leído: `init.sh exit: 0`.

⚠️ **Dos `./init.sh` a la vez dan un rojo falso.** Una pasada anterior, lanzada
mientras otro lote corría la suya, terminó en `exit 1` con **10 tests rojos en 11
archivos**: filas ajenas encontradas por la comprobación de
`vitest.global-setup.ts` (`Account: 1, Category: 1`…) y `PrismaClientKnownRequestError`
en archivos que no toca nadie (`overview`, `transfers`, `test-db`). Las dos
pasadas comparten las bases `gastos_test_<poolId>`, así que se pisan. La pasada
siguiente, ya en solitario y sin cambiar una línea, salió verde con exit 0. **Nada
de este lote puede poner la suite roja** (son tres archivos de prosa), pero queda
anotado porque el reviewer se lo encontrará si ejecuta a la vez que otro.

### Sugerencias fuera de scope (NO aplicadas)

1. **`../docs/handoff-pantalla-revision.md` (nivel workspace) sigue con la parte 1
   en ⬜.** Su propio texto pide marcarla ✅ con fecha y commit al terminar. Está
   fuera de mis tres archivos y fuera de este repositorio; lo cierra quien cierre
   la feature.
2. **La fila E7 de la tabla de etapas de `docs/roadmap.md` dice «✅ entera
   (2026-09-11)»** mientras su propia sección §E7 decía que faltaban dos filtros.
   La contradicción es anterior a esta feature y no la he tocado; al cerrar la F47
   tocaría añadir **F47** a las filas E6 y E7 de esa tabla.
3. **El `README.md` no lista `GET /api/import/warnings` ni
   `PATCH /api/import/warnings/balance-mismatches/:id`** (F48), que sí están en
   `api-contract.md`. No es de esta feature; se anota por si interesa.
4. Lo que apuntó el lote A sobre un **ADR de la columna generada** en
   `docs/architecture.md` sigue sin hacer: ese archivo no es de este lote.

---

## Lote B — filtros nuevos y cambio sobre varios movimientos (2026-09-18)

Tasks T4–T12 de [`specs/47-movements-review-bulk/tasks.md`](../../specs/47-movements-review-bulk/tasks.md),
marcadas `[x]`. Cubren R1–R13.

### Archivos modificados / creados

| Archivo | Qué le pasa |
| --- | --- |
| [`src/modules/movements/movements.schema.ts`](../../src/modules/movements/movements.schema.ts) | `listMovementsSchema`: tres propiedades nuevas (`categoryId` entero ≥ 1, `uncategorized` booleano, `q` string 2–100), con `additionalProperties: false` intacto. Nuevos `bulkUpdateMovementsMaxIds = 200`, `bulkUpdateMovementsSchema`, `bulkUpdateMovementsBodyProperties` y `bulkUpdateMovementsWritableProperties`. `updateMovementSchema` **sin tocar**. |
| [`src/modules/movements/movements.types.ts`](../../src/modules/movements/movements.types.ts) | `MovementListQuery` gana `categoryId?`, `uncategorized?` y `q?`. Nuevos `BulkUpdateMovementsBody` y `BulkUpdateMovementsResult`. `UpdateMovementBody` y `SerializedMovement` **sin tocar**. |
| [`src/modules/movements/movements.service.ts`](../../src/modules/movements/movements.service.ts) | `movementListWhere` monta los tres filtros; `normalizeForSearch` (exportada) y el ayudante privado `searchTerm`; dos validaciones previas en `listMovements`; `bulkUpdateMovements` nueva + ayudante `idList`. `updateMovement` **sin tocar**. |
| [`src/modules/movements/movements.routes.ts`](../../src/modules/movements/movements.routes.ts) | Registro de `PATCH /` con su `preValidation` (`assertOnlyAllowedBodyProperties` + `assertSomethingToWrite`, local al archivo). El `PATCH /:id` y el `GET /` quedan tal cual. |
| [`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts) | 11 tests nuevos al final del `describe` del listado. Ningún test anterior modificado ni borrado. |
| [`src/modules/movements/movements.bulk.test.ts`](../../src/modules/movements/movements.bulk.test.ts) | **Nuevo.** 18 tests de integración de `PATCH /api/movements`. |

Fuera del lote no se ha tocado nada: ni `prisma/`, ni `docs/`, ni `README.md`,
ni `feature_list.json`, ni `progress/current.md` (lo comparten los tres lotes en
paralelo y no está en mi cabecera `Archivos:`).

### Decisiones tomadas

1. **`q` se valida dos veces, a propósito.** AJV mide `minLength: 2` sobre el
   valor **sin recortar**, así que una `q` de espacios más una letra pasaría el
   esquema con un solo carácter útil. `listMovements` vuelve a medirlo **después**
   del recorte y lanza `ValidationError`. Es justo el punto que el lote C marcó
   como «el más fino» en su tabla: queda implementado como lo documentó.
2. **El escape de `LIKE` se ejecutó, no se dedujo.** `normalizeForSearch` escapa
   la barra invertida, `%` y `_` con barra invertida (la barra primero, o
   escaparía a los escapes) y hay tres tests que lo comprueban contra
   PostgreSQL: buscar `100%` no trae `DESCUENTO 100 ONLINE`, buscar `a_b` no trae
   `PAGO AXB ONLINE`, y buscar una barra invertida sí trae la descripción que la
   lleva. El carácter de escape por defecto de `LIKE` en PostgreSQL es la barra
   invertida, y Prisma pasa el patrón como parámetro.
3. **Un único `where`, como exige R7.** Los tres filtros se montan dentro de
   `movementListWhere`, que es lo que ya comparten el `findMany` de la página, el
   `count` y la lectura de los `totals`. No se añadió ninguna consulta nueva ni
   una lista de ids intermedia; el test de combinación comprueba a la vez la
   página (una fila), `pagination.total` (tres) y los `totals` (las tres).
4. **Las dos validaciones previas van antes de tocar la base**, y en este orden:
   `categoryId` + `uncategorized` juntos (400) → `q` recortada (400) →
   `accountId` existe (404) → `categoryId` existe (404). Así una petición
   incoherente es 400 aunque además nombre una categoría inexistente.
5. **`uncategorized=false` no filtra nada** (`=== true`), con test propio: sin
   él, es fácil que alguien lo lea como «solo los que sí tienen categoría».
6. **La operación sobre varios NO llama a `updateMovement` en bucle.** Valida el
   conjunto de una vez y hace un solo `updateMany`, todo dentro de
   `prisma.$transaction`; el mensaje de error nombra **los ids concretos** que
   fallan (el `NotFoundError` de `updateMovement` no sabe cuál del lote fue).
   Cada test de rechazo **relee las filas** y comprueba que siguen como estaban:
   un 400 que además hubiera escrito algo se vería idéntico mirando solo el
   código de estado.
7. **El `data:` del `updateMany` lleva solo `categoryId` y/o `status`** (R13), y el
   `preValidation` rechaza cualquier otra propiedad antes de que AJV la borre en
   silencio — el mismo mecanismo que el PATCH individual. Hay test que manda un
   importe en el cuerpo: 400 y el importe de la fila intacto.
8. **El «al menos uno de los dos» no se puede expresar con `minProperties`**
   (`ids` siempre está), así que vive en el `preValidation` de la ruta, junto al
   rechazo de propiedades desconocidas. Se dejó como función local del archivo de
   rutas y **no** se tocó `src/lib/strict-body.ts`, que no es de mi lote.
9. **Un id que no es entero:** `0` y `"abc"` dan 400, pero un número escrito entre
   comillas da **404**, no 400, porque el AJV de Fastify va con `coerceTypes` y lo
   convierte. Es el comportamiento que ya tenía el resto del proyecto; no lo he
   cambiado y el test se escribió sobre lo que hace de verdad, no sobre lo que yo
   suponía (lo descubrí porque el test falló).
10. **Confirmado lo que pidió el lote A:** `descriptionSearch` **no** se filtra al
    contrato. `serializeMovement` copia campo a campo y el test
    `keeps the serialized shape of each movement exactly as it was` compara la
    lista exacta de claves; sigue verde con la columna ya existente.
11. **Se intentó un test de que un parámetro desconocido de la querystring da
    400, y se retiró: no es verdad.** El AJV de Fastify va con
    `removeAdditional`, así que un nombre de parámetro mal escrito se **descarta
    en silencio** y la respuesta es 200. Ninguna R lo pide, y cambiarlo tocaría la
    forma de `GET /api/movements`, que esta feature protege. Queda como
    sugerencia abajo.
12. **Vocabulario:** ningún término nuevo. Código, comentarios y mensajes en
    inglés, como el resto del módulo.

### Trazabilidad (SDD)

| Requirement | Test |
| --- | --- |
| R1 | `movement routes … > GET /api/movements?categoryId= returns only the movements of that category (R1)` |
| R2 | `… > GET /api/movements?uncategorized=true returns only the ones with no category (R2)` y `… ?uncategorized=false does not filter anything out (R2)` |
| R3 | `… > rejects categoryId and uncategorized together with 400 VALIDATION_ERROR (R3)` (comprueba además que la respuesta no trae lista) |
| R4 | `… > answers 404 NOT_FOUND for a categoryId that does not exist (R4)` |
| R5 | `… > GET /api/movements?q= matches the description ignoring case and diacritics (R5)`, `… also finds an accented word typed WITH its accent (R5)` y `… rejects a q shorter than 2 characters, also once trimmed, with 400 (R5)` |
| R6 | `… > GET /api/movements?q= treats % and _ as literal characters, not wildcards (R6)` y `… with a backslash finds it literally, escaping the escape (R6)` |
| R7 | `… > combines the new filters with account, range, type, status and pagination (R7)` (página, `pagination.total` y `totals` en la misma aserción) |
| R8 | `PATCH /api/movements … > confirms every movement of the list and answers how many changed (R8)`, `… assigns one category to every movement of the list and embeds it (R8)`, `… applies category and status in the same request (R8)`, `… removes the category of every movement with categoryId: null (R8)` y `… lets a status-only request through for a neutral movement (R8)` |
| R9 | `… > answers 404 when one id does not exist, and changes NOT ONE of the others (R9)` y `… answers 404 for a category that does not exist, without touching a row (R9)` |
| R10 | `… > answers 400 when the category kind does not match ONE movement, and none changes (R10)` y `… answers 400 when ONE movement is neutral, and none changes (R10)` |
| R11 | `… > rejects an empty ids list with 400 (R11)`, `… rejects a repeated id with 400 and does not change it (R11)`, `… rejects more than 200 ids with 400, and takes exactly that many (R11)`, `… rejects an id that is not a positive integer with 400 (R11)` y `… rejects a body without ids and an unknown status with 400 (R11, R12)` |
| R12 | `… > rejects an unknown body property with 400 instead of ignoring it (R12, R13)` y `… rejects a body with neither categoryId nor status with 400 (R12)` |
| R13 | `… > leaves amount, dates and description exactly as they were (R13)` (compara doce columnas antes y después) y el test de R12, que manda un importe en el cuerpo |
| R14 | Lote A (`movements.search-column.test.ts`). |
| R15 | Lote C (`docs/api-contract.md`). |

Los de R1–R7 viven en
[`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts);
los de R8–R13, en
[`src/modules/movements/movements.bulk.test.ts`](../../src/modules/movements/movements.bulk.test.ts).

Protegido además, con test: `PATCH /api/movements/:id` sigue funcionando igual
(`… > keeps PATCH /api/movements/:id working exactly as before (feature 37)`, más
los tests de la F37, que no se tocaron), y la forma de `GET /api/movements` no
cambia (`… keeps the serialized shape …` y `answers without any filter,
paginated with the defaults`).

### Último `./init.sh`

<!-- La línea de tiempo de vitest no se transcribe: el guardián de datos reales
     la lee como un importe. -->

Ejecutado el 2026-09-18 al cerrar el lote B, con los lotes A y C ya en el árbol:

```
── 3. Validando feature_list.json ──  [OK] válido (48 features)
                                      [OK] Specs presentes para features sdd
── 4. Type checking (tsc) ──          [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──               [OK] Lint OK   [OK] Formato OK
── 6. Ejecutando tests ──             Test Files  72 passed (72)
                                      Tests  1328 passed (1328)
                                      [OK] Todos los tests pasan
── 7. Resumen ──                      [OK] Entorno listo. Puedes empezar a trabajar.
```

Son 29 tests más que la pasada del lote C (1299 → 1328): once en
`movements.test.ts` y dieciocho en `movements.bulk.test.ts`. Antes de esa pasada
se ejecutaron por separado `npx vitest run src/modules/movements/` (110 tests en
3 archivos, todos verdes), `npx prettier --check` sobre los seis archivos («All
matched files use Prettier code style!») y `npx oxlint src/modules/movements`
(sin avisos, exit 0).

### Sugerencias fuera de scope (NO aplicadas)

1. **Un parámetro desconocido en la querystring de `GET /api/movements` se ignora
   en silencio** (comprobado ejecutándolo: responde 200). Un nombre de filtro mal
   escrito devuelve la tabla entera sin avisar. Se arreglaría con el mismo patrón
   del cuerpo (una comprobación previa contra la lista de propiedades del
   esquema), pero cambia el comportamiento de un endpoint que esta feature
   protege y no lo pide ninguna R.
2. **El test que ata R15** que el lote C dejó pedido (al estilo de
   `import.warnings.docs.test.ts`, comprobando que `docs/api-contract.md` nombra
   `PATCH /api/movements`) **no lo he escrito**: T13–T15 no lo piden y no quería
   añadir un archivo que el spec no contempla. Si el reviewer lo quiere, su sitio
   natural es `src/modules/movements/movements.docs.test.ts`.
3. **La búsqueda por texto hace escaneo secuencial**, como dicen el `design.md` §6
   y `decisions.md`. Con las filas de hoy no se nota; queda anotado allí.
4. Siguen sin hacer las sugerencias de los lotes A y C (ADR de la columna generada
   en `docs/architecture.md`, `handoff-pantalla-revision.md` del workspace, filas
   E6/E7 de la tabla de etapas): ninguno de esos archivos es de mi lote.

---

## Cierre documental (implementer, 2026-09-18)

Sin código nuevo: la feature ya estaba aprobada por el reviewer en segunda pasada
([veredicto](../reviews/movements-review-bulk.md)). Lo hecho aquí:

| Archivo | Qué le pasa |
| --- | --- |
| [`feature_list.json`](../../feature_list.json) | La feature 47 pasa de `in_progress` a `"status": "done"`. `npx prettier --check feature_list.json` → `All matched files use Prettier code style!` |
| [`progress/summaries/movements-review-bulk.md`](../summaries/movements-review-bulk.md) | **Nuevo.** Resumen para el humano. |
| [`progress/history.md`](../history.md) | Una línea con la F47. |
| [`progress/current.md`](../current.md) | La sección de borrador de intent de la F47 se sustituye por la de cierre; se añade la sección del **lote B**, que no la tenía (nota menor del reviewer); y la prueba real de la F47 en cuatro pasos en §Lo que le toca al humano. No se tocó la sección de la F48 ni el resto de esa lista. |
| [`docs/roadmap.md`](../../docs/roadmap.md) | **F47** sumada a las filas **E6** y **E7** de la tabla de etapas, que es lo que el lote C dejó anotado como fuera de su alcance. §E7 ya la situaba desde el lote C. |
| `../../docs/handoff-pantalla-revision.md` (workspace, fuera de este repositorio) | Parte 1 marcada **✅ 2026-09-18**, con el hueco del commit como **«pendiente de commit»**: el humano no ha dado orden de commitear y no se inventa un hash. Partes 2 y 3 sin tocar. |

**No se ha hecho ningún commit.**

### Último `./init.sh`

<!-- La línea de tiempo de vitest no se transcribe: el guardián de datos reales
     la lee como un importe. -->

Ejecutado completo al terminar el cierre documental, con todo en el árbol:

```
── 2. Archivos base del arnés ──       [OK] los 10
── 3. Validando feature_list.json ──   [OK] válido (48 features)
                                       [OK] Specs presentes para features sdd
── 4. Type checking (tsc) ──           [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──                [OK] Lint OK   [OK] Formato OK
── 6. Ejecutando tests ──              Test Files  72 passed (72)
                                       Tests  1328 passed (1328)
                                       [OK] Todos los tests pasan
── 7. Resumen ──                       [OK] Entorno listo. Puedes empezar a trabajar.
```

Código de salida leído: `init.sh exit: 0`. Mismos números que la segunda pasada
del reviewer (72 archivos, 1328 tests).

### Sugerencias fuera de scope (NO aplicadas)

- Sigue sin ADR de la columna generada en `docs/architecture.md` (lo apuntaron los
  lotes A y C); hoy el porqué vive solo en `specs/47-movements-review-bulk/design.md` §3.
- El `README.md` sigue sin listar las dos rutas de la F48 (`GET /api/import/warnings`
  y `PATCH /api/import/warnings/balance-mismatches/:id`), que sí están en el
  contrato. Lo apuntó el lote C; no es de esta feature.
- La cabecera de §E7 de `docs/roadmap.md` dice «🟡 casi entera» mientras su fila de
  la tabla dice «✅ entera»; la contradicción es anterior a esta feature y no se ha
  tocado para no inventar estado.
