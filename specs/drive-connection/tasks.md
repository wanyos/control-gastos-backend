# Tasks — Feature 3: drive-connection

> Checklist ordenada para el `implementer`. Cada task referencia los `R<n>` de
> `requirements.md` que cubre. Marcar `[x]` al completar; una task saltada exige
> justificación documentada (el reviewer rechaza si no).
>
> **Orden pensado para que la suite esté roja el menor tiempo posible:** primero
> lo aditivo (dependencia, error, lib), después el bloque de config **con sus
> tests y los placeholders de vitest en la misma tanda** (T5-T7 son
> indivisibles: en cuanto `env.ts` exige las tres variables, la suite se cae
> hasta que T6 y T7 estén hechas), después el cableado, después docs.
>
> 🔴 **`pnpm`, NO npm.** 🔴 **No toques `.env`** (secretos locales del humano),
> solo `.env.example`. 🔴 **No arregles la discrepancia npm/pnpm de
> `docs/stack.md:35-36`**: fuera de alcance, ya reportada al humano.
>
> 🚨 **Los pasos manuales del humano (Google Cloud Console) son la §10 de
> `design.md`.** No son tasks del implementer y no bloquean nada de lo de abajo:
> toda la verificación automática es verde sin credenciales reales.

## Dependencia y spike

- [ ] T1 — `pnpm add @googleapis/drive` (queda en `^20.2.0`). **NO añadir
      `google-auth-library`** como dependencia directa: `googleapis-common` la
      fija en versión exacta y una segunda copia rompe por `instanceof`
      (`design.md` §4). Cubre: R4, R5.
- [ ] T2 — **Spike de 5 min antes de construir encima:** comprobar que
      `import { drive, auth } from '@googleapis/drive'` resuelve en runtime bajo
      ESM/NodeNext. Si falla, usar el fallback de default import
      (`design.md` §4). Anotar cuál funcionó en
      `progress/implementations/drive-connection.md`. Cubre: R5.

## Error de dominio (aditivo, no rompe nada)

- [ ] T3 — Modificar `src/errors/app-error.ts`: añadir `DriveConnectionError`
      extendiendo `AppError` con `code: 'DRIVE_CONNECTION_ERROR'` y
      `statusCode: 503`. **No tocar `src/plugins/error-handler.ts`**: ya despacha
      por `instanceof AppError`. Cubre: R13.
- [ ] T4 — Modificar `src/errors/app-error.test.ts`: test de
      `DriveConnectionError` (`code`, `statusCode`, `message` por defecto,
      `instanceof AppError`). Cubre: R13.

## Configuración de entorno (T5-T7 van juntas o la suite se queda roja)

- [ ] T5 — Modificar `src/config/env.ts`: `interface DriveCredentials`, campo
      `drive` en `AppConfig`, y los tres bloques `if` de validación
      (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
      `GOOGLE_DRIVE_REFRESH_TOKEN`) siguiendo el patrón de `env.ts:30-33`.
      **Dos trampas obligatorias (`design.md` §2):** (a) sumar
      `|| !driveClientId || !driveClientSecret || !driveRefreshToken` al guard
      del `throw` (`env.ts:60`) o el `return` no compila con `strict`; (b) poner
      los tres bloques **después** del de `LOG_LEVEL` o se cae el test
      `collects all problems into a single error message`. Cubre: R1, R2, R3.
- [ ] T6 — Modificar `vitest.config.ts`: añadir al bloque `env` las tres
      credenciales placeholder junto a `LOG_LEVEL: 'silent'` (`design.md` §5).
      Esto es lo que mantiene verdes `health.test.ts`, `expenses.test.ts` y
      `error-handler.test.ts`, que llaman a `buildApp()` → `loadConfig()`.
      Cubre: R16.
- [ ] T7 — Modificar `src/config/env.test.ts`: fixture `baseEnv` (`DATABASE_URL`
      + las tres de Drive); arreglar los 3 tests que rompen (`builds a typed
      config…`, `applies defaults…` → **renombrar** a `applies defaults when only
      the required variables are present`, `accepts LOG_LEVEL=silent`); añadir
      `baseEnv` a los 6 restantes; tests nuevos: env completo → `config.drive`
      correcto; cada variable de Drive ausente → lanza nombrándola; las tres
      ausentes → un único mensaje que las nombra todas. Cubre: R1, R2, R3, R16.

## Cliente de Drive

- [ ] T8 — Crear `src/lib/drive.ts`: `driveScope`, `createDriveAuth`,
      `createDriveClient`, `type AppDriveClient = ReturnType<typeof …>`,
      `checkDriveConnection(client)` y el `driveErrorMessage` privado con la
      tabla de síntomas de `design.md` §4. Recibe `DriveCredentials` por
      parámetro; **no lee el entorno** (ni menciona la cadena `process.env`, ni
      en comentarios: el guardián la busca literal). `driveErrorMessage` **nunca
      interpola `error.message`** en su salida. Cubre: R4, R5, R6, R11, R12, R15,
      R19.
- [ ] T9 — Crear `src/lib/drive.test.ts` (unitarios, dobles en el seam, sin
      red): `createDriveAuth` → `.credentials.refresh_token` es el pasado;
      `createDriveClient` con credenciales sintéticas → devuelve cliente con
      `about.get` invocable; `driveScope` === el valor exacto;
      `checkDriveConnection` con doble que resuelve
      `{ data: { user: { emailAddress } } }` → devuelve el email; doble que
      rechaza con un error que contiene `1//fake-token-value` → lanza
      `DriveConnectionError` cuyo `message` **no** contiene esa cadena; un test
      por síntoma de la tabla (`invalid_grant`, `invalid_client`,
      `accessNotConfigured`, `insufficientPermissions`, genérico). Cubre: R4, R5,
      R6, R11, R12, R19.

## Cableado (plugin + endpoint)

- [ ] T10 — Crear `src/plugins/drive.ts`: `declare module` para tipar
      `fastify.drive`, `createDriveClient(fastify.config.drive)`, `decorate` y
      `export default fp(drivePlugin, { name: 'drive' })`. **Sin handshake, sin
      log de arranque y sin `onClose`** — las tres diferencias deliberadas con
      `plugins/prisma.ts` (`design.md` §6). Cubre: R7, R8, R15.
- [ ] T11 — Modificar `src/app.ts`: `app.register(drivePlugin)` en la zona de
      infraestructura, después de `prismaPlugin` y antes de los módulos.
      Cubre: R7.
- [ ] T12 — Crear `src/plugins/drive.test.ts`: `buildApp()` + `await
      app.ready()` con los placeholders → resuelve sin error y `app.drive` está
      definido con `about.get` (prueba concreta de que el arranque no toca la
      red: con handshake eager esto fallaría con `invalid_client`); y una ruta
      registrada después del plugin puede leer `fastify.drive`. Cubre: R7, R8.
- [ ] T13 — Modificar `src/modules/health/health.routes.ts`: `GET /health/drive`
      con el molde de `/health/db` (`try/catch`, sin `throw`) → 200
      `{ status: 'ok', drive: 'up' }` / 503 `{ status: 'error', drive: 'down' }`;
      `fastify.log.info({ account }, …)` en el camino feliz — **el email al log,
      nunca al body**. Cubre: R9, R10, R20.
- [ ] T14 — Modificar `src/modules/health/health.test.ts`: describe nuevo que
      monta un Fastify **desnudo** con `decorate('drive', doble)` +
      `register(healthRoutes)` + `inject()` (no `buildApp()`: ya decora `drive`
      con el real y `decorate` no se puede pisar, `design.md` §8). Casos: doble
      resuelve → 200 con cuerpo **exacto** y sin el email; espía del logger
      recibió el email; doble rechaza → 503 con cuerpo exacto y `/health` sigue
      respondiendo 200 después. **No tocar** los 2 tests existentes de `/health`
      y `/health/db`. Cubre: R9, R10, R20.

## Guardianes

- [ ] T15 — Modificar `src/architecture.test.ts`: (a) añadir `lib/drive.ts` y
      `plugins/drive.ts` a la lista `expected` del árbol objetivo; (b) guardián
      nuevo de `.env.example`: nombra las tres variables y **no** contiene
      valores con forma de credencial real (`/1\/\/[A-Za-z0-9_-]{20,}/`,
      `/GOCSPX-[A-Za-z0-9_-]{10,}/`); (c) guardián de alcance: `src/lib/drive.ts`
      no contiene `files.` (la superficie de archivos/carpetas es la feature 4).
      Cubre: R14, R17.

## Script de un solo uso (fuera de la app)

- [ ] T16 — Crear `scripts/get-drive-refresh-token.mjs`: `import 'dotenv/config'`,
      lee client id/secret del entorno (permitido: el guardián solo escanea
      `src/`), `generateAuthUrl({ access_type: 'offline', prompt: 'consent',
      scope: [<scope>] })`, servidor local efímero para el `?code=…`,
      `getToken(code)` e imprime el `refresh_token`. Repite la constante del
      scope con un comentario que apunte a `src/lib/drive.ts` como fuente de
      verdad (única duplicación aceptada, `design.md` §9). **Debe pasar
      `prettier --check`** (sí lo cubre; ESLint y `tsc` no). Cubre: R23.

## Documentación

- [ ] T17 — Modificar `.env.example`: las tres variables con **placeholders**
      (nunca valores reales), con un comentario que apunte a `design.md` §10 para
      obtenerlas. Cubre: R14.
- [ ] T18 — Modificar `docs/api-contract.md`: `GET /health/drive` en la tabla
      "Endpoints de operación" y `DRIVE_CONNECTION_ERROR` (503) en la tabla de
      códigos estables, anotando que hoy **no lo devuelve ningún endpoint de
      dominio** (solo se registra en logs) y que queda reservado para los
      endpoints de la feature 4. Cubre: R21.
- [ ] T19 — Modificar `docs/architecture.md`: añadir **ADR-007** (borrador
      literal en `design.md` §11); añadir `lib/drive.ts` y `plugins/drive.ts` al
      árbol de la §Estructura de carpetas; añadir al *"Umbral para reconsiderar"*
      de **ADR-006** la nota de que se evaluó el 2026-07-14 al llegar a 7
      variables y se mantuvo el validador manual, con el criterio de reevaluación
      (`design.md` §3). Cubre: R22.
- [ ] T20 — Modificar `docs/stack.md`: las tres variables en la tabla
      §Variables de entorno (las tres **obligatorias**) y `@googleapis/drive` en
      §Librerías clave. **NO tocar `stack.md:35-36`** (la línea del gestor de
      paquetes: fuera de alcance). Cubre: R22.

## Verificación final

- [ ] T21 — `pnpm test`: suite completa en verde, **sin credenciales reales de
      Drive y sin red**. Los 35 existentes siguen pasando. Cubre: R16.
- [ ] T22 — `pnpm typecheck`, `pnpm lint` y `pnpm format:check` en verde
      (recuerda: el `.mjs` de T16 sí lo revisa Prettier). Cubre: R18.
- [ ] T23 — `bash ./init.sh` → termina con `[OK] Entorno listo`. Cubre: R18.
- [ ] T24 — Escribir el mapa de trazabilidad `R<n>` → test concreto en
      `progress/implementations/drive-connection.md` (Nivel 4 de
      `docs/verification.md`), anotando explícitamente que **R21, R22 y R23 son
      requirements de proceso** verificados por checklist del reviewer, no por
      test (excepción consciente, precedente: R16/R17 de `specs/foundations/`).
      Cubre: todos.

## Smoke test del humano (Nivel 3 — NO es del implementer)

- [ ] T25 — **El humano** ejecuta los pasos manuales de `design.md` §10 y
      verifica `GET /health/drive` → `{"status":"ok","drive":"up"}` contra su
      Drive real, comprobando en el log que el `account` es su cuenta. Es la
      única verificación que toca la red de verdad. El implementer **no queda
      bloqueado** por esta task: la deja marcada como pendiente del humano.
      Cubre: R4 (end-to-end), R9, R20.
