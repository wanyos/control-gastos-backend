# Arquitectura — Qué significa "hacer un buen trabajo"

> **Este documento es la referencia de arquitectura del backend y lo posees tú
> (humano).** Recoge las decisiones ya tomadas. Donde el código actual todavía
> diverge del destino descrito, se indica explícitamente.

## Principios

> Basado en el patrón estándar Fastify + Prisma (capas HTTP → servicio → datos).
> Nota de realidad: implementados por la feature #2 "foundations" (2026-07-11).
> El código de `src/` cumple estos principios; `src/architecture.test.ts` los
> guarda como test (no `process.env` fuera de `config/`, rutas sin `prisma`,
> árbol de módulos presente).

1. **La capa HTTP no contiene lógica de negocio.** Una ruta
   (`modules/<recurso>/*.routes.ts`) solo: valida la entrada con un JSON Schema,
   llama a un servicio y formatea la salida. Toda decisión de negocio vive en el
   servicio del módulo (`modules/<recurso>/*.service.ts`).

2. **El acceso a datos se aísla.** Solo la capa de servicios/repositorio habla
   con Prisma (`fastify.prisma`). Ninguna ruta importa el cliente de Prisma
   directamente.

3. **Errores explícitos y tipados.** Las funciones que pueden fallar lanzan
   errores de dominio nombrados (`NotFoundError`, `ValidationError`, …), no
   devuelven `null` ambiguo. Un error handler central los traduce a respuesta HTTP.

4. **Configuración validada al arrancar.** La app no lee `process.env` disperso:
   lo hace en un único punto que valida al inicio y falla con mensaje claro si
   falta algo obligatorio (`DATABASE_URL`).

5. **Composición por plugins.** La infraestructura compartida (Prisma, config,
   error handler) se registra como plugins Fastify con `fastify-plugin`, no
   como singletons importados sueltos.

## Estructura de carpetas

> **DECIDIDO — estructura por módulos** (ver ADR-004). Alineado con la feature #2
> ("estructura por features"). Árbol implementado (feature #2, 2026-07-11).
>
> **La organización es por recurso, no por capa.** Cada recurso agrupa su ruta,
> su servicio, sus schemas y sus tipos en `modules/<recurso>/`. La separación de
> responsabilidades (HTTP → servicio → datos) de los Principios se mantiene
> idéntica; lo único que cambia es que los archivos de un mismo recurso viven
> juntos en vez de repartidos por carpetas de capa.

```
src/
  server.ts              # punto de entrada: carga env, arranca listen()
  app.ts                 # buildApp(): registra infra transversal + módulos
  architecture.test.ts   # test guardián de los invariantes de este árbol
  config/                # carga y validación de env tipada (loadConfig)
  plugins/               # plugins Fastify transversales
    prisma.ts            #   expone fastify.prisma + cierre limpio
    drive.ts             #   expone fastify.drive (sin handshake eager, ADR-007)
    error-handler.ts     #   setErrorHandler + setNotFoundHandler centrales
  lib/                   # utilidades de infraestructura
    prisma.ts            #   fábrica de PrismaClient (driver adapter pg)
    drive.ts             #   fábrica del cliente de Drive + checkDriveConnection
    drive-structure.ts   #   estructura en Drive (files.*): carpetas, subir, mover (ADR-008)
  errors/                # clases de error de dominio (AppError, ...)
  modules/                 # un directorio por recurso (vertical slice)
    expenses/
      expenses.routes.ts   #   capa HTTP: valida, llama al servicio, formatea
      expenses.service.ts  #   lógica de negocio; único que habla con Prisma
      expenses.schema.ts   #   JSON Schemas del recurso
      expenses.types.ts    #   tipos del recurso (CreateExpenseBody, ...)
    health/
      health.routes.ts
  generated/prisma/      # cliente Prisma generado (no se versiona)
```

> **Regla para decidir dónde va un archivo:** ¿pertenece a un recurso concreto?
> → `modules/<recurso>/`. ¿lo usan todos y no es de nadie (config, cliente
> Prisma, error handler, clases de error)? → carpeta transversal (`config/`,
> `plugins/`, `lib/`, `errors/`).
>
> Nota de migración: **ejecutada** (feature #2, 2026-07-11). Los antiguos
> `src/routes/{health,expenses}.ts` viven ahora en `modules/<recurso>/` con el
> `*.service.ts` extraído (la lógica y `fastify.prisma` fuera de la ruta) y el
> `*.schema.ts`. `src/routes/` ya no existe (lo guarda
> `src/architecture.test.ts`).

## Flujo de datos

```
Request
  → ruta (*.routes.ts)      valida con JSON Schema (AJV)
  → servicio (*.service.ts) aplica reglas de negocio
  → Prisma (fastify.prisma) habla con PostgreSQL
  ← servicio                devuelve datos de dominio
  ← ruta                    formatea la respuesta (status + body del contrato)
Response

Errores: cualquier throw de dominio → error-handler central → respuesta HTTP normalizada
```

## Decisiones de arquitectura (ADRs)

> ADRs que documentan las decisiones tomadas en el bootstrap.

### ADR-001: ESM + NodeNext

- **Fecha:** 2026-07-07
- **Estado:** aceptada (implementada en el código)
- **Contexto:** proyecto Node/TS nuevo; elegir sistema de módulos.
- **Decisión:** ESM (`"type": "module"`) con `module`/`moduleResolution`
  `NodeNext`. Imports relativos con extensión `.js`.
- **Alternativas consideradas:** CommonJS (más simple, sin extensiones) — se
  descartó por ser el modo legacy y porque el generador `prisma-client` de
  Prisma 7 emite ESM de forma natural.
- **Consecuencias:** hay que escribir `.js` en imports relativos; a cambio,
  runtime moderno y sin transpilación intermedia en dev (`tsx`).

### ADR-002: Prisma 7 con driver adapter (`@prisma/adapter-pg`)

- **Fecha:** 2026-07-07
- **Estado:** aceptada (implementada)
- **Contexto:** Prisma 7 sacó la URL de conexión del `schema.prisma`.
- **Decisión:** conexión del CLI en `prisma.config.ts`; en runtime, driver
  adapter `PrismaPg` con `DATABASE_URL` en `src/lib/prisma.ts`.
- **Alternativas consideradas:** generador clásico `prisma-client-js` sin
  adapter — se descartó por estar en vía de deprecación en Prisma 7.
- **Consecuencias:** `.env` debe cargarse manualmente (`dotenv/config`).

### ADR-003: Validación con JSON Schema nativo de Fastify

- **Fecha:** 2026-07-07
- **Estado:** aceptada (implementada parcialmente)
- **Contexto:** validar cuerpos/params de las peticiones.
- **Decisión:** usar el `schema` nativo de Fastify (AJV) por endpoint.
- **Alternativas consideradas:** Zod/Typebox — más ergonómicos y con inferencia
  de tipos, pero suman dependencia. Reconsiderar si crece la superficie de API.
- **Consecuencias:** validación rápida y sin deps; los tipos del `Body` se
  declaran a mano (no se infieren del schema).

### ADR-004: Organización de carpetas por módulos (vertical slices)

- **Fecha:** 2026-07-08
- **Estado:** aceptada
- **Contexto:** elegir cómo agrupar el código en `src/`: por capa (`routes/`,
  `services/`, `schemas/`) o por recurso/feature (`modules/expenses/{routes,
  service,schema}`). La feature #2 pide en su `intent` una "estructura por
  features"; el borrador inicial proponía por capa y dejaba la decisión abierta.
- **Decisión:** organizar por **módulos**. Cada recurso vive en
  `modules/<recurso>/` con sus archivos `*.routes.ts`, `*.service.ts`,
  `*.schema.ts` y `*.types.ts`. La infraestructura transversal que no pertenece a
  ningún recurso (config, cliente Prisma, error handler, clases de error) queda
  fuera, en `config/`, `plugins/`, `lib/` y `errors/`.
- **Alternativas consideradas:** organización **por capa** — descartada porque
  esta app crece por recurso (expenses, income, categories, dashboard) y por
  capa cada cambio de un recurso se reparte por 4 carpetas. También contradecía
  el `intent` de la feature #2.
- **Consecuencias:** cada módulo se registra como plugin Fastify con su prefijo
  (encaja con el modelo `register` + `prefix` de Fastify). La separación de
  responsabilidades de los Principios (HTTP → servicio → datos) no cambia: solo
  cambia dónde se agrupan los archivos. Alta cohesión por recurso; encontrar,
  tocar y borrar una feature se hace en un único sitio.

### ADR-005: Manejo de errores — jerarquía `AppError` + handler central de Fastify

- **Fecha:** 2026-07-11
- **Estado:** aceptada (implementada en la feature #2)
- **Contexto:** el `intent` de la feature #2 exige que todo error salga "con un
  formato consistente en toda la app". El patrón concreto estaba delegado al
  agente (ver `specs/foundations/`).
- **Decisión:** clases de error de dominio (`AppError` con `code` + `statusCode`;
  subclases `NotFoundError`, `ValidationError` en `src/errors/app-error.ts`) +
  `setErrorHandler` central registrado como plugin `fp`
  (`src/plugins/error-handler.ts`), con `setNotFoundHandler` para normalizar
  también el 404 de router. Formato único del body de error:
  `{ statusCode, code, message }`; los errores no-`AppError` responden un 500
  genérico sin detalles internos y se loguean con `request.log.error`.
- **Alternativas consideradas:** armar respuestas por ruta (statu quo) — el
  formato deriva con el tiempo, es la incoherencia que el intent impide;
  `http-errors` / `@fastify/sensible` — resuelven el status pero no dan un
  `code` de dominio estable y añaden dependencia para 3 clases pequeñas.
- **Consecuencias:** las rutas no arman bodies de error a mano; nuevas
  subclases (p. ej. `ConflictError`) se añaden cuando una feature las
  necesite. El contrato (`docs/api-contract.md` §Errores) documenta los
  códigos estables.
  - **Subclase añadida (feature #4 "drive-structure", 2026-07-25):**
    `UnknownBankError` (`UNKNOWN_BANK`, 404), la nueva subclase idiomática que
    esta feature necesitó para distinguir "banco con formato válido pero no
    registrado" tanto de `ValidationError` (formato inválido, 400) como de
    `DriveConnectionError` (fallo de Drive, 503). Ver ADR-008.

### ADR-006: Validación de configuración de entorno a mano

- **Fecha:** 2026-07-11
- **Estado:** aceptada (implementada en la feature #2)
- **Contexto:** la config por entorno debe validarse al arrancar y fallar con
  mensaje claro (Principio 4). ¿Librería declarativa o validador manual?
  Decisión delegada al agente (ver `specs/foundations/design.md` §2).
- **Decisión:** validador manual tipado en `src/config/env.ts`
  (`loadConfig(env)`): 4 variables, 1 obligatoria; acumula todos los problemas
  en un único error. `src/server.ts` hace fail-fast (stderr + `exit(1)`).
- **Alternativas consideradas:** `@fastify/env` — valida dentro del ciclo de
  plugins, demasiado tarde para el `logLevel` que se necesita al crear la
  instancia, y añade dependencia; Zod/znv — contradice ADR-003 (no sumar
  librerías de schema).
- **Consecuencias:** menos declarativo y sin coerción automática.
  **Umbral para reconsiderar:** si las variables crecen (>8-10) o aparecen
  tipos complejos, reevaluar `@fastify/env`.
  - **Evaluado el 2026-07-20 (feature "drive-connection"):** las tres variables
    de Drive llevan la cuenta de 4 a **7**. Se **mantiene el validador manual**:
    aún no se cruza el umbral (7 de 8-10) y las tres nuevas son el caso más
    simple posible (strings obligatorios, sin coerción ni enum). Reevaluar de
    verdad cuando la feature 4 lleve la cuenta a 8 **y** aparezca la primera
    variable que no sea un string plano (detalle en
    `specs/drive-connection/design.md` §3).
  - **Evaluado el 2026-07-25 (feature "drive-structure"):**
    `GOOGLE_DRIVE_ROOT_FOLDER_ID` lleva la cuenta a **8**. Se **mantiene el
    validador manual**: la 8ª variable sigue siendo un string plano obligatorio
    (fileId), sin coerción ni enum, así que se cruza el umbral en **número** pero
    no en **tipo**. Reevaluar `@fastify/env` cuando aparezca la primera variable
    que no sea un string plano (detalle en `specs/drive-structure/design.md` §10,
    ADR-008 consecuencias).

### ADR-007: Conexión con Google Drive — `@googleapis/drive` + OAuth2 con refresh token

- **Fecha:** 2026-07-14
- **Estado:** aceptada (implementada en la feature #3)
- **Contexto:** la feature #3 necesita que el backend hable con el Google Drive
  **personal** del dueño (cuenta Gmail, sin Workspace) de forma desatendida, como
  cimiento de la ingesta automática. El `intent` delegaba en el agente el
  mecanismo de auth, la librería y la forma de exponer el cliente; el humano
  cerró el 2026-07-14 el scope y la política de arranque.
- **Decisión:**
  1. **Librería:** `@googleapis/drive@^20.2.0`, única dependencia nueva.
     `google-auth-library` **no** se declara: se usa el `auth` que el paquete
     reexporta.
  2. **Auth:** OAuth2 con refresh token de larga duración, cliente OAuth de tipo
     *Desktop app*, app publicada **"In production"**. El consentimiento es
     manual y se hace **una vez** con un script fuera de `src/`.
  3. **Scope:** `https://www.googleapis.com/auth/drive` completo (restringido),
     como constante de código.
  4. **Exposición:** triángulo `config/env.ts` + `lib/drive.ts` (fábrica pura) +
     `plugins/drive.ts` (plugin `fp` que decora `fastify.drive`), igual que
     Prisma pero **sin handshake eager**: el cliente se construye sin I/O y la
     conectividad se comprueba bajo demanda en `GET /health/drive`.
  5. **Errores:** `DriveConnectionError` (`DRIVE_CONNECTION_ERROR`, 503) envuelve
     todo error de la librería con un mensaje fijo; el error crudo nunca sale.
- **Alternativas consideradas:**
  - **`googleapis` (monolito):** 207 MB frente a 2,45 MB (~85x) para
    funcionalidad idéntica en Drive. Descartada por peso.
  - **Service Account:** descartada — **no funciona** con Drive personal: no
    tiene cuota de almacenamiento y no puede poseer archivos, así que la subida
    de la feature 4 fallaría con `403 storageQuotaExceeded`. Sus dos vías de
    escape (Shared Drives, domain-wide delegation) exigen Google Workspace **de
    pago**.
  - **ADC:** no es un mecanismo de auth, solo descubrimiento de credenciales;
    acaba en una Service Account (mismo problema) o en credenciales de `gcloud`
    de desarrollo, y añade magia implícita que dificulta el fail-fast al arrancar.
  - **Scope `drive.file` (no sensible):** descartado por el humano con las
    alternativas delante. No sirve para el diseño acordado: es acceso *por
    archivo*, no ve la raíz creada a mano ni los archivos depositados a mano,
    que es el corazón de la idea nº1. No existe un scope de "solo esta carpeta".
  - **Handshake eager en el arranque (como Prisma `$connect()`):** descartado por
    el humano. Ataría cada `app.ready()` de la suite a una llamada de red real a
    Google, y no hay "Drive local" con el que compensarlo.
- **Consecuencias:**
  - **Coste asumido conscientemente:** el refresh token da acceso de
    lectura/escritura a **todo** el Drive del dueño; si se filtra, se filtra todo.
    Mitigaciones: solo en `.env` (gitignoreado), nunca en logs (los errores se
    envuelven con mensaje fijo), nunca en el repo (`.env.example` con
    placeholders, guardado por test), revocable en
    [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
  - `pnpm dev` deja de arrancar sin las tres credenciales. La suite no las
    necesita: usa placeholders en `vitest.config.ts` (posible solo gracias al
    arranque lazy; R8 lo convierte en test).
  - La feature 4 hereda el cliente vía `fastify.drive` sin volver a resolver auth.
  - **Umbral de ADR-006 evaluado**: 7 variables tras esta feature; se mantiene el
    validador manual (razones en `specs/drive-connection/design.md` §3).

### ADR-008: Estructura en Drive — servicio interno idempotente en `lib/`, Drive como registro de bancos, raíz por env

- **Fecha:** 2026-07-24
- **Estado:** aceptada (implementada en la feature #4; modelo de identidad de banco
  revisado en la puerta de aprobación el 2026-07-24)
- **Contexto:** la feature #4 crea la organización física de la ingesta en el Drive
  del dueño: `notas-banco/<banco>/<año>/procesados/`. Se apoya en el cliente de la
  feature #3 (`fastify.drive`, ADR-007) sin volver a montar auth. El `intent`
  delegó: resolución nombre→fileId + idempotencia + carrera; cómo conoce la raíz;
  superficie de exposición; e identidad de banco/validación de año. En la puerta de
  aprobación el humano fijó el **modelo de identidad de banco** (ver Decisión 7).
- **Decisión:**
  1. **Ubicación:** funciones puras en `src/lib/drive-structure.ts` (contraparte
     `files.*` de `lib/drive.ts`, que se queda "solo conexión"). Reciben el
     `AppDriveClient` por parámetro (seam inyectable, testeable sin red).
  2. **Exposición:** **servicio interno, sin endpoints**. El consumidor es la
     ingesta (feature futura); no se abre superficie HTTP sin auth sobre scope
     completo. `api-contract.md` sin endpoints nuevos; `DRIVE_CONNECTION_ERROR` y
     el nuevo `UNKNOWN_BANK` quedan **reservados**.
  3. **Raíz:** variable **obligatoria** `GOOGLE_DRIVE_ROOT_FOLDER_ID` (8ª variable),
     validada al arrancar; el backend **nunca** crea la raíz. Campo hermano
     `config.driveRootFolderId` (no dentro de `DriveCredentials`).
  4. **Idempotencia y carrera:** `findFolder` busca por `files.list` (`q` por
     nombre+mimeType+padre+`trashed=false`) y de-duplica de forma determinista (la
     más antigua); `ensureFolder` crea solo si no existe, con lock en memoria por
     `(padre, nombre)` para el concurrente **intra-proceso**. **Límite:** el lock es
     de un proceso; en multi-instancia pueden aparecer duplicados, hechos
     inofensivos por la de-dup pero no borrados.
  5. **"No a medias":** Drive no tiene transacciones; se garantiza por convergencia
     idempotente en el reintento + no reportar éxito parcial (no rollback).
  6. **Subir/mover:** `files.create` con `media` (archivo nuevo, nunca
     sobrescribe); `files.update` con `addParents`/`removeParents` (mover a
     `procesados`).
  7. **Identidad de banco — Drive es el registro; crear es explícito (decisión del
     humano en la puerta):** las **subcarpetas directas de la raíz** son la única
     fuente de verdad de "qué bancos existen" (no hay lista en config ni BD). Dos
     operaciones separadas: **`resolveBankFolder`** (ruta por defecto, segura) exige
     que la carpeta de banco exista; si no, lanza `UnknownBankError` con la lista de
     bancos conocidos y una sugerencia por distancia de edición (Levenshtein ≤ 2,
     desempate alfabético), y **no crea nada**. **`createBank`** (operación explícita
     y aparte) es el **único** camino de alta, idempotente. El nivel año y su
     `procesados/` se auto-crean siempre (rutina acotada por la validación de año).
     La validación de **forma** del slug (`^[a-z0-9-]{1,64}$`, no `procesados`) y del
     año (`^\d{4}$` en 2000-2100) protege el nombre de carpeta **y** el filtro `q`
     (sin escapar).
  8. **Errores:** `ValidationError` (formato de slug/año inválido, 400) y
     `DriveConnectionError` (fallo de Drive, 503) se **reutilizan**; se **añade**
     `UnknownBankError` (`UNKNOWN_BANK`, 404) para "banco con formato válido pero no
     registrado", requisito de distinguibilidad del humano.
- **Alternativas consideradas:**
  - **Auto-crear el banco en la ruta normal (modelo anterior, descartado por el
    humano en la puerta):** un typo en el slug (`santender` por `santander`) crearía
    silenciosamente una carpeta de banco nueva y equivocada, donde la ingesta
    depositaría sin que nadie lo note. Separar usar (resuelve-existente) de crear
    (explícito) cierra ese agujero: un banco mal escrito falla ruidosamente con
    lista + sugerencia en vez de crear basura.
  - **Flag `{ create: true }` en la ruta normal en vez de función aparte:**
    descartada — un booleano es fácil de colar por descuido y reabre el agujero del
    typo; una función dedicada (`createBank`) hace el alta imposible por accidente.
  - **Lista cerrada de bancos hardcodeada en código:** descartada — obligaría a un
    deploy por banco nuevo y a inventar nombres sin conocerlos; el registro en Drive
    da la misma seguridad sin acoplar la lista al código.
  - **Reutilizar `ValidationError` (o `NotFoundError`) para banco desconocido:**
    descartada — rompe la distinguibilidad que el humano exige (indistinguible del
    formato inválido, o del not-found genérico de dominio).
  - **Endpoints de API:** descartada — superficie HTTP sin consumidor ni auth sobre
    scope completo; la ingesta definirá su contrato cuando exista.
  - **`rootFolderId` dentro de `DriveCredentials`:** descartada — no es credencial
    y ensuciaría la firma de `createDriveClient`.
  - **`appProperties` como marca de unicidad:** descartada — Drive no la impone, no
    elimina la carrera, complica la lectura.
  - **Borrar lo creado al fallar (rollback):** descartada — destructivo y contrario
    a la idempotencia que quiere reutilizarlo en el reintento.
- **Consecuencias:**
  - **8ª variable de entorno.** El umbral de ADR-006 se cruza en número (8) pero
    **no en tipo** (sigue siendo string plano): se **mantiene el validador manual**;
    reevaluar `@fastify/env` cuando aparezca la primera variable no-string.
  - **Nueva subclase de error `UnknownBankError`** en `src/errors/app-error.ts`
    (idiomática bajo ADR-005). El `error-handler` la mapea sin cambios.
  - `pnpm dev` deja de arrancar sin `GOOGLE_DRIVE_ROOT_FOLDER_ID`. La suite usa
    placeholder.
  - **Dar de alta un banco es una acción deliberada** (`createBank` o crear la
    subcarpeta a mano en Drive). La ingesta cotidiana nunca crea bancos: un banco
    desconocido falla con lista + sugerencia.
  - La ingesta (feature futura) hereda el servicio sin re-resolver auth ni estructura,
    y puede discriminar `UNKNOWN_BANK` para ofrecer el alta.
  - `src/lib/drive.ts` gana un `export` (`driveErrorMessage`) reutilizado por
    `drive-structure.ts`; su guardián `no files.` sigue verde (los `files.*` viven
    en `drive-structure.ts`).

## Qué NO hacer

- **No importar el cliente de Prisma en una ruta.** El acceso a datos vive en
  el `*.service.ts` del módulo (que recibe `fastify.prisma`).
- **No devolver el modelo de Prisma tal cual** si diverge del contrato de la
  API; mapéalo a la forma esperada por el consumidor.
- **No leer `process.env` disperso por el código.** Centralizar en `config/`.
- **No usar `console.log` para errores.** Usar el logger de Fastify
  (`fastify.log` / `request.log`).
- **No añadir librerías nuevas sin anotar el trade-off** aquí (o pasar la
  feature a `blocked` en `feature_list.json` para discutirlo).
