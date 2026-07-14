# Design — Feature 3: drive-connection

> CÓMO se construye lo descrito en `requirements.md`. No reinventa decisiones:
> aplica el Principio 5 (composición por plugins), ADR-004 (dónde va cada
> archivo), ADR-005 (errores) y ADR-006 (config) de `docs/architecture.md`, y
> copia el triángulo `config/` + `lib/` + `plugins/` del precedente de Prisma.
> Las decisiones delegadas se resuelven aquí con su alternativa descartada.
>
> 🚨 **Tus pasos manuales están en la §10.** Sin ellos la tubería existe pero no
> tiene con qué conectar.

## 1. Estado actual → estado final

Hoy el backend no sabe hablar con Drive. No hay ningún cliente HTTP saliente
que reutilizar: la feature 2 excluyó explícitamente esa pieza
(`specs/foundations/requirements.md:9-12`), así que **esta feature es el primer
consumidor saliente del proyecto** y crea el precedente. Lo único que se
reutiliza es el triángulo config/lib/plugins.

```
src/
  config/
    env.ts                  # MODIFICAR: 3 variables nuevas + AppConfig.drive (R1-R3)
    env.test.ts             # MODIFICAR: fixture baseEnv + casos nuevos
  lib/
    drive.ts                # CREAR: scope, fábricas, checkDriveConnection (R4-R6, R11, R12, R19)
    drive.test.ts           # CREAR: unitarios con dobles en el seam
  plugins/
    drive.ts                # CREAR: plugin fp que decora fastify.drive (R7, R8)
  errors/
    app-error.ts            # MODIFICAR: + DriveConnectionError (R13)
    app-error.test.ts       # MODIFICAR: + test de la subclase
  modules/health/
    health.routes.ts        # MODIFICAR: + GET /health/drive (R9, R10, R20)
    health.test.ts          # MODIFICAR: + tests del endpoint con doble
  app.ts                    # MODIFICAR: app.register(drivePlugin)
  architecture.test.ts      # MODIFICAR: árbol + guardián de .env.example y de alcance
vitest.config.ts            # MODIFICAR: placeholders de Drive (R16)
scripts/
  get-drive-refresh-token.mjs  # CREAR: one-shot fuera de la app (R23)
.env.example                # MODIFICAR: las 3 variables con placeholders (R14)
docs/{architecture,stack,api-contract}.md  # MODIFICAR (R21, R22)
```

**No se toca** `src/plugins/error-handler.ts`: ya despacha por
`instanceof AppError`, así que `DriveConnectionError` funciona sin cambiarlo.

## 2. Decisión delegada #1 — variables de entorno y su validación

**Nombres:** `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
`GOOGLE_DRIVE_REFRESH_TOKEN`. Siguen el estilo `UPPER_SNAKE` existente y el
prefijo agrupa la familia. Las tres **obligatorias** (decisión 2 del humano).

**Forma en `AppConfig`: anidada.**

```typescript
export interface DriveCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export interface AppConfig {
  databaseUrl: string
  port: number
  host: string
  logLevel: LogLevel
  drive: DriveCredentials
}
```

- **Por qué anidada:** las tres viajan siempre juntas y tipan exactamente el
  parámetro de `createDriveClient`, así que el plugin queda
  `createDriveClient(fastify.config.drive)` sin re-empaquetar nada.
- **Alternativa descartada — tres campos planos** (`googleDriveClientId`, …),
  que sería más fiel al precedente de las 4 claves actuales: obliga al plugin a
  reconstruir el objeto a mano en cada uso y separa tres valores que no tienen
  sentido por separado. **Trade-off aceptado:** `AppConfig` deja de ser plana.
  `DriveCredentials` se define en `config/env.ts` y `lib/drive.ts` la importa
  (la dirección correcta: `lib/` depende de la config, no al revés).

**Patrón de validación — los 4 pasos obligatorios** (§1 de la exploración de
foundations). Copiar el bloque de `env.ts:30-33` una vez por variable:

```typescript
const driveClientId = env.GOOGLE_DRIVE_CLIENT_ID
if (!driveClientId) {
  problems.push('GOOGLE_DRIVE_CLIENT_ID is required (Google Cloud OAuth client id)')
}
```

> 🔴 **Dos trampas que el implementer NO puede saltarse:**
>
> 1. **El guard del `throw` (`env.ts:60`).** Hoy es
>    `if (problems.length > 0 || !databaseUrl)`. Cada variable obligatoria nueva
>    **debe sumar su propio `|| !xxx`** o el `return` de `env.ts:66` no compila
>    con `strict` (el `|| !x` es redundante en runtime pero es lo que estrecha
>    `string | undefined` → `string`). Queda:
>    `if (problems.length > 0 || !databaseUrl || !driveClientId || !driveClientSecret || !driveRefreshToken)`.
> 2. **El orden de los bloques.** Los tres bloques de Drive van **después** del
>    de `LOG_LEVEL`. El test existente `collects all problems into a single
>    error message` afirma el orden con la regex
>    `/DATABASE_URL[\s\S]*PORT[\s\S]*LOG_LEVEL/`: si los bloques de Drive se
>    intercalan antes, el test se cae.

## 3. Veredicto explícito sobre el umbral de ADR-006

`docs/architecture.md:194-196` fija: *"si las variables crecen (>8-10) o
aparecen tipos complejos, reevaluar `@fastify/env`"*. Hoy son 4; con Drive son
**7**; la feature 4 añadirá el fileId de la carpeta raíz → **8**.

**Veredicto: se mantiene el validador manual. No se adopta `@fastify/env`.**

1. **El umbral aún no se cruza**: 7 de 8-10, y la 8ª llega en otra feature.
2. **Las tres nuevas son el caso más simple posible**: strings obligatorios no
   vacíos, sin coerción, sin enum, sin rango. Son ~12 líneas siguiendo un patrón
   que ya existe. No son el *"tipo complejo"* que el umbral vigila.
3. **El motivo estructural que descartó `@fastify/env` en ADR-006 no ha
   cambiado**: valida **dentro** del ciclo de plugins, y eso sigue siendo
   demasiado tarde para el `logLevel`, que se necesita para construir la
   instancia de Fastify (`app.ts:14-18`). Migrar hoy dejaría un híbrido (la
   config crítica a mano + el resto declarativo), que es peor que cualquiera de
   los dos extremos.
4. **Cuándo reevaluar de verdad** (que quede escrito en ADR-006, tarea T19):
   cuando la feature 4 lleve la cuenta a 8 **y** aparezca la primera variable
   que no sea un string plano.

## 4. Decisión delegada #2 — librería y forma del cliente

### Librería: `@googleapis/drive@^20.2.0`, y **solo** esa

Validado contra el registro npm hoy (2026-07-14), confirmando la exploración:

| Paquete | Versión | Tamaño desempaquetado | Dependencias directas |
| ------- | ------- | --------------------- | --------------------- |
| `googleapis` | 173.0.0 | **207.485.089 B ≈ 207 MB** | `google-auth-library`, `googleapis-common` |
| `@googleapis/drive` | **20.2.0** | **2.454.923 B ≈ 2,45 MB** | `googleapis-common@^8.0.0` |

- **Decisión:** `@googleapis/drive@^20.2.0`. Es **~85x más ligera** que
  `googleapis` para funcionalidad idéntica en Drive; el monolito empaqueta los
  tipos generados de cientos de APIs (Ads, BigQuery, YouTube…) de las que
  usaríamos una. Trae tipos de primera parte (`drive_v3.Schema$About`, …), la
  mantiene Google y `engines: node >=12` encaja con el `>=20` del proyecto.
- **Alternativa descartada — `googleapis`:** 207 MB penalizan `pnpm install`, la
  imagen de Docker y el arranque de `tsc`/IDE, a cambio de nada.
- **Alternativa descartada — `google-auth-library` sola:** da el auth pero no el
  cliente de Drive; habría que escribir a mano las llamadas HTTP y sus tipos,
  perdiendo los tipos generados. `@googleapis/drive` ya la incluye
  transitivamente y solo añade ~1,9 MB sobre ella.

> 🔴 **NO declarar `google-auth-library` como dependencia directa.** Verificado
> hoy: `googleapis-common@8.0.2` la fija en **versión exacta** (`10.5.0`, sin
> `^`). Declararla en `package.json` metería **dos copias** en el árbol; el
> `OAuth2Client` de una copia pasado al cliente de Drive que espera la otra da
> fallos por `instanceof` y desajustes de tipos difíciles de diagnosticar. Se usa
> el `auth` que **`@googleapis/drive` ya reexporta**, que por construcción es la
> misma copia. Cero dependencias extra, cero drift.

### `src/lib/drive.ts` — fábrica pura, sin Fastify y sin env

Copia el rol de `lib/prisma.ts`: recibe las credenciales **por parámetro**, no
lee el entorno (R15).

```typescript
export const driveScope = 'https://www.googleapis.com/auth/drive'

export function createDriveAuth(credentials: DriveCredentials): OAuth2Client
export function createDriveClient(credentials: DriveCredentials): AppDriveClient
export type AppDriveClient = ReturnType<typeof createDriveClient>

/** Returns the connected account email. Wraps every failure (R12, R19). */
export async function checkDriveConnection(client: AppDriveClient): Promise<string>
```

`createDriveAuth` existe separada **para que R4 sea testeable**: permite afirmar
`.credentials.refresh_token` sin red y sin hurgar en las tripas del cliente de
Drive. Construye `new auth.OAuth2({ clientId, clientSecret })` +
`setCredentials({ refresh_token })`; ese refresh token es lo que hace que la
librería renueve los access tokens sola en cada llamada (R4). El tipo se deriva
con `ReturnType<typeof …>` como en `lib/prisma.ts:19`.

> ⚠️ **Spike de 5 minutos antes de construir encima (T2).** `@googleapis/drive`
> es **CommonJS** (verificado hoy: `main: build/index.js`, sin `"type": "module"`
> ni mapa `exports`). Bajo `NodeNext` + `esModuleInterop`, hay que comprobar que
> el import con nombre (`import { drive, auth } from '@googleapis/drive'`)
> resuelve en runtime — depende de que el `cjs-module-lexer` de Node detecte las
> asignaciones `exports.x = …` que emite `tsc` (normalmente sí). **Fallback
> garantizado si falla:** default import (`import drivePkg from '@googleapis/drive'`
> y desestructurar), que bajo `esModuleInterop` siempre entrega `module.exports`.
> No es un riesgo de diseño, solo de sintaxis de import.

### La llamada de comprobación: `about.get({ fields: 'user' })`

- **`fields` es OBLIGATORIO** en `about.get` (peculiaridad del método: sin él,
  400). Con `fields: 'user'` el payload es mínimo.
- **Alternativa descartada — `files.list({ pageSize: 1 })`:** igual de barata
  pero **ambigua**: puede devolver una lista vacía con `200 OK` tanto si el auth
  va bien como si la app no ve nada, así que no distingue "conectado" de "no veo
  nada". `about.get` devuelve contenido siempre que el auth sea válido y falla
  claramente si no: es un booleano honesto.
- **Descartado por alcance:** `fields: 'user,storageQuota'` (avisaría de un Drive
  lleno). Cuesta lo mismo, pero el aviso de cuota pertenece a la feature 4, que
  es la que sube archivos. Fuera de esta tubería.

### Mapeo de errores → mensaje (R19) y sanitización (R12)

```typescript
throw new DriveConnectionError(driveErrorMessage(error))
```

| Síntoma detectado en el error crudo | `message` fijo emitido |
| ----------------------------------- | ---------------------- |
| `invalid_grant` | `Drive refresh token is no longer valid; re-authorize the app` |
| `invalid_client` | `Drive OAuth credentials are not valid` |
| `accessNotConfigured` | `Drive API is not enabled in the Google Cloud project` |
| `insufficientPermissions` | `The Drive token lacks the required scope` |
| cualquier otro | `Cannot reach Google Drive` |

> 🔴 **Regla de oro de `driveErrorMessage`: detecta sobre el error crudo, pero
> emite una constante.** NUNCA interpola `error.message` en la salida. Un error
> de la librería puede llevar el token o una URL firmada en el mensaje, y ese
> `message` acaba en el log (R10) y podría acabar en una respuesta HTTP en la
> feature 4. Precedente de envoltura selectiva: `expenses.service.ts:51-62`
> (captura solo `P2025` y repropaga lo demás). R12 lo verifica con un token
> falso.

`checkDriveConnection` repropaga tal cual los `DriveConnectionError` que él
mismo haya lanzado (p. ej. respuesta sin `user.emailAddress`) para no
envolverlos dos veces.

## 5. Cómo se mantiene verde la suite de 35 tests (R16) — obligatorio

Hoy: **35 tests, 6 archivos, verdes** (verificado con `pnpm test` antes de
escribir este spec). Hacer obligatorias tres variables rompe la suite por **dos
vías distintas**, y cada una se arregla de una forma:

**Vía A — los tests que construyen la app entera.** `health.test.ts`,
`expenses.test.ts` y `error-handler.test.ts` llaman a `buildApp()`, que hace
`loadConfig()` por defecto (`app.ts:13`) leyendo el `process.env` real. Sin las
tres variables, `loadConfig` lanza y **caen los 3 archivos enteros**.

**Solución: placeholders en `vitest.config.ts`.**

```typescript
env: {
  LOG_LEVEL: 'silent',
  GOOGLE_DRIVE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_DRIVE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'test-refresh-token',
},
```

Funciona **por la misma razón que ya funciona `LOG_LEVEL: 'silent'`**, y el
comentario que hoy está en `vitest.config.ts:9` lo dice literal: *"dotenv does
not override already-set vars"*. Vitest fija estas variables antes de que el
setupFile `dotenv/config` corra, así que ganan al `.env` real.

Esto tiene una propiedad que va **más allá de mantener la suite verde**: la hace
**hermética**. La suite pasa en una máquina sin credenciales de Drive, sin red y
antes de que el humano haya hecho un solo paso en Google Cloud Console. Y solo
es posible gracias a la decisión 2 (lazy): con handshake eager, estas
credenciales falsas harían fallar cada `app.ready()` con `invalid_client`. De
hecho **R8 convierte esa propiedad en un test**: si alguien mete un `$connect()`
eager en el plugin de Drive, la suite se pone roja y dice por qué.

- **Alternativa descartada — exigir las tres claves en el `.env` local:** es la
  consecuencia que el humano asumió, y sigue siendo cierta para `pnpm dev`
  (§7). Pero como mecanismo **para la suite** es peor: bloquearía al implementer
  hasta que el humano complete los pasos manuales, ataría `pnpm test` a un
  archivo no versionado, y en una máquina con credenciales **reales** los tests
  del endpoint tocarían la red de verdad (lentos, flaky, rojos sin conexión).
  Los placeholders eliminan las cuatro cosas. `DATABASE_URL` sigue viniendo del
  `.env` real: la suite de integración necesita el Postgres de verdad y ahí sí
  hay contenedor local.

**Vía B — `env.test.ts`.** Sus tests **no** pasan por `process.env`: le inyectan
objetos sintéticos a `loadConfig(env)`, así que los placeholders no les llegan
(y es correcto que no les lleguen: prueban el validador). Rompen **3 de los 9**:
`builds a typed config from a complete environment`, `applies defaults when only
DATABASE_URL is present` y `accepts LOG_LEVEL=silent`.

**Solución: fixture `baseEnv` compartido.** Es una actualización deliberada de
los fixtures (los asserts de comportamiento no cambian), no una regresión:

```typescript
const driveEnv = {
  GOOGLE_DRIVE_CLIENT_ID: 'client-id',
  GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'refresh-token',
}
const baseEnv = { DATABASE_URL: databaseUrl, ...driveEnv }
```

- Los 3 tests rotos pasan `{ ...baseEnv, … }` y suman `drive: {…}` a su
  `toEqual`.
- `applies defaults when only DATABASE_URL is present` **se renombra** a
  `applies defaults when only the required variables are present`: con el cambio
  su nombre actual sería mentira.
- Los 6 restantes (`throws naming …`) siguen verdes sin tocarlos: sus regex
  siguen casando aunque el mensaje liste además las de Drive. Se les añade
  `baseEnv` igualmente para que sigan probando **una** variable a la vez y no
  pasen por accidente.

**Resultado esperado: 35 → ~54 tests, todos verdes, sin red y sin credenciales
reales.**

## 6. `src/plugins/drive.ts` — el triángulo, menos el handshake

Copia `plugins/prisma.ts` con **dos diferencias deliberadas**:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    drive: AppDriveClient
  }
}

async function drivePlugin(fastify: FastifyInstance) {
  const drive = createDriveClient(fastify.config.drive)   // ← desde fastify.config, nunca del entorno
  fastify.decorate('drive', drive)
}

export default fp(drivePlugin, { name: 'drive' })
```

| | `plugins/prisma.ts` | `plugins/drive.ts` |
| --- | --- | --- |
| Handshake al registrar | `await prisma.$connect()` (`:20`) | **ninguno** (decisión 2 del humano, R8) |
| Log al registrar | `'PostgreSQL connection established'` (`:21`) | **ninguno**: no hay nada que afirmar sin red, y decir "conectado" sin haber conectado sería mentira |
| `onClose` | `$disconnect()` (`:25-27`) | **ninguno**: el cliente de Drive es un envoltorio HTTP sin conexión que cerrar |
| `fp(…, { name })` | sí | **sí** (obligatorio: sin `fp` el decorator queda encapsulado y no lo ven las rutas) |

**Registro en `app.ts`**, en la zona de infraestructura, después de `prisma` y
antes de los módulos (el error handler sigue primero, `design.md:353` de
foundations):

```typescript
app.register(errorHandlerPlugin)
app.register(prismaPlugin)
app.register(drivePlugin)     // ← nuevo
```

`config` ya se decora antes de registrar plugins (`app.ts:20`), así que
`fastify.config.drive` está disponible en el cuerpo del plugin.

## 7. `GET /health/drive` — la comprobación bajo demanda

Va en `modules/health/health.routes.ts`, con el molde exacto de `/health/db`
(`health.routes.ts:13-21`): `try/catch`, **sin `throw`**, respuesta de readiness
con shape propio. `health/` **no tiene service** por decisión
(`specs/foundations/design.md:283-288`): es un ping de infraestructura, no
negocio.

```typescript
fastify.get('/health/drive', async (_request, reply) => {
  try {
    const account = await checkDriveConnection(fastify.drive)
    fastify.log.info({ account }, 'Drive connection verified')   // R20: al log, no al body
    return { status: 'ok', drive: 'up' }
  } catch (error) {
    fastify.log.error(error, 'Drive health check failed')        // ya es un DriveConnectionError sanitizado
    return reply.status(503).send({ status: 'error', drive: 'down' })
  }
})
```

- **Por qué el email va al log y no al body (R20):** `/health/drive` no tiene
  autenticación (`api-contract.md`: *"Autenticación: ninguna por ahora"*).
  Devolver el email expondría la cuenta del dueño a cualquiera que alcance el
  puerto; en el log tiene el mismo valor diagnóstico y ningún riesgo.
- **Por qué el `catch` puede loguear el error entero:** porque para cuando llega
  aquí **ya no es un error crudo**, es el `DriveConnectionError` sanitizado de
  `checkDriveConnection` (R12). Ese es justo el motivo de que la envoltura viva
  en `lib/` y no en la ruta.
- **Consecuencia para el arranque (asumida por el humano):** tras esta feature
  `pnpm dev` **no arranca** sin las tres variables en `.env` — el fail-fast de
  `server.ts:9-16` imprime qué falta y sale con código 1. El único camino a Drive
  que queda vivo sin credenciales es la suite (§5).

## 8. Postura de testeo del I/O de red — declarada y justificada

**No existe "Drive local".** Con Postgres hay contenedor (`docker-compose.yml`),
con Drive no hay equivalente. Esto es un caso nuevo que las reglas actuales no
cubren, así que se declara aquí:

> **Postura: seam inyectable + doble en el seam para los tests automáticos; el
> contacto real con Drive es smoke manual (Nivel 3 de `docs/verification.md`).**

Es coherente con lo que el proyecto ya hace, no una excepción inventada:

- El antipatrón registrado (`verification.md:107-108`) es *"mocks excesivos del
  entorno **cuando un recurso real es viable**"*. Aquí **no es viable**: la
  condición del antipatrón no se cumple.
- Hay **precedente vivo de dobles en el nivel unitario**:
  `error-handler.test.ts:8-23` construye `fakeRequest()`/`fakeReply()` con
  `vi.fn()` y castea con `as unknown as`. Y `loadConfig(env)` es inyectable **a
  propósito** para testear sin tocar `process.env` (`foundations/design.md:90-91`).
- El seam ya lo impone la arquitectura: los servicios son **funciones puras que
  reciben el cliente por parámetro** (`foundations/design.md:254-257`). Por eso
  `checkDriveConnection(client)` recibe el cliente y no lo importa.

**Dónde está cada doble:**

| Qué se prueba | Cómo | Sin red |
| ------------- | ---- | ------- |
| `createDriveAuth` / `createDriveClient` (R4, R5) | credenciales sintéticas; se afirma la forma del objeto | sí (construir no hace I/O) |
| `checkDriveConnection` (R11, R12, R19) | doble `{ about: { get: vi.fn() } }` que resuelve/rechaza | sí |
| `GET /health/drive` (R9, R10, R20) | Fastify desnudo + `decorate('drive', doble)` + `register(healthRoutes)` + `inject()` | sí |
| Plugin + arranque (R7, R8) | `buildApp()` + `ready()` con los placeholders de §5 | sí |
| **Que Drive de verdad responde** | **el humano, paso 9 de §10** | **no — es el punto** |

> El test del endpoint monta una instancia **desnuda** de Fastify con el doble
> decorado en vez de usar `buildApp()`, porque `buildApp()` ya decora `drive`
> con el cliente real y `decorate` no se puede pisar. `healthRoutes` es un plugin
> Fastify normal: registrarlo suelto es un test de integración legítimo de ese
> módulo. `/health/db` sigue probándose con `buildApp()` contra el Postgres real,
> sin cambios.

**El implementer NO se queda bloqueado esperando las credenciales del humano.**
Todo lo automático es verde sin ellas; el Nivel 3 es del humano y ocurre después
de la aprobación.

## 9. El script de un solo uso (R23)

`scripts/get-drive-refresh-token.mjs` — **fuera de `src/`, no forma parte de la
app**. Consecuencias de esa ubicación, todas verificadas:

- `tsconfig.json` tiene `include: ["src/**/*.ts"]` y `rootDir: "./src"` → **no**
  se typechequea ni se compila a `dist/`. Por eso se escribe en **`.mjs` plano**
  (Node ESM directo, `node scripts/get-drive-refresh-token.mjs`), no en `.ts`:
  meterlo en `tsconfig` rompería `rootDir`.
- `eslint.config.js` aplica a `files: ['src/**/*.ts']` → no se lintea.
- **Sí lo revisa Prettier** (`pnpm format:check` corre `prettier --check .` y
  `.prettierignore` no excluye `scripts/`) → debe ir formateado: comillas
  simples, sin `;`, 2 espacios, 100 columnas.
- **Sí puede leer `process.env`**: el guardián de `architecture.test.ts:26-33`
  solo escanea `src/`. Lee `GOOGLE_DRIVE_CLIENT_ID` y `GOOGLE_DRIVE_CLIENT_SECRET`
  del `.env` vía `import 'dotenv/config'`, que es lo que permite el llenado del
  `.env` en dos fases (§10, pasos 8 y 9).

Qué hace: `generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [driveScope] })`
→ levanta un servidor local efímero para recoger el `?code=…` del redirect →
`getToken(code)` → imprime el `refresh_token` por consola.

- **`access_type: 'offline'` es lo que hace que Google devuelva un refresh
  token.** Sin él no hay token que guardar.
- **`prompt: 'consent'` fuerza a emitir uno nuevo** aunque ya hubieras
  autorizado antes. Sin él, un segundo intento devuelve access token **sin**
  `refresh_token` y parece un bug de la app cuando no lo es.
**El scope en el script.** El script no puede importar `driveScope` de
`src/lib/drive.ts`: es un `.mjs` plano ejecutado con `node`, y ese `.ts` no está
compilado (nunca pasa por `tsc`, que solo emite `dist/` en `pnpm build`).
Opciones y decisión:

- **Decisión: repetir la constante en el script**, con un comentario que apunte a
  `src/lib/drive.ts` como fuente de verdad. Es la **única duplicación aceptada**
  del spec, y existe solo porque el script vive fuera del árbol tipado. El riesgo
  de que diverjan es nulo en la práctica: el script se ejecuta una vez en la vida
  de la instalación, y si el scope cambiara habría que rehacer el consentimiento
  a mano de todas formas (que es justo lo que hace el script).
- **Alternativa descartada — escribirlo en `.ts` y ejecutarlo con
  `npx tsx scripts/get-drive-refresh-token.ts`:** `tsx` sí resolvería el import y
  mataría la duplicación, pero deja un `.ts` fuera de `include`/`rootDir` —
  invisible para `pnpm typecheck` y para ESLint, es decir, un archivo TypeScript
  del repo que nadie verifica. Un `.mjs` es honesto sobre lo que es: un one-shot
  fuera de la app.

## 10. 🚨 PASOS MANUALES DEL HUMANO (Google Cloud Console)

> La consola cambió: el antiguo *"OAuth consent screen"* es ahora **"Google Auth
> Platform"** (Branding / Audience / Clients / Data Access). Los nombres de menú
> son los de esa UI (2026).
>
> **Hazlo todo con la cuenta de Google cuyo Drive quieres usar.** Si tienes
> varias sesiones abiertas, usa ventana de incógnito: equivocarse de cuenta es el
> error más común y más silencioso de este flujo (por eso existe R20).

1. **Crear el proyecto.** [console.cloud.google.com](https://console.cloud.google.com)
   → selector de proyecto → **New Project** → nombre `gastos-backend` →
   **Create**. Asegúrate de que queda seleccionado antes de seguir.
2. **Habilitar la Drive API.** **APIs & Services → Library** → busca *"Google
   Drive API"* → **Enable**. *(Saltarse esto hace que todo falle luego con
   `403 accessNotConfigured`.)*
3. **Configurar Google Auth Platform.** **Google Auth Platform → Get started**:
   *App name* `gastos-backend`; *User support email* el tuyo;
   **Audience → User type: `External`** (obligatorio: `Internal` no existe para
   cuentas personales); *Contact information* tu email → **Create**.
4. **Añadir el scope.** **Google Auth Platform → Data Access** → **Add or remove
   scopes** → pega en el filtro `https://www.googleapis.com/auth/drive` →
   márcalo → **Update** → **Save**. Aparecerá como **Restricted**: es lo
   esperado, es la decisión 1 que ya tomaste.
5. **🚨 PUBLICAR LA APP — EL PASO QUE MÁS IMPORTA.**
   **Google Auth Platform → Audience** → **Publish app** → confirmar → el
   *Publishing status* debe quedar en **"In production"**.
   - Google avisará de que la app *"needs verification"*. **Ignóralo y publica
     igual**: te ampara la excepción de uso personal (<100 usuarios).
   - **Si lo dejas en "Testing", el refresh token te caducará cada 7 días** y
     tendrás que repetir el paso 9 cada semana. La regla oficial ata los 7 días
     al *publishing status*, **no** al estado de verificación: publicar elimina
     la caducidad **aunque la app siga sin verificar**.
   - **Verifica que pone "In production" antes de continuar.**
6. **Crear el cliente OAuth.** **Google Auth Platform → Clients** →
   **Create client**:
   - *Application type*: **Desktop app** ← este, no "Web application". Los
     clientes Desktop admiten redirección a loopback (`http://localhost:<puerto>`)
     sin registrar la URI, que es lo que usa el script del paso 9.
   - *Name*: `gastos-backend-cli` → **Create**.
   - Copia el **Client ID** y el **Client secret**.
7. **Pegar las dos primeras claves en `.env`** (`GOOGLE_DRIVE_CLIENT_ID` y
   `GOOGLE_DRIVE_CLIENT_SECRET`). Ver `.env.example`.
8. **Obtener el refresh token — UNA SOLA VEZ.**
   `node scripts/get-drive-refresh-token.mjs`. Lo que verás:
   1. Elegir tu cuenta de Google (¡la correcta!).
   2. **"Google hasn't verified this app"** → **Advanced** →
      **Go to gastos-backend (unsafe)**. Es normal y esperado. Esta pantalla la
      verás **solo esta vez**.
   3. Pantalla de consentimiento pidiendo acceso a Drive → **Continue / Allow**.
   4. La terminal imprime el refresh token → pégalo en `.env` como
      `GOOGLE_DRIVE_REFRESH_TOKEN`.
   > ⚠️ **No busques el flujo "copiar/pegar el código" (OOB,
   > `urn:ietf:wg:oauth:2.0:oob`)**: Google lo desactivó en octubre de 2022.
   > Tutoriales viejos aún lo enseñan y ya no funciona.
   > **No repitas este flujo en bucle**: hay un límite de 100 refresh tokens
   > vivos por cuenta y client ID, y al superarlo el más antiguo se invalida
   > **silenciosamente**.
9. **Comprobar (el smoke test, Nivel 3).**
   ```bash
   pnpm dev
   curl -s http://localhost:3000/health/drive     # -> {"status":"ok","drive":"up"}
   ```
   Y **mira el log**: dirá `Drive connection verified` con el `account`. **Si esa
   cuenta no es la tuya, repite el paso 8 con la cuenta correcta.**

**Qué NO tienes que hacer todavía:** crear la carpeta `notas-banco/`. Eso es la
feature 4 (su fileId será una variable nueva entonces).

## 11. Borrador de ADR-007 (va a `docs/architecture.md`, tarea T19)

> Exigido por `architecture.md:207-208` (*"No añadir librerías nuevas sin anotar
> el trade-off aquí"*). Formato de ADR-005/ADR-006.

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
    pago**. No es subóptima: es un callejón sin salida.
  - **ADC:** no es un mecanismo de auth, solo descubrimiento de credenciales;
    acaba en una Service Account (mismo problema) o en credenciales de `gcloud`
    pensadas para desarrollo local, y añade magia implícita que dificulta el
    fail-fast al arrancar.
  - **Scope `drive.file` (no sensible):** descartado por el humano con las
    alternativas delante. **No sirve para el diseño acordado**: es acceso *por
    archivo*, no por carpeta — no ve la raíz creada a mano ni los archivos que el
    humano deposite a mano, que es el corazón de la idea nº1. No existe en OAuth
    de Google un scope de "solo esta carpeta y su árbol": el salto es binario.
  - **Handshake eager en el arranque (como Prisma `$connect()`):** descartado por
    el humano. Ataría cada `app.ready()` de la suite a una llamada de red real a
    Google, y no hay "Drive local" con el que compensarlo.
- **Consecuencias:**
  - **Coste asumido conscientemente:** el refresh token da acceso de
    lectura/escritura a **todo** el Drive del dueño; si se filtra, se filtra todo,
    no solo `notas-banco/`. Mitigaciones: solo en `.env` (gitignoreado), nunca en
    logs (los errores se envuelven), nunca en el repo (`.env.example` con
    placeholders, guardado por test), revocable en
    [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
  - **Riesgo residual:** publicar en producción una app no verificada con scope
    restringido está soportado por la excepción de uso personal (<100 usuarios),
    pero Google podría endurecer la política. Mitigación: el mapeo de errores
    reporta `invalid_grant` de forma legible, así que el síntoma sería un mensaje
    claro en el log y no un fallo opaco.
  - `pnpm dev` deja de arrancar sin las tres credenciales. La suite no las
    necesita: usa placeholders (posible solo gracias al arranque lazy).
  - La feature 4 hereda el cliente vía `fastify.drive` sin volver a resolver auth.
  - **Umbral de ADR-006 evaluado**: 7 variables tras esta feature; se mantiene el
    validador manual (razones en `specs/drive-connection/design.md` §3).

## 12. Riesgos y notas para el implementer

- 🔴 **Gestor de paquetes: `pnpm`, NO npm.** `pnpm add @googleapis/drive`.
  `docs/stack.md:35-36` dice npm y **está desactualizado** (discrepancia
  verificada: `init.sh:294-299` corre `pnpm test`, `node_modules` es un árbol
  pnpm). **NO arregles esa discrepancia**: está fuera de alcance y el leader ya
  se la ha reportado al humano. Toca de `stack.md` solo la tabla de variables y
  las librerías clave.
- 🔴 **El guardián busca la cadena literal `process.env`** en todos los
  `src/**/*.ts` no-test: **ni siquiera en un comentario** de `lib/drive.ts` o
  `plugins/drive.ts`.
- 🔴 **No toques `.env`** (es el archivo de secretos local del humano, no
  versionado). Solo `.env.example`.
- Imports relativos **con extensión `.js`** (ESM/NodeNext, ADR-001); vendor
  antes que relativos; `import type` para lo que sea solo tipo.
- El typecheck es estricto y **tipa también los tests**: los dobles necesitan el
  `as unknown as` del precedente `error-handler.test.ts:8-23`.
- Orden de trabajo pensado para que la suite esté roja el menor tiempo posible:
  `vitest.config.ts` y `env.test.ts` se arreglan **en la misma tanda** que
  `env.ts` (T5-T7), no después.
