# tests-dont-touch-real-var (F33) — implementación

> Feature **sin spec** (`sdd: false`): se trabaja contra el `intent` y el
> `acceptance` de `feature_list.json`.

## Resumen en una línea

El test que comprobaba la ruta de Trade Republic **invocándola** sobre la app real
ya no la invoca (la comprueba con `hasRoute`, como sus cuatro bancos hermanos), y a
partir de ahora la suite **fotografía `var/` antes y después** y se pone roja si un
solo archivo cambia. Queda **un fallo abierto** que no es este bug y que **no se ha
tapado**: ver la decisión nº 4.

> ⛔ **Corregido en §Segunda pasada (2026-08-26)**: en la primera versión «se pone
> roja» era **falso** — el aviso se imprimía y la pasada seguía saliendo con código
> 0—, y lo encontró la review. Desde la segunda pasada es cierto, y está medido de
> punta a punta.

## Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| [`src/modules/trade-republic/trade-republic.routes.test.ts`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L113) | El test «is registered in the real app» deja de hacer `inject` del POST y afirma con `app.hasRoute(...)`. Sigue siendo `buildApp()` |
| [`src/lib/test-var.ts`](../../src/lib/test-var.ts) | **Nuevo.** `snapshotVarDir` (foto de solo lectura: hash, tamaño y fecha de cada archivo) y `describeVarDifferences` |
| [`src/lib/test-var.test.ts`](../../src/lib/test-var.test.ts) | **Nuevo.** 10 tests del mecanismo sobre un `var/` falso en un tempdir |
| [`vitest.global-setup.ts`](../../vitest.global-setup.ts) | Toma la foto antes de la suite y compara al terminar; rojo con las rutas si algo se movió |
| [`docs/architecture.md`](../../docs/architecture.md) | **ADR-029**, añadido al final de la lista de ADR |
| [`docs/conventions.md`](../../docs/conventions.md) | Sección nueva §Tests que tocan `var/` |
| [`progress/current.md`](../current.md) | Sección de la feature en curso |

No se ha tocado nada de la F31, ni el parser de Trade Republic, ni
`src/no-real-data.test.ts`, ni `feature_list.json`, ni un solo archivo de `var/`.

## Las cuatro decisiones delegadas

### 1. ¿Basta con inyectar directorios, o hace falta además una red? → **Las dos cosas**

**El arreglo:** ni siquiera hace falta inyectar. Los otros cuatro bancos ya resuelven
este mismo test con `app.hasRoute({ method, url })` sobre `buildApp()`, y su
comentario dice exactamente por qué: *«the real app would read `var/drive-read/` of
this machine, which holds real bank data»*. Trade Republic era **el único** que se
había salido del patrón. Se le aplica el de la casa: misma app real, misma garantía
—es el cableado de `src/app.ts` lo que se comprueba, no una app montada dentro del
test— y cero ejecución del handler. Inyectarle tempdirs también habría funcionado,
pero dejaría cinco bancos escritos de dos maneras y un handler ejecutándose sin que
nadie mire su respuesta.

Comprobado que la garantía sigue viva con una **mutación**: quitando la línea 96 de
`src/app.ts` (`app.register(tradeRepublicRoutes, …)`), el test se pone **rojo**.
`src/app.ts` quedó restaurado byte a byte.

**La red: sí, y por tres razones.**

1. El humano pidió **registro, no parche**, y este proyecto ya tiene el precedente
   por duplicado: la F14 puso un guardián para que sus datos no acaben versionados y
   la F27 uno para que la suite no escriba en su base. Un tercero para sus archivos
   no es simetría decorativa: es la misma lección aprendida por tercera vez.
2. **El agujero no era de un test, era de una clase de tests.** El patrón «valor por
   defecto que apunta a `var/` + `buildApp()` sin inyectar» está disponible en los
   cinco módulos de banco y en el de ingesta. Arreglar el caso de hoy no impide el de
   mañana; la foto sí.
3. **Este bug fue invisible durante meses** porque en una máquina limpia `var/` no
   existe. Ninguna lectura del código lo iba a cazar: hacía falta algo que mirase el
   efecto, no el código.

**Cómo es la red** (ADR-029): `vitest.global-setup.ts` fotografía `var/` (hash
SHA-256, tamaño y `mtime` de cada archivo) antes de la suite y otra vez al terminar.
Cualquier diferencia —contenido, tamaño o **solo la fecha**— pone la pasada en rojo
(⛔ **cómo se consigue eso de verdad**: §Segunda pasada; con un `throw` **no** se
conseguía) nombrando la ruta y qué se movió, **nunca lo que el archivo dice** (misma regla de
mensajes que el guardián del ADR-017). Es la misma forma que el ADR-027 le dio a la
base de datos, y por la misma razón: no depende de que nadie se acuerde.

**Lo que le cuesta al humano:** nada que arrancar y ningún paso nuevo. `var/` pesa
810 KB en 64 archivos; hacer la foto cuesta **10,2 ms medidos**, dos veces por
pasada, sobre una suite de ~8 s (**~0,25 %**). En una máquina sin `var/` la foto sale
vacía y no hay nada que comparar. `./init.sh` no cambia.

**Lo que la red NO cubre, dicho a las claras:** vigila **escrituras**, no lecturas.
Un test que *lea* sus archivos y afirme sobre ellos no cambia ninguna fecha y esta
red no lo ve. De eso sigue encargándose el guardián del ADR-017 (que un dato suyo no
acabe versionado). Queda escrito así en el ADR y en `conventions.md`, no solo aquí.

### 2. ¿Hay más tests con el mismo agujero? → **No. Comprobado leyendo sus tests, uno a uno**

| Módulo | Valor por defecto a `var/` | ¿Su test ejerce la ruta sobre la app real? | Veredicto |
|---|---|---|---|
| `trade-republic.routes.ts:39` | Sí | **Sí** — `inject` del POST (línea 113) | **El bug.** Arreglado |
| `bankinter.routes.ts:33-34` | Sí | No — su test solo usa `buildTestApp()` con tempdirs; no llega a usar `buildApp()` | Limpio |
| `myinvestor.routes.ts:34-35` | Sí | No — `hasRoute` (línea 177), con el comentario explicando el porqué | Limpio |
| `ingestion.routes.ts:32` | Sí | No — `buildApp()` solo para los 404 y `hasRoute` (línea 139); el POST va contra un doble de Drive | Limpio |
| `n26.routes.test.ts:140` | Mismo patrón | No — `hasRoute` | Limpio |
| `openbank.routes.test.ts:159` | Mismo patrón | No — `hasRoute` | Limpio |

Barrido completo de los **25 usos de `buildApp()`** de la suite: ninguno más ejerce
una ruta que lea o escriba en `var/`. Y la prueba empírica, que es la que vale: tras
el arreglo, **dos `./init.sh` completos seguidos no cambian la fecha de ni un archivo
de `var/`** (`find var -newermt <hora de arranque>` vacío las dos veces), con la red
activa y callada.

### 3. ¿Qué se hace con `var/parsed/trade-republic/2026/products.json`? → **NO SE TOCA. Lo decide él**

No se ha borrado ni modificado nada de `var/`. Y la recomendación es **no borrarlo**:

- Su **contenido es legítimo**: es exactamente el volcado que produce
  `POST /api/parser/trade-republic` sobre sus archivos reales (25 productos, 1
  ignorado), el mismo que tendría si pulsara el botón él. Lo que la suite le cambió
  fue la **fecha**, no la verdad.
- **Borrarlo no arregla nada:** la próxima vez que él parsee Trade Republic el
  archivo vuelve idéntico —y con él vuelve el fallo de la decisión nº 4—. Borrar
  sería confundir el síntoma con la causa.

Queda dicho para que decida él, que es de quien es el archivo.

### 4. ¿Vuelve solo a verde el guardián del ADR-017? → **NO. Y no se ha tapado**

`./init.sh` sigue con **un fallo**, el mismo antes y después del arreglo:
`src/no-real-data.test.ts` › «copies no telling phrase of the local captures», 52
avisos (26 líneas × la ventana de 2). **Ni una línea del guardián se ha tocado**: ni
un `no-real-data-ok`, ni una ruta en la lista de permitidas, ni una palabra en sus
listas.

**Por qué no vuelve solo, con el mecanismo exacto:**

- Los 52 avisos salen de **un único trigrama**: las tres palabras que quedan del
  nombre del archivo cuando el guardián tira los dígitos — `cuenta`, `remunerada` y
  `json`, seguidas —. (Verificado reproduciendo su lógica sobre las dos partes; aquí
  no se escriben seguidas a propósito, para no añadir un aviso más.)
- Ese trigrama entra en el material de comparación desde los **nombres de archivo**
  que el volcado guarda en su campo `file` (`cuenta-remunerada-AAAA-MM-DD.json`).
  `capturePhraseSources` mete cada valor de un `.json` de `var/parsed/` en el saco de
  «lo suyo», y un nombre de archivo es un valor como cualquier otro.
- Y el volcado **sigue en disco** (decisión nº 3): arreglar el test impide que se
  vuelva a escribir, no deshace lo escrito.

**Y aquí está lo importante, que es un problema DISTINTO:** ese nombre de archivo no
es un dato financiero suyo — **es una convención que publicamos nosotros**. La
plantilla publicada (`docs/plantillas/`, la del banco, con extensión `.json`) lleva
ese mismo nombre y el documento del banco le pide que nombre así sus archivos. Por eso los «infractores»
son nuestros propios textos: `docs/api-contract.md`, tres archivos de test cuyos
datos son sintéticos («Cuenta Sintetica Remunerada»), el `decisions.md` de la F20,
varios resúmenes y `history.md`. **Ninguno contiene un dato suyo.**

Consecuencia que sobrevive a esta feature: **cualquier pasada real del parser de
Trade Republic —la suya, hecha a mano— pone la suite roja igual**. La F33 lo ha
destapado, no causado.

**Las dos salidas, ninguna aplicada** (son otra feature, y la decisión es del humano):

- **(a)** Renombrar la convención sintética para que deje de parecerse a la real, que
  es lo que el `intent` de esta feature anticipaba. Toca ~19 sitios versionados,
  incluida la **plantilla publicada** y documentos históricos: no es un cambio de
  fixture, es un cambio de convención documentada.
- **(b)** Enseñar al guardián que un valor del volcado que es un **nombre de archivo
  con la forma que nosotros publicamos** no es una frase de su extracto. Eso es tocar
  el guardián, así que **no se hace aquí**: en esta sesión el guardián es el que ha
  destapado el problema y la orden era no aflojarlo.

## Mapeo criterio → test (`docs/verification.md`)

| Criterio de `acceptance` | Cómo queda demostrado |
|---|---|
| Ningún archivo de `var/` cambia al pasar la suite, **con test** | `vitest.global-setup.ts` (foto antes/después) + los 10 tests de [`src/lib/test-var.test.ts`](../../src/lib/test-var.test.ts): archivo creado, contenido cambiado, reescrito con los mismos bytes, borrado, nada movido, `var/` inexistente y «no nombra su contenido». Empírico: dos `./init.sh` y `find var -newermt` vacío |
| Dos ejecuciones seguidas de `./init.sh` dan el mismo resultado | Ejecutado dos veces: **941 tests, el mismo y único fallo** las dos veces (el de la decisión nº 4). Antes del arreglo, la segunda pasada tenía un fallo que la primera no |
| El test de la línea 113 **sigue** comprobando el registro en la app real | `trade-republic.routes.test.ts:113` — `buildApp()` + `app.ready()` + `hasRoute`. Mutación: quitando su `app.register` de `src/app.ts`, el test se pone rojo |
| Decisión nº 1 por escrito | §Las cuatro decisiones · 1 (con el coste medido) |
| Decisión nº 2 por escrito, comprobada leyendo los tests | §Las cuatro decisiones · 2 (tabla de los seis módulos) |
| Decisión nº 4 por escrito, sin tocar el guardián | §Las cuatro decisiones · 4 |
| Nada de `var/` se borra sin preguntar | Ni una escritura ni un borrado en `var/`. §Decisión nº 3 |
| La F31 no se toca | Ninguno de sus archivos aparece en la tabla de archivos modificados |
| Ni un dato real en tests ni fixtures | `src/lib/test-var.test.ts` trabaja en un tempdir con un banco inventado (`banco-inventado`) y contenido inventado; el guardián del ADR-017 no señala ninguna línea nueva de esta feature |
| `./init.sh` termina en verde | **NO.** Queda el fallo de la decisión nº 4, ajeno a este bug y explicado en vez de tapado |

## Último `./init.sh`

Dos pasadas seguidas, idénticas:

```
Tests  1 failed | 940 passed (941)   →  src/no-real-data.test.ts (decisión nº 4)
[FAIL] Hay 2 features en in_progress (máximo 1)
[FAIL] Entorno NO está listo. Resuelve los errores antes de avanzar.
```

`npx tsc --noEmit` limpio y `oxlint` limpio sobre los archivos tocados.

Las dos líneas rojas, y de quién son:

1. **`no-real-data`** → decisión nº 4. **No es este bug** y no se tapa.
2. **«2 features en in_progress»** → F31 y F33 a la vez. Es de `feature_list.json`,
   que esta feature tiene prohibido tocar; se resuelve al cerrar la F31.

## Sugerencias fuera de scope (NO aplicadas)

1. **La colisión del nombre de archivo (decisión nº 4) merece su propia feature.**
   Hoy cualquier parseo real de Trade Republic pone la suite roja. Salidas (a) y (b)
   arriba.
2. **`bankinter.routes.test.ts` es el único banco que no comprueba que su ruta esté
   registrada en la app real.** No es un agujero de datos —no invoca nada—, pero sí un
   hueco de cobertura: si alguien quitara su línea de `src/app.ts`, ningún test lo
   diría. Una línea con `hasRoute` lo cierra.
3. **El valor por defecto a `var/` podría desaparecer de los seis módulos** y pasar a
   inyectarse desde `src/app.ts` (composición). Entonces un test no podría caer en
   `var/` ni queriendo. Es un cambio de firma en seis módulos: no cabe aquí.

---

# Segunda pasada — 2026-08-26 (review CHANGES_REQUESTED)

> La review dio un solo punto, y era de los buenos: **la red detectaba, pero no
> tumbaba la pasada**. Esta sección es lo que se hizo con él.

## El fallo, en una frase

El `throw` del *teardown* de `globalSetup` se reporta como `error during close` y
**`vitest run` sale con código 0**. Como [`init.sh:343`](../../init.sh) decide con un
`if` sobre el comando de test, `./init.sh` imprimía `[OK] Todos los tests pasan` con
la carpeta del humano tocada. Una alarma que suena y no despierta a nadie.

## Cómo se consigue que la pasada falle de verdad

**Fijando el código de salida**, no lanzando. Nuevo módulo
[`src/lib/test-guard.ts`](../../src/lib/test-guard.ts), con una sola función,
`failRun(problems)`:

- escribe el informe al **descriptor 2** —no por `console`, que vitest intercepta y
  que con el reporter por defecto (el que usa `./init.sh`) no se imprime: la misma
  lección que el guardián del ADR-017 aprendió en la F23—;
- hace `process.exitCode = 1`, que es lo único que sobrevive al cierre de vitest;
- y con la lista **vacía no toca nada**: una pasada verde sigue verde.

El *teardown* de [`vitest.global-setup.ts`](../../vitest.global-setup.ts) ya no
lanza: **recolecta** los problemas de las tres comprobaciones y se los pasa a
`failRun`. De regalo, ahora se ven **los tres a la vez**: antes el primer `throw`
tapaba a los otros dos, así que un cambio en su base de datos escondía uno en su
`var/`.

## Apartado propio: SE HA TOCADO CÓDIGO DE LA F27 (por encargo del leader)

⚠️ **El guardián de base de datos del ADR-027 —el que impide que los tests escriban
en la base del humano— llevaba SIN PODER TUMBAR UNA PASADA desde el día que se
escribió**, por exactamente el mismo motivo: sus dos avisos (base cambiada, filas
dejadas atrás) también eran `throw` en ese mismo *teardown*.

Se ha arreglado aquí, **fuera del alcance formal de la F33 y con el visto bueno
explícito del leader**, por dos razones que quedan escritas: es **el mismo
mecanismo** (arreglarlo para `var/` y no para la base sería dejar medio agujero
abierto a sabiendas) y es **un fallo de una red de seguridad**, que no es cosa que se
anote para otro día.

Qué se tocó de la F27, exactamente: **solo la forma de reportar** de sus dos avisos
en `vitest.global-setup.ts` (de `throw` a acumular en la lista + `failRun`). **Sus
mensajes son los mismos palabra por palabra**, y `src/lib/test-db.ts` —donde vive
toda su lógica— **no se ha tocado en una sola línea**.

## La medida extremo a extremo (no de oído)

Como pidió la review, con archivo probe **mío**, creado y borrado por mí, sin tocar
ni un archivo suyo:

1. `var/__f33-probe.txt` creado por mí, y un test temporal que lo reescribe **con los
   mismos bytes** (el caso exacto del bug: solo la fecha).
2. `./init.sh` completo:

```
Test Files  52 passed (52)
      Tests  955 passed (955)

==============================================================================
LA SUITE HA TOCADO ALGO TUYO. La pasada se marca como FALLIDA.
==============================================================================
LA SUITE HA TOCADO TU CARPETA var/. ... Diferencias:
  - var/__f33-probe.txt: reescrito con el mismo contenido (cambió su fecha)
==============================================================================
[FAIL]  Hay tests rotos
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.

EXIT=1
```

   **955 tests en verde y la pasada fallida**: eso es exactamente lo que antes salía
   con `EXIT=0`.
3. Probe y test temporal borrados: `find var -name '__f33*'` vacío y `git status` de
   `src/` sin rastro.
4. Y la pasada limpia, para cerrar el otro sentido: `./init.sh` → **954/954 verde,
   `EXIT=0`**, `[OK] Entorno listo`, y `find var -newermt` vacío.

## El test que lo demuestra (no el mecanismo en aislamiento)

[`src/lib/test-guard.e2e.test.ts`](../../src/lib/test-guard.e2e.test.ts): escribe un
proyecto vitest de usar y tirar dentro de `node_modules/`, cableado con **el código
real** del guardián (`snapshotVarDir` + `describeVarDifferences` + `failRun`) sobre
una **carpeta inventada suya, nunca `var/`**, lo ejecuta en un **proceso hijo** y
mira el **código de salida**:

- se tocó un archivo (reescrito con los mismos bytes) → **exit ≠ 0**, con su test en
  verde y el banner en la salida;
- no se tocó nada → **exit 0**: la red no da falsos positivos.

Cuesta **~1,2 s** en total. Al hijo se le quitan las variables `VITEST*` heredadas
para que no se crea parte de esta pasada, y la carpeta se borra en un `afterEach`
pase lo que pase.

Además, [`src/lib/test-guard.test.ts`](../../src/lib/test-guard.test.ts) cubre
`failRun` con un *sink* falso: reporta **todos** los problemas (no solo el primero) y
con la lista vacía no escribe ni cambia nada.

## Textos corregidos

Los tres sitios que decían «pone la pasada en rojo» sin que fuera cierto:

| Dónde | Qué dice ahora |
|---|---|
| Este informe (cabecera y §Decisión nº 1) | Marcado con ⛔ y apuntando aquí, sin borrar lo que decía |
| [`docs/conventions.md`](../../docs/conventions.md) §Tests que tocan `var/` | «Roja» = código de salida ≠ 0 y `./init.sh` en `[FAIL]`, más una regla nueva: **un guardián de final de suite no se escribe con `throw`** |
| **ADR-029** de [`docs/architecture.md`](../../docs/architecture.md) | Tres viñetas nuevas: por qué el `throw` no vale, que el guardián de la F27 estaba igual y se arregló aquí, y el test que lo demuestra |

## Mapeo criterio → test (segunda pasada)

| Qué pedía la review | Cómo queda demostrado |
|---|---|
| La pasada falla de verdad (código ≠ 0) y `init.sh` lo ve | Medida extremo a extremo: `EXIT=1`, `[FAIL] Hay tests rotos`, `[FAIL] Entorno NO está listo` |
| Un test que demuestre que la pasada falla | `src/lib/test-guard.e2e.test.ts`, dos casos (tocado → exit ≠ 0; intacto → exit 0) |
| Adoptar y arreglar el guardián de la F27 | §Apartado propio, arriba. Mismo `failRun`; `src/lib/test-db.ts` intacto |
| Corregir los tres textos que mentían | §Textos corregidos |
| La suite sigue en verde | `./init.sh` → **954/954, `EXIT=0`** (950 de antes + 4 tests nuevos) |
| Sin tocar `var/`, la F31 ni la F34 | Probe propio creado y borrado (`find var -name '__f33*'` vacío); ningún archivo de la F31 ni `src/no-real-data.test.ts` en el diff |

## Archivos de la segunda pasada

| Archivo | Qué cambia |
|---|---|
| [`src/lib/test-guard.ts`](../../src/lib/test-guard.ts) | **Nuevo.** `failRun`: informe al descriptor 2 + código de salida |
| [`src/lib/test-guard.test.ts`](../../src/lib/test-guard.test.ts) | **Nuevo.** 2 tests con *sink* falso |
| [`src/lib/test-guard.e2e.test.ts`](../../src/lib/test-guard.e2e.test.ts) | **Nuevo.** La prueba extremo a extremo en proceso hijo |
| [`vitest.global-setup.ts`](../../vitest.global-setup.ts) | El *teardown* recolecta los tres problemas y llama a `failRun`; ningún `throw`. **Incluye los dos avisos de la F27** |
| [`docs/architecture.md`](../../docs/architecture.md) | ADR-029 ampliado |
| [`docs/conventions.md`](../../docs/conventions.md) | §Tests que tocan `var/` corregida y ampliada |

## Sugerencia fuera de scope (NO aplicada)

`src/lib/test-var.ts`, `src/lib/test-guard.ts` y sus tests no están en la lista del
guardián «contains the target tree of docs/architecture.md» de
`src/architecture.test.ts` (que solo comprueba presencia, así que no falla).
Añadirlos con su porqué, como se hizo con `lib/test-db.ts` en la F27, sería lo
coherente.
