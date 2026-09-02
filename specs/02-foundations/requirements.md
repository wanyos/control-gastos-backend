# Requirements — Feature 2: fundamentos

> Derivados del bloque `intent` de la feature 2 en `feature_list.json`
> (fuente de verdad del QUÉ) y de las decisiones ya tomadas en
> `docs/architecture.md` (Principios 1-5, ADR-004) y `docs/conventions.md`
> (§Manejo de errores). Notación EARS estricta (ver `docs/specs.md`).
>
> Nota de alcance: el `intent` dice "el cliente HTTP o la validación de datos
> según el proyecto". Este proyecto es un backend: aplica la **validación de
> datos** (ya cubierta por ADR-003 para requests; esta feature añade la de
> configuración de entorno). No existe cliente HTTP saliente que construir.

## Configuración por entorno

### R1
CUANDO la app arranca con todas las variables de entorno obligatorias
presentes y válidas, el sistema DEBE construir una configuración tipada
`AppConfig` con `databaseUrl` (de `DATABASE_URL`), `port` (de `PORT`,
def. `3000`), `host` (de `HOST`, def. `'0.0.0.0'`) y `logLevel`
(de `LOG_LEVEL`, def. `'info'`).

*Verificación:* test unitario de `loadConfig()` con un objeto env sintético
completo y otro solo con `DATABASE_URL` (defaults aplicados).

### R2
SI `DATABASE_URL` falta o está vacía ENTONCES `loadConfig()` DEBE lanzar un
error cuyo mensaje nombre `DATABASE_URL` como variable ausente.

*Verificación:* test unitario `loadConfig({})` → lanza con `/DATABASE_URL/`
en el mensaje. (Como `loadConfig()` se ejecuta en el arranque —
`src/server.ts` y `buildApp()` — lanzar aquí equivale a "falla al arrancar
con un mensaje claro".)

### R3
SI una variable opcional está presente con un valor inválido (`PORT` no
entero o fuera de `[1, 65535]`; `LOG_LEVEL` fuera de
`{fatal, error, warn, info, debug, trace, silent}`) ENTONCES `loadConfig()`
DEBE lanzar un error cuyo mensaje nombre la variable inválida y el motivo.

*Verificación:* tests unitarios con `PORT: 'abc'`, `PORT: '0'` y
`LOG_LEVEL: 'verbose'`.

### R4
El sistema NO DEBE contener lecturas de `process.env` en `src/` fuera de
`src/config/env.ts` (excepciones: el import de efecto `dotenv/config` en
`src/server.ts`, que no lee variables, y `src/generated/`).

*Verificación:* test guardián (`src/architecture.test.ts`) que escanea los
fuentes de `src/**/*.ts` (excluyendo `*.test.ts` y `src/generated/`) y
falla si encuentra `process.env` fuera de `src/config/env.ts`.

## Manejo de errores centralizado

### R5
El sistema DEBE definir en `src/errors/app-error.ts` una clase base
`AppError` (extiende `Error`, con `code: string` y `statusCode: number`) y
las subclases `NotFoundError` (`'NOT_FOUND'`, 404) y `ValidationError`
(`'VALIDATION_ERROR'`, 400).

*Verificación:* test unitario que instancia las tres clases y comprueba
`code`, `statusCode`, `message` e `instanceof AppError`.

### R6
CUANDO un handler o servicio lanza un `AppError` durante una request, el
sistema DEBE responder con status `error.statusCode` y body
`{ statusCode, code, message }` tomados del error.

*Verificación:* test de integración `GET /api/expenses/99999` → 404 con
body `{ statusCode: 404, code: 'NOT_FOUND', message: 'Expense not found' }`.

### R7
SI el body o los params de una request incumplen el JSON Schema de su ruta
ENTONCES el sistema DEBE responder 400 con
`{ statusCode: 400, code: 'VALIDATION_ERROR', message: <detalle de AJV> }`.

*Verificación:* tests de integración `POST /api/expenses` sin `amount` y
`GET /api/expenses/abc` → 400 con `code: 'VALIDATION_ERROR'`.

### R8
SI durante una request se lanza un error que no es `AppError` ENTONCES el
sistema DEBE responder 500 con exactamente
`{ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }`,
sin exponer detalles internos del error original.

*Verificación:* test de integración que registra una ruta de prueba que
lanza `new Error('secret detail')` → 500 con el body genérico y sin la
cadena `secret detail`.

### R9
CUANDO el error handler procesa un error que no es `AppError`, el sistema
DEBE registrar el error original mediante `request.log.error` antes de
responder.

*Verificación:* test unitario del handler exportado (`handleError`) con
`request`/`reply` falsos (spies): se llamó `request.log.error` con el error
original.

### R10
SI la ruta solicitada no existe ENTONCES el sistema DEBE responder 404 con
`{ statusCode: 404, code: 'NOT_FOUND', message: <descripción de la ruta> }`.

*Verificación:* test de integración `GET /does-not-exist` → 404 con
`code: 'NOT_FOUND'`.

## Estructura por features (módulos)

### R11
El sistema DEBE organizar `src/` según el árbol objetivo de
`docs/architecture.md` (ADR-004): `config/env.ts`, `errors/app-error.ts`,
`plugins/error-handler.ts`, `modules/expenses/{expenses.routes.ts,
expenses.service.ts, expenses.schema.ts, expenses.types.ts,
expenses.test.ts}` y `modules/health/{health.routes.ts, health.test.ts}`.

*Verificación:* test guardián (`src/architecture.test.ts`) que comprueba la
existencia de esos archivos; además la suite corre desde las nuevas rutas.

### R12
El directorio `src/routes/` NO DEBE existir al cierre de la feature.

*Verificación:* test guardián que falla si `src/routes/` existe.

### R13
`modules/expenses/expenses.routes.ts` NO DEBE contener acceso a datos
(ninguna referencia a `prisma`); todo acceso a datos del recurso vive en
`expenses.service.ts`.

*Verificación:* test guardián que escanea `expenses.routes.ts` y falla si
contiene la cadena `prisma`.

## Regresión y verificación

### R14
CUANDO se ejecuta `npm test`, los 8 tests de integración existentes
(reubicados de `src/routes/*.test.ts` a `src/modules/**`) DEBEN pasar sin
modificar sus asserts (solo cambian las rutas de import).

*Verificación:* `npm test` en verde; diff de los archivos de test movidos
limitado a imports.

### R15
CUANDO se ejecuta `bash ./init.sh`, el proceso DEBE terminar con
`[OK] Entorno listo` (typecheck estricto + suite completa al 100%).

*Verificación:* ejecución real de `bash ./init.sh`.

## Documentación (contrato y arquitectura)

### R16
El sistema DEBE actualizar `docs/api-contract.md` en esta misma feature con
el formato de error `{ statusCode, code, message }` y la tabla de códigos
estables (`VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`),
incluyendo una nota visible del cambio de forma del body de error respecto
al formato anterior `{ message }` (no breaking: el contrato vigente indica
que el frontend discrimina por código HTTP, no por el body; el cambio ya
estaba anunciado en el propio contrato).

*Verificación:* manual — checklist del reviewer contra las respuestas
reales de los tests de integración. (Requirement de proceso sin superficie
ejecutable propia; excepción consciente a la regla "un test por R".)

### R17
El sistema DEBE actualizar `docs/architecture.md` al cierre de la feature:
eliminar las marcas `(nueva)` del árbol que pasen a existir y registrar
como ADR las dos decisiones delegadas (ADR-005 patrón de manejo de errores;
ADR-006 validación de config de entorno a mano).

*Verificación:* manual — checklist del reviewer (mismo carácter de proceso
que R16).

## Tooling de estilo (condicional — decisión en la puerta de aprobación)

### R18
DONDE la aprobación humana confirme incluir el tooling de lint/format que
`docs/conventions.md` §Estilo del lenguaje asigna a esta feature ("se
añaden en la feature de fundamentos"), el repositorio DEBE pasar
`npx eslint .` y `npx prettier --check .` sin errores con las reglas ya
fijadas (comillas simples, sin punto y coma, 2 espacios, 100 columnas).

*Verificación:* ejecución de ambos comandos en verde. Si el humano lo
excluye en la aprobación, la task asociada se marca N/A con justificación.

---

## Procedencia

- **R1 — (humano)** Sale de "la configuración por entorno está validada" del
  `intent` y del acceptance "configuración de variables de entorno tipada y
  validada al arrancar". Variables y defaults son los ya documentados en
  `docs/stack.md` §Variables de entorno.
- **R2 — (humano)** Sale literalmente de "si falta algo obligatorio, falla al
  arrancar con un mensaje claro".
- **R3 — (añadido)** El humano habló de variables que *faltan*; un valor
  *presente pero inválido* (p. ej. `PORT=abc`) no está contemplado en el
  `intent`. Propongo fallar también al arrancar (mismo espíritu: mejor morir
  al inicio con mensaje claro que arrancar con un puerto NaN).
  **← REVISAR EN APROBACIÓN.**
- **R4 — (humano)** Sale de "no dejar la config con valores hardcodeados
  fuera del sistema de entorno" (`que_no_quiero`) y del Principio 4 de
  `docs/architecture.md` ("no leer process.env disperso"), documento que
  posee el humano.
- **R5 — (delegado)** El humano cedió "el patrón concreto de manejo de
  errores idiomático del stack". Decido: jerarquía `AppError` con `code` +
  `statusCode` y dos subclases iniciales, exactamente el boceto ya anotado en
  `docs/conventions.md` §Manejo de errores. Alternativa descartada: usar
  `http-errors`/`@fastify/sensible` (dependencia extra y sin `code` de
  dominio estable) — detalle en `design.md`.
- **R6 — (humano)** Sale de "cuando una feature lanza un error, sale con un
  formato consistente en toda la app". La forma `{ statusCode, code, message }`
  no la invento: está fijada en `docs/conventions.md` §Manejo de errores
  (documento del humano).
- **R7 — (delegado)** Parte del patrón cedido: decido normalizar también los
  errores de validación que genera Fastify/AJV (hoy salen con el formato
  default de Fastify, distinto del resto). Alternativa descartada: dejar el
  400 default de Fastify tal cual — rompería justo la consistencia que pide
  el `intent`.
- **R8 — (delegado)** Parte del patrón cedido; implementa la regla ya
  anotada en `docs/conventions.md`: "no se filtran detalles sensibles al
  cliente". Decido el body genérico exacto del 500.
- **R9 — (delegado)** Parte del patrón cedido; implementa "se loguea con
  `fastify.log` / `request.log`" de `docs/conventions.md`. Decido que el log
  completo ocurre en el handler central (único punto), no en cada ruta.
- **R10 — (añadido)** El humano no habló de rutas inexistentes (404 de
  router, no de recurso). Hoy Fastify responde con su formato default, que
  sería el único body de error distinto de la app. Propongo normalizarlo con
  `setNotFoundHandler` para que "formato consistente en toda la app" sea
  literal. **← REVISAR EN APROBACIÓN.**
- **R11 — (humano)** Sale de "la estructura por features ya está establecida
  y documentada" del `intent`, con el árbol exacto ya DECIDIDO por el humano
  en `docs/architecture.md` (ADR-004 + nota de migración).
- **R12 — (humano)** Corolario directo de la nota de migración de
  `docs/architecture.md`: `src/routes/*` se mueve a `modules/`; no queda
  origen que conservar.
- **R13 — (humano)** Sale de los Principios 1-2 de `docs/architecture.md`
  ("hoy las rutas sí lo hacen — a migrar") y de la nota de migración
  ("extrayendo el `*.service.ts` para sacar la lógica y `fastify.prisma` de
  la ruta").
- **R14 — (humano)** Sale de "no construir features de negocio todavía"
  (`que_no_quiero`): la migración no cambia el comportamiento funcional. Los
  8 tests existentes son la evidencia de regresión exigida por el humano en
  el encargo.
- **R15 — (humano)** Sale del acceptance "al menos un test del camino feliz
  de los fundamentos pasa con ./init.sh" y de la regla de cierre de
  `docs/verification.md`.
- **R16 — (humano)** Sale de la regla del workspace en
  `docs/related-projects.md` (documento del humano): el contrato se
  actualiza en la misma feature que lo cambia, con nota visible si afecta al
  frontend.
- **R17 — (humano)** Sale literalmente del acceptance "docs/architecture.md
  actualizado con las decisiones tomadas".
- **R18 — (añadido)** El `intent` no menciona linting, pero
  `docs/conventions.md` §Estilo (documento del humano) dice explícitamente
  que ESLint + Prettier "se añaden en la feature de fundamentos". Lo incluyo
  como requirement **condicional** (patrón DONDE) para que el humano decida
  en la puerta si entra ahora o se pospone a otra feature; añade ~2
  devDependencies (va contra la preferencia registrada de no meter
  dependencias no imprescindibles, a favor tiene el mandato explícito de
  conventions.md). **← REVISAR EN APROBACIÓN: confirmar o excluir.**
