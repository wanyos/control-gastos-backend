# F24 `guardian-own-words` — implementación

> 🔒 **Ni un dato real en este archivo** (ADR-017). Todo lo que aparece aquí como
> ejemplo está inventado; del fichero del humano solo hay **recuentos y forma**.

Feature **sin spec** (`sdd: false`): se trabaja del `intent` y de los **10 criterios de
`acceptance`** de `feature_list.json`. Origen:
[`progress/explorations/prueba-real-trade-republic-2026-08-20.md`](../explorations/prueba-real-trade-republic-2026-08-20.md)
§«Hallazgo 2».

## El fallo, en una línea

`var/parsed/**.json` **no es una copia de su extracto**: es lo que *nuestro* parser
escribió sobre él. Cuando un archivo se rechaza, el volcado guarda el **motivo** —una
frase nuestra, que los `docs/` publican palabra por palabra porque es nuestra— y la capa
de frases del guardián la leía como «una frase de su extracto copiada en los docs».
Resultado en la ejecución del 2026-08-20: **270 avisos falsos**. Le pasa a **cualquier
banco** cada vez que un archivo se rechaza.

## Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) | Único archivo de `src/` tocado. Entrada de `trade-republic` **borrada** de `unwatchedBanks`; capa nueva «palabras nuestras»; **12 tests nuevos** (24 → 39 en este archivo) |
| [`docs/architecture.md`](../../docs/architecture.md) §ADR-017 | Nota de revisión del 2026-08-20; el 🟠 «hueco vivo: Trade Republic» pasa a ✅ **cerrado**; consecuencia nueva «en el volcado hay texto NUESTRO además de datos suyos» con las dos condiciones y el trade-off |
| [`docs/conventions.md`](../../docs/conventions.md) §Tests | Viñeta nueva con la regla en corto y **el deber que impone a los parsers nuevos**: entrecomilla el valor que devuelvas en un motivo |
| `feature_list.json`, `progress/current.md` | Estado y bitácora |

**No se ha tocado** ni un parser, ni una ruta, ni el modelo de datos, ni `var/`
(comprobado: `git status` no muestra ningún otro archivo de `src/` modificado por esta
sesión). Nada de `var/` se ha borrado ni movido.

## Decisión 1 (delegada nº 1 y 2) — cómo se separa TEXTO NUESTRO de DATO SUYO

> ⚠️ **Corregida el 2026-08-20 tras la review** (`reviews/guardian-own-words.md` §1): la
> primera versión **troceaba** el motivo por las comillas, y eso abría un **silencio**.
> Lo que sigue es la regla ya corregida; el silencio y su arreglo están en
> §«El silencio que encontró la review».

La separación **no** es por archivo, **no** es por lista de excepciones y **tampoco es
por campo**. Es **por frase**, y solo se da por nuestra la frase donde **dos condiciones
independientes coinciden**:

- **(a) La frase no forma parte de un valor entrecomillado.** Todo valor sacado de su
  fichero se devuelve **entrecomillado** — es la convención que siguen los cinco parsers:
  `display()` entrecomilla como JSON (`recibido "…"`) y el resto interpola entre `'…'`.
  Lo entrecomillado se **sube** (`echoedSpans`) al cubo que se compara **sin preguntar**;
  el motivo, además, va **entero** al cubo donde se pregunta (b). Los dos cubos, nunca
  uno: así ningún corte nuestro puede quitar texto suyo de la comparación.
- **(b) La frase está LITERALMENTE en nuestro código de producción.** Se lee el
  vocabulario de los **literales de mensaje** de `src/**.ts`, **excluyendo tests y
  fixtures** (`isOwnSource`, `ownMessageProse`, `ownSourceVocabulary`): un mensaje *nace*
  en el parser que lo compone; un test o un fixture es donde una frase **se copia**, y
  tratar una copia como prueba de propiedad es cómo la fuga de la F19 —que era
  exactamente un fixture— se habría certificado a sí misma como «palabras nuestras».

**Las dos, nunca una.** El sentido de cada una es tapar el hueco de la otra:

- Un dato suyo devuelto **sin comillas** (un parser que se olvida de la convención)
  pasa (a) y **falla (b)**: sus palabras no están en ningún literal nuestro ⇒ **se sigue
  vigilando**.
- Una frase nuestra que quede **entrecomillada por accidente** falla (a) ⇒ se sigue
  vigilando (falso positivo, nunca silencio).
- Un corte **mal puesto** (comillas rotas, un apóstrofo dentro del valor) ya no puede
  hacer daño: lo único que decide `echoedSpans` es **qué se compara dos veces**. El
  motivo entero está en la comparación pase lo que pase. **Invariante, con test**: el
  corte solo puede **añadir**, jamás quitar un carácter.

**Matiz de (b), y por qué hace falta:** un mensaje se compone **alrededor** de sus
huecos. El código dice `` `${key}: se espera el formato AAAA-MM-DD` `` y el volcado dice
`openedAt: se espera el formato AAAA-MM-DD`, una secuencia que **no está** en el código.
Por eso (b) acepta también un trigrama cuyas **tres palabras** estén en nuestro
vocabulario (`isOurOwnPhrase`) — y los nombres de campo también son literales nuestros
(`'openedAt'` está en el parser). **Una sola palabra que no sea nuestra y la frase se
vigila**: un nombre de producto o un concepto de su extracto nunca pasa por ahí.

### El hueco que NO se ha abierto (el punto difícil de esta feature)

El mensaje del descuadre lleva **dentro los cinco importes** del mes. Descartar el
`reason` entero era **una línea**, y habría dejado de vigilar cinco importes reales para
arreglar un aviso falso. **No se ha hecho, y el trade-off no se ha aceptado: se ha
evitado.**

**La capa de importes no se ha tocado en absoluto.** Sigue comparando contra el texto
**crudo** de cada captura (`captureText`), motivos incluidos. Los cinco importes del
descuadre se vigilan hoy **exactamente igual que ayer** — hay test que lo fija
(`KEEPS WATCHING the five amounts that live inside that same message`). La línea trazada
aquí es **solo sobre palabras**, que es donde estaba la confusión.

## El silencio que encontró la review (corregido el 2026-08-20)

La primera versión **troceaba** el motivo: lo cortaba por las comillas y repartía los
trozos en dos cubos. El reviewer lo atacó con un concepto inventado que lleva
**apóstrofo dentro**, entrecomillado con **comillas simples** —que es justo el
entrecomillado de todos los parsers salvo `display()`—, y el corte cayó **dentro del
valor**: cada mitad fue a un cubo distinto, ninguna llegaba a tres palabras, **ningún
trigrama** salía y el concepto entero **dejaba de compararse**. Un documento versionado
que lo copiase **no se señalaba**.

Y era peor que un fallo nuevo: era una **regresión** —antes de la F24 ese motivo se
comparaba entero y sí se cazaba— en la **única función cuyo comentario prometía que no
podía producir un silencio**. Con valores largos el silencio es **parcial** (los extremos
sí dan trigrama y se pierde solo la frase que cruza el corte), que es peor de detectar. Y
no es de laboratorio: hay apóstrofos en conceptos de tarjeta reales (`L'…`, `D'…`, `O'…`).

**El arreglo, que es de fondo y no un parche al corte:** el motivo **ya no se trocea**.
Va **entero** al cubo donde se pregunta (b), y los tramos entrecomillados se añaden
**encima**, en el cubo que se compara sin preguntar. `splitOurMessage` desaparece;
`echoedSpans` **puede equivocarse sin consecuencias**, porque lo único que su resultado
decide es qué se compara **dos veces**.

Como efecto lateral, esto **vigila más que antes** del arreglo: los trigramas que
**cruzan** un valor (`recibido compra aliments`) también entran ahora, filtrados por (b)
como todo lo demás.

**La afirmación falsa se ha corregido en los tres sitios donde estaba escrita**:
`src/no-real-data.test.ts` (comentario de la función, que ahora dice lo que el código
cumple: puede equivocarse, no puede perder), `docs/architecture.md` §ADR-017 y este
informe (arriba). Los tres decían «el modo de fallo es falso positivo, nunca silencio»
sobre un código que sí podía callar.

**No es vacío**: reponiendo el troceo antiguo en una copia de usar y tirar, los **tres
tests nuevos se ponen rojos** (`3 failed | 36 passed`) y con el arreglo vuelven a verde.

## Decisión 2 — una frase deja de inventarse donde no la escribió nadie

Al quitar el ruido de los motivos quedó a la vista una **segunda fuente de falsos
positivos de la misma familia**: los valores de un volcado se juntaban en un solo churro
antes de sacar trigramas. `bank` y `year` se repiten **una vez por entrada**, así que el
volcado de un archivo rechazado «contenía» la frase `trade republic trade` — y con eso se
señalaba a **todo documento que nombrase al banco dos veces** (82 de los avisos que
quedaban tras la primera pasada de la corrección).

Ahora los valores se comparan **uno a uno** (`CaptureSources.data: string[]`). Dicho sin
maquillarlo, porque es lo único que esta feature estrecha: **una frase copiada a caballo
entre dos campos de un volcado ya no se caza**. Lo que lo compensa:

- una frase suya vive **dentro de un valor**; la costura entre dos es **nuestro JSON**,
  no su extracto, y una frase que no está escrita en ningún fichero no es evidencia de
  nada;
- el **extracto original** sigue en `var/drive-read/` y se compara **entero como texto**
  (una fila de CSV es una sola cadena), así que lo que de verdad escribió el banco
  seguido sigue vigilado por esa vía;
- la **capa de importes no se entera** de este cambio.

## Trazabilidad — criterio → test

Los 10 criterios de `acceptance` de la F24. Tests en
[`src/no-real-data.test.ts`](../../src/no-real-data.test.ts).

| # | Criterio (resumido) | Test(s) |
|---|---|---|
| 1 | Suite VERDE con su fichero en `var/`, sin borrar nada | `./init.sh` completo (**739/739** tras la review; 736 antes) + `copies no telling phrase of the local captures…` y `repeats no telling amount of the local captures…`, que corren **contra `var/` real** (no se saltaron: las dos ramas están) |
| 2 | Entrada de `trade-republic` **borrada** y el test del inventario **sin debilitar** | `holds the inventory of unwatched banks EXACTLY, so bank number seven turns it red` (intacto, sigue afirmando las **dos direcciones**); `tells a bank folder it cannot read apart from an empty one` |
| 3 | Decisión por escrito **sin hueco**, con los cinco importes | §Decisión 1 arriba + `KEEPS WATCHING the five amounts that live inside that same message`, `KEEPS WATCHING a value of his echoed inside the message, quoted`, `KEEPS WATCHING a value of his echoed WITHOUT quotes: the second condition`, `only lets 'reason' off: a name of his is compared even if we use those words too`, `proves a phrase is ours by our source, and never by default`, y —tras la review— `KEEPS WATCHING a value of his with an APOSTROPHE inside single quotes`, `keeps watching it however the value is quoted, and however long it is`, `never lets a cut of ours take a character out of the comparison` |
| 4 | Frases e importes **siguen activos** y siguen cazando el caso de la F19, con fichero sintético en directorio temporal | `catches an amount of a bank file copied into a versioned file`, `catches a concept of a bank file copied into a versioned document`, `says nothing about an amount that is not in the bank file`, `would have caught it through the .xls, which the old extension list never opened` |
| 5 | **Regresión del 2026-08-20** con volcado sintético: ni un aviso | `reports NOTHING about a rejection message of ours that the documentation publishes` + `would have reported it without the rule, so the test above is not vacuous` (prueba que el test no es vacío: con la regla desactivada, el mismo documento **sí** se señala) |
| 6 | **Cero silenciamientos**: ni excepciones por archivo, ni listas, ni frases quitadas de los docs | `is not on its own exception list: it guards itself like any other file` (`allowedPaths` **sin tocar**: sigue teniendo una sola entrada, `prisma/migrations/`); ninguna línea nueva con `no-real-data-ok`; los `docs/` **ganan** texto, no lo pierden |
| 7 | El mensaje nunca lleva el valor (ADR-017) | `catches an amount of a bank file copied into a versioned file` (`not.toContain` del importe) — los mensajes no se han tocado |
| 8 | **No cambia la app**: ni parsers, ni rutas, ni modelo | Toda la suite (736) verde sin cambiar ni un test de módulo; `git status`: único archivo de `src/` tocado en esta sesión, `src/no-real-data.test.ts` |
| 9 | Queda **documentado** dónde toque | `docs/architecture.md` §ADR-017 (nota de revisión + consecuencia nueva + hueco de Trade Republic cerrado) y `docs/conventions.md` §Tests |
| 10 | Cada criterio con test, mapeado aquí; `./init.sh` verde con la capa de comparación **activa** | Esta tabla + §Último `./init.sh` |

**Tests nuevos (15), todos con datos inventados**, en el bloque
`the guardian tells our own words from his data inside the dump (feature 24)`, más los
dos de mecanismo `separates the echoed value…`, `reads our messages from the source…`,
`takes our vocabulary from production code…` y `the real parsers of this repository do
feed that vocabulary` (este último evita la tautología: si `isOwnSource` o el lector de
literales dejan de casar con el árbol real, el vocabulario se vacía **en silencio** y la
capa de frases vuelve a inundarse; el test exige > 100 frases propias).

## Último `./init.sh`

Segunda pasada (2026-08-20, tras la review):

```
3. feature_list.json        FAIL — 2 features en in_progress (esta y la F20). Ver §Estado
4. Type checking (tsc)      OK
5. Tests                    43 archivos, 739 tests, 0 fallos, 0 saltados
```

Primera pasada (antes de la review): 736 tests, 0 fallos, `Entorno listo`.

- Corrido **con `var/` tal cual está** (su `.json` de Trade Republic y su volcado en
  `var/parsed/`), o sea con la **capa de comparación ACTIVA**: los dos tests de
  comparación **no se saltaron**.
- El aviso `[no-real-data] THE COMPARISON LAYER DOES NOT WATCH: …` **ya no se imprime**,
  porque no queda ningún banco sin vigilar. La lista `unwatchedBanks` queda **vacía y
  documentada**: el test que exige que sea exactamente el estado real sigue vivo.
- **Flake conocido, dicho y no tapado:** la **primera** ejecución falló en
  [`src/modules/movements/movements.test.ts:318`](../../src/modules/movements/movements.test.ts#L318)
  (`response.json(...).filter is not a function`), el flake que el líder ya tenía
  fichado. **No lo he tocado.** La segunda ejecución completa fue verde (736/736). No
  tiene relación con este diff: no se ha tocado nada de `movements`.
- `pnpm lint` (oxlint) limpio; `prettier --write` pasado sobre el archivo tocado.

## Sugerencias fuera de scope (NO aplicadas)

1. **El flake de `movements.test.ts:318`** merece feature propia: `response.json()`
   devuelve algo que no es un array de vez en cuando (¿respuesta de error bajo carga?).
   Un test que falla una vez de cada dos es un test que se aprende a ignorar, que es el
   mismo mal que esta feature acaba de arreglar en el guardián.
2. **`prettier --check src docs` marca `src/modules/myinvestor/myinvestor.product.parser.test.ts`**
   como no formateado. Viene de antes de esta sesión y **no lo he tocado** para no meter
   ruido en el diff.
3. **La convención de entrecomillar el valor en un motivo no la comprueba nadie
   todavía.** Es la mitad (a) de la regla, y hoy vive en `docs/conventions.md` y en la
   cabeza del que escriba el parser número seis — que es exactamente la clase de regla
   que el ADR-017 nació para dejar de confiar a la memoria. Un test de arquitectura que
   exija que todo `reason` interpole entre comillas cerraría el círculo.
4. **Candidato que ya dejó la prueba real** (sigue pendiente del sí del humano): que el
   motivo diga «te dejaste el `<` de la plantilla» en vez de «fecha inválida».

## Estado de la feature

`feature_list.json` → F24 de vuelta a **`in_progress`** (la puso ahí la segunda pasada,
como pidió el líder): con un veredicto **CHANGES_REQUESTED** en disco, `done` era un
estado que mentía. Vuelve a `done` cuando el reviewer apruebe y exista
`progress/summaries/guardian-own-words.md`; por eso **sigue sin línea en `history.md`**.

⚠️ **Ojo al arrancar `./init.sh`:** el paso 3 exige **una sola** feature en
`in_progress`, y ahora hay **dos** (esta y la **F20 `trade-republic-product-file`**, que
sigue abierta desde antes de esta sesión). Ese `[FAIL]` es de contabilidad de estados,
**no de código**: los pasos 4 y 5 (tipos y los **739 tests**) están en verde. Se resuelve
solo en cuanto una de las dos cierre; no lo he tapado tocando el estado de la F20, que no
es mía.
