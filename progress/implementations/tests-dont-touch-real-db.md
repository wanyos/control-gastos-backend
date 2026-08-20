# F27 `tests-dont-touch-real-db` — implementación

> Feature **sin spec** (`sdd: false`): manda su `acceptance` de 10 criterios en
> [`feature_list.json`](../../feature_list.json). Las dos decisiones delegadas están
> resueltas por escrito abajo (§1 y §2), antes del mapeo criterio→test.
>
> 🔒 Aquí solo hay **recuentos y forma**; ni un dato suyo (ADR-017).

---

## Estado de su base de datos: idéntico, comprobado 22 veces

| Momento | cuentas | movimientos | productos | valoraciones | fotos |
|---|---|---|---|---|---|
| **Antes** de tocar nada | 4 | 455 | 0 | 0 | 0 |
| Tras **22 pasadas** completas de la suite | 4 | 455 | 0 | 0 | 0 |

Y no solo los recuentos: la comparación se hizo sobre **recuentos + el último valor de
las 6 secuencias** (`Account_id_seq`, `Movement_id_seq`, …), volcados a fichero antes y
después y comparados con `diff`. Salida: **idénticos**. Eso significa que la suite no
solo no dejó filas: **no insertó ni una sola** que luego borrase.

> La prueba real de la F26 sigue sin hacerse, así que sigue habiendo 0 productos y 0
> fotos. Cuando él la haga aparecerán 1 producto y 1 foto **suyos** y el número de
> arriba cambia legítimamente: lo que hay que volver a comprobar entonces es que la
> suite **no lo mueve**, no que siga habiendo cero.

---

## 1. Decisión delegada nº 1 — base APARTE, no «limpiar mejor»

**Qué se ha hecho.** Cada worker de vitest corre contra **su propia base desechable**
`gastos_test_<n>`, en el **mismo contenedor de PostgreSQL** que ya tenías levantado.
Se clonan de una plantilla migrada (`gastos_test_template`) y se crean solas.

**Por qué esa y no la otra.** Limpiar lo que cada test crea **ya estaba hecho y ya
funcionaba**: lo comprobé antes de tocar nada, ejecutando la suite entera contra una
base vacía — dejó **cero filas**. El problema no es que los tests no limpien, es
**cuándo dejan de limpiar**: un test que se cae a mitad no llega a su `afterEach`, y
un `Ctrl+C` o un worker que muere tampoco. Es decir, la limpieza falla exactamente el
día que la suite va mal, que es el día que más basura genera. Eso encaja con lo que
apareció en tu base (15 cuentas, 5 movimientos, 140 productos en una tarde) y con que
la review de la F26 viera **4 rojos en 13 pasadas**. Una garantía que se cae sola
cuando peor viene no es una garantía. Con la base aparte, el peor caso posible es que
se quede basura **en una base desechable que se tira en la siguiente pasada**.

Y hay un segundo motivo, que es la parte que no era solo higiene: **una base por
worker, no una sola base de test compartida**. La razón está en §3 (el flake).

**Qué te cuesta a ti, en claro:**

| Pregunta | Respuesta |
|---|---|
| ¿Tienes que arrancar algo más? | **No.** Sigue siendo `docker compose up -d` y ya. Las bases de prueba se crean solas la primera vez que corres la suite. |
| ¿Cambia `./init.sh`? | **No.** Ni una línea. Sigue siendo `./init.sh` y hace lo mismo. |
| ¿Cambia `pnpm test`? | **No.** Mismo comando. |
| ¿Y si añades una migración? | Nada que hacer: la plantilla se remigra sola en la siguiente pasada (~1,7 s **ese día**) y las bases de worker se reclonan de ella. |
| ¿Cuánto se alarga la suite? | De **~6,1 s a ~7,4 s** (+1,3 s), y de esos **~0,4 s son los 15 tests nuevos** de esta feature. El aislamiento en sí cuesta **~0,9 s**. |
| ¿Y la primera vez, o tras un clon nuevo? | **~2 s más** (crear y migrar la plantilla). Medido: 9,7 s con las bases borradas a propósito, 8,5 s la siguiente. |
| ¿Ocupa espacio? | 9 bases vacías con el esquema (plantilla + 8 workers). Son tablas vacías. |

**Cómo es de barato:** clonar una base con `CREATE DATABASE … TEMPLATE` cuesta **47 ms**
medidos. Migrar con `prisma migrate deploy` cuesta 1,7 s, así que **solo se hace cuando
el historial de la plantilla no coincide** con `prisma/migrations/`; una base que ya
está limpia y al día **ni se toca**.

---

## 2. Decisión delegada nº 2 — qué GARANTIZA que no vuelva

Tres capas, ninguna de las cuales depende de que el próximo se acuerde de nada:

**Capa 1 — no puede llegar a tu base.** `vitest.setup.ts` reescribe `DATABASE_URL`
apuntando a la base desechable del worker **antes de que el archivo de test se
importe**. Como todos los tests obtienen el cliente igual (`buildApp()` → `app.prisma`),
un test nuevo está en la base correcta **sin hacer nada** — y sin poder elegir mal.
Además, toda función que escribe pasa por `assertTestDatabase`, que **revienta** si el
nombre de la base no empieza por `gastos_test_`: un `.env` equivocado o una línea
copiada no pueden truncar `gastos`.

**Capa 2 — la fila que se queda pone el archivo en ROJO.** Un `afterAll` registrado en
el setup **global** (no en cada archivo: por eso no depende de nadie) cuenta las filas
al terminar **cada archivo de test**. Si queda una, el archivo falla nombrando tabla y
cantidad, y la base se vacía para que el archivo siguiente no herede el problema.

**Capa 3 — si tu base cambia, la pasada entera se pone en ROJO.** El `globalSetup` le
hace una foto **de solo lectura** a `gastos` antes de la suite y la compara al acabar.
La foto lleva los recuentos **y las secuencias**, así que caza incluso al test que
inserta y borra después. De tu base **no se borra nunca nada**: el único código que la
abre hace `select`.

### Demostrado en rojo, no prometido

| Guardián | Cómo se demuestra | Resultado |
|---|---|---|
| Fila dejada atrás (función) | `test-db.test.ts` **crea una fila a propósito** y comprueba que el guardián la reporta como `[{table:'Account',rows:1}]` / `Account: 1`; luego la borra | ✔ (2 tests: una tabla y dos tablas) |
| Fila dejada atrás (pasada real) | Archivo de prueba temporal que crea una cuenta y **nunca la borra** → `pnpm test` | **RED**, `exit 1`: «Este archivo de test ha dejado filas sin borrar (Account: 1)» |
| Tu base cambió (función) | `test-db.test.ts` inserta y **borra** una fila y comprueba que la diferencia se ve igual, por la secuencia | ✔ («el contador pasó de … a …, aunque la haya borrado después») |
| Tu base cambió (pasada real) | Base **falsa** que hace de «suya» (`gastos_fake_human`, clonada y borrada después — **tu base no se tocó**) + un test que escribe en ella a propósito | **RED**, `exit 1`: «TU BASE DE DATOS HA CAMBIADO DURANTE LA SUITE» con las dos diferencias |
| El cableado sigue puesto | 3 tests leen `vitest.config.ts`, `vitest.setup.ts` y `vitest.global-setup.ts` y exigen el `setupFiles`, el `globalSetup`, el `afterAll` y el `throw` | ✔ — borrar el guardián «ordenando» pone la suite roja |

---

## 3. El flake del 500: reproducido, explicado y desaparecido

El reviewer de la F26 acotó los 4 rojos de 13 a «concurrencia de tests sobre la base
viva». **Es exactamente eso, y ahora está el mecanismo por escrito:**

`GET /api/movements` lista los movimientos con `include: { account: true }`, y
`account` es una relación **obligatoria**. Si **otro archivo de test** borra su cuenta
mientras esa consulta está en marcha, Prisma se queda con una fila de movimiento cuya
cuenta ya no existe, no puede componer el objeto y la petición sale **500**.

Comprobado en las dos direcciones:

- **Antes (base compartida).** Sembré 455 movimientos en una base de test compartida
  —el mismo volumen que tiene la tuya— y la suite dio **2 rojos en 14 pasadas**, en
  `movements.test.ts` y con el mismo 500. Con la base vacía, 8/8 verdes: **el volumen
  de tus datos ensanchaba la ventana**, por eso te pasaba a ti y no en vacío.
- **El mecanismo, aislado.** Una prueba dirigida (400 movimientos, y en cada vuelta un
  `GET /api/movements` **a la vez** que el borrado de otra cuenta) da **7 respuestas 500
  de 40**. No es una teoría: es reproducible a voluntad.
- **Después.** Dentro de un worker vitest ejecuta los archivos **uno detrás de otro**,
  así que con una base por worker **no hay dos archivos tocando la misma base a la
  vez**: la carrera es imposible por construcción. **22 pasadas completas seguidas,
  22 verdes** (831 tests). Con un 30 % de rojos como el que veía la review, 22 verdes
  por casualidad son ~1 entre 10 000.

Una sola base de test compartida habría quitado la basura de tu base **pero no el
flake**. Por eso son 8 bases y no una.

---

## Archivos modificados / creados

**Creados**
- [`src/lib/test-db.ts`](../../src/lib/test-db.ts) — toda la fontanería: nombres de
  base, clonado desde plantilla, `assertTestDatabase`, `findLeftoverRows`,
  `truncateAll`, `snapshotDatabase`, `describeSnapshotDifferences`. No lee **ninguna**
  variable de entorno: `src/config/env.ts` sigue siendo el único de `src/` que lo hace.
- [`src/lib/test-db.test.ts`](../../src/lib/test-db.test.ts) — 15 tests: los guardianes
  demostrados en rojo y el cableado.
- [`vitest.global-setup.ts`](../../vitest.global-setup.ts) — una vez por pasada: prepara
  las bases y compara la foto de la tuya antes/después.
- [`vitest.setup.ts`](../../vitest.setup.ts) — por archivo: redirige `DATABASE_URL` y
  registra el `afterAll` que caza la fila olvidada.

**Modificados**
- [`vitest.config.ts`](../../vitest.config.ts) — `setupFiles` + `globalSetup` +
  `maxWorkers` fijado al número de bases preparadas.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — los dos archivos
  nuevos entran en el árbol declarado.
- [`docs/architecture.md`](../../docs/architecture.md) — **ADR-027** (nuevo).
- [`docs/conventions.md`](../../docs/conventions.md) — nueva sección **§Tests con base
  de datos**: cómo se escribe a partir de ahora un test que necesita base.
- [`docs/stack.md`](../../docs/stack.md) — §Testing (config, coste medido, «no hay paso
  nuevo para arrancar») y la fila de `DATABASE_URL`.
- [`docs/verification.md`](../../docs/verification.md) — nivel 2 y el paso 5 de
  `./init.sh`.
- `feature_list.json` — F27 a `in_progress`.

**Ningún archivo de test existente ha tenido que cambiar.** Los 46 archivos anteriores
siguen probando lo mismo, contra un PostgreSQL de verdad, sin una línea tocada.

---

## Mapeo criterio → test / comprobación

| # | Criterio (resumido) | Dónde se comprueba |
|---|---|---|
| 1 | La suite deja su base **exactamente** como estaba (4/455/0/0/0), comprobado antes y después | **Comprobación reproducible**: volcado de recuentos + secuencias antes y después de 22 pasadas, `diff` → idénticos (tabla de arriba). **Y automatizado en cada pasada**: `vitest.global-setup.ts` compara la foto y pone la pasada en rojo si cambia; demostrado rojo con `gastos_fake_human` |
| 2 | Decisión nº 1 por escrito, con el coste para él | §1 de este informe (tabla «qué te cuesta a ti») + ADR-027 §Decisión 1-3 y §Consecuencias |
| 3 | Decisión nº 2 por escrito; guardián **rojo** ante una fila dejada atrás, demostrado con un test que deja una a propósito | §2 + tabla «demostrado en rojo». Tests: `reports the table and the number of rows a test forgot`, `counts every application table, not a hand-written list`, `sees an insert that was cleaned up, through the sequence`, `sees nothing when nothing happens`, `says which table grew and by how much` |
| 4 | Los tests de base **siguen** contra una base de datos de verdad, sin simulaciones | PostgreSQL 17 real, mismo contenedor, mismo `buildApp()`/`app.prisma`: **ni un mock nuevo**. Test `points DATABASE_URL at a gastos_test_* database` (es una base real, solo que otra) y el hecho de que ningún test existente cambió |
| 5 | **Nada** de su base se borra para dejar la suite limpia | `assertTestDatabase` cierra la puerta a `truncateAll`/`findLeftoverRows` fuera de `gastos_test_*`; tests `refuses to write to a database that is not a test one` (comprueba también que `truncateAll` **rechaza**) y `does not point at the database of .env (the human one)`. En `gastos` el único código que entra hace `select` (`snapshotDatabase`) |
| 6 | Arrancar no se complica; si hace falta un paso, va en `./init.sh` y `docs/stack.md` | **No hace falta ninguno**: `init.sh` **no se ha tocado** (queda dicho en `docs/stack.md` §Testing y en el ADR-027). Verificado ejecutando `./init.sh` sin ningún paso previo distinto de `docker compose up -d`, y borrando las 9 bases para simular un clon nuevo: se recrean solas |
| 7 | La suite no se vuelve significativamente más lenta; si cuesta, decir cuánto | **~6,1 s → ~7,4 s** (+1,3 s, de los que ~0,4 s son los tests nuevos). Cold start ~2 s extra, una vez. Medido en 22 pasadas, tabla en §1 |
| 8 | Documentado en `docs/conventions.md` y en el ADR que toque | `docs/conventions.md` §**Tests con base de datos** (8 reglas) + **ADR-027** en `docs/architecture.md`. El mensaje de error del guardián **apunta a esa sección por su nombre** |
| 9 | Ni un dato real en tests ni fixtures (ADR-017) | `src/no-real-data.test.ts` verde en las 22 pasadas. Los IBAN de los tests nuevos salen de `syntheticIban()`; los importes son inventados; los recuentos (4/455) son recuentos, no datos |
| 10 | Cada criterio con test o comprobación reproducible, mapeado aquí; `./init.sh` verde | Esta tabla. `./init.sh`: ver abajo — **tipos y 831/831 tests en verde**, con un `[FAIL]` de estado que **no es de esta feature** |

---

## Último `./init.sh`

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────────────────────────────────
 Test Files  47 passed (47)
      Tests  831 passed (831)   (816 antes, +15)
   Duration  7.25s
[OK]    Todos los tests pasan
── 3. Validando feature_list.json ──────────────────────
[FAIL]  Hay 2 features en in_progress (máximo 1)
```

⚠️ **El único rojo no es de esta feature y no lo puedo arreglar yo.** La **F26**
`savings-account-as-product` sigue en `in_progress` en `feature_list.json` aunque su
commit (`e594a7a`) diga «aprobada por el reviewer»: le falta el cierre (pasarla a
`done` y su línea en `history.md`). Al poner la F27 en `in_progress`, como manda el
protocolo, hay dos a la vez y el validador de estado protesta. Regla de una feature por
sesión: **no la he tocado**. En cuanto la F26 se cierre, `./init.sh` queda verde entero.

`pnpm run lint` (oxlint): limpio. `prettier --check`: limpio en todo lo que he tocado.

---

## Sugerencias fuera de scope (NO aplicadas)

1. **`GET /api/movements` devuelve 500 si una cuenta desaparece mientras lista** — es el
   mecanismo del flake, y **es un bug de producción**, no solo de tests: 7 de 40 en la
   prueba dirigida. Hoy no puede pasar en tu app (no hay endpoint que borre cuentas y
   solo escribe el importador), por eso no lo he arreglado. El día que haya un borrado
   de cuentas, esto vuelve. Arreglo natural: leer los movimientos y sus cuentas en **una
   transacción** o con un `join` único.
2. **La base `gastos_f26` sigue en el contenedor**, como avisó la review de la F26.
   Borrarla al cerrar aquella feature: `drop database gastos_f26`.
3. **`src/modules/myinvestor/myinvestor.product.parser.test.ts` no pasa
   `prettier --check`** y no lo he tocado (no es mío). Un `pnpm run format` lo arregla.
4. **`vitest.config.ts` y los dos archivos de pegamento no los mira `tsc`**
   (`tsconfig.json` solo incluye `src/`). Por eso los he dejado finos a propósito y la
   lógica vive en `src/lib/test-db.ts`, que sí se tipa. Si algún día crecen, tocaría un
   `tsconfig.test.json`.
5. **Los tests siguen filtrando por sus propias filas** (`filter(m => m.accountId === …)`)
   porque compartían base. Ahora ya no hace falta dentro de un archivo, y sin ese filtro
   varias aserciones serían más fuertes. Es una limpieza de otra sesión: tocarlo aquí
   habría mezclado dos cambios en la misma pasada.
