# F24 `guardian-own-words` — review

> 🔒 **Ni un dato real** (ADR-017). Todo ejemplo de este archivo está inventado; de
> `var/` solo hay **recuentos**.

**Veredicto:** CHANGES_REQUESTED

Revisado ejecutando: `./init.sh` completo y una **sonda propia** (copia temporal del
guardián con tests míos, borrada al terminar) contra `var/` tal y como está, con la capa
de comparación activa.

## Cambios requeridos

### 1. Hay un SILENCIO, y está documentado como imposible

`src/no-real-data.test.ts:342` afirma, en el comentario de `splitOurMessage`:

> «The failure mode of this function is a false POSITIVE, never a silence.»

**No es cierto, y se puede provocar.** Un valor suyo con **apóstrofo dentro**,
entrecomillado con comillas simples —que es justo el entrecomillado que usan los parsers
salvo `display()`—, parte el valor en dos y **cada mitad cae en un cubo distinto**.
Reproducido con un concepto inventado, `COMPRA D'ALIMENTS VENTOLERA`, dentro de un motivo
sintético `extensión no soportada por este parser ('…')`:

```
echoed   = ["COMPRA D"]                                   → data
template = ["extensión … parser (", "ALIMENTS VENTOLERA')"] → ourProse
```

Ninguna de las dos mitades llega a tres palabras, así que **no genera ni un trigrama**:
el concepto entero deja de compararse. Un documento versionado que lo copie **no se
señala**. Medido en la sonda:

| Motivo con el mismo concepto | Avisos sobre el documento que lo copia |
|---|---|
| entrecomillado con `"…"` | 1 (se vigila) |
| entrecomillado con `'…'` (apóstrofo dentro) | **0 (silencio)** |
| comportamiento anterior a la F24 (motivo entero como un valor) | 2 trigramas casaban |

Es una **regresión**: antes de esta feature el motivo entero se comparaba y el concepto se
cazaba. No es un caso de laboratorio: apóstrofos hay en conceptos de tarjeta reales
(`L'…`, `D'…`, `O'…`).

Con un valor más largo el silencio es **parcial** en vez de total (los dos extremos sí dan
trigrama, pero la frase que cruza el corte se pierde), lo que lo hace **peor de detectar**:
falla justo en los conceptos cortos.

**Qué hay que hacer** (el cómo es tuyo, no mío):
- que el mis-corte no pueda **perder** texto suyo —p. ej. que lo que quede a un lado y a
  otro de un corte dudoso siga comparándose como una sola cadena, o que el corte solo se
  acepte cuando las comillas casan de verdad—; y
- **corregir la afirmación** allí donde está escrita, que hoy son tres sitios y los tres
  dicen lo mismo que el código no cumple:
  - `src/no-real-data.test.ts:336-342`
  - `docs/architecture.md:1352-1362` («Un dato suyo devuelto sin comillas falla (b) y se
    sigue vigilando…»: el caso que falta no es «sin comillas», es «con comillas rotas»)
  - `progress/implementations/guardian-own-words.md:58-60`
- y **un test** de este caso concreto, en el mismo bloque de la F24: un valor con
  apóstrofo dentro de un motivo entrecomillado con simples **sigue vigilado**.

### 2. C8: la feature está `done` sin resumen de cierre

`feature_list.json` tiene la F24 en `done` y **no existe**
`progress/summaries/guardian-own-words.md` ni línea en `history.md`. El propio informe lo
dice, así que no es un intento de colarlo, pero el estado en disco es el que un juez lee:
mientras el veredicto sea CHANGES_REQUESTED, la F24 **no puede estar `done`**.

## Comprobado sin hallazgos

**Los tres puntos que se pedía atacar, uno a uno:**

1. **¿Se puede colar un dato suyo del lado «nuestro»?** Fuera del caso del apóstrofo, no
   lo he conseguido. Las dos condiciones son reales y **independientes**, y lo he probado
   con casos que el implementer no escribió, todos con datos inventados y contra el
   **vocabulario real** del repositorio (no uno de juguete):
   - concepto suyo **sin comillas** dentro de un motivo → vigilado;
   - **nombre de persona** sin comillas dentro de un motivo → vigilado;
   - clave `reason` **dentro de un fichero suyo** de `var/drive-read/` (no solo en los
     volcados) → vigilado;
   - `reason` **anidado** en el fondo del JSON → vigilado.

   Además, sobre `var/` **real**: de **453** frases comparables, la regla descarta **8**, y
   las **8** están compuestas **solo** por palabras que están literalmente en los literales
   de mensaje de `src/**.ts`. **Cero** frases descartadas con alguna palabra de fuera.
   El vocabulario propio es de **844** palabras y **1368** trigramas, leído de **58**
   archivos de producción; ninguna de las palabras de banca/nombre propio que probé
   (nómina, traspaso, recibo, bizum, hipoteca, tarjeta, apellidos comunes…) está en él.

2. **Los cinco importes del descuadre.** La capa de importes **no se ha tocado**:
   `amountLeak` se alimenta de `amountsOf(captureText())`, texto **crudo** de cada captura,
   motivos incluidos, sin pasar por `capturePhraseSources`. Verificado ejecutando: con un
   volcado sintético cuyo único sitio donde vive un importe es el motivo, el importe
   **se caza**; y contra `var/` real la capa vigila **370** importes distintos.

3. **El test de regresión no es vacío.** `would have reported it without the rule…`
   desactiva la condición (b) y el mismo documento **sí** se señala; el test de la
   regresión pasa a cero avisos solo con la regla puesta. La demostración se sostiene.

**Criterios de `acceptance`:**

- **C1/C10** — `./init.sh` **verde** con `var/` tal cual (no he borrado ni movido nada):
  43 archivos, **736 tests**, 0 fallos, 0 saltados. Los dos tests de comparación **no se
  saltaron**. El flake de `src/modules/movements/movements.test.ts:318` **no apareció** en
  esta ejecución.
- **C2** — la entrada de `trade-republic` está **borrada**; `unwatchedBanks` queda vacía y
  comentada, y el test `holds the inventory of unwatched banks EXACTLY…` sigue afirmando
  **las dos direcciones** sin debilitar. El aviso `THE COMPARISON LAYER DOES NOT WATCH`
  ya no se imprime.
- **C4** — frases e importes siguen activos y siguen cazando el caso de la F19, con
  ficheros sintéticos en directorio temporal.
- **C6** — **cero silenciamientos por lista**: `allowedPaths` sigue con su única entrada
  (`prisma/migrations/`), `allowedIbans` intacta, **ni un `no-real-data-ok` nuevo**, y los
  `docs/` **ganan** texto: la única línea «borrada» de `docs/conventions.md` es una que se
  amplía en el sitio, no una frase retirada para que el guardián calle.
- **C7** — los mensajes de fallo siguen diciendo `archivo:línea` y el tipo de coincidencia,
  nunca el valor.
- **C8** — **no cambia la app**: comprobado sobre el diff y sobre las marcas de tiempo, no
  sobre su palabra. La sesión de la F24 (10:42–10:49 del 2026-08-20) tocó
  `src/no-real-data.test.ts`, `docs/architecture.md`, `docs/conventions.md`,
  `feature_list.json` y `progress/`. `src/app.ts`, `src/architecture.test.ts` y
  `src/modules/trade-republic/` son de la **F20** (22:xx del 2026-08-19) y ya estaban en el
  árbol antes. Ni un parser, ni una ruta, ni el modelo de datos.
- **C9** — documentado en `docs/architecture.md` §ADR-017 y `docs/conventions.md` §Tests,
  con el deber que impone al parser número seis.

**CHECKPOINTS:** C1, C2 (una sola feature en `in_progress`, la F20), C3, C4, C4 bis (la
prueba real es justamente el origen de esta feature), C5 salvo la línea de `history.md`,
C6 no aplica. **C8 sin cumplir** (ver arriba). C7 no aplica (`sdd: false`).

Sin resumen de cierre por ahora: se escribe cuando el veredicto sea APPROVED.

---

# Segunda pasada (2026-08-20, tras la corrección)

**Veredicto:** APPROVED

Vuelto a revisar **entero**, sin dar por bueno nada de la primera pasada: el arreglo es de
fondo (el motivo ya no se trocea; `splitOurMessage` desaparece y lo sustituye
`echoedSpans`, que solo **añade**), así que he vuelto a medir también lo que la primera vez
estaba bien. Todo ejecutado con una **sonda propia** —copia temporal del guardián con
tests míos, más una segunda copia con el troceo antiguo repuesto— borradas ambas al
terminar; `var/` intacto.

## 1. La invariante nueva: «el corte solo puede añadir, jamás quitar»

**No he conseguido romperla.** Probado con **20 formas** distintas de motivo, todas con
conceptos inventados, y contra el **vocabulario real** del repositorio. Para cada una
comprobé la propiedad fuerte: *toda* frase del motivo **crudo** que no sea nuestra por (b)
tiene que estar en el conjunto comparado.

| Forma probada | Resultado |
|---|---|
| sin comillas / comillas dobles / comillas simples | nada perdido |
| **apóstrofo dentro** de simples, y dentro de dobles | nada perdido |
| `«…»`, comillas tipográficas `“…”`, backticks | nada perdido |
| comilla de apertura **sin cerrar**, comilla de cierre **suelta**, **tres** comillas desparejadas | nada perdido |
| comillas **anidadas** (simples dentro de dobles) | nada perdido |
| motivo que es **solo comillas**, comillas **vacías**, comilla en los dos extremos | nada perdido |
| valor **multilínea**, y multilínea **dentro** de comillas | nada perdido |
| «sopa de comillas» (una entre cada palabra), tabuladores y espaciado raro | nada perdido |
| motivo mezclando **nuestras** palabras y un valor suyo | nada perdido |

**Frases perdidas: 0 de 20 formas.** Y en las mismas 20 formas, un documento versionado
que copia el concepto **se señala siempre** (0 formas sin aviso). Es coherente con el
código: `capturePhraseSources` mete el motivo **entero** en `ourProse` y añade los tramos
entrecomillados **encima** en `data`; `echoedSpans` no decide qué se deja fuera, solo qué
se compara **dos veces**. La invariante es estructural, no una promesa.

**La demostración de que los tests nuevos no son vacíos se sostiene, y la he repetido yo:**
reponiendo el troceo antiguo en una copia de usar y tirar, sus **3 tests nuevos** se ponen
**rojos** (`3 failed | 36 passed`, exactamente lo que dice su informe) y, de paso, 3 de mis
sondas también.

## 2. El apóstrofo, con mis valores y mi entrecomillado

Cerrado. Cinco casos míos, ninguno suyo, todos **vigilados** (concepto copiado a un
documento → aviso): apóstrofo tras `O'`, tras `L'` y tras `D'`, en comillas **simples**, en
**dobles** y entre **`«»`**, y un motivo con **dos** valores entrecomillados donde el
primero lleva apóstrofo. También probé un `reason` que es un **array** de mensajes y un
`reason` dentro de un fichero **suyo** de `var/drive-read/`: vigilados los dos.

## 3. El ruido no ha vuelto, y no ha vuelto por (b)

Sobre `var/` **real**, con la capa activa:

| Medida | Antes del arreglo | Ahora |
|---|---|---|
| frases comparadas (`kept`) | 445 | **445** |
| frases sin la regla (`naive`) | 453 | **454** |
| frases que la regla descarta | 8 | **9** |
| descartadas con alguna palabra **que no es nuestra** | 0 | **0** |

Y la comprobación que pedías, la de que calla por (b) y no por algo ensanchado: barriendo
**todo el repositorio** con el mismo mecanismo que usa `./init.sh`, **con** la regla salen
**0** avisos; **desactivando solo la condición (b)** salen **97**. El ruido lo quita (b),
punto. El vocabulario propio sale de **58** archivos de producción: **844** palabras y
**1368** trigramas; ninguna de las palabras de banca ni de nombre propio que probé
(nómina, traspaso, recibo, bizum, hipoteca, tarjeta, apellidos comunes…) está en él.

## 4. Los cinco importes y la regresión del 2026-08-20

- **La capa de importes no se ha tocado esta vez tampoco.** `amountLeak` sigue comiendo
  `amountsOf(captureText())` —texto **crudo** de cada captura, motivos incluidos— sin pasar
  por `capturePhraseSources`. Verificado ejecutando: en un volcado sintético donde el único
  sitio con importes es el motivo, **se cazan**; sobre `var/` real la capa vigila **370**
  importes distintos, el mismo número que en la primera pasada.
- **El test de regresión sigue sin ser vacío**: desactivando (b), el mismo documento
  sintético **sí** se señala; con la regla puesta, cero avisos.

## 5. Lo demás, vuelto a mirar (no heredado)

- `./init.sh`: **739 tests, 43 archivos, 0 fallos, 0 saltados**, con `var/` tal cual y los
  dos tests de comparación **sin saltarse**. El flake de
  `src/modules/movements/movements.test.ts:318` **no apareció**. El único `[FAIL]` es el
  recuento de features en `in_progress` (2: la F20 abierta a propósito y la F24 devuelta
  para esta review) — **ajeno a esta feature**, y se resuelve al cerrarla.
- **Criterio 2**: `unwatchedBanks` sigue **vacía** y comentada, sin entrada de
  `trade-republic`, y el test del inventario sigue afirmando **las dos direcciones**.
- **Criterio 6**: `allowedPaths` sigue con su única entrada (`prisma/migrations/`),
  `allowedIbans` intacta, **ni un `no-real-data-ok` nuevo**, y de los `docs/` no se ha
  retirado texto para que el guardián calle (las tres líneas «borradas» del diff se
  reescriben ampliadas en el sitio, y dos son de la F20).
- **Criterio 7**: los mensajes siguen diciendo `archivo:línea` y el tipo de coincidencia,
  nunca el valor.
- **Criterio 8**: comprobado por diff **y por marcas de tiempo**, no por su palabra. La
  corrección (11:03–11:05 del 2026-08-20) tocó `src/no-real-data.test.ts`,
  `docs/architecture.md`, `docs/conventions.md`, `feature_list.json` y `progress/`.
  `src/app.ts`, `src/architecture.test.ts` y `src/modules/trade-republic/` siguen con
  fecha del 2026-08-19 22:xx: son de la **F20**. Ni un parser, ni una ruta, ni el modelo.
- **La afirmación falsa está corregida en los tres sitios** que señalé, y en los tres dice
  ahora lo que el código cumple: `src/no-real-data.test.ts` (comentario de `echoedSpans`),
  `docs/architecture.md:1363-1376` y el informe del implementer.
- `prettier --check` y `oxlint` limpios sobre el archivo tocado.

## Cambios requeridos

Ninguno.

## Checkpoints

C1 ✅ salvo el contador de `in_progress` (ajeno, ver arriba) · C2 ✅ al cerrar la F24 ·
C3 ✅ · C4 ✅ · C4 bis ✅ (la prueba real es el origen de esta feature) · C5 pendiente de la
línea de `progress/history.md`, que la escribe quien cierre · C6 no aplica ·
C7 no aplica (`sdd: false`) · **C8 ✅**: resumen de cierre en
[`progress/summaries/guardian-own-words.md`](../summaries/guardian-own-words.md).

Resumen de cierre: `progress/summaries/guardian-own-words.md`.
