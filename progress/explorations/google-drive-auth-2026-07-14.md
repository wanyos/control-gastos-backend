# Exploración: autenticación del backend con Google Drive (feature 3 `drive-connection`)

> Documento de **investigación**, no de implementación. No se ha escrito código,
> no se han instalado dependencias, no se ha tocado `package.json`.
>
> Convención de este documento:
> - Afirmaciones sin marca → **confirmadas con documentación** (fuente citada).
> - `(criterio propio)` → juicio del explorador, no documentación.
>
> Fecha de la investigación: 2026-07-14. Versiones de paquetes verificadas
> contra el registro npm ese día.

---

## TL;DR (las cuatro respuestas en una línea cada una)

1. **Auth**: OAuth2 con refresh token de larga duración. **Service Account está descartada**
   (no tiene cuota de almacenamiento y no puede poseer archivos en Drive personal).
   **CRÍTICO**: hay que publicar la app en modo **"In production"**, no "Testing", o el
   refresh token caduca **cada 7 días**.
2. **Librería**: `@googleapis/drive@20.2.0` (2,45 MB) en vez de `googleapis@173.0.0` (**207 MB**).
3. **Comprobación**: `about.get({ fields: 'user' })`. Y **cuidado**: el scope `drive.file`
   **NO sirve** para el diseño actual de la feature 4 — hace falta el scope `drive` completo
   (restringido) o cambiar el diseño. Ver §3.3, es una decisión que necesita al humano.
4. **Pasos manuales**: 9 pasos en Google Cloud Console. Ver §4.

**Dos decisiones bloqueantes para el humano al final del documento (§5).**

---

## 1. Mecanismo de auth

### 1.1 Las tres opciones evaluadas

#### Opción A — OAuth2 + refresh token de larga duración ✅ RECOMENDADA

El humano hace el consentimiento **una sola vez** a mano, se guarda el `refresh_token`
resultante en `.env`, y a partir de ahí el servidor arranca solo: la librería intercambia
el refresh token por access tokens frescos automáticamente, sin intervención humana.

> "Once the client has a refresh token, access tokens will be acquired and refreshed
> automatically in the next call to the API."
> — [google-auth-library-nodejs README](https://github.com/googleapis/google-auth-library-nodejs/blob/main/README.md) (vía ctx7)

Esto cumple exactamente el criterio de aceptación del intent: *"el backend puede establecer
conexión con mi Drive sin que yo tenga que intervenir a mano en cada arranque"*.

**Los archivos los posee el humano** (la app actúa *en nombre de* la cuenta personal), que es
justo lo que hace falta: las notas de banco viven en el Drive del dueño, con su cuota, y siguen
siendo suyas si algún día se apaga el backend.

#### Opción B — Service Account ❌ DESCARTADA, rompe el caso de uso

La sospecha del enunciado se confirma, y es peor de lo que parecía:

> "Service accounts don't have storage quota and can't own any files. Instead, they must
> upload files and folders into shared drives, or use OAuth 2.0 to upload items on behalf
> of a human user."
> — [Resolve errors | Google Drive API](https://developers.google.com/workspace/drive/api/guides/handle-errors)

Concretamente, el escenario "comparto mi carpeta con el email de la SA y que escriba ahí"
**falla en tiempo de ejecución**: al intentar crear/subir un archivo en una carpeta propiedad
de una cuenta personal, la SA recibe **`403 storageQuotaExceeded`** con el mensaje
*"Service Accounts do not have storage quota"*.
Reproducido y documentado por múltiples terceros:
[Google Developer forums](https://discuss.google.dev/t/error-403-storagequotaexceeded-when-the-service-accounts-drive-is-completely-empty/194265),
[n8n#26050](https://github.com/n8n-io/n8n/issues/26050).

Las dos vías de escape oficiales **tampoco están disponibles aquí**:

- **Shared Drives (unidades compartidas)**: requieren **Google Workspace de pago**. Una cuenta
  personal de Gmail no puede crearlas.
- **Domain-wide delegation** (la SA suplanta al humano): requiere ser administrador de un
  **dominio de Google Workspace**. Una cuenta personal de Gmail no pertenece a ningún dominio,
  así que **no se puede configurar**.

Conclusión: Service Account es un callejón sin salida para Drive **personal**. No es que sea
subóptima — es que la subida de archivos de la feature 4 fallaría con un 403.

#### Opción C — Application Default Credentials (ADC) ❌ No aplica

ADC no es un mecanismo de auth distinto: es un **mecanismo de descubrimiento de credenciales**.
Busca credenciales por orden (variable `GOOGLE_APPLICATION_CREDENTIALS` → gcloud CLI →
metadata server de GCP). Lo que acaba encontrando es, o bien una **service account**
(→ mismo problema que la opción B), o bien credenciales de usuario de `gcloud auth
application-default login` (pensadas para desarrollo local, no para un servidor desatendido).

En un servidor que no corre en GCP, ADC no aporta nada sobre la opción A: seguirías teniendo
que colocar el material de credenciales a mano. `(criterio propio)` Además añade una capa de
magia implícita que hace más difícil que la app **falle claro al arrancar** cuando falta una
credencial, que es otro criterio de aceptación explícito del intent.

### 1.2 ⚠️ EL PUNTO CRÍTICO: caducidad del refresh token (Testing vs In production)

**Esta es la decisión que más afecta al dueño del proyecto.** Si se hace mal, el backend se
cae cada 7 días y hay que rehacer el consentimiento a mano.

La regla oficial, citada literalmente:

> "A Google Cloud Platform project with an OAuth consent screen configured for an **external
> user type** and a publishing status of **'Testing'** is issued a **refresh token expiring
> in 7 days**"
> — [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2)

Y confirmado desde el otro lado:

> "Authorizations by a test user will expire **seven days** from the time of consent. If your
> OAuth client requests an `offline` access type and receives a refresh token, that token will
> also expire."
> — [Manage App Audience](https://support.google.com/cloud/answer/15549945)

**Lectura clave**: la regla de los 7 días está atada al **publishing status = "Testing"**,
**NO al estado de verificación**. Es decir: publicar la app a **"In production"** elimina la
caducidad de 7 días **aunque la app siga sin verificar**.

| | Testing | In production (sin verificar) |
|---|---|---|
| Caducidad del refresh token | **7 días** ☠️ | No caduca (salvo condiciones de §1.3) |
| Pantalla "app no verificada" | Sí | Sí (se pulsa *Advanced → Go to… (unsafe)*) |
| Límite de usuarios | 100 test users | 100 usuarios nuevos en total |
| ¿Sirve para este proyecto (1 usuario)? | **No** | **Sí** ✅ |

**¿Se puede publicar a producción sin pasar verificación, pidiendo el scope restringido `drive`?
Sí** — existe una excepción explícita de uso personal:

> "If the app is for your personal use (**fewer than 100 users**), you and your limited number
> of users can continue using the app **without going through verification**"
> — [When is verification not needed](https://support.google.com/cloud/answer/13464323)

El precio es cosmético y **de una sola vez**: en el consentimiento inicial aparece la pantalla
*"Google hasn't verified this app"*, se entra por *Advanced → Go to \<app\> (unsafe)*, y ya.
Como el consentimiento se hace **una vez en la vida** de la instalación, el humano ve esa
pantalla **una vez**.
([Unverified apps](https://support.google.com/cloud/answer/7454865))

> ⚠️ **Riesgo residual `(criterio propio)`**: publicar en producción una app no verificada con
> scope restringido es un estado soportado por la excepción de uso personal, pero Google podría
> endurecer la política en el futuro (ya obliga a re-verificación anual a las apps de scope
> restringido *verificadas*). Mitigación: el manejo de errores debe distinguir y reportar
> claramente `invalid_grant` para que, si algún día pasa, el síntoma sea un mensaje legible en
> el log y no un fallo opaco. Es cheap insurance y encaja con el criterio de aceptación
> *"falla o avisa con un mensaje claro"*.

### 1.3 Otras condiciones que invalidan un refresh token (todas evitables)

Aunque se publique en producción, el refresh token deja de funcionar si:

1. El usuario **revoca** el acceso de la app.
2. El refresh token **no se usa durante 6 meses**. → No aplica: el backend lo usa en cada arranque.
3. El usuario **cambia la contraseña** *y* el refresh token contiene **scopes de Gmail**.
   → **No aplica**: solo pedimos scopes de Drive. Un cambio de contraseña **no** invalida un
   token de solo-Drive.
4. La cuenta **excede el máximo de refresh tokens vivos**: *"There is currently a limit of
   **100 refresh tokens per Google Account per OAuth 2.0 client ID**"*. Al superarlo, el más
   antiguo se invalida **silenciosamente**.
   → `(criterio propio)` Práctica relevante: **no repetir el flujo de consentimiento en bucle**
   durante el desarrollo. 100 da muchísimo margen, pero cada re-consentimiento con
   `prompt=consent` quema uno.
5. Se concedió **acceso temporal** (time-based) y expiró.

— Todas de [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2)

### 1.4 Recomendación

**OAuth2 con refresh token, app publicada "In production", scope de Drive, cliente OAuth de
tipo "Desktop app".**

| Criterio | Veredicto |
|---|---|
| Arranque desatendido | ✅ El refresh se hace solo en cada llamada |
| Los archivos los posee el humano | ✅ |
| Funciona con Gmail personal | ✅ (la única opción que funciona) |
| Coste | ✅ 0 € (Service Account exigiría Workspace de pago para Shared Drives) |
| Fricción manual | ⚠️ Un consentimiento único (~10 min) |
| Secreto a custodiar | ⚠️ El refresh token es material sensible → solo `.env`/secreto, nunca repo |

---

## 2. Librería

### 2.1 Datos duros verificados en el registro npm (2026-07-14)

| Paquete | Versión actual | Tamaño desempaquetado | Dependencias directas |
|---|---|---|---|
| `googleapis` | **173.0.0** (mod. 2026-05-28) | **207.485.089 B ≈ 207 MB** ☠️ | `google-auth-library@^10.2.0`, `googleapis-common@^8.0.0` |
| `@googleapis/drive` | **20.2.0** (mod. 2026-05-20) | **2.454.923 B ≈ 2,45 MB** | `googleapis-common@^8.0.0` |
| `google-auth-library` | **10.9.0** (mod. 2026-06-24) | 601.389 B ≈ 0,6 MB | — |
| `googleapis-common` | 8.0.2 | 76.836 B | `gaxios@7.1.3`, `google-auth-library@10.5.0` (**pin exacto**), `extend`, `qs`, `url-template`, `google-logging-utils` |

**Los tres paquetes están mantenidos activamente** (los tres publicaron versión en los últimos
~2 meses).

### 2.2 Análisis

**Peso — el argumento decisivo.** `googleapis` es el paquete monolítico: empaqueta los tipos
generados de **cientos** de APIs de Google (Ads, BigQuery, YouTube, Compute…), de las cuales
usaríamos **una**. 207 MB frente a 2,45 MB es un factor **~85x**. Penaliza `pnpm install`, la
imagen de Docker y el arranque de `tsc`/IDE.

**Tipos TypeScript.** Ambos traen sus propios `.d.ts` generados (`types: build/index.d.ts`);
no hace falta `@types/*`. `@googleapis/drive` expone el namespace `drive_v3` con los tipos de
los recursos (`drive_v3.Schema$About`, `drive_v3.Schema$File`, …), que es lo que se necesita
para tipar la capa de Drive sin `any`.

**ESM estricto (`module: NodeNext`).** Verificado: **ambos paquetes son CommonJS** — tienen
`main` apuntando a `build/index.js`, y **no** declaran `"type": "module"` ni mapa `exports`.
Bajo `NodeNext` + `esModuleInterop: true`, Node importa CJS desde ESM vía interop.
Símbolos exportados por `@googleapis/drive` (verificados en el fuente
[`src/apis/drive/index.ts`](https://raw.githubusercontent.com/googleapis/google-api-nodejs-client/main/src/apis/drive/index.ts)):

```
export const VERSIONS
export function drive
export const auth
export {drive_v2}
export {drive_v3}
export { AuthPlus, GlobalOptions, APIRequestContext, GoogleConfigurable, ... }
```

> ⚠️ **Punto a validar en implementación (spike de 5 min) `(criterio propio)`**: si el import
> con nombre (`import { drive, auth } from '@googleapis/drive'`) resuelve en runtime bajo ESM.
> Depende de que el `cjs-module-lexer` de Node detecte las asignaciones `exports.drive = …` que
> emite `tsc` — normalmente **sí** las detecta. Si fallara, el fallback garantizado es el
> **default import** (`import pkg from '@googleapis/drive'`; luego desestructurar), que bajo
> `esModuleInterop` siempre entrega `module.exports`. Que el implementer lo compruebe antes de
> construir encima; no es un riesgo de diseño, solo de sintaxis de import.

**⚠️ Trampa a evitar: no añadir `google-auth-library` como dependencia directa `(criterio propio)`.**
`googleapis-common@8.0.2` **fija la versión exacta** `google-auth-library@10.5.0` (sin `^`).
Si `package.json` declarase `google-auth-library@^10.9.0`, el árbol acabaría con **dos copias**
de la librería (10.9.0 en raíz + 10.5.0 anidada). El `OAuth2Client` construido desde una copia
se pasaría al cliente de Drive que espera la otra → riesgo de fallos por `instanceof` y de
incompatibilidades de tipos difíciles de diagnosticar.
**Solución limpia**: usar el `auth` que **`@googleapis/drive` ya reexporta** (`new auth.OAuth2(…)`),
que por construcción es la misma copia que consume el cliente de Drive. Cero dependencias extra,
cero drift de versiones.

**¿`google-auth-library` sola?** Daría el auth pero **no** el cliente de Drive: habría que
escribir a mano las llamadas HTTP a la Drive API y sus tipos. Se pierden los tipos generados y
el manejo de reintentos/errores. `(criterio propio)` No compensa: `@googleapis/drive` ya la
incluye transitivamente y solo añade ~1,9 MB sobre ella.

### 2.3 Recomendación

**Una sola dependencia nueva: `@googleapis/drive@^20.2.0`.**

- 85x más ligera que `googleapis` para funcionalidad idéntica en Drive.
- Trae `google-auth-library` transitivamente en la **versión correcta y coherente**, y reexporta
  `auth` → no hay que declararla ni arriesgar duplicados.
- Tipos generados de primera parte, mantenida por Google, publicada hace ~2 meses.
- `engines: node >=12` (compatible de sobra con el `>=20` del proyecto).

---

## 3. Comprobación de conexión y scopes

### 3.1 La llamada más barata y fiable: `about.get`

**`about.get({ fields: 'user' })`** es la elección correcta.

> "Gets information about the user, the user's Drive, and system capabilities."
> — [Method: about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)

- **El parámetro `fields` es OBLIGATORIO**: *"Required: The `fields` parameter must be set."*
  Sin él la llamada falla con 400. Ojo, es una peculiaridad de `about.get` (en otros métodos
  `fields` es opcional).
- **Qué devuelve** con `fields: 'user'`: un objeto `About` con solo el sub-objeto `user`
  (`drive_v3.Schema$User`): `displayName`, `emailAddress`, `photoLink`, `permissionId`,
  `me`, `kind`. Payload mínimo.
- **Scope mínimo**: **cualquiera** de los scopes de Drive vale. Los siete autorizados son:
  `drive`, `drive.appdata`, `drive.file`, `drive.metadata`, `drive.metadata.readonly`,
  `drive.photos.readonly`, `drive.readonly`. → No obliga a pedir scope extra solo para el
  health check.

**Por qué esta y no `files.list`** `(criterio propio)`: `files.list({pageSize:1})` es igual de
barata pero **ambigua como comprobación**: con scope `drive.file` devuelve una lista **vacía**
con `200 OK` tanto si el auth va bien como si la app no ve nada — no distingue "conectado" de
"no veo nada". `about.get` siempre devuelve contenido si el auth es válido y falla claramente
si no, así que es un booleano honesto. Bonus: devolver también el `emailAddress` permite que el
log de arranque diga **a qué cuenta** se ha conectado, lo que hace obvio el error clásico de
haber consentido con la cuenta de Google equivocada.

`(criterio propio)` Sugerencia: `fields: 'user,storageQuota'` cuesta lo mismo y de paso avisaría
de un Drive lleno antes de que la feature 4 falle al subir. Opcional.

**Mapeo de errores esperable** `(criterio propio)`, para el criterio de aceptación
*"falla o avisa con un mensaje claro"*:

| Síntoma | Causa real | Mensaje útil |
|---|---|---|
| `invalid_grant` | refresh token caducado/revocado (¿app en Testing?) | "Reautoriza: el refresh token ya no es válido" |
| `invalid_client` | CLIENT_ID/SECRET mal pegados | "Credenciales OAuth incorrectas" |
| `403 accessNotConfigured` | Drive API no habilitada en el proyecto | "Habilita la Drive API en Google Cloud Console" |
| `403 insufficientPermissions` | falta scope | "El token no tiene el scope de Drive necesario" |

### 3.2 Scopes: `drive.file` vs `drive`

| Scope | Clasificación | Qué concede (literal) |
|---|---|---|
| `drive.file` | **No sensible** | *"Create new Drive files, or modify existing files, that you open with an app or that the user shares with an app while using the Google Picker API or the app's file picker."* |
| `drive` | **Restringido** | *"View and manage all your Drive files."* |
| `drive.readonly` | **Restringido** | *"View and download all your Drive files."* |
| `drive.metadata` | **Restringido** | *"View and manage metadata of files in your Drive."* |
| `drive.appdata` | **No sensible** | *"View and manage the app's own configuration data in your Google Drive."* (carpeta oculta de la app) |

— [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

La diferencia práctica: **`drive.file` es acceso *por archivo*, no por carpeta.** La app solo ve:
(a) los archivos que **ella misma creó**, y (b) los que el usuario **le entregó explícitamente**
seleccionándolos en el **Google Picker**.

### 3.3 🚨 `drive.file` NO sirve para el diseño actual de la feature 4

**Este es el hallazgo más importante de la sección y afecta al intent ya escrito.**

La feature 4 dice literalmente: *"No crear la carpeta raíz `notas-banco/`: **la creo yo a mano**
y el backend cuelga de ella."*

Con `drive.file`, una carpeta creada **a mano** por el humano en la web de Drive es
**invisible** para la app:

- Aunque el humano pegue su `fileId` en una variable de entorno, `files.get(rootId)` responde
  **404** — con `drive.file` un fileId que la app no creó ni recibió por Picker simplemente
  no existe para ella.
- Por lo tanto tampoco puede crear hijos dentro (`create` con `parents: [rootId]` falla: no
  tiene acceso al padre).

> "It only allows the app to see files it created itself or files the user explicitly opens
> with the app."
> — [Visibility of files and folder using the Google Drive API — Google Developer forums](https://discuss.google.dev/t/visibility-of-files-and-folder-using-the-google-drive-api/328507)

Y hay un **segundo golpe, aún más grave para la idea nº1 (ingesta automática)**: aunque la app
creara ella misma la carpeta, **los archivos que el humano deposite a mano dentro de esa carpeta
seguirían siendo invisibles** para la app. Con `drive.file`, `files.list()` solo devuelve lo que
la propia app creó
([Google Apps Script community](https://groups.google.com/g/google-apps-script-community/c/_W-NKbttfbo)).
Si el flujo previsto es *"el humano suelta la nota del banco en la carpeta y el backend la
detecta e importa"*, **`drive.file` lo hace imposible**.

> `(criterio propio)` **Pista sin cerrar, y honestamente reconocida como tal**: el Google Picker
> concede acceso `drive.file` persistente a lo seleccionado, y *podría* extenderse a los
> descendientes al seleccionar una carpeta. **No he encontrado documentación oficial que lo
> confirme** (el hilo del issue tracker
> [330555392](https://issuetracker.google.com/issues/330555392) requiere login y no pude leerlo).
> En cualquier caso **no es viable aquí**: el Picker es un componente **de navegador**, exigiría
> montar una pantalla en el frontend solo para esto, y el proyecto quiere justo lo contrario
> (arranque desatendido, sin humano en el bucle). No lo recomiendo; lo dejo anotado por
> completitud.

**No existe en OAuth de Google un scope de "solo esta carpeta y su árbol".** El salto es binario:
o acceso por archivo (`drive.file`), o acceso total (`drive`).

### 3.4 Recomendación de scope

**`https://www.googleapis.com/auth/drive`** (restringido), scope único.

- Es el **mínimo que hace funcionar el diseño ya acordado** (raíz creada a mano por el humano
  + archivos depositados a mano + backend que crea, sube y mueve).
- La alternativa `drive.file` **obligaría a rediseñar la feature 4** (el backend tendría que
  crear la raíz, y aun así la ingesta manual de archivos no funcionaría).
- No añade fricción de verificación gracias a la **excepción de uso personal** (§1.2): es la
  misma pantalla "unverified", una sola vez.
- **Coste real a asumir**: el refresh token da acceso de lectura/escritura a **todo** el Drive
  del dueño. Si se filtra, se filtra todo el Drive, no solo `notas-banco/`. Mitigación
  `(criterio propio)`: nunca en el repo (solo `.env`, ya en `.gitignore`), nunca en logs, y
  revocable en cualquier momento desde
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

Para la feature 3 (solo la tubería) `drive.file` bastaría técnicamente para que `about.get`
respondiera — pero **pedir el scope pequeño ahora obligaría a rehacer el consentimiento a mano
en la feature 4** (ampliar scopes = nuevo consentimiento = nuevo refresh token). `(criterio propio)`
Pedir `drive` desde el principio evita hacerle el trámite manual al humano dos veces.

---

## 4. Pasos manuales del humano (Google Cloud Console)

> La consola cambió: el antiguo *"OAuth consent screen"* es ahora **"Google Auth Platform"**,
> dividido en **Branding / Audience / Clients / Data Access**
> ([Configure the OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)).
> Los nombres de menú abajo son los de esa UI (2026).

**Hazlo todo con la cuenta de Google cuyo Drive quieres usar.** Si tienes varias sesiones
abiertas, usa ventana de incógnito para no equivocarte de cuenta — es el error más común y
silencioso.

1. **Crear el proyecto.** [console.cloud.google.com](https://console.cloud.google.com) →
   selector de proyecto (arriba) → **New Project** → nombre: `gastos-backend` → **Create**.
   Asegúrate de que queda seleccionado antes de seguir.

2. **Habilitar la Drive API.** Menú → **APIs & Services → Library** → busca
   **"Google Drive API"** → **Enable**.
   *(Si se salta este paso, todo falla luego con `403 accessNotConfigured`.)*

3. **Configurar Google Auth Platform.** Menú → **Google Auth Platform** → **Get started**:
   - *App name*: `gastos-backend` (es lo que verás en la pantalla de consentimiento).
   - *User support email*: tu email.
   - **Audience → User type: `External`** ← obligatorio. `Internal` **no existe** para cuentas
     personales (requiere Workspace).
   - *Contact information*: tu email.
   - Acepta la política → **Create**.

4. **Añadir el scope.** **Google Auth Platform → Data Access** → **Add or remove scopes** →
   en el filtro pega:
   ```
   https://www.googleapis.com/auth/drive
   ```
   Márcalo → **Update** → **Save**.
   Aparecerá marcado como **Restricted**; es lo esperado (ver §3.4).

5. **🚨 PUBLICAR LA APP — EL PASO QUE MÁS IMPORTA.**
   **Google Auth Platform → Audience** → botón **Publish app** → confirmar → el
   *Publishing status* debe quedar en **"In production"**.
   - Google avisará de que la app *"needs verification"*. **Ignóralo y publica igual**: te ampara
     la excepción de uso personal (<100 usuarios), §1.2.
   - **Si te dejas esto en "Testing", el refresh token te caducará cada 7 días** y tendrás que
     repetir el paso 7 cada semana. Verifica que pone *"In production"* antes de continuar.

6. **Crear el cliente OAuth.** **Google Auth Platform → Clients** → **Create client**:
   - *Application type*: **Desktop app** ← este tipo, no "Web application".
     Los clientes Desktop admiten redirección a **loopback** (`http://localhost:<puerto>`) sin
     tener que registrar la URI, que es lo que usará el script del paso 7.
   - *Name*: `gastos-backend-cli` → **Create**.
   - Copia el **Client ID** y el **Client secret** (o descarga el JSON). El secret se puede
     volver a consultar después.

7. **Obtener el refresh token — UNA SOLA VEZ.**
   El `implementer` te dará un script de un solo uso (fuera de `src/`, no forma parte de la app)
   que hará:
   - `generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive'] })`
     - **`access_type: 'offline'` es lo que hace que Google devuelva un refresh token.**
       *"The refresh_token is only returned on the first authorization, and requires setting
       `access_type: 'offline'`"*
       ([googleapis README](https://googleapis.dev/nodejs/googleapis/latest/index.html), vía ctx7).
     - **`prompt: 'consent'` fuerza a emitir un refresh token nuevo** aunque ya hubieras
       autorizado antes. Sin esto, un segundo intento devuelve access token pero **sin**
       `refresh_token`, y parece un bug de la app cuando no lo es.
   - Levantar un servidor local efímero para recoger el `?code=…` del redirect.
   - Cambiar el code por tokens (`getToken(code)`) e imprimir el `refresh_token`.

   **Lo que verás en el navegador:**
   1. Elegir tu cuenta de Google (¡la correcta!).
   2. **"Google hasn't verified this app"** → **Advanced** → **Go to gastos-backend (unsafe)**.
      Es normal y esperado (§1.2). Esta pantalla la verás **solo esta vez**.
   3. Pantalla de consentimiento pidiendo acceso a Drive → **Continue / Allow**.
   4. La terminal imprime el refresh token.

   > *Alternativa si el script diera problemas*: [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
   > con *Use your own OAuth credentials*. **Requiere un cliente de tipo "Web application"** con
   > redirect URI `https://developers.google.com/oauthplayground` (no sirve el cliente Desktop
   > del paso 6). `(criterio propio)` Prefiero el script local: no expone el client secret a una
   > web de terceros.
   >
   > ⚠️ **No busques el flujo "copiar/pegar el código" (OOB, `urn:ietf:wg:oauth:2.0:oob`)**:
   > Google lo **desactivó en octubre de 2022**. Tutoriales viejos aún lo enseñan y ya no funciona.

8. **Pegar los valores en `.env`** (ver §4.1).

9. **Comprobar.** Arranca el backend: debe loguear que conecta a Drive e indicar **con qué cuenta**
   (el `emailAddress` que devuelve `about.get`). Si esa cuenta no es la tuya, repite el paso 7
   con la cuenta correcta.

### 4.1 Variables de entorno

`(criterio propio)` Nombres propuestos, siguiendo el estilo existente de `src/config/env.ts`
(`DATABASE_URL`, `PORT`, `LOG_LEVEL`) — decisión final del `spec_author`/`implementer`:

```dotenv
# --- Google Drive (feature 3: drive-connection) ---
# Google Auth Platform → Clients → cliente "Desktop app"
GOOGLE_DRIVE_CLIENT_ID="123456789-xxxxxxxxxxxxxxxx.apps.googleusercontent.com"
GOOGLE_DRIVE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
# Se obtiene UNA vez con el script de autorización (paso 7). NUNCA al repositorio.
GOOGLE_DRIVE_REFRESH_TOKEN="1//0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Notas:
- Formatos: el client ID acaba en `.apps.googleusercontent.com`; el secret empieza por `GOCSPX-`;
  el refresh token empieza por `1//`. Sirven de validación barata al arrancar `(criterio propio)`.
- `.env` ya está en `.gitignore` — **verificado**. `.env.example` debe llevar las tres claves
  **vacías o con placeholders**, nunca valores reales.
- **No hace falta variable de scope** `(criterio propio)`: el scope es una constante del código,
  no configuración de entorno — cambiarlo exige rehacer el consentimiento, así que no es algo
  que se ajuste por entorno.
- **`GOOGLE_DRIVE_ROOT_FOLDER_ID`** (el fileId de `notas-banco/` creada a mano) hará falta en la
  **feature 4**, no en la 3. Se saca de la URL de la carpeta en Drive:
  `https://drive.google.com/drive/folders/<ESTO_ES_EL_ID>`.

---

## 5. ⚠️ Decisiones que necesitan al humano antes de escribir el spec

1. **Aceptar el scope `drive` completo** (§3.3–3.4). El diseño acordado (raíz creada a mano +
   archivos depositados a mano) **no funciona con `drive.file`**. Opciones:
   - **(a) Aceptar `drive` completo** ← recomendada. Cero cambios de diseño; el coste es que el
     token, si se filtra, alcanza todo el Drive.
   - **(b) Rediseñar la feature 4** para que el backend cree él la raíz y use `drive.file` —
     pero **aun así la ingesta de archivos depositados a mano seguiría sin funcionar**, que es
     el corazón de la idea nº1. `(criterio propio)` La (b) no salva el caso de uso; la (a) es
     realmente la única viable.

2. **Confirmar que se publicará la app en "In production"** (§1.2, paso 5). Sin esto el proyecto
   arrastra una caducidad de **7 días** en el refresh token. Es el fallo más caro y más silencioso
   de esta feature.

---

## 6. Fuentes

**Documentación oficial de Google**
- [Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2) — caducidad de refresh tokens, regla de los 7 días, límite de 100 tokens
- [Manage App Audience](https://support.google.com/cloud/answer/15549945) — Testing vs In production
- [When is verification not needed](https://support.google.com/cloud/answer/13464323) — excepción de uso personal
- [Unverified apps](https://support.google.com/cloud/answer/7454865) — pantalla de app no verificada, tope de 100 usuarios
- [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — clasificación de scopes
- [Method: about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get) — `fields` obligatorio, scopes autorizados
- [Resolve errors | Google Drive](https://developers.google.com/workspace/drive/api/guides/handle-errors) — las service accounts no tienen cuota
- [Configure the OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent) — UI de Google Auth Platform

**Vía ctx7 (3 comandos: 1 `library` + 2 `docs`)**
- `/googleapis/google-auth-library-nodejs` — `UserRefreshClient`, `setCredentials`, evento `tokens`, `refreshAccessToken`, `eagerRefreshThresholdMillis`
- `/websites/googleapis_dev_nodejs_googleapis` — `google.drive('v3')`, `generateAuthUrl`, `access_type: 'offline'`

**Registro npm (consultado 2026-07-14)** — versiones, tamaños y dependencias de
`googleapis`, `@googleapis/drive`, `google-auth-library`, `googleapis-common`

**Fuentes secundarias (corroboración de comportamiento reproducido por terceros)**
- [error 403 storageQuotaExceeded — Google Developer forums](https://discuss.google.dev/t/error-403-storagequotaexceeded-when-the-service-accounts-drive-is-completely-empty/194265)
- [n8n#26050 — Service Accounts do not have storage quota](https://github.com/n8n-io/n8n/issues/26050)
- [Visibility of files and folder using the Google Drive API](https://discuss.google.dev/t/visibility-of-files-and-folder-using-the-google-drive-api/328507)
- [drive.file scope — Google Apps Script community](https://groups.google.com/g/google-apps-script-community/c/_W-NKbttfbo)
- [`src/apis/drive/index.ts` — google-api-nodejs-client](https://raw.githubusercontent.com/googleapis/google-api-nodejs-client/main/src/apis/drive/index.ts) — símbolos exportados
