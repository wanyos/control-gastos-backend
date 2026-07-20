# Resumen — feature 3 `drive-connection`

Fecha de cierre: 2026-07-20
Intención original: `feature_list.json` -> feature `drive-connection`, bloque `intent`
Spec (SDD): `specs/drive-connection/`

## Qué hace ahora la app que antes no

El backend ya sabe hablar con tu Google Drive. Al arrancar valida que las tres
credenciales OAuth de Drive están puestas (si falta alguna, no arranca y te dice
exactamente cuáles faltan, sin tocar la red). El cliente de Drive queda disponible
para toda la app como `fastify.drive`, listo para que la feature 4 lo use sin
volver a resolver el auth. Y hay un endpoint nuevo, `GET /health/drive`, que
comprueba bajo demanda si de verdad se llega a Drive. Antes el backend no tenía
ninguna forma de conectarse a Drive.

Importante: esto es solo la tubería de conexión. No crea carpetas ni sube/mueve
archivos (eso es la feature 4). La única llamada real a Drive es `about.get`, para
saber "conecto / no conecto" y con qué cuenta.

## Por dónde se usa (puntos de entrada)

- `GET /health/drive` — 200 `{ "status": "ok", "drive": "up" }` si Drive responde;
  503 `{ "status": "error", "drive": "down" }` si no. No tumba la app cuando Drive
  falla. La cuenta conectada (email) se registra en el log, nunca en la respuesta.
- `fastify.drive` — el cliente de Drive v3, disponible en cualquier ruta/plugin
  registrado después. Es lo que consumirá la feature 4.
- `node scripts/get-drive-refresh-token.mjs` — script de un solo uso (lo ejecutas
  tú una vez) para obtener el refresh token tras el consentimiento OAuth.

## Dónde está el código (para revisión directa)

| Qué | Archivo:línea |
|-----|---------------|
| Fábrica del cliente + auth OAuth2 + scope | `src/lib/drive.ts:10,18,31` |
| Comprobación de conexión (devuelve el email) | `src/lib/drive.ts:110` |
| Mapeo de errores a mensaje fijo (sin fuga de tokens) | `src/lib/drive.ts:38-67` |
| Plugin que expone `fastify.drive` (sin handshake) | `src/plugins/drive.ts:22-30` |
| Registro del plugin en la app | `src/app.ts:26` |
| Endpoint `GET /health/drive` | `src/modules/health/health.routes.ts:26-38` |
| Validación de las 3 variables al arrancar | `src/config/env.ts:66-92` |
| Error de dominio `DriveConnectionError` (503) | `src/errors/app-error.ts:29-33` |
| Placeholders que hacen hermética la suite | `vitest.config.ts:14-19` |
| Guardianes (.env.example sin secretos, sin `files.*`) | `src/architecture.test.ts:66,77` |
| Tests unitarios del cliente de Drive | `src/lib/drive.test.ts` |
| Tests del endpoint y del logueo del email | `src/modules/health/health.test.ts:42-102` |
| Tests del arranque lazy del plugin | `src/plugins/drive.test.ts` |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ "Arranca con las credenciales configuradas y establece conexión sin
  intervención en cada arranque" -> el refresh token deja que la librería renueve
  el access token sola; verificado en `src/lib/drive.test.ts:36` (R4). La conexión
  real end-to-end la valida tu smoke test (T25).
- ✅ "Falta o es inválida una credencial -> lo detecta y falla con mensaje claro"
  -> `loadConfig` lista todas las que faltan sin llamar a la red; verificado en
  `src/config/env.test.ts:86-132` (R2, R3).
- ✅ "Cuando compruebo la conexión, me dice si llega a Drive o no" ->
  `GET /health/drive` 200/503 sin tumbar la app; verificado en
  `src/modules/health/health.test.ts:43,85` (R9, R10).
- ✅ "Cualquier feature futura reutiliza la conexión sin volver a resolver el auth"
  -> `fastify.drive` decorado por plugin `fp`; verificado en
  `src/plugins/drive.test.ts:22,29` (R7).

Y los `que_no_quiero`:

- ✅ "No crear carpetas ni subir/leer/mover archivos" -> guardián de alcance:
  `src/lib/drive.ts` no contiene `files.*`; `src/architecture.test.ts:77` (R17).
- ✅ "No guardar credenciales ni tokens en el código ni el repo" -> `.env.example`
  solo con placeholders, guardado por test; `src/architecture.test.ts:66` (R14).
  Los mensajes de error nunca filtran el token; `src/lib/drive.test.ts:66` (R12).

## Decisiones que se tomaron por ti

- (delegado) **Auth = OAuth2 con refresh token de larga duración** (no Service
  Account, que no funciona con un Drive personal). ADR-007 en
  `docs/architecture.md:207`.
- (delegado) **Librería = `@googleapis/drive`**, no el monolito `googleapis`
  (~85x más pesado); y NO se declara `google-auth-library` aparte (se usa el
  `auth` reexportado). `package.json:34`, ADR-007.
- (delegado) **Variables en forma anidada** `drive: { clientId, clientSecret,
  refreshToken }` y la comprobación con `about.get`. `src/config/env.ts:5-9`,
  `src/lib/drive.ts:112`.
- (añadido) **Tabla de diagnóstico de 4 síntomas** (`invalid_grant`,
  `invalid_client`, `accessNotConfigured`, `insufficientPermissions`) con mensaje
  fijo y accionable cada uno; pediste "un mensaje claro", esto lo hace concreto.
  `src/lib/drive.ts:38-44` (R19). En especial `invalid_grant` avisa de que el
  token caducó (app dejada en "Testing").
- (añadido) **El email de la cuenta conectada se registra en el log** (no en la
  respuesta HTTP) para que detectes si consentiste con la cuenta equivocada.
  `src/modules/health/health.routes.ts:31` (R20).

## Qué NO se tocó / quedó fuera

- No se crean carpetas ni se suben/mueven archivos: es la feature 4.
- `about.get` pide solo `fields: 'user'`; el aviso de cuota (`storageQuota`) queda
  para la feature 4 (la que sube archivos).
- No se tocó `.env` (tus secretos locales) ni la línea del gestor de paquetes de
  `docs/stack.md`.
- El handler central de errores no se tocó: `DriveConnectionError` funciona por
  `instanceof AppError`.

## Notas para el futuro

- **Pendiente tuyo (T25):** haz los pasos manuales de `specs/drive-connection/design.md`
  §10 (Google Cloud Console) y ejecuta `node scripts/get-drive-refresh-token.mjs`.
  EL PASO QUE MÁS IMPORTA: publicar la app "In production"; si la dejas en
  "Testing", el refresh token caduca cada 7 días. Luego `pnpm dev` + `curl
  http://localhost:3000/health/drive` debe dar `{"status":"ok","drive":"up"}`, y el
  log debe mostrar TU cuenta.
- El scope es Drive completo (restringido): si el refresh token se filtra, alcanza
  todo tu Drive. Es una decisión que aceptaste con las alternativas delante
  (revocable en myaccount.google.com/permissions).
- Umbral de ADR-006 (config a mano vs. librería): con Drive vas por 7 variables;
  reevaluar de verdad cuando la feature 4 llegue a 8 y aparezca la primera variable
  que no sea un string plano. Nota en `docs/architecture.md:199-205`.
