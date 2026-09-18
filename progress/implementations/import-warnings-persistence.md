# F48 `import-warnings-persistence` — implementación

> Un archivo por feature, en secciones por lote. Cada implementer **añade** la
> suya al final; nadie sobrescribe la de otro.

## Lote A — implementación (2026-09-18)

Tasks T1..T5 de `specs/48-import-warnings-persistence/tasks.md`, marcadas `[x]`.
Solo se han tocado los archivos declarados en la cabecera `Archivos:` del lote A.

### Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [`prisma/schema.prisma`](../../prisma/schema.prisma) | `enum ImportWarningStatus`, `model ImportUnparsedRow`, `model ImportBalanceMismatch` (con sus dos `@@unique` nombrados por `map:`) y la relación inversa `importBalanceMismatches` en `Account`. Modificado. |
| [`prisma/migrations/20260918091426_import_warnings/migration.sql`](../../prisma/migrations/20260918091426_import_warnings/migration.sql) | Migración generada por `pnpm exec prisma migrate dev --name import_warnings`. Sin SQL crudo añadido a mano. Nuevo. |
| [`src/modules/import/import.warnings.types.ts`](../../src/modules/import/import.warnings.types.ts) | `WarningFileRef`, `ImportWarningsInput`, `SerializedUnparsedRow`, `SerializedBalanceMismatch`, `ImportWarningsReport`, `ReviewBalanceMismatchPatch`. Nuevo. |
| [`src/modules/import/import.warnings.service.ts`](../../src/modules/import/import.warnings.service.ts) | `persistImportWarnings`, `listPendingImportWarnings`, `reviewBalanceMismatch`. Nuevo. |
| [`src/modules/import/import.warnings.service.test.ts`](../../src/modules/import/import.warnings.service.test.ts) | 12 tests contra la base desechable. Nuevo. |

Además, `pnpm exec prisma generate` regeneró `src/generated/prisma/` (artefacto
generado, no versionado como código a mano).

### Decisiones tomadas

1. **La migración se aplicó con `prisma migrate dev`** sobre la base de
   desarrollo `gastos` del `docker-compose.yml` (`localhost:5434`), que es el
   comando que el diseño §2 pide y el que envuelve `pnpm run prisma:migrate`. No
   hubo deriva ni reinicio de la base: la salida fue
   `Applying migration 20260918091426_import_warnings` → `Your database is now in
   sync with your schema`. La plantilla de las bases de test se remigra sola
   (`docs/conventions.md` §Tests con base de datos).
2. **El nombre de la clave compuesta en el cliente Prisma** queda
   `bank_year_fileName_accountId_bookingDate_check_computed_fromFile` (el `map:`
   solo renombra el índice en Postgres). Comprobado por el type check, que pasa.
3. **`updatedAt` se escribe explícitamente** en los dos `upsert` (`update:
   { updatedAt: seenAt }`) en vez de confiar en que `@updatedAt` se dispare con
   un `update` vacío. Es lo que hace que `lastSeenAt` signifique «la última
   importación que volvió a producirlo».
4. **El `update` del descuadre no toca `status`, `note` ni `reviewedAt`.** Es la
   línea de R7 y está comentada como tal en el código.
5. **`reviewedAt` se pone a `null` al devolver un descuadre a `pending`.** El
   spec no lo dice (T4 solo pide escribirlo al pasar a revisado). Se decide así
   para que una fila pendiente no arrastre la fecha de una revisión que ya no
   vale; `reviewedAt` **no** sale en la serialización, así que no cambia nada de
   lo que el contrato publica. Si el reviewer prefiere conservarlo, es una línea.
6. **`difference` no se guarda**: se deriva al serializar
   (`computed.minus(fromFile).toFixed(2)`), como manda el diseño §2.
7. **El test vacía las dos tablas en `beforeEach`/`afterEach`**, no solo sus
   propias filas: `listPendingImportWarnings` no tiene filtro, así que una fila
   ajena cambiaría `counts`. El archivo termina dejando las dos tablas vacías y
   borrando su cuenta sintética.
8. **Nada de este lote nombra un banco**: el slug viaja como dato en
   `WarningFileRef` y el fixture usa el banco inventado `test-warnings-bank`
   (ADR-015 intacto).

### Trazabilidad (criterio → test)

Todos los tests están en
[`src/modules/import/import.warnings.service.test.ts`](../../src/modules/import/import.warnings.service.test.ts).

| Requisito | Test |
|---|---|
| R1 | `stores one row per unreadable row, with its file, its number and its reason (R1)` |
| R2 | `stores one row per descuadre with the account, the date, the two amounts and the check (R2)` |
| R6 | `reimporting the same file updates the same warnings instead of duplicating them (R6)` · `tells two warnings of DIFFERENT files apart even with the same contents (R6)` |
| R7 | `reimporting does NOT resurrect a descuadre already reviewed, and keeps its note (R7)` |
| R8 | `writes nothing at all when the file left no warning (R8)` |
| R9 | `lists the two kinds serialized as the report already writes them (R9)` · `lists the most recent warning first (R9)` |
| R10 | `leaves a reviewed descuadre out of the list and out of its counter (R10)` |
| R11 | `marks a descuadre reviewed with its note and returns it serialized (R11)` |
| R12 | `puts a reviewed descuadre back to pending keeping its note (R12)` |
| R13 | `throws NOT_FOUND when the id is of no stored descuadre (R13)` |

**Fuera del lote A** (no los cubre este informe): R3, R4 y R5 son del lote C
(enganche en la importación), R14 del lote B (esquemas HTTP) y R15 del lote D
(contrato). R9..R13 los vuelve a cubrir el lote B por HTTP.

### Último `./init.sh`

Ejecutado el 2026-09-18 al terminar el lote, **en verde**:

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──       [OK] Lint OK   [OK] Formato OK
── 6. Ejecutando tests ──     Test Files  68 passed (68)
                              Tests  1269 passed (1269)
                              Duration  11.65s
── 7. Resumen ──              [OK] Entorno listo. Puedes empezar a trabajar.
```

El archivo de tests del lote, por separado:
`pnpm exec vitest run src/modules/import/import.warnings.service.test.ts` →
`Test Files 1 passed (1)`, `Tests 12 passed (12)`.

En el momento de esta pasada los lotes B, C y D todavía no habían escrito nada
en el árbol de trabajo, así que el verde es solo del lote A más lo que ya había.

### Sugerencias fuera de scope (NO aplicadas)

- `src/architecture.test.ts` **no** exige añadir los archivos nuevos (su lista
  comprueba existencia, no exclusividad; comprobado en `src/architecture.test.ts`
  líneas 200-244). Aun así, el módulo `import/` tiene ahí listados sus archivos
  uno a uno: si se quiere mantener esa costumbre, los cuatro archivos de la F48
  deberían entrar en la lista. No lo he hecho porque `architecture.test.ts` no
  es un archivo de mi lote.
- `ImportUnparsedRow` no tiene estado a propósito (cabo suelto 23). El día que se
  pueda cerrar una fila ilegible, `ImportWarningStatus` ya sirve para las dos
  tablas sin migrar un enum nuevo.

---

## Lote B — implementación (capa HTTP)

### Archivos modificados / creados

- `src/modules/import/import.warnings.schema.ts` (nuevo) — esquema del `PATCH`:
  `params.id` entero ≥ 1, body con `additionalProperties: false`,
  `minProperties: 1`, `status` como enumeración `pending`/`reviewed` y `note`
  `['string','null']` con `maxLength: 500`. Exporta también
  `reviewBalanceMismatchBodyProperties`, derivado de `Object.keys(...)` para que
  la lista blanca y el esquema no puedan divergir.
- `src/modules/import/import.warnings.routes.ts` (nuevo) — plugin con las dos
  rutas. No importa Prisma: toma el cliente de `fastify.prisma` y delega en
  `listPendingImportWarnings` / `reviewBalanceMismatch` del lote A.
- `src/modules/import/import.warnings.routes.test.ts` (nuevo) — 12 tests de
  integración con `buildApp()` + `app.inject()` contra la base desechable.
- `src/modules/import/import.routes.ts` — tres líneas: el `import`, el
  `await fastify.register(importWarningsRoutes)` al final y la ampliación del
  comentario de cabecera. `src/app.ts` no se toca: el plugin cuelga del prefijo
  `/api/import` que ya estaba registrado allí.

### Decisiones tomadas

- **Sin esquema de respuesta**, igual que `import.schema.ts` y por el mismo
  motivo: un `response` de Fastify serializa por omisión, así que un campo
  añadido después dejaría de viajar en silencio. La forma de la respuesta la
  fijan los tipos de `import.warnings.types.ts` (los comprueba `tsc`) y los
  tests, no una segunda copia escrita en JSON.
- **`preValidation` con `assertOnlyAllowedBodyProperties`**, copiando el patrón
  de `PATCH /api/movements/:id`: el AJV de Fastify corre con `removeAdditional`,
  así que `additionalProperties: false` **quita** la propiedad desconocida en vez
  de fallar, y un `PATCH` con `computed` saldría 200 habiéndola ignorado. R14
  pide 400, y sin el hook no lo sería. Comprobado con el test de la propiedad de
  más.
- **El cliente sale de `fastify.prisma`, no de `importDb()`**: `importDb` vive en
  `import.service.ts`, que es del lote C y estaba siendo editado en paralelo;
  usar el decorador directamente deja mi lote sin dependencia de ese archivo.
- **`id` no numérico es 400 y no 404**: lo rechaza el esquema de `params` antes
  de llegar al servicio, así que el 404 de R13 queda reservado a un id con forma
  válida que no existe. Los dos casos tienen su test.

### Trazabilidad (criterio → test, en `import.warnings.routes.test.ts`)

- **R9** → `registers the two routes under the /api/import prefix of the real app (R9, R11)`,
  `answers 200 with the two lists and their counts (R9)`,
  `answers 200 with two empty lists when there is nothing open (R9)`
- **R10** → `leaves a reviewed descuadre out of the listing and out of its counter (R10)`
- **R11** → `marks a descuadre reviewed with its note and returns it serialized (R11)`
- **R12** → `puts a reviewed descuadre back to pending keeping its note (R12)`
- **R13** → `answers 404 NOT_FOUND when the id is of no stored descuadre (R13)`
- **R14** → `answers 400 VALIDATION_ERROR to an empty body, changing nothing (R14)`,
  `… to a property that is not admitted, changing nothing (R14)`,
  `… to a status outside the enumeration (R14)`,
  `… to a note longer than the 500 characters allowed (R14)`,
  `… to an id that is not a number (R14)`

Los tres tests de 400 sobre un descuadre existente releen la fila después de la
respuesta y comprueban que `status`, `note` y `computed` siguen como estaban: el
«sin modificar nada» de R14 se comprueba, no se supone.

### Último `./init.sh`

Rojo, **por trabajo del lote C todavía en curso**, no por el mío. Salida del
paso 5 (`pnpm test`):

```
 Test Files  4 failed | 65 passed (69)
      Tests  15 failed | 1266 passed (1281)
[FAIL]  Hay tests rotos
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

Los cuatro archivos rojos y su causa, comprobada ejecutando cada uno por
separado:

- `src/modules/import/import.service.test.ts` y
  `src/modules/import/import.local.service.test.ts` — archivos del lote C, con
  su enganche a medio escribir (`git status` los da modificados). Un fallo que se
  ve: `Foreign key constraint violated on the constraint:
  ImportBalanceMismatch_accountId_fkey` al borrar cuentas en su limpieza.
- `src/modules/import/import.routes.test.ts` y
  `src/modules/revolut/revolut.import.test.ts` — **daño colateral del enganche
  del lote C**: `import.service.ts:672` ya llama a `persistImportWarnings`, así
  que esos dos archivos, que importan de verdad, dejan filas en las tablas
  nuevas y el guardián de la F27 los tumba
  (`Este archivo de test ha dejado filas sin borrar (ImportUnparsedRow: 1)` y
  `(ImportUnparsedRow: 6)`). **Ninguno de los dos es archivo de mi lote y no los
  toco**; los arregla quien cierre el lote C, añadiendo esas dos tablas a su
  limpieza.

Lo que sí es mío está verde, comprobado por separado:

```
npx vitest run src/modules/import/import.warnings.routes.test.ts \
               src/modules/import/import.warnings.service.test.ts \
               src/architecture.test.ts
 Test Files  3 passed (3)
      Tests  60 passed (60)
```

y `npx tsc --noEmit` → `tsc=0`, `pnpm run lint` (oxlint) → `lint=0`, Prettier
aplicado a los cuatro archivos.

### Sugerencias fuera de scope (NO aplicadas)

- `src/modules/import/import.routes.test.ts` y
  `src/modules/revolut/revolut.import.test.ts` necesitan vaciar
  `ImportUnparsedRow` e `ImportBalanceMismatch` en su limpieza. Es el lote C
  quien lo provoca; no es archivo mío y lo dejo dicho aquí.
- Merece la pena mirar si hay más archivos de test que importen de verdad y que
  vayan a dejar filas en las tablas nuevas: con el guardián de la F27 aparecerán
  en rojo uno a uno según se vayan tocando.
- Si se mantiene la costumbre de listar los archivos del módulo `import/` en
  `src/architecture.test.ts`, los tres archivos nuevos de este lote deberían
  entrar también en esa lista (no lo hago: ese archivo no es de mi lote).

---

## Lote C — implementación

> Tasks T9, T10 y T11. Enganche de `persistImportWarnings` (lote A) en el núcleo
> compartido por las dos entradas de la importación.

### Archivos modificados

- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts) —
  `ImportStatementDeps` gana `file: WarningFileRef`; llamada a
  `persistImportWarnings` dentro del `try`, después de las dos comprobaciones de
  saldo y antes de `result.status = 'imported'`; el llamador de Drive le pasa
  `{ bank: bankSlug, year: year.name, name: file.name }`.
- [`src/modules/import/import.local.service.ts`](../../src/modules/import/import.local.service.ts) —
  el llamador local le pasa `{ bank: candidate.bankSlug, year, name }`.
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts) —
  bloque nuevo con los cuatro tests de T10; el `importStatement` directo que ya
  existía recibe el `file`; los tres `afterEach` que borran cuentas vacían ahora
  también las dos tablas de avisos.
- [`src/modules/import/import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) —
  bloque nuevo con el test de T11; sus dos `afterEach` con la misma limpieza.

### Decisiones tomadas

- **El `bank` que se guarda es el SLUG, no el nombre de la carpeta.** El diseño
  (§4) lo pide explícitamente y es lo que hace que la identidad de un aviso no
  cambie porque la carpeta esté escrita en mayúsculas. El informe del archivo
  sigue llevando el nombre de la carpeta tal cual, sin tocar. El test de T11 lo
  comprueba escribiendo la copia bajo la carpeta en mayúsculas.
- **R4 y R5 salen del orden de las líneas, sin ninguna rama nueva:** la llamada
  está después de `assertTheFileBringsMovements` (un archivo que falla entero no
  llega) y dentro del `try` que ya existía (un fallo al escribir cae en el
  `catch` que reporta `failed` y no mueve el archivo).
- **La limpieza de los tests borra los avisos ANTES que las cuentas**, porque
  `ImportBalanceMismatch` tiene clave ajena a `Account`. Sin eso, los bloques que
  ya existían se caían con `ImportBalanceMismatch_accountId_fkey`.
- **Para probar R5 se proxea solo `prisma.importUnparsedRow.upsert`** para que
  lance. Es la costura mínima: todo lo anterior se comporta igual que en
  producción, así que lo que el test observa es la reacción a ese fallo concreto.

### Trazabilidad (criterio → test)

Archivo `src/modules/import/import.service.test.ts`, describe
«the importer stores the warnings of the files that entered (feature 48)»:

- **R1**, **R3** → `imports and moves a file with unreadable rows exactly as before, AND stores them (R1, R3)`
  — comprueba `imported`, `movedToProcessed: true`, `imported/duplicates/unparsedCount`,
  `unparsedRows` del informe y los totales del run **sin cambios**, y además las
  dos filas guardadas con su banco, año, archivo, número y motivo.
- **R2** → `stores the descuadre of an imported file with the file it came out of (R2)`
- **R4** → `stores no warning of a file that failed whole, which also does not move (R4)`
- **R5** → `reports the file as failed and does not move it when storing its warnings fails (R5)`

Archivo `src/modules/import/import.local.service.test.ts`, describe
«importLocalCopies stores the warnings of each copy (feature 48)»:

- **R1**, **R2**, **R6** → `stores the warnings with the copy they came out of and does not duplicate them on a second run (R1, R2, R6)`
  — dos pasadas de la misma copia: los `id` y los `createdAt` de los dos avisos
  son los mismos y no hay una tercera fila.

(R7–R15 son de los lotes A y B; no los cubre este lote.)

### Último `./init.sh`

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ──────────────────────────────
[OK]    Lint OK
[OK]    Formato OK
── 6. Ejecutando tests ─────────────────────────────────
 FAIL  src/modules/import/import.routes.test.ts [ src/modules/import/import.routes.test.ts ]
Error: Este archivo de test ha dejado filas sin borrar (ImportUnparsedRow: 1). ...
 FAIL  src/modules/revolut/revolut.import.test.ts [ src/modules/revolut/revolut.import.test.ts ]
Error: Este archivo de test ha dejado filas sin borrar (ImportUnparsedRow: 6). ...
 Test Files  2 failed | 67 passed (69)
      Tests  1286 passed (1286)
[FAIL]  Hay tests rotos
```

**Los 1286 tests pasan**; los dos archivos en rojo lo están por el guardián de la
F27 (filas sin borrar), no por una aserción. Ninguno de los dos es archivo de mi
lote y **no los he tocado**. Los cuatro archivos míos, por separado:

```
npx vitest run src/modules/import/import.service.test.ts
 Test Files  1 passed (1)
      Tests  64 passed (64)

npx vitest run src/modules/import/import.local.service.test.ts
 Test Files  1 passed (1)
      Tests  28 passed (28)
```

### Lo que falta fuera de mi lote (para quien lo arregle)

Los dos archivos importan de verdad y ahora sus importaciones dejan filas en
`ImportUnparsedRow`; su `afterEach` borra movimientos y cuentas, pero no las dos
tablas nuevas:

1. `src/modules/import/import.routes.test.ts` — `afterEach` en la línea 115.
   Le falta, **antes** de `account.deleteMany`:
   `await app.prisma.importBalanceMismatch.deleteMany({ where: { accountId: { in: ids } } })`
   y `await app.prisma.importUnparsedRow.deleteMany({ where: { bank } })`.
   El archivo entero falla al cerrar con
   `Este archivo de test ha dejado filas sin borrar (ImportUnparsedRow: 1)`; la
   fila la deja el doble de parser de `POST /api/import` (`unparsedRows: [{ row: 9, … }]`).
2. `src/modules/revolut/revolut.import.test.ts` — `afterEach` en la línea 59, la
   misma limpieza (`bank` es la constante `'revolut'`). Falla con
   `(ImportUnparsedRow: 6)`: son las filas `DEVUELTO`/`PENDIENTE` del fixture,
   que el parser deja en `unparsedRows` y ahora se guardan.

### Sugerencias fuera de scope (NO aplicadas)

- Cualquier test futuro que ejercite una importación de verdad tendrá que vaciar
  las dos tablas nuevas. Si se repite mucho, merece un helper de limpieza en
  `src/lib/`, pero hoy son cuatro sitios y no lo justifica.
- `src/architecture.test.ts` no lista los archivos nuevos del módulo `import/`
  (no es archivo de mi lote; lo comprueba por existencia, así que no rompe nada).

## Limpieza de tests colaterales del lote C — implementación

Tarea acotada: los dos archivos de test que el lote C detectó como rotos pero no
podía tocar (no estaban en sus `Archivos:`). Solo se han modificado esos dos
archivos; ni código de aplicación, ni schema, ni docs, ni otros tests.

### Archivos modificados

- `src/modules/import/import.routes.test.ts` — en el `afterEach`, antes de
  borrar movimientos y cuentas, se añaden
  `importBalanceMismatch.deleteMany({ where: { accountId: { in: ids } } })` y
  `importUnparsedRow.deleteMany({ where: { bank } })`. El orden es el que exige
  la clave ajena de `ImportBalanceMismatch` a `Account`: los avisos primero.
  `bank` es la constante del archivo (`zz-import-routes-<timestamp>`), así que
  el filtro no toca filas de otros tests.
- `src/modules/revolut/revolut.import.test.ts` — misma limpieza en su
  `afterEach`, con el mismo orden. Aquí el filtro de `importUnparsedRow` usa
  `{ bank: { equals: bank, mode: 'insensitive' } }` para casar con el
  `findMany` de cuentas de ese mismo archivo, que ya buscaba sin distinguir
  mayúsculas.

En los dos se ha dejado el mismo comentario que puso el lote C en
`import.local.service.test.ts`, para que la razón del orden se lea en el sitio.

### Verificación

Los dos archivos en aislado:

```
pnpm vitest run src/modules/import/import.routes.test.ts src/modules/revolut/revolut.import.test.ts

 Test Files  2 passed (2)
      Tests  12 passed (12)
   Duration  1.93s
```

`./init.sh` completo:

```
── 4. Type checking (tsc) ──
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ──
[OK]    Lint OK
[OK]    Formato OK

── 6. Ejecutando tests ──
 Test Files  69 passed (69)
      Tests  1286 passed (1286)
[OK]    Todos los tests pasan

── 7. Resumen ──
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Sugerencias fuera de scope (NO aplicadas)

- Con estos dos, ya son cuatro los `afterEach` que repiten la misma secuencia de
  borrado. El lote C lo apuntaba como aún no justificado; ahora está en el
  límite, pero sigue sin aplicarse nada.

## Lote D — implementación (contrato y decisión de arquitectura)

Tasks T12, T13 y T14 de `specs/48-import-warnings-persistence/tasks.md`, marcadas
`[x]`. Solo se han tocado los tres archivos de la cabecera `Archivos:` del lote D.
Todo lo documentado se ha escrito **leyendo el código de los lotes A, B y C en
disco**, no el `design.md`.

### Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [`docs/api-contract.md`](../../docs/api-contract.md) | Sección nueva «Lo que una importación deja sin resolver (feature 48)», con `GET /api/import/warnings` y `PATCH /api/import/warnings/balance-mismatches/:id`: ejemplo de respuesta, tabla de cada campo de las dos listas, `counts`, la nota de que **no pagina** y la tabla de errores (`400 VALIDATION_ERROR`, `404 NOT_FOUND`, sin códigos nuevos). Modificado. |
| [`docs/api-contract.md`](../../docs/api-contract.md) | Corregidas dos frases del informe de la importación que esta feature deja falsas: la de `balanceMismatches` decía «**no** se guarda en ninguna parte: se cuenta en esta respuesta y ya», y la de `unparsedRows` no decía que ahora también quedan guardadas. Las dos apuntan a la sección nueva y dicen que el informe **no cambia de forma**. |
| [`docs/architecture.md`](../../docs/architecture.md) | **ADR-031** nuevo (el hallazgo se guarda como hecho congelado, con clave natural legible, y solo lo cierra el humano) y aviso en la **decisión 3 del ADR-030** diciendo que queda superada por él y qué parte de su motivo sigue en pie. Modificado. |
| [`src/modules/import/import.warnings.docs.test.ts`](../../src/modules/import/import.warnings.docs.test.ts) | Guardián del contrato (10 tests): la sección existe, nombra las dos rutas, describe los 5 campos de una fila ilegible y los 13 de un descuadre, el ejemplo JSON publicado tiene **exactamente** esos campos y en ese orden, salen los dos valores de `check` y los dos de `status`, dice que no pagina y publica los dos errores. Nuevo. |

### Decisiones tomadas

1. **La sección va después de `POST /api/import/local` y antes de los parsers**,
   que es donde acaba todo lo que tiene base de datos. No se ha tocado la
   estructura del documento ni el orden de lo que ya había.
2. **El ejemplo JSON se valida, no solo se lee.** El test parsea el bloque
   JSON publicado en la sección y compara sus claves con la lista de campos, en orden.
   Un campo que se añada al backend y no al ejemplo pone el test rojo; un ejemplo
   con un campo inventado, también. Es lo más cerca que se puede estar de atar el
   documento al código sin que el documento deje de ser markdown.
3. **La lista de campos del test está escrita a mano** (un `type` de TypeScript se
   borra en tiempo de ejecución y aquí no hay base de datos que consultar). Queda
   dicho en un comentario del propio archivo.
4. **He corregido las dos frases del informe de la importación que esta feature
   deja falsas.** «El descuadre no se guarda en ninguna parte» llevaba en el
   contrato desde la feature 32 y hoy es mentira; dejarla habría sido peor que no
   documentar nada. Es el mismo archivo de mi lote, así que no sale de scope.
5. **El ADR-030 no se reescribe ni se marca «superada» entero**: lo que cae es su
   decisión 3, y el aviso dice también qué parte de ella sigue viva (no hay columna
   nueva en `Account`, `GET /api/accounts` no cambia). Su título se deja como
   estaba: cambiarlo rompería las referencias de quien lo haya citado.

### Lo que el código hace y el `design.md` no decía (documentado lo real)

- **No hay desviación de fondo:** las dos rutas, los nombres de los campos y los
  dos errores son exactamente los del `design.md` §5. Lo que sigue son cosas que el
  diseño no llegaba a decir y que el contrato sí dice porque el código las hace:
- `PATCH` con un `:id` **que no es un número** responde `400 VALIDATION_ERROR`, no
  `404`: lo rechaza el esquema de `params` (`integer`, `minimum: 1`) antes de que
  nadie busque nada. Hay un test suyo en `import.warnings.routes.test.ts:282`.
- Una `note` de **más de 500 caracteres** es `400 VALIDATION_ERROR`; el diseño
  daba el `maxLength` pero no lo contaba entre los casos de error de la ruta.
- **`reviewedAt` se guarda pero NO se serializa**: no está en
  `SerializedBalanceMismatch`, así que el frontend no lo recibe. Dicho en el
  contrato para que no lo espere.
- **`reviewedAt` se borra al volver a pendiente** (`import.warnings.service.ts:197`):
  una fila pendiente nunca arrastra la fecha de una revisión que ya no vale.
- **`accountAlias` se lee de la cuenta al consultar**, no se congela con el resto:
  si se renombra la cuenta, la consulta devuelve el nombre nuevo. Los que sí están
  congelados son `computed` y `fromFile`. Dicho campo por campo en la tabla.
- **La consulta no tiene filtro de ninguna clase** (ni por banco, ni por archivo,
  ni por fecha): devuelve todo lo abierto. Dicho junto a lo de que no pagina.

### Trazabilidad (SDD)

| Requisito | Dónde queda cubierto |
|---|---|
| R15 | [`src/modules/import/import.warnings.docs.test.ts`](../../src/modules/import/import.warnings.docs.test.ts) — los 10 tests leen `docs/api-contract.md`; los dos primeros exigen las dos rutas, los dos siguientes los campos de las dos listas y el quinto valida el ejemplo publicado contra esa misma lista de campos. |

T14 no tiene test y no debe tenerlo: es la prosa de un ADR.

### Último `./init.sh`

Mi archivo de test, en aislado:

```
pnpm vitest run src/modules/import/import.warnings.docs.test.ts

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

`./init.sh --fast` (estado + tipos): **verde**, `Type check OK (tsc sin errores)`.

`./init.sh` completo: **ROJO, y no por el lote D**. La suite entera pasa menos una
aserción del guardián de datos reales, que señala una línea del **informe** de otro
lote en este mismo archivo:

```
── 6. Ejecutando tests ──
- []
+ [
+   "progress/implementations/import-warnings-persistence.md:398 — an amount on this line is in a file of var/: it is real data, invent another one",
+ ]
 ❯ src/no-real-data.test.ts:1012:31

 Test Files  1 failed | 69 passed (70)
      Tests  1 failed | 1295 passed (1296)
[FAIL]  Hay tests rotos
```

Qué es esa línea 398: la **duración** pegada dentro del bloque de salida de
`./init.sh` de la sección «Limpieza de tests colaterales del lote C». El guardián
de `src/no-real-data.test.ts` la lee como un importe y resulta que ese número
coincide con un importe que existe en un archivo de `var/`. **No es un fallo de
código ni una aserción de la feature**, y **no lo he tocado**: es la sección de
otro implementer y borrar o cambiar su texto no me toca. Se arregla quitando la
línea de duración de ese bloque pegado (por eso en el bloque de arriba yo no he
pegado ninguna). Queda para quien coordine.

Los 10 tests del lote D y los 1295 restantes pasan.

### Sugerencias fuera de scope (NO aplicadas)

- El guardián de datos reales revienta con un número pegado de la salida de
  `./init.sh` en un informe de `progress/`. Es la segunda vez que un informe
  honesto pone la suite roja por una coincidencia numérica. Una salida por
  consola pegada en un informe no es un dato del humano, pero distinguirlo pide
  tocar el guardián y eso es otra feature.
- `docs/api-contract.md` va por 2.900 líneas y no tiene índice: encontrar una ruta
  es un `Ctrl+F`. Un índice al principio ayudaría al frontend, pero es un cambio
  de todo el documento y no de esta feature.

---

## Cierre documental (2026-09-18)

Sin código nuevo: el reviewer aprobó la feature en segunda pasada
([veredicto](../reviews/import-warnings-persistence.md)). Lo que se ha tocado
aquí es solo documentación y estado:

- `feature_list.json` — la feature 48 pasa a `"status": "done"`. La 47 sigue
  `pending`, sin tocar. Comprobado con `npx prettier --check feature_list.json`
  → `All matched files use Prettier code style!`.
- `progress/summaries/import-warnings-persistence.md` — resumen para el humano.
  Se le han añadido los enlaces `archivo:línea` que faltaban en las tablas de
  código, documentación y tests (servicio, tipos, rutas, esquema, enganche en
  las dos formas de importar, `enum ImportWarningStatus`, migración, sección del
  contrato, ADR-031 y ADR-030 punto 3, y los cinco archivos de test). Los
  números de línea salen de `grep` sobre los archivos en disco, no de memoria.
- `progress/history.md` — una línea nueva para la F48, con el formato de las
  que ya estaban.
- `progress/current.md` — la F48 queda como cerrada y aprobada, **sin commitear
  y pendiente de la prueba real del humano**, con enlaces al veredicto, al
  resumen y a este informe; la sección del `intent` se conserva como «cómo se
  llegó aquí». No se ha borrado nada de la F47 ni de §Lo que le toca al humano:
  a esa sección se le han añadido dos puntos vivos (la prueba real de la F48 y
  la respuesta pendiente sobre la palabra propuesta).
- `docs/roadmap.md` — la F48 entra en la **E5, La importación** (fila de la tabla
  de etapas y apartado «Lo que se le añadió después», junto a la F45), y se
  amplía el párrafo de §Dónde estás ahora mismo que hablaba de los descuadres de
  la F32. El **cabo suelto 23** (arreglar o borrar una fila ilegible) se ha
  releído: ya describe lo que la feature deja hecho («con la F48 esas filas
  quedan guardadas y se pueden consultar, pero ahí se acaba») y sigue **sin
  abrir**, con dueño «después de la F48». No se ha añadido ningún cabo nuevo.

### Último `./init.sh`

Ejecutado al terminar el cierre documental, **verde, exit 0** (la línea de
duración no se pega aquí a propósito: el guardián de datos reales de
`src/no-real-data.test.ts` la lee como un importe y ya tumbó la suite una vez):

```
── 3. Validando feature_list.json ──  [OK] feature_list.json válido (48 features)
                                      [OK] Specs presentes para features sdd con estado no-pending
── 4. Type checking (tsc) ──          [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──               [OK] Lint OK   [OK] Formato OK
── 6. Ejecutando tests ──             Test Files  70 passed (70)
                                      Tests  1296 passed (1296)
                                      [OK] Todos los tests pasan
── 7. Resumen ──                      [OK] Entorno listo. Puedes empezar a trabajar.
EXIT=0
```

**No se ha hecho ningún commit.**
