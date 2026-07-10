# Arquitectura — Qué significa "hacer un buen trabajo"

> **Este documento es la referencia de arquitectura del backend y lo posees tú
> (humano).** Recoge las decisiones ya tomadas. Donde el código actual todavía
> diverge del destino descrito, se indica explícitamente.

## Principios

> Basado en el patrón estándar Fastify + Prisma (capas HTTP → servicio → datos).
> Nota de realidad: el código actual todavía **no** tiene capa `services/`; las
> rutas hablan con Prisma directamente. Estos principios describen el destino
> propuesto (alineado con la feature #2 "fundamentos"), no el estado de hoy.

1. **La capa HTTP no contiene lógica de negocio.** Una ruta
   (`modules/<recurso>/*.routes.ts`) solo: valida la entrada con un JSON Schema,
   llama a un servicio y formatea la salida. Toda decisión de negocio vive en el
   servicio del módulo (`modules/<recurso>/*.service.ts`).

2. **El acceso a datos se aísla.** Solo la capa de servicios/repositorio habla
   con Prisma (`fastify.prisma`). Ninguna ruta importa el cliente de Prisma
   directamente. *(Hoy las rutas sí lo hacen — a migrar.)*

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
> ("estructura por features"). Árbol objetivo: las carpetas marcadas `(nueva)`
> aún no existen; las demás ya están en el repo.
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
  config/                # (nueva) carga y validación de env tipada
  plugins/               # plugins Fastify transversales
    prisma.ts            #   expone fastify.prisma + cierre limpio
    error-handler.ts     # (nueva) setErrorHandler central
  lib/                   # utilidades de infraestructura
    prisma.ts            #   fábrica de PrismaClient (driver adapter pg)
  errors/                # (nueva) clases de error de dominio
  modules/                 # (nueva) un directorio por recurso (vertical slice)
    expenses/              # (nueva)
      expenses.routes.ts   #   capa HTTP: valida, llama al servicio, formatea
      expenses.service.ts  #   lógica de negocio; único que habla con Prisma
      expenses.schema.ts   #   JSON Schemas del recurso
      expenses.types.ts    #   tipos del recurso (CreateExpenseBody, ...)
    health/                # (nueva)
      health.routes.ts
  generated/prisma/      # cliente Prisma generado (no se versiona)
```

> **Regla para decidir dónde va un archivo:** ¿pertenece a un recurso concreto?
> → `modules/<recurso>/`. ¿lo usan todos y no es de nadie (config, cliente
> Prisma, error handler, clases de error)? → carpeta transversal (`config/`,
> `plugins/`, `lib/`, `errors/`).
>
> Nota de migración: hoy `src/routes/{health,expenses}.ts` mezclan ruta, schema
> y acceso a Prisma en un archivo. La feature #2 mueve cada uno a su
> `modules/<recurso>/` extrayendo el `*.service.ts` (para sacar la lógica y
> `fastify.prisma` de la ruta) y el `*.schema.ts`.

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

## Qué NO hacer

- **No importar el cliente de Prisma en una ruta.** Usar `fastify.prisma` (y,
  cuando exista, la capa de servicios).
- **No devolver el modelo de Prisma tal cual** si diverge del contrato de la
  API; mapéalo a la forma esperada por el consumidor.
- **No leer `process.env` disperso por el código.** Centralizar en `config/`.
- **No usar `console.log` para errores.** Usar el logger de Fastify
  (`fastify.log` / `request.log`).
- **No añadir librerías nuevas sin anotar el trade-off** aquí (o pasar la
  feature a `blocked` en `feature_list.json` para discutirlo).
