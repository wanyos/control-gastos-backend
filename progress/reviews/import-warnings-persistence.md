# Review — F48 `import-warnings-persistence`

**Veredicto:** CHANGES_REQUESTED

Revisado el 2026-09-18 sobre el árbol de trabajo (los cuatro lotes de
`specs/48-import-warnings-persistence/tasks.md` más la limpieza de
`import.routes.test.ts` y `revolut.import.test.ts`).

## Cómo lo comprobé (comandos y salida)

1. `./init.sh` completo, **verde**, exit code 0:

   ```
   ── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
   ── 5. Lint y formato ──       [OK] Lint OK   [OK] Formato OK
   ── 6. Ejecutando tests ──     Test Files  70 passed (70)
                                 Tests  1296 passed (1296)
   ── 7. Resumen ──              [OK] Entorno listo.
   [exited with code 0]
   ```

2. `pnpm vitest run` sobre los siete archivos de la feature
   (`import.warnings.{service,routes,docs}.test.ts`, `import.service.test.ts`,
   `import.local.service.test.ts`, `revolut.import.test.ts`,
   `import.routes.test.ts`): **7 passed, 138 tests passed**.

3. Consulta directa a la base desechable `gastos_test_1` con `pg`, después de la
   suite:

   ```
   tablas: [ 'ImportBalanceMismatch', 'ImportUnparsedRow' ]
   filas tras la suite -> ImportUnparsedRow: 0  ImportBalanceMismatch: 0
   ```

   Y `applicationTables()` de `src/lib/test-db.ts:93` descubre las tablas
   leyendo `pg_tables`, no de una lista escrita a mano: las dos tablas nuevas
   entran **solas** en la comprobación de filas sobrantes que corre después de
   cada archivo de test (`vitest.setup.ts`). No hay un hueco por el que se
   pudieran colar.

4. Lectura de `docs/api-contract.md` §«Lo que una importación deja sin resolver»
   campo a campo contra `serializeUnparsedRow` / `serializeBalanceMismatch`
   (`src/modules/import/import.warnings.service.ts:44` y `:54`), no contra su
   prosa.

## Cambios requeridos

1. `docs/architecture.md:2527` (ADR-031, punto 5) — **«Los avisos de un mismo
   archivo entran en una transacción»** usa la palabra *aviso* como **nombre del
   concepto** (las dos cosas juntas: fila ilegible y descuadre), que es
   exactamente lo que `specs/48-import-warnings-persistence/decisions.md` 🔴 #6
   propone y declara **no aprobado**, y que `docs/vocabulario.md` no recoge. El
   resto del ADR-031 lo evita a propósito («el hallazgo», «lo que una importación
   no puede resolver»), así que es un desliz, no un criterio: describe esa frase
   literalmente (p. ej. «las filas ilegibles y los descuadres de un mismo archivo
   entran en una transacción»).

   No requerido, pero conviene decidirlo en esta feature en vez de dejarlo suelto:
   la propuesta de la palabra vive solo en `decisions.md`, y `docs/vocabulario.md`
   §«Propuestos, esperando respuesta» —donde está «verificación»— no la lista. Tal
   como queda, la propuesta se pierde y la palabra sigue circulando sin que nada
   la vigile. Es decisión del leader llevarla a esa tabla o preguntársela al
   humano al cerrar.

   Todo lo demás de este punto **está bien resuelto** y lo comprobé leyéndolo:
   `docs/api-contract.md` no usa «aviso» ni una vez en la sección nueva, titula
   «Lo que una importación deja sin resolver» y dice explícitamente «En la ruta y
   en el código se llaman `warnings`»; `requirements.md` lleva la advertencia de
   «propuesto, no aprobado»; `import.warnings.*` usa `warning` solo como nombre de
   símbolo y de ruta, que es lo que el humano vio en la decisión 1 al aprobar.

## Comprobado sin hallazgos

**Trazabilidad R1–R15 ↔ tests (Nivel 4 de `docs/verification.md`).** Los quince
tienen test ejecutado, y verifican salida concreta, no que no se lance excepción:

- R1, R2 → `import.warnings.service.test.ts:79` y `:100` (columnas guardadas una
  a una) y, por la importación de verdad, `import.service.test.ts` «imports and
  moves a file with unreadable rows … AND stores them» / «stores the descuadre of
  an imported file with the file it came out of».
- R3 → el mismo test comprueba `status: 'imported'`, `movedToProcessed: true`,
  `imported`, `duplicates`, `unparsedCount`, `unparsedRows` del informe y
  `importedCount`/`unparsedCount`/`failedCount` del run, y que Drive recibió su
  `update`. Los contadores **no** cambian.
- R4 → «stores no warning of a file that failed whole, which also does not move»:
  `ALL_ROWS_UNPARSED`, no se mueve y las dos tablas quedan vacías.
- R5 → «reports the file as failed and does not move it when storing its warnings
  fails»: un `Proxy` que rompe **solo** `importUnparsedRow.upsert`; el archivo
  sale `failed`, no se mueve y no queda nada escrito.
- R6, R7 → `:146`, `:172`, `:184` y, por el camino local,
  `import.local.service.test.ts` (segunda pasada: mismos `id` y mismos
  `createdAt`, con la carpeta escrita en mayúsculas para probar que la identidad
  usa el **slug**).
- R8 → `:137`. R9, R10 → `:205`, `:236`, `:253` y sus equivalentes HTTP.
- R11, R12, R13 → `:278`, `:302`, `:315` y por HTTP `404 NOT_FOUND`.
- R14 → cinco tests de `400 VALIDATION_ERROR` (body vacío, propiedad de más,
  `status` fuera de la enumeración, `note` de más de 500, `:id` no entero), y los
  tres que aplican releen la fila para probar que no se modificó nada.
- R15 → `import.warnings.docs.test.ts`: lee el contrato y compara las claves del
  ejemplo JSON **una a una** con la lista de campos serializados.

**El `intent` del humano, punto por punto.** Un archivo con filas ilegibles y al
menos un movimiento entra y se mueve a `procesados/` con los mismos contadores
(R3, comprobado arriba); solo se guardan los avisos abiertos —no hay tabla de
histórico de run en `prisma/schema.prisma`, solo `ImportUnparsedRow` e
`ImportBalanceMismatch`—; los traspasos dudosos no aparecen en ninguna parte del
código nuevo; y ningún movimiento guardado se toca: `persistImportWarnings` solo
escribe en las dos tablas nuevas y `PATCH` solo admite `status` y `note`
(`additionalProperties: false`). No se ha ampliado el alcance.

**Las tres decisiones delegadas.** (a) Dos tablas y dos rutas con dos listas
separadas y `counts`, tal como dice la decisión 1. (b) Identidad = clave natural
`@@unique` + `upsert`: `(bank, year, fileName, rowNumber)` y
`(bank, year, fileName, accountId, bookingDate, check, computed, fromFile)`, con
`map:` por el límite de 63 caracteres; verificado en
`prisma/migrations/20260918091426_import_warnings/migration.sql`. (c) Un descuadre
solo se cierra cuando el humano lo marca: el `update` del `upsert` escribe
únicamente `updatedAt`, nunca `status`, `note` ni `reviewedAt`, y no hay ni un
`delete` en el módulo.

**`docs/api-contract.md` describe lo que el código hace.** Orden `detectedAt`
desc / id desc = `createdAt DESC, id DESC`; `accountAlias` leído de la relación al
consultar; `difference` derivado y no almacenado (no existe la columna);
`computed`/`fromFile` congelados; `status` siempre `pending` en el `GET` (filtro
`where: { status: 'pending' }`); el `PATCH` devuelve el descuadre con la misma
forma y **sin** `reviewedAt`; `note: null` borra y omitirla conserva; `400` y
`404` son los códigos que ya existían. El orden y el nombre de las claves del
ejemplo coinciden exactamente con los de los dos serializadores.

**Limpieza de las tablas nuevas en los tests y su orden.** La clave ajena es
`ON DELETE RESTRICT`, así que el orden importa: en los seis `afterEach`/`afterAll`
tocados (`import.service.test.ts:265`, `:1456`, `:1830` y el describe nuevo,
`import.local.service.test.ts:119` y `:877` y el describe nuevo,
`import.routes.test.ts:118`, `revolut.import.test.ts:65`,
`import.warnings.{service,routes}.test.ts`) los descuadres se borran **antes** que
las cuentas. `myinvestor.import.test.ts` también importa, pero por el camino de
ficheros de producto, que no produce ninguna de las dos cosas; la comprobación de
filas sobrantes lo confirma (suite verde y tablas a 0).

**Arquitectura y convenciones.** Módulo `import` con `routes`/`schema`/`service`/
`types` separados, la ruta no importa Prisma, sin esquema de respuesta (mismo
motivo que `import.schema.ts`), errores por `NotFoundError` y el manejador
central, `src/app.ts` sin tocar. Sin `console.log` ni TODOs sueltos en lo nuevo.
`src/architecture.test.ts` pasa.

**CHECKPOINTS.** C1 ✅ (init.sh exit 0). C2 ✅ (una sola feature `in_progress`).
C3 ✅. C4 ✅. C4 bis — **no aplica**: la feature no añade ni cambia ningún parser
de banco ni lee ningún fichero del humano. C5 ✅ (los archivos sin trackear son
los de la feature: migración, specs, `import.warnings.*`, informe). C6 ✅ (el
contrato es dueño el backend y se actualizó en esta misma feature; no es cambio
rompedor, así que `docs/related-projects.md` no pide nada más). C7 ✅ (cuatro
archivos de spec; `decisions.md` cabe en una página con sus bloques y **6** puntos
en 🔴, cada uno con alternativa; 15 requirements, justo en el tope; procedencia
completa con los quince clasificados; las catorce tasks en `[x]`). C8 — no
procede: no hay resumen de cierre porque el veredicto no es APPROVED.

**No bloquea, para el leader:** `progress/current.md` §F48 sigue diciendo
«faltan los lotes B, C y D y el reviewer» y cita 68 archivos / 1269 tests, que era
el estado al terminar el lote A. Hoy son 70 y 1296. Conviene ponerlo al día antes
de cerrar (C2/C5).

---

# Review — segunda pasada (2026-09-18)

**Veredicto:** APPROVED

## Qué comprobé, y cómo

1. **El cambio pedido está aplicado.** `docs/architecture.md`, ADR-031 punto 5,
   dice ahora «Las filas ilegibles y los descuadres de un mismo archivo entran en
   **una** transacción». Comprobado además que **ninguna línea añadida por esta
   feature** a `docs/architecture.md` usa ya la palabra como nombre del concepto:

   ```
   $ git diff docs/architecture.md | grep "^+" | grep -i aviso
   +  descuadre por una razón concreta —un aviso viejo que dice «hay descuadre» es peor
   ```

   Esa única línea que queda es el **Contexto** del ADR-031 explicando por qué el
   ADR-030 decidió lo contrario, en el mismo sentido genérico («una advertencia
   vieja») en el que ya lo usaba el propio ADR-030 antes de esta feature
   (`docs/architecture.md:2465` y `:2467`, no tocadas). No nombra el concepto de la
   feature 48. Queda bien.

2. **La propuesta ya no se pierde.** `docs/vocabulario.md` §«Propuestos, esperando
   respuesta» tiene la fila de **aviso** (`warning` en el código) con qué abarca,
   qué no, la fecha, y la frase «en la prosa, hasta que respondas, se dice *las
   filas ilegibles y los descuadres*». Era la parte que yo había marcado como «no
   requerido, pero conviene»; está hecha y bien acotada.

3. **No se ha tocado código ni tests**, comprobado por dos vías: `git diff --stat`
   sobre `src/` y `prisma/` da los mismos 8 archivos y las mismas 514 líneas que en
   la primera pasada, y las marcas de tiempo de los siete archivos
   `import.warnings.*` son anteriores (11:15–11:31) a las de los dos documentos
   editados (11:41). Todo lo verificado en la primera pasada sigue en pie sin
   necesidad de repetirlo.

4. **`./init.sh` completo, lanzado por mí después del cambio, verde:**

   ```
   [OK] Type check OK (tsc sin errores)
   [OK] Lint OK   [OK] Formato OK
    Test Files  70 passed (70)
         Tests  1296 passed (1296)
   [OK] Todos los tests pasan
   [OK] Entorno listo. Puedes empezar a trabajar.
   ```

## Veredicto

Comprobado: trazabilidad R1–R15 ↔ tests, respeto del `intent` sin ampliarlo, las
tres decisiones delegadas, el contrato contra el código, la limpieza de las tablas
nuevas en los tests y su orden frente a la clave ajena, arquitectura, convenciones
y CHECKPOINTS C1–C8 (C4 bis no aplica: la feature no toca ningún parser ni lee
ningún fichero del humano). El único hallazgo de la primera pasada está resuelto.
Sin hallazgos nuevos.

Resumen de cierre: [`../summaries/import-warnings-persistence.md`](../summaries/import-warnings-persistence.md).

**Una cosa menor, que no bloquea y no es del implementer:** al reescribir la frase
del ADR-031 el párrafo quedó con el salto de línea descolocado
(`docs/architecture.md:2527-2528`, «…de un mismo / archivo entran en **una** /
transacción»). Prettier no reflueye prosa, así que el formato sigue verde; es solo
cosmético. Y `progress/current.md` §F48 sigue contando el estado del lote A (68
archivos / 1269 tests, «faltan los lotes B, C y D»): conviene ponerlo al día al
cerrar, junto con la línea de `progress/history.md` y el paso a `done` en
`feature_list.json`.
