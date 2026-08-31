# guardian-knows-our-own-filenames (F34) — implementación

> **Qué se ha tocado:** el guardián de datos reales (ADR-017) y su documentación.
> **Nada** de `var/`, nada de la F31, nada de la F33, nada de la aplicación: ni parsers,
> ni rutas, ni modelo de datos.

## Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) | La exención (`fileNameKeys`, `publishedFilenames`, `compilePublishedFilename`, `publishedFilenameOf`, `letThrough`) + 8 tests nuevos |
| [`docs/architecture.md`](../../docs/architecture.md) | ADR-017: banner de revisión del 2026-08-26 y un bloque nuevo en §Consecuencias |
| [`docs/conventions.md`](../../docs/conventions.md) | §Tests: qué se exime, por qué y qué tiene que hacer quien documente un banco nuevo |
| [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md) | Aviso de que **esa línea la lee un test**, y qué hay que mantener al reescribirla |
| [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) | Aviso de que su convención **no exime nada**, y por qué eso es lo correcto |
| `progress/current.md` | Cuaderno de la sesión |

Creados: este informe. **Ni un archivo nuevo de código.**

## El fallo, en una línea

El volcado de un parser de producto guarda en `file` el **nombre del archivo** que
parseó. Para Trade Republic ese nombre es la **convención que este proyecto publica**
(`docs/trade-republic-product-files.md`), así que el guardián comparaba **nuestro propio
texto** contra nuestros propios documentos: **52 avisos de un solo trigrama**, sobre
fixtures cuyo producto se llama literalmente «Cuenta Sintetica Remunerada». Y no era
residuo de la F33: **cada parseo real que él hace vuelve a escribir ese nombre**.

**Medido, no supuesto:** con la exención desactivada a mano (mutación de `fileNameKeys` a
vacío), el test «copies no telling phrase of the local captures» da **exactamente los 52
avisos** que midió la F33; con ella, cero. La mutación se revirtió.

## Las cuatro decisiones delegadas

### 1. ¿Exención por FORMA o por PROCEDENCIA? → **Las DOS, y en ese orden**

La consigna decía que procedencia es más estrecha. **Sola no basta**, y conviene decirlo:
el valor de `file` es el nombre que **él** le puso a su archivo en Drive, no una cadena
que produzca nuestro código. Si el humano nombra un archivo con un dato suyo dentro
—`renta-<su-producto>-2026-08-31.json`—, una exención «todo lo que venga del campo `file`
es nuestro» **dejaría de vigilar un dato real**. Sería el mismo error que la F24 rechazó
al negarse a descartar el `reason` entero.

Así que la regla exige **las dos condiciones**, igual que la F24:

- **Procedencia** ([`fileNameKeys`, línea 369](../../src/no-real-data.test.ts#L369)): solo
  un valor bajo una clave que sabemos que guarda un nombre de archivo (hoy `file`). El
  **mismo texto** puesto en `name` —donde cae un producto suyo— se compara como siempre.
- **Forma** ([`publishedFilenameOf`, línea 434](../../src/no-real-data.test.ts#L434)): además
  tiene que encajar **entero y anclado** (`^…$`) con un patrón que publica **nuestra
  propia documentación**.

La intersección es más estrecha que cualquiera de las dos por separado, y el
enganche está en una sola rama de `capturePhraseSources`
([línea 537](../../src/no-real-data.test.ts#L537)).

**Por qué no abre un hueco:** un patrón solo se compila si su **único hueco es una
fecha** ([`compilePublishedFilename`, línea 392](../../src/no-real-data.test.ts#L392)); un
hueco de cualquier otra clase (`<producto>`) **descarta el patrón entero**, porque todo lo
que cabe ahí es suyo. Consecuencia: un valor eximido es, **por construcción**, texto
publicado por nosotros más dígitos. No hay dónde esconder un dato dentro.

**Y no es una lista escrita a mano:** los patrones **se leen de los `docs/`**
([`publishedFilenames`, línea 411](../../src/no-real-data.test.ts#L411)) — la línea que
recomienda cómo nombrar el archivo, con el patrón entre comillas invertidas. Un banco
nuevo entra **por documentarse**, no por tocar el guardián. Y lo que se deja pasar se
**registra con la página que lo autoriza** (`letThrough`), así que «por qué lo dejó pasar»
tiene respuesta sin abrir ninguna lista.

### 2. ¿Encaja en el mecanismo de la F24? → **No. Y es pieza aparte por una razón, no por comodidad**

Se intentó primero, que era lo preferible. **No encaja, y el motivo es exactamente lo que
hace bueno al mecanismo de la F24:** aquel solo da por nuestra una frase que esté
**literal en el código de producción**, excluyendo tests y fixtures a propósito (un test
es donde una frase se **copia**, y la fuga de la F19 fue justo un fixture). La palabra de
esta convención vive en la **documentación** y en la plantilla, **nunca** en un literal de
mensaje de `src/`: comprobado, `remunerada` no aparece en ningún `.ts` de producción.
`ownSourceVocabulary` responde —**con razón**— «esto no es mío».

Forzarlo habría exigido meter los `docs/` en el vocabulario de la F24, y eso sí que habría
aflojado el guardián de verdad: los `docs/` son **el sitio donde una fuga se pega**, no
donde nace un mensaje. Se mantiene la separación: la F24 prueba autoría contra el
**código**; la F34 prueba una **convención publicada** contra la **documentación**, y con
dos condiciones en vez de una porque el material es más peligroso.

Lo que sí se reaprovecha: la misma **forma** (dos condiciones independientes), el mismo
sitio (`capturePhraseSources`), el mismo principio de «leerlo de una fuente de verdad, no
escribirlo aquí» y la misma promesa de que **la capa de importes no se toca**.

### 3. ¿Cómo se demuestra que NO se ha aflojado? → **Un test central + dos mutaciones**

Se escribió **antes** de tocar el guardián.

- **El test central**, `KEEPS CATCHING a real datum of his inside a file name, with file
  and line` ([línea 1783](../../src/no-real-data.test.ts#L1783)): mete un dato suyo
  simulado **dentro de un nombre de archivo** (`renta-ventolera-tramontana-…json`, un
  producto inventado), lo copia a un documento versionado simulado y exige el aviso
  **exacto**, con `archivo:línea`. Además comprueba que el mensaje **no lleva el valor**
  (ADR-017).
- **Mutación A** — ensanchar la exención a **todo** valor de `file` (quitar la condición de
  forma): **3 tests rojos**, el central entre ellos.
- **Mutación B** — quitar la mitad de **procedencia** (eximir por forma en cualquier
  clave): **1 test rojo**, `KEEPS CATCHING the very same name under a key that is not a
  file name`.
- Las dos mitades de la regla son, por tanto, **portantes**: ninguna sobra y ninguna se
  puede relajar sin que la suite lo diga. Ambas mutaciones se revirtieron
  (`git diff` limpio de ellas).
- Y el guardián **sigue cazando lo de siempre**: los 17 tests de mecanismo de la F19/F23/F24
  siguen en verde sin tocar ni una línea, y la capa de importes sigue leyendo el texto
  **crudo** de la captura (test `KEEPS CATCHING his amounts`).

**Lo que la exención NO cubre, dicho en voz alta:** nada más que un nombre de archivo. No
se ha bajado ninguna sensibilidad, no se ha añadido ninguna ruta a `allowedPaths`, ningún
`no-real-data-ok`, ninguna palabra a `stopWords`, ni se ha quitado una sola frase de la
documentación. `git diff` lo enseña.

### 4. ¿Pasa lo mismo con otros bancos? → **Comprobado sobre los volcados reales. Solo Trade Republic, y MyInvestor NO se exime**

De los siete volcados de `var/parsed/`, solo **dos** guardan un campo `file`: los de
producto de **MyInvestor** y **Trade Republic** (los de extracto no lo llevan). Medido
sobre los nombres que hay hoy:

| Volcado | Nombres | Eximidos | Siguen vigilados |
|---|---|---|---|
| `myinvestor/2026/products.json` | 5 | **0** | **5** |
| `trade-republic/2026/products.json` | 26 | 24 | **2** |

- **MyInvestor no se exime, y es lo correcto:** su convención publicada es
  `<producto>-<AAAA-MM-DD>.json`, y `<producto>` es el nombre que **él** le da a su fondo.
  El patrón se **descarta entero**, así que sus nombres se comparan igual que antes. Si
  algún día salta por uno de ellos, será un **aviso bueno**.
- **Los dos de Trade Republic que siguen vigilados** son nombres que no siguen la
  convención publicada. Se quedan dentro de la comparación a propósito, y hoy no producen
  ningún aviso.
- **Los bancos de extracto** (Bankinter, N26, Openbank) no guardan nombres de archivo en
  su volcado: no tenían ni pueden tener este falso positivo.

El chequeo está fijado en un test contra los **docs reales**
([línea 1737](../../src/no-real-data.test.ts#L1737)), no solo en esta tabla: ningún patrón
publicado real acepta un nombre con un producto inventado dentro.

## Mapeo criterio → test (`docs/verification.md`)

| Criterio de `acceptance` | Cómo se demuestra |
|---|---|
| Con el volcado real de `var/parsed/` presente, `./init.sh` termina en verde | `./init.sh`: **950/950 tests, 49 archivos**, `tsc` limpio. El único `[FAIL]` es «3 features en `in_progress`» (F31, F33 y esta), que se resuelve al cerrarlas |
| **PRUEBA DE QUE NO SE HA AFLOJADO** (criterio central) | [`KEEPS CATCHING a real datum of his inside a file name, with file and line`](../../src/no-real-data.test.ts#L1783), con el aviso exacto `archivo:línea` y sin el valor. Reforzado por dos mutaciones que lo ponen rojo (§Decisión 3) |
| La exención cubre **solo** nombres con el patrón publicado; ni una frase más | [`reads the conventions from our own docs…`](../../src/no-real-data.test.ts#L1717) (encaje entero y anclado) + [`KEEPS CATCHING the very same name under a key that is not a file name`](../../src/no-real-data.test.ts#L1803) + [`KEEPS CATCHING his amounts…`](../../src/no-real-data.test.ts#L1815). Y `git diff`: cero cambios en `stopWords`, `allowedPaths`, `allowedIbans`, `isTelling` y `tellingPhrases` |
| Decisión nº 1 por escrito (forma vs. procedencia) | §Las cuatro decisiones · 1 |
| Decisión nº 2 por escrito (¿encaja en la F24?) | §Las cuatro decisiones · 2 |
| Decisión nº 4 por escrito, **comprobada** | §Las cuatro decisiones · 4 (tabla medida sobre los volcados reales) + [`the real docs of this repository do feed it, and none of them opens a hole`](../../src/no-real-data.test.ts#L1737) |
| No hay lista de excepciones escrita a mano | [`publishedFilenames`](../../src/no-real-data.test.ts#L411) lee los patrones de los `docs/`; [`DISCARDS a published pattern whose placeholder is not a date`](../../src/no-real-data.test.ts#L1729) y [`says WHAT it let through and WHICH page says so`](../../src/no-real-data.test.ts#L1829) |
| Regresión del falso positivo, con datos inventados | [`reports NOTHING about a file name our own documentation publishes`](../../src/no-real-data.test.ts#L1755) + su gemelo [`would have reported it without the rule…`](../../src/no-real-data.test.ts#L1770), que impide que el anterior sea vacuo |
| El humano no renombra nada | Cero cambios en las plantillas, en la convención publicada y en los nombres de sus archivos. `docs/*-product-files.md` solo gana una nota explicativa |
| Ni la F31 ni la F33 se tocan | Ninguno de sus archivos está en la tabla de arriba: ni `src/lib/test-var.ts`, ni `vitest.global-setup.ts`, ni `src/modules/**`, ni `prisma/` |
| Nada de `var/` se toca | Ni una escritura, ni un borrado, ni un renombrado. La red de la F33 (foto de `var/` antes y después) estuvo **activa en todas las pasadas** y no dijo nada |
| Ni un dato real en tests ni fixtures (ADR-017) | Todo lo nuevo es inventado: banco `monte-tramontana`, página `docs/monte-tramontana-product-files.md`, convención `cuenta-ventolera-<AAAA-MM-DD>.json`, producto `RENTA VENTOLERA TRAMONTANA`. El propio guardián escanea este archivo y no señala ni una línea nueva |

## Último `./init.sh`

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────  Test Files 49 passed (49) · Tests 950 passed (950) · 7,61 s
── 6. Resumen ─────────────  [FAIL] — único fallo: «Hay 3 features en in_progress (máximo 1)»
```

`pnpm run lint` (oxlint) limpio y `prettier --check` limpio en los cinco archivos tocados.
El `[FAIL]` del paso 3 son la F31, la F33 y esta feature: se resuelve **al cerrarlas**, y
no es trabajo de esta implementación.

## Sugerencias fuera de scope (NO aplicadas)

1. **`fileNameKeys` tiene una sola clave, `file`.** Es la única que existe hoy en los
   volcados. Si un parser futuro guarda el nombre bajo otro nombre de campo, el falso
   positivo vuelve **y hay que añadirlo ahí a mano** — que es el único trocito de esta
   solución que no se lee de una fuente de verdad. Alternativa si molesta algún día:
   derivar las claves de los tipos del volcado. No se ha hecho porque hoy sería
   complejidad sin caso.
2. **Los dos nombres de Trade Republic que no siguen la convención** (§Decisión 4) hoy no
   dan aviso. Si algún día lo dan, será por sus palabras, no por las nuestras: se mira
   entonces, sin tocar nada ahora.
3. **`progress/explorations/handoff-backend-saldo-real.md`** sigue sin commitear y el
   guardián ya no lo señala. Es material de la F31: no se ha tocado.
