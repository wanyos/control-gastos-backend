# ./init.sh en rojo intermitente — 2026-11-04

Salida completa (sin códigos de color) de `./init.sh` lanzado de 11:45:27Z a 11:46:15Z, exit=1, durante el paso 2 (`fast-uri`) de `progress/implementations/audit-2026-11-04.md`. Se lanzó justo después de `pnpm run build` y de borrar `dist/`. Ver el informe para las ejecuciones siguientes.

```
── 1. Detectando stack ────────────────────────────────
[OK]    Stack detectado: node
[OK]    Runtime: v24.18.0

── 2. Verificando archivos base del arnés ──────────────
[OK]    Existe AGENTS.md
[OK]    Existe CHECKPOINTS.md
[OK]    Existe feature_list.json
[OK]    Existe progress/current.md
[OK]    Existe docs/stack.md
[OK]    Existe docs/architecture.md
[OK]    Existe docs/conventions.md
[OK]    Existe docs/verification.md
[OK]    Existe docs/specs.md
[OK]    Existe docs/roadmap.md

── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (67 features)
[OK]    Specs presentes para features sdd con estado no-pending

── 4. Type checking (tsc) ──────────────────────────────
[INFO]  Ejecutando: npx tsc --noEmit --incremental
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ───────────────────────────────────
[INFO]  Ejecutando: pnpm run lint
$ oxlint
[OK]    OK: pnpm run lint
[INFO]  Ejecutando: pnpm run format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check

── 6. Ejecutando tests ─────────────────────────────────
[INFO]  Ejecutando: pnpm test
$ vitest run

 RUN  v5.0.5 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

 ❯ src/no-real-data.test.ts (36 tests | 1 failed) 10504ms
   ❯ no real financial data of the human is versioned (5)
     × copies no telling phrase of the database 5863ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/no-real-data.test.ts > no real financial data of the human is versioned > copies no telling phrase of the database
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/no-real-data.test.ts:699:3
    697|   })
    698|
    699|   it('copies no telling phrase of the database', (context) => {
       |   ^
    700|     // Ours is subtracted from his ONE PHRASE AT A TIME, and only wher…
    701|     // proves we wrote it (feature 24): the message our parser stores …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1514 passed (1515)
   Start at  12:45:47
   Duration  27.59s (tests 56%, import 37%, setup 5%, transform 2%)

     Import  201 modules were evaluated 3892 times · 68.42s total, 37% of tracked time
             ~6.75s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
             learn more: https://vitest.dev/guide/improving-performance#test-isolation

[ELIFECYCLE] Test failed. See above for more details.
[FAIL]  Hay tests rotos

── 7. Resumen ──────────────────────────────────────────
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

## Revisión del paso 2: dos ejecuciones en rojo del reviewer

Salida completa (sin códigos de color) de `./init.sh`, lanzado por el reviewer con el lockfile del paso 2. Son la 2.ª y la 3.ª de cinco seguidas. Resultado de las cinco: 3 en verde y 2 en rojo (ver `progress/reviews/audit-2026-11-04.md`, «Paso 2»).

### 11:52:03Z → 11:53:07Z, exit=1

```
── 1. Detectando stack ────────────────────────────────
[OK]    Stack detectado: node
[OK]    Runtime: v24.18.0

── 2. Verificando archivos base del arnés ──────────────
[OK]    Existe AGENTS.md
[OK]    Existe CHECKPOINTS.md
[OK]    Existe feature_list.json
[OK]    Existe progress/current.md
[OK]    Existe docs/stack.md
[OK]    Existe docs/architecture.md
[OK]    Existe docs/conventions.md
[OK]    Existe docs/verification.md
[OK]    Existe docs/specs.md
[OK]    Existe docs/roadmap.md

── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (67 features)
[OK]    Specs presentes para features sdd con estado no-pending

── 4. Type checking (tsc) ──────────────────────────────
[INFO]  Ejecutando: npx tsc --noEmit --incremental
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ───────────────────────────────────
[INFO]  Ejecutando: pnpm run lint
$ oxlint
[OK]    OK: pnpm run lint
[INFO]  Ejecutando: pnpm run format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check

── 6. Ejecutando tests ─────────────────────────────────
[INFO]  Ejecutando: pnpm test
$ vitest run

 RUN  v5.0.5 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

 ❯ src/no-real-data.test.ts (36 tests | 1 failed) 17220ms
   ❯ no real financial data of the human is versioned (5)
     × repeats no IBAN of the database 5860ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/no-real-data.test.ts > no real financial data of the human is versioned > repeats no IBAN of the database
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/no-real-data.test.ts:715:3
    713|   })
    714|
    715|   it('repeats no IBAN of the database', (context) => {
       |   ^
    716|     const { ibans } = databaseComparison()
    717|     if (ibans.length === 0) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1514 passed (1515)
   Start at  12:52:10
   Duration  56.94s (tests 53%, import 42%, setup 4%, transform 1%)

     Import  201 modules were evaluated 3885 times · 166.10s total, 42% of tracked time
             ~16.41s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
             learn more: https://vitest.dev/guide/improving-performance#test-isolation

[ELIFECYCLE] Test failed. See above for more details.
[FAIL]  Hay tests rotos

── 7. Resumen ──────────────────────────────────────────
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

### 11:53:07Z → 11:54:19Z, exit=1

```
── 1. Detectando stack ────────────────────────────────
[OK]    Stack detectado: node
[OK]    Runtime: v24.18.0

── 2. Verificando archivos base del arnés ──────────────
[OK]    Existe AGENTS.md
[OK]    Existe CHECKPOINTS.md
[OK]    Existe feature_list.json
[OK]    Existe progress/current.md
[OK]    Existe docs/stack.md
[OK]    Existe docs/architecture.md
[OK]    Existe docs/conventions.md
[OK]    Existe docs/verification.md
[OK]    Existe docs/specs.md
[OK]    Existe docs/roadmap.md

── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (67 features)
[OK]    Specs presentes para features sdd con estado no-pending

── 4. Type checking (tsc) ──────────────────────────────
[INFO]  Ejecutando: npx tsc --noEmit --incremental
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ───────────────────────────────────
[INFO]  Ejecutando: pnpm run lint
$ oxlint
[OK]    OK: pnpm run lint
[INFO]  Ejecutando: pnpm run format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check

── 6. Ejecutando tests ─────────────────────────────────
[INFO]  Ejecutando: pnpm test
$ vitest run

 RUN  v5.0.5 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

 ❯ src/no-real-data.test.ts (36 tests | 2 failed) 17714ms
   ❯ no real financial data of the human is versioned (5)
     × repeats no telling amount of the database 5383ms
     × copies no telling phrase of the database 7366ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/no-real-data.test.ts > no real financial data of the human is versioned > repeats no telling amount of the database
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/no-real-data.test.ts:686:3
    684|   })
    685|
    686|   it('repeats no telling amount of the database', (context) => {
       |   ^
    687|     const { amounts } = databaseComparison()
    688|     if (amounts.size === 0) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/no-real-data.test.ts > no real financial data of the human is versioned > copies no telling phrase of the database
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/no-real-data.test.ts:699:3
    697|   })
    698|
    699|   it('copies no telling phrase of the database', (context) => {
       |   ^
    700|     // Ours is subtracted from his ONE PHRASE AT A TIME, and only wher…
    701|     // proves we wrote it (feature 24): the message our parser stores …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed | 92 passed (93)
      Tests  2 failed | 1513 passed (1515)
   Start at  12:53:22
   Duration  56.66s (tests 55%, import 40%, setup 4%, transform 1%)

     Import  201 modules were evaluated 3904 times · 150.91s total, 40% of tracked time
             ~14.83s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
             learn more: https://vitest.dev/guide/improving-performance#test-isolation

[ELIFECYCLE] Test failed. See above for more details.
[FAIL]  Hay tests rotos

── 7. Resumen ──────────────────────────────────────────
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

## Revisión de no-real-data-timeout — ./init.sh n.º 1, 16:36:40Z → 16:37:43Z, exit=1

Primera de cinco ejecuciones seguidas del reviewer de `progress/reviews/no-real-data-timeout.md`. El rojo es de `src/modules/backup/backup.service.test.ts` (el `afterAll` de la línea 208 pasa de 10 s), no de `src/no-real-data.test.ts`. Las otras cuatro salieron con exit=0. Salida completa sin códigos de color:

```
── 1. Detectando stack ────────────────────────────────
[OK]    Stack detectado: node
[OK]    Runtime: v24.18.0

── 2. Verificando archivos base del arnés ──────────────
[OK]    Existe AGENTS.md
[OK]    Existe CHECKPOINTS.md
[OK]    Existe feature_list.json
[OK]    Existe progress/current.md
[OK]    Existe docs/stack.md
[OK]    Existe docs/architecture.md
[OK]    Existe docs/conventions.md
[OK]    Existe docs/verification.md
[OK]    Existe docs/specs.md
[OK]    Existe docs/roadmap.md

── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (67 features)
[OK]    Specs presentes para features sdd con estado no-pending

── 4. Type checking (tsc) ──────────────────────────────
[INFO]  Ejecutando: npx tsc --noEmit --incremental
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ───────────────────────────────────
[INFO]  Ejecutando: pnpm run lint
$ oxlint
[OK]    OK: pnpm run lint
[INFO]  Ejecutando: pnpm run format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check

── 6. Ejecutando tests ─────────────────────────────────
[INFO]  Ejecutando: pnpm test
$ vitest run

 RUN  v5.0.5 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

 ❯ src/modules/backup/backup.service.test.ts (21 tests) 31167ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modules/backup/backup.service.test.ts > backup commands
Error: Hook timed out in 10000ms.
If this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".
 ❯ src/modules/backup/backup.service.test.ts:208:3
    206|   }, 60_000)
    207|
    208|   afterAll(async () => {
       |   ^
    209|     await truncateAll(workerUrl)
    210|     await dropTargetDatabases()

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 92 passed (93)
      Tests  1516 passed (1516)
   Start at  17:36:49
   Duration  53.61s (import 49%, tests 44%, setup 5%, transform 1%)

     Import  201 modules were evaluated 3900 times · 170.91s total, 49% of tracked time
             ~16.82s faster with isolate: false — shared modules are evaluated once per worker instead of once per file
             learn more: https://vitest.dev/guide/improving-performance#test-isolation

[ELIFECYCLE] Test failed. See above for more details.
[FAIL]  Hay tests rotos

── 7. Resumen ──────────────────────────────────────────
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

## Revisión de no-real-data-timeout — el test solo, dos ejecuciones con exit=1

Primera tanda de `pnpm exec vitest run src/no-real-data.test.ts --reporter=verbose`
del reviewer, en torno a las 16:31Z. Pasadas 1 y 2 de 3: **exit=1 con
`Tests 37 passed (37)`**. El rojo lo pone `vitest.setup.ts` al acabar el archivo:

```
 FAIL  src/no-real-data.test.ts [ src/no-real-data.test.ts ]
Error: Este archivo de test ha dejado filas sin borrar (Account: 1, Movement: 2). Un test limpia lo que crea: ver docs/conventions.md §Tests con base de datos.
```

(pasada 1: `Duration 13.07s`; pasada 2: `Duration 4.00s`). La salida completa no se
guardó: solo se filtró con `grep`. `src/no-real-data.test.ts` no crea filas
(no usa `buildApp` ni Prisma); de dónde salieron esas filas en `gastos_test_1` no
lo he comprobado. La segunda tanda de tres, justo después, salió con exit=0 las tres.

## Investigación (2026-11-04)

Investigación de solo lectura (no se ha tocado código, tests ni config). Horas en
UTC salvo donde se dice: el `Start at` de vitest va en hora local (UTC+1) y el log
de PostgreSQL (`docker logs gastos-postgres`) en UTC. Las salidas completas de mis
pasadas están en el scratchpad de la sesión
(`C:\Users\roybe\AppData\Local\Temp\claude\c--Users-roybe-Escritorio-proyectos-control-gastos-gastos-backend\59635eb4-589b-44e6-80ea-256f90fc5e4a\scratchpad\`),
no en el repo. Al acabar: `dist/` no existe, `git status` igual que al empezar
(más este archivo), y en el servidor solo quedan `gastos`, `gastos_test_1..8` y
`gastos_test_template`.

Entorno comprobado: PostgreSQL 17.9 en el contenedor `gastos-postgres`;
`availableParallelism()` = 12, así que `testWorkerCount` da 8 workers y 8 bases.

### a) Cómo se asignan las bases `gastos_test_N`, y qué pasa con dos procesos vitest a la vez

**Lectura del código** (`vitest.config.ts`, `vitest.setup.ts`,
`vitest.global-setup.ts`, `src/lib/test-db.ts`):

- El nombre de la base sale solo de `VITEST_POOL_ID`:
  `workerDatabaseName(poolId, workerCount)` → `gastos_test_${((poolId-1) % workerCount)+1}`.
  No interviene nada propio del proceso (ni pid ni identificador de pasada).
  `VITEST_POOL_ID` empieza en 1 en cada proceso vitest, así que **dos procesos
  vitest distintos usan las mismas `gastos_test_1..8`**; un `vitest run <un archivo>`
  usa siempre `gastos_test_1`.
- `vitest.global-setup.ts` → `prepareTestDatabases`: para cada base, si tiene
  filas, ejecuta `dropAndClone`, que hace `pg_terminate_backend` de todas las
  conexiones a esa base y la borra y recrea. Si otro proceso vitest está a mitad
  de pasada con filas en esa base, esto le corta las conexiones y le borra los
  datos. Esto es deducción a partir del código; **no lo he reproducido**: en mis
  experimentos escalonados no salió (ver abajo).
- El `afterAll` de `vitest.setup.ts` cuenta las filas de la base del worker al
  acabar cada archivo y lo pone en rojo si hay alguna, sin saber de quién son.

**Experimento** (dos procesos a la vez, solo contra `gastos_test_*`; la base
`gastos` solo la lee el global setup, en solo lectura). Primero cada archivo solo,
uno tras otro:

```
$ pnpm exec vitest run src/modules/accounts/accounts.test.ts   → Tests 27 passed, exit=0, Duration 4.78s
$ pnpm exec vitest run src/modules/movements/movements.test.ts → Tests 98 passed, exit=0, Duration 10.18s
```

Después los dos lanzados a la vez, con un sondeo de `pg_stat_activity` cada 0,3 s
(cuántas conexiones hay a cada base `gastos_test%`):

```
movements exit=1
 FAIL  src/modules/movements/movements.test.ts > movement routes (read-only) and database indexes > returns every movement exactly once when walking all the pages over several ties
Invalid `app.prisma.movement.create()` invocation in .../movements.test.ts:784:32
Foreign key constraint violated on the constraint: `Movement_accountId_fkey`
accounts exit=1
 FAIL  src/modules/accounts/accounts.test.ts [ src/modules/accounts/accounts.test.ts ]
Error: Este archivo de test ha dejado filas sin borrar (Account: 3, Movement: 4). Un test limpia lo que crea: ver docs/conventions.md §Tests con base de datos.
La suite ha dejado filas en sus bases de prueba:
  - gastos_test_1?schema=public → Account: 1, InvestmentProduct: 1, Movement: 2
--- probe (connections per test db):
     38   (vacío)
      1 gastos_test_1=4
      1 gastos_test_1=5
```

Repetido con el segundo proceso lanzado 0, 2 y 6 s después del primero:

```
== delay=0s movements exit=0 accounts exit=1
Error: Este archivo de test ha dejado filas sin borrar (Account: 1, Movement: 4). ...
  - gastos_test_1?schema=public → Account: 2
== delay=2s movements exit=0 accounts exit=0
== delay=6s movements exit=0 accounts exit=0
```

(Y otra con 4 s de retraso: los dos exit=0.) Resultado: **comprobado que dos
procesos vitest simultáneos comparten `gastos_test_1`** (el sondeo solo ve
conexiones a esa base) y que eso produce, de forma intermitente (2 de 5 intentos
en rojo), exactamente el mensaje del síntoma 2 con filas que el archivo señalado
no ha creado, y además fallos de clave ajena en el otro proceso.

### Síntoma 2 — filas sobrantes («Account: 1, Movement: 2»)

**Causa probable:** otro proceso vitest escribiendo a la vez en la misma
`gastos_test_N` (comprobado arriba que pasa y que da ese mensaje).

**No comprobado:** que a las ~16:31Z hubiera de verdad otro proceso vitest en
marcha mientras el reviewer lanzaba `src/no-real-data.test.ts`. Solo hay indicios:
en el log de PostgreSQL aparece el error que provoca a propósito un test de
`backup.service.test.ts` («`database "gastos_test_backup_1_busy" is being accessed
by other users`», uno por pasada de ese archivo) a las 16:29:11, 16:30:13, 16:31:07
y 16:31:48, o sea, alguien ejecutaba la suite completa en esos minutos; y entre
16:34:23 y 16:34:31 hay 8 `FATAL: terminating connection due to administrator
command` (que en la suite solo emiten `dropAndClone` y `dropTargetDatabases`).
Para comprobarlo haría falta saber qué comandos lanzó cada agente y a qué hora (el
log de PostgreSQL no registra conexiones: no aparece ninguna línea de conexión).

**Descartado leyendo el código** (`grep` sobre los 93 archivos de test): solo
`src/lib/test-db.ts`, `src/lib/test-real-data.ts` y
`src/modules/backup/backup.service.test.ts` abren su propio cliente `pg`; ningún
test crea su propio `PrismaClient`; todos los archivos con `buildApp(` tienen al
menos tantos `.close()` como `buildApp(`, salvo `import.warnings.routes.test.ts`
(3 y 2; leído: sus dos `describe` hacen `app = buildApp()` en `beforeAll` y
`app.close()` en `afterAll`; el tercer `buildApp(` es un comentario); el único
proceso hijo lanzado por un test (`backup.scripts.test.ts`) recibe una
`DATABASE_URL` inventada a `gastos_test_no_existe`; los dos `setTimeout` de tests
(`import.routes.test.ts:369`, `investments.model.test.ts:448`) van con `await`.
No he encontrado ningún test que deje filas por sí solo; **no** he revisado línea
a línea los 36 archivos que limpian con `deleteMany`/`truncateAll`.

**Arreglos posibles (sin aplicar):**

1. Que `vitest.global-setup.ts` tome al empezar un bloqueo consultivo de
   PostgreSQL (`pg_try_advisory_lock` en la base `postgres`, con una conexión
   abierta hasta el teardown) y, si otro proceso ya lo tiene, falle en el acto con
   un mensaje que diga que ya hay otra pasada de la suite en marcha contra ese
   PostgreSQL. Coste: pequeño (`vitest.global-setup.ts` + una función en
   `src/lib/test-db.ts` con su test). Riesgo: bajo; si un proceso muere,
   PostgreSQL suelta el bloqueo al cerrarse la conexión. Cambia un rojo confuso
   por uno que dice la causa (con `pg_advisory_lock` sin `try`, el segundo proceso
   esperaría a que acabe el primero en vez de fallar).
2. Que el nombre de las bases incluya algo propio de cada proceso (p. ej.
   `gastos_test_<pid>_<N>`), creadas en el global setup y borradas en el teardown.
   Coste: medio (test-db, los dos setups, el prefijo de `backup.service.test.ts`,
   ADR-027). Riesgo: cada pasada haría 8 `DROP DATABASE` más, y cada uno fuerza un
   checkpoint (ver síntoma 1): empeoraría los síntomas 1 y 3; y quedarían bases
   huérfanas si una pasada se mata a mitad.

### Síntoma 1 — el `afterAll` de `backup.service.test.ts:208` pasa de 10 s

**Qué hace** (leído en `src/modules/backup/backup.service.test.ts:208-212`):
`truncateAll(workerUrl)`, luego `dropTargetDatabases()` (por cada base
`gastos_test_backup_<worker>_*`: `pg_terminate_backend` + `drop database`, cada
uno con un `Client` nuevo) y comprueba que no queda ninguna. En el `afterAll` no
hay `pg_dump`, ni Drive, ni ficheros temporales. Ese `afterAll` no lleva tiempo
propio: el `{ timeout: 60_000 }` del `describe` no le aplica (la salida roja dice
`Hook timed out in 10000ms`), mientras que el `beforeAll` sí lleva `60_000`.

**Cuántas bases borra:** el archivo solo, sondeando cada 0,2 s cuántas
`gastos_test_backup_%` existen:

```
$ pnpm exec vitest run src/modules/backup/backup.service.test.ts → Tests 21 passed, Duration 15.06s
21:13:48.124 count=11 ... 21:13:55.048 count=9 → 21:13:55.976 count=0
```

El `afterAll` borra unas 9 bases (las demás las borra `restoreBackup` durante los
tests).

**Por qué tarda: cada `DROP DATABASE` fuerza un checkpoint de PostgreSQL y espera
a que termine.** Comprobado: el log tiene un `checkpoint starting: immediate force
wait` por cada borrado, y el primero vuelca a disco todo lo escrito desde el
checkpoint anterior. Experimento creando 12 bases `gastos_test_probe_*` desde la
plantilla y borrándolas con `\timing`:

```
create database ...: 156, 129, 149, 128, 107, 79, 88, 96, 119, 174, 177, 490 ms
drop database ... (1.º): 4644.213 ms   (resto: 34–241 ms)
log: checkpoint complete: wrote 9778 buffers (59.7%); ... sync=3.813 s, total=4.578 s; sync files=4528
```

Cada pasada de la suite completa hace 12 checkpoints forzados (contados en las 10
ventanas de la tabla de abajo: siempre 12). En la pasada roja del síntoma 1
(vitest empezó a las 16:36:49Z; el archivo tardó 31167 ms):

```
16:36:54.168 checkpoint starting: immediate force wait
16:37:00.022 checkpoint complete: wrote 7719 buffers (47.1%); ... sync=5.404 s, total=5.854 s; sync files=4248
16:37:00.281 → total=8.019 s (sync=7.865 s)
16:37:08.301 → total=1.792 s
16:37:11.338 → total=2.999 s
16:37:14.649 → total=2.015 s
16:37:16.996 → 0.944 s ; 16:37:18.031 → 0.781 s ; 16:37:18.902 → 0.522 s ; ... el último a 16:37:21.248
```

Suma de esos 12: 24,2 s, casi todo `sync` (escritura a disco del volumen de
Docker). Solo, el mismo `afterAll` tarda ~1 s (21:13:55.0 → 21:13:56.2 en mi
pasada). Que los ~9 últimos checkpoints (de ~16:37:11 a 16:37:21, ~10 s) sean
justo los del `afterAll` es **deducción, no comprobado**: el test no registra
cuándo empieza el hook. Para comprobarlo haría falta una pasada con marcas de
tiempo al entrar y salir del `afterAll`.

**Arreglos posibles (sin aplicar):**

1. Darle al `afterAll` el mismo `60_000` que ya tiene el `beforeAll`. Coste: una
   línea. Riesgo: bajo; no quita la lentitud, solo el rojo.
2. Dejar el borrado de las bases de destino al `beforeAll` de la pasada siguiente
   (que ya ejecuta `dropTargetDatabases()` al empezar) y quitarlo del `afterAll`,
   junto con la comprobación de que no queda ninguna. Coste: pequeño. Riesgo:
   entre pasadas quedan ~9 bases `gastos_test_backup_*` en el servidor; no reduce
   los checkpoints, solo los mueve a un hook con 60 s.

(Una tercera vía que **no** propongo: desactivar `fsync` o similares en el
contenedor. Ese PostgreSQL guarda también la base `gastos` del humano.)

### d) y síntoma 3 — tiempos de `./init.sh`

Seis `./init.sh` seguidos, de uno en uno (nunca dos a la vez), más dos
`pnpm exec vitest run --reporter=json` para ver los archivos más lentos.
«Checkpoints forzados» = los `immediate force wait` del log de PostgreSQL dentro
de la ventana de cada pasada.

| Pasada | Inicio (UTC) | exit | Duración vitest | Total `./init.sh` | Checkpoints forzados: suma (máx.) | Carga CPU media |
|---|---|---|---|---|---|---|
| 1 | 21:04:49 | 0 | 25 s | 33 s | 3,6 s (3,0) | no medida |
| 2 | 21:05:22 | 0 | 73 s | 82 s | 38,7 s (33,1) | no medida; el `playwright test` del frontend arrancó a las 21:05:29 |
| 3 | 21:06:44 | 0 | 51 s | 84 s | 21,2 s (17,2) | no medida |
| 4 | 21:15:19 | 0 | 39 s | 58 s | 13,1 s (11,7) | 92 % |
| 5 | 21:16:22 | 0 | 33 s | 42 s | 5,5 s (4,2) | 92 % |
| 6 | 21:17:26 | **1** | 62 s | 84 s | 26,3 s (23,9) | 99 % |
| roja del reviewer | 11:45:47 | 1 | 28 s | — | 4,8 s (3,9) | — |
| roja del reviewer | 11:52:10 | 1 | 57 s | — | 35,8 s (31,8) | — |
| roja del reviewer | 11:53:22 | 1 | 57 s | — | 30,2 s (23,9) | — |
| roja del reviewer (síntoma 1) | 16:36:49 | 1 | 54 s | — | 24,2 s (8,0) | — |

Rojo de la pasada 6 (nuevo: no es ninguno de los tres síntomas, pero es de la
misma familia que los timeouts de `no-real-data`):

```
 ❯ src/architecture.test.ts (41 tests | 1 failed) 9719ms
   ❯ architecture invariants (34)
     × shares no parsing code between bank modules (one parser per bank) 5548ms
 FAIL  src/architecture.test.ts > architecture invariants > shares no parsing code between bank modules (one parser per bank)
Error: Test timed out in 5000ms.
 ❯ src/architecture.test.ts:489:3
 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1515 passed (1516)
   Start at  22:17:48
   Duration  61.86s (tests 49%, import 45%, setup 5%, transform 1%)
```

El mismo test volvió a caer en la primera pasada con reporter JSON (7047 ms,
`Test timed out in 5000ms`). Es síncrono y, leído en
`src/architecture.test.ts:489-530`, llama a `sourceFiles(srcDir)` dentro de un
bucle por cada uno de los 6 bancos, leyendo seis veces los 228 `.ts` de `src/`
(3,6 MB). El siguiente test más lento de ese archivo tardó 1342 ms.

Archivos más lentos (reporter JSON, duración por archivo en ms):

```
json 1 (21:19:12Z) exit=1, suma 137907 ms             json 2 (21:19:59Z) exit=0, suma 81034 ms
 24789 backup/backup.service.test.ts                  12626 backup/backup.service.test.ts
 15069 architecture.test.ts (failed)                   6366 import/import.service.test.ts
 12435 import/import.service.test.ts                   4994 movements/movements.test.ts
 10017 backup/backup.scripts.test.ts                   4890 architecture.test.ts
  9815 movements/movements.test.ts                     3453 backup/backup.scripts.test.ts
  8532 category-rules/category-rules.service.test.ts   3356 lib/test-guard.e2e.test.ts
```

**Causa probable del síntoma 3**, en dos partes:

- **Los checkpoints forzados por los `DROP DATABASE`** (comprobado que existen y
  cuánto duran): la duración de la pasada va con su suma (24,8 s ↔ 3,6 s;
  32,6 s ↔ 5,5 s; 39,1 s ↔ 13,1 s; 51,1 s ↔ 21,2 s; 73,3 s ↔ 38,7 s). Que la espera
  a disco durante el checkpoint sea lo que alarga a los demás archivos es
  **deducción**: no he medido la latencia de las consultas de los otros workers
  mientras dura un checkpoint.
- **Carga de la máquina por procesos ajenos a la suite** (comprobado en el momento
  con `Get-CimInstance Win32_Process` y `Get-Process`): el `vite` del frontend
  (pid 30748, arrancado a las 13:00 hora local) gastó 4,2 s de CPU en 10 s y 5,1 s
  en 5 s, ~1 núcleo entero todo el rato; seis procesos de Firefox sumaban ~16 s de
  CPU en 5 s; y un `playwright test` del frontend con 6 workers arrancó a las
  21:05:29Z, dentro de mi pasada 2 (la más lenta). Carga media de CPU durante las
  pasadas 4-6: 92 %, 92 % y 99 %. Que esa carga explique los timeouts de tests
  síncronos (el de `architecture.test.ts` y los de `no-real-data.test.ts`) y parte
  de la variación entre pasadas verdes es **deducción**: no he hecho pasadas con la
  máquina descargada para compararlas.

**Arreglos posibles (sin aplicar):**

1. En `src/architecture.test.ts:489`, leer la lista de archivos de `src/` y su
   contenido una sola vez en vez de seis (o darle más tiempo, como se hizo en
   `no-real-data.test.ts`). Coste: pequeño. Riesgo: bajo. Quita un rojo concreto,
   no la variación.
2. Reducir los 12 checkpoints forzados de cada pasada, que son los `DROP DATABASE`
   de `backup.service.test.ts`: que los tests de `restoreBackup` usen menos bases
   distintas, o que ese archivo se ejecute cuando los demás workers ya han
   acabado, para que su volcado a disco no compita con nadie. Coste: medio. Riesgo:
   medio (toca un archivo de tests grande y su cobertura de casos de restauración).
   No he medido cuánto se ganaría.
