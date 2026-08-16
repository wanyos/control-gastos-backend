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
    parsed-statement.ts  #   CONTRATO de salida de todo parser de banco (ADR-013)
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
    ingestion/             # lectura de archivos de banco desde Drive (drive-read)
      ingestion.routes.ts  #   GET /api/ingestion/pending + POST /api/ingestion/process
      ingestion.service.ts #   detección + descarga tal cual + copia local (NO mueve, ADR-015)
      ingestion.types.ts   #   tipos de la respuesta (DetectionResult, ProcessResult, ...)
    import/                # el importador: Drive -> parser -> base de datos (ADR-015)
      import.routes.ts     #   POST /api/import
      import.service.ts    #   recorrido, mapeo, dedup y movimiento a procesados/
      import.types.ts      #   BankParserAdapter (registro inyectado) + informe por fichero
    bankinter/             # parser del extracto .xlsx de Bankinter (bankinter-parser)
      bankinter.parser.ts  #   parser puro (buffer .xlsx -> movimientos + IBAN), sin BD/Drive
      bankinter.service.ts #   lee copias locales de la f5, parsea y vuelca JSON (read-only)
      bankinter.routes.ts  #   POST /api/parser/bankinter
      bankinter.types.ts   #   SOLO lo suyo: BankinterParseResult = ParsedStatement<'bankinter'>
                           #   + resúmenes de su ejecución local (ADR-013)
      bankinter.fixture.ts #   helper de test: genera .xlsx sintético en memoria (exceljs)
    myinvestor/            # las DOS entradas de MyInvestor: extracto .csv + productos .json
      myinvestor.format.ts #   números y fechas de ESTE banco (compartido solo dentro)
      myinvestor.statement.parser.ts # parser puro (buffer .csv -> movimientos), sin BD/Drive
      myinvestor.product.parser.ts   # parser puro de UN .json de producto escrito a mano,
                           #   sin BD/Drive y sin usar el normalizador del .csv (ADR-016)
      myinvestor.service.ts #  lee copias locales de la f5, encamina por extensión y vuelca
                           #   JSON: uno por extracto + un products.json por año (read-only)
      myinvestor.routes.ts #   POST /api/parser/myinvestor (un solo disparo, las dos entradas)
      myinvestor.types.ts  #   SOLO lo suyo: MyinvestorStatementResult =
                           #   ParsedStatement<'myinvestor'> + los tipos de producto
                           #   (ParsedProduct, ParsedValuation, ...) + resúmenes (ADR-014/016)
      myinvestor.fixture.ts #  helper de test: CSV y JSON de producto sintéticos en memoria
    investments/           # inversiones: productos y su valoración (ADR-012)
      investments.model.test.ts  # CARPETA PARCIAL a propósito: la f9 es esquema +
                                 #   migración, sin superficie HTTP (precedente:
                                 #   health/). La completará la feature de
                                 #   importación con su *.service.ts, y más
                                 #   adelante las rutas de patrimonio.
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
- **Estado:** aceptada (implementada en la feature #5), **retocada por ADR-015**
  (F12, 2026-08-12) en dos puntos: el módulo y sus rutas se llaman ahora
  `ingestion` / `/api/ingestion/*` (las españolas responden 404) y
  `POST /api/ingestion/process` **ya no mueve** el fichero a `procesados/` —mover
  es consecuencia de guardar, y guardar es del importador—. Todo lo demás de este
  ADR sigue vigente: descubrimiento dinámico, proceso archivo a archivo,
  aislamiento del fallo, volcado local gitignoreado e idempotencia.
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
    líneas idénticas legítimas (tres `TRANS INM/ OTRO BANCO −850,00` el mismo día
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

### ADR-012: Modelo de datos de inversiones — un `InvestmentProduct` único con la parte del depósito en columnas nullable, `Valuation` como serie, `invested` en la foto, clave natural `(bank, name)`, recarga por UPSERT y cero SQL crudo

- **Fecha:** 2026-08-11
- **Estado:** aceptada (implementada en la feature #9; las dos decisiones marcadas
  en rojo se confirmaron **tal cual** en la puerta de aprobación humana)
- **Contexto:** la feature #9 llena el hueco que la feature 8 dejó reservado a
  propósito en `docs/data-model.md` ("idea #3, patrimonio e inversiones, se añade
  encima sin tocar lo anterior"). Hay **un** banco de inversión con varios fondos,
  un ETF, varios depósitos y una cartera automatizada, más una cuenta corriente
  que ya encaja tal cual en el modelo del flujo. Lo que se quiere saber es
  deliberadamente simple: cuánto he metido, cuánto vale hoy y cuánto gano o
  pierdo. **Alcance: solo esquema + migración**, igual que la feature 8. **Premisa
  clave:** los productos no vendrán de un export del banco sino de un **fichero de
  texto escrito a mano** por el humano → **el fichero se hace a medida del modelo,
  no al revés**. El `intent` delegó cinco decisiones: materialización en Prisma
  (tipos, enum, precisión decimal, índices), las claves naturales y la resolución
  del recargado, cómo se vigila que un depósito no tenga valoraciones, si
  `marketValue` incluye el efectivo sin invertir, y dónde se documenta todo.
- **Decisión:**
  1. **Un solo modelo `InvestmentProduct`** con lo común (`bank`, `name`, `type`,
     `currency`, `openedAt`, `closedAt`) y la parte específica del depósito
     (`principal`, `interestRate`, `expectedGain`, `maturityDate`) como **columnas
     nullable de la misma tabla**. **Sin tabla por tipo.** `fund`, `etf` y
     `managed_portfolio` son tres valores del enum con **campos idénticos**; la
     cartera automatizada es **un** producto con su valor total, **sin desglose**.
     `bank` es un `String` con el slug de la carpeta de Drive, mismo criterio que
     `Account.bank` (sin FK ni tabla de bancos: el registro de bancos vive en
     Drive, ADR-008, y duplicarlo en BD sería una segunda fuente de verdad).
  2. **`Valuation` es la foto periódica** de un producto que fluctúa, con
     `invested`, `marketValue`, `gain`, `gainPercent` y `uninvestedCash`.
     **`invested` vive en la foto, no en el producto**, porque crece con las
     aportaciones mensuales: ponerlo en el producto obligaría a pisarlo cada mes y
     perdería la serie. **`principal` sí va en el producto**: se contrata una vez y
     no fluctúa; por eso un depósito **no** tiene valoraciones.
  3. **Regla 4 — la valoración se lee, no se calcula.** Los cinco números se
     guardan tal como vienen; **nunca** se persiste `gain = marketValue −
     invested`; campo ausente → `NULL`, jamás un valor calculado.
  4. **Regla 5 — una aportación no se crea, se marca.** La aportación ya es un
     `Movement` del extracto; lo único propio es `Movement.productId` (nullable,
     indexado, **reservado sin escritor**). Regla de agregación gemela a la del
     traspaso: **un movimiento con `productId != null` no cuenta como gasto ni como
     ingreso** en los totales globales. Un reembolso es `income` + `productId`, sin
     columna nueva. En esta feature la regla se **documenta**; su implementación en
     `computeTotals` llega con el escritor de la columna.
  5. **Claves naturales:** `@@unique([bank, name])` para el producto (basta porque
     el nombre lo escribe el humano, luego es estable → caen `isin` y la segunda
     clave compuesta) y `@@unique([productId, date])` para la foto.
  6. **Recargar el mismo fichero es un UPSERT** sobre `(productId, date)`: gana el
     último, `updatedAt` avanza. Es una resolución de conflicto **distinta** a la
     del flujo, donde un duplicado importado se **descarta**. 📌 Como cada fichero
     mensual **re-afirma** las condiciones de todos los productos, el futuro
     importador tendrá que hacer **UPSERT también del producto** sobre
     `@@unique([bank, name])`, no un `create`: **dos upserts, no uno**.
  7. **Cero SQL crudo:** los tres índices son declarativos, así que Prisma los
     conoce y **no puede haber drift** — a diferencia de la feature 8, que arrastra
     ese riesgo con sus dos índices escritos a mano (parcial y `NULLS NOT
     DISTINCT`, que Prisma 7 no expresa).
  8. **Sin `origin` ni `status` en `Valuation`** (sus dos razones de ser en
     `Movement` —mantener PARCIAL el índice de dedup y alimentar la pantalla de
     revisión— no existen aquí) y **solo `closedAt` en el producto**, sin enum
     `status` (un booleano derivable duplicado acaba desincronizado y además
     perdería **cuándo** se cerró). Su escritor lo aporta el importador del
     fichero: el humano escribe `closedAt` **una sola vez**, en la última aparición
     del producto, y **dejar de escribir un producto NO lo cierra** — un olvido es
     indistinguible de un cierre, y convertir una ausencia en un hecho es la
     inferencia que no debe hacer un sistema con dinero dentro. `openedAt`, en
     cambio, **se queda `NULL`**: el formato del fichero no lo lleva.
  9. 🔴 **Un depósito no tiene valoraciones = regla del SERVICIO**, no restricción
     de BD (**confirmado por el humano en la puerta, 2026-08-11**): coherente con
     las demás reglas de negocio del proyecto, mantiene el cero SQL crudo, y un
     `CHECK` **no puede consultar otra tabla** (haría falta un trigger o
     desnormalizar el `type` en `Valuation`). Coste asumido y explícito: hoy nada
     impide insertar una `Valuation` sobre un `deposit`; el test lo deja escrito
     como **límite conocido** y se pondría rojo si alguien añadiera un `CHECK` en
     silencio.
  10. 🔴 **Precisión** (**confirmada por el humano en la puerta, 2026-08-11**):
      `Decimal(10,2)` para todos los importes (**heredado del flujo**; si se sube
      el techo, se sube en las dos capas a la vez), `Decimal(6,4)` para
      `interestRate` (**TAE EN PORCENTAJE**: `2.7500` = 2,75 %) y `Decimal(7,4)`
      para `gainPercent` (con signo, hasta ±999,9999 %). Un depósito guarda **una
      sola** TAE y **un solo** `expectedGain`: los **aplicados**; si el banco
      publica una segunda TAE hipotética (p. ej. "sin Premium"), **no se guarda** —
      es información comercial, no una condición del producto contratado.
      **`gain` y `gainPercent` se quedan `NULL`-ables en la BD** aunque el fichero
      los exija: la restricción vive donde puede dar un mensaje útil (el parser
      dice qué producto y qué campo falta; una columna `NOT NULL` solo daría un
      `P2011`), y es un seguro sin coste ante un cambio futuro del formato.
  11. ✅ **`marketValue` NO incluye `uninvestedCash`** (la suposición que el
      `intent` pidió dejar visible; confirmada por el humano y por la aritmética de
      las muestras reales: en la cartera, `8.250,45 + 1.250,15 = 9.500,60`,
      exactamente el valor de mercado, con los `75,25 €` de efectivo fuera —
      **cifras inventadas** desde la F14, la relación es la observada). El
      patrimonio de un producto es **`marketValue + uninvestedCash`**, sin doble
      conteo. Era el único punto capaz de dar un patrimonio equivocado.
  12. **Sin endpoints, sin parser, sin importador y sin servicio:** el módulo
      `src/modules/investments/` recibe de esta feature **únicamente** su test
      (`investments.model.test.ts`), verificado sobre el diff y **no** por un
      guardián de árbol: el módulo está **diseñado para crecer** (el servicio del
      importador y, después, las rutas de patrimonio), así que congelar su
      contenido sería incorrecto por construcción. `docs/api-contract.md` anota que
      la capa de inversiones todavía no expone superficie HTTP.
  13. 📌 **Dos hechos del extracto del banco de inversión que afectan al saldo del
      flujo** (sin cambio de esquema): (a) ese banco **no da saldo por
      movimiento**, así que `Movement.balanceAfter` será siempre `NULL` para esa
      cuenta y la rama "sumar desde `initialBalance`" que ADR-011 decisión 3
      describió como **caso excepcional** pasa a ser el **camino normal** —
      `computeAccountBalance` ya lo soporta sin tocar código, pero
      **`Account.initialBalance` deja de ser decorativo: es el único ancla del
      saldo de esa cuenta**; y (b) tampoco trae **IBAN**, así que
      `findOrCreateAccountFromMetadata` devolverá `MISSING_ACCOUNT_DATA` (422) y
      esa cuenta habrá que darla de alta **a mano** — que es exactamente el camino
      previsto por ADR-011 decisión 9 y ADR-005 para este caso.
- **Alternativas consideradas:**
  - **Modelar los productos como `Account` y las valoraciones como `Movement`:**
    descartada — es la más tentadora y la peor. **Contaminaría el flujo en vez de
    construir encima**: un producto no tiene IBAN (clave natural obligatoria y
    única de `Account`), una valoración no tiene fecha valor ni descripción ni
    saldo corrido, y meterlas en `Movement` las arrastraría al índice de dedup, a
    los totales globales y al cálculo del saldo.
  - **Una tabla por tipo de producto** (`Fund`, `Etf`, `Deposit`, …): descartada
    por el humano en el `que_no_quiero`. Multiplicaría por cuatro las consultas de
    patrimonio para tres tipos con **campos idénticos**, y obligaría a un `UNION` o
    a herencia simulada.
  - **Autorreferencia `parentId` para desglosar la cartera automatizada:**
    descartada por el humano ("la quiero como un producto con su valor total").
    Añadiría un nivel de agregación que nadie va a consultar y obligaría a decidir
    si el padre suma o duplica a los hijos.
  - **Guardar la última valoración como columnas del producto** (`lastValue`,
    `lastGain`…): descartada — **perdería la serie**, que es justo lo que el humano
    pide conservar, y haría imposible distinguir "subió porque metí dinero" de
    "subió porque el mercado subió".
  - **Derivar `gain`** (restando `marketValue − invested` o sumando los `Movement`
    enlazados por `productId`): descartada — el `que_no_quiero` lo prohíbe y la
    suma de movimientos **no es** el capital invertido (le faltan aportaciones
    anteriores a la primera importación, movimientos internos del banco de
    inversión y comisiones).
  - **`isin` y segunda clave `(bank, name, maturityDate)`:** descartadas —
    resuelven la amenaza de que un **banco** renombre un producto, y aquí el nombre
    lo escribe el humano en su propio fichero.
  - **`CHECK` (o trigger) para impedir valoraciones de un depósito:** descartada —
    rompería el cero SQL crudo y un `CHECK` no puede consultar otra tabla.
  - **`units` / `unitPrice` (participaciones y valor liquidativo) y `alias`:**
    descartadas por el humano — nivel de detalle que no quiere y que complicaría el
    fichero manual.
  - **Versionar las fotos de la misma fecha** en vez de sobrescribir: descartada —
    el humano pidió "que gane el último"; multiplicaría filas y obligaría a filtrar
    "la última" en cada consulta.
  - **Guardar las dos TAE del depósito** (la aplicada y la hipotética): descartada
    — duplicaría el ancho del depósito para responder una pregunta que nadie hace y
    ataría el modelo a la mecánica comercial de **un** banco concreto.
- **Consecuencias:**
  - **Todo aditivo:** ninguna columna, índice o enum del flujo se modifica; la
    única línea que lo toca es `Movement.productId`. La suite del flujo
    (`accounts`, `categories`, `movements`) pasa **sin cambios en sus archivos**.
  - **Cero SQL crudo y cero riesgo de drift** en esta capa (contraste explícito con
    ADR-011).
  - **Sin dependencias ni variables de entorno nuevas** → `docs/stack.md` no
    cambia. **Sin endpoints** → `docs/api-contract.md` solo gana una nota.
  - **Columnas reservadas sin escritor:** `Movement.productId` (lo escribirá el
    enlace de aportaciones), `InvestmentProduct.closedAt` (lo escribirá el
    importador del fichero) y `openedAt` (sin escritor previsto: se queda `NULL`).
    Hasta que `productId` se rellene, una aportación a un fondo **cuenta como
    gasto** en los totales globales (asumido: no hay dashboards todavía, mismo
    trade-off que `transferId` en ADR-011).
  - **Divergencia consciente con ADR-011:** allí `transferId` nació sin escritor
    **pero** `computeTotals` ya lo excluía. Aquí el alcance congela los servicios
    del flujo, así que la exclusión de `productId` se implementará **con** su
    escritor. Efecto práctico hoy: **cero**, porque `productId` es siempre `null`.
  - **Contrato con el futuro importador:** **dos upserts**, el del producto sobre
    `(bank, name)` y el de la foto sobre `(productId, date)`.
  - **Límite conocido:** la BD **no** impide una valoración sobre un depósito
    (regla de servicio, sin servicio todavía).
  - **Límite conocido:** renombrar un producto en el fichero crea un producto nuevo
    y deja la serie anterior colgando del nombre viejo (precio de la clave
    natural).
  - **Si algún día se quiere el detalle** (participaciones, valor liquidativo,
    ISIN, desglose de la cartera), todo son **columnas nullable añadidas después**:
    un `ADD COLUMN` barato, sin migrar datos.

### ADR-013: Contrato común de movimiento parseado — un módulo compartido en `lib/parsed-statement.ts`, el dato ausente es `null`, `daySequence` lo emite cada parser y el importe 0 pasa a `neutral`

- **Fecha:** 2026-08-11
- **Estado:** aceptada (implementada en la feature #11, sin SDD)
- **Contexto:** con dos bancos ya había **tres** copias del mismo tipo y una
  divergencia silenciosa: `ParsedMovement` vivía **dentro** de
  [`src/modules/bankinter/`](../src/modules/bankinter/bankinter.types.ts) con
  `type: 'income'|'expense'`, la spec de la F10 lo re-declaraba con `neutral`, y la
  versión correcta de 3 vías existía desde la F8 en
  [`movements.service.ts:33`](../src/modules/movements/movements.service.ts#L33).
  El `intent` (cerrado por el humano el 2026-08-11) confirmó dos puntos con
  consecuencia —**el importe 0 pasa a `neutral` en esta feature** y **`daySequence`
  lo emite cada parser**— y delegó cuatro decisiones: dónde vive el módulo
  compartido y cómo se llama, cómo se representa un dato que **no viene** en el
  fichero, cómo se propaga el cambio sin tocar más comportamiento, y si el contrato
  debe incluir ya algo más que necesite el importador.
- **Decisión:**
  1. **Ubicación y nombre: [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts).**
     Es la carpeta transversal que la regla de este documento reserva a lo que
     "lo usan todos y no es de nadie"; `modules/` está reservado a **recursos**, y
     el contrato no es un recurso ni tiene rutas. Declara `ParsedMovementType`,
     `ParsedMovement`, `UnparsedRow`, `ParsedStatement<Bank>`, `ParsedMovementDraft`,
     `StatementOrder` y el helper `assignDaySequence`. **No importa nada**
     (guardián en `architecture.test.ts`): sin Prisma, sin `exceljs`, sin módulo de
     banco.
  2. **El dato ausente es `null`, nunca `0` ni `''`:** `balance: number | null` y
     `accountIban: string | null`. Es la representación que ya usa la BD
     (`Movement.balanceAfter` nullable) y la que la F10 propone para MyInvestor, que
     **no trae ninguno de los dos**. Consecuencia inmediata: Bankinter deja de
     devolver `accountIban: ''` cuando el preámbulo no trae IBAN y devuelve `null`;
     en el JSON volcado la clave sigue presente, así que "no viene en el fichero" es
     **visible** para quien lo lea.
  3. **`daySequence` en el contrato, calculado por el helper compartido
     `assignDaySequence(drafts, fileOrder)`.** `1` es **el movimiento más antiguo
     de ese `bookingDate`** y el número crece hacia el más reciente del mismo día
     (no es el orden de aparición en el fichero). Lo único que aporta el banco es
     el argumento que dice cómo exporta (`'newest-first'` para Bankinter,
     verificado con los saldos de la muestra real). Numerar **no es leer el
     formato**, así que compartirlo no rompe la norma «un parser por banco»; lo
     que sí la rompería es que el importador lo calculara, porque el importador
     sería bank-specific.
  4. **La regla del signo se importa, no se copia:** el parser llama a
     [`deriveMovementTypeFromAmount`](../src/modules/movements/movements.service.ts#L33)
     de la F8. Con ello el **importe 0 pasa de `income` a `neutral`** — el **único**
     cambio de comportamiento de la feature, y el cabo suelto #2 del roadmap.
  5. **El contrato NO gana nada más para el importador.** Repasada la tabla de
     mapeo de `specs/data-model/design.md` §9, el importador ya tiene todo lo que
     necesita (`bookingDate`, `valueDate`, `description`, `amount`, `balance`,
     `currency`, `daySequence`, `accountIban`, `bank`); el resto (`origin`,
     `status`, `transferId`, `accountId`) lo pone **él**, y meterlo aquí convertiría
     el contrato en el modelo de la BD, que es justo lo que el `intent` prohíbe.
- **Alternativas consideradas:**
  - **Renombrar `balance` → `balanceAfter`** para que el mapeo al `Movement` sea
    literal: descartada — el criterio de no-regresión de la feature pide que, salvo
    el importe 0, el mismo `.xlsx` produzca lo mismo que antes, y un renombrado es
    un segundo cambio de forma no pedido. El mapeo queda documentado en la tabla
    (una línea), y `balance` es el nombre que ya publica `api-contract.md` desde la
    F7. **Anotado como sugerencia fuera de scope** para quien escriba el importador.
  - **Campo de statement `providesBalance: false`** (lo que propone hoy la spec de
    la F10): descartada — `balance: null` por línea ya dice que ese dato no viene, y
    una constante por banco duplica ese conocimiento y hay que mantener los dos
    coherentes. La F10 se re-espeficará contra esta decisión.
  - **Dejar el contrato en `src/modules/shared/` o en un `src/contracts/` nuevo:**
    descartadas — `modules/` es "un directorio por recurso" (ADR-004) y un
    `modules/shared` es exactamente el cajón de sastre que la norma evita; una
    quinta carpeta transversal para un archivo no compensa frente a `lib/`, que ya
    aloja piezas de dominio-infraestructura como `drive-structure.ts`.
  - **Mover `deriveMovementTypeFromAmount` al módulo compartido** para que el parser
    no dependa de `modules/movements/`: descartada — el `acceptance` nombra el
    helper **en su ubicación actual**, y moverlo obligaría a cambiar el tipo de
    retorno (hoy es el `MovementType` de Prisma, que es lo que garantiza que parser
    y BD no puedan divergir).
- **Consecuencias:**
  - **Breaking change en el JSON del parser** (`var/parsed/**` y por tanto el
    resultado de `POST /api/parser/bankinter`): `accountIban` puede ser `null`,
    cada movimiento gana `daySequence` y un importe 0 sale `neutral`. **Aún no
    consumido por el frontend**; anotado en `docs/api-contract.md`.
  - **`bankinter.parser.ts` importa ahora `modules/movements/movements.service.ts`**
    y, por transitividad, el cliente de Prisma. El parser sigue **sin tocar la BD**
    (el guardián "no prisma reference" del módulo sigue verde) y el helper es una
    función pura de un número; el coste es una dependencia de carga, no de datos.
    Alternativa si algún día molesta: mover el helper al contrato (ver arriba).
  - **Tres guardianes nuevos** en `src/architecture.test.ts`: una sola declaración
    de los tipos del contrato en todo `src/`, el contrato sin BD ni imports, y todo
    `*.parser.ts` usando el helper del signo sin reimplementar la regla. Un tercer
    banco que copie los tipos pone la suite en rojo.
  - 📌 **Supuesto que la F12 (importación) tiene que conocer: `daySequence` numera
    solo los movimientos PARSEADOS.** Una fila que acabó en `unparsedRows` no
    consume número, así que la secuencia de un día es siempre
    `1..movimientos-de-ese-día` y no tiene huecos. Consecuencia: si esa fila se
    recupera después (parser corregido, nueva descarga), ese día **se renumera** y
    los números ya guardados de ese día dejan de coincidir — es el mismo tipo de
    límite que el "día partido entre dos descargas" de ADR-011, y produce un
    duplicado **visible**, no una pérdida silenciosa. Escrito también en el
    contrato, junto al campo
    ([`parsed-statement.ts`](../src/lib/parsed-statement.ts)), que es donde lo
    va a leer quien implemente la importación.
  - **La spec de la F10 (MyInvestor) queda desalineada a propósito** en tres puntos
    (`MyinvestorMovement` propio, `balanceAfter` en vez de `balance`,
    `providesBalance`): se re-espeficará contra este contrato antes de implementarse,
    que es el orden acordado (F11 → F10).
  - **Sin dependencias, sin variables de entorno y sin tocar Prisma ni la BD.**

### ADR-014: Parser del extracto de MyInvestor — módulo por banco, CSV leído sin librería, sin saldo y sin IBAN

- **Fecha:** 2026-08-11
- **Estado:** aceptada (implementada en la feature #10, spec re-especificado contra
  el contrato de la F11 y **cortado** en dos: los archivos JSON de producto son la
  F13 `myinvestor-products`), **ampliada por ADR-015** (F12, 2026-08-12): el título
  dice «sin IBAN» y ya no es exacto —el humano escribe una línea de preámbulo
  `iban;ES…` **una sola vez** y el parser la lee—. Lo que **no** ha cambiado: el
  IBAN se lee **solo** de esa línea etiquetada y **nunca** se infiere de un concepto
  con forma de IBAN. Ese test de la F10 sigue en verde sin tocarlo.
- **Contexto:** **segundo banco del repo con parser propio** y primero con **varias
  entradas** (la segunda, los archivos de producto, la trae la F13). La norma
  «Parsers de banco» de `docs/conventions.md` ya fija el módulo por banco y, desde
  el 2026-08-11, **una única forma de salida** (ADR-013). De las decisiones que el
  `intent` delegó, este ADR resuelve las del extracto: banco por carpeta o por
  contenido, taxonomía de errores del servicio, disparo y volcado, y dependencias.
  **Premisa que lo condiciona todo:** el extracto lo **genera el banco** y hay que
  aceptarlo como viene (fechas `dd/mm/aaaa`, separador de miles a medias, ninguna
  columna de saldo). No hay formato que elegir.
- **Decisión:**
  1. **Módulo [`src/modules/myinvestor/`](../src/modules/myinvestor/myinvestor.statement.parser.ts)**
     (slug de [`normalizeBankName`](../src/lib/drive-structure.ts#L66)), con su
     parser puro del extracto, su servicio, su ruta y un normalizador de números y
     fechas compartido **solo dentro del banco**
     ([`myinvestor.format.ts`](../src/modules/myinvestor/myinvestor.format.ts)),
     que la F13 reutilizará y ampliará. Disjunto de `src/modules/investments/`
     (feature 9). **El módulo no declara la forma de un movimiento parseado:
     consume el contrato de ADR-013** y solo declara
     [`MyinvestorStatementResult = ParsedStatement<'myinvestor'>`](../src/modules/myinvestor/myinvestor.types.ts#L19)
     y los resúmenes de su ejecución local.
  2. **El extracto se lee como texto delimitado por `;`, decodificado
     explícitamente como UTF-8** (con BOM tolerado), con la **cabecera localizada
     por nombre** de columna (insensible a mayúsculas/acentos, y con **prefijo
     ASCII** `fecha de operaci` para la única columna acentuada, que así sobrevive a
     un acento corrompido) y **no por posición**.
  3. **Este banco no da saldo ni IBAN.** Cada movimiento sale con `balance: null` y
     el resultado con `accountIban: null`, que es la representación que ADR-013 fija
     para "no viene en el fichero". **Sin campo `providesBalance`** (ADR-013 lo
     descartó: duplicaría el mismo hecho). **El parser no inventa ni calcula el
     saldo**, ni siquiera en una variable local. Consecuencia para la importación:
     la rama de ADR-011 que suma desde `Account.initialBalance` —pensada como
     excepcional— es el **camino normal** de esta cuenta, y la cuenta habrá que
     **crearla a mano** (sin IBAN, `findOrCreateAccountFromMetadata` devuelve
     `MISSING_ACCOUNT_DATA`).
  4. **Una única regla de números para todo el banco**
     ([`parseAmountText`](../src/modules/myinvestor/myinvestor.format.ts#L28)): con
     coma → decimal español; sin coma y con puntos cada tres dígitos → miles; en
     otro caso, punto decimal. El caso ambiguo (`1.500`) se resuelve como **mil
     quinientos** porque el error de esa elección es visible a simple vista y el
     contrario (`25.000` → 25) borraría tres ceros en silencio. Vive **dentro** del
     módulo y **no sube a `src/lib/`**.
  5. **Qué parser aplica se decide por la extensión** (`.csv` → extracto; el resto →
     `ignored[]`), y **el banco sale de la carpeta** (`<banco>/<año>/`), nunca del
     contenido: mirar dentro obligaría a adivinar antes de decidir y crearía una
     segunda fuente de verdad frente a la carpeta.
  6. **Errores por archivo y aislados**: `failed[]` (archivo no interpretable),
     `ignored[]` (extensión que este parser no maneja: los `.txt` con notas y, de
     momento, los `.json` de producto) y `unparsedRows[]` (líneas del extracto, con
     su número 1-based y su motivo). Respuesta **200** con los fallos dentro:
     el 200 dice "el proceso corrió", los `failed[]` dicen qué no salió. **Ninguna
     subclase de error nueva** (`ValidationError` se usa dentro del parser puro para
     el fallo estructural y el servicio lo convierte en una entrada de `failed[]`).
  7. **Cero dependencias nuevas**: `split(';')`. El archivo no usa comillas ni
     escapes. Queda **prohibido** usar el parser de CSV que llega como dependencia
     **transitiva** de `exceljs`: no está en `package.json` y una actualización
     ajena rompería este parser.
  8. **Disparo y volcado por el camino existente:** `POST /api/parser/myinvestor`
     bajo el prefijo `/api/parser` que ya existía, origen
     `var/drive-read/myinvestor/<año>/`, volcado `var/parsed/myinvestor/<año>/` con
     `<archivo>.json` por extracto y rutas **relativas** en la respuesta.
     Determinismo: años y archivos recorridos **ordenados** y serialización estable.
  9. **MyInvestor exporta `'newest-first'`** (verificado sobre la muestra real: las
     fechas de operación bajan de `06/08/2026` a `08/07/2026`). Ese argumento es lo
     único que aporta el banco a
     [`assignDaySequence`](../src/lib/parsed-statement.ts#L96). **Solo se numeran
     las filas parseadas**: las de `unparsedRows` no consumen número. Y la regla del
     signo **se importa, no se copia**
     ([`deriveMovementTypeFromAmount`](../src/modules/movements/movements.service.ts#L33)),
     de modo que el importe 0 sale `neutral` por el mismo camino que en Bankinter.
- **Alternativas consideradas:**
  - **Agrupar el parser por recurso funcional (`modules/investments/`) en vez de por
    banco:** descartada — contradice la norma vigente y partiría en dos módulos las
    **dos entradas del mismo banco**, que llegan por la misma carpeta de Drive, se
    disparan juntas y comparten el normalizador de números.
  - **Añadir un parser de CSV (`csv-parse`, `papaparse`):** sería lo correcto con
    comillas, campos multilínea o delimitadores variables. Este archivo no los
    tiene. Si algún día un concepto trae un `;`, esa línea cae en `unparsedRows` con
    su motivo —**visible, no silenciosa**— y se reevalúa con el caso real delante.
  - **Mirar el contenido en vez de la extensión** para decidir qué parser aplica:
    funciona, pero convierte un archivo corrupto en "no sé ni qué querías que fuera
    esto"; con la extensión el motivo es accionable.
  - **Subcarpetas en Drive (`extracto/`, `productos/`):** cambiaría la estructura que
    fijaron las features 4 y 5 y obligaría a tocar la ingesta. Coste
    desproporcionado para distinguir dos extensiones.
  - **Campo `providesBalance: false`** (lo que proponía el spec original): descartado
    ya por ADR-013.
- **Consecuencias:**
  - **Sin dependencias, sin variables de entorno y sin migración.** `docs/stack.md`
    no cambia; `.gitignore` tampoco (`var/drive-read/` y `var/parsed/` ya están
    cubiertos con sus dos guardianes).
  - **Segundo banco con parser propio**: la norma «un parser por banco» pasa de
    escrita a demostrada, y `docs/dar-de-alta-un-banco.md` gana el paso que le
    faltaba (crear el módulo de parser).
  - **Tres guardianes nuevos** en [`architecture.test.ts`](../src/architecture.test.ts):
    el módulo sin `prisma`, el aislamiento entre módulos de banco (solo se permiten
    imports de `errors/`, `lib/`, del propio módulo, de vendor y del helper único del
    signo en `modules/movements/`; `app.ts` es el único importador externo por ser la
    raíz de composición) y el slug del banco igual al nombre de su módulo.
  - **Límite conocido:** una línea del CSV con un `;` dentro de un campo se reporta
    como no interpretable (número de columnas inesperado) en vez de parsearse.
  - **La F13 amplía este módulo**, no lo duplica: añade el parser de productos, una
    función de fecha ISO a `myinvestor.format.ts` y una rama `.json` al servicio.
  - **Contrato con la feature de importación:** para este banco tendrá que (a) no
    esperar saldo y (b) ~~no esperar IBAN~~ → **corregido por ADR-015 (F12)**: el
    humano escribe el IBAN **una vez** como línea de preámbulo `iban;ES…` y el
    parser la lee. La restricción original —no inferirlo nunca de un concepto con
    forma de IBAN— **sigue vigente y su test no se ha relajado**.

### ADR-015: Importación — módulo `import/` con registro de parsers inyectado, dedup delegado en el índice parcial, `procesados/` como consecuencia del guardado, IBAN obligatorio e `ingesta` renombrado a `ingestion`

- **Estado:** aceptada (feature 12 `import`, 2026-08-12).
- **Contexto:** los parsers (F6, F10), el modelo de datos (F8, F9), el contrato
  común (F11) y la fontanería de Drive (F4, F5) existían **sin tocarse entre sí**:
  ninguna línea del proyecto convertía un fichero parseado en filas de `Movement`.
  Faltaba la costura, y con ella cuatro decisiones que ningún ADR anterior tomaba:
  quién elige el parser, quién descarta los duplicados, cuándo se considera
  «procesado» un fichero y de dónde sale la cuenta.
- **Decisión:**
  1. **Módulo propio `src/modules/import/` y `POST /api/import`.** El importador no
     es de un banco ni es «la ingesta»: es la costura. Módulo propio (ADR-004) y en
     inglés (`docs/conventions.md` §Idioma). Sin cuerpo de petición y sin
     autenticación nueva.
  2. **El registro banco→parser se inyecta desde `app.ts`**, la raíz de composición,
     como `BankParserAdapter[]` (`bank`, `extensions`, `parse`). Añadir un banco es
     añadir una línea allí; el importador no cambia nunca y **sigue sin nombrar a
     ningún banco**, que es lo que mantiene cierto el guardián de «un parser por
     banco» (ADR-014). Alternativa descartada: un `import.registry.ts` dentro del
     módulo, que habría obligado a relajar ese guardián.
  3. **El dedup lo resuelve la base de datos**, con `createMany({ skipDuplicates })`
     → `ON CONFLICT DO NOTHING` **sin target**, que es lo que cubre el índice único
     **parcial** `Movement_imported_dedup_key` (ADR-011), que Prisma no sabe
     expresar. Un solo `createMany` por fichero: o entran todos sus movimientos
     buenos o ninguno. Alternativa descartada: consultar antes y filtrar en memoria
     (una consulta de más y una carrera que el índice ya resuelve).
  4. **`procesados/` es una consecuencia del guardado, no de la descarga.** Un
     fichero se mueve solo tras persistir sus movimientos, y por eso
     `POST /api/ingestion/process` **deja de mover**: se queda como descarga de la
     copia cruda, que es lo que permite inspeccionar el fichero de un banco del que
     todavía no hay parser (regla 4 de `docs/specs.md`). Un fichero con filas no
     interpretables **sí** se mueve: se importa lo bueno y se reporta el resto.
  5. **Ninguna cuenta se crea sin IBAN, por ninguna vía.** El IBAN viaja en el
     fichero (en MyInvestor, la línea `iban;…` del preámbulo) y basta escribirlo
     **una vez**: los ficheros siguientes de ese banco resuelven por su única cuenta
     registrada. Cero o varias cuentas → `MISSING_ACCOUNT_DATA` dentro del informe
     del fichero, sin importar y sin mover. La única vía de alta sigue siendo
     `findOrCreateAccountFromMetadata` (F8), y un guardián comprueba que el módulo
     no llama a `account.create`.
  6. **`ingesta` → `ingestion`.** Módulo, archivos, símbolos y rutas pasan a inglés
     (`/api/ingesta/*` → **404**). Entra aquí porque esta feature ya retoca esos
     mismos archivos; hacerlo aparte serían dos ediciones y dos breaking changes.
- **Alternativas descartadas:**
  - **Convertir `POST /api/ingestion/process` en el importador:** un endpoint menos,
    pero se pierde la descarga sin importar.
  - **Importar desde las copias locales de `var/drive-read/`:** más fácil de probar,
    pero entonces el movimiento a `procesados/` no podría depender del guardado.
  - **Mapa banco→cuenta por configuración o `accountId` en la petición:** otra fuente
    de verdad que se desincroniza, y rompe el disparo de un solo botón.
- **Consecuencias:**
  - **Sin dependencias nuevas y sin migración**: el modelo de la F8/F9 ya tenía todo.
  - **Cabos sueltos nº 1 y nº 4 cerrados** (`docs/roadmap.md`).
  - **`MISSING_ACCOUNT_DATA` deja de estar «reservado»**, y es el único código estable
    del contrato que viaja **dentro de un 200**, en el informe de su fichero, no como
    cuerpo de error HTTP.
  - **Breaking change de contrato** (`/api/ingesta/*`), hoy sin consumidor.
  - **Límite vivo heredado de ADR-013:** `daySequence` numera **solo** las filas
    parseadas. Si un fichero con filas no interpretables se reimporta tras mejorar su
    parser, ese día se renumera y pueden aparecer duplicados **visibles** de ese día.
    Sin dueño todavía.

### ADR-016: Archivos de producto de MyInvestor — un JSON por producto escrito a mano, números JSON nativos, fechas ISO estrictas y claves cerradas

- **Fecha:** 2026-08-12.
- **Estado:** aceptada (feature 13 `myinvestor-products`).
- **Contexto:** MyInvestor tiene **dos entradas** y la norma «Parsers de banco» de
  `docs/conventions.md` lo contempla explícitamente: dentro de un banco sí se comparte.
  El ADR-014 fijó el módulo, el servicio, la ruta y el normalizador de números del
  extracto; aquí se decide el formato de la **segunda entrada**, que es el **primer
  formato escrito por el humano** en vez de exportado por un banco. Esa es toda la
  diferencia: un formato que se puede **diseñar** en vez de aceptar.
- **Decisión:**
  1. **Un JSON por producto**, encaminado **por la extensión** (`.json`) dentro del
     servicio que ya existía; el banco sale de la carpeta y el producto y la fecha,
     **de dentro del archivo** (el nombre del archivo es libre y solo se usa para
     reportar y como procedencia).
  2. **Números como número JSON nativo** (`947.25`), con punto decimal, sin separador
     de miles y sin símbolos. Un valor numérico escrito **como texto se rechaza con
     motivo y no se interpreta nunca**, ni siquiera cuando sería inequívoco. En
     consecuencia este parser **no importa `parseAmountText`**, que queda como pieza
     exclusiva del `.csv`: menos acoplamiento entre las dos entradas del banco.
  3. **Fechas siempre `AAAA-MM-DD`** (`parseIsoDate`, añadido al `myinvestor.format.ts`
     que ya existía, no un segundo archivo de formato); los porcentajes en
     **porcentaje**, nunca en fracción.
  4. **`closedAt` opcional escrito una sola vez** por el humano, en los dos tipos;
     **dejar de escribir un producto NO lo cierra** y el sistema no infiere nada de una
     ausencia. Con esto la columna `InvestmentProduct.closedAt` de ADR-012 **ya tiene
     escritor**.
  5. **Errores acumulados por archivo** en el `failed[]` que ya construyó el extracto:
     un archivo roto reporta **todos** sus problemas de golpe. **Clave desconocida =
     error**, salvo las que empiezan por `_` (las notas del humano), porque es lo único
     que atrapa una errata silenciosa en un campo opcional. El choque `(name, date)` se
     resuelve **en el servicio** —el parser ve un archivo cada vez— conservando el
     primero por orden alfabético.
  6. **Un `products.json` por año**, no un volcado por archivo: el volcado es la
     **interpretación** (estructura, fechas validadas, todo el año junto y lo que falló),
     no una copia del origen.
  7. **El parser no calcula nada** y **el efectivo sin invertir va aparte**, jamás
     sumado a `marketValue` ni a ningún total.
  8. **Cero dependencias nuevas** (`JSON.parse` es nativo, la validación va a mano),
     **ninguna subclase de error nueva** y **sin base de datos**: guardar los productos
     tiene la regla de duplicado contraria (recargar **sobrescribe**) y es de otra
     feature.
- **Alternativas consideradas:** la identidad del producto en el **nombre del archivo**
  (Drive renombra a `fondo (1).json` y renombrar crearía otro producto); **números como
  cadena en formato español** (era la propuesta del spec, **descartada por el humano**
  el 2026-08-11: obligaba a arrastrar `parseAmountText` y su heurística del punto sin
  coma a un formato que se puede diseñar); **aceptar los dos formatos a la vez** (la
  peor: garantiza que un día convivan `947.25` y `"947,25"`); aceptar `dd/mm/aaaa` y
  `dd/mm/aa` (con dos cifras hay que inventarse el siglo); `"closed": true` en vez de
  `closedAt` (pierde **cuándo**, que es lo que necesita el patrimonio a una fecha
  pasada); guardar las **dos TAE** del depósito (dos columnas para responder «¿y si no
  tuviera Premium?»); un **volcado por archivo** (`fondo.json.json`, y sin sitio donde
  reportar el choque, que es un hecho del conjunto); **validar con AJV** (es la
  herramienta de la capa HTTP y acumula peor los motivos); **mirar el contenido** en vez
  de la extensión (convierte un archivo corrupto en «no sé ni qué querías que fuera»).
- **Consecuencias:**
  - **El módulo del banco queda completo:** sus dos entradas, **un solo disparo**
    (`POST /api/parser/myinvestor` no cambia; su resultado gana `products[]`).
  - **El guardián del signo de `architecture.test.ts` se acota** a los parsers que
    devuelven el contrato de `lib/parsed-statement.ts`: un parser de producto no tiene
    movimientos de los que derivar un signo.
  - **Lo que el humano hereda:** la plantilla que copia cada mes vive en Drive, en una
    carpeta **hermana** de `notas-banco/` (todo lo que cuelga de ahí se toma por un
    banco). La referencia del formato en el repo es
    [`docs/myinvestor-product-files.md`](myinvestor-product-files.md), y **nadie
    comprueba que las dos coincidan**.
  - **Límite conocido:** subir dos archivos con el mismo nombre en el mismo
    `<banco>/<año>/` hace que la ingesta pise la copia local (ADR-009); la convención de
    nombre recomendada lo evita, pero **no se valida**.
  - **Contrato con la importación:** los productos **todavía no se guardan**. Quien lo
    haga tendrá que hacer los dos upserts de ADR-012 y enlazar movimientos con
    productos, y su regla de recarga es **sobrescribir**, no descartar duplicados.

### ADR-017: Los datos reales del humano no se versionan — un guardián de dos capas (forma + comparación contra `var/`, que se salta si no está)

- **Fecha:** 2026-08-12.
- **Estado:** aceptada (feature 14 `no-real-data`).
- **Contexto:** dos features seguidas versionaron datos financieros reales del dueño
  del proyecto (el IBAN en la F12, los importes de su cartera en la F13). Las dos las
  cazó el `reviewer` leyendo con lupa; **la suite nunca**. La regla ya estaba escrita
  en `docs/conventions.md` §Tests y hasta en el `acceptance` de la F13, y se incumplió
  igual: una regla que tres agentes distintos tienen que recordar es una esperanza, no
  una regla. Al barrer se encontró **bastante más** de lo listado: su IBAN real seguía
  en `bankinter.parser.test.ts`, y las líneas de su extracto (importes, saldos, el
  nombre de su empresa, el de una persona, su gimnasio) estaban repartidas por `src/`,
  `docs/`, `specs/` y `progress/` desde la F6.
- **Decisión:** un test más de la suite,
  [`src/no-real-data.test.ts`](../src/no-real-data.test.ts), con **dos capas**:
  1. **Por forma (siempre activa, no necesita nada de la máquina):** cualquier IBAN
     español bien formado —con **checksum mod-97 válido**— que no esté en una
     lista blanca de dos IBAN sintéticos documentados es una fuga. Es la capa que
     protege cuando el que escribe es un agente en otra máquina, donde no hay `var/`.
  2. **Por comparación contra las capturas gitignoreadas de `var/`:** de ellas se
     extraen los importes con **≥ 4 cifras significativas** (en cualquier notación:
     `9.876,54`, `9876.54`, `9876,54` son el mismo número) y los **trigramas** de
     palabras poco comunes, y
     se buscan en todo archivo versionado. Si `var/` no está, la capa **se salta con
     un mensaje** (`context.skip`) en vez de fallar: exigir los datos reales dentro
     del repositorio sería el mismo problema con otro nombre.
- **Alternativas consideradas:** **solo por forma** (no habría cazado ni uno de los
  importes de la F13: un número no tiene checksum); **solo por comparación** (decorativa
  fuera de la máquina del humano, que es justo donde trabaja el agente que mete el
  dato); **una lista negra de valores en el repositorio** (versionar los datos para
  protegerlos, prohibido de forma explícita en el `intent`, y a mantener a mano);
  **un hook de git** (no se ejecuta en la máquina del agente ni en `./init.sh`, y se
  salta con `--no-verify`).
- **Consecuencias:**
  - **Lo que el alcance define:** el archivo se recorre con
    `git ls-files --cached --others --exclude-standard`, así que cubre también el
    **archivo nuevo aún sin commitear** —que es donde el `reviewer` lee— y **nunca**
    lo gitignoreado.
  - **Límites conocidos y aceptados**, anotados aquí para que nadie confunda verde con
    seguro: no caza un importe **redondo o corto** (`4.000`, `12,30`, un porcentaje de
    tres cifras) porque es indistinguible de uno inventado —**lo que cae por debajo
    del umbral hay que mirarlo a mano**, y la primera pasada de la F14 dejó dos
    escapar—; no caza un valor
    **derivado** (una suma de dos suyos que no aparece en el archivo); no caza fechas;
    y de los conceptos solo caza secuencias de tres palabras con dos poco comunes.
  - **Lo binario solo se ve a través de su volcado.** Las capturas se leen en texto,
    así que el `.xlsx` de Bankinter **solo** es comparable a través de
    `var/parsed/**.json`. Por eso el guardián exige **las dos ramas** de `var/`
    (`drive-read/` y `parsed/`): si falta una, **se salta diciendo cuál** en vez de
    comparar contra la mitad de los datos y pasar en verde. Ese verde silencioso era
    justo lo que esta feature existe para evitar.
  - **Excepciones**: lista blanca de IBAN, lista de rutas con su motivo y marcador
    `no-real-data-ok` en la línea. El guardián **no se exceptúa a sí mismo**: si se
    exceptuara no podría cazarse, y en la primera pasada llevaba dentro un concepto
    real suyo. Todos sus ejemplos son inventados: solo tienen que tener la **forma**
    correcta, nunca ser ciertos.
  - **La única exclusión de ruta es `prisma/migrations/`**, porque una migración
    aplicada es **inmutable** (Prisma guarda su checksum: editarla obliga a
    `migrate reset` y a perder la base de datos del humano). Dicho sin rebajarlo:
    lo que queda dentro **no** es «el nombre de un banco», es **una línea entera de
    su extracto** en un comentario SQL —concepto, importe, fecha y número de
    repeticiones—. Sigue siendo un **riesgo residual aceptado**, y se cierra el día
    que la base se resetee por otro motivo (los movimientos se reimportan de Drive),
    o corrigiendo a mano el checksum guardado tras editar el comentario. Las dos son
    decisión del humano.
  - **El histórico de git NO se reescribe** (decisión del humano del 2026-08-12): las
    cifras siguen en los commits `9588389` y `0e95035` y el repositorio es privado.
    Riesgo **conocido y aceptado**; si dejara de ser privado, sanear el árbol no basta.

### ADR-018: Un fichero que no es UTF-8 se rechaza entero — `decodeUtf8Strict` en `lib/`, verdicto por bytes y ni una rama de tolerancia

- **Fecha:** 2026-08-15.
- **Estado:** aceptada (feature 17 `statement-encoding-guard`).
- **Contexto:** la prueba con archivos reales del 2026-08-15
  (`progress/prueba-drive-real-2026-08-15.md` §E) midió el daño byte a byte: el humano
  editó el CSV que MyInvestor exporta en UTF-8 y su editor lo guardó en **cp1252**
  (la `Ó` pasó de `c3 93` a `d3`). `content.toString('utf8')` **no lanza nunca**: los
  bytes inválidos se convirtieron en `U+FFFD` y `SUSCRIPCIÓN PREMIUM` quedó como
  `SUSCRIPCI�N PREMIUM` de forma **irreversible**, mientras el parseo aparentaba ir
  perfecto (11 movimientos, cero `unparsedRows` de más). La cabecera sobrevive porque
  se reconoce por su prefijo ASCII —previsión deliberada de la F10—, lo que hace el
  fallo aún más invisible.
- **Decisión:** descodificar en **UTF-8 estricto** y **rechazar**, nunca reparar.
  1. **Detección por los BYTES, no por el `�`.** `new TextDecoder('utf-8', { fatal:
     true })` es el veredicto: es el hecho real («estos bytes no son UTF-8») y no una
     heurística. Buscar `U+FFFD` en el texto ya descodificado sería mirar la
     consecuencia, y además `U+FFFD` **puede** venir en un fichero UTF-8 perfectamente
     válido que ya lo contenga. Esa segunda comprobación existe igualmente, pero como
     guardia secundaria y con su propio motivo: un `�` en un extracto es la cicatriz de
     una decodificación fallida **anterior**, texto ya corrompido, y merece el mismo
     rechazo. El motivo primario nombra el **byte** y la **línea** (`0xD3`), que es lo
     que el humano puede reconocer en su editor.
  2. **Se rechaza el FICHERO ENTERO, no las filas afectadas.** La codificación es una
     propiedad del flujo de bytes, no de una línea: un guardado en cp1252 corrompe
     toda línea con acentos y deja intactas las de puro ASCII, así que un rechazo por
     filas importaría un subconjunto arbitrario **con pinta de completo** y su
     reintento sería un lío de duplicados parciales. Y el arreglo es atómico —volver a
     guardar el fichero—, así que la unidad de rechazo debe ser la misma.
  3. **Vive en `src/lib/utf8.ts`, no en el módulo del banco.** La codificación no es un
     formato: no hay conocimiento de ningún banco ahí dentro, así que compartirla no
     rompe la norma «un parser por banco» (§ADR-013 hizo lo propio con la forma de la
     salida). Y como el guardián está **dentro del parser**, los **dos** caminos que lo
     llaman —`POST /api/parser/myinvestor` y `POST /api/import`— quedan cubiertos sin
     duplicar una línea.
  4. **Sale por el camino de fallo POR ARCHIVO**, no como error de la petición: se
     lanza `NotUtf8Error` (código estable `NOT_UTF8`, 422), que el aislamiento ya
     existente convierte en un elemento de `failed[]`/`files[].error` dentro de un 200.
     El resto del lote se parsea igual y el fichero **no se mueve a `procesados/`**:
     sigue pendiente y se reintenta solo con volver a guardarlo.
- **Alternativa descartada:** descodificar cp1252 como *fallback* (era la
  recomendación nº 1 de la propia prueba). **El humano la descartó explícitamente el
  2026-08-15:** sus ficheros los escribe él y prefiere volver a guardar uno a que el
  código acumule ramas de tolerancia; adivinar la codificación además acierta «casi
  siempre», que es la peor garantía posible para un dato que luego va a la base de
  datos. Cero dependencias nuevas (`TextDecoder` es de Node).
- **Consecuencia:** cualquier parser de banco cuyo fichero sea **texto** usa
  `decodeUtf8Strict` y no `toString('utf8')` (anotado en `docs/conventions.md`
  §Parsers de banco y en `docs/dar-de-alta-un-banco.md`). El BOM inicial se sigue
  tolerando: es UTF-8 válido y la función no lo toca —quien lee el formato decide—.

### ADR-019: El saldo de la cuenta es un campo del contrato común (`accountBalance`), no el `balance` de una línea, y se lee de una segunda línea de preámbulo etiquetada

- **Fecha:** 2026-08-16.
- **Estado:** aceptada (feature 16 `statement-balance`).
- **Contexto:** el extracto de MyInvestor no trae el saldo de la cuenta por ningún
  lado, y el humano lo quiere en el sistema: sin él solo hay movimientos sueltos sin
  punto de referencia. Él mismo decidió el 2026-08-15
  (`progress/prueba-drive-real-2026-08-15.md` §Decisión del humano sobre el saldo)
  escribirlo **a mano como línea de preámbulo**, frente a leer la fila `Saldo` que su
  export lleva al final del fichero.
- **Decisión:**
  1. **Vive en el contrato común** `src/lib/parsed-statement.ts` como
     `accountBalance: number | null`, y **no** en el módulo de MyInvestor. Es el mismo
     razonamiento del ADR-013 y de `docs/conventions.md` §Parsers de banco: lo que no
     se comparte es el código que **lee** el formato; la **forma de la salida** sí, y
     un banco que no aporte un dato lo deja en `null` explícito, como ya hace
     `accountIban` (que MyInvestor tampoco exporta y Bankinter sí). Declararlo como
     una extensión dentro del módulo del banco habría sido justo lo que la norma
     prohíbe: un banco declarando su propia forma de resultado. Consecuencia:
     Bankinter emite `accountBalance: null` —una línea— sin que cambie nada de cómo
     lee su `.xlsx`.
  2. **Nombre propio, nunca `balance`.** `ParsedMovement.balance` es el saldo **tras
     una línea** (Bankinter lo trae; MyInvestor es `null` para siempre) y
     `accountBalance` es el saldo **de la cuenta** en la fecha del extracto: uno por
     archivo. Compartir nombre o campo invitaría a sumarlos el día de la persistencia.
  3. **Una sola forma de escribirlo: la línea de preámbulo.** El parser NO aprende a
     leer también la fila `Saldo` del final. Dos formas obligarían a distinguir «fila
     de cierre legítima» de «fila corrupta», que es precisamente la distinción que
     hace útil a `unparsedRows`; y de paso esa fila deja de ensuciarlo en todos los
     extractos. La regla «solo por encima de la cabecera» ya lo garantiza sola.
  4. **Un solo buscador para las dos etiquetas.** `findIbanLine` se generalizó a
     `findPreambleLine(lines, headerLine, label)`: es el mismo mecanismo montado y
     probado en la F12, y duplicarlo casi igual habría dejado dos sitios donde
     arreglar el mismo bug. La etiqueta se normaliza **sin acentos y sin mayúsculas**
     porque el fichero real del humano ya dice `Saldo;…`: exigir minúscula rompería un
     fichero que él da por bueno. Si la etiqueta se repite, gana la **primera**, misma
     regla que el IBAN.
  5. **El número pasa por `parseAmountText`**, el normalizador que este banco ya tiene
     para su columna `Importe`: en el CSV la coma decimal es correcta, y escribir un
     segundo normalizador para el mismo fichero sería garantizar que un día divergen.
  6. **Etiqueta presente + importe ilegible → `unparsedRows`**, con su nº de línea y
     su motivo; ausente o vacía → `null` y no pasa nada. Es la doctrina del parser
     aplicada tal cual: lo que **no está** no es un fallo (la ausencia del IBAN
     tampoco lo es), y lo que **está y no se entiende** no se descarta en silencio
     sino que se reporta con su fila. Rechazar el fichero entero se reserva para lo
     que es propiedad del fichero entero —la codificación (ADR-018) o no tener
     cabecera—, y sería desproporcionado por una línea que el resto del extracto no
     necesita.
- **Alternativas descartadas:** (a) leer la fila del final, descartada por el humano
  (§3); (b) declarar el campo solo en `myinvestor.types.ts`, descartada por §1: lo
  dejaría invisible para el importador, que consume el contrato común; (c) reutilizar
  `balance` a nivel de resultado, descartada por §2.
- **Consecuencia:** `accountBalance` viaja en el volcado JSON y en el resumen de
  `POST /api/parser/myinvestor`, y **no se persiste**: esta feature es parser y
  volcado. El día que la importación quiera usarlo, el dato ya está en el contrato y
  con un nombre que no se confunde con el otro saldo.

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
