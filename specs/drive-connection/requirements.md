# Requirements — Feature 3: drive-connection

> Derivados del bloque `intent` de la feature 3 en `feature_list.json` (fuente
> de verdad del QUÉ), de las **dos decisiones que el humano cerró el
> 2026-07-14** (ver más abajo) y de las decisiones ya tomadas en
> `docs/architecture.md` (Principios 1-5, ADR-005, ADR-006) y
> `docs/conventions.md`. Notación EARS estricta (ver `docs/specs.md`).
>
> Investigación previa que sostiene este spec (no se repite aquí):
> `progress/explorations/google-drive-auth.md` y
> `progress/explorations/foundations-integration-points.md`.
>
> 🚨 **Los pasos manuales que te tocan a ti (Google Cloud Console) están en
> `design.md` §10.** Léelos en la puerta de aprobación: la feature no se puede
> probar de verdad contra Drive sin ellos, y uno de ellos (publicar en
> *"In production"*) decide si tu token dura para siempre o **caduca cada 7
> días**.

## Decisiones del humano ya cerradas (no se reabren aquí)

1. **Scope `https://www.googleapis.com/auth/drive` completo (restringido).** El
   humano aceptó el trade-off con las alternativas delante: si el refresh token
   se filtra, alcanza todo su Drive. Motivo técnico: `drive.file` no ve ni la
   raíz creada a mano ni los archivos depositados a mano, así que rompe la idea
   nº1 (§3.3 de la exploración de auth). Sus mitigaciones son R15, R16 y R17.
2. **Validar credenciales al arrancar (sin red) + conexión en diferido
   (lazy).** Las tres credenciales son **obligatorias** en `loadConfig` (esto
   resuelve el "falla **o** avisa" del `intent` en favor de **falla**), no hay
   handshake de red en el arranque, y la conectividad real se comprueba bajo
   demanda con un endpoint explícito. Son R2, R5 y R8.

## Configuración por entorno

### R1
CUANDO la app arranca con `GOOGLE_DRIVE_CLIENT_ID`,
`GOOGLE_DRIVE_CLIENT_SECRET` y `GOOGLE_DRIVE_REFRESH_TOKEN` presentes y no
vacías, el sistema DEBE construir una `AppConfig` que incluya
`drive: { clientId, clientSecret, refreshToken }` con esos tres valores.

*Verificación:* test unitario de `loadConfig()` con un objeto env sintético
completo → `config.drive` igual a los tres valores.

### R2
SI falta o está vacía alguna de las tres variables de Drive ENTONCES
`loadConfig()` DEBE lanzar un error cuyo mensaje nombre **todas** las
variables de Drive ausentes (no solo la primera).

*Verificación:* tests unitarios `loadConfig({ DATABASE_URL })` → lanza con un
mensaje que contiene los tres nombres; y un caso por variable ausente.

### R3
CUANDO `loadConfig()` encuentra problemas en variables de Drive y en variables
preexistentes a la vez, el sistema DEBE listarlos todos en un único mensaje de
error, conservando los de `DATABASE_URL`, `PORT` y `LOG_LEVEL`.

*Verificación:* el test de regresión existente `collects all problems into a
single error message` (regex `/DATABASE_URL[\s\S]*PORT[\s\S]*LOG_LEVEL/`) sigue
verde, más un assert nuevo de que el mensaje nombra también las tres de Drive.

## Cliente de Drive y autenticación

### R4
El sistema DEBE construir la autenticación de Drive como un cliente OAuth2 con
el `refresh_token` establecido en sus credenciales, de modo que la librería
renueve el access token por su cuenta en cada llamada, sin intervención humana.

*Verificación:* test unitario de `createDriveAuth(credentials)` →
`.credentials.refresh_token` es el valor pasado. (Es exactamente el mecanismo
que documenta `google-auth-library`: con un refresh token presente, los access
tokens se obtienen y renuevan solos; ver exploración de auth §1.1.)

### R5
El sistema DEBE construir el cliente de Drive (`createDriveClient`) **sin
realizar ninguna llamada de red**.

*Verificación:* test unitario que llama a `createDriveClient()` con
credenciales sintéticas (inválidas) y comprueba que devuelve un cliente con
`about.get` invocable, sin que el test toque la red ni falle.

### R6
El sistema DEBE definir el scope de Drive como una constante de código con el
valor exacto `https://www.googleapis.com/auth/drive`, y NO DEBE leerlo de una
variable de entorno.

*Verificación:* test unitario que comprueba el valor exacto de la constante
`driveScope` exportada por `src/lib/drive.ts`. (Cambiar el scope obliga a
rehacer el consentimiento a mano, así que no es configuración de entorno; ver
exploración de auth §4.1.)

### R7
El sistema DEBE exponer el cliente de Drive como `fastify.drive`, decorado por
un plugin registrado con `fastify-plugin` (sin encapsular), disponible para
cualquier ruta o plugin registrado después.

*Verificación:* test de integración: `buildApp()` + `await app.ready()` →
`app.drive` está definido y tiene `about.get`; y una ruta registrada después
del plugin puede leer `fastify.drive`.

### R8
El registro del plugin de Drive NO DEBE realizar llamadas de red: CUANDO
`buildApp()` + `await app.ready()` se ejecutan con credenciales de Drive
sintéticas e inválidas, el arranque DEBE completar sin error.

*Verificación:* test de integración con las credenciales placeholder que fija
`vitest.config.ts` → `app.ready()` resuelve y `app.drive` queda decorado. Si el
plugin hiciera handshake eager (como hace Prisma con `$connect()`), este test
fallaría con `invalid_client`. Es la prueba concreta de la decisión 2 del
humano.

## Comprobación de conexión bajo demanda

### R9
CUANDO un cliente hace `GET /health/drive` y la Drive API responde
correctamente, el sistema DEBE responder `200` con el cuerpo
`{ status: 'ok', drive: 'up' }`.

*Verificación:* test de integración con un doble del cliente de Drive cuyo
`about.get` resuelve → 200 y cuerpo exacto.

### R10
SI la llamada a la Drive API falla ENTONCES `GET /health/drive` DEBE responder
`503` con el cuerpo `{ status: 'error', drive: 'down' }`, registrar el fallo con
`fastify.log.error` y NO DEBE propagar la excepción (la app sigue en pie).

*Verificación:* test de integración con un doble cuyo `about.get` rechaza → 503
con el cuerpo exacto; y una petición posterior a `/health` sigue respondiendo
200.

### R11
CUANDO `checkDriveConnection` recibe una respuesta correcta de `about.get`, el
sistema DEBE devolver el `emailAddress` de la cuenta de Drive conectada.

*Verificación:* test unitario con un doble que resuelve
`{ data: { user: { emailAddress: 'x@y.z' } } }` → devuelve `'x@y.z'`.

## Seguridad de credenciales

### R12
SI la Drive API devuelve un error ENTONCES el sistema DEBE envolverlo en un
`DriveConnectionError` cuyo `message` NO DEBE contener el refresh token, el
client secret, ni el texto crudo del error original.

*Verificación:* test unitario: el doble rechaza con un `Error` cuyo mensaje
contiene una cadena que simula un token (`1//fake-token-value`); se comprueba
que el `message` del `DriveConnectionError` resultante **no** contiene esa
cadena. (Es la propiedad que ya guarda `error-handler.test.ts` para los 500
genéricos, aplicada en origen: un error crudo de la librería puede llevar
tokens o URLs firmadas.)

### R13
El sistema DEBE definir `DriveConnectionError` en `src/errors/app-error.ts`
como subclase de `AppError` con `code` `'DRIVE_CONNECTION_ERROR'` y
`statusCode` `503`.

*Verificación:* test unitario que instancia la clase y comprueba `code`,
`statusCode`, `message` e `instanceof AppError`.

### R14
El sistema NO DEBE contener credenciales ni tokens de Drive en el código ni en
ningún archivo versionado: `.env.example` DEBE listar las tres variables solo
con placeholders.

*Verificación:* test guardián en `src/architecture.test.ts` que lee
`.env.example`, comprueba que nombra las tres variables y que **no** contiene
valores con forma de credencial real (patrones `1//…` de refresh token y
`GOCSPX-…` de client secret). Complemento: `.env` ya está en `.gitignore`
(verificado).

### R15
El sistema NO DEBE leer `process.env` fuera de `src/config/env.ts`: las
credenciales de Drive DEBEN llegar al plugin a través de `fastify.config`.

*Verificación:* el test guardián existente
(`architecture.test.ts` → `reads process.env only in src/config/env.ts`) sigue
verde. **Ojo:** el guardián busca la cadena literal `process.env`, así que ni
siquiera puede aparecer en un comentario de los archivos nuevos.

## Regresión y alcance

### R16
CUANDO se ejecuta `pnpm test`, los **35 tests existentes** DEBEN seguir en
verde sin que el desarrollador tenga que poseer credenciales reales de Drive.

*Verificación:* `pnpm test` en verde partiendo de un `.env` que **no** contiene
las variables de Drive. El mecanismo está en `design.md` §5: `vitest.config.ts`
inyecta las tres como placeholders (y `dotenv` no pisa variables ya
establecidas, como ya explota el `LOG_LEVEL: 'silent'` actual).

### R17
La feature NO DEBE crear carpetas ni subir, leer o mover archivos en Drive, ni
tocar bancos, parsers o importación: la única llamada a la Drive API DEBE ser
`about.get`.

*Verificación:* test guardián que escanea `src/lib/drive.ts` y falla si
contiene referencias a `files.` (la superficie de archivos/carpetas de la Drive
API). Complemento: revisión del diff por el reviewer.

### R18
CUANDO se ejecuta `bash ./init.sh`, el proceso DEBE terminar con
`[OK] Entorno listo` (typecheck estricto + suite completa al 100%).

*Verificación:* ejecución real de `bash ./init.sh`.

## Diagnóstico y documentación

### R19
CUANDO la Drive API falla con un síntoma conocido (`invalid_grant`,
`invalid_client`, `accessNotConfigured`, `insufficientPermissions`), el sistema
DEBE producir un `message` fijo y accionable propio de ese síntoma, y en
cualquier otro caso un mensaje genérico.

*Verificación:* tests unitarios, uno por síntoma, con dobles que rechazan con
cada error → se comprueba el `message` concreto del `DriveConnectionError`
resultante. Tabla de mapeo en `design.md` §4.

### R20
CUANDO `GET /health/drive` conecta correctamente, el sistema DEBE registrar en
el log (nivel `info`) el `emailAddress` de la cuenta conectada, y NO DEBE
incluirlo en el cuerpo de la respuesta HTTP.

*Verificación:* test de integración con un espía del logger → se llamó con el
email; y el cuerpo de la respuesta 200 es exactamente
`{ status: 'ok', drive: 'up' }`, sin el email.

### R21
El sistema DEBE actualizar `docs/api-contract.md` en esta misma feature con el
endpoint `GET /health/drive` y con el código estable
`DRIVE_CONNECTION_ERROR` en la tabla de códigos.

*Verificación:* manual — checklist del reviewer contra las respuestas reales de
los tests de integración. (Requirement de proceso sin superficie ejecutable
propia; misma excepción consciente que R16/R17 de `specs/foundations/`.)

### R22
El sistema DEBE actualizar `docs/architecture.md` al cierre de la feature con
el **ADR-007** (librería de Drive + mecanismo de auth + trade-offs), el árbol
objetivo (`lib/drive.ts`, `plugins/drive.ts`) y una nota explícita en el umbral
de ADR-006 dejando constancia de que se evaluó al llegar a 7 variables y se
mantuvo el validador manual.

*Verificación:* manual — checklist del reviewer (mismo carácter de proceso que
R21).

### R23
El sistema DEBE entregar al humano un script de un solo uso, **fuera de
`src/`**, que ejecute el flujo de consentimiento OAuth y le imprima el refresh
token, solicitando `access_type: 'offline'`, `prompt: 'consent'` y el scope de
R6.

*Verificación:* manual — el humano lo ejecuta en el paso 7 de `design.md` §10 y
obtiene un refresh token. (Es un one-shot fuera del árbol de la app: no forma
parte de `src/`, no lo cubre la suite. Ver `design.md` §8.)

---

## Procedencia

- **R1 — (humano)** Sale de *"Cuando arranca la app con las credenciales de
  Drive configuradas…"*. Los **nombres** de las tres variables y la **forma
  anidada** `drive: { … }` son míos: el humano cedió *"qué variables de entorno
  nuevas hacen falta y cómo validarlas"*. Alternativa descartada: tres campos
  planos (`googleDriveClientId`, …) — detalle y trade-off en `design.md` §2.
- **R2 — (humano)** Sale de *"Cuando falta o es inválida alguna credencial de
  Drive, la app lo detecta y **falla** o avisa con un mensaje claro"*, resuelto
  hacia "falla" por la **decisión 2 del humano (2026-07-14)**. Que el mensaje
  liste **todas** las ausentes no es capricho: es el comportamiento que ya tiene
  `loadConfig` (`env.ts:28`, acumula en `problems[]`), no lo invento.
- **R3 — (humano)** Corolario de R2 y del comportamiento ya existente de
  `loadConfig`; además protege un test de regresión existente.
- **R4 — (delegado)** El humano cedió *"qué mecanismo de auth concreto encaja
  con una cuenta personal de Google Drive"*. Decido: **OAuth2 + refresh token de
  larga duración**. Alternativas descartadas con fuentes en la exploración de
  auth §1.1: **Service Account** (no tiene cuota de almacenamiento y no puede
  poseer archivos en un Drive personal → la subida de la feature 4 fallaría con
  `403 storageQuotaExceeded`; las dos vías de escape oficiales exigen Google
  Workspace **de pago**) y **ADC** (no es un mecanismo distinto, solo
  descubrimiento de credenciales; acaba en una Service Account o en credenciales
  de `gcloud` de desarrollo).
- **R5 — (humano)** Sale de la **decisión 2 del humano**: "cliente construido
  sin I/O, conexión en diferido".
- **R6 — (humano)** El scope `drive` completo es la **decisión 1 del humano**,
  tomada con las alternativas delante. Que viva como constante de código y no
  como variable de entorno es criterio mío *(delegado)*: cambiarlo obliga a
  rehacer el consentimiento a mano, así que no es algo que se ajuste por
  entorno.
- **R7 — (humano)** Sale de *"Cualquier feature futura puede reutilizar esta
  conexión sin volver a resolver el auth"* del `intent`. El **cómo** (plugin
  `fp` + `decorate`) lo cedió el humano en *"cómo exponer el cliente de Drive a
  la app siguiendo docs/architecture.md (p. ej. plugin Fastify)"*: decido copiar
  el triángulo `config` + `lib/` + `plugins/` del precedente de Prisma, que es
  el Principio 5 de `docs/architecture.md` (documento del humano).
- **R8 — (humano)** Sale de la **decisión 2 del humano**: *"NO se hace handshake
  de red en el arranque"*, a diferencia del plugin de Prisma.
- **R9, R10 — (humano)** Salen de *"Cuando compruebo la conexión, el backend me
  dice si llega a Drive o no"*. La **ruta** (`/health/drive`), el **shape**
  (`{ status, drive }`) y el **503** son míos *(delegado)*: copian el molde
  exacto de `GET /health/db` (`health.routes.ts:13-21`), que ya es una respuesta
  de readiness deliberada sin `throw`.
- **R11 — (delegado)** Parte de la comprobación cedida. Decido `about.get({
  fields: 'user' })` como la llamada de comprobación. Alternativa descartada:
  `files.list({ pageSize: 1 })` — es **ambigua** como comprobación (ver
  `design.md` §4). Nota: `fields` es **obligatorio** en `about.get` (sin él, 400).
- **R12 — (humano)** Sale de la **decisión 1 del humano** (*"token […] nunca en
  logs"*) y del `que_no_quiero` *"no guardar credenciales ni tokens en el código
  ni en el repositorio"*. Refuerza la regla ya escrita en
  `docs/conventions.md` §Manejo de errores: *"no se filtran detalles sensibles"*.
- **R13 — (delegado)** Cómo se representa el error es parte del *"cómo exponer
  el cliente"* cedido. Decido subclasear `AppError`, que es lo que ADR-005 ya
  prevé literalmente (*"nuevas subclases se añaden cuando una feature las
  necesite"*) y lo que anticipa `architecture.md:175-178`. El handler central
  **no se toca**: ya despacha por `instanceof AppError`.
- **R14 — (humano)** Sale del `que_no_quiero` *"No guardar credenciales ni
  tokens en el código ni en el repositorio; van por entorno o secreto"* y de las
  mitigaciones que el humano fijó al aceptar el scope completo. **El test
  guardián de `.env.example` es una adición mía**: el humano pidió la propiedad,
  no el test. Lo propongo porque pegar credenciales reales en `.env.example` es
  el modo de fallo catastrófico exacto que hace peligroso el scope completo que
  aceptó, y el guardián cuesta 4 líneas. ← REVISAR EN APROBACIÓN (solo el test;
  la regla es suya).
- **R15 — (humano)** Sale del Principio 4 de `docs/architecture.md` y está ya
  guardado por un test existente. No añade alcance: lo hago explícito porque
  condiciona por dónde entran las credenciales.
- **R16 — (humano)** Sale de la **decisión 2 del humano**, que exige
  explícitamente que el spec especifique cómo se mantiene verde la suite. El
  **mecanismo** (placeholders en `vitest.config.ts`) es mío *(delegado)*.
  Alternativa descartada: exigir las tres claves en el `.env` local —
  detalle en `design.md` §5.
- **R17 — (humano)** Sale literal de los `que_no_quiero`: *"No crear todavía
  carpetas ni subir/leer/mover archivos: esto es solo la tubería de conexión"* y
  *"No tocar nada de bancos, parsers ni importación aquí"*. El test guardián que
  lo mecaniza es mío.
- **R18 — (humano)** Regla de cierre de `docs/verification.md` y del acceptance.
- **R19 — (añadido)** El humano pidió *"un mensaje claro"*, **no** una tabla de
  diagnóstico de 4 síntomas. Propongo el mapeo porque los cuatro fallos son los
  que de verdad va a sufrir (token caducado, credenciales mal pegadas, Drive API
  sin habilitar, scope insuficiente) y sin él todos se ven igual: "no conecta".
  En particular `invalid_grant` es la señal de que la app se quedó en *"Testing"*
  y el token caduca cada 7 días — el fallo más caro y silencioso de esta feature
  (exploración de auth §1.2). **← REVISAR EN APROBACIÓN.**
- **R20 — (añadido)** El humano no pidió que se registre la cuenta conectada.
  Lo propongo porque el error más común y más silencioso de este flujo es
  **consentir con la cuenta de Google equivocada**, y sin el email el síntoma es
  "conecta bien" contra un Drive que no es el suyo. Es el paso 9 de sus pasos
  manuales. Decido **loguearlo pero no devolverlo en la respuesta HTTP**:
  `/health/drive` no tiene autenticación (`api-contract.md`: *"Autenticación:
  ninguna por ahora"*) y no quiero exponer su email a quien alcance el puerto.
  **← REVISAR EN APROBACIÓN.**
- **R21 — (humano)** Sale de la regla del workspace en
  `docs/related-projects.md` (documento del humano): el contrato se actualiza en
  la misma feature que lo cambia.
- **R22 — (humano)** Sale de la regla *"No añadir librerías nuevas sin anotar el
  trade-off aquí"* (`architecture.md:207-208`) y del acceptance derivado. La
  **pronunciación sobre el umbral de ADR-006** la exige el propio ADR-006, que
  es del humano; mi veredicto (mantener el validador manual) está en
  `design.md` §3.
- **R23 — (humano)** Sale literal de *"Qué pasos son manuales de mi lado […];
  que me los liste para hacerlos yo"* del `delego_en_agente`.
