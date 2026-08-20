# Resumen — feature 24 `guardian-own-words`

Fecha de cierre: 2026-08-20
Intención original: `feature_list.json` → feature `guardian-own-words`, bloque `intent`
Spec: no tiene (`"sdd": false`)

> 🔒 Ni un dato real en este archivo (ADR-017): solo recuentos y forma.

## Qué hace ahora la app que antes no

El guardián de datos reales ya **distingue tus datos de las frases que escribe el propio
programa**. Cuando un archivo tuyo se rechaza, el volcado de `var/parsed/` guarda el
**motivo del rechazo** —una frase nuestra, que la documentación publica tal cual—, y el
guardián la leía como «una frase de tu extracto copiada en los docs»: **270 avisos falsos**
en una sola ejecución del 2026-08-20, y le pasaba a **cualquier banco** cada vez que un
archivo se rechazaba. Ahora esos avisos son **cero**, sin haber bajado la guardia: los
importes y las frases se siguen comparando igual, y de hecho se vigila **algún trigrama
más** que antes.

Además, **Trade Republic ya está vigilado**: como tu `.json` escrito a mano sí se puede
leer, desaparece el aviso de «este banco no se mira» y el banco sale de la lista de huecos
declarados, que hoy queda **vacía**.

## Por dónde se usa (puntos de entrada)

No hay endpoint ni comando: esto es un **guardián que corre solo**, en cada `./init.sh` y
en cada `pnpm test`.

- `./init.sh` → paso 5 → el archivo
  [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts).
- El test que compara **frases** de `var/` contra todo el repositorio:
  [`no-real-data.test.ts:871`](../../src/no-real-data.test.ts#L871).
- El test que compara **importes** de `var/` contra todo el repositorio (no se ha tocado):
  [`no-real-data.test.ts:844`](../../src/no-real-data.test.ts#L844).
- El test que obliga a que la lista de bancos no vigilados sea **exactamente** el estado
  real: [`no-real-data.test.ts:1145`](../../src/no-real-data.test.ts#L1145).

## Dónde está el código (para revisión directa)

Todo vive en un solo archivo de `src/`, y ninguno de la aplicación se ha tocado.

### La regla nueva: qué es palabra nuestra y qué es dato tuyo

| Qué hace                                                                                 | Símbolo                              | Código                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| El único campo cuyo texto lo componemos nosotros (`reason`)                               | `ourProseKeys`                       | [no-real-data.test.ts:328](../../src/no-real-data.test.ts#L328)                                                                        |
| Los dos cubos: lo tuyo (se compara sin preguntar) y nuestros mensajes (se pregunta)        | `CaptureSources`                     | [no-real-data.test.ts:330](../../src/no-real-data.test.ts#L330)                                                                        |
| Levanta los tramos entrecomillados de un mensaje; **puede equivocarse sin consecuencias**  | `echoedSpans`                        | [no-real-data.test.ts:365](../../src/no-real-data.test.ts#L365)                                                                        |
| Reparte cada captura en los dos cubos; el motivo va **entero**, lo entrecomillado encima   | `capturePhraseSources`               | [no-real-data.test.ts:377](../../src/no-real-data.test.ts#L377)                                                                        |
| Lee los literales de mensaje de un archivo nuestro (fuera interpolaciones, pegadas las +)  | `ownMessageProse`                    | [no-real-data.test.ts:425](../../src/no-real-data.test.ts#L425)                                                                        |
| Qué cuenta como código nuestro: producción sí, tests y fixtures **no**                     | `isOwnSource`                        | [no-real-data.test.ts:438](../../src/no-real-data.test.ts#L438)                                                                        |
| Nuestro vocabulario: frases exactas + palabras sueltas                                     | `OwnVocabulary`, `ownSourceVocabulary` | [no-real-data.test.ts:454](../../src/no-real-data.test.ts#L454), [:459](../../src/no-real-data.test.ts#L459)                          |
| Decide si una frase es nuestra, **probándolo** con nuestro código, nunca por defecto       | `isOurOwnPhrase`                     | [no-real-data.test.ts:474](../../src/no-real-data.test.ts#L474)                                                                        |
| El conjunto final de frases contra el que se compara el repositorio                        | `comparablePhrases`                  | [no-real-data.test.ts:484](../../src/no-real-data.test.ts#L484)                                                                        |

### Lo que NO se ha tocado, y por qué importa

| Qué hace                                                                     | Símbolo       | Código                                                          |
| ----------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| Texto **crudo** de las capturas: de aquí salen los importes, motivos incluidos | `captureText` | [no-real-data.test.ts:281](../../src/no-real-data.test.ts#L281)  |
| La comparación de importes, intacta                                           | `amountLeak`  | [no-real-data.test.ts:804](../../src/no-real-data.test.ts#L804)  |

### El inventario de bancos no vigilados

| Qué hace                                                          | Símbolo          | Código                                                          |
| ------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------- |
| La lista, hoy **vacía**: la entrada de Trade Republic se borró      | `unwatchedBanks` | [no-real-data.test.ts:551](../../src/no-real-data.test.ts#L551)  |

### Tests

| Qué cubre                                                                                              | Código                                                            |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| La regresión del 2026-08-20: un motivo nuestro publicado en los docs **no** produce ni un aviso           | [no-real-data.test.ts:1327](../../src/no-real-data.test.ts#L1327)  |
| Que ese test **no es vacío**: sin la regla, el mismo documento sí se señala                               | [no-real-data.test.ts:1338](../../src/no-real-data.test.ts#L1338)  |
| Los **cinco importes** del mensaje del descuadre siguen vigilados                                         | [no-real-data.test.ts:1348](../../src/no-real-data.test.ts#L1348)  |
| Un valor tuyo dentro del mensaje, **entrecomillado**, sigue vigilado                                      | [no-real-data.test.ts:1370](../../src/no-real-data.test.ts#L1370)  |
| Un valor tuyo **sin comillas** sigue vigilado (la segunda condición)                                      | [no-real-data.test.ts:1378](../../src/no-real-data.test.ts#L1378)  |
| Solo se pregunta por `reason`: un nombre de producto tuyo se compara igual                                | [no-real-data.test.ts:1389](../../src/no-real-data.test.ts#L1389)  |
| Ya no se inventan frases en la costura entre dos campos del volcado                                       | [no-real-data.test.ts:1409](../../src/no-real-data.test.ts#L1409)  |
| Lo entrecomillado se levanta **y** el mensaje se conserva entero                                          | [no-real-data.test.ts:1421](../../src/no-real-data.test.ts#L1421)  |
| **Un valor con apóstrofo** dentro de comillas simples sigue vigilado (el silencio que encontró la review) | [no-real-data.test.ts:1429](../../src/no-real-data.test.ts#L1429)  |
| Y sigue vigilado sea cual sea el entrecomillado y la longitud                                             | [no-real-data.test.ts:1444](../../src/no-real-data.test.ts#L1444)  |
| La invariante: ningún corte nuestro puede sacar un carácter de la comparación                             | [no-real-data.test.ts:1465](../../src/no-real-data.test.ts#L1465)  |
| El vocabulario sale de producción, nunca de un test ni de un fixture                                      | [no-real-data.test.ts:1487](../../src/no-real-data.test.ts#L1487)  |
| Una frase es nuestra **probándolo**, nunca por defecto                                                    | [no-real-data.test.ts:1497](../../src/no-real-data.test.ts#L1497)  |
| Y los parsers reales alimentan de verdad ese vocabulario (evita la tautología)                            | [no-real-data.test.ts:1509](../../src/no-real-data.test.ts#L1509)  |

### Documentación

| Qué dice                                                                                             | Dónde                                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| ADR-017: el volcado lleva texto nuestro además de datos tuyos, cómo se separan, y la invariante del corte | [architecture.md:1340](../../docs/architecture.md#L1340) |
| La regla en corto, y el deber del parser siguiente: **entrecomilla el valor que devuelvas en un motivo**  | [conventions.md:146](../../docs/conventions.md#L146)     |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien`:

- ✅ «La suite vuelve a verde con mi archivo de Trade Republic en `var/`, sin borrar nada
  de `var/` y sin quitar frases de la documentación» → `./init.sh` con **739 tests en
  verde** y `var/` intacto; los `docs/` **ganan** texto, no lo pierden. Verificado por el
  reviewer ejecutando la suite completa con la capa de comparación activa.
- ✅ «Si mañana copio un importe mío o una frase de mi extracto a un archivo del
  repositorio, el guardián lo sigue cazando» → importes en
  [`no-real-data.test.ts:1162`](../../src/no-real-data.test.ts#L1162) y frases en
  [`:1199`](../../src/no-real-data.test.ts#L1199), y los casos difíciles en
  [`:1370`](../../src/no-real-data.test.ts#L1370),
  [`:1378`](../../src/no-real-data.test.ts#L1378) y
  [`:1429`](../../src/no-real-data.test.ts#L1429). El reviewer lo atacó además con 20
  formas distintas de motivo (comillas rotas, anidadas, apóstrofos, multilínea): **ninguna
  pierde una frase**.
- ✅ «El aviso de que Trade Republic no está vigilado desaparece» → la entrada está
  borrada y la lista queda vacía, con el test que exige que sea **exactamente** el estado
  real: [`no-real-data.test.ts:1145`](../../src/no-real-data.test.ts#L1145).
- ✅ «Nadie ha silenciado nada con una excepción para que pase» → cero excepciones nuevas:
  `allowedPaths` sigue con su única entrada, `allowedIbans` intacta y **ni un
  `no-real-data-ok` nuevo**. Lo que calla el ruido es la condición (b), medido: barriendo
  el repositorio entero, **0** avisos con la regla y **97** desactivándola.

## Decisiones que se tomaron por ti

- (delegado) **Cómo se separa tu dato de nuestro texto**: no por archivo, ni por lista, ni
  por campo entero, sino **por frase**, y solo donde coinciden **dos condiciones
  independientes** — que la frase no forme parte de un tramo entrecomillado (todo valor
  tuyo va entrecomillado) **y** que esté literalmente en los literales de mensaje de
  nuestro código de producción. Una sola palabra que no sea nuestra y la frase se sigue
  vigilando.
- (delegado) **Qué pasa cuando un motivo lleva un dato tuyo dentro**: es exactamente el
  mensaje del descuadre, que lleva **cinco importes**. Descartar el motivo entero era una
  línea y habría dejado de vigilarlos: **no se hizo**. La capa de importes no se tocó y
  sigue mirando el texto crudo.
- (delegado) **La entrada de `unwatchedBanks`**: borrada, y la lista se queda como lista
  vacía documentada, no se elimina — el día que llegue un banco ilegible, la suite tiene
  que ponerse roja.
- (añadido) **Los valores del volcado se comparan uno a uno**, no pegados en un churro:
  eran 82 avisos falsos más, de documentos que solo nombraban al banco dos veces. El
  precio, dicho en voz alta: una frase copiada **a caballo entre dos campos** del volcado
  ya no se caza (esa costura es nuestro JSON, no tu extracto).

## Qué NO se tocó / quedó fuera

- **Ni un parser, ni una ruta, ni el modelo de datos.** Comprobado por diff y por marcas de
  tiempo; el único archivo de `src/` de esta feature es `src/no-real-data.test.ts`.
- La **capa de importes** y la **capa de IBAN**, intactas.
- Lo que el guardián ya no cazaba y sigue sin cazar: importes redondos o cortos, valores
  derivados, fechas y conceptos de menos de tres palabras.

## Notas para el futuro

1. **La convención de entrecomillar el valor en un motivo no la comprueba nadie todavía**:
   hoy vive en `docs/conventions.md` y en la cabeza de quien escriba el parser número seis.
   Un test de arquitectura que la exija cerraría el círculo. Con el arreglo del apóstrofo ya
   no es una condición de la que dependa un silencio, pero sigue siendo la mitad (a).
2. **El flake de
   [`movements.test.ts:318`](../../src/modules/movements/movements.test.ts#L318)**
   (`response.json(...).filter is not a function`) sigue vivo y merece feature propia: no
   apareció en las ejecuciones de la review, pero un test que falla a veces es un test que
   se aprende a ignorar, que es el mismo mal que esta feature acaba de arreglar.
3. `prettier --check` marca `src/modules/myinvestor/myinvestor.product.parser.test.ts` como
   no formateado, de antes de esta sesión.
4. Candidato que dejó la prueba real, pendiente de tu sí: que el motivo diga «te dejaste el
   `<` de la plantilla» en vez de «fecha inválida».
