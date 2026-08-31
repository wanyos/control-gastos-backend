# Resumen — feature 35 `client-errors-are-not-500`

Fecha de cierre: 2026-08-30
Intención original: `feature_list.json` → feature `client-errors-are-not-500`, bloque `intent`
Spec: no lleva (`"sdd": false`)

## Qué hace ahora la app que antes no

Ahora, **cuando la petición viene mal, la API te lo dice**. Antes te contestaba
`500 INTERNAL_SERVER_ERROR` —«el servidor se ha averiado»— y te mandaba a leer el
log del servidor por una errata tuya. Es lo que te pasó probando la F31: mandaste
un `POST` con cabecera de JSON y el cuerpo vacío y recibiste un 500.

Desde hoy:

| Lo que mandas mal | Antes | Ahora |
| --- | --- | --- |
| Cuerpo vacío con `Content-Type: application/json` | `500` | **`400 BAD_REQUEST`** |
| JSON mal escrito | `500` | **`400 BAD_REQUEST`** |
| Un `Content-Type` que la API no sabe leer | `500` | **`415 UNSUPPORTED_MEDIA_TYPE`** |
| Un cuerpo más grande que el límite | `500` | **`413 PAYLOAD_TOO_LARGE`** |

Y con el mensaje útil de verdad («Body cannot be empty when content-type is set
to 'application/json'»), no una frase vacía.

**Lo que NO ha cambiado, y está probado:** los errores nuestros (`NOT_FOUND`,
`CONFLICT`…) siguen igual, la validación de esquema sigue dando
`400 VALIDATION_ERROR`, y **una avería de verdad del servidor sigue siendo un 500
con cuerpo genérico** —sin contar nada de dentro— **y se sigue escribiendo entera
en el log**. Ninguna ruta cambia lo que devuelve cuando todo va bien.

**Las dos cosas que hacen que esto sea seguro, en cristiano:**

1. **Solo se cree al servidor HTTP, y solo cuando él mismo dice que la culpa es
   de quien llama.** Hacen falta las dos cosas a la vez: que el error lo haya
   levantado Fastify (su código empieza por `FST_ERR_`) y que él ya lo haya
   clasificado como 4xx. Cualquier otra cosa —un 5xx, un error sin estado, o un
   `403` que venga de una librería de terceros hablando con Drive— sale como
   `500` genérico y se registra con `log.error`. **Se equivoca siempre hacia «la
   culpa es nuestra»**, que es el lado barato: cuesta un 500 de más, nunca contar
   algo de dentro a un desconocido.
2. **El mensaje solo viaja si no lleva nada pegado.** Se comprobaron **uno a uno
   los 13 errores 4xx** que declara Fastify 5.12.1 y dos de ellos meten en la
   frase un valor **nuestro** (un nombre de método, una ruta). La regla no es una
   lista de excepciones: el mensaje sale **solo si es exactamente la frase que
   Fastify tiene escrita para ese código**. En cuanto algo se interpola dentro
   —sea lo que sea—, tú recibes el texto estándar (`Bad Request`) y el detalle
   completo se queda **solo en el log**. Es a prueba de futuro: un mensaje nuevo
   con interpolación no se publica aunque nadie toque nada aquí.

Tampoco hay lista de códigos que ir ampliando: un error de petición que Fastify
añada mañana saldrá ya con su 4xx correcto, sin tocar código.

## Por dónde se usa (puntos de entrada)

Esto no es un endpoint: es **la única puerta por la que sale todo error de la
API**, así que lo tocas desde cualquier ruta.

- [`error-handler.ts:143`](../../src/plugins/error-handler.ts#L143) —
  `app.setErrorHandler(handleError)`: el enganche. Es el **único** de todo `src/`.
- [`error-handler.ts:107`](../../src/plugins/error-handler.ts#L107) —
  `handleError`, la función que decide. Se exporta aparte para poder probarla sin
  levantar el servidor.
- [`api-contract.md:64`](../../docs/api-contract.md#L64) — la nota **que lee el
  frontend**: qué códigos HTTP puede devolver la API, qué significa cada rango
  (`4xx` = corrige la petición; `5xx` = el backend falló, reintenta) y cómo se
  decide.
- Para verlo con tus manos, con el servidor arrancado: un `POST` a
  `/api/import/local` con cabecera `Content-Type: application/json` y **sin
  cuerpo** → **400**, no 500. Es la petición exacta que destapó todo.

## Dónde está el código (para revisión directa)

Toda la feature vive en **un archivo de código y su test**, más una página de
documentación. Ni un archivo nuevo, ni una ruta tocada, ni un servicio tocado.

### La decisión: de quién es la culpa (`src/plugins/error-handler.ts`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El orden completo: `AppError` → validación de esquema → **culpa de quien llama (nuevo)** → 500 genérico | `handleError` | [error-handler.ts:107](../../src/plugins/error-handler.ts#L107) |
| Las dos condiciones para creer que la culpa es del cliente | `isClientFault` | `src/plugins/error-handler.ts` |
| El prefijo que marca «esto lo levantó Fastify» | `FASTIFY_CODE_PREFIX` | `src/plugins/error-handler.ts` |
| El 500 de siempre: cuerpo genérico y `request.log.error(error)` con el error entero | (última rama de `handleError`) | [error-handler.ts:138](../../src/plugins/error-handler.ts#L138) |

### Qué se le cuenta a quien llama (mismo archivo)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El `code` del cuerpo, derivado del estado HTTP (400 → `BAD_REQUEST`, 413 → `PAYLOAD_TOO_LARGE`, 415 → `UNSUPPORTED_MEDIA_TYPE`) | `statusCodeName` | `src/plugins/error-handler.ts` |
| La frase que Fastify tiene declarada para un código, con los huecos **sin rellenar** | `fastifyDeclaredMessage` | `src/plugins/error-handler.ts` |
| La regla anti-fuga: el mensaje viaja solo si es exactamente esa frase | `safeClientMessage` | `src/plugins/error-handler.ts` |
| La forma del cuerpo de error, la de siempre: `{ statusCode, code, message }` | `errorBody` | `src/plugins/error-handler.ts` |
| La ruta que no existe, sin cambios | `setNotFoundHandler` | `src/plugins/error-handler.ts` |

### Tests (`src/plugins/error-handler.test.ts`) — 21 pruebas, +16 nuevas

| Qué cubre | Código |
| --- | --- |
| Los cuatro casos nuevos, **por HTTP** (petición real contra la app con `app.inject`) | [error-handler.test.ts:246](../../src/plugins/error-handler.test.ts#L246) y siguientes |
| Los mismos cuatro, **unitarios**, comprobando `statusCode`, `code` y `message` exactos | `answers 400 BAD_REQUEST…`, `answers 415…`, `answers 413…` |
| Que un mensaje con un valor **nuestro** dentro no sale (ni aparece el nombre del método) | `does not propagate a Fastify message that got a value interpolated into it` |
| Que tampoco sale el valor que puso el propio cliente | `does not propagate the caller-supplied value of an interpolated message either` |
| Que un 5xx, un error sin estado, o un 4xx que no es de Fastify siguen siendo 500 | `keeps a Fastify error with a 5xx status…`, `…with no status at all…`, `does not trust a 4xx status carried by an error that is not Fastify's` |
| Que el 500 no filtra y el log **sí** guarda el error entero | `keeps the 500 body free of the internal detail while the log keeps it whole` |
| No-regresión: `AppError` y `400 VALIDATION_ERROR` (esta también por HTTP, contra `POST /api/accounts`) | `maps an AppError…`, `still answers 400 VALIDATION_ERROR when the schema rejects the body` |
| Camino feliz de una ruta, intacto | `leaves the happy path of a route untouched` |

### Documentación

| Qué | Código |
| --- | --- |
| Los tres códigos nuevos en la tabla de códigos estables | [api-contract.md:50](../../docs/api-contract.md#L50) |
| La nota de errores de quien llama: rangos, lista de códigos HTTP y cómo se decide | [api-contract.md:64](../../docs/api-contract.md#L64) |

## Cierre del círculo con tu `intent`

| Lo que dijiste (`como_se_que_esta_bien`) | ¿Se cumple? | Dónde se verifica |
| --- | --- | --- |
| Cuerpo vacío + cabecera JSON → error que dice que la petición está mal | **Sí**, `400 BAD_REQUEST` | `responds 400, not 500, to an empty body with a JSON content-type` (por HTTP) |
| Lo mismo con JSON mal escrito, content-type que no toca y cuerpo demasiado grande | **Sí**: 400, 415 y 413 | `responds 400… to a malformed JSON body`, `responds 415…`, `responds 413…` |
| Los que ya funcionaban bien siguen igual (los nuestros y los de esquema) | **Sí** | `maps an AppError to its own statusCode, code and message` y `still answers 400 VALIDATION_ERROR when the schema rejects the body` |
| Si el fallo **sí** es del servidor, sigue saliendo como tal y sin contar nada de dentro | **Sí**, y el log lo sigue guardando entero | `keeps the 500 body free of the internal detail while the log keeps it whole` y `responds 500 with the generic body and without internal details` |
| Ninguna ruta cambia cuando todo va bien | **Sí** | `leaves the happy path of a route untouched` + las 970 de la suite |

De lo que **no querías**: no hay lista de códigos de Fastify escrita a mano (dos
condiciones que se cumplen solas); el mensaje no cuenta rutas, trazas ni tablas
(comprobado uno a uno, y lo que lleva algo pegado se degrada al texto estándar);
no se tocó el comportamiento de los errores nuestros ni el de validación; y no
cambió ninguna ruta ni ningún contrato de respuesta correcta.

## Un apunte para más adelante (no es de esta feature)

Hay una puerta parecida **un nivel más abajo**: `describeError`
([`import.service.ts:762`](../../src/modules/import/import.service.ts#L762)) pone
el mensaje original de cualquier error dentro de `files[].error` de un `200` de
importación. Ahí puede colarse una ruta de disco o un mensaje de Prisma. Se ha
dejado fuera a propósito —no es un código HTTP y ahí no llega ningún error de
quien llama— y está anotado en el informe del implementer. Antes de tocarlo hay
que decidir qué pierdes tú si ese mensaje deja de verse: hoy es tu principal
pista cuando falla la importación de un fichero.

## Verificación

`./init.sh` **verde** el 2026-08-30: typecheck sin errores, **51 archivos de test,
970 pruebas** (antes 954, +16). `src/no-real-data.test.ts` 48/48: ni un dato tuyo
en tests ni en fixtures (ADR-017). `pnpm run lint` limpio y los archivos de la
feature pasan `prettier --check`.
