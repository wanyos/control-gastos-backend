# no-real-data-blind-spot (F23) — implementación

Feature **sin spec** (`sdd: false`): se trabajó del `intent` y de los **10 criterios de
`acceptance`**. Sin lotes: un solo implementer.

> **Ni un dato del humano en este informe.** Todo lo que se cita entre comillas es
> inventado (`7.531,86`, `COMPRA MENSUAL TRAMONTANA`, el IBAN sintético de siempre). Lo
> que se dice de sus ficheros son **recuentos y tamaños**, nunca valores.

## Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) | El guardián entero: captura por contenido, marcado, contabilidad por banco, mensajes sin valores y 10 tests nuevos |
| [`docs/architecture.md`](../../docs/architecture.md) | **ADR-017** revisado (nota de cabecera + 6 consecuencias nuevas) |
| [`docs/conventions.md`](../../docs/conventions.md) | §Tests: qué mira el guardián, qué hace ante un banco ilegible y por qué sus mensajes no llevan el valor |
| `feature_list.json` | F23 `pending` → `in_progress` |
| `progress/current.md` | Sección de la feature en curso |

**Nada de `src/` fuera del guardián.** Ni parsers, ni rutas, ni modelo de datos, ni
`package.json` / `pnpm-lock.yaml` (cero dependencias nuevas). Criterio 7 ✅.

## Las tres decisiones delegadas, resueltas por escrito

### 1. La captura se decide por el CONTENIDO, no por una lista de extensiones

Una lista de extensiones es una promesa sobre el futuro que nadie cumple: el banco
número siete llega con otra y el hueco se reabre **en silencio**. La pregunta pasa a ser
sobre los bytes, y solo sobre los bytes
([`looksBinary`, src/no-real-data.test.ts:151](../../src/no-real-data.test.ts#L151)):

> **es binario** si hay un byte **NUL**, o si más del **1 %** de los primeros **8 KiB**
> son bytes de control (excluyendo tab, salto de línea, form feed y retorno).

Medido sobre `var/` tal y como está hoy: **18 ficheros, 14 capturados antes, 16 ahora**.
Los dos que entran son exactamente **los dos `.xls` de Openbank** (168.948 y 169.748
bytes, `ctrl` = 0 en los primeros 4 KiB); los dos que quedan fuera son el `.xlsx` de
Bankinter (empieza por `PK\x03\x04`, 580 bytes de control en 4 KiB) y el `.pdf` de Trade
Republic (225 bytes NUL).

**Qué se hace con esos dos, y por qué:**

- **No se leen como texto.** Meter bytes comprimidos en la comparación es **ruido**, y el
  ruido produce falsos positivos; los falsos positivos enseñan a añadir excepciones, y
  las excepciones son lo que desarma un guardián. Es el fallo que esta feature persigue,
  con otro disfraz.
- **El `.xlsx` de Bankinter ya está vigilado** por su volcado de `var/parsed/bankinter/`
  (ADR-017: lo binario solo se ve a través de su volcado). No pierde nada.
- **El `.pdf` de Trade Republic no está vigilado por ninguna vía**, y eso **no se tapa**:
  ver el hallazgo 🟠 al final de este informe.
- **Se probó extraer el texto del PDF** (inflar sus 9 flujos `FlateDecode` con `zlib`,
  sin dependencias): salen **336 caracteres** —los títulos de las secciones— y el resto
  son fuentes subset y flujos binarios. Los importes **no se recuperan** sin las CMap.
  Se descartó: un guardián que dijera «vigilado» sobre texto que no sabe leer sería
  **exactamente** el bug de la F19 otra vez, pero mejor disfrazado.

**Además, de un fichero de marcado se compara lo que DICE, no sus etiquetas**
([`markupText`:218](../../src/no-real-data.test.ts#L218)). Las etiquetas del `.xls` de
Openbank son el formato del banco, que **nuestro propio parser tiene que reproducir**:
compararlas señalaría a nuestro código, no a una fuga. Es el mismo criterio que ya se
aplicaba a las **claves** de un `.json` de `var/parsed/`. Lo que un **comentario HTML
dice sí se conserva**: ahí es donde él escribe su IBAN (F19).

Y la descodificación **nunca lanza**
([`decodeCapture`:168](../../src/no-real-data.test.ts#L168)): UTF-8 y, si no, cp1252, que
mapea los 256 bytes. **No** se reutiliza `decodeCp1252Strict` a propósito: rechaza un
fichero con `U+FFFD` (F17/F22), y una captura dañada —como la que él tuvo el 2026-08-19—
es justo una que el guardián **todavía tiene que comparar**, no una que pueda descartar.
Tope de tamaño: 32 MiB ([:132](../../src/no-real-data.test.ts#L132)), y lo que se pase se
contabiliza como ilegible, nunca se ignora en silencio.

### 2. Carpeta de banco con ficheros y **ninguno** capturable ≠ carpeta vacía

Contabilidad **por banco**
([`bankCoverage`:330](../../src/no-real-data.test.ts#L330)): para cada carpeta de
`var/drive-read/<banco>/` se cuenta cuántos ficheros tiene, cuántos se pudieron capturar
y cuántas capturas tiene su volcado `var/parsed/<banco>/`.

- **Carpeta vacía** → no hay nada suyo que vigilar. El guardián no dice nada.
- **Ficheros + alguna captura** (o volcado en `parsed/`) → **vigilado**.
- **Ficheros + cero capturas + cero volcado** → **hueco**
  ([`unwatchedNow`:351](../../src/no-real-data.test.ts#L351)). Y un hueco:
  1. **se imprime por su nombre en la salida de `./init.sh`**, en toda ejecución
     (`writeSync(2, …)` — al descriptor 2, **no** por `console`, que vitest intercepta;
     ver §Segunda pasada. Solo el nombre de la carpeta, jamás un valor);
  2. vive en la lista [`unwatchedBanks`:368](../../src/no-real-data.test.ts#L368) con su
     **motivo** y con **cómo se cierra**;
  3. y el test afirma que esa lista es **exactamente** el estado real, **en las dos
     direcciones**: un banco nuevo ilegible pone la suite **en rojo**, y un banco que
     pasa a ser legible la pone en rojo **hasta que se borra su entrada**.

Esto **no** es una excepción para que algo pase: no silencia ninguna coincidencia. Es el
**inventario de los agujeros**, obligado a estar al día por un test. El hueco de hoy era
precisamente que nadie llevaba ese inventario.

### 3. Cómo se prueba el caso de la F19 sin un dato real

Fichero de banco **sintético** construido en código —HTML con la forma del `.xls` de
Openbank: comentario del IBAN, separadores españoles y un concepto de tres palabras—
escrito en un **directorio temporal** fuera del repositorio, que se borra al acabar la
suite ([:781 en adelante](../../src/no-real-data.test.ts#L781)). Contra él se simula el
archivo versionado infractor (un fixture con el importe copiado) y se comprueba el
**mecanismo**: encuentra la coincidencia, la localiza en **la línea correcta** y **no
escribe el valor** en el mensaje. Hay **control negativo** (un importe inventado que no
está en el fichero de banco → cero hallazgos), así que el test **falla si el mecanismo
deja de detectar** y también si empieza a detectar de más.

Para que eso fuera posible, `scan` se partió en dos:
[`scanSources`:590](../../src/no-real-data.test.ts#L590) recibe los archivos a mirar, y
las dos comprobaciones son ahora funciones aparte
([`amountLeak`:627](../../src/no-real-data.test.ts#L627),
[`phraseLeak`:639](../../src/no-real-data.test.ts#L639)) — **el código que vigila el
repositorio es literalmente el que ejercitan los tests del mecanismo**.

## Trazabilidad: cada criterio con su(s) test(s)

| # | Criterio (resumido) | Test |
|---|---|---|
| 1 | El `.xls` de Openbank entra en la captura y se compara | [«reads the real .xls of Openbank…» :854](../../src/no-real-data.test.ts#L854) · [«captures a statement named .xls…» :829](../../src/no-real-data.test.ts#L829) · [«would have caught it through the .xls…» :978](../../src/no-real-data.test.ts#L978) |
| 2 | Captura por contenido, no por extensión; qué se hace con `.xlsx` y `.pdf` | [«tells a real binary from text by its bytes…» :819](../../src/no-real-data.test.ts#L819) · [«captures a statement named .xls and leaves the binary…» :829](../../src/no-real-data.test.ts#L829) · [«compares what a markup capture SAYS…» :838](../../src/no-real-data.test.ts#L838) + §1 de este informe |
| 3 | Banco con ficheros y nada capturable ≠ vacío, y nunca verde silencioso | [«tells a bank folder it cannot read apart from an empty one» :868](../../src/no-real-data.test.ts#L868) · [«holds the inventory…» :957](../../src/no-real-data.test.ts#L957) · [«announces the hole…» :926](../../src/no-real-data.test.ts#L926) · [«writes that announcement to the file descriptor, NOT through the console» :939](../../src/no-real-data.test.ts#L939) + §2 y §Segunda pasada |
| 4 | El caso de la F19 detectado con fichero sintético en temporal | [«catches an amount of a bank file copied into a versioned file» :915](../../src/no-real-data.test.ts#L915) · [«says nothing about an amount that is not in the bank file» :939](../../src/no-real-data.test.ts#L939) · [«catches a concept…» :952](../../src/no-real-data.test.ts#L952) |
| 5 | Sigue verde con el repositorio de hoy; nada silenciado | Las dos capas reales: [amounts :679](../../src/no-real-data.test.ts#L679) y [phrases :694](../../src/no-real-data.test.ts#L694), **verdes sin un solo `no-real-data-ok` nuevo** (el recuento de marcadores en el repo no cambia) |
| 6 | El guardián no escribe ningún dato suyo en ningún sitio | [«catches an amount…» :915](../../src/no-real-data.test.ts#L915) (afirma que el motivo **no contiene** el importe) · el aviso de [:891](../../src/no-real-data.test.ts#L891) imprime **solo nombres de carpeta** · el temporal se borra en `afterAll` y está fuera del repo |
| 7 | No cambia el comportamiento de la aplicación | `git diff --stat`: solo el guardián, dos docs, `feature_list.json` y `current.md`. Los **657** tests de los parsers, rutas y modelo pasan sin tocarse |
| 8 | La suite no se vuelve más lenta | Medido abajo: la capa de frases pasa de **2.429 ms a 523 ms** *con más datos dentro* |
| 9 | Documentado dónde toca | [ADR-017 revisado](../../docs/architecture.md) (nota de cabecera + 6 consecuencias) y [`docs/conventions.md` §Tests](../../docs/conventions.md) |
| 10 | Cada criterio con test; `./init.sh` verde con la capa de comparación activa | Esta tabla + §Último `./init.sh` |

## Rendimiento, con números

Medido en esta máquina, el archivo del guardián a solas:

| | Antes (HEAD) | Después |
|---|---|---|
| Capa de importes | 106 ms | 111 ms |
| **Capa de frases** | **2.429 ms** | **523 ms** |
| Archivo completo | 2,94 s | 1,05 s |
| Ficheros de `var/` leídos | 14 | 16 (+338 KB) |

La primera versión **sí** se pasó de tiempo: con los dos `.xls` dentro, la capa de frases
rebasó los **5.000 ms** de `testTimeout` bajo la carga de la suite completa y la puso en
rojo. **No se subió el timeout**: se arregló el algoritmo. Comparaba **cada frase de
`var/` contra cada línea** del repositorio (`phrases.some(p => línea.includes(p))`,
O(frases × líneas)); ahora genera los trigramas **de la línea** y los busca en un `Set`
([`trigramsOf`:538](../../src/no-real-data.test.ts#L538)), O(palabras). Mismo veredicto
para una copia real —una frase son tres palabras seguidas de todos modos— y de hecho
**algo más estricto**: `includes` casaba una frase pegada a la cola de una palabra más
larga. La suite completa: **4,53 s**.

## Último `./init.sh`

**Verde, 659 tests, 659 pasan, 0 saltados** (baseline 647; +12 tests, todos del
guardián — 657 en la primera pasada, +2 en la segunda). Ejecutado cinco veces: cuatro
verdes y una roja por la flakiness preexistente de la F12, ajena a esta feature
(§Segunda pasada). `tsc --noEmit` limpio,
`oxlint` y `prettier --check` limpios en todo lo tocado. **Cero dependencias nuevas.**

El aviso que imprime toda ejecución (verificado con `grep` sobre la salida completa de
`./init.sh`, ver §Segunda pasada), tal cual:

```
[no-real-data] the comparison layer does NOT watch: trade-republic — see `unwatchedBanks` in src/no-real-data.test.ts for the reason of each one
```

## 🟠 Hallazgo que hay que decirte: Trade Republic no lo vigila nadie

Al ampliar la captura **no apareció ninguna coincidencia real nueva** (criterio 5: nada
que arreglar y nada que silenciar). Pero la contabilidad por banco destapa otro hueco, y
**este no se puede cerrar dentro de esta feature**:

- **`var/drive-read/trade-republic/` solo tiene un PDF**, y su texto visible vive en
  flujos comprimidos dibujados con **fuentes subset**: no se recupera sin las CMap
  (medido: 336 caracteres de títulos, ni un importe).
- **Volcado no habrá**: la F20 decidió que ese banco entra como **JSON de producto**, no
  como parser del PDF.
- Por tanto, **si mañana alguien copia un importe de ese PDF a un archivo del
  repositorio, el guardián no lo caza**. Hay que mirarlo a mano, como hizo el reviewer de
  la F19.
- **Se cierra solo** el día que ese JSON de producto aterrice en esa carpeta: será texto,
  entrará en la captura, y el test **se pondrá rojo hasta que se borre** su entrada de
  `unwatchedBanks`.

Queda declarado en el código, en el ADR-017 y en la salida de `./init.sh` de toda
ejecución (verificado con `grep`, §Segunda pasada). **No se ha
añadido ninguna excepción para silenciarlo.**

## Sugerencias fuera de scope (NO aplicadas)

1. **`prisma/migrations/` sigue siendo la única exclusión de ruta** y dentro sigue una
   línea entera de su extracto en un comentario SQL (ADR-017). Ahora que la captura es
   más ancha, esa exclusión es el mayor riesgo residual del guardián. Se cierra el día
   que la base se resetee por otro motivo.
2. **El límite conocido no ha cambiado**: importes **redondos o cortos** (< 4 cifras
   significativas), valores **derivados** y **fechas** siguen sin cazarse. Ampliar la
   captura no amplía lo que se busca dentro de ella.
3. **`var/parsed/` se llena solo cuando alguien llama al parser.** Un banco cuyo `.xlsx`
   se descargue y no se parsee deja de estar vigilado **sin que hoy nadie lo diga**: la
   rama incompleta se detecta a nivel de `var/`, no por banco. Candidato natural a
   extender `bankCoverage` a `var/parsed/` en una feature pequeña.
4. **El aviso del hueco es lo único que la suite imprime siempre.** Si algún día
   molesta, la salida correcta es **cerrar el hueco**, no callar el aviso.

## Segunda pasada — el reviewer devolvió CHANGES_REQUESTED (2 puntos, uno solo de fondo)

**Tenía razón, y el fallo era grave: el aviso del hueco no se veía en ninguna ejecución
normal.** Era un `console.warn`, y **vitest intercepta la consola**: con el reporter por
defecto —el que usan `pnpm test` y por tanto `./init.sh`— **no se imprimía nada**. O sea
que la suite terminaba **en verde y en silencio sobre Trade Republic**, que es
literalmente el criterio 3 y la frase con la que él abrió la feature. La declaración del
hueco se había convertido en **la nota que nadie lee** — el mismo tipo de nota que causó
todo esto. Lo di por bueno sin mirar la salida; eso es lo que falló.

Reproducido antes de tocar nada:

```
$ ./init.sh 2>&1 | grep -c "no-real-data\]"
0
```

### 1. El aviso ahora se escribe al descriptor 2, no por `console`

[`announceUnwatched`:897](../../src/no-real-data.test.ts#L897) → `writeSync(2, …)`.

Elegido **pensando en que tiene que sobrevivir un año**: no pasa por `console`, ni por
`process.stderr`, ni por el reporter, ni por la configuración. Escribe al **descriptor de
fichero 2** del proceso, así que aterriza en la terminal que ejecutó `./init.sh` **haga
lo que haga vitest**. Las alternativas se descartaron por lo contrario: configurar el
reporter o `disableConsoleIntercept` en `vitest.config.ts` deja el aviso a merced de que
alguien cambie esa línea, que es justo el modo en que este mecanismo ya falló una vez.

El mensaje se partió en dos: [`unwatchedAnnouncement`:885](../../src/no-real-data.test.ts#L885)
—función pura que devuelve el texto, o `null` si no hay nada que decir— y la escritura.
Sigue diciendo **solo nombres de carpeta**, nunca un valor.

**Dos tests nuevos** para que no vuelva a pasar:

- [«announces the hole with the names of the folders and nothing else» :926](../../src/no-real-data.test.ts#L926):
  el texto nombra los bancos, dice qué significa («checked by hand») y apunta a
  `unwatchedBanks`; y **calla cuando no hay hueco** (un aviso constante sobre nada es
  cómo una salida deja de leerse).
- [«writes that announcement to the file descriptor, NOT through the console» :939](../../src/no-real-data.test.ts#L939):
  el guardián **lee su propio código fuente** y exige que la escritura sea `writeSync(2,`
  y que ahí **no** aparezcan `console.` ni `process.stderr`. Es el test que protege
  contra que alguien «lo ordene» de vuelta a un `console.warn` dentro de un año.
  **Comprobado por mutación**: cambiando `writeSync(2, announcement)` por
  `console.warn(announcement)` la suite se pone en rojo por ese test exacto (1 failed |
  23 passed), y al restaurarlo vuelve a 24/24.

### 2. Verificado ejecutando `./init.sh` y mirando su salida, que es lo que faltó

```
$ cd gastos-backend && ./init.sh 2>&1 | tee /tmp/final.txt | grep -E "^      Tests |Entorno"
      Tests  659 passed (659)
[OK]    Entorno listo. Puedes empezar a trabajar.

$ grep "no-real-data\]" /tmp/final.txt
[no-real-data] THE COMPARISON LAYER DOES NOT WATCH: trade-republic
[no-real-data]   a value copied from that bank into the repository is caught by NOTHING: it has to be checked by hand.
[no-real-data]   why, and how each one closes: `unwatchedBanks` in src/no-real-data.test.ts
```

De **cinco** ejecuciones completas de `./init.sh`, **cuatro en verde con 659 tests y 0
saltados** y las **cinco** con el aviso presente (3 líneas cada una). La quinta falló por
[`movements.test.ts`](../../src/modules/movements/movements.test.ts) («GET /api/movements
lists newest first…», `500` en vez de `200`), que es la **flakiness preexistente ya
anotada** en `current.md` §Anotado: ejecutado ese archivo solo, **24/24 en verde**. No
toca nada de esta feature —el diff no sale del guardián— pero queda dicho.

### 3. Corregidos los textos que afirmaban lo que no ocurría

[`docs/conventions.md`](../../docs/conventions.md) §Tests,
[`docs/architecture.md`](../../docs/architecture.md) (nota de cabecera del ADR-017 y la
consecuencia de contabilidad por banco), este informe (§2 de las decisiones, §Último
`./init.sh` y §Sugerencias) y [`progress/current.md`](../current.md). Los cuatro decían
«se imprime en **cada** ejecución» como hecho verificado. Ahora dicen **dónde** se ve
(«en la salida de `./init.sh`»), **cómo** (descriptor 2) y **por qué no por `console`**,
con el fallo de la primera pasada escrito en el ADR para que nadie lo reintroduzca por
limpieza.

### La pregunta de fondo: un aviso que no bloquea, ¿lo va a leer alguien?

Es la pregunta correcta, y la respuesta honesta empieza por reconocer el límite: **un
aviso es más débil que un rojo, siempre**. Por eso lo que **sí** bloquea es todo lo
demás: un banco ilegible **nuevo** pone la suite en rojo, y un banco de la lista que pasa
a ser legible también, hasta que se borre su entrada. El aviso cubre **solo** el caso
declarado como no arreglable hoy — fallar por el PDF de Trade Republic sería pedirle que
arregle algo que no tiene arreglo, y una suite que está roja «por lo de siempre» es la
forma más rápida de enseñar a ignorar los rojos (ya hay un precedente en este repo con el
test intermitente de la F12).

Dicho eso, **por qué este aviso sí se va a ver cuando la nota anterior no se vio**, que es
lo que se me pide argumentar:

1. **Está donde ya se mira.** La nota anterior vivía en `progress/current.md`, un archivo
   que hay que ir a buscar y que crece cada sesión. Esto sale en la salida de `./init.sh`,
   el comando que **todo agente ejecuta al empezar y antes de cerrar** —está en `AGENTS.md`
   §1 y §5— y a dos líneas del resumen que se lee para decidir si algo está listo.
2. **No lo mantiene nadie a mano, y por eso no puede quedarse obsoleto.** El texto se
   **deriva del estado real de `var/`** en cada ejecución. La nota anterior era una frase
   escrita una vez; esta aparece y desaparece sola, y hay un test que obliga a que la
   lista de motivos **coincida exactamente** con la realidad, en las dos direcciones.
3. **Dice qué hacer, no solo que existe.** «Un valor copiado de ese banco no lo caza
   nada: hay que mirarlo a mano» es accionable para quien está a punto de escribir un
   fixture; «el guardián no lee `.xls`» no lo era.
4. **Es lo único que la suite imprime.** 659 tests que no dicen nada y tres líneas que sí:
   la señal no compite con ruido. Y si algún día molesta, la salida correcta es **cerrar
   el hueco**, no callar el aviso.

**Sigo pensando —y lo dejo escrito— que el aviso es el mínimo, no el ideal.** El ideal es
que Trade Republic entre como JSON de producto (F20): ese día el fichero es texto, entra
en la captura, y el test se pone **rojo** hasta que se borre su entrada. El aviso está
diseñado para durar poco.

### Estado tras la segunda pasada

`./init.sh` **verde: 659 tests, 0 saltados** (647 al empezar la feature; +12 tests, todos
del guardián). `tsc`, `oxlint` y `prettier --check` limpios en todo lo tocado. **Cero
dependencias nuevas**, **ni un `no-real-data-ok` nuevo**, y el diff sigue sin salir del
guardián, sus tests y la documentación. **No se marca `done`**: vuelve al reviewer.

### Las dos aristas del veredicto APPROVED, arregladas antes de cerrar

Ninguna bloqueaba, y las dos eran baratas:

1. 🔴 **El comentario del test decía algo que nadie había medido.** Afirmaba que vitest
   parchea `console` **y** `process.stderr`, «both of which vitest patches». El reviewer
   lo midió y es **falso**: con `process.stderr.write` el aviso **también sale** (3 líneas
   con `pnpm test`). La aserción se queda —tener **un solo mecanismo bendecido** es lo que
   da la garantía— pero el porqué ahora dice la verdad, en el test
   ([:939](../../src/no-real-data.test.ts#L939)) y en el docstring de
   [`announceUnwatched`:868](../../src/no-real-data.test.ts#L868): *no* es «el otro no
   funciona», es «elegimos uno y lo fijamos, y cambiarlo exige volver a medir». Era
   exactamente el tipo de afirmación no verificada que tumbó la primera pasada.
2. ⚪ **Fuera el número mágico.** La ventana de 220 caracteres tenía 27 de margen sobre el
   `writeSync(2,` y se desbordaba 61 sobre el `describe` siguiente: un comentario dentro
   de la función la rompía y daba **rojo sin que nada estuviera mal**. Ahora la ventana es
   **el cuerpo real de la función** —de su firma a la primera línea que es solo `}`—, que
   es tan corto como el número y no depende de contar caracteres.

**Comprobado por mutación, las dos:** metiendo un comentario largo dentro de
`announceUnwatched` la suite sigue **24/24** (con el `220` se habría puesto roja), y
cambiando `writeSync(2, …)` por `console.warn(…)` se pone roja **por ese test exacto**
(1 failed | 23 passed). Restaurado, 24/24.
