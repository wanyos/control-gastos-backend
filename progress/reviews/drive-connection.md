# Review — feature 3 `drive-connection`

**Veredicto:** APPROVED

Revisado el 2026-07-20. SDD (`"sdd": true`). Única feature `in_progress` en
`feature_list.json` (transición correcta `spec_ready` → `in_progress`; el
implementer NO la marcó `done`). Se abrieron y leyeron los tests uno a uno, no
solo la tabla del informe. `bash ./init.sh` ejecutado por el reviewer termina en
verde. Las restricciones duras se confirmaron por grep/lectura directa.

## Trazabilidad requirements ↔ tests (SDD, Nivel 4)

Cada `R<n>` verificado abriendo el test real y confirmando que prueba el
resultado concreto, no solo "no lanza".

- R1: [x] `env.test.ts` `builds a typed config from a complete environment` (:24),
  `applies defaults when only the required variables are present` (:42),
  `exposes the three Drive credentials under config.drive` (:60) -> `config.drive`
  igual a los tres valores.
- R2: [x] `env.test.ts` throws naming CLIENT_ID (:86), CLIENT_SECRET (:96),
  REFRESH_TOKEN (:106), `names every missing Drive variable in a single error
  message` (:116, regex con las tres).
- R3: [x] `env.test.ts` `collects all problems into a single error message`
  (:122, regex DATABASE_URL/PORT/LOG_LEVEL — regresión protegida),
  `lists the missing Drive variables alongside the preexisting ones` (:128).
- R4: [x] `drive.test.ts` `createDriveAuth sets the refresh token on the OAuth2
  client (R4)` (:36) -> `client.credentials.refresh_token` toBe el valor pasado.
- R5: [x] `drive.test.ts` `createDriveClient builds a client with an invocable
  about.get, no network (R5)` (:42); refuerzo en `plugins/drive.test.ts` (:22).
- R6: [x] `drive.test.ts` `exposes the exact full-drive scope as a constant (R6)`
  (:48) -> valor exacto https://www.googleapis.com/auth/drive.
- R7: [x] `plugins/drive.test.ts` (:22) + `exposes fastify.drive to a route
  registered after the plugin (R7)` (:29) -> ruta posterior lee `fastify.drive`.
- R8: [x] `plugins/drive.test.ts` (:22): `buildApp()` + `await app.ready()` con
  las credenciales placeholder de `vitest.config.ts` RESUELVE. Con handshake
  eager fallaria con invalid_client. Prueba concreta del arranque lazy.
- R9: [x] `health.test.ts` (:43) -> 200, cuerpo toEqual({status:ok,drive:up}),
  payload.not.toContain(email).
- R10: [x] `health.test.ts` (:85) -> 503 cuerpo exacto y `/health` sigue 200.
- R11: [x] `drive.test.ts` `returns the connected account email on success (R11)`
  (:52) -> resolves.toBe(owner@example.com).
- R12: [x] `drive.test.ts` (:66) -> el doble rechaza con `1//fake-token-value`;
  se afirma .message not.toContain('1//fake-token-value') Y toBe('Cannot reach
  Google Drive'). Comprueba el mensaje, no solo que envuelve.
- R13: [x] `app-error.test.ts` (:51) + (:61) -> instanceof AppError, code,
  statusCode, message, name.
- R14: [x] `architecture.test.ts` (:66) -> nombra las tres y descarta patrones de
  credencial real (1//... y GOCSPX-...).
- R15: [x] `architecture.test.ts` `reads process.env only in src/config/env.ts`
  (:26); guardián que ahora cubre `lib/drive.ts` y `plugins/drive.ts`. Grep: 0
  ocurrencias de process.env en ambos.
- R16: [x] Suite completa verde con placeholders (`vitest.config.ts:14-19`), sin
  red ni credenciales reales. Verificado con `bash ./init.sh`.
- R17: [x] `architecture.test.ts` (:77). Grep: 0 `files.` en `src/lib/drive.ts`.
  Única llamada Drive es `about.get` (`drive.ts:112`).
- R18: [x] `bash ./init.sh` -> `[OK] Entorno listo` (ver abajo).
- R19: [x] `drive.test.ts` un test por síntoma: invalid_grant (:76),
  invalid_client (:86), accessNotConfigured reason anidado (:94),
  insufficientPermissions reason anidado (:107), genérico (:118) -> cada uno
  afirma el message fijo exacto.
- R20: [x] `health.test.ts` (:63) -> infoSpy toHaveBeenCalledWith({account:
  owner@example.com}, 'Drive connection verified'); y el cuerpo 200 sin el email.
  El email va al log, no al body.
- R21: [x] Proceso, verificado a mano: `docs/api-contract.md` tiene
  `GET /health/drive` (:184 y :186-205) y `DRIVE_CONNECTION_ERROR` (503) en la
  tabla de códigos (:49), con nota de que hoy ningún endpoint de dominio lo
  devuelve en el body (:51-57).
- R22: [x] Proceso, verificado a mano: `docs/architecture.md` con ADR-007
  (:207-261), nota del umbral de ADR-006 evaluado a 7 variables (:199-205) y árbol
  con `plugins/drive.ts` (:55) y `lib/drive.ts` (:59). `docs/stack.md` con las
  tres variables (:105-107) y `@googleapis/drive` (:30-33).
- R23: [x] Proceso, verificado a mano: `scripts/get-drive-refresh-token.mjs`
  existe FUERA de `src/`, con access_type offline, prompt consent y
  scope [driveScope] (:32-36). Lo ejecuta el humano en T25.

## Tasks completas (SDD)

- T1-T24: [x] todas hechas y verificadas contra el código.
- T25: [ ] correctamente pendiente — smoke test manual del humano (Nivel 3,
  contra Drive real), documentado como tal en `tasks.md:178` y en el informe. No
  bloquea el cierre: toda la verificación automática es verde sin credenciales.

## Restricciones duras (todas confirmadas)

- [x] `src/architecture.test.ts` verde; `process.env` NO aparece en
  `src/lib/drive.ts` ni `src/plugins/drive.ts` (grep directo: 0, ni en comentarios).
- [x] `google-auth-library` NO está en `dependencies` de `package.json` (grep: 0).
  Solo `@googleapis/drive@^20.2.0` (`package.json:34`). Se usa el `auth`
  reexportado (`drive.ts:1`).
- [x] `driveErrorMessage` (`drive.ts:52-67`) NO interpola `error.message`: cada
  rama devuelve una constante de `driveErrorMessages` (`drive.ts:38-44`). La
  detección de síntomas usa `errorSignals`, cuyo texto nunca se devuelve.
- [x] `src/plugins/drive.ts` NO hace handshake de red al registrar: el cuerpo del
  plugin (:22-26) solo hace `createDriveClient(fastify.config.drive)` + `decorate`.
  Sin `$connect()`-equivalente, sin `about.get`, sin log de arranque, sin
  `onClose` — las 3 diferencias deliberadas con `plugins/prisma.ts`.
- [x] Alcance: única llamada Drive es `about.get` (`drive.ts:112`); 0 `files.*`
  en `src/lib/drive.ts` (grep + guardián R17).
- [x] `.env.example` con las 3 variables en placeholders (:14-16), sin valores con
  forma real. `.env` no aparece en `git status` (no se tocó).
- [x] `docs/stack.md`: el implementer solo tocó la tabla de variables y las
  librerías clave (git diff). La línea del gestor de paquetes (pnpm) NO se tocó;
  no se reintrodujo npm.

## Criterios de aceptación (feature_list.json)

- [x] Tokens frescos desde el refresh token sin intervención -> R4 (`drive.ts:18-25`).
- [x] Falta credencial -> no arranca listando qué falta, sin red -> R2/R3 (`env.ts:66-92`).
- [x] Comprobación bajo demanda que no tumba la app -> R9/R10 (`health.routes.ts:26-38`).
- [x] Cliente reutilizable expuesto a toda la app -> R7 (`plugins/drive.ts`, `app.ts:26`).
- [x] Ninguna credencial en código/repo/logs; `.env.example` solo placeholders -> R12/R14.
- [x] No crea/sube/mueve archivos, no toca bancos/parsers -> R17 + revisión del diff.
- [x] Lista numerada de pasos manuales del humano -> `design.md` §10 + R23.
- [x] Cada `R<n>` con test, mapeado en el informe -> verificado uno a uno arriba.
- [x] `./init.sh` verde, suite completa -> ejecutado.
- [x] ADR en architecture.md, variables en stack.md/.env.example, api-contract.md -> R21/R22.

## Arquitectura (docs/architecture.md)

- [x] Principio 4 (config centralizada): las credenciales entran solo por
  `config/env.ts` y viajan por `fastify.config.drive`. `lib/drive.ts` y
  `plugins/drive.ts` reciben por parámetro, no leen entorno.
- [x] Principio 5 (composición por plugins): `drivePlugin` con `fp`, registrado en
  `app.ts:26` en la zona de infraestructura tras `prisma`.
- [x] Principio 3 (errores tipados): `DriveConnectionError` subclasa `AppError`;
  el handler central no se tocó (despacha por instanceof).
- [x] ADR-004 (árbol por módulos): archivos en su sitio; guardián del árbol verde.
- [x] ADR-007 documentado; sin dependencias nuevas no anotadas.

## Convenciones (docs/conventions.md)

- [x] Inglés en todo el código; tests descriptivos en inglés.
- [x] ESM con extensión `.js` en imports relativos; vendor antes que relativos;
  `import type` para lo que es solo tipo.
- [x] Comillas simples, sin `;`, 2 espacios, 100 columnas -> `pnpm lint` y
  `pnpm format:check` en verde (incluido el `.mjs`).
- [x] Dobles de test tipados con `as unknown as` (`drive.test.ts:19,23`,
  `health.test.ts:39`).
- [x] Sin `console.log` en `src/`; se usa `fastify.log`. (El `.mjs` fuera de la
  app sí usa `console`, correcto: es un one-shot de CLI.)

## Verificación (docs/verification.md)

- [x] Tests con los recursos correctos: dobles en el seam donde no hay "Drive
  local" (postura declarada en `design.md` §8); `/health/db` sigue contra Postgres
  real. Sin mocks innecesarios.
- [x] Tests verifican output concreto: cuerpos exactos con toEqual, mensajes
  exactos con toBe, ausencia del token/email con not.toContain. No hay tests de
  "solo no lanza".

## CHECKPOINTS.md

- [x] C1 — Arnés completo (init.sh verde).
- [x] C2 — Estado coherente (1 sola `in_progress`; no marcada `done`).
- [x] C3 — Arquitectura y convenciones respetadas; 1 dependencia nueva anotada en
  ADR-007 y stack.md; sin logs de debug ni TODOs sueltos en `src/`.
- [x] C4 — Verificación real: test por módulo nuevo, camino feliz y de error.
- [x] C5 — Sesión coherente; sin archivos sospechosos sin trackear.
- [x] C6 — Coherencia con hermanos: `docs/api-contract.md` actualizado (fuente de
  verdad para el frontend); no hay endpoints inventados fuera del contrato.
- [x] C7 — SDD: 3 archivos de spec, EARS, tasks del implementer `[x]`, cada `R<n>`
  con test o verificación de proceso.
- [x] C8 — Resumen de cierre escrito (ver abajo).

## init.sh (ejecutado por el reviewer, 2026-07-20)

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────  Test Files  8 passed (8)
                              Tests  61 passed (61)
── 6. Resumen ──────────────  [OK] Entorno listo. Puedes empezar a trabajar.
```

61 tests (35 baseline + 26 nuevos), 8 archivos. Los 35 originales siguen verdes:
el test de regresión protegido `collects all problems into a single error message`
(env.test.ts:122) y los 2 de `/health` y `/health/db` (health.test.ts:20,27) están
intactos. `pnpm lint` y `pnpm format:check` también en verde.

## Alcance no desbordado

Confirmado por `git status`: los archivos tocados coinciden exactamente con
`design.md` §1. Nada de la feature 4 (carpetas, subir/mover, `files.*`). No se
tocó `.env`. La línea del gestor de paquetes de `stack.md` intacta.

## Resumen de cierre

- Escrito en `progress/summaries/drive-connection.md` -> sí.

## Cambios requeridos

Ninguno. Trabajo sólido: la sanitización de R12 está bien resuelta (constantes
fijas + detección sobre señales que nunca se devuelven), el arranque lazy está
probado de verdad (R8), y las tres diferencias con el plugin de Prisma están
respetadas.
