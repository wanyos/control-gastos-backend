# Resumen — feature 23 `no-real-data-blind-spot`

Fecha de cierre: 2026-08-19
Intención original: `feature_list.json` → feature `no-real-data-blind-spot`, bloque `intent`
Spec: no aplica (`sdd: false`)

## Qué hace ahora la app que antes no

La app no cambia en nada: **esto es solo el guardián** que impide que tus datos acaben en
el repositorio.

Lo que cambia es **cuánto ve**. Hasta hoy el guardián solo abría ficheros con cinco
extensiones (`.txt .csv .json .md .tsv`), así que **tu fichero de Openbank no lo había
abierto nunca** —se llama `.xls` pero por dentro es una página HTML perfectamente
legible—, y resulta que es el único banco cuyo extracto lleva **nombres de personas**. Por
ahí se coló la fuga de la F19: importes tuyos copiados a un fixture, la suite entera en
verde, y lo cazó el revisor a mano.

Ahora el guardián decide qué abrir **mirando los bytes**, no el nombre del fichero: si se
lee como texto, entra. De 14 ficheros tuyos pasa a 16 (entran los dos `.xls` de Openbank),
y **sus importes y sus conceptos se comparan** contra todo lo versionado. Verificado con
tu fichero real: un importe suyo copiado a un archivo del repo pone la suite en rojo, y
una frase de tres palabras suya, también.

Y lo segundo, que es lo que evita el próximo agujero: **cuando el guardián no puede mirar
un banco, lo dice**. Antes callaba. Ahora un banco nuevo que no sepa leer **pone la suite
en rojo**, y el único que hoy no puede leer —Trade Republic, cuyo extracto es un PDF cuyo
texto no se recupera— sale **nombrado en la salida de `./init.sh` en toda ejecución**, con
qué significa y cómo se cierra.

## Por dónde se usa (puntos de entrada)

No hay endpoint ni comando nuevo: el guardián es un test y se dispara solo.

- `./init.sh` → ejecuta la suite y con ella el guardián. **Ahí es donde lo ves**: si hay
  un banco sin vigilar, imprime tres líneas antes del resumen. Si un dato tuyo está
  versionado, la suite se pone roja diciendo `archivo:línea`, **nunca el valor**.
- `pnpm test` → lo mismo, es lo que `init.sh` llama por dentro.
- Todo vive en un solo archivo: [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts).

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code (o con Ctrl/Cmd +
> clic): saltan a la línea exacta. Todo el código de esta feature está en un único
> archivo, así que las rutas se repiten a propósito.

### Qué se abre y qué no (la captura, el corazón de la feature)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Decide si unos bytes son binarios (NUL, o >1 % de bytes de control en los primeros 8 KiB) | `looksBinary` | [no-real-data.test.ts:152](../../src/no-real-data.test.ts#L152) |
| Descodifica sin lanzar nunca: UTF-8 y si no, cp1252 | `decodeCapture` | [no-real-data.test.ts:169](../../src/no-real-data.test.ts#L169) |
| Lee un fichero tuyo y devuelve «legible» o el porqué (`binary` / `too-large`) | `readCapture` | [no-real-data.test.ts:179](../../src/no-real-data.test.ts#L179) |
| Los ficheros de `var/` que sí se pueden comparar | `captureFiles` | [no-real-data.test.ts:205](../../src/no-real-data.test.ts#L205) |
| Tamaño máximo (32 MiB): lo que se pase cuenta como ilegible, no se ignora | `maxCaptureBytes` | [no-real-data.test.ts:133](../../src/no-real-data.test.ts#L133) |
| Umbrales de la decisión (8 KiB de muestra, 1 % de control) | `binarySampleBytes`, `controlByteRatio` | [no-real-data.test.ts:125](../../src/no-real-data.test.ts#L125) |

### El `.xls` de Openbank es HTML: se compara lo que dice, no sus etiquetas

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Detecta que una captura es marcado (HTML) | `looksLikeMarkup` | [no-real-data.test.ts:215](../../src/no-real-data.test.ts#L215) |
| Quita etiquetas y deja el texto; **conserva lo que dice el comentario HTML**, que es donde escribes tu IBAN | `markupText` | [no-real-data.test.ts:219](../../src/no-real-data.test.ts#L219) |
| Lo que vale la pena comparar de cada captura | `captureContent` | [no-real-data.test.ts:275](../../src/no-real-data.test.ts#L275) |
| Igual, pero tirando las **claves** de los `.json` (son nuestros nombres de campo, no tus datos) | `captureValuesText` | [no-real-data.test.ts:292](../../src/no-real-data.test.ts#L292) |

### El inventario de lo que no se puede vigilar

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Cuenta, banco a banco, cuántos ficheros hay y cuántos se pudieron leer | `bankCoverage` | [no-real-data.test.ts:331](../../src/no-real-data.test.ts#L331) |
| Bancos con ficheros, cero capturas y cero volcado = **hueco** (distinto de carpeta vacía) | `unwatchedNow` | [no-real-data.test.ts:352](../../src/no-real-data.test.ts#L352) |
| La lista declarada, con el motivo de cada uno y cómo se cierra (hoy: Trade Republic) | `unwatchedBanks` | [no-real-data.test.ts:369](../../src/no-real-data.test.ts#L369) |
| El texto del aviso (solo nombres de carpeta), o `null` si no hay nada que decir | `unwatchedAnnouncement` | [no-real-data.test.ts:885](../../src/no-real-data.test.ts#L885) |
| Lo escribe al **descriptor 2**, no por `console` (vitest se come la consola) | `announceUnwatched` | [no-real-data.test.ts:897](../../src/no-real-data.test.ts#L897) |

### La comparación contra el repositorio (partida en dos para poder probarla)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Recorre los archivos que le den, línea a línea (con ventana de 2 para prosa partida) | `scanSources` | [no-real-data.test.ts:591](../../src/no-real-data.test.ts#L591) |
| Lo mismo, pero sobre el repositorio entero vía `git` | `scan` | [no-real-data.test.ts:611](../../src/no-real-data.test.ts#L611) |
| Detecta un importe tuyo. **El mensaje ya no lleva la cifra**: dice dónde y de qué tipo | `amountLeak` | [no-real-data.test.ts:628](../../src/no-real-data.test.ts#L628) |
| Detecta una frase tuya de tres palabras | `phraseLeak` | [no-real-data.test.ts:640](../../src/no-real-data.test.ts#L640) |
| Trigramas de la línea buscados en un `Set` (el cambio que bajó la capa de frases de 2,4 s a 0,5 s) | `trigramsOf` | [no-real-data.test.ts:539](../../src/no-real-data.test.ts#L539) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Distingue binario de texto por los bytes, se llame como se llame el fichero | [no-real-data.test.ts:820](../../src/no-real-data.test.ts#L820) |
| Captura un `.xls` y deja fuera el binario de la misma carpeta | [no-real-data.test.ts:830](../../src/no-real-data.test.ts#L830) |
| De un HTML compara lo que dice, no las etiquetas; y el IBAN del comentario sobrevive | [no-real-data.test.ts:839](../../src/no-real-data.test.ts#L839) |
| Lee **tu** `.xls` real de Openbank (se salta solo si no está `var/`, que es gitignored) | [no-real-data.test.ts:855](../../src/no-real-data.test.ts#L855) |
| «Carpeta que no se puede leer» ≠ «carpeta vacía» | [no-real-data.test.ts:903](../../src/no-real-data.test.ts#L903) |
| El aviso nombra las carpetas, dice qué significa y calla si no hay hueco | [no-real-data.test.ts:926](../../src/no-real-data.test.ts#L926) |
| El aviso se escribe al descriptor 2 y **no** por `console` (la regresión de la 1ª pasada) | [no-real-data.test.ts:939](../../src/no-real-data.test.ts#L939) |
| El inventario coincide **exactamente** con la realidad, en las dos direcciones | [no-real-data.test.ts:957](../../src/no-real-data.test.ts#L957) |
| **El caso de la F19**: un importe copiado a un archivo versionado se caza, y el mensaje no lo transcribe | [no-real-data.test.ts:974](../../src/no-real-data.test.ts#L974) |
| Control negativo: un importe inventado no dispara nada | [no-real-data.test.ts:998](../../src/no-real-data.test.ts#L998) |
| Un concepto copiado a un documento se caza | [no-real-data.test.ts:1011](../../src/no-real-data.test.ts#L1011) |
| La regresión en una línea: se caza **a través del `.xls`**, que la lista de extensiones nunca abrió | [no-real-data.test.ts:1037](../../src/no-real-data.test.ts#L1037) |

### Documentación

| Qué | Dónde |
| --- | --- |
| ADR-017 revisado: qué mira, por qué no por extensión, los dos binarios, el hueco de Trade Republic y por qué el aviso no va por `console` | [docs/architecture.md:1218](../../docs/architecture.md#L1218) |
| §Tests: qué mira el guardián, qué hace ante un banco ilegible y por qué sus mensajes no llevan tu dato | [docs/conventions.md:127](../../docs/conventions.md#L127) |

## Cumplimiento de la intención

- ✅ «El fichero de Openbank, que se llama `.xls` pero por dentro es una página HTML, lo
  lee y compara como cualquier otro» → **se cumple**. Verificado en
  [`no-real-data.test.ts:855`](../../src/no-real-data.test.ts#L855) (lee tu fichero real)
  y, por el revisor, con dos pruebas de fuga contra el `.xls` que **no** tiene volcado:
  importe y frase, las dos cazadas.
- ✅ «Si mañana llega un banco con un formato que el guardián no puede leer, el test falla
  o me avisa diciendo qué banco no está vigilado: no se queda callado» → **se cumple**. Un
  banco nuevo ilegible pone la suite **en rojo**
  ([`:957`](../../src/no-real-data.test.ts#L957)) y el hueco ya declarado se **imprime**
  en la salida de `./init.sh` ([`:939`](../../src/no-real-data.test.ts#L939)).
- ✅ «El caso exacto de la feature 19 —un importe mío copiado a un archivo del
  repositorio— lo detectaría ahora» → **se cumple**. Test del mecanismo con fichero
  sintético en temporal ([`:974`](../../src/no-real-data.test.ts#L974)) y comprobación del
  revisor con tu fichero real, sin dejar rastro.
- ✅ «Sigue en verde con el repositorio de hoy; si encuentra algo real, se me dice y se
  arregla, no se silencia» → **se cumple**. `./init.sh` verde con **659 tests y 0
  saltados**; no apareció ninguna coincidencia nueva y **no se añadió ni una excepción**
  (`allowedIbans` y `allowedPaths` intactos, ni un `no-real-data-ok` nuevo).
- ✅ «No quiero que el guardián escriba mis datos en ningún sitio» → **se cumple**. Los
  mensajes dicen `archivo:línea` y el tipo, nunca el valor
  ([`:628`](../../src/no-real-data.test.ts#L628)); el aviso solo nombra carpetas; los
  ficheros de prueba se crean en un temporal **fuera del repo** y se borran al acabar.
- ✅ «No quiero que esto cambie los parsers ni el comportamiento de la aplicación» → **se
  cumple**. El diff no sale del guardián, sus tests y la documentación; `package.json` y
  `pnpm-lock.yaml` intactos, cero dependencias nuevas.

## Decisiones que se tomaron por ti

- **(delegado) Cómo se distingue texto de binario sin ir extensión por extensión:** por
  los **bytes** —un NUL, o más del 1 % de bytes de control en los primeros 8 KiB—. Vive en
  [`looksBinary`](../../src/no-real-data.test.ts#L152). Con eso tu `.xls` de Openbank
  entra (es HTML) y quedan fuera los dos binarios de verdad.
- **(delegado) Qué se hace con el `.xlsx` de Bankinter y el `.pdf` de Trade Republic:** no
  se leen. Meter bytes comprimidos en la comparación produce falsos positivos, y los
  falsos positivos enseñan a añadir excepciones. El `.xlsx` **ya está vigilado** por su
  volcado de `var/parsed/`; el PDF **no lo está por ninguna vía** y por eso se declara.
- **(delegado) Qué pasa con un banco que no se puede leer:** se distingue de «carpeta
  vacía», se declara en [`unwatchedBanks`](../../src/no-real-data.test.ts#L369) con su
  motivo y cómo se cierra, y **se imprime en cada `./init.sh`**. Uno **nuevo** rompe la
  suite; uno que pasa a ser legible también, hasta que se borre su entrada.
- **(delegado) Cómo se prueba el caso de la F19 sin datos reales:** fichero de banco
  **sintético** con la forma del de Openbank, en un directorio temporal fuera del repo, y
  un archivo versionado simulado. Con control negativo.
- **(añadido, no lo pediste) El mensaje de fallo dejó de transcribir el importe.** Antes
  decía «el importe X está en `var/`» — un guardián escribiendo tu dato para quejarse de
  que se escribe tu dato. Ahora dice dónde y de qué tipo.
- **(añadido) La capa de frases se reescribió por rendimiento.** Con los dos `.xls`
  dentro se pasaba del límite de 5 s y ponía la suite en rojo. **No se subió el límite**,
  se arregló el algoritmo: de **2,4 s a 0,5 s**, leyendo **más**. El archivo entero pasa
  de 3,0 s a 1,1 s.

## Qué NO se tocó / quedó fuera

- **Ni parsers, ni rutas, ni modelo de datos**: la aplicación se comporta exactamente
  igual que ayer.
- **No se amplió QUÉ se busca**, solo **dónde** se busca. Siguen sin cazarse los importes
  redondos o cortos (menos de 4 cifras significativas), los valores **derivados** de los
  tuyos y las **fechas**.
- **No se tocó `prisma/migrations/`**, que sigue siendo la única carpeta excluida y sigue
  teniendo una línea entera de tu extracto en un comentario SQL. Se cierra el día que la
  base se resetee por otro motivo.
- **No se intentó leer el PDF de Trade Republic.** Se probó (inflando sus flujos
  comprimidos): salen 336 caracteres de títulos y ni un importe. Decir «vigilado» sobre
  eso sería el bug de la F19 otra vez.

## Notas para el futuro

- 🟠 **Trade Republic no lo vigila nadie, hoy.** Si copias un valor de ese PDF a un
  archivo del repositorio, **el guardián no lo caza**: hay que mirarlo a mano. Se cierra
  solo cuando su JSON de producto (F20) aterrice en `var/drive-read/trade-republic/`: ese
  día es texto, entra en la captura y la suite se pone roja hasta que se borre su entrada
  de la lista. El aviso está diseñado para durar poco.
- 🟠 **Un banco cuyo `.xlsx` descargues y no parsees deja de estar vigilado sin que nadie
  lo diga.** La contabilidad por banco mira `var/drive-read/`; extenderla a `var/parsed/`
  es una feature pequeña y natural.
- 🟠 **El test intermitente de la base de datos sigue ahí** (`GET /api/movements`
  devolviendo error una de cada varias pasadas completas, ya anotado desde la F19). El
  revisor se lo encontró otra vez en una de sus ocho ejecuciones. No es de esta feature
  —ejecutado solo, ese archivo da 24/24— pero es la tercera feature seguida en que se
  aparta con una nota. **Merece feature propia**: un rojo intermitente enseña a ignorar
  los rojos, que es justo lo que esta feature vino a combatir.
- ⚪ Dos detalles menores señalados en la review y no bloqueantes: el comentario del test
  del descriptor 2 afirma que vitest intercepta `process.stderr` (medido: **no** lo hace,
  el aviso saldría igual), y ese mismo test usa una ventana de 220 caracteres sobre el
  código fuente que es algo frágil de mantener.
