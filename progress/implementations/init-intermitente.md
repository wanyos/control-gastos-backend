# init-intermitente — implementación (mantenimiento, sin feature)

No se ha escrito en la base del humano ni en sus carpetas. Al acabar, en el servidor
solo quedan `gastos`, `gastos_test_1..8` y `gastos_test_template` (comprobado con
`select datname from pg_database where datname like 'gastos%'`), y `dist/` no existe.

Encargo: los tres arreglos aprobados de
`progress/explorations/init-intermitente-2026-11-04.md` §Investigación (2026-11-04).

## Archivos modificados / creados

- `src/lib/test-db.ts` — nueva `lockTestSuite(realDatabaseUrl, key?)`, la constante
  `testSuiteLockKey` y el tipo `TestSuiteLock` (`release()`).
- `src/lib/test-db.test.ts` — 5 tests nuevos (abajo).
- `vitest.global-setup.ts` — toma el bloqueo antes de nada; lo suelta en el teardown
  (en un `finally`, después de las dos comprobaciones y antes de `failRun`) y también si
  la preparación falla (en ese caso no hay teardown). El cuerpo de antes pasa, sin
  cambios, a una función `prepareRun`.
- `src/modules/backup/backup.service.test.ts` — el `afterAll` de la línea 208 lleva
  `60_000`. Nada más en ese archivo.
- `src/architecture.test.ts` — el test «shares no parsing code between bank modules»
  lista y lee los archivos de `src/` una sola vez.
- `docs/architecture.md` — nota de revisión del 2026-11-04 al principio del ADR-027.

## Decisiones tomadas

1. **Bloqueo en la base `postgres`.** Un bloqueo consultivo de PostgreSQL solo choca con
   la misma clave tomada en la misma base, así que todas las ejecuciones tienen que
   conectarse a la misma. `postgres` es la base de mantenimiento que `test-db.ts` ya usa
   para crear y borrar las demás: existe siempre y la suite nunca la borra. Descartadas:
   una `gastos_test_N` (el `globalSetup` las borra y reclona con `pg_terminate_backend`,
   lo que cortaría la conexión y soltaría el bloqueo) y `gastos` (es la del humano; no
   quiero tenerle una conexión abierta toda la pasada, y `vitest.global-setup.ts` solo la
   abre en solo lectura para la foto y la lectura de la F51). La conexión solo hace
   `select pg_try_advisory_lock(...)` y `select pg_advisory_unlock(...)`.
2. **Clave fija** `testSuiteLockKey = 20_271_104`, sin significado propio. La función
   acepta otra clave como parámetro para que sus tests no dependan del bloqueo que tiene
   la ejecución en curso.
3. **El mensaje** dice el host y puerto del servidor (`new URL(...).host`), nunca la
   contraseña. Texto: «Ya hay otra ejecución de la suite de tests en marcha contra ese
   PostgreSQL (localhost:5434). Hay que esperar a que acabe y volver a lanzarla: las dos
   usarían las mismas bases gastos_test_* y se borrarían las filas la una a la otra (ver
   ADR-027).»
4. **Es un `throw` en el setup, no `failRun`.** La regla de `docs/conventions.md` sobre
   no usar `throw` es para el teardown; en el setup un `throw` sí pone la pasada en rojo
   (comprobado abajo: exit 1).
5. **`release()` se puede llamar dos veces sin efecto**: lo pide el caso en que la
   preparación falla después de tomar el bloqueo.
6. **`architecture.test.ts`:** los archivos de `src/` se leen una vez dentro del propio
   test (lista de `{ file, path, text }`), y los de cada banco salen de filtrar esa lista
   por `modules/<banco>/`, que es lo mismo que daba `sourceFiles(join(srcDir, 'modules',
   banco))` (mismo recorrido y mismos filtros: sin `generated/`, sin `.test.ts`). Las
   tres comprobaciones y sus `expect` no cambian. No he subido el límite de tiempo. No lo
   he sacado a nivel de archivo como en `no-real-data.test.ts` porque los demás tests de
   ese archivo no estaban en el encargo.

## Tests nuevos (`src/lib/test-db.test.ts`)

- `takes the lock of one run at a time before preparing any database, and lets it go at the end`
  — `vitest.global-setup.ts` llama a `lockTestSuite(realDatabaseUrl)` antes de
  `prepareTestDatabases(` y tiene las dos llamadas a `lock.release()`.
- `refuses a second holder of the same key while the first one keeps it`
- `lets the next one in once the first has released it` (incluye soltarlo dos veces)
- `finds the lock of this very run already taken, and says to wait for it to end` — con
  la clave de verdad: durante la pasada el `globalSetup` lo tiene, así que un segundo
  intento falla con el mensaje.
- `names the server but never its password`

## Pruebas a mano

**Que los tests nuevos y los cambiados pasan, de uno en uno:**

```
pnpm exec vitest run src/lib/test-db.test.ts                    → Tests 20 passed (20), exit 0
pnpm exec vitest run src/architecture.test.ts                   → Tests 41 passed (41)
pnpm exec vitest run src/modules/backup/backup.service.test.ts  → Tests 21 passed (21)
```

Tres ejecuciones seguidas de un solo archivo, sin ningún rechazo: el bloqueo se suelta
al acabar cada una.

**Dos ejecuciones a la vez (prueba controlada).** Primera:
`backup.service.test.ts` (~9,5 s) en segundo plano; 3 s después, segunda:
`accounts.test.ts`. Salida de la segunda:

```
 RUN  v5.0.5 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

No test files found, exiting with code 1

filter: src/modules/accounts/accounts.test.ts
include: **/*.{test,spec}.?(c|m)[jt]s?(x)
exclude:  **/node_modules/**, **/.git/**


⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: Ya hay otra ejecución de la suite de tests en marcha contra ese PostgreSQL (localhost:5434). Hay que esperar a que acabe y volver a lanzarla: las dos usarían las mismas bases gastos_test_* y se borrarían las filas la una a la otra (ver ADR-027).
 ❯ lockTestSuite src/lib/test-db.ts:358:11
 ❯ Object.setup vitest.global-setup.ts:70:16
 ❯ TestProject._initializeGlobalSetup node_modules/.pnpm/vitest@5.0.5_.../vitest/dist/chunks/index.1TqnEahn.js:6567:21
 ...
second exit=1
```

Y la primera, sin afectar:

```
 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  21:10:33
   Duration  9.52s (tests 97%, import 2%, setup 1%)
first exit=0
```

La línea «No test files found» la imprime vitest al abortar en el setup; es engañosa
pero sale antes del error, que es el que dice la causa. (Un primer intento con
`movements.test.ts` como primera no sirvió: acabó en 2,84 s, antes de que arrancara la
segunda, y las dos salieron con 0.)

**`./init.sh --checks`**: sin feature `in_progress` no se ejecuta nada (`[FAIL] no hay
ninguna feature in_progress; pasa su id o su nombre`), así que lancé
`./init.sh --checks 67` (17 comandos de vitest seguidos, uno tras otro): exit 1,
«Checks: 16 de 17 en verde». Los 16 primeros (`vitest run` de un solo test) en `[OK]`;
ninguno de los 18 logs `/tmp/harness_check_*.log` contiene «Ya hay otra»
(`grep -l "Ya hay otra" /tmp/harness_check_*.log | wc -l` → 0). El 17 (`pnpm test`)
falla por el rojo de `src/no-real-data.test.ts` de abajo, no por el bloqueo.

**`architecture.test.ts`, que sigue comprobando lo mismo.** Con un archivo temporal
creado y borrado a mano en cada caso:

- `src/modules/n26/zz-tmp-check.ts` con `export { x } from '../revolut/revolut.parser.js'`
  → `AssertionError: expected [ Array(1) ] to deeply equal []` (la lista de imports
  prohibidos).
- `src/lib/zz-tmp-check.ts` con un comentario que nombra `n26` →
  `expected [ 'app.ts', 'lib/zz-tmp-check.ts' ] to deeply equal [ 'app.ts' ]`.
- `src/modules/n26/zz-tmp-check.ts` con `'modules/revolut'` → rojo
  (`expected [ 'app.ts', …(1) ] to deeply equal [ 'app.ts' ]`).

`git status` después: ninguno de los tres archivos queda.

Duración del test, con `-t "shares no parsing code" --reporter=verbose`, dos veces cada
versión: ahora 48 ms y 47 ms; la versión de `HEAD` (con `git stash` solo de ese archivo,
restaurado después) 250 ms y 256 ms.

## Documentos actualizados

`git grep -n -iE "dos (pasadas|ejecuciones)|a la vez|en paralelo|concurrent|advisory"`
sobre `docs`, `README.md`, `AGENTS.md`, `vitest*.ts` y `src/lib/test-db*`: ninguna línea
afirmaba que se pudieran lanzar dos ejecuciones de la suite a la vez; nada que corregir.
Añadida la nota de revisión al ADR-027 en `docs/architecture.md`.

## Último ./init.sh

Tres seguidos, de uno en uno. Los tres con exit 1 y el **mismo** rojo, que no es
ninguno de los tres de este encargo:

```
run 1 exit=1
     × repeats no telling amount of the database 235ms
 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1520 passed (1521)
   Duration  22.27s
run 2 exit=1
     × repeats no telling amount of the database 230ms
 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1520 passed (1521)
   Duration  21.83s
run 3 exit=1
     × repeats no telling amount of the database 224ms
 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1520 passed (1521)
   Duration  21.66s
```

En los tres: estado, type check, `pnpm run lint` y `pnpm run format:check` en `[OK]`;
`[FAIL] Hay tests rotos`.

**Qué es ese rojo.** `src/no-real-data.test.ts` («repeats no telling amount of the
database») señala dos líneas de un archivo que no es mío ni de este encargo, el
informe de investigación sin commitear:

```
progress/explorations/init-intermitente-2026-11-04.md:554 — an amount on this line is in the database: it is real data, invent another one
progress/explorations/init-intermitente-2026-11-04.md:557 — an amount on this line is in the database: it is real data, invent another one
```

Son dos filas de la tabla de tiempos de las pasadas (§d) y síntoma 3): alguna de sus
cifras de duración coincide con un importe de la base del humano. No lo he arreglado
(está fuera del encargo y de los archivos que podía tocar). No he comprobado que la
suite quede en verde sin ese archivo: no lo he movido. Lo que sí se ve en las tres
pasadas es que ningún otro test falla (92 archivos y 1520 tests en verde), incluidos
los dos que caían por tiempo (`backup.service.test.ts` y `architecture.test.ts`).

`pnpm run lint`: exit 0.

## Sugerencias fuera de scope (NO aplicadas)

- Que el informe `progress/explorations/init-intermitente-2026-11-04.md` cambie esas
  dos cifras (o se redondeen) antes de commitearlo, para que la suite vuelva a verde.
- Una línea en `docs/conventions.md` §Tests con base de datos diciendo que no se lanzan
  dos ejecuciones de la suite a la vez contra el mismo PostgreSQL y qué mensaje sale si
  se hace; no la he añadido porque el encargo pedía solo el ADR.
