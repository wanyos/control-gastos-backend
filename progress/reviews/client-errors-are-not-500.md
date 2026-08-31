# Review — feature 35 `client-errors-are-not-500`

Fecha: 2026-08-30 (segunda pasada, tras las correcciones)
Informe revisado: `progress/implementations/client-errors-are-not-500.md`
Feature sin spec (`"sdd": false`): validada contra `intent` + `acceptance` de
`feature_list.json`.

## Review

**Veredicto:** APPROVED

Comprobado: `acceptance` ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C8. Sin hallazgos.
Resumen de cierre: `progress/summaries/client-errors-are-not-500.md`.

## La discrepancia sobre `FST_ERR_CTP_INVALID_MEDIA_TYPE`: **razón para el implementer**

**Yo estaba equivocado y él tiene razón.** Lo dejo escrito con el porqué, porque
el error de método es lo que importa:

- Mi «hallazgo extra» salía de que **fui yo quien pasó el argumento** al
  construir el error (`new FST_ERR_CTP_INVALID_MEDIA_TYPE('text/foo')`). Ahí
  `@fastify/error` pega el valor sobrante al final y el mensaje deja de ser la
  plantilla. Estaba midiendo mi propia llamada, no la de Fastify.
- En el árbol real, los **dos únicos** sitios que lo lanzan lo construyen **sin
  argumentos**: `node_modules/fastify/lib/content-type-parser.js:201` y
  `node_modules/fastify/lib/handle-request.js:84`, los dos
  `reply.send(new FST_ERR_CTP_INVALID_MEDIA_TYPE())`. Su plantilla
  (`lib/errors.js:111-115`) es la cadena fija `Unsupported Media Type`.
- Conclusión: en una petición real el mensaje **llega intacto y sí se propaga**.
  El mecanismo **no** cubre ahí un caso extra. El comportamiento observable es el
  mismo —el texto de respaldo del 415 es esa misma cadena—, pero **la frase
  «protege más de lo que promete» hay que retirarla**: el proyecto no debe creer
  que tiene una defensa que en ese caso no se activa.
- Para el humano: si se le contó en mi versión, **corregirlo**. Lo que sí sigue
  en pie, y es lo que de verdad sostiene la decisión 3, es que el mecanismo
  **frena los dos casos que filtran valor interno** (verificado abajo).

## Cierre de la decisión 3 — reenumerado independiente, coincide

Reenumerado por mi parte **contra la ruta resuelta**
(`node_modules/fastify/lib/errors.js`, `package.json` → **5.12.1**), no contra el
store de pnpm: **94 códigos `FST_ERR_*`, exactamente 13 de ellos 4xx**, con el
mismo estado y la misma plantilla —los `%s` incluidos— que la tabla del informe y
que su reenumerado. **Coincidimos los tres**. La tabla de la decisión 3 queda
auditable y reproducible.

Y el mecanismo sigue atajando lo que tiene que atajar, comprobado ejecutando los
constructores reales: `FST_ERR_CTP_INSTANCE_ALREADY_STARTED('addContentTypeParser')`
→ cuerpo `Bad Request` (el nombre del método no sale) y
`FST_ERR_INVALID_URL('/home/roybe/secret/path')` → cuerpo `Bad Request` (la ruta
no sale). Eso es lo mejor de la feature y se mantiene.

## Los dos puntos de la primera pasada, verificados

1. **Formato — corregido.** `pnpm exec prettier --check "src/**/*.ts"` → *All
   matched files use Prettier code style*. Y la extracción de `ErrorBody`
   (`src/plugins/error-handler.test.ts:10`, usada en las líneas 75 y 104) **no
   cambia lo que los tests comprueban**: comparado el conjunto de aserciones
   antes y después, son **las mismas 21 pruebas, las mismas llamadas a `expect`,
   en el mismo orden y con los mismos valores**. Lo único que cambia es el tipo
   con el que se lee `reply.send.mock.calls[0]`, que antes se escribía a mano en
   dos `describe` y en uno de ellos era más estrecho (`{ message: string }`).
   Ensancharlo no relaja ninguna aserción.
2. **Versión — corregida** en `src/plugins/error-handler.ts:83` y en el informe
   (`5.12.1`), y bien atacada la causa: enumerar por el nombre de la carpeta del
   store de pnpm no vale cuando ahí conviven dos versiones.

## El aviso de `scripts/bankinter-pdf-a-xlsx.mjs`: confirmado ajeno

`git diff HEAD -- scripts/` está **vacío**: el archivo entró así en el commit
`1121868` y esta sesión no lo ha tocado. **No cuenta contra la F35** y ha hecho
bien en no arreglarlo. Refuerza el cabo suelto ya anotado: `./init.sh` no ejecuta
`format:check`, y por eso hay código en `HEAD` que incumple una regla viva.

## Comprobado sin hallazgos

Los 11 criterios de `acceptance` ↔ tests (21 pruebas en
`src/plugins/error-handler.test.ts`, cada caso nuevo por partida doble —unitario
y por HTTP—); riesgo de ensanchar de más: `isClientFault`
(`src/plugins/error-handler.ts:34`) exige **las dos** condiciones y todo lo demás
cae al 500 genérico con `request.log.error(error)`
(`src/plugins/error-handler.ts:138`), con tests para 5xx, sin estado y 4xx que no
es de Fastify; riesgo de fuga: el 500 nunca lleva el `message` del error y el log
recibe el objeto entero; no-regresión de `AppError` y de `VALIDATION_ERROR` (esta
también por HTTP contra `POST /api/accounts`); camino feliz intacto; decisión 2
razonable (`code` como vocabulario cerrado derivado del estado, `FST_ERR_*` al
log); decisión 4 correcta —un solo `setErrorHandler` en `src/`
(`src/plugins/error-handler.ts:143`) y `describeError`
(`src/modules/import/import.service.ts:762`) bien dejado fuera de alcance, con su
anotación—; `docs/api-contract.md` dice exactamente lo que hace el código;
arquitectura (ADR-005, el cambio vive entero en el plugin central) y convenciones
(inglés, comillas simples, sin `;`, 100 columnas, sin `console.log`); `pnpm run
lint` limpio; ADR-017 → `src/no-real-data.test.ts` 48/48 sin offenders nuevos;
`./init.sh` **verde** (51 archivos, **970 tests**, typecheck sin errores);
CHECKPOINTS C1-C8.

> Nota de método, para que quede en acta: al comprobar en la primera pasada si el
> formato estaba limpio en `HEAD`, hice un `git stash --include-untracked` y su
> `pop`. Eso **normalizó a LF los finales de línea** de algunos archivos del árbol
> de trabajo (el repositorio ya los guarda en LF, así que `git diff` no ve ningún
> cambio de contenido). No he editado código en ningún momento.
