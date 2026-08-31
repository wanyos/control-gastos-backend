# F35 `client-errors-are-not-500` — implementación

> Que un error de quien llama deje de reportarse como avería del servidor.
> Feature sin spec (`sdd: false`): se trabajó contra el `intent` y el
> `acceptance` de `feature_list.json`.

## Archivos modificados / creados

| Archivo | Qué cambia |
| ------- | ---------- |
| [`src/plugins/error-handler.ts`](../../src/plugins/error-handler.ts) | Rama nueva entre la de validación y el 500 final: un `FastifyError` que ya se clasificó como 4xx conserva su código de estado. Tres funciones auxiliares (`isClientFault`, `statusCodeName`, `safeClientMessage`). |
| [`src/plugins/error-handler.test.ts`](../../src/plugins/error-handler.test.ts) | +16 tests (8 unitarios de la rama nueva, 6 de integración por HTTP, 1 de no-regresión de esquema por HTTP, 1 de no-fuga en el 500). |
| [`docs/api-contract.md`](../../docs/api-contract.md) | Tres códigos nuevos en la tabla (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`) y una nota con **los códigos HTTP que puede devolver la API**, qué significa cada rango para el frontend y cómo se decide. |

Ninguna ruta, ningún esquema y ningún servicio se tocó: el cambio vive entero en
el manejador central.

## Las cuatro decisiones delegadas

### 1. Cómo se distingue el error del cliente sin lista escrita a mano

**Dos condiciones a la vez** (`isClientFault`, `src/plugins/error-handler.ts:34`):

1. el error trae un `code` de tipo string que empieza por **`FST_ERR_`** — lo
   levantó Fastify, no una librería cualquiera; **y**
2. su propio `statusCode` está en **400–499** — Fastify ya lo clasificó.

Se respeta entonces ese `statusCode` tal cual. No hay lista de códigos que
ampliar: cualquier `FST_ERR_*` de 4xx que Fastify añada en el futuro sale bien
solo.

**Por qué las dos y no solo el rango.** Confiar en cualquier `statusCode` en 4xx
abre la puerta a errores de terceros que también decoran sus excepciones con un
estado (un cliente HTTP hablando con Drive devuelve un `403` cuyo mensaje no es
nuestro para publicar). El prefijo acota la confianza a los errores del propio
servidor HTTP, que es quien de verdad ha visto la petición. Hay test de ese caso.

**Qué pasa con lo demás — la regla se equivoca siempre hacia el mismo lado:**

| El error trae… | Respuesta |
| -------------- | --------- |
| `statusCode` **5xx** (con `FST_ERR_` o sin él) | `500 INTERNAL_SERVER_ERROR` genérico, `request.log.error(error)` |
| **ningún** `statusCode` | `500 INTERNAL_SERVER_ERROR` genérico, `request.log.error(error)` |
| `statusCode` 4xx **sin** `FST_ERR_` | `500 INTERNAL_SERVER_ERROR` genérico, `request.log.error(error)` |

Es decir: **un error que no dice ser culpa de quien llama se trata como nuestro.**
Equivocarse por ese lado cuesta un 500 de más; al revés costaría contarle a un
desconocido algo de dentro, y además decirle que no reintente.

Añadido: un error de cliente se registra con `log.warn` y no con `log.error`, así
que los `error` del log vuelven a significar «mira esto», que es para lo que
sirven.

### 2. Qué `code` y qué `message` recibe cada caso

**`code` derivado del estado HTTP**, no reutilizado de Fastify (`statusCodeName`,
vía `http.STATUS_CODES`): `400 → BAD_REQUEST`, `413 → PAYLOAD_TOO_LARGE`,
`415 → UNSUPPORTED_MEDIA_TYPE`.

Por qué **no** se propaga `FST_ERR_CTP_EMPTY_JSON_BODY` como `code`:

- `code` es contrato público y es lo que mira el frontend para decidir.
  Reutilizar el vocabulario interno de Fastify suelda nuestro contrato a un
  detalle de implementación: el día que ese código se renombre —o que se cambie
  de framework— rompe al frontend sin que nadie haya tocado la API.
- Es una lista **abierta** (94 códigos hoy, 13 de ellos 4xx) que el frontend no
  puede enumerar ni documentar. El derivado del estado es un vocabulario
  **cerrado**, ya escrito en `api-contract.md`, y se mantiene solo.
- No se pierde nada: el `FST_ERR_*` original viaja entero al log, que es donde
  hace falta para depurar.

**`message`:** la frase de Fastify —que es justo lo que el humano quería leer
cuando manda la petición mal («Body cannot be empty when content-type is set to
'application/json'»)— pero solo bajo la condición de la decisión 3.

### 3. Fuga de detalle interno — comprobado uno a uno, no supuesto

Se enumeraron **los 13 errores 4xx declarados por `fastify@5.12.1`**
(`lib/errors.js`) y se miró su plantilla de mensaje una por una:

| HTTP | Código | Plantilla | ¿Filtra? |
| ---- | ------ | --------- | -------- |
| 404 | `FST_ERR_NOT_FOUND` | `Not Found` | no (fija) |
| 400 | `FST_ERR_VALIDATION` | `%s` | no llega aquí: lo atrapa antes la rama de validación |
| 413 | `FST_ERR_CTP_BODY_TOO_LARGE` | `Request body is too large` | no (fija) |
| 415 | `FST_ERR_CTP_INVALID_MEDIA_TYPE` | `Unsupported Media Type` | no (fija) |
| 400 | `FST_ERR_CTP_INVALID_CONTENT_LENGTH` | `Request body size did not match Content-Length` | no (fija) |
| 400 | `FST_ERR_CTP_EMPTY_JSON_BODY` | `Body cannot be empty when content-type is set to 'application/json'` | no (fija) |
| 400 | `FST_ERR_CTP_INVALID_JSON_BODY` | `Body is not valid JSON but content-type is set to 'application/json'` | no (fija; **comprobado además con una petición real**: no incluye el detalle del parser de JSON) |
| 400 | `FST_ERR_CTP_INSTANCE_ALREADY_STARTED` | `Cannot call "%s" when fastify instance is already started!` | **SÍ** — el `%s` es un método de **nuestro** código |
| 400 | `FST_ERR_BAD_URL` | `'%s' is not a valid url component` | el `%s` es del cliente |
| 414 | `FST_ERR_MAX_PARAM_LENGTH` | `'%s' is exceeding the max param length` | el `%s` es del cliente |
| 400 | `FST_ERR_INVALID_URL` | `URL must be a string. Received '%s'` | **SÍ** — el `%s` es un valor que pasó nuestro código |
| 400 | `FST_ERR_ROUTE_MISSING_CONTENT_TYPE` | `Method '%s' must provide a 'Content-Type' header.` | el `%s` es del cliente |
| 400 | `FST_ERR_ROUTE_MISSING_CONTENT` | `Method '%s' must provide a request body.` | el `%s` es del cliente |

Hay dos que filtran. **La regla no es una lista de excepciones —eso sería
fail-open—** sino una condición que se cumple sola (`safeClientMessage`):

> el mensaje viaja **solo si es EXACTAMENTE la frase que Fastify declara para ese
> código**, es decir, solo si no se interpoló nada en él.

Se comprueba contra `errorCodes`, que exporta el propio Fastify: `new
errorCodes[code]().message` devuelve la plantilla con los `%s` **sin resolver**,
así que un mensaje interpolado nunca coincide. Si no coincide —o si el código no
es de Fastify, el de un plugin por ejemplo— el cuerpo recibe el texto estándar
del estado (`Bad Request`, `Payload Too Large`). **Fail-closed:** un mensaje
nuevo que Fastify añada con interpolación no se publica aunque nadie actualice
nada aquí.

Los cuatro casos que motivaron la feature son plantillas fijas, así que los
cuatro conservan su frase útil. En todos los casos el error original va **entero
al log**.

### 4. Otros sitios con el mismo problema

**No hay otro sitio HTTP.** Se buscaron en `src/` los tres patrones posibles
(`setErrorHandler`, `onError`, y `reply.status(...)` / `reply.code(...)`
manuales): `setErrorHandler` hay **uno solo**, el de este plugin; los
`reply.status()` directos de las rutas son los `201` de creación y los `503`
deliberados de `health.routes.ts` (cuerpo propio de readiness). Todo lo demás
lanza `AppError` con su estado correcto y pasa por aquí.

**Hay un sitio análogo un nivel por debajo, y NO se ha tocado (fuera de scope):**
`describeError` en `src/modules/import/import.service.ts:762` estampa
`INTERNAL_SERVER_ERROR` a **todo** lo que no sea un `AppError`, dentro de
`files[].error` de un 200. No es un estado HTTP y ningún error de quien llama
llega ahí (los ficheros vienen de Drive o del disco, no de la petición), así que
no entra en esta feature. Ver sugerencias.

## Trazabilidad criterio → test

Todos en `src/plugins/error-handler.test.ts`.

| Criterio de `acceptance` | Test |
| ------------------------ | ---- |
| Cuerpo vacío + content-type JSON → 400 (el caso exacto que lo destapó) | integración `responds 400, not 500, to an empty body with a JSON content-type` + unitario `answers 400 BAD_REQUEST to an empty body with a JSON content-type` |
| JSON mal formado → 400 | integración `responds 400, not 500, to a malformed JSON body` + unitario `answers 400 BAD_REQUEST to a malformed JSON body` |
| Content-type no soportado → 415 | integración `responds 415, not 500, to a content-type it cannot parse` + unitario `answers 415 UNSUPPORTED_MEDIA_TYPE to a content-type nobody parses` |
| Cuerpo demasiado grande → 413 | integración `responds 413, not 500, to a body that exceeds the limit` + unitario `answers 413 PAYLOAD_TOO_LARGE to a body that is too big` |
| NO REGRESIÓN: los `AppError` nuestros conservan `statusCode` y `code` | `maps an AppError to its own statusCode, code and message` |
| NO REGRESIÓN: validación de esquema sigue en `400 VALIDATION_ERROR` | `maps a Fastify/AJV validation error to 400 VALIDATION_ERROR` + integración `still answers 400 VALIDATION_ERROR when the schema rejects the body` (por HTTP, contra `POST /api/accounts`) |
| NO REGRESIÓN: un error inesperado sigue siendo 500 genérico, sin filtrar, y se registra entero | `logs the original non-AppError via request.log.error and replies 500 generic`, `keeps the 500 body free of the internal detail while the log keeps it whole` e integración `responds 500 with the generic body and without internal details` |
| Decisión 1: estado 5xx / sin estado / 4xx que no es de Fastify | `keeps a Fastify error with a 5xx status as a generic 500`, `keeps a Fastify error with no status at all as a generic 500`, `does not trust a 4xx status carried by an error that is not Fastify's` |
| Decisión 2: `code` derivado del estado | los cuatro unitarios de arriba comprueban el `code` exacto (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`) |
| Decisión 3: un mensaje interpolado no se propaga | `does not propagate a Fastify message that got a value interpolated into it` (valor **interno**) y `does not propagate the caller-supplied value of an interpolated message either` |
| Ninguna ruta cambia en el camino feliz | `leaves the happy path of a route untouched` + las 970 de la suite, que ejercen todas las rutas |
| ADR-017, sin datos reales | `pnpm exec vitest run src/no-real-data.test.ts` → 48/48, sin offenders nuevos |

Casos de error cubiertos con test: **12** (4 nuevos del camino nuevo, cada uno por
partida doble —unitario y por HTTP—, 3 de clasificación defensiva, 2 de no-fuga
del mensaje y 3 de no-regresión).

## Último `./init.sh`

**Verde**, 2026-08-30:

```
[OK]    Type check OK (tsc sin errores)
 Test Files  51 passed (51)
      Tests  970 passed (970)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

954 → **970** (+16). Y `pnpm exec vitest run src/no-real-data.test.ts`: 48/48.

## Sugerencias fuera de scope (NO aplicadas)

1. **`describeError` de `import.service.ts` propaga `error.message` en crudo.**
   Cualquier error que no sea `AppError` acaba en `files[].error.message` con su
   texto original —que puede ser una ruta de disco o un mensaje de Prisma— dentro
   de una respuesta 200. Es el mismo riesgo de fuga que esta feature cierra en el
   manejador central, pero por otra puerta. Merece su propia feature: antes hay
   que decidir qué pierde el humano si ese mensaje deja de verse, porque hoy es
   su principal pista cuando falla la importación de un fichero.
2. **`scripts/bankinter-pdf-a-xlsx.mjs` no pasa `prettier`.** Entró así en el
   commit `1121868` y es el único aviso que queda en `pnpm run format:check`.
   Esta feature no lo toca. Se arregla con un `pnpm run format` de una línea,
   pero es de otra sesión.
3. **`FST_ERR_VALIDATION` se reconoce hoy por su array `validation`, no por su
   código.** Funciona y no se ha tocado (no-regresión), pero si algún día Fastify
   dejara de poblar ese array, el caso pasaría por la rama nueva y saldría como
   `400 BAD_REQUEST` en vez de `400 VALIDATION_ERROR`: el estado seguiría bien y
   el `code` cambiaría. El test por HTTP `still answers 400 VALIDATION_ERROR…` ya
   lo vigila, así que se vería en rojo.

---

## Addendum — respuesta al primer veredicto (2026-08-30)

El reviewer rechazó la feature con **dos puntos, ninguno de fondo**
([veredicto](../reviews/client-errors-are-not-500.md)). Los dos, arreglados:

### 1. Formato (regresión introducida por la feature)

`src/plugins/error-handler.test.ts:97` (102 columnas) y
`src/plugins/error-handler.ts:132-136` rompían el límite de 100 de Prettier
(`docs/conventions.md:48-53`). Corregido con `prettier --write` sobre los dos
archivos de la feature, y **repasado después**, que era lo que pedía el veredicto:

- En `error-handler.ts` el corte automático quedó **mejor** que el mío: Prettier
  recompuso el `.status().send()` de la rama nueva en una sola línea de 99
  columnas, en vez de las cinco que yo había partido a mano.
- En el test, en cambio, el corte automático dejó un destructuring repartido en
  tres líneas (`as [
  { statusCode… },
]`), que era menos legible que antes.
  Se resolvió **en la causa y no en el corte**: se extrajo la forma del cuerpo a
  una interfaz `ErrorBody` en la cabecera del archivo, que además ya la usaban
  dos `describe` distintos con la forma escrita a mano cada uno.

`pnpm run format:check` deja hoy **un solo aviso, y no es de esta feature**:
`scripts/bankinter-pdf-a-xlsx.mjs`, que entró en el commit `1121868` y que esta
sesión no ha tocado (`git diff HEAD -- scripts/` vacío). Comprobado que el
contenido **tal cual está en `HEAD`** ya falla Prettier, así que no es una
regresión de la F35 y no se arregla aquí (fuera de scope, ver sugerencias). Los
archivos de la feature pasan limpios.

### 2. Versión mal citada — era `5.12.1`, no `5.11.3`

Corregido en los dos sitios: `src/plugins/error-handler.ts:83` y la sección de la
decisión 3 de este informe. El error vino de enumerar los códigos leyendo la
carpeta del store de pnpm por su nombre (`node_modules/.pnpm/fastify@5.11.3/`),
donde conviven **dos** versiones; la que resuelve `node_modules/fastify` —la que
de verdad corre— es la `5.12.1` que declara `package.json:39`.

**La tabla se ha vuelto a enumerar contra la versión instalada**, esta vez
leyendo `node_modules/fastify/lib/errors.js` (la resuelta, no una del store):
salen **13 errores 4xx**, los mismos 13, con el mismo estado y la misma
plantilla. La tabla de la decisión 3 vale tal cual para `5.12.1`.

> Lección para la próxima: para enumerar algo de una dependencia se lee **la ruta
> resuelta**, nunca una carpeta del store elegida por su nombre. Una versión
> equivocada en un informe es peor que ninguna, porque quien lo audite dentro de
> un año creerá verificada contra otra cosa una tabla que sí es correcta.

### Sobre el hallazgo extra del reviewer (`FST_ERR_CTP_INVALID_MEDIA_TYPE`)

El veredicto apunta que ese error llega en Fastify real **con el tipo
interpolado**, de modo que la comparación exacta también lo degradaría. Lo he ido
a comprobar y en `fastify@5.12.1` **no es así**: los dos únicos sitios que lo
lanzan lo construyen **sin argumentos** (`lib/content-type-parser.js:201` y
`lib/handle-request.js:84`), y una petición real con
`Content-Type: application/x-www-form-urlencoded` llega con el mensaje
`Unsupported Media Type`, que es su plantilla. Es decir, ese mensaje **sí** se
propaga.

Da igual para el resultado, y por eso conviene dejarlo escrito: el texto de
respaldo para un 415 es `STATUS_CODES[415]`, que es **exactamente la misma
cadena**. Propagado o degradado, el cliente recibe `Unsupported Media Type`, y el
test `responds 415, not 500, to a content-type it cannot parse` pasa en los dos
mundos. Lo que sí sostengo del hallazgo es la lectura de fondo: el mecanismo
**protege más de lo que promete** y una futura versión de Fastify que empiece a
interpolar ahí no rompería nada ni filtraría nada.

### Verificación tras el arreglo

```
pnpm run format:check   → limpio en los archivos de la feature; 1 aviso ajeno
                          (scripts/bankinter-pdf-a-xlsx.mjs, ya roto en HEAD)
./init.sh               → [OK] Entorno listo — 51 archivos, 970/970 tests
pnpm exec vitest run src/no-real-data.test.ts → 48/48
```

Los 970 siguen verdes: ninguno de los dos arreglos toca comportamiento.
