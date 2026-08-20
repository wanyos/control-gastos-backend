# Resumen — feature 27 `tests-dont-touch-real-db`

Fecha de cierre: 2026-08-20
Intención original: `feature_list.json` → feature `tests-dont-touch-real-db`, bloque `intent`
Feature **sin spec** (`sdd: false`): mandaban sus 10 criterios de `acceptance`.
Informe del implementer: [`implementations/tests-dont-touch-real-db.md`](../implementations/tests-dont-touch-real-db.md)
Review: [`reviews/tests-dont-touch-real-db.md`](../reviews/tests-dont-touch-real-db.md)

## Qué hace ahora la app que antes no

**Los tests ya no pueden escribir en tu base de datos.** Hasta hoy `pnpm test` corría
contra `gastos`, la tuya, y te dejaba dentro cuentas, movimientos y productos inventados
—una sola tarde de pasadas te metió más de un centenar de filas falsas—. Desde ahora cada
worker de vitest corre contra **su propia base desechable** (`gastos_test_<n>`), en el
mismo contenedor de PostgreSQL, clonada de una plantilla ya migrada. Se crean solas.

**Tú no tienes que hacer nada distinto:** sigue siendo `docker compose up -d` y
`./init.sh` / `pnpm test`. `init.sh` no ha cambiado ni una línea. La suite pasa de ~6,1 s
a ~7,4 s, y la primera vez tras un clon nuevo cuesta ~1-2 s más por crear la plantilla.

Y hay **dos guardianes** que no dependen de que nadie se acuerde de nada:

- Si un archivo de test **deja una fila** en su base desechable, ese archivo se pone
  **rojo** diciendo qué tabla y cuántas filas, y la base se vacía para no contagiar al
  siguiente.
- Si **tu** base cambia mientras corre la suite —aunque sea una fila insertada y borrada
  después, que se ve en el contador— la pasada entera termina en **rojo** con la
  diferencia dicha en claro.

De tu base **no se borra nunca nada**: el único código que la abre hace `select`. Y nada
puede escribir en una base cuyo nombre no empiece por `gastos_test_`.

**El regalo inesperado:** esto también mató el fallo intermitente que llevaba dos
features molestando. `./init.sh` fallaba 4 de cada 13 veces con un error 500 al listar
movimientos; la causa era que dos archivos de test escribían y borraban a la vez en la
misma base, y cuantos más datos tenías tú, más ancha era la ventana. Con una base por
worker la carrera es imposible: **18 pasadas seguidas, 18 verdes** en esta revisión.

## Por dónde se usa (puntos de entrada)

No hay endpoint ni comando nuevo: esto vive por debajo de `pnpm test`.

- `pnpm test` / `./init.sh` — igual que siempre. Lo que cambió es a qué base apunta.
- Antes de la suite y al terminar: [vitest.global-setup.ts:24](../../vitest.global-setup.ts#L24)
  prepara las bases desechables y compara la foto de la tuya.
- Antes de cada archivo de test: [vitest.setup.ts:42](../../vitest.setup.ts#L42) reapunta
  `DATABASE_URL` a la base de ese worker.
- Al terminar cada archivo de test: [vitest.setup.ts:44](../../vitest.setup.ts#L44) caza
  la fila olvidada.
- El cableado que lo activa: [vitest.config.ts:16](../../vitest.config.ts#L16)
  (`setupFiles`, `globalSetup`, `maxWorkers`).

## Dónde está el código (para revisión directa)

### La fontanería (todo en un módulo tipado y con tests)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El muro: revienta si la base no empieza por `gastos_test_` | `assertTestDatabase` | [test-db.ts:72](../../src/lib/test-db.ts#L72) |
| Nombre de la base de cada worker (`gastos_test_3`) | `workerDatabaseName` | [test-db.ts:50](../../src/lib/test-db.ts#L50) |
| Cuántas bases se preparan (tope 8) | `testWorkerCount` | [test-db.ts:45](../../src/lib/test-db.ts#L45) |
| Misma conexión, otra base | `withDatabase` / `databaseNameOf` | [test-db.ts:56](../../src/lib/test-db.ts#L56) |
| Filas que un archivo dejó atrás | `findLeftoverRows` | [test-db.ts:125](../../src/lib/test-db.ts#L125) |
| Cómo se dice en una línea | `describeLeftoverRows` | [test-db.ts:131](../../src/lib/test-db.ts#L131) |
| Vaciar una base desechable | `truncateAll` | [test-db.ts:136](../../src/lib/test-db.ts#L136) |
| Foto de SOLO LECTURA de una base (recuentos + secuencias) | `snapshotDatabase` | [test-db.ts:159](../../src/lib/test-db.ts#L159) |
| Qué cambió entre dos fotos, en cristiano | `describeSnapshotDifferences` | [test-db.ts:182](../../src/lib/test-db.ts#L182) |
| Migraciones que hay en disco | `localMigrations` | [test-db.ts:219](../../src/lib/test-db.ts#L219) |
| Crear/clonar las bases antes de la suite | `prepareTestDatabases` | [test-db.ts:315](../../src/lib/test-db.ts#L315) |
| Constantes de nombre (prefijo y plantilla) | `testDatabasePrefix`, `templateDatabaseName` | [test-db.ts:28](../../src/lib/test-db.ts#L28) |

### El pegamento de vitest (en la raíz, a propósito: es quien lee el entorno)

| Qué hace | Código |
| --- | --- |
| Prepara bases, foto antes/después de la tuya, guardián 2 | [vitest.global-setup.ts](../../vitest.global-setup.ts) |
| Reapunta `DATABASE_URL` por archivo + guardián 1 | [vitest.setup.ts](../../vitest.setup.ts) |
| `setupFiles`, `globalSetup`, `maxWorkers` fijado | [vitest.config.ts](../../vitest.config.ts) |

### Tests (15 nuevos)

| Qué cubre | Código |
| --- | --- |
| La suite apunta a una `gastos_test_*`, nunca a la de `.env` | [test-db.test.ts:44](../../src/lib/test-db.test.ts#L44) |
| Se niega a escribir en una base que no es de pruebas | [test-db.test.ts:74](../../src/lib/test-db.test.ts#L74) |
| Una base por worker, sin dos archivos compartiendo filas | [test-db.test.ts:64](../../src/lib/test-db.test.ts#L64) |
| El cableado sigue puesto (borrarlo pone la suite roja) | [test-db.test.ts:98](../../src/lib/test-db.test.ts#L98) |
| **Guardián 1 en rojo**: fila dejada a propósito, con tabla y cantidad | [test-db.test.ts:143](../../src/lib/test-db.test.ts#L143) |
| Cuenta todas las tablas, no una lista escrita a mano | [test-db.test.ts:157](../../src/lib/test-db.test.ts#L157) |
| No cuenta la contabilidad interna de Prisma como basura | [test-db.test.ts:181](../../src/lib/test-db.test.ts#L181) |
| **Guardián 2 en rojo**: ve el insert aunque se borre, por la secuencia | [test-db.test.ts:207](../../src/lib/test-db.test.ts#L207) |
| Dice qué tabla creció y cuánto | [test-db.test.ts:224](../../src/lib/test-db.test.ts#L224) |
| Los dos archivos nuevos entran en el árbol declarado | [architecture.test.ts:68](../../src/architecture.test.ts#L68) |

### Documentación

| Qué | Dónde |
| --- | --- |
| El porqué completo, con las alternativas descartadas | `docs/architecture.md` → **ADR-027** |
| Cómo se escribe a partir de ahora un test con base de datos | `docs/conventions.md` → §Tests con base de datos |
| Config, coste medido y «no hay paso nuevo» | `docs/stack.md` → §Testing |
| Qué hace el paso 5 de `./init.sh` | `docs/verification.md` |

## Cumplimiento de la intención

- ✅ **«Ejecuto la suite entera y mi base tiene después exactamente lo mismo que antes»** →
  se cumple. Comprobado por el reviewer con **18 pasadas completas**: recuentos de tus
  tablas y valor de tus secuencias, idénticos (`diff` sin diferencias). Y no depende de que
  alguien lo compruebe a mano: lo automatiza el guardián 2 en
  [vitest.global-setup.ts:38](../../vitest.global-setup.ts#L38), verificado en rojo contra
  una base falsa. Lo que apareció en tu base durante la revisión (un producto y su foto) es
  **tuyo**, de tu prueba real de la F26, y sigue intacto.
- ✅ **«Si un test deja algo detrás, me entero por la suite, no meses después»** → se
  cumple. El reviewer lo provocó con un caso propio, en dos tablas que el implementer no
  había usado: la suite salió **roja con exit 1** nombrando ambas. Tests:
  [test-db.test.ts:143](../../src/lib/test-db.test.ts#L143) y
  [test-db.test.ts:157](../../src/lib/test-db.test.ts#L157).
- ✅ **«La suite sigue siendo igual de rápida y no me obliga a montar nada raro»** → se
  cumple. ~6,1 s → ~7,4 s (+1,3 s, de los que ~0,4 s son los 15 tests nuevos), y
  arrancar con las bases borradas cuesta ~1,2 s extra **una vez**. Cero pasos nuevos:
  `init.sh` no tiene ni una línea de diff.
- ✅ **«No quiero perder los tests que prueban de verdad contra una base de datos»** → se
  cumple. Ni un archivo de test existente tocado, ni un mock nuevo, mismo PostgreSQL real.
- ✅ **«No quiero que se borre nada de mi base»** → se cumple. El único código que abre tu
  base hace `select`; todo lo que escribe pasa antes por
  [`assertTestDatabase`](../../src/lib/test-db.ts#L72).

## Decisiones que se tomaron por ti

- **(delegado nº 1) Base APARTE, no «limpiar mejor».** La limpieza ya funcionaba cuando la
  suite iba bien; fallaba justo el día que un test se cae a la mitad y no llega a limpiar,
  que es el día que más basura genera. Con la base aparte, el peor caso es basura en una
  base que se tira sola. ADR-027 §Decisión 1.
- **(delegado, y esta importa) Una base POR WORKER, no una sola compartida.** Una sola base
  de test habría quitado la basura pero **no** el fallo intermitente. Con una por worker no
  hay dos archivos tocando la misma base a la vez. ADR-027 §Decisión 2.
- **(delegado nº 2) La garantía son dos guardianes automáticos**, registrados en el setup
  global —no en cada archivo—, más el muro del nombre de base. Nada depende de que el
  próximo que escriba un test se acuerde.
- **(añadido) `maxWorkers` queda fijado** en `vitest.config.ts`. Si alguien lo sube a mano,
  la suite falla con un mensaje que lo explica en vez de que dos workers compartan base en
  silencio.
- **(añadido) La foto lleva las secuencias, no solo los recuentos**, para cazar al test que
  inserta y borra después. «No toques mi base» es también eso.

## Qué NO se tocó / quedó fuera

- **El error 500 de `GET /api/movements`** cuando una cuenta desaparece mientras lista.
  Es el mecanismo del fallo intermitente y es un bug **de producción**, no solo de tests;
  hoy no te puede pasar porque nada borra cuentas en la app. El día que haya un borrado de
  cuentas, vuelve. Arreglo natural: leerlo todo en una transacción o con un `join` único.
- **La base `gastos_f26`** sigue en el contenedor, de la feature anterior. Se puede tirar
  con un `drop database gastos_f26`.
- **Sin Docker levantado**, la suite falla ruidosamente pero el primer renglón del error
  no dice «levanta el contenedor». No hay riesgo de falso verde; es un mensaje que mejorar.
- **Los filtros por `accountId`** que los tests antiguos usaban porque compartían base ya
  no hacen falta; quitarlos haría varias aserciones más fuertes. Limpieza de otra sesión.
