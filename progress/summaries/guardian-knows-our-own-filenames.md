# Resumen — feature 34 `guardian-knows-our-own-filenames`

Fecha de cierre: 2026-08-26
Intención original: `feature_list.json` → feature `guardian-knows-our-own-filenames`, bloque `intent`
Spec: no lleva (`"sdd": false`)

## Qué hace ahora la app que antes no

Ahora puedes **parsear tus archivos de verdad y pasar la suite sin que se ponga roja**.
Antes no: cada parseo real de Trade Republic dejaba dentro del volcado el **nombre del
archivo** (`cuenta-remunerada-2026-07-01.json`), que es la convención que **este proyecto
te dice que uses**, y el guardián de datos reales lo leía como si fuera una frase de tu
extracto. De ahí salían los **52 avisos** de esta semana: todos del mismo trigrama, todos
señalando textos nuestros.

Desde hoy el guardián sabe distinguir un nombre de archivo que **hemos escrito nosotros**
de un dato tuyo. Lo demás sigue exactamente igual de estricto: si alguien cuela un dato
tuyo en un test o en un documento, te lo sigue diciendo con archivo y línea, sin escribir
el valor.

**Cómo lo distingue, en una frase:** solo deja pasar un texto si cumple **las dos** cosas
a la vez —que esté guardado bajo un campo que sabemos que es un nombre de archivo (`file`)
**y** que encaje **entero** con un patrón que publica nuestra propia documentación—, y solo
valen los patrones cuyo **único hueco es una fecha**. Como en un hueco de fecha no cabe
ninguna palabra tuya, lo que se deja pasar es, por construcción, texto nuestro más dígitos.

**Nada de listas a mano:** los patrones se **leen de los `docs/`**. Un banco nuevo entra
por documentarse, no por tocar el guardián. Y cuando deja pasar algo, se puede preguntar
**qué** dejó pasar y **qué página lo autoriza**.

## Por dónde se usa (puntos de entrada)

Esto no es una función de la aplicación: es la red de seguridad que corre con los tests.

- `./init.sh` (o `pnpm test`) — el guardián corre entero ahí. **950 tests en verde.**
- [`docs/trade-republic-product-files.md:171`](../../docs/trade-republic-product-files.md#L171)
  — **esta línea la lee un test**. Si algún día la reescribes, mantén el patrón entre
  comillas invertidas y la fecha como único hueco.
- [`docs/myinvestor-product-files.md:252`](../../docs/myinvestor-product-files.md#L252) —
  la convención de MyInvestor lleva **tu** nombre de producto dentro, así que **no exime
  nada** y sus archivos se siguen vigilando enteros. Es lo correcto.
- [`src/no-real-data.test.ts:369`](../../src/no-real-data.test.ts#L369) — `fileNameKeys`, el
  único trocito que no se lee de una fuente de verdad: los campos donde un volcado guarda
  un nombre de archivo (hoy solo `file`).

## Dónde está el código (para revisión directa)

Toda la feature vive en **un archivo de código** y cuatro páginas de documentación. Ni un
archivo nuevo.

### La regla: qué se deja pasar y por qué (`src/no-real-data.test.ts`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los campos que sabemos que guardan un nombre de archivo (mitad de **procedencia**) | `fileNameKeys` | [no-real-data.test.ts:369](../../src/no-real-data.test.ts#L369) |
| Un patrón publicado ya compilado, con la página de la que salió | `PublishedFilename` | `src/no-real-data.test.ts` |
| Qué cuenta como página nuestra: `docs/*.md`, nunca un test ni un fixture | `isPublishedDoc` | `src/no-real-data.test.ts` |
| El único hueco admitido: una fecha | `datePlaceholder` | `src/no-real-data.test.ts` |
| Convierte el patrón de la doc en una expresión **anclada**; devuelve nada si el hueco no es una fecha | `compilePublishedFilename` | `src/no-real-data.test.ts` |
| Lee las convenciones **de los `docs/`**, de la línea «Convención recomendada … `patrón`» | `publishedFilenames` | `src/no-real-data.test.ts` |
| Las lee una sola vez por ejecución | `defaultPublishedFilenames` | `src/no-real-data.test.ts` |
| Qué convención sigue un valor, o ninguna (mitad de **forma**) | `publishedFilenameOf` | `src/no-real-data.test.ts` |
| Lo que se dejó pasar, con la página que lo autoriza | `letThrough` / `PublishedFileName` | `src/no-real-data.test.ts` |
| Donde se aplica la regla, en **una sola rama** al recorrer el volcado | `capturePhraseSources` | [no-real-data.test.ts:537](../../src/no-real-data.test.ts#L537) |

### Los tests que sujetan la regla (mismo archivo)

| Qué cubre | Código |
| --- | --- |
| **El central: sigue cazando un dato tuyo metido dentro de un nombre de archivo**, con archivo y línea y sin escribir el valor | [no-real-data.test.ts:1783](../../src/no-real-data.test.ts#L1783) |
| Sigue cazando ese mismo nombre si está bajo otro campo (`name`) | `src/no-real-data.test.ts` |
| Sigue cazando tus importes: la capa de dinero no ve este reparto | `src/no-real-data.test.ts` |
| Las convenciones se leen de los docs, y encajan **enteras y ancladas** | `src/no-real-data.test.ts` |
| Un patrón con un hueco que no es fecha se **descarta entero** | `src/no-real-data.test.ts` |
| Las páginas **reales** del repo alimentan la regla y ninguna abre un agujero | `src/no-real-data.test.ts` |
| La regresión: ya no avisa por un nombre que publicamos nosotros… | `src/no-real-data.test.ts` |
| …y sin la regla sí habría avisado (el anterior no es vacuo) | `src/no-real-data.test.ts` |
| Dice **qué** dejó pasar y **qué página** lo autoriza | `src/no-real-data.test.ts` |
| El material inventado de estos tests (banco, página, convención, producto) | `inventedConventionDoc`, `inventedOwnName`, `inventedHisName` |

### Documentación

| Qué | Dónde |
| --- | --- |
| ADR-017 revisado: qué se exime, por qué no abre un agujero | `docs/architecture.md` §ADR-017 |
| Regla para quien escriba un parser o documente un banco nuevo | `docs/conventions.md` §Tests |
| Aviso de que esa línea la lee un test | `docs/trade-republic-product-files.md` |
| Aviso de que esa convención no exime nada, y por qué está bien | `docs/myinvestor-product-files.md` |

## Cumplimiento de la intención

- ✅ «Cuando parseo mis archivos de verdad y luego paso la suite, está en verde» → se
  cumple. `./init.sh` con tu `var/parsed/` real delante: **950 de 950**. El revisor apagó
  la exención a mano y volvieron **exactamente los 52 avisos**, ni uno más: la regla se
  lleva el falso positivo y nada más.
- ✅ «Cuando alguien cuela un dato mío de verdad, el guardián lo sigue cazando y me dice
  archivo y línea» → se cumple; verificado en
  [`src/no-real-data.test.ts:1783`](../../src/no-real-data.test.ts#L1783), que además
  comprueba que el aviso **no escribe tu dato**. El revisor lo puso a prueba con dos
  mutaciones (aflojar cada mitad de la regla): la suite se puso roja las dos veces, así que
  ese test no es decorativo.
- ✅ «No tengo que renombrar nada ni cambiar cómo escribo mis archivos» → se cumple. Cero
  cambios en las plantillas y en la convención; tus páginas solo ganan una nota explicativa.
- ✅ «Cuando el guardián deja pasar algo, se puede ver por qué» → se cumple; verificado en
  el test `says WHAT it let through and WHICH page says so`, que exige el valor **y** la
  página. No hay lista de excepciones a mano: las convenciones se leen de los `docs/`.

## Decisiones que se tomaron por ti

- (delegado) **Se exige forma Y procedencia, no una de las dos.** Tú dijiste que la
  procedencia era más estrecha; sola no bastaba, y conviene que lo sepas: el nombre de tus
  archivos lo pones **tú**, así que «todo lo que venga del campo `file` es nuestro» habría
  dejado de vigilar un dato tuyo el día que nombraras un archivo con un producto dentro.
  Con las dos condiciones eso sigue cazado.
- (delegado) **No se reutiliza el mecanismo de la F24, y es la decisión de diseño buena de
  esta feature.** Aquel demuestra que una frase es nuestra buscándola **en el código de
  producción**, excluyendo tests y fixtures a propósito. Esta convención no vive en el
  código, vive en la documentación: forzarla ahí habría exigido dar a los `docs/` poder
  para declarar «esto es nuestro», y los `docs/` son justo donde se pega una fuga. Se
  quedan separados.
- (delegado) **Comprobado banco por banco, no supuesto:** de tus siete volcados, solo dos
  guardan nombres de archivo. Trade Republic exime 24 de 26 (los dos restantes no siguen la
  convención y siguen vigilados); **MyInvestor exime 0 de 5**. Los bancos de extracto
  (Bankinter, N26, Openbank) no guardaban nombres: no tenían este problema.

## Qué NO se tocó / quedó fuera

- **Nada de `var/`**: ni una escritura, ni un borrado, ni un renombrado.
- **Nada de la F31 ni de la F33**, ni de la aplicación: ni parsers, ni rutas, ni modelo de
  datos. Solo el guardián y su documentación.
- **No se bajó ninguna sensibilidad**: ni rutas nuevas exentas, ni palabras nuevas
  ignoradas, ni comprobaciones apagadas. Las capas de importes y de IBAN siguen leyendo el
  texto crudo de tus archivos, nombres de archivo incluidos.

## Notas para el futuro (opcional)

- Si algún día un parser nuevo guarda el nombre del archivo bajo **otro campo** (no `file`),
  el falso positivo volverá y habrá que añadir ese campo a `fileNameKeys` a mano. Es el
  único trocito que no se lee de una fuente de verdad, y falla del lado seguro: mientras no
  se añada, esos nombres se vigilan.
- Los **dos** nombres de Trade Republic que no siguen la convención siguen comparándose. Hoy
  no dan aviso; si algún día lo dan, será por tus palabras y habrá que mirarlo entonces.
- Queda en `var/` un `var/__reviewer-probe.txt` que no es de esta feature (basura de otra
  sesión). No se ha borrado: de `var/` no se toca nada sin preguntarte.
