# Exploración — Puntos de enganche para `drive-connection` (feature 3)

> **Tipo:** investigación de solo lectura previa al spec. No se tocó `src/`.
> **Pregunta:** ¿dónde y cómo engancha una capa de conexión a un servicio
> externo (Google Drive) reutilizando los fundamentos de la feature 2?
> **Fecha:** 2026-07-14.

**Resumen en una línea:** el precedente exacto ya existe y es
`lib/<cliente>.ts` (fábrica pura) + `plugins/<cliente>.ts` (plugin `fp` que
decora la instancia y cierra en `onClose`) + `config/env.ts` (única lectura de
`process.env`, validada al arrancar). Drive debe copiar ese triángulo.

---

## 1. `src/config/env.ts` — configuración tipada y validada

**Mecanismo: validador manual a mano. NO hay AJV/JSON Schema/Zod aquí.**
Decidido en ADR-006 (`docs/architecture.md:180-196`) y en
`specs/foundations/design.md:113-126`. `@fastify/env` se descartó
explícitamente porque valida dentro del ciclo de plugins, demasiado tarde para
el `logLevel` que se necesita al construir la instancia.

Anatomía del archivo (`src/config/env.ts`, 74 líneas):

| Bloque | Líneas | Qué hace |
| ------ | ------ | -------- |
| `logLevels` (tupla `as const`) | 1-3 | fuente del union type |
| `interface AppConfig` | 5-10 | forma tipada de la config |
| `const defaults` | 12-16 | defaults de las opcionales |
| `isLogLevel` (type guard) | 18-20 | valida enum |
| `loadConfig(env = process.env)` | 27-67 | acumula problemas, lanza uno solo |
| `declare module 'fastify'` → `config: AppConfig` | 69-73 | tipa `fastify.config` |

**Cómo falla al arrancar:** `loadConfig` **no** falla al primer problema:
acumula todos en `problems: string[]` (`env.ts:28`) y al final lanza **un
único** `Error` que los lista (`env.ts:60-64`):

```ts
throw new Error(
  `Invalid environment configuration:\n${problems.map((p) => `- ${p}`).join('\n')}`,
)
```

El fail-fast real lo hace `src/server.ts:9-16`: `try { loadConfig() } catch`
→ `console.error(error.message)` + `process.exit(1)` (excepción consciente a
"no console", documentada en `design.md:94-99`).

### PATRÓN EXACTO PARA AÑADIR UNA VARIABLE NUEVA (transcribible)

Obligatoria (copiar de `env.ts:30-33`):

```ts
const googleClientId = env.GOOGLE_CLIENT_ID
if (!googleClientId) {
  problems.push('GOOGLE_CLIENT_ID is required (<motivo legible>)')
}
```

Opcional con default (copiar de `env.ts:45-48`):

```ts
let host: string = defaults.host
if (env.HOST !== undefined && env.HOST !== '') {
  host = env.HOST
}
```

Opcional validada contra enum (copiar de `env.ts:50-57`) o numérica
(`env.ts:35-43`, con `Number.isInteger` + rango).

**4 pasos obligatorios, ninguno opcional:**
1. Añadir el campo a `interface AppConfig` (`env.ts:5-10`).
2. Añadir el bloque `if` que empuja a `problems` (dentro de `loadConfig`).
3. **Estrechar el tipo antes del return.** Ver `env.ts:59-60`: el `throw` va
   guardado con `if (problems.length > 0 || !databaseUrl)` — el `!databaseUrl`
   es redundante en runtime pero es lo que hace que TS estreche
   `string | undefined` → `string`. **Cada nueva variable obligatoria debe
   sumar su propio `|| !xxx` a esa condición** o el `return` de la línea 66 no
   compila con `strict`.
4. Añadir el campo al objeto del `return` (`env.ts:66`).

Complementos: `.env.example` (no está en `.gitignore`; `.env` sí lo está,
`.gitignore:8`) y la tabla de `docs/stack.md:90-100`.

### ⚠️ Umbral de ADR-006 — se cruza con esta feature

`docs/architecture.md:194-196` y `design.md:124-126` fijan: *"si las variables
crecen (**>8-10**) o aparecen tipos complejos, reconsiderar `@fastify/env`"*.
Hoy hay **4**. OAuth de Drive añade típicamente 3 (`CLIENT_ID`,
`CLIENT_SECRET`, `REFRESH_TOKEN`) → **7**; la feature 4 ya anuncia una más
(fileId de la carpeta raíz, `feature_list.json:123`) → **8**.
**El spec debe pronunciarse explícitamente sobre ese umbral** (mantener manual
o reevaluar), porque es un trade-off ya registrado por escrito. No es una
decisión que este explorador tome.

---

## 2. `src/app.ts` — construcción y registro (31 líneas)

```ts
export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {  // :13
  const app = Fastify({ logger: { level: config.logLevel } })                  // :14-18
  app.decorate('config', config)                                               // :20
  app.register(errorHandlerPlugin)                                             // :23
  app.register(prismaPlugin)                                                   // :24
  app.register(healthRoutes)                                                   // :27
  app.register(expensesRoutes, { prefix: '/api/expenses' })                    // :28
  return app
}
```

- **Sí se usa `fastify-plugin`** (`fastify-plugin@^6.0.0`, `package.json`), en
  los dos plugins transversales.
- **Sí hay decoradores en uso:** `app.decorate('config', config)`
  (`app.ts:20`) y `fastify.decorate('prisma', prisma)` (`plugins/prisma.ts:23`).
- **Orden de registro (obligatorio, `design.md:353`):** `error-handler` →
  `prisma` → módulos. El error handler va primero para cubrir todo lo
  registrado después.
- `config` se decora **antes** de registrar plugins → cualquier plugin nuevo
  puede leer `fastify.config` en su cuerpo (así lo hace `prisma.ts:18`).
- `buildApp(config = loadConfig())`: el default permite `buildApp()` sin args
  en los tests.

**Enganche de Drive:** un `app.register(drivePlugin)` en la zona de
infraestructura (líneas 22-24), después de `prisma` y antes de los módulos.

---

## 3. `src/lib/prisma.ts` + `src/plugins/prisma.ts` — EL PRECEDENTE

Es el patrón más cercano a "cliente de servicio externo compartido". Está
partido en dos archivos a propósito:

**a) `src/lib/prisma.ts` (20 líneas) — fábrica pura, sin Fastify:**

```ts
export function createPrismaClient(databaseUrl: string) {   // :13-16
  const adapter = new PrismaPg({ connectionString: databaseUrl })
  return new PrismaClient({ adapter })
}
export type AppPrismaClient = ReturnType<typeof createPrismaClient>  // :19
```

- **NO es un singleton.** Es una fábrica que recibe la credencial por
  parámetro. El comentario `lib/prisma.ts:11` lo dice literal: *"comes from the
  validated app config, never read from the environment here"*.
- El tipo se deriva con `ReturnType<typeof …>` en vez de escribirlo a mano.

**b) `src/plugins/prisma.ts` (33 líneas) — el plugin (lifecycle + decorator):**

```ts
declare module 'fastify' {                       // :7-11
  interface FastifyInstance { prisma: AppPrismaClient }
}

async function prismaPlugin(fastify: FastifyInstance) {          // :17
  const prisma = createPrismaClient(fastify.config.databaseUrl)  // :18  ← lee de fastify.config
  await prisma.$connect()                                        // :20  ← conexión EAGER
  fastify.log.info('PostgreSQL connection established (Prisma)') // :21
  fastify.decorate('prisma', prisma)                             // :23
  fastify.addHook('onClose', async (instance) => {               // :25-27
    await instance.prisma.$disconnect()
  })
}

export default fp(prismaPlugin, { name: 'prisma' })              // :32  ← fp = sin encapsular
```

**Los 5 elementos del patrón, en orden:** `declare module` para tipar →
fábrica alimentada desde `fastify.config` → conexión/handshake + log →
`decorate` → hook `onClose` → export `fp(plugin, { name })`.
`fp` es obligatorio (comentario `prisma.ts:30-31`): sin él el decorator queda
encapsulado y no lo ven las rutas.

### ⚠️ Riesgo a resolver en el spec: conexión eager vs. tests

`prisma.ts:20` hace `await prisma.$connect()` **durante el registro**. Como
todos los tests de integración hacen `buildApp()` + `await app.ready()`
(`health.test.ts:9-10`, `error-handler.test.ts:80-85`), **si el plugin de
Drive replica el handshake eager, cada `app.ready()` de la suite hará una
llamada de red real a Google** (y la suite entera cae si no hay red o
credenciales). Con Postgres esto es aceptable porque hay un contenedor local
(`docker-compose.yml`); con Drive no hay equivalente local.
**Decisión que el spec debe tomar explícitamente:** conexión lazy / cliente
construido sin I/O + verificación bajo demanda, vs. eager como Prisma.
El `intent` dice *"cuando compruebo la conexión, el backend me dice si llega a
Drive o no"* (`feature_list.json:83`) — eso apunta a un chequeo **explícito**
(estilo `/health/db`), no a un handshake en el arranque.

---

## 4. Manejo de errores centralizado

**Clases** — `src/errors/app-error.ts` (28 líneas):

| Clase | Líneas | `code` | `statusCode` |
| ----- | ------ | ------ | ------------ |
| `AppError` (base) | 6-15 | param | 400 (default) |
| `NotFoundError` | 17-21 | `'NOT_FOUND'` | 404 |
| `ValidationError` | 23-27 | `'VALIDATION_ERROR'` | 400 |

```ts
export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode: number = 400) {
    super(message)
    this.name = new.target.name    // :13  ← new.target, no this.constructor.name
  }
}
```

**Handler** — `src/plugins/error-handler.ts` (54 líneas). `handleError` está
**exportado aparte** (`:20-41`) para poder unit-testearlo con fakes; el plugin
`fp` solo cablea `setErrorHandler` + `setNotFoundHandler` (`:43-53`).

Mapeo (`error-handler.ts:25-40`):

| Error | Status | `code` | Log |
| ----- | ------ | ------ | --- |
| `instanceof AppError` | `error.statusCode` | `error.code` | `request.log.warn` |
| `'validation' in error` (AJV) | 400 | `VALIDATION_ERROR` | `request.log.warn` |
| cualquier otro | 500 | `INTERNAL_SERVER_ERROR` | `request.log.error` |

**Formato único de respuesta** (`error-handler.ts:6-14`, contrato en
`docs/api-contract.md:27-50`):

```json
{ "statusCode": 404, "code": "NOT_FOUND", "message": "Expense not found" }
```

`code` es el identificador **estable** para máquinas; `message` puede cambiar
sin aviso.

### Cómo se añade un error de dominio nuevo

Sub-clasear en `src/errors/app-error.ts` copiando `:17-21`. **No hay que tocar
el handler**: `handleError` ya despacha por `instanceof AppError`
(`error-handler.ts:25`).

```ts
export class DriveConnectionError extends AppError {
  constructor(message = 'Cannot reach Google Drive') {
    super(message, 'DRIVE_CONNECTION_ERROR', 503)
  }
}
```

Reglas asociadas:
- La jerarquía es **mínima a propósito**: `design.md:163-165` dice que nuevas
  subclases se añaden *"cuando una feature las necesite, no antes"*. Añadir una
  para Drive está explícitamente previsto (ADR-005, `architecture.md:175-178`).
- **Todo `code` nuevo debe documentarse** en la tabla de códigos estables de
  `docs/api-contract.md:44-48` (regla de `docs/related-projects.md:14-19`:
  contrato actualizado en la misma feature).
- Los errores no-`AppError` responden 500 genérico **sin detalles internos**
  (`error-handler.ts:38-40`) → un error crudo de `googleapis` (que puede llevar
  tokens/URLs en el mensaje) **nunca** debe llegar al cliente: hay que envolverlo
  en un `AppError`. El test `error-handler.test.ts:101` guarda esta propiedad.
- Precedente de envoltura selectiva: `expenses.service.ts:51-62` captura solo
  `P2025` → `NotFoundError` y **repropaga lo demás** (un fallo de infra no debe
  disfrazarse). Mismo criterio aplica a los errores de Drive (404 de fileId vs.
  401 de auth vs. red caída).

---

## 5. `src/modules/` — estructura por feature

ADR-004 (`architecture.md:134-155`): organización **por recurso (vertical
slice)**, no por capa.

```
src/modules/expenses/
  expenses.routes.ts    # capa HTTP: schema + delega + formatea (55 líneas)
  expenses.service.ts   # lógica + ÚNICO que habla con Prisma (63 líneas)
  expenses.schema.ts    # JSON Schemas AJV, objetos `as const` (22 líneas)
  expenses.types.ts     # tipos del recurso (11 líneas)
  expenses.test.ts      # tests junto al archivo
src/modules/health/
  health.routes.ts      # sin service: es infra, no negocio (design.md:283-288)
  health.test.ts
```

**Convención de nombres:** `<recurso>/<recurso>.<capa>.ts` — el recurso se
repite en carpeta y archivo (`expenses/expenses.routes.ts`), en **plural** y
en **inglés** (`conventions.md:9-21`, nombres de archivo siempre en inglés).

**Regla para decidir dónde va un archivo** (`architecture.md:70-73`, literal):
> ¿pertenece a un recurso concreto? → `modules/<recurso>/`. ¿lo usan todos y no
> es de nadie (config, cliente Prisma, error handler, clases de error)? →
> carpeta transversal (`config/`, `plugins/`, `lib/`, `errors/`).

→ **El cliente de Drive es transversal** (`lib/` + `plugins/`), no un módulo.
Si además expone endpoints (p. ej. un chequeo de conexión), esa superficie HTTP
sí puede vivir en `modules/` o colgar de `health` (ver §10).

**Cómo un módulo obtiene el cliente** (`expenses.service.ts:13-15`) — punto
único de acceso, patrón replicable para `driveClient(app)`:

```ts
export function expensesDb(app: FastifyInstance): AppPrismaClient {
  return app.prisma
}
```

Servicios = **funciones puras que reciben el cliente por parámetro**, sin
clases (`design.md:254-257`: *"no hay estado que encapsular y se testean
pasando `app.prisma`"*). Este es el detalle que hace testeable el servicio sin
levantar la app: **el cliente de Drive debe ser un parámetro, no un import**.

---

## 6. Reglas de `architecture.md` / `conventions.md` que condicionan ESTA feature

| # | Regla | Fuente |
| - | ----- | ------ |
| 1 | **Composición por plugins:** la infra compartida se registra como plugin Fastify con `fastify-plugin`, **no como singleton importado suelto**. | `architecture.md:32-35` (Principio 5) |
| 2 | **Config validada al arrancar**, `process.env` en un único punto. | `architecture.md:28-31` (Principio 4) |
| 3 | **Errores de dominio nombrados**, no `null` ambiguo; handler central los traduce. | `architecture.md:24-26` (Principio 3) |
| 4 | **La capa HTTP no contiene lógica**: valida, llama al servicio, formatea. | `architecture.md:15-18` (Principio 1) |
| 5 | ❌ **No leer `process.env` disperso.** | `architecture.md:204` + guardián |
| 6 | ❌ **No `console.log` para errores** → `fastify.log` / `request.log`. | `architecture.md:205-206` |
| 7 | ❌ **No añadir librerías sin anotar el trade-off** en `architecture.md` (o pasar la feature a `blocked`). | `architecture.md:207-208` |
| 8 | ❌ **No devolver el modelo externo tal cual** si diverge del contrato; mapearlo. | `architecture.md:201-203` |
| 9 | Imports: vendor → relativos, **relativos con extensión `.js`** (ESM/NodeNext, ADR-001). `import type` para tipos. | `conventions.md:45-52` |
| 10 | Estilo: comillas simples, sin `;`, 2 espacios, 100 columnas. | `conventions.md:39-43` |
| 11 | Comentarios: los mínimos, en inglés, explican el *por qué*. | `conventions.md:122-131` |
| 12 | Todo el código en inglés (dominio incluido). Prosa de `docs/` en español. | `conventions.md:7-21` |

**Regla 7 es la más relevante:** `googleapis` es una dependencia nueva y pesada.
`feature_list.json:93` delega la elección al agente, pero el trade-off **debe
quedar anotado como ADR** en `docs/architecture.md` (sería ADR-007). Precedente
del formato: ADR-005 y ADR-006 (`architecture.md:157-196`), ambos con
*Contexto / Decisión / Alternativas consideradas / Consecuencias*.
`docs/stack.md:88` registra: *"Librerías explícitamente prohibidas: ninguna"*.

### Cómo se testea algo con I/O de red — ¿se permiten mocks?

**Postura del proyecto: matizada, no un "no" absoluto.**

- ❌ Antipatrón registrado (`verification.md:107-108`): *"**Mocks excesivos**
  del entorno cuando un recurso real (tempdir, sqlite in-memory) es viable"*.
  La palabra clave es **"cuando un recurso real es viable"**.
- `stack.md:59-60`: los tests de integración van *"contra el PostgreSQL real,
  **sin mocks**"* — pero es que Postgres tiene contenedor local.
- ✅ **Sí se usan fakes en el nivel unitario, y hay precedente vivo**:
  `error-handler.test.ts:8-23` construye `fakeRequest()` / `fakeReply()` con
  `vi.fn()` y castea con `as unknown as FastifyRequest`.
- ✅ **`loadConfig(env)` es inyectable a propósito** para testear sin tocar
  `process.env` real (`design.md:90-91`); `env.test.ts` le pasa objetos
  sintéticos (`env.test.ts:9-14`).

**Lectura para Drive:** no existe "Drive local" viable → el antipatrón no
aplica en su literalidad, y un doble en el seam es coherente con
`error-handler.test.ts`. **El camino alineado con el proyecto:** diseñar el
seam para que sea inyectable (fábrica que recibe credenciales + servicios que
reciben el cliente por parámetro, §3 y §5), testear la lógica con un doble en
ese seam, y dejar el contacto real con Drive como smoke manual (Nivel 3,
`verification.md:69-85`). **El spec debe declarar y justificar esta postura
explícitamente** — es un caso nuevo que las reglas actuales no cubren.

---

## 7. `specs/foundations/` (feature 2, done) — patrón establecido

Tres archivos: `requirements.md` (QUÉ, notación EARS), `design.md` (CÓMO),
`tasks.md`. Lo que dejó establecido y que la feature 3 debe respetar:

1. **Config:** `loadConfig(env)` manual, inyectable, acumula problemas, fail-fast
   en `server.ts` (`design.md:52-111`).
2. **Errores:** jerarquía `AppError` mínima + handler central `fp` + formato
   `{ statusCode, code, message }` (`design.md:128-214`).
3. **Cliente externo:** fábrica en `lib/` (recibe credenciales, no lee env) +
   plugin `fp` en `plugins/` que decora y cierra en `onClose` (`design.md:26-30`,
   `109-111`).
4. **Orden en `buildApp`:** error-handler → prisma → módulos (`design.md:353`).
5. **Módulos:** rutas finas sin `try/catch`, servicios como funciones puras que
   reciben el cliente (`design.md:254-280`).
6. **Estructura de decisión delegada:** cada decisión que el humano delega se
   resuelve en `design.md` **con su alternativa descartada y el trade-off**, y
   se promueve a ADR en `docs/architecture.md` al cierre (`design.md:113-126`,
   R17). La feature 3 delega 4 decisiones (`feature_list.json:91-96`) → mismo
   tratamiento.
7. **Procedencia de requirements:** `requirements.md:184-257` marca cada `R<n>`
   como **(humano)** / **(delegado)** / **(añadido)**, y los `(añadido)` llevan
   **← REVISAR EN APROBACIÓN**. Patrón a replicar.

### 🔑 Hallazgo clave: la feature 2 excluyó explícitamente el cliente saliente

`specs/foundations/requirements.md:9-12`, literal:

> *"Nota de alcance: el `intent` dice 'el cliente HTTP o la validación de datos
> según el proyecto'. Este proyecto es un backend: aplica la **validación de
> datos** […]. **No existe cliente HTTP saliente que construir.**"*

→ **No hay ningún cliente HTTP saliente, ni base ni helper de red, que reutilizar.**
La feature 3 es el **primer** consumidor saliente del proyecto y crea ese
precedente. Todo lo que reutiliza es el triángulo config/lib/plugins, no una
capa de red preexistente.

---

## 8. `docs/verification.md` — qué exige para dar la feature por verificada

**Regla de oro (`verification.md:3`):** *"el agente no dice 'funciona', lo
demuestra"*.

| Nivel | Exigencia | ¿Aplica a feature 3? |
| ----- | --------- | -------------------- |
| 1 — Unitarios | **Obligatorio.** Toda función/módulo público en `src/` con ≥1 test: camino feliz **+ ≥1 camino de error** si puede fallar. Más `npm run typecheck` sin errores. | **Sí** |
| 2 — Integración | **Obligatorio para features de API**: `buildApp()` + `app.inject()` contra recursos reales. | Solo si expone endpoint |
| 3 — Smoke manual | Opcional pero recomendado; flujo end-to-end. | Encaje natural del contacto real con Drive |
| 4 — **Trazabilidad** | **Obligatorio con `"sdd": true`** (la feature 3 lo es). Cada `R<n>` → ≥1 test concreto, mapeado en `progress/implementations/<name>.md`. **El reviewer rechaza si falta cobertura.** | **Sí** |

**Puerta de cierre (`verification.md:113-132`):** `./init.sh` debe terminar con
`[OK] Entorno listo`. Comprueba: stack + archivos del arnés + validez de
`feature_list.json` + `npx tsc --noEmit` + la suite completa al 100%.
Si está rojo, **no** se marca nada `done` (y la feature pasa a `blocked`).
En Windows se ejecuta con **Git Bash** o **WSL**.

**Criterios mínimos (`verification.md:134-143`):** cumplir todo el `acceptance`
+ tests que cubran los criterios (no solo happy path) + `./init.sh` verde +
veredicto `APPROVED` del reviewer + `progress/current.md` actualizado.

⚠️ **La feature 3 no tiene bloque `acceptance` en `feature_list.json`**
(líneas 74-100: tiene `intent`, `sdd: true`, `status`, pero **no**
`acceptance`, a diferencia de las features 1 y 2). El leader debe derivarlo del
`intent` antes de cerrar, porque el primer criterio mínimo lo exige.

**Antipatrones (`verification.md:103-111`):** test que solo verifica "no lanza"
→ hay que comprobar el **resultado concreto**; mocks excesivos si hay recurso
real viable; marcar `done` sin `./init.sh`.

---

## 9. ⚠️ DISCREPANCIA VERIFICADA: el gestor de paquetes real es **pnpm**, no npm

**`docs/stack.md:35-36` es incorrecto.** Dice literalmente:

> *"**Gestor de paquetes:** **npm** (existe `package-lock.json`; no hay
> `pnpm-lock.yaml` ni `yarn.lock`)."*

**Evidencia de que hoy se usa pnpm:**

| Evidencia | Detalle |
| --------- | ------- |
| `init.sh:294-296` | `if [ -f "pnpm-lock.yaml" ]; then PKG="pnpm"; elif [ -f "yarn.lock" ]; …` |
| `init.sh:299` | `TEST_CMD="$PKG test"` → con `pnpm-lock.yaml` presente, **`init.sh` ejecuta `pnpm test`** |
| `pnpm-lock.yaml` | **existe** (100 KB, mtime 2026-07-12 09:34) → contradice el texto de `stack.md` |
| `node_modules/.modules.yaml` | marcador **exclusivo de pnpm** (`prunedAt: Sun, 12 Jul 2026`) |
| `node_modules/.pnpm/` | store de pnpm presente y poblado |
| `node_modules/fastify` | **symlink** → `node_modules/.pnpm/fastify@5.10.0/node_modules/fastify/` (layout pnpm, no npm) |
| `package-lock.json` | mtime **2026-07-11 08:26** — un día **anterior**; `node_modules/.package-lock.json` (marcador npm) igual de antiguo → **el árbol de npm es residual/stale** |

**Veredicto: se usa pnpm realmente.** El último install fue con pnpm (2026-07-12)
y `node_modules` es un árbol de pnpm; `package-lock.json` quedó obsoleto pero no
se borró. `init.sh` — la puerta de cierre — corre `pnpm test`.

**Agravante de versionado (no arreglar, solo anotar):**
- `git status`: `pnpm-lock.yaml` y `pnpm-workspace.yaml` están **untracked**;
  `package-lock.json` **sí** está commiteado (`git ls-files`). El `.gitignore`
  no menciona ninguno de los dos → el lockfile que manda hoy no está en el repo
  y el que está en el repo ya no manda.
- `package.json` **no** tiene campo `packageManager` → nada fuerza el gestor.
- `pnpm-workspace.yaml` no declara `packages:`, solo `allowBuilds`
  (`@prisma/engines`, `esbuild`, `prisma`): no es un monorepo, es la config de
  pnpm 10 para permitir scripts de build.
- Toda la documentación (`stack.md:37-48`, `verification.md:19-31`,
  `conventions.md:37-38`) y `specs/foundations/requirements.md:133` documentan
  comandos `npm run …` / `npm test`. Funcionan por accidente (los binarios están
  en `node_modules/.bin`), pero `npm install` regeneraría un árbol distinto del
  que valida `init.sh`.

**Impacto directo en la feature 3:** cuando el implementer añada la librería de
Drive, **el comando debe ser `pnpm add …`** (no `npm install`), o se mezclarán
dos gestores y `init.sh` (que corre `pnpm test`) validará un árbol que no es el
instalado. **Decisión pendiente para el humano** (fuera del alcance de esta
feature): unificar en pnpm (borrar `package-lock.json`, commitear
`pnpm-lock.yaml`, añadir `packageManager`, corregir `stack.md:35-36` y los
comandos de los docs) o volver a npm.

---

## 10. Guardianes automáticos que la feature 3 debe respetar

`src/architecture.test.ts` (63 líneas) falla el build si se rompen estos
invariantes:

| Test | Líneas | Qué guarda | Riesgo para Drive |
| ---- | ------ | ---------- | ----------------- |
| `reads process.env only in src/config/env.ts` | 26-33 | escanea **todos** los `src/**/*.ts` no-test (excluye `generated/`) buscando la cadena `process.env` | 🔴 **Alto.** Las credenciales de Drive **deben** entrar por `config/env.ts` y llegar al plugin vía `fastify.config`. Ojo: el chequeo es `readFileSync(...).includes('process.env')` — **incluso mencionarlo en un comentario rompe el test**. |
| `contains the target tree of docs/architecture.md` | 35-52 | lista `expected` de archivos que **deben existir** | 🟢 Bajo: solo verifica ausencias, no prohíbe archivos nuevos. Si el spec declara un árbol objetivo para Drive, es coherente añadirlos aquí. |
| `has no src/routes/ directory` | 54-56 | `src/routes/` no debe existir | 🟢 No aplica. |
| `keeps expenses.routes.ts free of data access` | 58-62 | `expenses.routes.ts` sin la cadena `prisma` | 🟢 No aplica, pero es el **precedente del guardián por capa**: si Drive expone rutas, cabe un guardián análogo (ruta sin referencia al cliente de Drive). |

**Precedente para "comprobar la conexión"** (`intent`, `feature_list.json:83`):
`GET /health/db` en `health.routes.ts:13-21` es el molde exacto —
`try { ping } catch { 503 }`, **sin** `throw`, respuesta de readiness
deliberada con shape propio (`{ status, database }`), log con
`fastify.log.error(error, 'msg')`:

```ts
fastify.get('/health/db', async (_request, reply) => {
  try {
    await fastify.prisma.$queryRaw`SELECT 1`
    return { status: 'ok', database: 'up' }
  } catch (error) {
    fastify.log.error(error, 'Database health check failed')
    return reply.status(503).send({ status: 'error', database: 'down' })
  }
})
```

Un `GET /health/drive` análogo encaja sin fricción y `health/` **no tiene
service** por decisión (`design.md:283-288`: es un ping de infra, no negocio).
Si se añade, se documenta en `docs/api-contract.md:167-175` ("Endpoints de
operación (no de dominio)", tabla que hoy lista `/health` y `/health/db`).

**Config de tests** (`vitest.config.ts`): `environment: 'node'`,
`setupFiles: ['dotenv/config']` (los tests leen el `.env` real), `LOG_LEVEL:
'silent'`. → **Si las credenciales de Drive son obligatorias en `loadConfig`,
toda la suite existente falla en cuanto no estén en el `.env` local**, porque
`buildApp()` llama a `loadConfig()` por defecto (`app.ts:13`). Consecuencia a
resolver en el spec: ¿obligatorias (y entonces `.env` de CI/local debe tenerlas)
u opcionales con degradación? El `intent` (`feature_list.json:82`) pide *"falla
o avisa con un mensaje claro"* — el **"o avisa"** deja la puerta abierta y es
justo la ambigüedad que la puerta de aprobación humana debe resolver.

---

## 11. Mapa de enganche propuesto (resumen para el spec)

> Ubicaciones derivadas de las reglas citadas. Los nombres son ilustrativos;
> las decisiones delegadas (librería, mecanismo de auth) **no** se toman aquí.

| Archivo | Acción | Patrón a copiar |
| ------- | ------ | --------------- |
| `src/config/env.ts` | MODIFICAR: campos en `AppConfig`, bloques `if`, **`\|\| !xxx` en el guard de `:60`**, campos en el `return` | `env.ts:30-33` |
| `src/config/env.test.ts` | MODIFICAR: casos con env sintético (presente / ausente / inválido) | `env.test.ts:41-47` |
| `src/lib/drive.ts` | CREAR: fábrica pura `createDriveClient(credentials)`, **sin leer env**, + `export type AppDriveClient = ReturnType<typeof …>` | `lib/prisma.ts:13-19` |
| `src/plugins/drive.ts` | CREAR: `declare module` + fábrica desde `fastify.config` + `decorate` + `onClose` + `export default fp(plugin, { name: 'drive' })` | `plugins/prisma.ts` completo |
| `src/app.ts` | MODIFICAR: `app.register(drivePlugin)` en la zona de infra (`:22-24`) | `app.ts:24` |
| `src/errors/app-error.ts` | MODIFICAR: subclase de error de Drive (el handler no se toca) | `app-error.ts:17-21` |
| `src/modules/health/health.routes.ts` | MODIFICAR (si se acepta el chequeo): `GET /health/drive` | `health.routes.ts:13-21` |
| `.env.example` + `docs/stack.md:90-100` | MODIFICAR: variables nuevas | tabla existente |
| `docs/architecture.md` | MODIFICAR: **ADR-007** (librería + auth + trade-off) — exigido por `architecture.md:207-208` | ADR-005/006 (`:157-196`) |
| `docs/api-contract.md` | MODIFICAR (si hay endpoint o `code` nuevo): tabla de códigos `:44-48` y/o endpoints de operación `:167-175` | — |

**Decisiones abiertas que el spec debe resolver explícitamente** (ninguna se
toma en esta exploración):
1. Conexión **eager** (como Prisma) vs. **lazy** + chequeo bajo demanda — §3.
2. Credenciales **obligatorias** en `loadConfig` (rompe la suite sin `.env`) vs.
   opcionales con degradación — §10.
3. Umbral de ADR-006: seguir con validador manual al llegar a ~7-8 variables vs.
   reevaluar `@fastify/env` — §1.
4. Postura de testeo de I/O de red (doble en el seam vs. solo smoke manual) — §6.
5. `googleapis` u otra librería, con trade-off anotado como ADR-007 — §6, regla 7.
6. Derivar el bloque `acceptance` ausente de la feature 3 — §8.
