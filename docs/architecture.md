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
    error-handler.ts     #   setErrorHandler + setNotFoundHandler centrales
  lib/                   # utilidades de infraestructura
    prisma.ts            #   fábrica de PrismaClient (driver adapter pg)
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
