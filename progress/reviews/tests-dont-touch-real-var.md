# tests-dont-touch-real-var (F33) — review

**Veredicto:** CHANGES_REQUESTED

## Cambios requeridos

1. **[`vitest.global-setup.ts:74-82`](../../vitest.global-setup.ts#L74) — la red salta,
   pero NO pone la pasada en rojo: el proceso sale con código 0.**
   Medido por el reviewer el 2026-08-26, extremo a extremo y sin tocar un archivo suyo:
   se creó `var/__reviewer-probe.txt` (archivo del reviewer, ya borrado), un test lo
   reescribió con **los mismos bytes** —el caso exacto de la F33, solo la fecha— y el
   resultado fue:

   ```
   Test Files  1 passed (1)
   error during close Error: LA SUITE HA TOCADO TU CARPETA var/. ...
     - var/__reviewer-probe.txt: reescrito con el mismo contenido (cambió su fecha)
   EXIT=0
   ```

   El `throw` del teardown de `globalSetup` se reporta como *error during close* y
   **no cambia el código de salida** de `vitest run`. Como
   [`init.sh:343`](../../init.sh#L343) decide con `if eval "$TEST_CMD"`, `./init.sh`
   imprime `[OK] Todos los tests pasan` y termina en **verde** con la carpeta del
   humano tocada. Es decir: el día que un test vuelva a escribir en `var/`, la red
   escribe un párrafo que se pierde entre el ruido y **nadie se entera**, que es
   justo lo que la feature venía a impedir («registro, no parche»).

   Esto invalida tres afirmaciones que hoy están escritas como hechas:
   - [`progress/implementations/tests-dont-touch-real-var.md:10`](../implementations/tests-dont-touch-real-var.md#L10)
     («se pone roja si un solo archivo cambia») y su §Decisión nº 1
     («pone la pasada en rojo»).
   - [`docs/conventions.md` §Tests que tocan `var/`](../../docs/conventions.md)
     («la pone **roja**»).
   - El ADR-029 de [`docs/architecture.md`](../../docs/architecture.md), en los mismos
     términos.

   Qué hace falta: que una diferencia en `var/` **haga fallar la pasada de verdad**
   (código de salida ≠ 0), y **un test que lo demuestre** — no basta con probar
   `describeVarDifferences` en aislamiento, que es lo único que hoy está cubierto.
   Aviso para quien lo arregle: el mismo teardown lleva el guardián de la base de
   datos de la F27 ([`vitest.global-setup.ts:50`](../../vitest.global-setup.ts#L50) y
   [`:66`](../../vitest.global-setup.ts#L66)), así que **hoy tampoco tumba la pasada**;
   el arreglo debería cubrir los tres avisos, no solo el de `var/`.

## Comprobado sin hallazgos

- **El test no se ha degradado.** Mutación repetida por el reviewer: comentada la
  línea [`src/app.ts:96`](../../src/app.ts#L96) (`app.register(tradeRepublicRoutes…)`),
  `trade-republic.routes.test.ts` › «is registered in the real app» se pone **rojo**
  (`expected false to be true`, línea 125). `src/app.ts` restaurado y verificado por
  MD5 (`04730414a7d411e69e9b14f9c8450cb0`) y por `git diff` vacío. Sigue siendo
  `buildApp()`, no una app montada en el test.
- **La red detecta lo que dice detectar, incluido el caso «solo la fecha»**, y
  **no imprime contenido**: el mensaje del probe llevaba la ruta y qué se movió, ni un
  byte del archivo. Los 10 tests de [`src/lib/test-var.test.ts`](../../src/lib/test-var.test.ts)
  son de verdad (comparan cadenas concretas, tempdir real, datos inventados), no
  «no lanza excepción».
- **El bug está arreglado.** Cuatro pasadas completas de la suite: `find var -newermt`
  vacío las cuatro veces. Ni un archivo de `var/` cambia.
- **Decisión nº 2 comprobada, no supuesta.** Repasados los seis módulos con valor por
  defecto a `var/` y los usos de `buildApp()` en tests: ninguno más ejerce una ruta que
  lea o escriba ahí (los de `import/` y `myinvestor.import` usan `buildApp()` pero
  inyectan `rawCopyBaseDir` con `mkdtemp`; `import.routes.test.ts` monta un Fastify
  pelado). La tabla del informe omite el defecto de
  [`import.routes.ts:52`](../../src/modules/import/import.routes.ts#L52), que también
  apunta a `var/drive-read/`, pero no es alcanzable desde ningún test: no es hallazgo.
- **Nada aflojado.** `src/no-real-data.test.ts` no lo tocó esta feature (sus cambios en
  el árbol son de la F34, mapeados en su propio informe); la red no está desactivada ni
  filtrada.
- **F31 y `var/` intactos.** Ningún archivo de la F31 en la tabla de la feature; cero
  escrituras y cero borrados en `var/` (`var/parsed/trade-republic/2026/products.json`
  sigue como estaba, decisión nº 3 dejada al humano, que es lo correcto).
- **Decisión nº 4 dicha, no tapada.** El informe explica el mecanismo del guardián y
  para en vez de aflojarlo; de ahí salió la F34.
- Arquitectura y convenciones: `src/lib/test-var.ts` es una utilidad pura de `lib/`
  sin dependencias de capa superior, en inglés y con el estilo de la casa.
- CHECKPOINTS C1-C5.

## Nota para el leader (fuera del alcance de esta feature)

El criterio «dos ejecuciones seguidas de `./init.sh` dan el mismo resultado» **hoy no se
cumple**, y **no por culpa de la F33**: en cuatro pasadas completas seguidas el reviewer
obtuvo 950/950 verde, luego 1 fallo, luego 3, luego 3, siempre en
`src/no-real-data.test.ts` (tests de la **F34**, incluido el falso positivo de los 52
avisos que la F34 venía a eliminar). En aislamiento ese archivo pasa 48/48 tres veces
seguidas, así que hay interferencia entre tests o dependencia del orden. Es material de
la revisión de la F34; se anota aquí porque el criterio «`./init.sh` en verde» de la F33
depende de ella y **no puede darse por cerrado mientras el guardián sea intermitente**.

---

# Segunda review — 2026-08-29 (sobre el estado tras la corrección)

**Veredicto:** APPROVED

Comprobado desde cero: `acceptance` ↔ tests, las cuatro decisiones delegadas,
arquitectura y convenciones, verificación y CHECKPOINTS C1-C5 y C8. Sin hallazgos.

## Comprobado sin hallazgos

- **Medida extremo a extremo, hecha por este reviewer, no leída del informe.**
  Probe propio `var/__reviewer2-probe.txt` (creado por mí) + un test temporal que lo
  reescribe **con los mismos bytes** (el caso exacto del bug: solo la fecha):

  ```
  Test Files  52 passed (52)
       Tests  955 passed (955)
  LA SUITE HA TOCADO ALGO TUYO. La pasada se marca como FALLIDA.
  LA SUITE HA TOCADO TU CARPETA var/. ... Diferencias:
    - var/__reviewer2-probe.txt: reescrito con el mismo contenido (cambió su fecha)
  [FAIL]  Hay tests rotos
  [FAIL]  Entorno NO está listo.
  EXIT=1
  ```

  Es decir: **955 tests verdes y la pasada en rojo**, que es exactamente lo que en la
  primera vuelta salía con `EXIT=0`. El mensaje lleva **la ruta y nada más**: ni un
  byte del archivo.
- **El otro sentido, dos veces:** sin probe, `./init.sh` → **954/954, `EXIT=0`**,
  `[OK] Entorno listo`, y una segunda pasada seguida da **lo mismo** (954/954,
  `EXIT=0`). El criterio «dos ejecuciones seguidas dan el mismo resultado», que en la
  primera vuelta no se cumplía por la intermitencia de la F34, hoy se cumple.
- **`var/` quedó EXACTAMENTE como estaba.** Huella tomada antes (64 archivos, ruta,
  tamaño y `mtime` con `%T@`, más `md5sum` de cada uno) y comparada al final de todo:
  `diff` vacío en las dos listas. Probe y test temporal borrados; `git status` sin
  rastro y `node_modules/` sin ninguna carpeta `.guard-e2e-*`.
- **El test e2e prueba los DOS sentidos, no solo el fácil.**
  [`src/lib/test-guard.e2e.test.ts:115`](../../src/lib/test-guard.e2e.test.ts#L115)
  (tocado → `status` ≠ 0 con `1 passed` en la salida) y
  [`:126`](../../src/lib/test-guard.e2e.test.ts#L126) (intacto → `status` **es 0** y
  el banner **no** aparece). Un guardián que fallara siempre no pasaría el segundo.
  Corre en proceso hijo, sobre una carpeta `watched` inventada dentro de un
  `mkdtemp` en `node_modules/` — **nunca `var/`** —, con las variables `VITEST*`
  filtradas y borrado en `afterEach`.
- **El arreglo de la F27, verificado línea a línea.** `git diff vitest.global-setup.ts`:
  sus dos avisos cambian **solo** `throw new Error(` → `problems.push(`; el texto de
  los dos mensajes es **idéntico palabra por palabra**. `src/lib/test-db.ts` **no
  aparece en el diff**: intacto. Los tres avisos comparten hoy una única lista y una
  única llamada a [`failRun`](../../vitest.global-setup.ts#L99), así que el arreglo
  medido para `var/` es literalmente el mismo camino de código que el de la base.
- **El test de Trade Republic no se ha degradado.** Mutación repetida por mí:
  comentada [`src/app.ts:96`](../../src/app.ts#L96), el test «is registered in the
  real app» se pone **rojo** (`AssertionError: expected false to be true`, 1 failed |
  5 passed). `src/app.ts` restaurado y verificado por MD5
  (`04730414a7d411e69e9b14f9c8450cb0`) y `git diff` vacío. Sigue siendo `buildApp()`.
- **La red detecta el caso «solo la fecha» y no imprime contenido.** Los 10 tests de
  [`src/lib/test-var.test.ts`](../../src/lib/test-var.test.ts) comparan cadenas
  concretas sobre un tempdir con datos inventados, incluidos «reescrito con los
  mismos bytes» y «no nombra su contenido»; confirmado además en mi propia medida.
- **Nada aflojado.** Esta feature no toca `src/no-real-data.test.ts` (sus cambios en
  el árbol son de la F34, mapeados en el informe de la F34), ni filtra ni desactiva
  la red para que sus propios tests pasen: el guardián está activo durante las tres
  pasadas que he hecho.
- **Las cuatro decisiones delegadas, razonadas por escrito** en
  [`progress/implementations/tests-dont-touch-real-var.md`](../implementations/tests-dont-touch-real-var.md):
  nº 1 (arreglo + red, con el coste medido: 10,2 ms × 2 sobre ~8 s, nada que arrancar),
  nº 2 (tabla de los seis módulos leyendo sus tests, no suponiendo; contrastada con el
  barrido de `buildApp()`), nº 3 (`var/parsed/trade-republic/2026/products.json` **no
  se toca**, la decisión queda para el humano) y nº 4 (el guardián del ADR-017 no
  volvía solo a verde, dicho y no tapado; de ahí salió la F34, hoy cerrada y con el
  guardián en verde).
- **Textos que mentían, corregidos.** `docs/conventions.md` §Tests que tocan `var/` y
  el ADR-029 de `docs/architecture.md` definen ahora «roja» como código de salida ≠ 0
  y añaden la regla «un guardián de final de suite no se escribe con `throw`». El
  informe marca lo viejo con ⛔ en vez de borrarlo.
- **Arquitectura y convenciones:** `src/lib/test-var.ts` y `src/lib/test-guard.ts` son
  utilidades puras de `lib/` sin dependencias de capa superior, en inglés, sin
  `console.log` (el informe va al descriptor 2, que es justamente el punto). `tsc`
  limpio dentro de `./init.sh`.
- **F31 intacta** y ni una escritura ni un borrado en `var/`.
- CHECKPOINTS C1-C5 y C8. C6 no aplica (no toca el contrato de la API); C7 no aplica
  (`sdd: false`).

Resumen de cierre: [`progress/summaries/tests-dont-touch-real-var.md`](../summaries/tests-dont-touch-real-var.md).
