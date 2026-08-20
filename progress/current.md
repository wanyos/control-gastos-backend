# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.


## F25 `reimport-from-local-copy` — CERRADA el 2026-08-20

Feature **sin spec** (`sdd: false`): manda su `acceptance` de 10 criterios. Parte del
[diagnóstico del 2026-08-20](explorations/diagnostico-bankinter-sin-persistir-2026-08-20.md)
(opciones (b) + (e) de su §3). Plan:

1. Extraer de `importFile` la parte que no es Drive (parsear → resolver cuenta → mapear →
   persistir) para que la reimportación local la reutilice sin duplicar reglas.
2. `POST /api/import/local` con cuerpo opcional `{ bank?, year?, name? }` que recorre
   `var/drive-read/<banco>/<año>/`, **sin cliente de Drive** y sin mover ni borrar nada.
3. Copia local ausente → **404 `LOCAL_COPY_NOT_FOUND`** nombrando lo que no se encontró;
   nunca «0 ficheros importados».
4. Tapar el §1.4: cero movimientos parseados **no** se cuenta como `imported` ni mueve el
   fichero a `procesados/` (dos códigos nuevos, según el caso).
5. Documentar en `docs/api-contract.md` y ADR-025; mapeo criterio→test en
   [`implementations/reimport-from-local-copy.md`](implementations/reimport-from-local-copy.md).

Los 5 puntos del plan están, con las **dos decisiones delegadas** y el mapeo criterio→test
por escrito en
[`implementations/reimport-from-local-copy.md`](implementations/reimport-from-local-copy.md).
**`reviewer`: APPROVED en segunda pasada**
([`reviews/reimport-from-local-copy.md`](reviews/reimport-from-local-copy.md)), tras
comprobar ejecutando el 404 en sus dos casos y en las once combinaciones restantes, el
dedup intacto, **cero llamadas a Drive también en el camino del 404** y la salvedad del
parser escrita justo antes de la llamada sin cuerpo. En la primera pasada pidió dos
cambios, ambos aplicados: (1) el 404 ahora **nombra el banco pedido** cuando su carpeta
existe pero no tiene copias dentro, con dos tests nuevos; (2) contrato y **ADR-025** dicen
que la idempotencia vale **si el parser no ha cambiado desde la importación original**, y
qué hacer en su lugar. F25 a **`done`** en `feature_list.json` y línea añadida en
[`history.md`](history.md). `./init.sh` verde: **767/767** (739 antes, **+28**).

> 👤 **Qué cambia para ti:** `procesados/` **deja de ser una puerta de un solo sentido**.
> Un archivo que ya está ahí se vuelve a importar **desde la copia local**, sin que entres
> en Drive a mover carpetas —lo que hoy tuviste que hacer a mano con Bankinter—, y esa vía
> **no toca tu Drive**: ni descarga, ni mueve, ni borra. Y un archivo del que **no entra ni
> un movimiento** deja de decirte que lo ha importado: sale como fallo, con motivo, y se
> queda pendiente. **Ojo al único límite que queda**: la llamada **sin cuerpo** solo es
> inocua mientras el parser de ese banco sea el mismo con el que se importó; sobre copias
> antiguas, pide **el archivo concreto** y mira el recuento.

- ✅ **Por dónde se pide** (decisión delegada, resuelta por escrito): **ruta nueva**
  `POST /api/import/local`, no una bandera de la que ya hay — las dos operaciones tienen
  garantías distintas (una mueve lo que guarda, la otra no mueve nunca) y no podía
  depender de leer bien un campo del cuerpo. El archivo se identifica **por su ruta**
  (banco + año + nombre), porque en disco no hay id y el nombre no es identificador.
- ✅ **Dónde se corta «cero movimientos»** (decisión delegada, resuelta por escrito): son
  **tres casos** — sin ninguna línea → `EMPTY_STATEMENT`; con líneas y ninguna
  interpretable → `ALL_ROWS_UNPARSED` (los dos **fallan y no mueven**); todas duplicadas →
  `imported: 0, duplicates: n` y **sí mueve**, porque todas sus filas están guardadas. En
  corto: se llega a `procesados/` **solo si al menos una fila del archivo está en la base
  de datos**.
- ⚠️ **Cabo suelto documentado, no cerrado:** `daySequence` se recalcula al parsear, así
  que un parser que hoy lee una fila que antes no leía **renumera el día** y puede insertar
  copias al reimportar. Escrito en `docs/api-contract.md` y en el ADR-025 con qué hacer en
  su lugar; arreglarlo de raíz es otra feature, con migración.
- 🐞 **Flake conocido, no tapado:** la **primera** ejecución de la sesión, antes de tocar
  código, falló en `import.routes.test.ts` (R3, un 500 en `GET /api/movements`); la
  siguiente, con el mismo código, 739/739. Mismo patrón que el de
  `movements.test.ts:318`.


## F24 `guardian-own-words` — CERRADA el 2026-08-20

Feature **sin spec** (`sdd: false`): de los **10 criterios de `acceptance`**. Sale del
[Hallazgo 2 de la prueba real de Trade Republic](explorations/prueba-real-trade-republic-2026-08-20.md).
**`reviewer`: APPROVED en segunda pasada**
([`reviews/guardian-own-words.md`](reviews/guardian-own-words.md)), tras atacar la
invariante nueva con **20 formas de entrecomillado** sin perder una frase, comprobar que
los importes siguen intactos y que el ruido se calla **solo** por la condición (b). F24 a
**`done`** en `feature_list.json` y línea añadida en [`history.md`](history.md).
Informe con el mapeo criterio→test y **las dos decisiones por escrito**:
[`implementations/guardian-own-words.md`](implementations/guardian-own-words.md) ·
veredicto: [`reviews/guardian-own-words.md`](reviews/guardian-own-words.md) ·
resumen: [`summaries/guardian-own-words.md`](summaries/guardian-own-words.md).

> 👤 **Qué cambia para ti:** el guardián de tus datos **deja de gritar por sus propias
> palabras**. Cuando un fichero tuyo se rechaza, el volcado se queda con el mensaje que
> escribe *nuestro* programa, y la documentación publica ese mismo mensaje: el guardián
> lo leía como «una frase de su extracto copiada en los docs» y soltaba **270 avisos
> falsos**. Ahora distingue las dos cosas, **sin bajar la guardia**: los cinco importes
> que ese mensaje lleva dentro se siguen vigilando igual, y el aviso de que Trade
> Republic no estaba vigilado **ha desaparecido** porque ya hay un `.json` tuyo legible.

- ✅ **Cómo se separan** (decisión delegada, resuelta por escrito): **por tramo**, y solo
  donde coinciden **dos** condiciones — (a) el tramo está **fuera de las comillas** (todo
  valor tuyo se devuelve entrecomillado) **y** (b) la frase está **literal en el código
  de producción** (sin tests ni fixtures). Un dato tuyo devuelto sin comillas falla (b) y
  se sigue vigilando; una frase nuestra entrecomillada por error falla (a) y también.
- ✅ **El hueco de los cinco importes NO se abrió:** descartar el `reason` entero era una
  línea y habría dejado de vigilar importes reales. **La capa de importes no se ha
  tocado**: sigue mirando el texto crudo, motivos incluidos. Hay test que lo fija.
- ✅ **`unwatchedBanks` queda vacía:** la entrada de `trade-republic` se borró, tal y como
  su propio texto ordenaba, y el test que exige que la lista sea exactamente el estado
  real sigue **sin debilitar**.
- ✅ **Cero excepciones nuevas**: ni una ruta añadida, ni un `no-real-data-ok`, ni una
  frase quitada de los docs. Los `docs/` **ganan** texto (ADR-017 y `conventions.md`).
- 🟠 **Lo único que se estrecha, dicho en voz alta:** una frase copiada **a caballo entre
  dos campos** de un volcado ya no se caza — esa frase no está escrita en ningún fichero
  tuyo, es la costura de nuestro JSON, y el extracto original se sigue comparando entero.
- `./init.sh`: **736/736 verde**, con la capa de comparación **activa** (nada de `var/`
  se ha borrado ni movido). La **primera** pasada cayó en el **flake conocido** de
  `movements.test.ts:318`, ajeno a este diff; la segunda, verde.
- 🔁 **Segunda pasada (review CHANGES_REQUESTED, cerrada el 2026-08-20).** El reviewer
  encontró un **silencio** que el código y los docs declaraban imposible: un valor tuyo
  con **apóstrofo dentro** (`COMPRA D'ALIMENTS…`, y los hay en conceptos de tarjeta
  reales) entrecomillado con simples partía el corte por dentro del valor, cada mitad
  caía en un cubo distinto y **el concepto entero dejaba de compararse** — una
  **regresión**, porque antes de la F24 ese motivo se comparaba entero. **Arreglado de
  fondo:** el motivo **ya no se trocea**, va entero a la comparación y lo entrecomillado
  se añade encima, así que un corte mal puesto solo puede hacer que algo se compare **dos
  veces**, nunca menos. Tres tests nuevos lo fijan (los tres se ponen rojos si alguien
  repone el troceo) y la afirmación falsa está corregida en los **tres** sitios donde
  estaba escrita. `./init.sh`: **739/739**.
- ✅ **Cerrada:** F24 en **`done`**, con su línea en `history.md` —que **corrige** el
  final de la línea de la F23, donde Trade Republic quedaba «sin vigilancia»— y su
  [resumen de cierre](summaries/guardian-own-words.md).
- ✅ **La F20 `trade-republic-product-file` ya está cerrada** (2026-08-20, tras su prueba
  real): `in_progress` queda en **cero** y `./init.sh` deja de marcar `[FAIL]` en el paso
  3. Tipos y **739 tests**, verdes.

---

## F23 `no-real-data-blind-spot` — CERRADA el 2026-08-19

**`reviewer`: APPROVED en segunda pasada**
([`reviews/no-real-data-blind-spot.md`](reviews/no-real-data-blind-spot.md) §Segunda
pasada), tras repetir **él** la comprobación del aviso sin flags (de **0 líneas a 3**, en
las 5 ejecuciones completas) y confirmar **por mutación revertida** que el test nuevo se
pone rojo si alguien vuelve a `console.warn`. `./init.sh` verde: **659 tests, 0
saltados** (baseline 647; +12, todos del guardián). F23 a **`done`** en
`feature_list.json` y línea añadida en [`history.md`](history.md).

Feature **sin spec** (`sdd: false`): del `intent` y de los **10 criterios de
`acceptance`**. Sin lotes: un solo implementer.
Informe: [`implementations/no-real-data-blind-spot.md`](implementations/no-real-data-blind-spot.md)
(cada criterio con su(s) test(s)) ·
veredicto: [`reviews/no-real-data-blind-spot.md`](reviews/no-real-data-blind-spot.md) ·
resumen: [`summaries/no-real-data-blind-spot.md`](summaries/no-real-data-blind-spot.md).

> 👤 **Qué cambia para ti:** el guardián que impide que tus datos acaben en el
> repositorio **mira ya todos tus ficheros de banco**. El `.xls` de Openbank —el único
> que trae **nombres de personas**, y el que **nunca se había abierto**: por ahí pasó la
> fuga de importes de la F19 con la suite entera en verde— entra y se compara como
> cualquier `.csv`. Y lo que **no** puede vigilar te lo dice **por su nombre en la salida
> de `./init.sh`**, en toda ejecución, en vez de darte el visto bueno callado.

1. ✅ **La captura la deciden los bytes, no la extensión** (delegada nº 1, resuelta por
   escrito): binario = un NUL o > 1 % de bytes de control en los primeros 8 KiB. Medido
   sobre `var/`: **de 14 a 16 ficheros capturados**, y los dos que entran son exactamente
   los dos `.xls` de Openbank (+338 KB). Una lista de extensiones vuelve a dejar un hueco
   dentro de un año; esto no.
2. ✅ **Los dos binarios de verdad quedan fuera y se dice por qué:** el `.xlsx` de
   Bankinter (ZIP) ya está vigilado por su volcado de `var/parsed/`; el `.pdf` de Trade
   Republic no lo está por ninguna vía. Leerlos como texto metería ruido de bytes → falsos
   positivos → excepciones, que es cómo se desarma un guardián. Se **probó** extraer el
   texto del PDF con `zlib` (sin dependencias): salen 336 caracteres de títulos y **ni un
   importe**, así que decir «vigilado» sería el bug de la F19 otra vez.
3. ✅ **De un fichero de marcado se compara lo que DICE, no sus etiquetas** (las del
   `.xls` son el formato del banco, que nuestro parser reproduce), conservando lo que dice
   el **comentario HTML** donde él escribe su IBAN.
4. ✅ **Contabilidad por banco** (delegada nº 2): carpeta con ficheros y **ninguno
   capturable** ≠ carpeta **vacía**. Un hueco se **imprime**, vive en `unwatchedBanks` con
   su motivo y con cómo se cierra, y el test exige que esa lista sea **exactamente** el
   estado real **en las dos direcciones**: un banco ilegible nuevo pone la suite en
   **rojo**, y uno que pase a ser legible también hasta que se borre su entrada.
5. ✅ **El caso de la F19, probado con fichero de banco sintético** en directorio temporal
   (delegada nº 3), con control negativo: el test falla si el mecanismo deja de detectar
   **y** si detecta de más. Y **el mensaje deja de transcribir el importe**: dice
   `archivo:línea` y el tipo, nunca el valor.
6. ✅ **Ni un `no-real-data-ok` nuevo, ninguna excepción añadida, cero dependencias.** Al
   ampliar la captura **no apareció ninguna coincidencia real nueva**. Docs: **ADR-017
   revisado** y `conventions.md` §Tests.
7. ⏱ **Coste medido, porque cambió:** la primera versión rebasó el `testTimeout` de 5 s
   con los dos `.xls` dentro. **No se subió el timeout**, se arregló el algoritmo de la
   capa de frases (trigramas de la línea contra un `Set`, en vez de cada frase contra cada
   línea): **2.429 ms → 523 ms** *con más datos capturados que antes*.

> 🟠 **SIGUE ABIERTO, y es información que conviene no perder de vista: Trade Republic no
> lo vigila nadie.** Su extracto es un **PDF** cuyo texto vive en flujos comprimidos con
> fuentes subset, así que no se recupera; y volcado no habrá, porque la F20 decidió que
> ese banco entra como **JSON de producto**. **Si alguien copia un importe de ese PDF a un
> archivo del repositorio, no lo caza nada**: hay que mirarlo a mano, como hizo el reviewer
> de la F19. No está resuelto: está **declarado y a la vista** —sale en la salida de
> `./init.sh` en toda ejecución— y **se cierra solo** el día que ese JSON aterrice en
> `var/drive-read/trade-republic/`, que es cuando el test se pondrá rojo para obligar a
> borrar la entrada.

### Las dos pasadas del reviewer, en corto

- 🔴 **Primera: CHANGES_REQUESTED**, y el fallo era real: el aviso del hueco era un
  `console.warn` y **vitest intercepta la consola**, así que con el reporter por defecto
  —el de `./init.sh`— **no se imprimía nada**. La suite terminaba **verde y en silencio**
  sobre Trade Republic, que es justo el criterio 3 y la frase que originó la feature.
  Arreglado escribiendo al **descriptor 2** (`writeSync(2, …)`, fuera del alcance de
  cualquier reporter), **verificado con `grep` sobre la salida real de `./init.sh`** y con
  dos tests nuevos, uno comprobado por mutación.
- ⚪ **Al aprobar dejó dos aristas, arregladas antes de cerrar:** un comentario que
  afirmaba **sin medirlo** que vitest parchea también `process.stderr` (es **falso**: por
  ahí también sale; la aserción se queda, pero ahora dice la verdad — «un solo mecanismo
  elegido y fijado», no «el otro no funciona»), y un **número mágico** de 220 caracteres
  para acotar la ventana del test, sustituido por **el cuerpo real de la función**. Las
  dos comprobadas por mutación.

> ⚠️ **Anotado, no es de esta feature:** `src/modules/movements/movements.test.ts` («GET
> /api/movements lists newest first…») devuelve **500 en vez de 200** en **2 de 7**
> pasadas completas; **ejecutado solo, 24/24 en verde**. Es la flakiness preexistente ya
> anotada más abajo (carrera de la suite de integración contra Postgres). El diff de la
> F23 no sale del guardián.

---

## Prueba real de Openbank (2026-08-19) y la F22 que sale de ella

Informe: [`explorations/prueba-real-openbank-2026-08-19.md`](explorations/prueba-real-openbank-2026-08-19.md).

✅ **El parser cumple con el fichero de verdad:** 200 movimientos, 0 sin parsear,
histórico entero (2024-08-28 → 2026-08-17), saldo leído del preámbulo, ni un concepto
vacío y **ni un `U+FFFD`** con los acentos del banco.

🔴 **El camino completo falló, y no por el código.** Él añadió la línea del IBAN
abriendo el fichero con **Visual Studio Code** y dándole a guardar: VS Code leyó como
UTF-8 un fichero cp1252, convirtió sus **8 acentuados en `U+FFFD` de forma
irreversible** y lo reguardó en UTF-8 **dejando la declaración `iso-8859-1` intacta**.
El parser leyó lo que el fichero declaraba, la cabecera le llegó rota y falló con
`VALIDATION_ERROR`: **«el archivo no es un extracto de este banco»**, que es **falso**.
**Falló ruidosamente —lo correcto—, pero el mensaje manda al sitio equivocado.**
`importedCount: 0`, nada persistido, fichero no movido a `procesados/`: nada que
deshacer. **Su línea del IBAN está bien escrita**, verificado sobre copia reparada de
prueba (IBAN leído, 200 movimientos, 0 sin parsear).

→ **F22 `encoding-mismatch-guard`** creada a petición suya (`pending`, `sdd: false`,
10 criterios) y `implementer` lanzado: mensaje que diga que el fichero se **reguardó en
otra codificación**, motivo propio para el `U+FFFD` («ya no tiene arreglo, vuelve a
descargarlo»), sin adivinar ni reparar, sin debilitar la guardia de la F19 y con el
runbook contado para **VS Code** —el editor que usa de verdad— y no solo para el Bloc
de notas.

> ✅ **CERRADO el mismo día:** redescargó el extracto, lo reabrió en VS Code con
> `Reopen with Encoding` → **`Western (ISO 8859-1)`** —su VS Code **no ofrecía ninguna
> entrada «Windows 1252»**, solo las `ISO`, así que el runbook se corrigió por eso—,
> escribió la línea del IBAN y lo guardó. **Openbank ya está en la base de datos.**

### Pasada 3: el camino entero en verde

`POST /api/import`: **201 importados, 0 duplicados, 0 sin parsear, 0 fallidos**, cuenta
**creada** y fichero **movido a `procesados/`**. Histórico entero (2024-08-28 →
2026-08-19), **0 conceptos vacíos**, **0 `U+FFFD`** y **0 señales de mojibake inverso**
(`Ã`/`Â`): el guardado fue limpio en las dos direcciones. `balanceAfter` `null` en los
201 y divisa `EUR`. La base de datos pasa de **2 cuentas y 215 movimientos a 3 y 416**.

Dos observaciones, ninguna es fallo: la **divisa vacía del parser se vuelve `EUR` al
persistir** (confirma que el punto 🔴 6 estaba bien resuelto: el parser no inventa, y el
euro lo pone la capa que sí lo sabe), y **tres movimientos idénticos del mismo día**
entran como tres, distinguidos por `daySequence` 2/3/4 — justo para lo que existe ese
campo.

> 📊 **Balance de la sesión:** la F19 llegó a la prueba real con **628 tests en verde** y
> la prueba encontró **dos cosas que ningún test podía ver**: la fuga de importes al
> fixture (la cazó el reviewer; el guardián de la F14 **no lee `.xls`**) y el mensaje
> mentiroso ante un fichero reguardado (**F22**, abierta y cerrada el mismo día). Mismo
> patrón que con N26 el 2026-08-18.

> ⚪ **Anotado del leader:** al diagnosticar dejó la copia local de `var/drive-read/` en
> cero bytes (un `open(…, 'wb')` que truncó antes de fallar el `encode`). Restaurada del
> respaldo, sin pérdida —es un espejo que se rebaja en cada import—, pero queda dicho.

## F22 `encoding-mismatch-guard` — CERRADA el 2026-08-19

Feature **sin spec** (`sdd: false`): se trabajó del `intent` y de los **10 criterios
de `acceptance`**. Sin lotes: un solo implementer.

Nace de la prueba real del 2026-08-19: VS Code releyó como UTF-8 el `.xls` cp1252
de Openbank, dejó **8 `U+FFFD`** y lo reguardó **en UTF-8** con el `<meta>`
diciendo todavía `iso-8859-1`. El parser leyó cp1252 (que es lo correcto según lo
que el fichero declara), la cabecera salió como mojibake y el error fue
`VALIDATION_ERROR` «no se encuentra la cabecera… no es un extracto de este banco»:
ruidoso, pero **falso**.

**`reviewer`: APPROVED sin hallazgos que bloqueen**
([`reviews/encoding-mismatch-guard.md`](reviews/encoding-mismatch-guard.md)), con
`./init.sh` ejecutado por él: **verde, 647 tests, 0 saltados** (baseline 628),
`package.json` y `pnpm-lock.yaml` **intactos frente a git**, los **10 criterios**, los
CHECKPOINTS C1-C8 y el 🔒 de la F14 comprobados con el método de cruce de la F19. F22 a
**`done`** en `feature_list.json` y línea añadida en [`history.md`](history.md).
Informe: [`implementations/encoding-mismatch-guard.md`](implementations/encoding-mismatch-guard.md)
(cada criterio con su(s) test(s)) ·
veredicto: [`reviews/encoding-mismatch-guard.md`](reviews/encoding-mismatch-guard.md) ·
resumen: [`summaries/encoding-mismatch-guard.md`](summaries/encoding-mismatch-guard.md).

> ✅ **Verificado también FUERA de los tests, contra el caso que lo originó:** el leader
> pasó la guardia nueva por el **fichero real dañado** (`var/drive-read/…`, gitignoreado)
> vía `POST /api/parser/openbank`, y el rechazo salió con el motivo correcto — declara
> `iso-8859-1`, se ha reguardado en UTF-8, trae el carácter de sustitución con su línea, y
> manda a **redescargarlo del banco** y a guardarlo con **Western (Windows-1252)**. Ya no
> dice, como el 2026-08-19 por la mañana, que el archivo no sea un extracto de este banco.

> 👤 **Qué cambia para ti:** si abres el archivo de Openbank con **Visual Studio Code** y
> le das a guardar sin más —que es lo que hiciste—, el backend te lo dice **con el motivo
> verdadero**: que el fichero se ha vuelto a guardar en otra codificación y con cuál hay
> que guardarlo (**Western/Windows-1252**), o, si las tildes ya salen como `�`, que
> **están perdidas** y hay que volver a descargarlo del banco. El runbook explica los dos
> comandos exactos de VS Code (`Reopen with Encoding` / `Save with Encoding`) y avisa de
> que el guardado por defecto de un editor moderno **destruye este fichero sin avisar**.
> Un archivo bueno entra exactamente igual que antes.

Plan, ejecutado y aprobado:

1. ✅ Guardia nueva en `src/lib/cp1252.ts` (`detectResaveAsUtf8`): señal **comprobable**
   —bytes que son UTF-8 válido **con secuencias multibyte** en un fichero que declara
   cp1252/iso-8859-1— más la línea del primer `U+FFFD`. Sin adivinar codificaciones.
2. ✅ El parser de Openbank la llama entre la comprobación de la declaración y la
   descodificación, y lanza `UnexpectedEncodingError` con **dos motivos distintos**
   (reguardado / caracteres ya perdidos), los dos diciendo **qué hacer**.
3. ✅ Tests: caso exacto del 2026-08-19, `U+FFFD`, no-regresión con **200 movimientos y
   0 `unparsedRows`**, guardia de la F19 intacta y los otros tres bancos sin cambio.
4. ✅ Docs: ADR-023, `api-contract.md`, `conventions.md` y el runbook con **Visual
   Studio Code** (reabrir con Western/Windows-1252), no solo el Bloc de notas.
5. ✅ `./init.sh` verde con 0 saltados (baseline 628) e informe en
   [`implementations/encoding-mismatch-guard.md`](implementations/encoding-mismatch-guard.md).

> 🟠 **Sigue pendiente lo tuyo, y la F22 no lo sustituye:** Openbank **todavía no ha
> entrado en la base de datos**. Hay que **redescargar** el extracto (las tildes del
> fichero que hay en Drive están perdidas), volver a escribir la línea del IBAN
> (`<!-- iban;TU-IBAN -->`, primera línea) y guardarlo con **Western/Windows-1252**.
> Lo que cambia es que ahora, si algo va mal, el error te lo dirá bien. Detalle arriba,
> en la sección de la prueba real.

---

## F19 `openbank-statement` — CERRADA el 2026-08-19

**`reviewer`: APPROVED en segunda pasada**
([`reviews/openbank-statement.md`](reviews/openbank-statement.md) §Segunda pasada),
tras rehacer la comprobación de fuga **con su propio método**: 286 cifras y 399
pares contiguos del fichero real cruzados contra las **61 cifras** que escribe la
feature, **0 coincidencias y 0 pares**. `./init.sh` verde: **628 tests, 0
saltados**. F19 a **`done`** en `feature_list.json` y línea añadida en
[`history.md`](history.md).

Feature **SDD** con spec aprobado por el humano (los 6 puntos 🔴 confirmados en
[`decisions.md`](../specs/openbank-statement/decisions.md)). Un solo implementer
para los **cinco lotes** de `tasks.md`: **T1-T29 marcadas `[x]`**.
Informe: [`implementations/openbank-statement.md`](implementations/openbank-statement.md)
(cada `R<n>` y **cada criterio de `acceptance`** con su test) ·
veredicto: [`reviews/openbank-statement.md`](reviews/openbank-statement.md) ·
resumen: [`summaries/openbank-statement.md`](summaries/openbank-statement.md).

> 👤 **Qué cambia para ti:** el archivo de **Openbank entra tal y como lo
> descargas** —el que se llama `.xls` y por dentro es una página web—, con sus
> **dos años de histórico completos** y **sin convertirlo a mano ningún mes**. El
> **saldo de la cuenta lo saca del propio archivo**: aquí no escribes la línea
> `saldo;`. Lo único que escribes es el **IBAN, una sola vez**, en la primera
> línea y con esta forma exacta: `<!-- iban;TU-IBAN -->` — ábrelo con el **Bloc de
> notas, nunca con Excel** (Excel lo reescribiría entero). Si algún día Openbank
> cambia la codificación de su archivo, **te lo dirá fallando**, en vez de meterte
> 200 conceptos con las tildes rotas en silencio.

1. ✅ **`src/modules/openbank/`** (7 archivos + 5 de test): lector de **HTML
   propio y sin ninguna dependencia nueva** (`cheerio` descartado por él),
   formato español del banco, parser, servicio, rutas, tipos y fixture sintético.
2. ✅ **Codificación (delegada nº 2), resuelta por escrito:** la regla «siempre
   UTF-8» **se acota, no se rompe** — lo que escribe él sigue en UTF-8 (MyInvestor
   y N26 **sin tocar**, con test de regresión) y lo que emite el banco se lee con
   la codificación de ese banco: `decodeCp1252Strict` en
   [`src/lib/cp1252.ts`](../src/lib/cp1252.ts). **ADR-022** + `conventions.md` +
   runbook.
   > 🔎 **Medido y no supuesto:** cp1252 **mapea los 256 bytes**, así que no falla
   > nunca; un fichero que llegara en UTF-8 entraría con los 200 conceptos en
   > mojibake **sin un solo error**. Por eso el parser **exige que el fichero
   > declare su codificación** y lo rechaza entero con `UNEXPECTED_ENCODING` (422)
   > si no lo hace.
3. ✅ **Dónde escribe él el IBAN (delegada nº 3), resuelta por escrito** en
   `docs/dar-de-alta-un-banco.md`: **comentario HTML en la primera línea**,
   `<!-- iban;<IBAN> -->`, leído solo antes de `<table>`, con `;` (con `:` no
   vale) y validado por el normalizador único de la F21.
4. ✅ **El saldo de la cuenta sale del propio fichero** (fila `Saldo:` del
   preámbulo); las otras cuatro filas del preámbulo se ignoran **en silencio**.
   La divisa de cada movimiento queda **vacía**.
5. 📌 **Queda constancia:** el fichero **sí trae el saldo tras cada movimiento**
   (única de los seis bancos) y **a propósito no se guarda** — `balance` sigue
   `null` y el **ADR-013 no se toca**. Escrito en el informe §4, en el parser y en
   `api-contract.md`, para que no haya que redescubrirlo.
6. ✅ `POST /api/parser/openbank` + la línea del registro de `src/app.ts` (lo que
   hace que `/api/import` deje de reportar sus `.xls` como `skipped`). Guardianes
   de `architecture.test.ts` generalizados a **cuatro** bancos.
7. ✅ Docs: **ADR-022** (+ nota en ADR-018), `conventions.md`,
   `dar-de-alta-un-banco.md`, `api-contract.md` (§Parser de Openbank y el código
   `UNEXPECTED_ENCODING`) y `roadmap.md` (**4 de 6 bancos**, quedan 2 parsers).
8. ✅ **`./init.sh` verde: 628 tests, 628 pasan, 0 saltados** (baseline 535), con
   la capa de comparación del guardián de la F14 **activa**. `oxlint` y
   `prettier --check` limpios en todo lo tocado. **Cero dependencias nuevas.**

> 🔒 Guardián de la F14, contado como pasó de verdad: los **cinco nombres de
> columna** se escribieron **uno por línea con su comentario** en los dos sitios
> donde aparecen —la trampa que saltó en la F18—, arreglado **en la raíz y sin
> añadir ni un `no-real-data-ok`**. Los **conceptos, el titular y el CCC** de los
> fixtures estuvieron inventados desde el principio… pero **los IMPORTES no**: en
> la primera pasada se colaron **cifras reales del extracto** (una fila entera con
> su saldo, y otras en el mismo orden relativo que el fichero real), y el informe
> llegó a afirmar lo contrario. **Lo destapó el reviewer y se corrigió en la
> segunda pasada**: cifras inventadas de cero —no «perturbadas»—, con otro orden
> relativo y otros pares contiguos, y verificación explícita contra el fichero
> gitignoreado. Lección, que es lo que hay que recordar: el 🔒 de `tasks.md` dice
> «ni un **importe**, concepto, IBAN, CCC ni nombre», y el ADR-017 va de **datos
> financieros**, no solo de personas.

### Segunda pasada — el reviewer devolvió CHANGES_REQUESTED (5 puntos, uno solo de fondo)

**El rechazo fue el 🔒 y solo el 🔒: había IMPORTES REALES del extracto de Openbank
en archivos versionados.** Los conceptos, el titular y el CCC sí estaban
inventados; las cifras no. Todo lo demás lo aprobó el reviewer y **no se ha
tocado**. Detalle completo en el informe §Segunda pasada; veredicto en
[`reviews/openbank-statement.md`](reviews/openbank-statement.md).

1. ✅ **Cifras inventadas de cero, no «perturbadas»:** `openbankSampleRows()`
   reescrita entera (importes **y** saldos), con **otro orden relativo** y **otros
   pares contiguos** —el par contiguo era justo lo que delataba una fila copiada—.
   Se conservan las propiedades que los tests prueban (miles, coma decimal, signo,
   céntimos ≠ 00, el `0,00` del caso neutral, el ilegible y las dos filas
   repetidas).
2. ✅ Mismo arreglo en el **docstring de `parseAmountText`** (llevaba el **saldo
   real de su cuenta**), en los `expect()` de `openbank.format.test.ts` —
   actualizados, no borrados—, en las cifras al vuelo de los demás tests y en el
   ejemplo de `docs/api-contract.md` §Parser de Openbank.
3. ✅ **Cabecera de `openbank.fixture.ts` corregida** (afirmaba que todo estaba
   inventado) y ampliada con la instrucción para quien toque una cifra.
4. ✅ **Las dos afirmaciones falsas del informe, corregidas** —no reescritas—: el
   🔒 de `tasks.md:8` dice «ni un **importe**, concepto, IBAN, CCC ni nombre», y yo
   lo leí como «ni un nombre».
5. ✅ **Verificado a mano, con tres reglas y auto-probando el verificador**: la del
   propio guardián de la F14 (≥ 4 dígitos significativos) aplicada al `.xls` que
   **ese guardián hoy no lee**, la de **pares contiguos** del reviewer, y una
   exacta sobre los archivos de esta feature. **0 coincidencias en las tres.** El
   script vive fuera del repo y ninguna cifra real se ha transcrito a ningún
   archivo versionado, este incluido.
6. ✅ **Ni un `no-real-data-ok` nuevo.** Arreglado en la raíz.
7. ✅ **`./init.sh` verde otra vez: 628 tests, 0 saltados**; `oxlint` y
   `prettier --check` limpios. **El reviewer aprobó esta segunda pasada** tras
   rehacer la comprobación con su propio método (0 coincidencias, 0 pares), y con
   eso la feature quedó **`done`**.

> ⚠️ **Hallazgo del reviewer que NO es de esta feature:** el guardián de la F14
> **no compara `.xls`**, así que el único banco cuyo fichero trae nombres de
> personas es justo el que no vigilaba. Por eso la fuga pasó con la suite en
> verde. Anotado abajo, en «Anotado, no se abre ahora», **pendiente de que lo
> decida el humano**.

> ⚠️ **Anotado, no reproducido:** una ejecución intermedia de `./init.sh` dio **1
> test fallido sin poder identificar cuál** (salida truncada); las **cuatro**
> siguientes, en verde 628/628 sin tocar nada. Posible flakiness preexistente de
> la suite de integración contra Postgres. Está en el informe.

> 📌 **Lo que le toca a él:** escribir el comentario del IBAN **una sola vez** en
> su fichero de Openbank (Bloc de notas, **no Excel**) y probar el camino real.

---

### Primera review: CHANGES_REQUESTED (5 puntos), y el motivo es uno solo

[`reviews/openbank-statement.md`](reviews/openbank-statement.md). Todo lo demás lo dio
por bueno **comprobado, no leído del informe**: `./init.sh` verde (**628 tests, 0
saltados**), `package.json` y `pnpm-lock.yaml` **intactos frente a git** (cero
dependencias nuevas), los 6 puntos de la puerta cumplidos uno por uno, la guardia UTF-8
de la F17 **no debilitada** (test de regresión), ADR-013 intacto, contrato común sin
redeclarar y las dos decisiones delegadas resueltas por escrito.

🔒 **El rechazo es el guardián de la F14: hay importes reales del fichero del humano en
archivos versionados** — el fixture (una fila entera copiada, y cuatro importes más en
el mismo orden relativo que el extracto real), un docstring de `openbank.format.ts` que
lleva **el saldo real de la cuenta**, tres aserciones de `openbank.format.test.ts`, un
ejemplo de `api-contract.md`, y el punto 🔒 de arriba y el informe **afirmando lo
contrario**. Los conceptos, el titular y el CCC **sí** estaban inventados (comprobado
palabra a palabra). `implementer` relanzado: inventar esas cifras de verdad —sin
perturbar las reales, sin reproducir el orden relativo ni los pares (importe, saldo)
contiguos— y **sin añadir ni un `no-real-data-ok`**.

> 🐞 **Por qué la suite en verde no lo vio, y es lo que más deja esta review:**
> [`src/no-real-data.test.ts:74`](../src/no-real-data.test.ts#L74) solo compara
> `.txt .csv .json .md .tsv` — **el `.xls` de Openbank no se lee**, aunque sea texto
> plano; y no existe `var/parsed/openbank/`, que es la otra vía. El único banco cuyo
> fichero trae **nombres de personas** es justo el que el guardián no comparaba por
> ninguna de las dos. «El guardián corrió con su capa activa» era cierto y **no probaba
> nada para este banco**. **Tarea aparte anotada** (toca la F14, no entra en la F19):
> añadir `.xls`/`.html` a `captureExtensions`, o exigir el volcado a
> `var/parsed/<banco>/` antes de cerrar un banco nuevo.


## F21 `iban-normalization` — CERRADA el 2026-08-18

**`reviewer`: APROBADO sin cambios requeridos**
([`reviews/iban-normalization.md`](reviews/iban-normalization.md)), con el camino real
ejecutado contra la base de datos del humano. `./init.sh` verde: **535 tests, 0
saltados**. F21 a **`done`** en `feature_list.json` y línea añadida en
[`history.md`](history.md). Sin spec (`sdd: false`): se trabajó del `intent` y de los
**9 criterios de `acceptance`**.
Informe: [`implementations/iban-normalization.md`](implementations/iban-normalization.md) ·
veredicto: [`reviews/iban-normalization.md`](reviews/iban-normalization.md) ·
resumen: [`summaries/iban-normalization.md`](summaries/iban-normalization.md).

> 👤 **Qué cambia para ti:** el IBAN **puedes escribirlo como quieras** —con espacios
> de cuatro en cuatro o del tirón, en mayúsculas o en minúsculas— y es siempre la
> misma cuenta: se acabó que el mismo IBAN escrito de dos formas te creara **dos
> cuentas** en silencio. A cambio, **un dígito mal tecleado ya no cuela**: ese fichero
> se rechaza entero con `INVALID_IBAN` (422), diciéndote la línea y el problema por su
> nombre, y **no se crea ninguna cuenta** — antes te creaba una con pinta de buena. No
> hay que reimportar nada ni cambia la forma de escribir la línea (`iban;<IBAN>`, con
> `;`; con `:` sigue fallando).

Sale del 🔴 que dejó la [prueba real de N26](explorations/prueba-real-n26-2026-08-18.md)
§Pasada 2: el IBAN se guardaba **literal**, así que el mismo IBAN con y sin
espacios creaba **dos cuentas**, en silencio, en los tres bancos.

Plan y estado:

1. ✅ **Un solo normalizador+validador** en [`src/lib/iban.ts`](../src/lib/iban.ts)
   —un IBAN no es el formato de un banco, es el identificador ISO de una cuenta—,
   consumido por los **tres** parsers (`readPreambleIban`) y por las **dos**
   entradas del servicio de cuentas (`requireValidIban`). El `normalizeIban` que
   vivía en `accounts.service.ts` **se movió, no se reexportó**.
2. ✅ **Validación con dígito de control mod-97** (decisión del humano en la
   puerta), más forma y longitud del país. Error nuevo `InvalidIbanError` →
   **`INVALID_IBAN`, 422**, que **rechaza el fichero entero** con el nº de línea y
   el problema por su nombre, y no crea ninguna cuenta.
3. ✅ **`:` sigue fallando** (decisión del humano): `firstSeparatorIndex` no se ha
   tocado, y hay test que lo fija en dos bancos.
4. ✅ **Las tres decisiones delegadas, resueltas por escrito** en el informe:
   dónde vive el normalizador, qué es «un IBAN válido» y con qué código se
   rechaza, y **por qué NO se escribe migración** (las dos cuentas de hoy ya están
   en forma canónica y el normalizador es idempotente: el `UPDATE` no cambiaría
   ninguna fila).
5. ✅ Docs: **ADR-021** en `architecture.md`, `api-contract.md` (código estable,
   `POST /api/accounts`, códigos por archivo de `/api/import` y contrato del
   parser), `conventions.md` §Parsers de banco (dos normas nuevas),
   `dar-de-alta-un-banco.md`, `data-model.md` (el comentario de `Account.iban`) y
   `roadmap.md` §Deberes tuyos.
6. ✅ **`./init.sh` verde: 535 tests, 535 pasan, 0 saltados** (baseline 493), con
   la capa de comparación del guardián de la F14 **activa**.

> 🐞 **Efecto colateral que destapó la feature, y estaba bien destaparlo:** los
> `uniqueIban()` de cuatro suites construían `ES` + timestamp — longitud imposible
> y dígito de control aleatorio. Con la validación puesta, esos fixtures dejaron de
> pasar por su propia puerta. Se arreglaron con
> [`src/lib/iban.fixture.ts`](../src/lib/iban.fixture.ts), que calcula los dígitos
> de control **con el propio validador**. Era el fixture el que estaba mal.

> 🔒 Guardián de la F14: ningún IBAN nuevo escrito en un archivo versionado. El
> español es el ejemplo público de la documentación (ya en la lista blanca), el
> alemán tiene el cuerpo **todo ceros** con los dígitos de control calculados, y los
> de `syntheticIban()` **solo existen en tiempo de ejecución**. Y ojo con el efecto
> de la F18: al redactar el ADR se evitó a propósito transcribir el prefijo del IBAN
> real que citaba el `intent`.

> ✅ **Saneado después de la review (leader, 2026-08-18):** el **prefijo truncado** del
> IBAN real que el reviewer dejó anotado como observación **no bloqueante** ya no está:
> se limpió en el `intent` y en un criterio de la F21 de `feature_list.json` y en
> [`explorations/prueba-real-n26-2026-08-18.md`](explorations/prueba-real-n26-2026-08-18.md).
> Solo textos de documentación: **ni código ni tests**. La nota 3 de «Notas para el
> futuro» del resumen queda por tanto atendida (el resumen no se reescribe: es del
> reviewer).

### Anotado, no se abre ahora

- ✅ **CERRADO por la F23 el 2026-08-19** (ver arriba): el guardián ya lee el `.xls` de
  Openbank, la captura la decide el **contenido** y no una lista de extensiones, y un
  banco que no puede leer sale **por su nombre en la salida de `./init.sh`**. Queda vivo
  y declarado el caso de **Trade Republic** (PDF). Se conserva el texto original porque
  explica **por qué** pasó la fuga de la F19:
- 🟠 **El guardián de la F14 no vigila el fichero de Openbank, y es el único banco
  cuyo fichero trae nombres de personas.** Lo descubrió el reviewer de la F19 y es
  lo que explica que la fuga de importes pasara con la suite en verde: la capa de
  comparación de [`src/no-real-data.test.ts`](../src/no-real-data.test.ts) solo lee
  `.txt .csv .json .md .tsv`, así que **no abre el `.xls`** (que es texto plano,
  HTML, y perfectamente comparable), y la otra vía —el volcado de `var/parsed/`—
  tampoco existe hoy para este banco. **Tarea aparte y pendiente de que decidas
  tú**, porque toca la F14 y no la F19: las salidas sobre la mesa son añadir
  `.xls`/`.html` a las extensiones que compara, o exigir el volcado parseado antes
  de dar por cerrado un banco nuevo. **Mientras no se haga, un `0 saltados` del
  guardián no prueba nada para Openbank.**
- 🟠 **Un test de la F12 falla una de cada tres pasadas completas**
  (`src/modules/import/import.routes.test.ts`, «lists the imported movements most
  recent first»: un `GET /api/movements` que devuelve 500). Lo vimos el implementer
  y el reviewer por separado, en ejecuciones distintas; **ejecutado solo, pasa**.
  Huele a carrera de la suite de integración contra Postgres en paralelo. No es de
  la F19 y no bloqueó nada, pero un rojo intermitente enseña a ignorar los rojos,
  que es lo caro.

- 🟠 Escribir `iban:` con dos puntos acaba en `MISSING_ACCOUNT_DATA` («no hay iban en
  el fichero»), que es verdad pero manda a añadir una línea **ya escrita**. Decirlo
  mejor tocaría el buscador de preámbulo, que el criterio 6 dejaba fuera de límites.
  Candidato a feature pequeña.
- ⚪ `prettier --check` sigue fallando en `myinvestor.product.parser.test.ts`, como ya
  fallaba antes de esta feature. `init.sh` no lo ejecuta.

---

## Sesión anterior (2026-08-17 / 18): el inventario de bancos y la F18

- **Tarea en curso (2026-08-17):** **inventario de bancos y diagnóstico de sus
  ficheros**. No es una feature: se leyeron las muestras que el humano subió a
  Drive (10 ficheros, 5 carpetas de banco pendientes, 10/10 descargados sin
  fallo) y se diagnosticó cada formato. Informe:
  [`explorations/inventario-bancos-2026-08-17.md`](explorations/inventario-bancos-2026-08-17.md).
  Resultado: **6 bancos, 4 parsers por escribir**; el inventario de
  `docs/ideas.md` queda relleno y la **E4 desbloqueada**. Quedan **6 decisiones
  del humano** anotadas en el informe (4 bloquean) y **4 tareas suyas**:
  re-exportar Revolut con movimientos, renombrar la carpeta `N26` → `n26`,
  escribir el IBAN de N26 y Openbank, y decidir. **No se tocó código ni se
  ejecutó `POST /api/import`.**
## Las tres features que abre el inventario (2026-08-17)

El humano decidió el mismo día, en la puerta de aprobación. **Revolut se aparca**
(hoy sin movimientos ni saldo): sus carpetas se quedan en Drive y se retoma con un
archivo con datos. **No se le abre feature.**

| # | Feature | Spec | Estado |
|---|---|---|---|
| F18 | `n26-statement` | no | ✅ **`done`** (2026-08-18) — **APPROVED** en segunda pasada ([review](reviews/n26-statement.md)), resumen en [`summaries/n26-statement.md`](summaries/n26-statement.md) |
| F19 | `openbank-statement` | **sí** | ⏸ **`spec_ready`** — esperando al humano ([decisions](../specs/openbank-statement/decisions.md), 6 puntos) |
| F20 | `trade-republic-product-file` | **sí** | ⏸ **`spec_ready`** — esperando al humano ([decisions](../specs/trade-republic-product-file/decisions.md), 6 puntos) |

**Las cuatro decisiones que cerró él**, y que ni el spec ni el implementer deben
reabrir:

1. **El IBAN de Openbank lo escribe él**, una vez. El backend **no** lo deriva del
   CCC, aunque se comprobó que la derivación es exacta (checksum válido).
2. **El `balance` por línea sigue a `null`.** Openbank es el único banco que lo
   reporta y aun así no se guarda: el ADR-013 no se toca en la F19.
3. **El histórico de Openbank entra entero**, los dos años y los 200 apuntes.
4. **Trade Republic entra como `.json` de producto**, foto del saldo, al estilo de
   los de MyInvestor — **no** como parser del PDF. Provisional y reversible el día
   que esa cuenta tenga movimientos de verdad.

**Decisión del leader que él debe ratificar (F18, criterio 5):** las dos líneas de
preámbulo (`iban;…` y `saldo;…`) se escriben con `;` **también en el CSV de comas
de N26**. Una sola forma de escribirlo en todo el proyecto, y la línea nuestra se
distingue a simple vista de las del banco.

### F18 `n26-statement` — CERRADA el 2026-08-18

**Segunda pasada del `reviewer`: APPROVED**
([`reviews/n26-statement.md`](reviews/n26-statement.md) §Segunda pasada). `./init.sh`
verde: **493 tests, 0 saltados**. Resumen de cierre (C8) en
[`summaries/n26-statement.md`](summaries/n26-statement.md); F18 a **`done`** en
`feature_list.json`, línea añadida en [`history.md`](history.md) y `docs/roadmap.md`
actualizado (N26 ✅, quedan **3 parsers por escribir**). Las F19 y F20 siguen en
`spec_ready`, esperando al humano.

### Cómo se corrigió la primera review (2026-08-17)

**Primera review: CHANGES_REQUESTED** ([`reviews/n26-statement.md`](reviews/n26-statement.md)),
dos puntos, los dos arreglados (detalle en el informe §Segunda pasada):

- 🔴 **El saldo a la española perdía los céntimos, en silencio.** La línea de
  preámbulo no es una fila de la tabla, pero el lector de CSV la partía por la
  coma antes de que el buscador de etiquetas la viera: `Saldo;1.234,56` daba
  `1234` y **sin aviso en `unparsedRows`**. Arreglado en el código (no en la
  documentación, que decía la verdad): `CsvRecord` gana `raw` —la línea tal cual—
  y el buscador corta **solo por el primer separador**, así que la coma decimal
  es parte del valor. La variante con coma también conserva los céntimos ahora.
- **Los tests no podían ver el fallo**: todos usaban `1500,00`, céntimos `00`.
  `n26Preamble()` pasa a `1.234,56` (con la nota de por qué no redondearlo),
  test nuevo con 5 casos de céntimos ≠ 0 y bloque nuevo para `raw`.

**`./init.sh` verde otra vez: 493 tests, 0 saltados.** Sigue en `in_progress`.

### F18 — primera pasada (2026-08-17)

Feature no-SDD: se trabajó del `intent` + los 13 criterios de `acceptance`.
Informe: [`implementations/n26-statement.md`](implementations/n26-statement.md)
(cada criterio con su test). Estado en `feature_list.json`: **`in_progress`** —
no se marca `done` hasta el veredicto del reviewer.

1. ✅ `src/modules/n26/` (7 archivos + 5 de test): lector de **CSV con comillas
   propio del banco** ([`n26.csv.ts`](../src/modules/n26/n26.csv.ts) — primer
   fichero del repo que no se puede leer partiendo la línea), formatos, parser,
   servicio, rutas, tipos y fixture sintético.
2. ✅ Preámbulo `iban;…` / `saldo;…` con **`;` también en este fichero de comas**
   (criterio 5, decisión del leader), etiquetas tolerantes y las tres reglas de
   la F16 (ausente/ilegible/repetida). `decodeUtf8Strict` como primer paso.
3. ✅ **Decisión delegada del criterio 11, resuelta por escrito:** el concepto se
   **compone** de contraparte + referencia libre (y el tipo de apunte como último
   recurso). Ningún movimiento sale con concepto vacío y ninguna columna sobrante
   se convierte en campo nuevo. Argumentario en el informe y en el **ADR-020**.
4. ✅ `POST /api/parser/n26` + la línea del registro de `src/app.ts` (lo que hace
   que `/api/import` deje de reportar sus ficheros como `skipped`). Guardián de
   «un parser por banco» **generalizado a los tres**.
5. ✅ Docs: `api-contract.md` (§Parser de N26), `dar-de-alta-un-banco.md`,
   `conventions.md` y **ADR-020** en `architecture.md`.
6. ✅ **`./init.sh` verde: 490 tests, 490 pasan, 0 saltados** (baseline 412), con
   la capa de comparación del guardián de la F14 **activa**.

> 🐞 El guardián de la F14 saltó durante el desarrollo, y **no** por un dato del
> humano: escribir los **nombres de las 11 columnas seguidos** reproduce una
> secuencia de palabras del fichero real. Arreglado en la raíz (un comentario por
> línea que rompe la secuencia y documenta la columna), **sin añadir ni un
> `no-real-data-ok`**. A tener en cuenta en la F19: la cabecera de Openbank tiene
> el mismo problema.

### 🐞 Arreglado de paso: el subagente `spec_author` no existía para el harness

Su archivo estaba en `.claude/agents/spec_author.md` desde el 12-ago, pero **el
registro de agentes nunca lo cargó**: los otros tres (`leader`, `implementer`,
`reviewer`) sí. La única diferencia era el **guion bajo** del nombre. Renombrado a
`spec-author` (archivo, frontmatter y las referencias de `CLAUDE.md`, `AGENTS.md`,
`.claude/agents/*`, `docs/specs.md`, `docs/intent-template.md` y `specs/README.md`;
`progress/` se deja como registro histórico). **No está verificado**: el registro se
lee al arrancar la sesión, así que se comprueba en la siguiente. Los dos specs de
esta sesión se sacaron con el rol inyectado a mano.

### 📌 Lo que le toca al humano

1. ✅ **Renombrada la carpeta `N26` a `n26`** en Drive (hecho por el humano el
   2026-08-18). El importador la normaliza, pero la copia local se escribe con el
   nombre crudo, así que en Linux no habría casado.
2. ✅ **N26 verificado de punta a punta el 2026-08-18**: `POST /api/import` mete
   **204 movimientos, 0 duplicados, 0 sin parsear, 0 fallidos**, con la cuenta
   creada, los conceptos compuestos del ADR-020 sin un solo vacío y el
   `accountBalance` con sus céntimos. Costó tres pasadas —Excel reescribió el
   primer fichero, y el segundo llevaba el preámbulo con `:` y el IBAN con
   espacios—; las tres están en
   [`explorations/prueba-real-n26-2026-08-18.md`](explorations/prueba-real-n26-2026-08-18.md).
   ✅ **El bug que dejó abierto —el IBAN se guardaba literal, así que el mismo IBAN
   con y sin espacios eran dos cuentas distintas, en silencio, en los tres bancos—
   lo cierra la F21**, cerrada el mismo día (ver arriba).
3. 🟠 **Escribir el IBAN de Openbank** una vez, donde diga el spec de la F19.
4. ⚪ **Re-exportar Revolut** el día que haya movimientos.

- **Tarea anterior:** ninguna. La **F16 `statement-balance`** se cerró el 2026-08-16
  (`reviewer`: **APROBADO sin cambios requeridos**) y con ella **no queda ninguna
  feature `pending`** en `feature_list.json`.
- **Inicio:** 2026-08-15
- **Agente:** leader + implementer + reviewer

## F16 `statement-balance` — cerrada

Sale de la decisión del humano del 2026-08-15 en la
[prueba real](prueba-drive-real-2026-08-15.md) §Decisión del humano sobre el saldo. Sin
spec (`sdd: false`): del `intent` + los 12 criterios de `acceptance`. Informe:
[`implementations/statement-balance.md`](implementations/statement-balance.md) ·
veredicto: [`reviews/statement-balance.md`](reviews/statement-balance.md) · resumen:
[`summaries/statement-balance.md`](summaries/statement-balance.md).

1. ✅ El extracto admite una **segunda línea de preámbulo etiquetada**,
   `saldo;<importe>`, junto a la del `iban;`, y el resultado la expone como
   `accountBalance`.
2. ✅ **`accountBalance` vive en el contrato común**
   ([`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts)), con Bankinter
   emitiendo `null`. **El reviewer lo respalda expresamente y dice que la alternativa
   habría sido la equivocada**, con un argumento que no estaba en el informe: con el
   campo declarado solo en el resultado de MyInvestor, el dato quedaría **invisible
   para el importador**, que consume el contrato común y no puede volverse
   bank-specific (hay guardián en `architecture.test.ts`). Coste de lo hecho: **una
   línea constante** en Bankinter. Coste de la alternativa: romper el ADR-013 y
   bloquear el consumo futuro.
3. ✅ **No se confunde con el `balance` por movimiento**, que en este banco sigue
   siendo `null` para siempre (ADR-013). Dos datos, dos nombres, escrito en el
   contrato, en `api-contract.md` §Los dos «saldos» del contrato y en el **ADR-019**.
4. ✅ Un solo buscador (`findIbanLine` → `findPreambleLine(lines, headerLine, label)`),
   etiqueta sin acentos ni mayúsculas (su archivo real lleva `Saldo;`) e importe por
   `parseAmountText`, el normalizador que ya existía.
5. ✅ Delegadas: **ausente o vacía** → saldo vacío, sin fallo; **presente e ilegible**
   → `unparsedRows` con su nº de línea y motivo; **repetida** → gana la primera. La
   fila `Saldo` **del final no se lee**: una sola forma de escribirlo.
6. ✅ **`./init.sh` en verde: 412 tests, 412 pasan, 0 saltados** (baseline 396), con la
   capa de comparación del guardián de la F14 **activa**. Docs: `api-contract.md`,
   `dar-de-alta-un-banco.md`, `conventions.md`, `roadmap.md` y ADR-019.

### Sugerencias fuera de scope anotadas (no aplicadas)

`myinvestor.product.parser.test.ts` no pasa `prettier --check` (**ya no pasaba antes**
de esta feature); el saldo **no se persiste** todavía —candidato natural a anclar el
saldo de esa cuenta sin sumar movimientos, hoy atado a `initialBalance` (ADR-011)—; y
un motivo más útil para la fila `Saldo` del final, que no se hizo porque enseñarle al
parser algo sobre esa fila es justo lo que el criterio 7 prohíbe.

### 📌 Lo que le toca al humano tras la F16

🔴 **Al editar el CSV del mes:** escribir `Saldo;<importe>;;;` debajo de la línea del
`iban;` y **borrar la fila `Saldo` del final** del archivo. Cómo se escribe, en
[`docs/dar-de-alta-un-banco.md`](../docs/dar-de-alta-un-banco.md) §El saldo de la
cuenta va en la misma cabecera. Si algún mes se olvida, no falla nada: el saldo sale
vacío.

## F17 `statement-encoding-guard` — cerrada

Nace del hallazgo 🔴 E de la [prueba real del 2026-08-15](prueba-drive-real-2026-08-15.md).
Sin spec (`sdd: false`). Informe:
[`implementations/statement-encoding-guard.md`](implementations/statement-encoding-guard.md) ·
veredicto: [`reviews/statement-encoding-guard.md`](reviews/statement-encoding-guard.md) ·
resumen: [`summaries/statement-encoding-guard.md`](summaries/statement-encoding-guard.md).

1. ✅ `src/lib/utf8.ts` → `decodeUtf8Strict`: veredicto por **bytes**
   (`TextDecoder` con `fatal: true`) y guardia secundaria por `U+FFFD`; lanza
   `NotUtf8Error` (`NOT_UTF8`, 422) con el byte, la línea y qué hacer.
2. ✅ El parser del extracto lo usa en lugar de `toString('utf8')`: **un solo sitio**
   cubre los dos caminos (`/api/parser/myinvestor` y `/api/import`), que ya aíslan el
   fallo por archivo.
3. ✅ Tests con fixtures sintéticos, con los bytes cp1252 escritos en código.
4. ✅ Documentación: ADR-018, `api-contract.md`, `dar-de-alta-un-banco.md`,
   `conventions.md`.
5. ✅ **`./init.sh` en verde: 396 tests, 396 pasan, 0 saltados**, con la capa de
   comparación del guardián de la F14 **activa** (los 0 saltados importan). Los rojos
   que reportó el implementer eran ajenos a la F17 —lo dejó fuera de su scope con razón—
   y el leader saneó después lo que era suyo.

### El guardián de la F14 destapó tres cosas, y solo una era la esperada

**✅ Saneado ya (era del leader, no del implementer).** El informe de la prueba real
llevaba el **IBAN real** del humano, sus importes y los conceptos literales de su
extracto, y el `intent` de la F16 citaba su saldo. Lo escribió el leader pegando la
salida de la consola en un archivo versionado. Corregido: cifras inventadas, IBAN
sintético, nombres de sus archivos sustituidos por genéricos, y una nota al principio
del informe explicando el saneamiento. Las capas de IBAN e importes vuelven a verde.

**✅ Cerrado el falso positivo del ejemplo de la plantilla.** El nombre de ejemplo del
fondo saltaba en `docs/` y `specs/` porque el humano copió ese ejemplo tal cual a su
archivo del ETF (hallazgo 🔴 D), así que el ejemplo de la documentación pasó a estar en
`var/` y el guardián lo leyó como dato suyo. **El dato copió a la plantilla, no al
revés.** Arreglado en la raíz: el ejemplo se renombró en `docs/api-contract.md`,
`docs/myinvestor-product-files.md` y `specs/myinvestor-products/design.md`, y las
plantillas ya usan marcadores `<…>` en vez de valores copiables.

**✅ Resueltas las 3 colisiones PREEXISTENTES**, ninguna escrita en esta sesión: el
guardián solo las veía ahora porque `var/` tiene capturas nuevas. Decididas por el
humano el 2026-08-15:

1. **El comentario del enum de tipos de producto** (`docs/data-model.md`,
   `specs/investments-data-model/design.md`) — **falso positivo**: es la traducción al
   castellano del tipo de producto, el nombre que le da el banco, y colisiona solo
   porque el humano llamó al suyo igual. Cerrado con el escape documentado, un
   **`no-real-data-ok` por línea con su motivo escrito al lado**. El comentario
   conserva el término exacto que se ve en la web del banco, que es lo que lo hace
   reconocible.
2. **`prisma/migrations/20260806191700_data_model/migration.sql`** — 🔴 **acierto real
   y preexistente**: un comentario citaba un movimiento auténtico del extracto de
   Bankinter (concepto, importe y fecha) como ejemplo de por qué `daySequence` entra en
   el índice. **Saneado**: el ejemplo pasa a ser genérico. Solo cambia el comentario, el
   DDL no se toca ni una letra, así que el esquema es idéntico. **Checksum: cerrado.**
   El guardado en `_prisma_migrations` sí difería tras editar el comentario; se realineó
   con el del archivo, los tres coinciden y `prisma migrate status` dice «up to date».
   **No hace falta resetear la base de datos.**
3. **El propio `current.md` llegó a colisionar** al documentar los dos puntos de
   arriba: citar la frase infractora la reintroduce. Se describen sin transcribirlas.

6. ✅ **`reviewer`: APROBADO sin cambios requeridos** →
   [`reviews/statement-encoding-guard.md`](reviews/statement-encoding-guard.md), resumen
   en [`summaries/statement-encoding-guard.md`](summaries/statement-encoding-guard.md).
   F17 marcada **`done`** en `feature_list.json` y anotada en
   [`history.md`](history.md). Sus 17 tests nuevos, verdes.

### Siguen abiertas (anotadas, no se abren ahora)

Las tres sugerencias fuera de scope del informe de la F17: el `readFile(…, 'utf8')` del
JSON de producto —mismo silencio, pero el `que_no_quiero` pedía no tocar ese formato—, el
motivo de la **coma decimal** (§A) y el del **archivo nativo de Google** (§B), que el
humano ya clasificó como de menor prioridad.

---

## Sesión anterior (2026-08-13): F15 cerrada

## F15 `product-opened-at` — cerrada

Nació de una revisión de estado: el humano pidió que el JSON de producto de inversión
llevase la fecha de apertura. Sin spec (`sdd: false`).

1. ✅ **Decisión del humano:** `openedAt` **obligatorio en los cuatro tipos**, frente a
   la alternativa de admitirlo vacío. `closedAt` no se toca (opcional; normalmente solo
   los depósitos lo llevan).
2. ✅ Implementado en `src/modules/myinvestor/`. La clave se lee **antes** de bifurcar
   depósito/resto ([`myinvestor.product.parser.ts:80`](../src/modules/myinvestor/myinvestor.product.parser.ts#L80)),
   que es lo que la hace obligatoria de verdad en los cuatro y no solo donde se probó.
   `ParsedProduct.openedAt` es `string`, **nunca `null`**: sin fecha no hay producto,
   hay archivo fallido.
3. ✅ **`reviewer`: CHANGES_REQUESTED** en primera pasada, por **un solo punto de
   documentación** — la tabla de columnas reservadas de `docs/data-model.md:214` seguía
   diciendo que el fichero no llevaba el campo y que sería opcional. Es el registro que
   leerá quien haga la persistencia de inversiones, así que dejarlo mintiendo era caro.
4. ✅ **`reviewer`: APROBADO** en segunda pasada →
   [`reviews/product-opened-at.md`](reviews/product-opened-at.md), resumen en
   [`summaries/product-opened-at.md`](summaries/product-opened-at.md).
   `./init.sh` verde: **379 tests, 0 saltados** (los 0 saltados importan: el guardián de
   la F14 corrió con su capa de comparación activa, no solo la de forma).

## 📌 Lo que le toca al humano

1. 🔴 **Actualizar la plantilla de producto que guarda en Drive** con la línea de
   `openedAt`. Nadie comprueba que coincida con la documentación: todo archivo escrito
   con la plantilla vieja fallará. Plantillas en
   [`docs/myinvestor-product-files.md`](../docs/myinvestor-product-files.md).
2. ✅ **Prueba del camino entero: hecha el 2026-08-15** →
   [`prueba-drive-real-2026-08-15.md`](prueba-drive-real-2026-08-15.md). Drive
   responde y el extracto se lee bien (IBAN + 11 movimientos), pero **0 de 4 JSON
   de producto parsean**: llevan coma decimal, que JSON no admite. Y el `.csv` se
   subió **convertido a hoja de Google**, así que no se puede descargar. Los dos
   son cosas que arregla él en Drive; el informe propone además dos mensajes de
   error mejores en el backend (candidato a F16).

   **Segunda pasada el mismo día, tras corregirlos: el camino entra entero**
   (6/6 descargados, 5 productos, 1 extracto con IBAN, 0 fallos). Quedan dos
   problemas **silenciosos**, que no dan error: el `.csv` viene ahora en cp1252 y
   el parser convierte la `Ó` de los conceptos en `�` de forma irreversible, y
   `etf-<...>-*.json` conserva el `type` y el `name` del ejemplo de la plantilla.
   Decidido también que el **saldo** se leerá de una línea `saldo;…` en el
   preámbulo, junto al `iban;…`.
3. **Inventario por banco** ([`docs/ideas.md`](../../docs/ideas.md)): sigue vacío y
   sigue bloqueando la E4 entera.

## ✅ El histórico de git: cerrado como riesgo aceptado (2026-08-13)

**Tema cerrado. No volver a sacarlo.** El humano lo dio por arreglado, se verificó y
**no lo estaba** (los 36 commits conservan hash y fecha: no hubo reescritura). Se le
devolvió el alcance real medido, mayor de lo que él creía:

- `ES15 0128…` (0128 = Bankinter), IBAN **válido por checksum**, en **14 commits** desde
  `4caeb38` (F6, 2026-08-04), en `bankinter.parser.test.ts`.
- `ES30 1544…`, también válido, en **4 commits** de la F12.
- Más lo que saneó la F14 en ~40 archivos: importes, conceptos del extracto, el nombre
  de su empresa y el nombre completo de un tercero.

Se le ofrecieron las dos salidas reales (commit inicial único, o rewrite de los 35
commits) y **eligió dejarlo**: repositorio privado, HEAD limpio y el guardián de la F14
impidiendo la recaída. Anotado en `docs/roadmap.md`, con la nota de que **si el
repositorio deja de ser privado esto vuelve a la mesa**, y de que la salida limpia exige
rewrite **más** borrar y recrear el repo (un force-push deja los commits viejos
alcanzables por SHA).

## Cerrado también en esta sesión (no es código)

- ✅ **Carpeta de plantillas en Drive**, hermana de `notas-banco/`: creada.
- ✅ **Cabo suelto nº 9** (`openedAt` sin escritor): cerrado por la F15.
- 🕗 **Histórico del Excel** (idea #5): **aplazado, no descartado** — inclinación a
  importarlo «para no empezar de vacío».
- ⏳ **Cabo suelto nº 10** (`daySequence` numera solo las filas parseadas): explicado y
  **sigue abierto**. Se cierra el día que el humano diga que acepta borrar a mano los
  duplicados visibles si algún día arregla un parser y reimporta.

## Lo que aprendió el proyecto con esto

Una feature de una sola línea de comportamiento se fue a **CHANGES_REQUESTED por
documentación**, y con razón: `docs/data-model.md` se declara a sí mismo el registro
único de columnas sin escritor, y una feature que le da escritor a una columna sin
actualizar ese registro deja una trampa para la feature siguiente. El código estaba
bien a la primera; lo que faltaba era el rastro.

---

## F20 `trade-republic-product-file` — CERRADA el 2026-08-20

Feature SDD, spec aprobado con cambios el 2026-08-19 (cuadre aritmético
que **rechaza**). Un solo implementer para los **cuatro lotes** de
[`tasks.md`](../specs/trade-republic-product-file/tasks.md) (A doc, B parser, C
servicio+ruta+contrato, D guardianes+ADR).

Baseline antes de tocar nada: `./init.sh` verde, **659 tests, 0 saltados**, con las 3
líneas de aviso del guardián de la F14 sobre `trade-republic` (su `.pdf` no se puede
vigilar).

Informe: [`implementations/trade-republic-product-file.md`](implementations/trade-republic-product-file.md).

**Implementación TERMINADA el 2026-08-19**: las **25 tasks** de `tasks.md` en `[x]`,
`./init.sh` verde con **721 tests, 0 saltados** (baseline 659, +62).

**`reviewer`: CHANGES_REQUESTED** ([`reviews/trade-republic-product-file.md`](reviews/trade-republic-product-file.md))
con **un solo punto bloqueante**: el checkpoint **C4 bis**, la prueba real, que no se
había hecho. Todo lo demás —el cuadre, el mensaje de descuadre, el aislamiento, el
`.pdf`, el UTF-8 estricto, el 🔒 cruzado contra el fichero real y los 16 requirements—
quedó **comprobado y sin hallazgos**. Ni una línea de código de la feature necesitó
cambiar.

**C4 bis hecho y limpio el 2026-08-20** —la **primera vez** que se aplica—:
[`explorations/prueba-real-trade-republic-2026-08-20.md`](explorations/prueba-real-trade-republic-2026-08-20.md).
Pasada final con el archivo ya corregido: **`productCount: 1`, `failedCount: 0`,
`ignoredCount: 1`** — su cuenta entra entera, el cuadre no protesta y el `.pdf` se lista
como **ignorado con su motivo**, no como fallo. Lo que la prueba dejó por el camino, ya
cerrado: la corrección de `docs/trade-republic-product-files.md` (el resumen del extracto
**no da los datos del mes, da los del periodo**; los tres campos salen de la tabla de
transacciones), la plantilla copiable
[`docs/plantillas/trade-republic-cuenta-remunerada.json`](../docs/plantillas/trade-republic-cuenta-remunerada.json)
con su **candado de identidad a tres bandas**, y la **F24 `guardian-own-words`**, ya
cerrada y aprobada.

- ✅ **CERRADA el 2026-08-20:** F20 a **`done`** en `feature_list.json`, línea en
  [`history.md`](history.md) y
  [resumen de cierre](summaries/trade-republic-product-file.md).
- `./init.sh`: **739/739 verde** y **cero features en `in_progress`**.
- Con esto, **5 de 6 bancos**. Falta **Revolut**: su fichero ya se baja de Drive, pero
  nadie lo parsea todavía.

---

## F26 `savings-account-as-product` — EN CURSO (2026-08-20)

Feature en curso: **26 — `savings-account-as-product`** (SDD, `in_progress`, spec aprobado
hoy con las 6 decisiones 🔴 tal cual). Un solo implementer para los **cuatro lotes**
(A, B, C, D) de [`tasks.md`](../specs/savings-account-as-product/tasks.md); no hay otro
implementer en paralelo.

Plan = las 28 tasks del spec, en orden A → B → C → D:

- **A** (T1-T11): `savings_account` en el enum, modelo `SavingsSnapshot`, migración
  **aditiva**, `investments.types.ts` + `investments.service.ts`
  (`persistSavingsSnapshot`, dos upserts en una transacción) y sus tests + guardián.
- **B** (T12-T14): exportar `parseTradeRepublicProductFile` desde el módulo del banco,
  **sin base de datos**, con el motivo íntegro del parser.
- **C** (T15-T24): segundo registro `productParsers` en `src/app.ts`, bifurcación de
  `importPending` y de `importLocalCopies`, informe `product`/`snapshot`.
- **D** (T25-T28): `api-contract.md`, ADR-026, `trade-republic-product-files.md`, roadmap.

⚠️ **La migración se escribe pero NO se aplica** contra la base del humano (instrucción
del leader): se verifica sobre una base de datos temporal aparte. Mientras no se aplique,
los tests nuevos que tocan `SavingsSnapshot` estarán rojos en `./init.sh`.

Informe: [`implementations/savings-account-as-product.md`](implementations/savings-account-as-product.md).

**Implementación TERMINADA el 2026-08-20**: las **28 tasks** de `tasks.md` en `[x]`,
informe con el mapeo R→test en
[`implementations/savings-account-as-product.md`](implementations/savings-account-as-product.md).

⚠️ **`./init.sh` está ROJO a propósito**: la migración
`20260820181500_savings_account_as_product` **NO se ha aplicado** contra la base del
humano (instrucción del leader). Los fallos están **confinados a los cuatro archivos que
dependen de ella** (`investments.model`, `investments.service`, `import.service`,
`import.local.service`); nada más falla. La suite **completa** se verificó en **verde
(46 archivos, 816 tests)** contra una base temporal aparte (`gastos_f26`) con las cuatro
migraciones aplicadas desde cero. El comando a lanzar con el humano delante está en la
§«La migración NO se ha aplicado» del informe.

La F26 se queda en **`in_progress`**: la cierra el reviewer, no el implementer. Y **C4 bis
(la prueba real) sigue pendiente**: no se puede hacer hasta aplicar la migración, y el
archivo de Drive debe llevar ya el `name` corregido (`saving-account`).

**`reviewer`: CHANGES_REQUESTED** ([`reviews/savings-account-as-product.md`](reviews/savings-account-as-product.md))
con **un solo punto bloqueante, y de documentación**: `docs/data-model.md` —el registro
único de columnas— no llevaba ni una línea de la feature. Todo lo demás quedó
**comprobado contra su base real y sin hallazgos**: la migración aditiva, la idempotencia
(tres importaciones seguidas → 1 producto, mismo id, 2 fotos), el «no deja rastro» (con
descuadre y con rollback a mitad de transacción), los 15 requirements y los guardianes.
Devolvió la base idéntica: **4 / 455 / 0 / 0 / 0**.

**Segunda pasada hecha el 2026-08-20 — solo `docs/data-model.md`**, ni una línea de
código, de test ni de la migración:

- Los **6 puntos** del reviewer: quinto valor del enum, relación inversa
  `savingsSnapshots`, el `model SavingsSnapshot` entero con sus siete columnas, el
  diagrama, la fila de la clave natural `(productId, date)` y `openedAt`/`closedAt`
  tachadas con su 🔄 en «columnas reservadas».
- **Siete cosas más que encontré al repasar** y que la F26 había vuelto falsas: la
  cabecera de la Parte 2 («sin importador»), la tabla de partes, la regla 4, «los tres
  índices» (son cuatro), «los otros tres tipos» (son cuatro), el 📌 del «futuro
  importador» y la regla de negocio gemela de la del depósito. Más §Patrimonio,
  §Lo que NO está aquí y la nota de la F15. Detalle en el informe.
- El bloque Prisma del documento se comparó **campo a campo** contra `schema.prisma`:
  los dos modelos y el enum salen idénticos.

- `./init.sh`: **816/816 verde**, y su base **igual antes y después** (4 / 455 / 0 / 0 / 0,
  desglose 204 / 201 / 39 / 11). La suite no deja ni una fila detrás.
- La F26 sigue en **`in_progress`**: la cierra el reviewer.
- Sigue pendiente, y **no lo puede hacer un agente**: la **prueba real (C4 bis)** con su
  archivo ya renombrado a `saving-account`. Y al cerrar, borrar la base temporal
  `gastos_f26`.
