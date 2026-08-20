# reimport-from-local-copy (F25) — implementación

> Feature **sin spec** (`sdd: false`): mandan los **10 criterios de `acceptance`** de
> `feature_list.json`. Parte del
> [diagnóstico del 2026-08-20](../explorations/diagnostico-bankinter-sin-persistir-2026-08-20.md),
> opciones **(b)** y **(e)** de su §3.

## Qué hace ahora la app que antes no

1. **`POST /api/import/local`** reimporta desde la copia local de
   `var/drive-read/<banco>/<año>/`, **sin cliente de Drive**: no descarga, no lista, no
   mueve y no borra nada. Un archivo que ya está en `procesados/` vuelve a entrar sin
   tocar Drive a mano.
2. **Un archivo del que no entra ni un movimiento deja de contarse como importado** y
   deja de moverse a `procesados/`: se reporta `failed` con un motivo que obliga a
   mirarlo.

## Archivos modificados / creados

**Creados**

- [`src/modules/import/import.local.service.ts`](../../src/modules/import/import.local.service.ts)
  — el recorrido de las copias locales y las respuestas cuando no están.
- [`src/modules/import/import.schema.ts`](../../src/modules/import/import.schema.ts)
  — JSON Schema del cuerpo opcional `{ bank?, year?, name? }` (ADR-003).
- [`src/modules/import/import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts)
  — 15 tests del servicio.
- [`src/modules/import/import.local.routes.test.ts`](../../src/modules/import/import.local.routes.test.ts)
  — 6 tests de la ruta.

**Modificados**

- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts)
  — se extrae [`importStatement()`](../../src/modules/import/import.service.ts#L334)
  (parsear → resolver cuenta → mapear → guardar, **sin Drive**), se añade
  [`assertTheFileBringsMovements()`](../../src/modules/import/import.service.ts#L381) y
  se exportan `selectAdapter` y `totals` para que la vía local use **las mismas** reglas.
- [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts)
  — `StatementResult`, `FileCounts` y los tipos del informe local
  (`movedToProcessed: false` **como literal**: el compilador también lo dice).
- [`src/modules/import/import.routes.ts`](../../src/modules/import/import.routes.ts)
  — la ruta nueva.
- [`src/errors/app-error.ts`](../../src/errors/app-error.ts) — `EmptyStatementError`,
  `UnreadableStatementError`, `LocalCopyNotFoundError`.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — los 4 archivos nuevos en
  el árbol esperado + guardián de que la vía local **no puede** tocar Drive.
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts)
  — 4 tests nuevos y **dos ajustes** (ver §Cambios de comportamiento).
- [`docs/api-contract.md`](../../docs/api-contract.md) y
  [`docs/architecture.md`](../../docs/architecture.md) (**ADR-025**).

## Decisión 1 — por dónde se pide la reimportación, cómo se nombra el archivo y qué pasa si la copia no está

*(delego_en_agente nº 1 y 2 — criterio C5)*

**Ruta nueva, no bandera de la que hay: `POST /api/import/local`.** Cuerpo **opcional**
`{ bank?, year?, name? }`; sin cuerpo, recorre todas las copias.

- **Por qué no un parámetro de `POST /api/import`:** las dos operaciones tienen
  **garantías distintas** —la mensual mueve a `procesados/` lo que guarda; la local no
  mueve **nunca**—. Si vivieran en la misma ruta, «esto no toca tu Drive» pasaría a
  depender de leer bien un campo del cuerpo. Además el criterio C6 exige que la
  importación normal no cambie: no cambia ni una línea de su contrato.
- **Cómo se identifica el archivo: por su RUTA** (carpeta del banco + año + nombre). En
  disco no hay id, y el nombre **no es identificador**: se repite entre bancos y entre
  años. Las tres partes son opcionales y estrechan el recorrido; el banco se compara con
  `normalizeBankName`, así que la carpeta escrita en mayúsculas casa con su slug.
- **Sin cuerpo recorre todo, y es seguro:** no mueve nada y la deduplicación descarta lo
  ya guardado, así que la peor consecuencia de una llamada de más son `duplicates`.
- **Si la copia no existe → `LOCAL_COPY_NOT_FOUND` (404)**, nunca un 200 con cero
  archivos. El mensaje nombra **lo más concreto que se pidió y falta** (el banco, el año
  o el archivo), dice **qué sí hay** ahí y **dónde viven** las copias
  (`var/drive-read/<banco>/<año>/`) y **cómo aparecen** (se descargó alguna vez en esta
  máquina). Es el patrón que la F22 pagó caro: un mensaje que manda a mirar donde no es
  cuesta una vuelta entera.
- **Nada de rutas dentro de los campos:** `bank`, `year` y `name` son nombres simples
  (schema con `pattern` + una segunda comprobación en el servicio, que es quien toca el
  disco). Con `/`, `\` o `..` → `VALIDATION_ERROR` (400) antes de leer nada.

## Decisión 2 — dónde se corta exactamente el caso de «cero movimientos»

*(delego_en_agente nº 3 — criterios C3 y C4)*

«Cero» son **tres** casos y **no justifican lo mismo**:

| Caso | Qué se reporta | ¿Se mueve a `procesados/`? |
| ---- | -------------- | -------------------------- |
| **(a)** Parsea sin un solo error y **no trae ni una línea** de movimiento | `failed` + `EMPTY_STATEMENT` | **NO** |
| **(b)** Trae líneas y **ninguna** se pudo interpretar | `failed` + `ALL_ROWS_UNPARSED` | **NO** |
| **(c)** Trae líneas y **todas ya estaban** guardadas | `imported` con `imported: 0, duplicates: n` | **Sí** |

**La regla, en una frase:** un archivo llega a `procesados/` **solo si al menos una de
sus filas está en la base de datos**, se haya guardado ahora o ya estuviera.

Por qué así:

- **(a) y (b) son fallos, no éxitos silenciosos.** Es exactamente el §1.4 del
  diagnóstico: hoy ese archivo se movía y se reportaba `imported: 0`, es decir, salía de
  la lista de pendientes sin dejar nada. Que **no** se mueva es lo que lo hace
  reintentable.
- **(a) y (b) llevan códigos distintos porque son problemas distintos.** Vacío = «te has
  bajado el periodo equivocado, o el mes no tuvo actividad»; ilegible = «el formato del
  archivo ha cambiado, mira `unparsedRows`». Mismo criterio que separó `NOT_UTF8` de
  `UNEXPECTED_ENCODING` en la F22: dos situaciones, dos códigos, dos consejos.
- **(c) NO es un fallo.** Todas las filas del archivo **están** en la base de datos; es
  justo lo que se ve al reimportar algo sano. Tratarlo como error convertiría la
  reimportación en ruido y rompería el comportamiento actual (`import.service.test.ts`,
  test de R7/R13).
- **Parcial (algunas líneas ilegibles, otras buenas) no cambia:** se guarda lo bueno, se
  reporta el resto y se mueve (ADR-015, decisión 4). El corte es **cero**, no «alguna».
- **La comprobación va ANTES de resolver la cuenta**, así que un archivo que no aporta
  nada tampoco puede dejar una cuenta creada detrás.

## Trazabilidad criterio → test

| # | Criterio | Test |
| - | -------- | ---- |
| C1 | Reimportar desde la copia local, sin depender de Drive y sin mover/borrar nada | `import.local.service.test.ts` → «imports a file from its local copy with no Drive client at all», «hands the parser the bytes of the copy and reads the bank from the FOLDER», «reimports every copy on disk when nothing is asked for», «leaves every local copy exactly where it was, byte for byte», «reports movedToProcessed false for every file»; `import.local.routes.test.ts` → «reimports the copy named by bank, year and name, without touching Drive» (**espías de Drive: cero llamadas**); `architecture.test.ts` → «keeps the local reimport away from Drive: it moves and deletes nothing» |
| C2 | Dos pasadas no duplican; la segunda reporta **duplicados** | `import.local.service.test.ts` → «reports duplicates instead of importing again on a second pass» (compara **fila a fila** el antes y el después); `import.local.routes.test.ts` → «does not duplicate anything when the same call is made twice» |
| C3 | Un archivo del que no entra ni un movimiento no es `imported` y **no** se mueve | `import.service.test.ts` → «fails a file that parses with no error and brings no movement, and does NOT move it», «creates no account for a file that brings no movement»; `import.local.service.test.ts` → «fails a local copy that brings no movement, storing nothing» |
| C4 | Los tres casos de «cero», cada uno con su reporte | (a) «fails a file that parses with no error and brings no movement…» · (b) «fails a file whose rows could ALL not be read with its own code, and does NOT move it» · (c) «reimports the same file without duplicating anything…» (ahora afirma también `movedToProcessed: true`) · y el borde: «keeps moving a file where SOME rows were read» |
| C5 | Por dónde se pide y qué se responde si la copia no está | `import.local.service.test.ts` → «names the bank…», «names the bank when its folder is there but holds no copy» y «…no year folder inside either» (segunda pasada), «names the year…», «names the file…», «fails when there is no local copy at all, instead of reporting an empty run», «refuses a name that is a path…»; `import.local.routes.test.ts` → «answers 404 LOCAL_COPY_NOT_FOUND naming the file that is not on disk», «accepts a call with no body at all», «rejects a name that is a path», «drops an unknown field…» |
| C6 | La importación normal no cambia | Toda `import.service.test.ts` sigue en verde (28 tests, R1–R19), en particular «moves the file to procesados only after its movements are stored (R9)», «does not move a file whose import failed…» y «saves the good rows of a partial import… and moves it anyway»; añadido «keeps moving a file where SOME rows were read: the rule is about zero, not about partial»; `import.routes.test.ts` intacto (contrato de `POST /api/import` sin tocar) |
| C7 | Los datos de hoy no se tocan | Ni migración ni escritura fuera de los tests: cada test usa un **slug de banco propio** (`zz-local-…`), IBANes de `syntheticIban()` y un **directorio temporal**, y borra sus cuentas y movimientos en `afterEach`; «leaves every local copy exactly where it was, byte for byte» demuestra que la vía local no escribe en el volcado |
| C8 | Documentado en `api-contract.md` y en el ADR | `docs/api-contract.md` §`POST /api/import/local` (forma, respuestas, errores) + tabla de los tres casos de cero + los dos códigos nuevos; `docs/architecture.md` **ADR-025** |
| C9 | Ni un dato real en tests ni fixtures | Todo sintético y en `tmpdir()`, sin red; `src/no-real-data.test.ts` en verde con su **capa de comparación activa** |
| C10 | Mapeo + `./init.sh` verde | Este archivo + §Último `./init.sh` |

## Cambios de comportamiento (deliberados)

1. **Un archivo que parsea a cero movimientos pasa de `imported` + movido a `failed` +
   no movido.** Es el objetivo de la feature (C3).
2. Dos ajustes en tests existentes, ambos consecuencia de lo anterior:
   - «skips a file with no parser or an unsupported extension…» usaba como archivo
     **sano** uno que parseaba a **cero movimientos**; ahora trae un movimiento. Lo que
     el test comprueba (qué se salta y qué no se mueve) no cambia.
   - «reimports the same file without duplicating anything» gana una aserción:
     `movedToProcessed: true` en la segunda pasada, que es el **caso (c)** escrito.

## Último `./init.sh`

```
── 5. Ejecutando tests ─────────────────────────────────
 Test Files  45 passed (45)
      Tests  767 passed (767)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

739 antes → **767** ahora (**+28**: 17 del servicio local —2 de la segunda pasada—, 6 de
su ruta, 4 de la regla de cero movimientos, 1 guardián de arquitectura). `var/` intacto y la capa de comparación
del guardián **activa** (no salta el mensaje de «capturas ausentes»).

## Segunda pasada — los dos cambios pedidos por el `reviewer` (2026-08-20)

Veredicto: [`reviews/reimport-from-local-copy.md`](../reviews/reimport-from-local-copy.md)
(CHANGES_REQUESTED). Los dos están aplicados; **no he tocado nada de lo que dio por
bueno**, ni el dedup.

### 1 — El 404 ahora nombra el banco pedido (código)

**Qué estaba mal:** `missingCopyMessage()` solo nombraba lo pedido si venía `name` o
`year`. Con **solo `bank`**, y con su carpeta presente pero **sin copias dentro** (vacía,
o sin subcarpeta de año), caía en la rama genérica *«no hay ninguna copia local todavía»*
— falso si otros bancos sí tienen copia, y justo el «no había nada que importar» que el
C5 prohíbe.

**Qué he hecho:** rama propia para `selection.bank` en
[`missingCopyMessage()`](../../src/modules/import/import.local.service.ts#L172), que
nombra el banco pedido, dice que **su carpeta está pero sin copias dentro** y **lista los
que sí las tienen**, con el mismo criterio que la rama de banco desconocido. Los bancos
con copia los calcula
[`banksWithCopies()`](../../src/modules/import/import.local.service.ts#L210) mirando el
disco de verdad (una carpeta de banco sin ningún archivo dentro **no** cuenta), y solo se
ejecuta en el camino de fallo.

**Tests nuevos** (los dos casos que el reviewer reprodujo), junto a los tres que ya
había: «names the bank when its folder is there but holds no copy (C5)» y «names the bank
when its folder has no year folder inside either (C5)». Ambos afirman **en positivo** la
frase nueva (`no tiene ninguna copia dentro`), así que no pueden pasar por accidente.

### 2 — La garantía de «es seguro repetirlo» queda matizada (documental)

**Qué estaba mal:** el contrato prometía **sin condiciones** que repetir la llamada sin
cuerpo era seguro. Solo lo es **si el parser es el mismo** con el que se importó el
archivo: `daySequence` numera únicamente las filas interpretadas y **se recalcula al
parsear**, así que un parser que hoy lee una fila que antes no leía **renumera el día** y
sus filas entran como movimientos nuevos. El reviewer lo reprodujo: 4 filas para 3
movimientos reales. Yo lo tenía anotado en §Sugerencias, pero el documento que lee el
humano decía lo contrario, y él pidió expresamente que esto no fuera «una forma fácil de
duplicarme los movimientos».

**Qué he hecho, sin tocar el dedup:**

- [`docs/api-contract.md`](../../docs/api-contract.md) §`POST /api/import/local`: la
  frase pasa a «no duplica **mientras el parser sea el mismo**», con un aviso ⚠️ que
  explica el porqué (`daySequence` recalculado) y **qué hacer en su lugar**: pedir el
  archivo concreto con `{ bank, year, name }`, mirar `imported` / `duplicates` y
  comprobar el recuento del periodo en `GET /api/movements`; un `imported` distinto de 0
  en un archivo que creías importado **es** este caso. La viñeta de «reimportar dos veces
  no duplica» queda condicionada igual.
- [`docs/architecture.md`](../../docs/architecture.md) **ADR-025**: consecuencia nueva
  que dice la condición en voz alta, que esta vía **no crea** el defecto pero lo pone a
  una llamada de distancia y justo sobre su caso de uso (copias antiguas, parsers
  anteriores a la F19/F22), y que arreglarlo de raíz —una clave de dedup que no dependa
  de una posición recalculable— es otra feature con su migración. La decisión 3 remite a
  esa salvedad.

**`./init.sh` tras la segunda pasada: verde, 767/767** (765 + los 2 tests nuevos).

## Estado de la feature y lo que NO he podido comprobar yo

- **F25 queda en `in_progress`**, no en `done`: falta el veredicto del `reviewer` y
  `progress/summaries/reimport-from-local-copy.md`, que es la condición de cierre del
  protocolo (una feature no se cierra sin su resumen).
- **El recuento de la base de datos (C7: 4 cuentas / 455 movimientos) no lo he podido
  leer**: el acceso directo a `psql` está bloqueado en este entorno. Lo que sí sostiene
  el criterio: **no hay migración**, ningún código nuevo escribe fuera de un directorio
  temporal, y cada test usa **su propio slug de banco** (`zz-local-…` / `zz-import-…`) y
  borra sus cuentas y movimientos en `afterEach`, que es la misma disciplina con la que
  la suite lleva 24 features corriendo contra esa base. Comprobable en un segundo con
  `GET /api/accounts` y `GET /api/movements`.
- **Flake conocido:** en la primera ejecución de la sesión —**antes** de tocar nada—
  falló `import.routes.test.ts` («lists the imported movements most recent first (R3)»,
  un 500 en `GET /api/movements`); la ejecución siguiente, con el mismo código, dio
  739/739. Es el mismo patrón que el flake documentado en `movements.test.ts:318`
  (interferencia entre tests en paralelo sobre la base compartida). **No lo he tapado**;
  queda dicho. Todas las ejecuciones posteriores han sido verdes.

## Sugerencias fuera de scope (NO aplicadas)

- **`GET /api/import/local` (o un `dry-run`)** que liste qué copias hay sin importar
  nada. Hoy para saberlo hay que provocar el 404, que lo dice, pero de rebote.
- **La copia local se pisa entre dos pendientes homónimos** (límite conocido de la F5):
  ahora ese límite también afecta a la recuperación, porque la copia **es** el respaldo.
  Merecería nombre de archivo con el `fileId` de Drive, y es un cambio de la F5.
- **`daySequence` renumera** si un archivo con filas ilegibles se reimporta tras mejorar
  su parser (límite vivo del ADR-015): la vía local hace ese escenario mucho más fácil de
  provocar, así que el cabo suelto ahora pesa más. **Tras la revisión ya no es solo una
  nota aquí**: está escrito en el contrato y en el ADR-025, con qué hacer en su lugar. El
  arreglo de raíz (clave de dedup que no dependa de una posición recalculable) sigue
  fuera de scope y necesita migración.
- **`POST /api/ingestion/process` sigue sin mover nada** y su copia cruda es la que
  alimenta esta vía: podría documentarse como «el respaldo» en el runbook de bancos.
