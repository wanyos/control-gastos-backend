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
    accounts/              # cuentas bancarias (data-model, ADR-011)
      accounts.routes.ts   #   capa HTTP: valida, llama al servicio, formatea
      accounts.service.ts  #   lógica de negocio; único que habla con Prisma
      accounts.schema.ts   #   JSON Schemas del recurso
      accounts.types.ts    #   tipos del recurso (CreateAccountBody, ...)
    categories/            # catálogo de categorías (un nivel de subcategoría)
      categories.routes.ts
      categories.service.ts
      categories.schema.ts
      categories.types.ts
    movements/             # movimientos: SOLO LECTURA (entran por importación)
      movements.routes.ts  #   solo GET /
      movements.service.ts #   listado + helpers de dominio (saldo, totales, signo)
      movements.types.ts   #   (sin *.schema.ts: no hay body que validar)
    health/
      health.routes.ts
    ingesta/               # lectura de archivos de banco desde Drive (drive-read)
      ingesta.routes.ts    #   GET /api/ingesta/pending + POST /api/ingesta/process
      ingesta.service.ts   #   detección + proceso (descarga tal cual, copia local, mover)
      ingesta.types.ts     #   tipos de la respuesta (DetectionResult, ProcessResult, ...)
    bankinter/             # parser del extracto .xlsx de Bankinter (bankinter-parser)
      bankinter.parser.ts  #   parser puro (buffer .xlsx -> movimientos + IBAN), sin BD/Drive
      bankinter.service.ts #   lee copias locales de la f5, parsea y vuelca JSON (read-only)
      bankinter.routes.ts  #   POST /api/parser/bankinter
      bankinter.types.ts   #   modelo (MovimientoParseado, BankinterParseResult, ...)
      bankinter.fixture.ts #   helper de test: genera .xlsx sintético en memoria (exceljs)
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
>
> Nota de la feature #8 "data-model" (2026-08-06): `modules/expenses/` **se
> borró** (era el placeholder del bootstrap) y lo sustituyen `accounts/`,
> `categories/` y `movements/`. `src/architecture.test.ts` guarda que la carpeta
> ya no exista, que las tres rutas nuevas no importen Prisma y que `movements`
> siga siendo de solo lectura.

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
  - **Subclases añadidas (feature #8 "data-model", 2026-08-06):**
    `ConflictError` (`CONFLICT`, 409) — el `iban` de una cuenta y la categoría
    raíz `(kind, name)` son únicos, y el `P2002` de Prisma se traduce a un 409
    claro en vez de escaparse como 500; y `MissingAccountDataError`
    (`MISSING_ACCOUNT_DATA`, **422**) — los metadatos de un extracto no bastan
    para crear la cuenta, distinguible de `VALIDATION_ERROR` (400, formato) y de
    `NOT_FOUND` (404) para que el frontend pueda ofrecer el alta manual
    exactamente en ese caso. `MISSING_ACCOUNT_DATA` queda **reservado** en el
    contrato (interno; lo devolverá la feature de importación). Ver ADR-011.

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

### ADR-009: Lectura de banco desde Drive (`drive-read`) — endpoints HTTP de ingesta, proceso archivo-a-archivo con volcado local gitignoreado

- **Fecha:** 2026-08-03
- **Estado:** aceptada (implementada en la feature #5)
- **Contexto:** la feature #5 hace la **primera lectura real** de archivos de banco
  desde Drive antes de escribir cualquier parser (feature 6): detectar pendientes,
  descargar el contenido **tal cual** (p. ej. el `.xlsx` de Bankinter), copiarlo a
  una carpeta local para inspeccionarlo, y marcar el original como procesado
  moviéndolo. Sin parsear y **sin base de datos**. El `intent` delegó: la forma de
  los endpoints, dónde se guardan las copias, si el proceso trata todos los
  archivos de una vez o uno a uno, y cómo listar/descargar reutilizando la
  feature 4 (`src/lib/drive-structure.ts`).
- **Decisión:**
  1. **Operaciones Drive nuevas en `lib/drive-structure.ts`** (contraparte
     `files.*`, ADR-008), todas read-only salvo la descarga: `listBankFolders`
     (registro dinámico de bancos = subcarpetas de la raíz), `listYearFolders`
     (solo carpetas con forma `^\d{4}$`), `listPendingFiles` (hijos no-carpeta del
     año, excluye `procesados/`) y `downloadFileContent` (`files.get` con
     `alt: 'media'` + `responseType: 'arraybuffer'` → `Buffer`, envuelto en
     `DriveConnectionError` sanitizado). El mover reutiliza `moveFileToProcessed`
     de la f4; el `procesados/` se resuelve con `ensureFolder` de la f4.
  2. **Se expone como endpoints HTTP** en `modules/ingesta/`:
     `GET /api/ingesta/pending` (detección) y `POST /api/ingesta/process`
     (proceso). **Sin auth nueva** (coherente con el contrato). A diferencia de la
     f4 (servicio interno, ADR-008 decisión 2), aquí sí hay superficie HTTP porque
     el `intent` pide explícitamente que el backend "me diga" los pendientes y que
     el proceso se dispare "cuando lo pida", y porque el frontend consumirá esta
     API en otra sesión.
  3. **Proceso archivo-a-archivo con aislamiento del fallo:** cada pendiente se
     descarga, se copia y **solo si la copia se escribió con éxito** se mueve a
     `procesados/`. Un fallo (lectura o copia) de un archivo se captura, se reporta
     en `failed[]` (su original **no** se mueve) y no detiene al resto; la
     respuesta sigue siendo 200. Solo un fallo de Drive de nivel superior (ni
     listar los bancos) sube como 503 `DRIVE_CONNECTION_ERROR`. Idempotencia
     observable: sin pendientes no hace nada ni duplica copias (el estado
     pendiente/procesado lo lleva Drive moviendo el archivo).
  4. **Volcado local gitignoreado:** las copias van a
     `var/drive-read/<banco>/<año>/<archivo>` (base **inyectable** para testear
     contra un tempdir; por defecto `process.cwd()/var/drive-read`). La carpeta
     está en `.gitignore` (privacidad crítica: datos bancarios reales **nunca** se
     versionan ni se suben). Un guardián en `architecture.test.ts` lo verifica.
  5. **Errores:** se **reutiliza** `DriveConnectionError` (503, ahora **sí**
     devuelto en el cuerpo por estos endpoints; ver `api-contract.md`). El
     mensaje sale sanitizado (los fallos de Drive pasan por `callDrive`; los de
     escritura local son rutas, no secretos). `UNKNOWN_BANK` **no** se emite: la
     ingesta descubre los bancos por carpeta, no los resuelve por nombre.
- **Alternativas consideradas:**
  - **Servicio interno sin endpoints (como la f4):** descartada — el `intent`
    pide una API que el backend expone y que el frontend consumirá; no había
    consumidor en la f4, sí lo hay aquí.
  - **Procesar todo el lote de forma atómica (todo-o-nada):** descartada — un
    archivo corrupto o un fallo de red puntual abortaría el lote entero y
    escondería los que sí se pudieron leer; el aislamiento por archivo entrega el
    máximo y reporta lo que falló, y converge en el siguiente disparo.
  - **Guardar las copias en BD o fuera del repo:** descartada — el objetivo es
    **ver** el formato crudo delante para diseñar el parser (f6); una carpeta del
    repo gitignoreada es lo más directo y no toca BD (fuera de scope).
  - **Prefijar el nombre local con el `fileId` para evitar colisiones:**
    descartada por ahora — perjudica la legibilidad que el humano quiere ("ver con
    qué formato llega cada banco") y las colisiones de nombre dentro de un mismo
    banco/año son improbables; anotado como límite conocido.
- **Consecuencias:**
  - **Sin variables de entorno ni dependencias nuevas.** El único parámetro nuevo
    (carpeta de volcado) es una ruta fija del repo, inyectable, no configurable por
    entorno; no cruza el umbral de ADR-006.
  - `DRIVE_CONNECTION_ERROR` deja de estar solo "reservado": es el primer código de
    Drive que un endpoint de dominio devuelve en el cuerpo.
  - **Límite conocido (paginación):** las listas usan `pageSize: 1000` sin seguir
    `nextPageToken` (igual que `listBankNames` de la f4). Suficiente para el uso
    previsto; revisitar si un año acumula >1000 pendientes.
  - **Límite conocido (colisión de nombre):** dos pendientes con el mismo nombre en
    el mismo `<banco>/<año>/` sobrescribirían la copia local; cada uno es un fichero
    distinto en Drive y se mueve igual, así que no se pierde el original.

### ADR-010: Parser de Bankinter — `exceljs` para leer `.xlsx`, parser puro en `modules/bankinter/`, volcado JSON local gitignoreado

- **Fecha:** 2026-08-04
- **Estado:** aceptada (implementada en la feature #6)
- **Contexto:** la feature #6 convierte el `.xlsx` de Bankinter (ya descargable en
  local por la f5) en movimientos estructurados + el IBAN de la cuenta, **sin
  base de datos, sin persistir, sin deduplicar y sin mover archivos**. El `intent`
  delegó: qué librería `.xlsx` usar, la forma final del modelo, cómo se dispara y
  dónde se vuelca el JSON, y cómo localizar la cabecera e interpretar fechas
  (dd/mm/yyyy) e importes (formato español).
- **Decisión:**
  1. **Librería `.xlsx`: `exceljs@^4.4.0`** (MIT, en npm). Lee desde `Buffer` y
     **escribe** libros en memoria, así los fixtures sintéticos de test se generan
     en código, sin datos reales ni red. Descartado SheetJS `xlsx`: su versión en
     npm está **congelada en 0.18.5** con CVEs sin parchear (prototype pollution,
     ReDoS); las corregidas solo están en su CDN, lo que rompería el flujo
     pnpm/lockfile. Coste asumido: árbol de deps más pesado (documentado en
     `docs/stack.md`).
  2. **Parser puro en `src/modules/bankinter/bankinter.parser.ts`**
     (`parseBankinterXlsx(buffer) → BankinterParseResult`): sin I/O, sin Drive, sin
     Prisma. Localiza la cabecera **por nombre de columna** (robusto al preámbulo),
     extrae el IBAN de la línea `MOVIMIENTOS DE LA CUENTA <IBAN>`, y mapea cada
     fila. `tipo` deriva del signo del importe. **No deduplica.** Las filas no
     interpretables van a `noReconocidas` (nº de fila + motivo) sin perderse; el
     resto se parsea igual. Lanza `ValidationError` solo ante fallo estructural (no
     hay cabecera reconocible).
  3. **Interpretación española:** fechas `dd/mm/yyyy` → ISO `YYYY-MM-DD`
     (validando fecha real); importes → number con signo. El importe se acepta
     tanto como **número nativo** (el export real lo guarda así) como **texto
     español** (`1.234,56` → `1234.56`), cubriendo ambas variantes.
  4. **Modelo (`bankinter.types.ts`), ajustado a las columnas REALES de Bankinter
     (confirmado por el humano el 2026-08-04):** `BankinterParseResult { banco,
     cuentaIban, movimientos[], noReconocidas[] }`, `MovimientoParseado {
     fechaContable, fechaValor (ISO), descripcion, importe (number con signo),
     saldo (number), divisa, tipo 'ingreso'|'gasto' }`, `FilaNoReconocida { fila,
     motivo }`. El extracto real trae `Fecha contable | Fecha valor | Descripción |
     Importe | Saldo | Divisa`; no existen columnas `Concepto` ni `Tipo de
     movimiento` (esos textos solo aparecen en el preámbulo como etiquetas de
     filtro). `importe` y `saldo` se aceptan como número nativo o texto español.
     Una fila con fecha, importe o saldo ilegible va a `noReconocidas`.
  5. **Exposición: endpoint read-only `POST /api/parser/bankinter`**
     (`modules/bankinter/bankinter.routes.ts`), coherente con la f5 y consumible
     por el frontend. Lee las **copias locales de la f5**
     (`var/drive-read/bankinter/<año>/*.xlsx`), parsea archivo a archivo (fallo
     aislado en `failed[]`) y **vuelca** cada resultado a
     `var/parsed/bankinter/<año>/<archivo>.json`. **No toca Drive, no persiste en
     BD, no mueve nada.** Contrato actualizado en `docs/api-contract.md`.
  6. **Privacidad:** `var/parsed/` está en `.gitignore` (misma política que la f5);
     ningún dato bancario real se versiona. Guardián en `architecture.test.ts`.
- **Alternativas consideradas:**
  - **SheetJS `xlsx`:** cero dependencias pero versión npm vulnerable y congelada;
    instalar desde el CDN rompe el lockfile versionado. Descartada por seguridad.
  - **`read-excel-file` (solo lectura, ligera):** no escribe `.xlsx`, así que
    habría que generar los fixtures por otra vía (OOXML a mano o binario
    versionado); exceljs mantiene todo en un solo paquete y en código.
  - **Servicio interno sin endpoint (como la f4):** descartada — el `intent` pide
    "ver el resultado" y el frontend lo consumirá; un endpoint encaja con la f5.
  - **Inventar columnas `Concepto`/`Tipo de movimiento` que el extracto no trae
    (o dividir `descripcion` heurísticamente):** descartada — inventaría datos. El
    modelo se ciñe a las columnas reales; el mapeo es **por nombre de cabecera**,
    robusto a la posición.
- **Consecuencias:**
  - **Una dependencia nueva** (`exceljs`), la primera con árbol transitivo grande;
    anotada en `docs/stack.md`. **Sin variables de entorno nuevas.**
  - **Modelo alineado con el formato real:** durante la implementación se verificó
    sobre el `.xlsx` real (OOXML) que la tabla es `Fecha contable | Fecha valor |
    Descripción | Importe | Saldo | Divisa` y que el importe llega como número
    nativo. El humano confirmó (2026-08-04) el modelo a esas columnas: se
    descartaron `concepto`/`tipoMovimiento` y se añadieron `saldo` y `divisa`.
  - `var/parsed/` es el segundo directorio gitignoreado de datos bancarios (tras
    `var/drive-read/` de la f5). La persistencia en BD y la deduplicación quedan
    explícitamente **fuera** de esta feature (features futuras).

### ADR-011: Modelo de datos del flujo — `Account`/`Category`/`Movement`, saldo leído del extracto, importe 0 = `neutral`, índices personalizados por SQL crudo, reemplazo del `Expense`

- **Fecha:** 2026-08-06
- **Estado:** aceptada (implementada en la feature #8; el spec pasó por cuatro
  correcciones humanas en la puerta de aprobación)
- **Contexto:** la feature #8 fija la **base de datos real del flujo** según
  `docs/data-model.md` + el `intent`: cuentas bancarias (sin efectivo),
  movimientos alineados con el parser (features 6/7) y categorías jerárquicas.
  Hasta ahora solo existía el `Expense` + `Category` placeholder del bootstrap.
  El `intent` delegó cinco decisiones: materialización en Prisma/Postgres
  (tipos, enums, **índices**), ubicación y límite del servicio de auto-alta de
  cuenta, tratamiento del **importe 0**, cómo reemplazar el `Expense`, y qué
  **endpoints mínimos** expone la feature.
- **Decisión:**
  1. **Esquema** `Account` / `Category` / `Movement` + 6 enums, todo en inglés y
     alineado con el parser (`bookingDate`, `valueDate`, `description`, `amount`,
     `balanceAfter`, `currency`, `iban`). `AccountType` **sin `cash`** (no hay
     cuenta de efectivo: el efectivo se ve en la retirada de cajero, que ya es una
     línea del extracto). `Account.iban` **obligatorio y único**: es la clave
     natural del find-or-create.
  2. **`amount` siempre positivo; el signo lo da `type`, y `type` es inmutable**
     (es lo que reportó el banco). Un **traspaso no se crea**: son **dos
     movimientos ordinarios** que ya llegan de los extractos (un `expense` en
     origen y un `income` en destino) enlazados por un `transferId` compartido.
     **No hay endpoint de traspasos**, ni valor `MovementType.transfer`, ni enum
     `MovementDirection`. La única regla propia es de agregación: los totales
     globales excluyen `transferId != null` (y los `neutral`).
  3. **El saldo de la cuenta se LEE del extracto**, no se recalcula: es el
     `balanceAfter` del movimiento más reciente (`bookingDate DESC, daySequence
     DESC`). La suma desde `initialBalance` queda como **caso excepcional** (un
     banco sin saldo corrido, o una cuenta sin nada importado).
  4. **Columna `daySequence`** (posición dentro del `bookingDate`, `1` = el
     primero del día): fija el orden intradía y **entra en la clave del índice de
     dedup**. Se guarda la posición del día, no el número de línea del fichero,
     porque ese número no es estable entre descargas.
  5. **Los movimientos solo entran por importación:** `/api/movements` es de
     **solo lectura** (`GET /`), sin alta ni borrado manual, y `Movement` nace
     `origin=imported` / `status=pending_review`. Las **categorías** sí se dan de
     alta a mano (`POST /api/categories`): el banco no manda categorías, el
     catálogo solo puede definirlo el usuario; lo automático será **asignarlas**.
  6. **Importe 0 → tipo `neutral`** (ni ingreso ni gasto), con el helper de
     dominio `deriveMovementTypeFromAmount` (`<0 expense`, `>0 income`,
     `=0 neutral`).
  7. **Dedup de importados = índice ÚNICO PARCIAL** `(accountId, bookingDate,
     type, amount, description, daySequence) WHERE origin='imported'`, creado con
     **SQL crudo** en la migración (Prisma 7 no lo declara; Prisma 8 sí con
     `@@index(where:, unique:)`), **sin** columna `importHash`.
  8. **Unicidad de categoría raíz con `NULLS NOT DISTINCT`** (Postgres 17),
     también por SQL crudo, re-creando el índice de Prisma con el mismo nombre y
     las mismas columnas.
  9. **Servicio reutilizable `findOrCreateAccountFromMetadata`** (find-or-create
     por IBAN; datos suficientes = **IBAN + banco**; defaults `alias` derivado /
     `type checking` / `initialBalance 0`; devuelve `{account, created,
     appliedDefaults}`) con el error **`MissingAccountDataError`** (422). **Sin
     endpoint ni disparo desde Drive**: eso es la feature de importación.
  10. **Reemplazo del `Expense`:** se borra el módulo `modules/expenses/`, su
      registro en `app.ts` y las tablas viejas en la migración (**DROP + CREATE**,
      no `ALTER`). `/api/expenses*` responde 404. **Breaking change** anotado en
      `docs/api-contract.md`.
- **Alternativas consideradas:**
  - **Recalcular el saldo sumando movimientos** teniendo el `balanceAfter` del
    banco: descartada por el humano — es recalcular algo que ya nos dan y
    arriesgarse a divergir de ello.
  - **Fiar el orden intradía al `id` autoincremental:** descartada — obligaría al
    importer a insertar invirtiendo el array y se rompe al importar un extracto
    antiguo después de uno reciente.
  - **Guardar el número de línea del fichero** en vez de la posición dentro del
    día: descartada — no es estable entre descargas.
  - **Clave de dedup sin `daySequence`:** descartada — un extracto real trae
    líneas idénticas legítimas (tres `TRANS INM/ Openbank −1000,00` el mismo día
    en la muestra), y se habrían perdido dos en silencio (−2.000 €).
  - **Columna `importHash`** (la del borrador de `data-model.md`): descartada —
    abre la sub-decisión de la receta del hash y la normalización del concepto; el
    índice compuesto da la misma garantía con la clave visible y auditable.
  - **Crear los traspasos por API** (`POST /transfer` con dos piernas nuevas):
    descartada por el humano — duplicaría lo que ya llega del banco (4 filas por
    traspaso). Y **marcarlos mutando el `type` a `transfer`**: rompería la clave
    del índice de dedup y con ella la protección contra reimportaciones.
  - **Mantener el alta y el borrado manual de movimientos:** descartada por el
    humano — obligaría a cuadrar el saldo a mano contra el banco.
  - **Dos índices parciales / un centinela `parentId = 0`** para la unicidad de
    raíz: descartadas (dos objetos donde basta uno; valor mágico en el modelo).
  - **Dejar el importe 0 como `income`:** descartada — arrastra un dato incorrecto
    que el `intent` quiere corregir.
  - **Disparar el auto-alta de cuenta con un endpoint en esta feature:**
    descartada — el consumidor real es la importación (feature siguiente).
  - **`ALTER` de `Category` en vez de DROP+CREATE:** descartada — la vieja y la
    nueva tienen forma incompatible y ambas tablas eran placeholder sin datos.
- **Consecuencias:**
  - **Breaking change** en `/api/expenses` (404) y en el modelo `Category`; aún no
    consumido por el frontend.
  - **Dos errores de dominio nuevos** (`ConflictError` 409,
    `MissingAccountDataError` 422, ver ADR-005); `MISSING_ACCOUNT_DATA` queda
    **reservado** en el contrato, mismo patrón que `UNKNOWN_BANK` en la feature 4.
  - **Dos índices fuera del schema** (dedup parcial y `NULLS NOT DISTINCT`), solo
    en el archivo de migración. `prisma migrate dev` no reporta drift (el shadow DB
    replica la migración), pero **no** deben declararse en el schema.
  - **Límite conocido:** un día del extracto **partido** entre dos descargas
    reempieza en `daySequence = 1` y produciría un duplicado. Se evita descargando
    por días completos; es un duplicado **visible**, no una pérdida silenciosa.
  - **Columnas reservadas sin escritor** (`transferId`, `categoryId`,
    `paymentMethod`, `note`): son el cimiento de las features siguientes
    (importación, categorización por reglas, detección de traspasos). Mientras
    tanto, un traspaso interno **cuenta** en los totales globales: asumido, porque
    todavía no hay dashboards que los consuman.
  - **Sin dependencias nuevas y sin variables de entorno nuevas** (todo con
    Prisma/Postgres ya presentes): `docs/stack.md` no cambia.

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
