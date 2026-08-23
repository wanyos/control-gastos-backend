# myinvestor-template-marker-guard (F30) — implementación

> Un `.json` de producto de MyInvestor con el marcador `<…>` de la plantilla en el
> **nombre** entraba en verde y creaba un producto llamado como el marcador. Ahora se
> rechaza, diciendo el campo. Es **una comprobación**, la misma que Trade Republic tiene
> desde la F20/F28: ni una línea del resto del parser cambia de comportamiento.

## Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [`src/modules/myinvestor/myinvestor.product.parser.ts`](../../src/modules/myinvestor/myinvestor.product.parser.ts) | `MarkerReport`, `isMarker`, `isHalfErasedMarker`, `collectMarker`; se llaman **solo** desde `readName` y `readCurrency`, y sus dos motivos se anteponen al resto |
| [`src/modules/myinvestor/myinvestor.product.parser.test.ts`](../../src/modules/myinvestor/myinvestor.product.parser.test.ts) | 11 tests nuevos (`describe` «markers of the template (feature 30)») |
| [`src/modules/myinvestor/myinvestor.service.test.ts`](../../src/modules/myinvestor/myinvestor.service.test.ts) | 3 tests nuevos sobre `parseMyinvestorProductFile`, que es la puerta del **importador** |
| [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) | Corregida la frase «no hace falta código nuevo para eso» (era falsa) y **dos filas nuevas** en la tabla «Qué pasa cuando un archivo está mal» |
| [`docs/conventions.md`](../../docs/conventions.md) | §Parsers de banco: la decisión de **no compartir** la comprobación entre bancos, con su porqué y qué hace el tercer banco |

No se creó ningún archivo de código nuevo, no se añadió ninguna dependencia y no se
tocó ninguna migración: **nada de lo ya guardado cambia y no hay que reimportar nada**.

## Decisión 1 (delegada) — qué campos están expuestos de verdad: `name` y `currency`

**Medido, no heredado.** Sonda ejecutada el 2026-08-23 sobre el parser puro, las 13
claves de las dos plantillas, con marcador entero y con marcador a medio borrar:

| Campo | Marcador entero | Medio marcador | Por qué |
|---|---|---|---|
| `type` | rechaza | rechaza | no es uno de los cuatro valores admitidos |
| `date`, `openedAt`, `closedAt`, `maturityDate` | rechaza | rechaza | no es `AAAA-MM-DD` |
| `invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash`, `principal`, `interestRate`, `expectedGain` | rechaza | rechaza | un número escrito como texto no se interpreta jamás (R77) |
| **`name`** | **ENTRABA** | **ENTRABA** | texto libre: un marcador es una cadena no vacía perfectamente válida |
| **`currency`** | **ENTRABA** | **ENTRABA** | texto libre igual, con el mismo agujero |

Así que la auditoría acertaba en lo que decía (importes y tipo fallan solos) y **se
dejaba un campo**: `currency`. No está en la plantilla publicada —«decidido: no se
escribe nunca»— pero el parser lo admite y es texto libre, que es el criterio que el
humano fijó («todo campo de texto libre que aparezca entra en el alcance»). Entra.

**Y los otros once se quedan como están, a propósito.** Ya rechazan, con un motivo suyo
que nombra el campo. Reescribir esos motivos para que digan «marcador» sería revisar el
parser entero, que es justo lo que esta feature no es. Queda **congelado con un test**
(F30-2): si alguno dejara de rechazar, el agujero del §G1 volvería por otro campo y la
suite se pone roja.

Las claves `_lo_que_sea` quedan fuera por definición: son sus notas y se ignoran enteras.

## Decisión 2 (delegada) — **no se comparte con Trade Republic**: se copia el patrón

La F28 dejó la condición escrita —«se comparte cuando haya dos usuarios reales y la F29
esté cerrada, **y solo si entonces sigue haciendo falta**»—. Las dos primeras se cumplen
hoy. **La tercera no**, y esto es la decisión tomada de nuevo, no heredada:

1. **La política diverge, y ese es el hecho nuevo que la F28 no podía saber.** Trade
   Republic pasa la comprobación por **todos** sus campos; MyInvestor solo por los
   **dos de texto libre**, porque los otros once ya se rechazan solos (Decisión 1). Lo
   compartible es un predicado de dos líneas de expresión regular; lo que lleva el
   riesgo —**a qué campos se aplica**— seguiría siendo de cada banco de todas formas.
   Un `lib/template-marker.ts` compartiría lo trivial y dejaría duplicado lo delicado.
2. **La norma vigente lo resuelve así, y ya lo hizo antes.** `docs/conventions.md`
   §Parsers de banco: un parser por banco, sin genéricos, y lo compartido es lo que
   **no** es formato (la forma de la salida, la codificación). El marcador `<…>` es la
   convención de una **plantilla**, que publica el documento de cada banco por su
   cuenta: que hoy las dos usen el mismo símbolo es estilo, no contrato. El precedente
   literal es el de la F18: «el banco siguiente que traiga CSV entrecomillado **copia el
   patrón, no el módulo**».
3. **`src/lib/` es una puerta que la propia auditoría marca como riesgo** (C5: cualquier
   módulo de banco puede importar de `lib/` sin lista blanca). Un ayudante de marcadores
   sería el primer inquilino de `lib/` que **sí** es código de leer un formato, y con él
   el cambio de plantilla de un banco pasaría a ser regresión del otro.

**Coste asumido:** ~10 líneas duplicadas en dos módulos, y que quien dé de alta un tercer
banco con plantilla a mano tenga que acordarse. Eso último **no se deja a la memoria**:
queda escrito en `docs/conventions.md` §Parsers de banco, con la instrucción de medir
antes qué campos suyos quedan expuestos. El guardián que lo haría automático —el test
doc↔código que Trade Republic sí tiene— va como sugerencia fuera de scope.

## Decisión 3 (delegada) — **sí cubre el marcador a medio borrar**, con la regla de la F28

Se cubre, y por evidencia: la sonda del §G1 mostró que en `name` el medio marcador
(`"<nombre del producto"`) **entra en verde exactamente igual** que el entero, con el
mismo daño silencioso. Cubrir uno y no el otro dejaría media puerta abierta.

Regla, idéntica a la que la F28 razonó para Trade Republic:

- Cuenta un valor que **empieza por `<`** o **acaba en `>`** (tras recortar espacios) y
  no es un marcador entero: borrar uno de los dos delimitadores deja **siempre** el otro
  en un **extremo**.
- El símbolo **en mitad del texto NO cuenta**. `Cartera 3 > 2` y `Fondo A<B Sintetico`
  entran sin problema, y tienen test. El medio es el único sitio donde un nombre puede
  llevar el símbolo legítimamente, y un residuo de esta errata nunca cae ahí.
- **El falso positivo que sí se acepta**, dicho en claro: un nombre que empezara con `<`
  o terminara con `>` **a propósito** se rechaza, con un motivo que dice exactamente qué
  hacer. Es el intercambio bueno: rechazar de más con un mensaje que se entiende, nunca
  tragarse un marcador como identidad de un producto. Cambiar el nombre es una salida;
  una serie partida en dos meses después, no.
- **Los dos motivos van separados y en este orden** (marcador entero primero, medio
  marcador después, luego el resto): son erratas distintas y se arreglan mirando cosas
  distintas. Es la misma decisión de la F28 y tiene test.

El parser **no adivina ni repara**: no quita el símbolo para leer lo que queda. El
archivo se rechaza; lo que hay ahora es un motivo donde antes no había ninguno.

## Mapeo criterio → test

`P` = [`myinvestor.product.parser.test.ts`](../../src/modules/myinvestor/myinvestor.product.parser.test.ts) ·
`S` = [`myinvestor.service.test.ts`](../../src/modules/myinvestor/myinvestor.service.test.ts)

| # | Criterio | Test |
|---|---|---|
| 1 | El nombre con el marcador se **rechaza**, nombrando el campo; con el caso exacto de la auditoría | `P` «rejects the exact case of the audit: the template marker as the name», «names the field in the reason, and does not repair the value», «rejects the marker on a deposit too»; y en la puerta del importador `S` «throws instead of creating a product named after the placeholder» |
| 2 | Decisión 1 por escrito: qué campos están expuestos, **comprobado** | §Decisión 1 (sonda de las 13 claves) + `P` «leaves the reasons of the other fields exactly as they were» (congela las rechazadas por su propia validación) y `P` «covers `currency`, the OTHER free-text field measured as exposed» |
| 3 | Decisión 2 por escrito: compartir o no con Trade Republic | §Decisión 2 + [`docs/conventions.md`](../../docs/conventions.md) §Parsers de banco. Comprobación: la suite de `trade-republic` sigue verde **sin tocar un solo archivo suyo** (`git status`) |
| 4 | Decisión 3 por escrito: medio marcador, sin falsos positivos | §Decisión 3 + `P` «rejects a HALF-ERASED marker on the name», «rejects a half-erased marker that kept the closing symbol», «keeps the two marker reasons APART», «does NOT flag the symbol in the MIDDLE», `S` «throws on a half-erased marker too» |
| 5 | Sus 5 productos siguen entrando; no-regresión de los **cuatro tipos** con fixtures sintéticas | `P` «his five real products keep entering: the four types, untouched» (5 archivos: 2 `fund`, 1 `etf`, 1 `managed_portfolio`, 1 `deposit`), `P` «a name with a legitimate `<` in the middle still enters», `S` «keeps letting the four types through, untouched»; y los tests que ya existían del parser, intactos |
| 6 | Lo guardado no se toca y no hay que reimportar | Sin migración, sin script y sin escritura: el cambio vive entero en un parser puro (`git status` de `prisma/` vacío) |
| 7 | Él no escribe ni un campo nuevo, y el parser **no adivina ni repara** | `S` «demands not one field more than the template already asks for» (ya existente, con las fixtures de la F13 intactas) + `P` «names the field in the reason, and **does not repair the value**» |
| 8 | Ningún otro banco cambia de comportamiento | Ni una línea fuera de `src/modules/myinvestor/`; las suites de `bankinter`, `n26`, `openbank` y `trade-republic` siguen verdes, y `src/architecture.test.ts` también |
| 9 | La documentación que él lee lo recoge | [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md): corregido el recuadro «⚠️ Las plantillas llevan marcadores `<…>` a propósito» y **dos filas nuevas** en la tabla «Qué pasa cuando un archivo está mal» |
| 10 | Ni un dato real (ADR-017); todo mapeado; `./init.sh` verde | Todas las fixtures salen de `buildProductFund/Portfolio/Deposit` de la F13 (nombres inventados); `src/no-real-data.test.ts` sigue verde; este archivo es el mapeo |

## Último `./init.sh`

Completo, el 2026-08-23:

```
── 4. Type checking (tsc) ──   [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────   Test Files  48 passed (48)
                               Tests      890 passed (890)
── 6. Resumen ──────────────   [OK] Entorno listo.
```

Aparte, y en verde los dos: `npx prettier --check .` («All matched files use Prettier
code style!») y `npx oxlint` (exit 0, sin avisos).

**La base de datos del humano no se ha tocado**: el cambio es un parser puro y sus
tests no abren conexión; desde la F27 los que la necesitan usan bases desechables.

## Sugerencias fuera de scope (NO aplicadas)

1. **El guardián doc↔código de MyInvestor (C4 de la auditoría).** Trade Republic tiene
   `trade-republic.docs.test.ts`, que extrae los bloques de la plantilla de su documento
   y comprueba que el parser los rechaza. MyInvestor no lo tiene, y es **el mecanismo
   que haría este agujero imposible de reintroducir** (hoy la plantilla del doc y la del
   fixture pueden divergir sin que nadie se entere). Está escrito una vez y son ~120
   líneas de copiar el patrón. Es la continuación natural de esta feature.
2. **Los demás huecos de MyInvestor que el §G1 enumeró de paso** y que esta feature no
   toca: la regla de desempate de `fichero (1).json`, los dos guardias de «no trae su
   valoración / sus condiciones» y el motivo `'archivo de producto no interpretable'`,
   todos sin test aunque su gemelo de Trade Republic sí lo tenga.
3. **Unificar el motivo de un marcador en los campos numéricos y de fecha.** Hoy un
   `<lo que vale hoy>` en `marketValue` dice «se espera un número sin comillas», que es
   verdad pero no nombra el marcador. Trade Republic sí lo nombra. Se descartó por
   alcance —cambiaría motivos que hoy están probados— y porque el daño ahí es cero: el
   archivo se rechaza igual.
