# last-imports — implementación

No se ha escrito en la base del humano (`gastos`): ninguna migración se ha aplicado
contra ella. La SQL de la migración de esquema se sacó comparando
`gastos_test_template` (la plantilla desechable de la suite, solo lectura) con
`prisma/schema.prisma`.

## Lote A — implementación

**Estado: hecho.** T1 a T8 hechas y marcadas `[x]`; `./init.sh` en verde.

### Bloqueo (resuelto)

La primera pasada de `./init.sh` salió en rojo por un test fuera del lote:
`src/modules/investments/investments.model.test.ts:713`,
`creates SavingsSnapshot without touching the flow tables (F26 R1, R2, R14)`, que
lleva la lista cerrada de columnas de `Account`; la columna nueva
`Account.lastImportedAt` la volvía falsa:

```
AssertionError: expected [ 'alias', 'balanceAnchor', …(10) ] to deeply equal [ 'alias', 'balanceAnchor', …(9) ]
+   "lastImportedAt",
```

El leader añadió el archivo a `Archivos:` del Lote A. Arreglo: `'lastImportedAt'`
en la lista (entre `'initialBalance'` y `'type'`) y una frase en su comentario
diciendo que la añadió la F69.

### Archivos modificados / creados

- `prisma/schema.prisma` — `lastImportedAt DateTime?` en `Account` y en
  `InvestmentProduct`, con su comentario (T1).
- `prisma/migrations/20261108120000_last_imported_at/migration.sql` — nuevo: los dos
  `ALTER TABLE … ADD COLUMN "lastImportedAt" TIMESTAMP(3)` (T1).
- `prisma/migrations/20261108120100_last_imported_at_backfill/migration.sql` — nuevo:
  solo datos, la SQL de `design.md` §1 con cabecera de comentario como la de la F60
  (T2).
- `src/modules/import/import.service.ts` — `now?: () => Date` en
  `ImportPendingDeps`, `ImportStatementDeps` e `ImportProductFileDeps`;
  `importPending` lo pasa a `importStatement` y a `importProductFile`;
  `importStatement` escribe `tx.account.update({ lastImportedAt: now() })` dentro de
  su transacción, después de `persistImportWarnings`; `importProductFile` pasa
  `now()` a `persistProductSnapshot` (T3, T4).
- `src/modules/investments/investments.service.ts` — tercer parámetro
  `importedAt: Date = new Date()` en `persistProductSnapshot`,
  `persistSavingsSnapshot`, `persistValuation` y `persistDeposit`, que llega a
  `upsertProduct` y se escribe como `lastImportedAt` en `create` y en `update` (T4);
  `listProductsForLastImports(prisma)`, solo `findMany` (T5).
- `src/modules/investments/investments.types.ts` — tipo `ProductImportFacts` (T5).
- `src/modules/import/import.last-imported.test.ts` — nuevo (T6, y tests de T3-T5).
- `src/modules/import/import.last-imported-migration.test.ts` — nuevo (T7).
- `docs/data-model.md` — las dos columnas en los dos bloques Prisma y en los dos
  diagramas ER, fila nueva en «Columnas reservadas» y nota en «Claves naturales»
  (T8). Comprobado contra `prisma/schema.prisma` con un `diff` de los nombres de
  campo de los dos modelos (salida vacía en los dos).
- `src/modules/investments/investments.model.test.ts` — `'lastImportedAt'` en la
  lista cerrada de columnas de `Account`, con su nota en el comentario (añadido al
  lote por el leader tras el bloqueo).
- `specs/69-last-imports/tasks.md` — T1 a T8 marcadas `[x]`.

No he tocado `progress/current.md`: el leader limitó este lote a los archivos de
`Archivos:`, `tasks.md` y este informe.

### Decisiones tomadas

- **La migración de esquema no se generó con `prisma migrate dev`** (lo que dice T1):
  ese comando la aplica contra la base de `DATABASE_URL`, que es la del humano. Se
  sacó con `prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --script` apuntando `DATABASE_URL` a `gastos_test_template`.
  La salida trae las dos líneas de la feature y además
  `ALTER TABLE "Movement" ALTER COLUMN "descriptionSearch" DROP DEFAULT;`, que es
  una diferencia anterior a esta feature (la columna `descriptionSearch`, escrita a
  mano en `20260918140000_movement_description_search`) y no se ha copiado.
- **`listProductsForLastImports` ordena por `bank`, `name`, `id`.** El diseño no
  fija orden para esta función (sí para la respuesta de la ruta, `bank`, `name`); se
  deja ya en ese orden para que el Lote B no dependa del orden de inserción.
- **La escritura en `Account` mueve también su `updatedAt`** (`@updatedAt` de
  Prisma, en un `update`). El diseño no dice nada; la migración de relleno, en
  cambio, no lo toca (UPDATE crudo), y el test de T7 lo comprueba.
- **Tests de más dentro del mismo archivo de T6**, para que T3, T4 y T5 lleven su
  test: `dates a statement whose movements were all already stored` (R4 con
  `imported` 0), `a failed product file leaves the import date as it was` (un
  archivo de producto que falla no la mueve) y
  `lists every product with its photo dates for the last-imports view` (T5).
- `writes the import date of a product file` pasa por los **tres** escritores
  (`fund` → `Valuation`, `savings_account` → `SavingsSnapshot`, `deposit` → columnas
  del producto), y en cada uno importa el mismo archivo dos veces.
- `a failed statement leaves the import date as it was` provoca el fallo en dos
  sitios dentro de la transacción: al guardar los avisos (el último paso antes de
  la fecha) y al escribir los movimientos. En un primer intento el segundo punto
  era `movement.findMany`, y el extracto salía `imported`: ese archivo no llega a
  leer movimientos. Se cambió a `movement.createMany`.

### Trazabilidad (Lote A)

- R4 → `a failed statement leaves the import date as it was` (la primera
  importación fija la fecha) y `dates a statement whose movements were all already stored`
- R5 → `a failed statement leaves the import date as it was`
- R6 → `writes the import date of a product file`, `a failed product file leaves the import date as it was`
- R7 (la lectura que usará el Lote B) → `lists every product with its photo dates for the last-imports view`
- R14 → `fills the import date of what was imported before the feature`

R1-R3, R8-R13, R15 y R16 son del Lote B.

### Documentos actualizados

`git grep -n "lastImportedAt\|persistProductSnapshot(\|upsertProduct(\|ImportStatementDeps\|ImportProductFileDeps\|ImportPendingDeps" -- ':!progress' ':!specs' ':!src'`
→ solo salen `docs/data-model.md` (las líneas que he añadido), `prisma/schema.prisma`
y `feature_list.json` (el `acceptance`). Ningún documento citaba las firmas
cambiadas.

`git grep -n -i "ancla y sus avisos\|the anchor and its warnings"` → dos líneas:

- `src/modules/import/import.service.ts:721` (comentario de `importStatement`):
  corregido, ahora nombra también `lastImportedAt`.
- `docs/api-contract.md:3455` («todo lo que el archivo escribe en la base —la cuenta
  si es nueva, sus movimientos, los saldos que rellena, el ancla y sus avisos— se
  guarda en una sola transacción»): con la F69 la lista queda incompleta (falta la
  fecha de importación de la cuenta). **No corregido: `docs/api-contract.md` es del
  Lote B.** Se le pasa al Lote B (o al leader) para que lo añada al escribir la
  sección nueva.

### Prueba real

No aplica: el Lote A no añade ni cambia la lectura de ningún archivo de fuera (los
parsers no cambian; el reloj y la fecha se escriben después de leer). No se ha
abierto ningún archivo del humano.

### Comandos lanzados y su salida

Tests nuevos y comprobación de datos reales, una sola pasada:

```
$ npx vitest run src/modules/import/import.last-imported.test.ts src/modules/import/import.last-imported-migration.test.ts src/no-real-data.test.ts
 Test Files  3 passed (3)
      Tests  43 passed (43)
exit 0
```

Los dos `checks` de `feature_list.json` que son del Lote A, uno detrás de otro:

```
$ pnpm exec vitest run src/modules/import/import.last-imported.test.ts -t "a failed statement leaves the import date as it was" | grep -E "Tests +1 passed"
      Tests  1 passed | 4 skipped (5)
exit 0
$ pnpm exec vitest run src/modules/import/import.last-imported-migration.test.ts -t "fills the import date of what was imported before the feature" | grep -E "Tests +1 passed"
      Tests  1 passed (1)
exit 0
```

`./init.sh --checks` no se ha lanzado: los otros diez `checks` nombran archivos del
Lote B (`src/modules/last-imports/…`) que todavía no existen.

### Último ./init.sh

Después del arreglo del bloqueo:

```
$ ./init.sh
[OK]    feature_list.json válido (69 features)
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  97 passed (97)
      Tests  1541 passed (1541)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
exit 0
```

La pasada anterior (antes del arreglo) salió con código 1: `Test Files  1 failed |
96 passed (97)`, `Tests  1 failed | 1540 passed (1541)`, el único rojo era el test
del bloqueo.

### Sugerencias fuera de scope (NO aplicadas)

- Ninguna.

## Lote B — implementación

**Estado: hecho.** T9 a T12 hechas y marcadas `[x]` (las doce tasks de `tasks.md`
están marcadas); `./init.sh` y `./init.sh --checks` en verde. No se ha escrito en la
base del humano (`gastos`): todo se ha ejecutado contra las bases desechables de la
suite.

### Bloqueo (resuelto)

`README.md` tiene la tabla de rutas de la API y con la F69 le faltaba la fila de
`GET /api/last-imports`; no estaba en `Archivos:` del Lote B. El leader lo añadió a la
cabecera y la fila está puesta en `README.md:99`, después de la de
`/api/investments/gains`:

```
| `GET`    | `/api/last-imports`            | Por cada cuenta y cada producto vivo: hasta qué fecha hay datos, qué día se importó por última vez, si se espera cada mes y los tramos sin datos. A fecha de hoy; solo lectura. |
```

Después de añadirla, `./init.sh` otra vez en verde (salida en «Último ./init.sh»).

### Archivos modificados / creados

- `src/modules/last-imports/last-imports.types.ts` — nuevo: `DateGap`,
  `AccountImportStatus`, `ProductImportStatus`, `LastImportsResponse` (T9).
- `src/modules/last-imports/last-imports.service.ts` — nuevo: `lastImportsDb`,
  `getLastImports(prisma, today)`, las puras `accountGaps`, `missingPhotoMonths`,
  `closingDate` y la constante `ACCOUNT_GAP_DAYS = 31` con el porqué (T9).
- `src/modules/last-imports/last-imports.schema.ts` — nuevo: querystring sin
  propiedades (`additionalProperties: false`) y esquema de respuesta con todas las
  claves de los tipos (T9).
- `src/modules/last-imports/last-imports.routes.ts` — nuevo: `GET /` →
  `getLastImports(db, todayInMadridAsDate())` (T9).
- `src/app.ts` — registro con prefijo `/api/last-imports` (T9).
- `src/modules/last-imports/last-imports.test.ts` — nuevo (T10).
- `src/modules/last-imports/last-imports.docs.test.ts` — nuevo (T11).
- `docs/api-contract.md` — sección `### GET /api/last-imports` después de la de
  `GET /api/net-worth` (T11), y tres frases que la F69 volvía incompletas (ver
  «Documentos actualizados»).
- `docs/architecture.md` — ADR-044 (T12).
- `src/architecture.test.ts` — los cinco archivos del módulo en la lista del árbol
  (T12).
- `docs/vocabulary.md` — una fila con los nombres del punto 6 de la hoja, aprobados
  el 2026-11-08 (T12).
- `specs/69-last-imports/tasks.md` — T9 a T12 marcadas `[x]`.
- `README.md` — fila de `GET /api/last-imports` en la tabla de rutas (tras el
  desbloqueo).
- `progress/current.md` — feature en curso y plan del lote.

### Decisiones tomadas

- **Orden de `products`:** el de `listProductsForLastImports` (Lote A: `bank`,
  `name`, `id`), que cumple el `bank`, `name` del diseño; el filtro de vivos se
  aplica encima sin reordenar.
- **`asOf`** sale de `today` (el `Date` inyectado, `toISOString().slice(0, 10)`); la
  ruta le pasa `todayInMadridAsDate()`, así que es hoy en Madrid.
- **Tests de más en `last-imports.test.ts`**, sin base, para las tres puras:
  `reports only jumps of more than 31 days between two different imports`,
  `joins consecutive missing months into one stretch, across a year` (racha de
  diciembre a febrero que cruza el año, y mes suelto) y
  `takes the earliest written date as the closing date of a product`. Ninguno
  contiene el texto de un `check`, así que cada filtro `-t` de los checks sigue
  encontrando exactamente un test (salida de `--checks` abajo: `1 passed | 13 skipped`).
- `does not list a closed product` comprueba también el borde: un fondo con
  `closedAt` igual a hoy no sale y uno con `closedAt` mañana sí.
- En el contrato, el ejemplo JSON es el de `design.md` §3 más un depósito vivo
  (inventado), para que se vea `expectedMonthly: false` con `dataUntil: null`.
- En el contrato he añadido el enlace a la sección nueva en el párrafo
  «Inversiones — quién las escribe y quién las lee» (la ruta lee esas tablas a través
  del servicio de inversiones), y el test de T11 comprueba ese enlace, como hace el de
  la F67.

### Trazabilidad (Lote B)

- R1 → `answers GET /api/last-imports with asOf, accounts and products`
- R2 → `answers GET /api/last-imports with asOf, accounts and products`,
  `shows a statement with data until its last movement and the day it was imported`
- R3 → `serializes importedAt as the Madrid date of the stored instant`,
  `shows a statement with data until its last movement and the day it was imported`
- R4 → `shows a statement with data until its last movement and the day it was imported`,
  `keeps data until and moves the import date when a statement brings no new movements`
  (más los del Lote A)
- R6, R7 → `shows a fund photo with its date and the day it was imported`
- R8 → `does not list a closed product`,
  `lists a live deposit as not expected every month and drops it once it matures`,
  `takes the earliest written date as the closing date of a product`
- R9 → `lists a live deposit as not expected every month and drops it once it matures`
- R10, R11 → `reports September as missing for a fund with August and October photos`,
  `joins consecutive missing months into one stretch, across a year`
- R12 → `reports a gap between two statements of a current account` (38 días sale,
  31 justos no), `reports only jumps of more than 31 days between two different imports`
- R13 → `does not report a quiet stretch inside one statement`
- R15 → `does not change the database when listing` (número de filas y
  `max(updatedAt)` de `Account`, `Movement`, `InvestmentProduct`, `Valuation` y
  `SavingsSnapshot`, más `max(lastImportedAt)` de `Account` e `InvestmentProduct`,
  antes y después de llamar a la ruta y al servicio)
- R16 → `the contract describes GET /api/last-imports`

R5 y R14 están cubiertos en el Lote A.

### Documentos actualizados

`git grep -n -i "el ancla y sus avisos" -- ':!progress' ':!specs'` → antes del cambio,
`docs/api-contract.md:3455` (lo que pasó el Lote A). Corregido: la lista de lo que un
extracto guarda en su transacción nombra ahora la fecha de importación de la cuenta
(`lastImportedAt`). Después del cambio el `git grep` no devuelve nada.

En la misma sección de importación, el paso «upsert del producto» de los archivos de
producto dice ahora que escribe `lastImportedAt` también si el producto ya existía.

`git grep -n "/api/investments/gains"` (para encontrar las listas de rutas donde
debería salir también la nueva) → `README.md:98` (tabla de rutas: fila nueva en la
línea 99, ver «Bloqueo (resuelto)»), `docs/roadmap.md:34` y `:53` (fila E7 y su resumen: lo actualiza el leader
al cerrar una feature, como con la F67; no lo he tocado), y `docs/vocabulary.md`,
`docs/architecture.md`, `docs/api-contract.md` y `feature_list.json`, ya tratados o
históricos.

`git grep -n "last-imports\|lastImportedAt" -- ':!progress' ':!specs' ':!src'` → solo
las líneas añadidas por los dos lotes en `docs/`, más `prisma/schema.prisma` y
`feature_list.json`.

### Prueba real

No aplica: el Lote B no lee ningún archivo de fuera; lee la base. No he consultado la
base del humano.

### Comandos lanzados y su salida

```
$ npx vitest run src/modules/last-imports/last-imports.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
$ npx vitest run src/modules/last-imports/last-imports.docs.test.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Último ./init.sh

Lanzado después de añadir la fila de `README.md`:

```
$ ./init.sh
[OK]    feature_list.json válido (69 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  99 passed (99)
      Tests  1556 passed (1556)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
exit 0
```

### Último ./init.sh --checks

Cada `check`, en el orden en que los lanza (comando abreviado; todos `| grep -E "Tests +1 passed"`):

```
last-imports.test.ts -t "shows a statement with data until its last movement and the day it was imported"  → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "shows a fund photo with its date and the day it was imported"                     → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "lists a live deposit as not expected every month and drops it once it matures"    → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "does not list a closed product"                                                   → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "reports September as missing for a fund with August and October photos"           → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "reports a gap between two statements of a current account"                        → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "does not report a quiet stretch inside one statement"                             → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "keeps data until and moves the import date when a statement brings no new movements" → exit 0, Tests  1 passed | 13 skipped (14)
last-imports.test.ts -t "does not change the database when listing"                                        → exit 0, Tests  1 passed | 13 skipped (14)
import.last-imported.test.ts -t "a failed statement leaves the import date as it was"                      → exit 0, Tests  1 passed | 4 skipped (5)
import.last-imported-migration.test.ts -t "fills the import date of what was imported before the feature" → exit 0, Tests  1 passed (1)
last-imports.docs.test.ts -t "the contract describes GET /api/last-imports"                                → exit 0, Tests  1 passed (1)
pnpm test                                                                                                  → exit 0
[OK]    Checks: 13 de 13 en verde.
exit 0
```

### Sugerencias fuera de scope (NO aplicadas)

- Ninguna.
