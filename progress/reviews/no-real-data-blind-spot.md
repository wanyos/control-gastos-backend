# Review — F23 `no-real-data-blind-spot`

> **Veredicto final: APPROVED** (segunda pasada, al final de este archivo).
> Lo que sigue es la **primera pasada**, que devolvió `CHANGES_REQUESTED`; se conserva
> entera porque explica qué falló y cómo se comprobó.

## Primera pasada

**Veredicto:** CHANGES_REQUESTED

> Ni un dato del humano en este informe: solo recuentos, tamaños y tiempos. Las
> comprobaciones que necesitaron un valor suyo se hicieron con scripts que lo extraían
> y lo escribían sin imprimirlo, en archivos borrados en el mismo comando.

## Cambios requeridos

1. **[`src/no-real-data.test.ts:901`](../../src/no-real-data.test.ts#L901) — el aviso del
   hueco declarado NO se ve en ninguna ejecución normal.** El `console.warn` está
   interceptado por Vitest: con el reporter por defecto —que es el que usa
   `pnpm test` y por tanto `./init.sh`— **no se imprime nada**. Verificado tres veces:

   | Comando | ¿Sale el aviso? |
   |---|---|
   | `./init.sh` (grep sobre toda su salida) | **no** |
   | `pnpm test` (salida completa, 10 líneas) | **no** |
   | `npx vitest run src/no-real-data.test.ts` (stdout y stderr a archivo) | **no** |
   | `npx vitest run … --reporter=verbose` | sí |
   | `npx vitest run … --disableConsoleIntercept` | sí |

   El proyecto no configura ninguno de los dos últimos
   ([`vitest.config.ts`](../../vitest.config.ts): sin `reporters` ni
   `disableConsoleIntercept`). Consecuencia: **hoy la suite termina en verde y en
   silencio sobre Trade Republic**, que es literalmente el criterio 3 («no puede
   terminar en verde silencioso… debe distinguirse de carpeta vacía») y el `intent`
   («que me lo diga en vez de quedarse callado dando el visto bueno»).

   El mecanismo de la lista sí funciona en su otra mitad —un banco ilegible **nuevo** o
   uno que pasa a ser legible ponen la suite en rojo, verificado por mutación— pero el
   hueco **ya declarado** queda exactamente como la nota que nadie lee. La declaración
   tiene que ser visible en la salida normal de `./init.sh` (reporter, escritura directa
   a `stderr` fuera de la intercepción, o hacerla parte de la aserción/salida del test);
   qué mecanismo concreto es tu decisión, pero **la comprobación de que se ve tiene que
   hacerse ejecutando `./init.sh` y mirando su salida**, no dando por hecho que
   `console.warn` imprime.

2. **La documentación y el informe afirman como hecho verificado algo que no ocurre.**
   Hay que corregirlos junto con el punto 1 (no antes: si se arregla el mecanismo, el
   texto pasa a ser cierto y basta con reverificarlo):
   - [`docs/conventions.md:137`](../../docs/conventions.md#L137) — «el guardián **lo dice
     por su nombre en cada ejecución**».
   - [`docs/architecture.md:1223`](../../docs/architecture.md#L1223) y
     [`docs/architecture.md:1302`](../../docs/architecture.md#L1302) — «se nombra en cada
     ejecución» / «se imprime su nombre en **cada** ejecución».
   - [`progress/implementations/no-real-data-blind-spot.md:83`](../implementations/no-real-data-blind-spot.md#L83),
     [`:156`](../implementations/no-real-data-blind-spot.md#L156) («El aviso que ahora
     imprime cada ejecución, tal cual:») y
     [`:196`](../implementations/no-real-data-blind-spot.md#L196).
   - [`progress/current.md:35`](../current.md#L35) — misma frase.

   Es el mismo patrón que la F19: un texto que dice «vigilado» sobre algo que no se
   comprobó de verdad. Por eso bloquea, y no se acepta como detalle menor.

## Comprobado sin hallazgos

Todo lo demás pasa, y la parte gruesa de la feature está bien hecha.

**Criterio 1 — el `.xls` de Openbank entra y SE COMPARA (no solo se cuenta).** No me fié
del recuento. Prueba real, por las dos capas y con el fichero
`openbank/2026/openbank-2026-08-19.xls`, que es el que **no tiene volcado en
`var/parsed/`** (así la detección solo puede venir de la captura nueva):

- se localizó por script un importe *telling* presente **solo** en ese `.xls` (1 de los
  210 que aporta), se escribió en un `.md` sin versionar en la raíz del repo y el
  guardián se puso **rojo** señalando `archivo:línea`;
- ídem con una **frase de tres palabras** exclusiva de ese fichero (10 candidatas): rojo
  otra vez. Esa es la capa donde viven los nombres de personas, que es el motivo por el
  que se abrió la feature.
- Ambos archivos de prueba se borraron en el mismo comando (`ls` posterior confirma que
  no existen); ninguno llegó a `git add`.

**Criterio 2 — captura por contenido, y los binarios ni rompen ni ensucian.** Recuento
independiente sobre `var/` reproduciendo `looksBinary`: **18 ficheros, 16 capturados**,
coincide con el informe. Clasificación correcta uno a uno: el `.xlsx` de Bankinter y el
`.pdf` de Trade Republic salen **binarios** (el PDF por byte NUL, el ZIP por densidad de
control), los dos `.xls` de Openbank salen **texto y marcado** —confirmado que
`looksLikeMarkup` dispara sobre los ficheros reales, no solo sobre el sintético—, así
que sus etiquetas se descartan y no meten ruido de bytes. Cero falsos positivos: las dos
capas reales pasan en verde sobre el repo de hoy. El tope de 32 MiB
([`:132`](../../src/no-real-data.test.ts#L132)) contabiliza como ilegible en vez de
ignorar. La decisión está resuelta por escrito en el informe §1 y en el ADR-017.

**Criterio 3 — «no legible» ≠ «vacía».** El modelo (`bankCoverage:330`,
`unwatchedNow:351`, `unwatchedBanks:368`) es correcto y la aserción es en las dos
direcciones ([`:909`](../../src/no-real-data.test.ts#L909)). La parte que falla es solo
la **visibilidad del hueco ya declarado** → punto 1.

**Criterio 4 — el test del caso F19 falla si el mecanismo se rompe.** Verificado con dos
mutaciones locales, revertidas (md5 del archivo idéntico al original después de cada
una):
- comentarios HTML descartados enteros en `markupText` → cae «compares what a markup
  capture SAYS…» (es la línea del IBAN de la F19);
- `looksBinary` devolviendo siempre `true` (captura rota) → **9 tests en rojo**, incluidos
  los tres del mecanismo y el inventario por banco. Las dos capas reales se saltan, pero
  la suite **no queda verde**.

Además el test usa fichero sintético en `mkdtemp` fuera del repo, borrado en `afterAll`,
y tiene control negativo ([`:939`](../../src/no-real-data.test.ts#L939)). El código
ejercitado es el mismo que vigila el repositorio (`scanSources`/`amountLeak`/`phraseLeak`):
no hay copia paralela.

**Criterio 5 — verde con el repo de hoy y nada silenciado.** `./init.sh` verde ejecutado
por mí. `allowedIbans` y `allowedPaths` **sin cambios** en el diff; los marcadores
`no-real-data-ok` del árbol pasan de 29 a 32 y las tres apariciones nuevas son **prosa**
(el criterio en `feature_list.json`, una línea de `current.md` y el informe), ni una en
una línea de datos. Ninguna coincidencia real nueva apareció al ampliar la captura.

**Criterio 6 — ni un valor suyo escrito en ningún sitio.** Comprobado con el método de
la F19, cruzando contra los ficheros gitignoreados: los mensajes de fallo que produjeron
mis dos pruebas contienen **solo** `archivo:línea` y el tipo de coincidencia; la salida
de Vitest al fallar imprime el array de hallazgos, no la línea infractora; el aviso lleva
solo nombres de carpeta; los temporales viven en `os.tmpdir()`, fuera del repo. El informe
del implementer y los dos docs tocados están limpios de valores suyos (recuentos, tamaños
y tiempos; los ejemplos citados son sintéticos y ya documentados).

**Criterio 7 — la app no cambia.** `git status` limpio salvo el guardián, dos docs,
`feature_list.json` y `current.md`. Ni parsers, ni rutas, ni Prisma, ni `package.json`,
ni `pnpm-lock.yaml` (cero dependencias). *Observación al margen*: el árbol trae también
los cuatro archivos de `specs/trade-republic-product-file/` modificados (puerta de
aprobación de la F20, trabajo del leader); no son de esta feature ni de esta revisión.

**Criterio 8 — coste, medido por mí, no leído del informe.** Ejecutando el archivo del
guardián en HEAD y en el árbol de trabajo:

| | HEAD | Ahora |
|---|---|---|
| Capa de importes | 123 ms | 118 ms |
| Capa de frases | **2.506 ms** | **549 ms** |
| Archivo completo | 3,00 s | 1,09 s |
| Ficheros de `var/` leídos | 14 | 16 |

Suite completa 4,4-4,5 s, `./init.sh` 6,4 s. Se lee **más** y se tarda **menos**, y el
timeout de 5 s no se tocó.

**Criterio 10 y verificación.** `./init.sh` **verde: 39 archivos, 657 tests, 657 pasan,
0 saltados** (baseline 647), con la capa de comparación **activa** (no saltada: se
comprobó que ambas ramas de `var/` están presentes). `tsc --noEmit` y
`prettier --check` limpios sobre lo tocado. Trazabilidad criterio↔test completa en el
informe y verificada test a test.

**CHECKPOINTS C1-C5.** C1 arnés e `init.sh` en verde; C2 una sola feature `in_progress`
(F23, correctamente sin marcar `done`); C3 estructura y convenciones respetadas, sin
logs de debug sueltos (el `console.warn` es deliberado) y sin dependencias nuevas; C4
tests por camino feliz y de error, con control negativo; C5 sin ficheros sin trackear
sospechosos (solo el informe de la feature) e `history.md` con su línea de la F22. **C6**
no aplica (no toca el contrato). **C7** no aplica (`sdd: false`). **C8** no procede: con
`CHANGES_REQUESTED` no se escribe el resumen de cierre.

**C4 bis** — se da por cubierto en sustancia, con una observación **no bloqueante**: esta
feature no añade parser, pero sí estrena lectura de los ficheros reales del humano, y esa
pasada real ocurrió (18 ficheros abiertos, 16 capturados, tamaños, 336 caracteres
recuperables del PDF, tiempos) **con recuentos y forma, nunca contenido**. Lo único
discutible es la ubicación: está en el informe de implementación y no en
`progress/explorations/prueba-real-<tema>-<fecha>.md`. Si al cerrar quieres el histórico
ordenado, se mueve; no condiciona el veredicto.

## La vara que pidió el humano: ¿habría saltado sola con el fixture de la F19?

**Sí, y está demostrado con el fichero real, no con el sintético.** Un importe copiado de
ese `.xls` a un archivo versionado pone la suite en rojo hoy, y una frase de tres palabras
también. El agujero de la F19 —el guardián dando verde sobre un fichero que nunca abrió—
está cerrado.

Lo que queda abierto es el **otro** agujero, el que esta feature descubrió: Trade Republic
no lo vigila nadie, y la única señal de eso es un aviso que **no se imprime**. Cerrar el
primero dejando el segundo anunciado en un canal mudo es repetir la forma del fallo a
menor escala. De ahí el `CHANGES_REQUESTED`: el arreglo es pequeño y todo lo demás está
listo.

---

# §Segunda pasada (2026-08-19)

**Veredicto:** APPROVED

Los dos puntos que bloquearon están **cerrados y verificados con mi método, no con el
suyo**: ejecutando y mirando la salida, no leyendo el diff.

## 1. El aviso se ve (era el punto que bloqueó)

Repetida la comprobación **exactamente igual** que en la primera pasada —`grep` sobre la
salida completa, **sin flags añadidos**, sin `--reporter=verbose` ni
`--disableConsoleIntercept`—:

| Comando | Primera pasada | Ahora |
|---|---|---|
| `./init.sh` (salida completa a fichero) | **0 líneas** | **3 líneas**, y nombra `trade-republic` |
| `pnpm test` | **0** | **3** |
| `npx vitest run src/no-real-data.test.ts` | **0** | **3** |

Sale en **las 5 ejecuciones completas** que hice (3 de `./init.sh` + 2 de `pnpm test`),
siempre las 3 líneas, y **arriba del todo**: en una salida de `pnpm test` de 12 líneas,
3 son el aviso. Dice el banco, dice **qué significa** (que un valor copiado de ese banco
no lo caza nada y hay que mirarlo a mano) y **dónde está el motivo**. Solo nombres de
carpeta, ni un valor suyo.

**Verificado además que la regresión está realmente cubierta**, por mutación local
revertida (md5 idéntico después):

- `writeSync(2, …)` → `console.warn(…)`: el aviso **desaparece** de la salida de
  `pnpm test` (`grep -c` = **0**) **y** el test nuevo se pone rojo. Es decir: el test
  no es decorativo, caza exactamente el fallo de la primera pasada.

## 2. El test que lee su propio fuente: sí protege, con dos aristas

[`src/no-real-data.test.ts:939`](../../src/no-real-data.test.ts#L939). Es un test raro
—aserción **textual** sobre el código, no sobre la conducta— y aun así lo doy por bueno:
la conducta real (¿llega al terminal?) no se puede observar desde dentro del propio
runner que la intercepta sin lanzar un subproceso, y el proxy elegido caza el 100 % del
caso que ya ocurrió. **Comprobado por mutación, no por lectura.**

Las dos aristas, ninguna bloqueante:

- **Sí daría un falso rojo con `process.stderr.write`, y el comentario que lo justifica
  no es exacto.** El comentario de [`:939`](../../src/no-real-data.test.ts#L939) dice que
  vitest parchea `console` **y** `process.stderr`, «both of which vitest patches». Lo
  medí: cambiando la escritura a `process.stderr.write(announcement)`, **el aviso SÍ
  siguió saliendo** en la salida de `pnpm test` (3 líneas), pero el test se puso **rojo**.
  O sea: prohíbe una alternativa que **funciona**, apoyándose en un motivo que no se
  verificó. Es el mismo tipo de afirmación no comprobada que bloqueó la primera pasada,
  aunque aquí es inofensivo —**yerra por el lado seguro**: rechaza algo que funciona, en
  vez de aceptar algo que no—. Sugerencia: dejar la aserción (tener **un solo** mecanismo
  bendecido es razonable) y **corregir el porqué**, que hoy dice algo falso.
- **El `220` es un número mágico.** La ventana va de `function announceUnwatched` a
  +220 caracteres; la función mide **159**, y `writeSync(2,` cae en el **132**. Margen
  corto: un comentario dentro de la función lo empuja fuera y da rojo sin que nada esté
  mal. Además la ventana **se desborda 61 caracteres** sobre el `describe` siguiente
  (hoy inofensivo) y `indexOf` encuentra la primera de **3** apariciones del literal, que
  es la buena **solo porque la función está antes del test**. Falla ruidosamente y se
  arregla en un minuto, pero es mantenimiento que alguien pagará.

## 3. Su argumento de por qué este aviso sí se leerá: me convence a medias, y basta

Convence en lo verificable, que es lo que me toca a mí:

- **Está donde ya se mira** — la salida de `./init.sh`, que `AGENTS.md` obliga a ejecutar
  al abrir y al cerrar sesión. La nota anterior vivía en `current.md`, que hay que ir a
  buscar. **Comprobado**: sale a dos pantallas del resumen final.
- **No lo mantiene nadie a mano** — el texto se deriva del estado real de `var/` en cada
  ejecución, y un test obliga a que la lista de motivos coincida **exactamente** con la
  realidad, en las dos direcciones. La nota anterior era una frase escrita una vez.
- **Es accionable y no compite con ruido**: 659 tests mudos y 3 líneas que hablan.

Donde **no** me convence del todo, y lo dejo como **observación no bloqueante** porque la
decisión de fondo es tuya: un aviso que no rompe nada se acaba puliendo, y **este
repositorio tiene la prueba en casa** — el test intermitente de la F12 lleva anotado como
🟠 desde la F19, ha aparecido en tres informes, y sigue exactamente igual. Los avisos que
no bloquean tienen aquí un historial de no convertirse en acción. Dicho eso, el
implementer **lo reconoce por escrito** («el aviso es el mínimo, no el ideal»), explica
por qué fallar sería peor (romper la suite por un PDF sin arreglo enseña a ignorar los
rojos) y el hueco **se autodestruye** con la F20. Cumple el criterio 3; el juicio sobre si
prefieres un rojo es tuyo.

## 4. La corrección de textos está completa (con un resto)

Repasados **todos** los sitios que afirmaban lo que no ocurría. `grep "cada ejecución"`
sobre `docs/`, `current.md`, el informe y el guardián: **no queda ninguna** afirmación
falsa. Ahora dicen *dónde* se ve (en la salida de `./init.sh`), *cómo* (descriptor 2) y
*por qué no por `console`*:

- [`docs/conventions.md:137`](../../docs/conventions.md#L137) ✅ corregido y ampliado.
- [`docs/architecture.md:1223`](../../docs/architecture.md#L1223) y
  [`:1302`](../../docs/architecture.md#L1302) ✅ corregidos; además dejan **escrito el
  fallo** para que nadie lo reintroduzca «por limpieza». Eso es lo correcto.
- [`progress/current.md`](../current.md) ✅ corregido.

**Resto pendiente, no bloqueante:**
[`progress/implementations/no-real-data-blind-spot.md:163`](../implementations/no-real-data-blind-spot.md#L163)
dice «El aviso que imprime toda ejecución …, **tal cual**:» y a continuación pega **el
mensaje viejo** (el de una línea en minúsculas, que ya no existe). El texto real son las
3 líneas en mayúsculas. Es la misma trampa de la primera pasada en pequeño: un «tal cual»
que no es tal cual. Conviene corregirlo antes de cerrar, pero no condiciona el veredicto.

## 5. Nada de lo aprobado en la primera pasada se ha movido

`diff` del guardián entre las dos pasadas: **solo** el `import` de `writeSync`, las dos
funciones del aviso y los dos tests nuevos. Ni una línea de la captura, el marcado, la
contabilidad o los mensajes. Reverificado a mano de todas formas:

- **Comparación real del `.xls` de Openbank** — repetidas mis dos pruebas con el fichero
  que **no** tiene volcado en `var/parsed/`: un importe exclusivo suyo → **rojo**; una
  frase de tres palabras exclusiva suya → **rojo**. Los dos ficheros de prueba, borrados
  en el mismo comando y confirmados inexistentes; ninguno llegó al índice de git.
- **Captura por contenido y binarios** — recuento independiente: **18 ficheros, 16
  capturados**; `.xlsx` y `.pdf` fuera, los dos `.xls` dentro y detectados como marcado.
  Idéntico a la primera pasada.
- **Mensajes sin valores** — los hallazgos de mis pruebas siguen diciendo solo
  `archivo:línea` y el tipo. El aviso, solo nombres de carpeta.
- **Comportamiento de la app** — el diff sigue sin salir del guardián, dos docs,
  `feature_list.json` y `current.md`.
- **`package.json` y `pnpm-lock.yaml`** — `git diff` **vacío**: intactos, cero
  dependencias.
- **Sin silenciadores nuevos** — `allowedIbans` y `allowedPaths` sin tocar; las
  apariciones nuevas de `no-real-data-ok` son **prosa** (criterio, `current.md` e
  informes), ninguna en una línea de datos.

## 6. `./init.sh`, ejecutado por mí

**Verde: 39 archivos, 659 tests, 659 pasan, 0 saltados** (647 al empezar la feature),
con la capa de comparación **activa**, y con el aviso presente en todas.

⚠️ **Una de mis ejecuciones salió ROJA, y no es de esta feature.** Es obligatorio
decirlo: `src/modules/movements/movements.test.ts` («orders the same day by daySequence
descending»), con `response.json().filter is not a function` —o sea, un `GET
/api/movements` devolviendo un error en vez de la lista—. Es **la flakiness preexistente
ya documentada** en [`progress/current.md:417`](../current.md#L417) desde la F19 (un test
de la F12 que falla una de cada tres pasadas completas, con `GET /api/movements`
devolviendo 500), y volvió a asomar en otra de mis ejecuciones en `import.routes.test.ts`,
el archivo exacto que cita esa nota. Atribución: el diff de la F23 **no toca código de
aplicación**, `movements.test.ts` está sin modificar respecto a git, y **ejecutado solo
da 24/24 en verde**. Mi cómputo total: **7 verdes y 1 roja**, siempre 659/659 y 0
saltados en las verdes.

No bloqueo por eso —sería castigar a esta feature por un fallo que ya estaba y que se
aceptó al cerrar la F19 y la F22— pero lo digo con todas las letras: **es la tercera
feature seguida en la que un reviewer se topa con ese rojo y lo aparta**. Es exactamente
el patrón que la F23 vino a combatir (una señal que se aprende a ignorar), y ya toca
abrirle feature propia en vez de otra nota.

## Comprobado sin hallazgos

Criterios 1-10 revisados otra vez de punta a punta: los que ya pasaban siguen pasando con
la evidencia rehecha (§5), y el 3 —el que bloqueó— ahora se cumple de verdad y está
medido (§1). CHECKPOINTS: **C1** arnés e `init.sh` verde; **C2** una sola feature
`in_progress`, correctamente sin marcar `done`; **C3** arquitectura, convenciones, sin
dependencias nuevas y sin logs de debug sueltos (el `writeSync(2, …)` es deliberado,
documentado y con test); **C4** camino feliz, de error y control negativo, con dos
mutaciones que confirman que los tests no son vacíos; **C4 bis** cubierto en sustancia
(recuentos y forma, nunca contenido) con la observación de ubicación ya hecha en la
primera pasada; **C5** sin ficheros sin trackear sospechosos (informe y esta review) e
`history.md` al día; **C6** no aplica; **C7** no aplica (`sdd: false`); **C8** cumplido:
[`progress/summaries/no-real-data-blind-spot.md`](../summaries/no-real-data-blind-spot.md).

## La vara del humano, otra vez: ¿habría saltado sola con el fixture de la F19?

**Sí, demostrado con su fichero real** (§5), y ahora además **el hueco que queda se oye**:
las tres líneas salen en la misma pantalla en la que se decide si algo está listo. El
guardián ya no da verde sobre lo que no ha mirado, y cuando no puede mirar algo, lo dice
donde se lee.

Resumen de cierre: [`progress/summaries/no-real-data-blind-spot.md`](../summaries/no-real-data-blind-spot.md).
