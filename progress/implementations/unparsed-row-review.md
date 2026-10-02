# unparsed-row-review — implementación

Feature 54, lote A (único). Implementado el 2026-10-02. Las 12 tasks están `[x]`
en `specs/54-unparsed-row-review/tasks.md`. Sin commit y sin marcar `done`.

> **Se ha escrito en la base de datos real del humano, a propósito y solo el
> esquema:** la migración de esta feature se aplicó a la base `gastos` de
> `localhost:5434` con `pnpm exec prisma migrate deploy`. Detalle, motivo y
> comprobaciones en §La migración. Ninguna fila se creó, cambió ni borró.

## Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| `prisma/schema.prisma` | `ImportUnparsedRow` gana `status`, `note`, `reviewedAt`. El comentario del enumerado `ImportWarningStatus` decía que una fila que el parser no pudo leer no tiene estado: corregido. |
| `prisma/migrations/20261002120000_unparsed_row_review/migration.sql` | Nuevo. El SQL de `design.md` §2.1, tal cual: un `ALTER TABLE` con tres `ADD COLUMN`. |
| `src/lib/test-real-data.ts` | `ImportUnparsedRow.note` en `comparedColumns`, como `text`. |
| `src/modules/import/import.warnings.types.ts` | `SerializedUnparsedRow` con `status`, `note`, `reviewedAt`; tipo `ReviewUnparsedRowPatch`. |
| `src/modules/import/import.warnings.service.ts` | `serializeUnparsedRow` con los tres campos; `counts.unparsedRows` cuenta solo las `pending`; función nueva `reviewUnparsedRow`. `persistImportWarnings` no cambia de código (solo comentarios). |
| `src/modules/import/import.warnings.schema.ts` | `reviewUnparsedRowSchema`, que referencia `params` y `body` del esquema de los descuadres. |
| `src/modules/import/import.warnings.routes.ts` | Ruta nueva `PATCH /warnings/unparsed-rows/:id`. |
| `src/modules/import/import.warnings.service.test.ts` | Bloque nuevo `unreadable row review (feature 54)`, 3 tests. |
| `src/modules/import/import.warnings.routes.test.ts` | Bloque nuevo `unreadable row review routes (feature 54)`, 9 tests. |
| `src/modules/import/import.warnings.docs.test.ts` | `unparsedRowFields` pasa a los ocho campos; bloque nuevo con 4 tests que leen los documentos. |
| `src/modules/import/import.routes.ts` | Solo el comentario que lista las rutas: ahora son tres. Añadido al lote por el leader. |
| `docs/api-contract.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/conventions.md` | Ver §Documentos actualizados. |

`src/lib/test-real-data.test.ts` **no se ha tocado**: su test no enumera las
columnas, las lee de `prisma/schema.prisma`, y pasa con la entrada nueva.

No se ha tocado `src/modules/import/import.service.ts`, ningún parser,
`src/app.ts` ni el campo `checks` de `feature_list.json`.

## La migración

**Escrita a mano**, con el SQL exacto de `design.md` §2.1. No se usó
`prisma migrate dev` ni `prisma migrate reset`.

**Por qué hubo que aplicarla a la base real.** Con la columna declarada en
`comparedColumns`, `vitest.global-setup.ts` la lee de la base real al arrancar
cualquier pasada. Antes de aplicarla, comprobado ejecutando
`pnpm exec vitest run src/modules/import/import.warnings.routes.test.ts src/modules/import/import.warnings.service.test.ts`:
salió con código 1 y `error: column "note" does not exist`
(`src/lib/test-real-data.ts:142`, llamado desde `vitest.global-setup.ts:66`), sin
ejecutar ningún test. Sin la columna en esa base no pasa ni un test del proyecto.

**Qué se lanzó, contra qué base y qué salió** (base `gastos`, esquema `public`,
`localhost:5434`, contenedor `gastos-postgres`):

1. Antes, solo lectura:
   `docker exec gastos-postgres psql -U postgres -d gastos -At -c 'select count(*) from "ImportUnparsedRow"'`
   → `0`. Columnas de la tabla: `id`, `bank`, `year`, `fileName`, `rowNumber`,
   `reason`, `createdAt`, `updatedAt`.
2. `pnpm exec prisma migrate status` → «11 migrations found», una sola sin aplicar:
   `20261002120000_unparsed_row_review`.
3. `pnpm exec prisma migrate deploy` → «Applying migration
   `20261002120000_unparsed_row_review`», «All migrations have been successfully
   applied.», código de salida 0. No pidió ninguna confirmación.
4. Después, solo lectura: el mismo recuento → `0`. Columnas nuevas, leídas de
   `information_schema.columns`: `status` (no nula, por defecto
   `'pending'::"ImportWarningStatus"`), `note` (`text`, admite nulo),
   `reviewedAt` (`timestamp without time zone`, admite nulo).
   `pnpm exec prisma migrate status` → «Database schema is up to date!».
5. `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
   → no sale ninguna diferencia en `ImportUnparsedRow`. Sale una sola línea, de
   otra tabla y anterior a esta feature (ver §Sugerencias).

La comprobación de `vitest.global-setup.ts` que compara la base real antes y
después de la suite pasó en las dos pasadas completas (la de `./init.sh` y la del
check 8).

## Decisiones tomadas

- **`reviewUnparsedRowSchema` reutiliza el conjunto de propiedades admitidas de
  los descuadres** (`reviewBalanceMismatchBodyProperties`) en el `preValidation`
  de la ruta nueva, como dice `design.md` §2.4. No se ha creado un segundo
  conjunto.
- **`counts.unparsedRows` se cuenta en memoria** sobre la lista ya leída
  (`design.md` §2.3), sin segunda consulta.
- **Un test más de los que pide `tasks.md`** en el bloque de rutas: `marks an
  unreadable row reviewed without any note`. R1 dice «con o sin `note`» y los
  tests pedidos solo cubrían el caso con nota. No coincide con el filtro de ningún
  `check` (los 8 siguen seleccionando exactamente 1 test).
- **Un test más en el de documentos**: `data-model: declares for
  ImportUnparsedRow the same columns as prisma/schema.prisma`. Compara las 11
  columnas (nombre y tipo) del bloque de `docs/data-model.md` con las del esquema
  real; es la comprobación que pide la lección 2 de `docs/lessons.md`, dejada como
  test en vez de hecha una vez a mano.
- **El caso «el `:id` no es un entero ≥ 1» de R5 se prueba con dos peticiones**
  (`0` y `not-a-number`), así que el test de los 400 hace seis peticiones para
  los cinco casos.
- **En `docs/data-model.md` las dos claves naturales van en una tabla dentro de
  la sección nueva**, no en la tabla «Claves naturales» existente, que está en la
  Parte 2 (inversiones). `design.md` §4 admite las dos opciones.
- **En el bloque `model Account` de `docs/data-model.md` se ha añadido la
  relación inversa `importBalanceMismatches`**, que el esquema real tiene desde
  la F48 y el documento no reflejaba.
- **Prueba de que el test de R8 detecta el fallo:** se cambió a propósito el
  `update` de `persistImportWarnings` para que escribiera `status: 'pending'`,
  `note: null`, `reviewedAt: null`; el test `reimporting does NOT take the
  reviewed mark nor the note off an unreadable row` falló con
  `AssertionError: expected 'pending' to be 'reviewed'`. El cambio se revirtió
  (comprobado con `grep`: 0 apariciones).

## Trazabilidad

Archivos: `routes` = `src/modules/import/import.warnings.routes.test.ts`,
`service` = `src/modules/import/import.warnings.service.test.ts`,
`docs` = `src/modules/import/import.warnings.docs.test.ts`.

- R1 → `routes` › `marks an unreadable row reviewed with its note and returns it serialized`, `marks an unreadable row reviewed without any note`, `registers the unreadable-row review route under the /api/import prefix`
- R2 → `routes` › `puts a reviewed unreadable row back to pending keeping its note`
- R3 → `routes` › `stores only the note of an unreadable row without touching its status`
- R4 → `routes` › `answers 404 NOT_FOUND when the id is of no stored unreadable row`; `service` › `throws NOT_FOUND when the id is of no stored unreadable row`
- R5 → `routes` › `answers 400 VALIDATION_ERROR to a bad body or id of the unreadable-row route, changing nothing`
- R6 → `routes` › `lists a reviewed unreadable row as reviewed, with its note and when it was reviewed` (las dos filas, su orden y los ocho campos de cada una)
- R7 → `routes` › `counts only the unreadable rows still pending`
- R8 → `service` › `reimporting does NOT take the reviewed mark nor the note off an unreadable row`
- R9 → `service` › `stores a new unreadable row as pending, with no note and no review date`
- R10 → `routes` › `marks an unreadable row reviewed with its note and returns it serialized` (la fila sigue en la tabla, recuento 1)
- R11 → los tests de la feature 48 sobre descuadres en `routes` y `service`, sin ningún cambio, en verde dentro de la suite
- R12 → `src/modules/import/import.service.test.ts` e `import.routes.test.ts`, sin ningún cambio, en verde dentro de la suite
- R13 → `docs` › `api-contract: names the route that reviews an unreadable row and its fields`, más `describes every field of an unreadable row` y `publishes an example answer with EXACTLY those fields` (feature 48, ahora con ocho campos)
- R14 → `docs` › `data-model: describes ImportUnparsedRow with its review columns`, `data-model: declares for ImportUnparsedRow the same columns as prisma/schema.prisma`
- R15 → `docs` › `roadmap: closes loose end 23 with feature 54 and says creating the movement by hand was discarded`

**T7 — tests existentes.** El único cambio en un test existente es la lista
`unparsedRowFields` de `import.warnings.docs.test.ts` (de cinco a ocho campos),
que es el que `tasks.md` pide. Ningún otro test existente se ha editado: en los
tres archivos `import.warnings.*.test.ts` lo demás son líneas añadidas (imports y
bloques nuevos al final).

## Documentos actualizados

Búsquedas lanzadas, fuera de `progress/`, `specs/` y `src/generated/`:

- `git grep -n "balance-mismatches\|listPendingImportWarnings\|import/warnings"`
- `git grep -n -i "no state\|sin estado\|no tiene estado\|no tienen estado\|filas ilegibles no\|unparsedRows.length"`
- `grep -n "cabo 23\|cabo suelto 23" docs/*.md`

Líneas corregidas:

- **`docs/api-contract.md`**, sección «Lo que una importación deja sin resolver»:
  nota fechada de la feature 54 (cambio visible para el frontend); la frase de
  qué devuelve la consulta; el ejemplo JSON con los tres campos y
  `counts.unparsedRows` a `0`; tres filas nuevas en la tabla de `unparsedRows[]`;
  la descripción de `counts` (ya no es el tamaño de las dos listas); el punto
  «Las filas ilegibles no tienen estado y salen todas» sustituido; la frase del
  `PATCH` de descuadres que decía «(no tiene estado)»; subsección nueva
  `### PATCH /api/import/warnings/unparsed-rows/:id` con params, body, respuesta
  con ejemplo y errores. Las frases que comprueba `import.warnings.docs.test.ts`
  sobre los descuadres siguen literales.
- **`docs/data-model.md`**: sección nueva «Lo que una importación deja sin
  resolver (F48, F54)» antes de «Puntos abiertos», con el enumerado y los dos
  modelos, la tabla de claves naturales y quién escribe cada columna de la
  revisión; las dos entidades en el diagrama de la Parte 1; una fila en la tabla
  de la cabecera; la relación inversa en `model Account`. La tabla «Columnas
  reservadas» no cambia: las tres columnas nacen con escritor.
- **`docs/architecture.md`**: línea «Revisado el 2026-10-02 por la feature 54…»
  encima del ADR-031. El ADR no se reescribe; la línea dice que su frase «una
  fila ilegible **no** tiene estado» queda como historia.
- **`docs/roadmap.md`**: fila 23 tachada y cerrada por la F54, diciendo que crear
  el movimiento a mano quedó descartado por el humano; fila E5 con la F54; en
  §E5, la frase «es el cabo suelto 23» corregida y un punto nuevo para la F54.
- **`docs/conventions.md`** §Tests: `ImportUnparsedRow.note` en la lista de
  textos que compara `src/no-real-data.test.ts`.
- **Comentarios de código** que decían que una fila no tiene estado:
  `prisma/schema.prisma` (enumerado) e `import.warnings.service.ts`
  (`listPendingImportWarnings`).

**Una línea que estaba fuera de los archivos del lote, corregida después por
decisión del leader (2026-10-02):** el comentario de
`src/modules/import/import.routes.ts` que listaba dos rutas (`GET
/api/import/warnings` y `PATCH …/balance-mismatches/:id`). El leader añadió ese
archivo al lote, solo para ese comentario: ahora dice «The three routes …
(features 48 and 54)» y lista también
`PATCH /api/import/warnings/unparsed-rows/:id`. Ningún código de ese archivo ha
cambiado (`git diff --stat`: 3 líneas añadidas y 2 quitadas, todas del
comentario). Tras el cambio: `./init.sh` → código de salida 0, 70 archivos de
test y 1302 tests; `./init.sh --checks 54` → código de salida 0, «Checks: 8 de 8
en verde».

## Prueba real

No aplica: la feature no lee ningún archivo ni dato de fuera del código. No se ha
llamado a la ruta nueva contra la base real, porque escribiría en ella; además su
tabla `ImportUnparsedRow` tiene 0 filas, así que no hay ninguna fila que revisar.
Los fixtures de los tests son inventados (nombres de banco y de archivo
sintéticos, motivos y notas escritos para el test); no hay ningún fixture `.xls`
ni `.pdf`.

## Último ./init.sh

`./init.sh` → código de salida 0.

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ───────────────────────────────────
[OK]    OK: pnpm run lint
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  70 passed (70)
      Tests  1302 passed (1302)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Partida: 70 archivos y 1286 tests. Ahora: 70 archivos y 1302 tests (16 nuevos: 3
en `service`, 9 en `routes`, 4 en `docs`).

Por separado, antes: `pnpm run typecheck` → 0, `pnpm run lint` → 0,
`pnpm run format:check` → 0 («All matched files use Prettier code style!»).

## Último ./init.sh --checks

`./init.sh --checks 54` → código de salida 0.

```
[INFO]  Feature: F54 unparsed-row-review
[1] … -t "marks an unreadable row reviewed with its note and returns it serialized"   [OK] exit 0   Tests  1 passed | 20 skipped (21)
[2] … -t "lists a reviewed unreadable row as reviewed, with its note and when it was reviewed"   [OK] exit 0   Tests  1 passed | 20 skipped (21)
[3] … -t "counts only the unreadable rows still pending"   [OK] exit 0   Tests  1 passed | 20 skipped (21)
[4] … -t "puts a reviewed unreadable row back to pending keeping its note"   [OK] exit 0   Tests  1 passed | 20 skipped (21)
[5] … -t "answers 404 NOT_FOUND when the id is of no stored unreadable row"   [OK] exit 0   Tests  1 passed | 20 skipped (21)
[6] … -t "reimporting does NOT take the reviewed mark nor the note off an unreadable row"   [OK] exit 0   Tests  1 passed | 14 skipped (15)
[7] … -t "api-contract: names the route that reviews an unreadable row and its fields"   [OK] exit 0   Tests  1 passed | 13 skipped (14)
[8] pnpm test   [OK] exit 0
[OK]    Checks: 8 de 8 en verde.
```

## Sugerencias fuera de scope (NO aplicadas)

- **Diferencia entre la base real y el esquema, anterior a esta feature.**
  `prisma migrate diff` contra la base `gastos` devuelve una única línea:
  `ALTER TABLE "Movement" ALTER COLUMN "descriptionSearch" DROP DEFAULT;`. No es
  de la feature 54 ni de su tabla. No he comprobado de qué migración viene ni si
  `prisma migrate dev` pediría reiniciar la base por ella; haría falta lanzarlo
  contra una copia, no contra la base real.
