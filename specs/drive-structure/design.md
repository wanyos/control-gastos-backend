# Design — Feature 4: drive-structure

> CÓMO se construye lo descrito en `requirements.md`. No reinventa decisiones:
> aplica el Principio 5 (composición), ADR-004 (dónde va cada archivo), ADR-005
> (errores), ADR-006 (config) y **ADR-007** (cliente de Drive) de
> `docs/architecture.md`, y hereda el patrón de la feature 3: **funciones puras
> en `lib/` que reciben el cliente de Drive por parámetro**, testeadas con dobles
> en el seam, sin red.
>
> 🚨 **Tu paso manual está en la §9.** Sin la carpeta raíz creada a mano y su
> fileId en `.env`, el backend valida al arrancar pero no tiene de qué colgar.
>
> 🔁 **Revisión de la puerta (2026-07-24) — modelo de identidad de banco.** El
> humano sustituyó "banco = slug libre auto-creado" por **"Drive es el registro
> de bancos; crear un banco es una acción explícita"**. Este design refleja el
> nuevo modelo en §3 (resolver vs. crear), §6 (identidad) y §7 (nuevo error
> `UnknownBankError`), y en el ADR-008 de §10. El resto se mantiene.

## 1. Estado actual → estado final

La feature 3 dejó el cliente de Drive expuesto como `fastify.drive`
(`AppDriveClient`) y `src/lib/drive.ts` con `checkDriveConnection(client)` y el
mapeo de errores sanitizado. **Esta feature es el primer consumidor de la
superficie `files.*`** de Drive. Reutiliza todo lo de la 3 y no toca el auth.

Un detalle heredado que condiciona el diseño: el guardián R17 de la feature 3
(`architecture.test.ts`) afirma que **`src/lib/drive.ts` NO contiene `files.`**
(era "solo la tubería de conexión"). Por eso las operaciones de archivos/carpetas
**no van en `drive.ts`**, sino en un archivo nuevo `src/lib/drive-structure.ts`.
Así `drive.ts` sigue siendo "solo conexión" y su guardián queda **verde y sin
tocar**; `drive-structure.ts` es la superficie `files.*`, con su propio guardián
de alcance (no `prisma`, no auth).

```
src/
  config/
    env.ts                    # MODIFICAR: + GOOGLE_DRIVE_ROOT_FOLDER_ID y AppConfig.driveRootFolderId (R1-R3)
    env.test.ts               # MODIFICAR: fixture baseEnv + casos nuevos
  errors/
    app-error.ts              # MODIFICAR: + UnknownBankError (subclase AppError, UNKNOWN_BANK, 404) (R28)
    app-error.test.ts         # MODIFICAR: + test de UnknownBankError (código/status/name) (R28)
  lib/
    drive.ts                  # MODIFICAR (mínimo): exportar `driveErrorMessage` para reutilizar el mapeo (R12)
    drive-structure.ts        # CREAR: normalización, findFolder, ensureFolder, resolveBankFolder, createBank, suggestBank, ensureBankYearFolders, uploadFile, moveFileToProcessed (R4-R17, R23-R28)
    drive-structure.test.ts   # CREAR: unitarios con dobles en el seam, sin red
  architecture.test.ts        # MODIFICAR: árbol objetivo + guardianes de drive-structure (R18, R19)
vitest.config.ts              # MODIFICAR: placeholder de GOOGLE_DRIVE_ROOT_FOLDER_ID (mantiene la suite verde)
.env.example                  # MODIFICAR: la variable nueva con placeholder (R21)
docs/{architecture,stack,api-contract}.md   # MODIFICAR (R20, R21)
```

**No se toca** `src/plugins/drive.ts` (el cliente ya está expuesto) ni
`src/plugins/error-handler.ts` (el handler ya mapea **cualquier** `AppError` por
su `statusCode`/`code`, así que `UnknownBankError` sale como 404 sin tocar nada).
`ValidationError` y `DriveConnectionError` se reutilizan tal cual; la única clase
de error nueva es `UnknownBankError` (§7).

## 2. Dónde vive el código y por qué en `lib/` y no en un módulo

`docs/architecture.md` (regla de ADR-004): lo que pertenece a un recurso concreto
→ `modules/<recurso>/`; lo transversal que no es de nadie → `config/`, `plugins/`,
`lib/`, `errors/`. Las operaciones de estructura de Drive:

- **No tienen rutas** (se decide servicio interno, §5) → un `modules/<recurso>/`
  (vertical slice con `*.routes.ts`) no encaja.
- Son **infraestructura sobre el cliente de Drive**, la contraparte de
  `checkDriveConnection` (que ya vive en `lib/drive.ts`).

→ Van en **`src/lib/drive-structure.ts`**, funciones puras que reciben el
`AppDriveClient` por parámetro (seam inyectable, R19). Un futuro consumidor (la
ingesta) las importará y les pasará `fastify.drive` y `fastify.config.driveRootFolderId`.

**Firmas nuevas** (todas en `src/lib/drive-structure.ts`):

```typescript
export interface BankYearFolders {
  bankFolderId: string
  yearFolderId: string
  processedFolderId: string
}

export interface FileUpload {
  name: string
  mimeType: string
  body: Buffer | Readable | string
}

export function normalizeBankName(input: string): string          // valida forma + normaliza; ValidationError si inválido (R14, R15)
export function validateYear(input: string): string               // valida; ValidationError si inválido (R16, R17)
export function suggestBank(slug: string, known: string[]): string | undefined  // pura, Levenshtein ≤ umbral (R26)

export async function findFolder(
  client: AppDriveClient, name: string, parentId: string,
): Promise<string | null>                                         // resuelve o null; de-dup determinista (R6, R8)
export async function ensureFolder(
  client: AppDriveClient, name: string, parentId: string,
): Promise<string>                                               // findFolder → crea si null; + lock (R4, R6, R7, R8)
export async function resolveBankFolder(
  client: AppDriveClient, rootFolderId: string, bank: string,
): Promise<string>                                              // debe existir; UnknownBankError si no (R23, R24, R25, R26)
export async function createBank(
  client: AppDriveClient, rootFolderId: string, bank: string,
): Promise<string>                                             // ÚNICO camino de alta; idempotente (R27)
export async function ensureBankYearFolders(
  client: AppDriveClient, rootFolderId: string, bank: string, year: string,
): Promise<BankYearFolders>                                     // resolver banco (existe) → auto año/procesados (R3, R4, R5, R13, R23, R24)
export async function uploadFile(
  client: AppDriveClient, folderId: string, file: FileUpload,
): Promise<string>                                             // devuelve fileId nuevo (R9, R10)
export async function moveFileToProcessed(
  client: AppDriveClient, fileId: string, folders: BankYearFolders,
): Promise<void>                                               // (R11)
```

`AppDriveClient` se importa como **type** de `../lib/drive.js` (ya exportado).
`ValidationError`, `DriveConnectionError` y el nuevo `UnknownBankError` de
`../errors/app-error.js`.

## 3. Decisión delegada #1 — nombre→fileId, idempotencia y carrera

### 3.1 `findFolder` (resolver) y `ensureFolder` (resolver-o-crear)

Drive direcciona por `fileId`, no por ruta. La resolución por nombre bajo un padre
conocido se factoriza en **un solo lector** que ambas rutas (usar y crear)
reutilizan:

1. **`findFolder`** busca con `files.list` y NO crea:
   ```typescript
   const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' `
     + `and '${parentId}' in parents and trashed = false`
   const res = await client.files.list({
     q, fields: 'files(id, name, createdTime)', spaces: 'drive',
     orderBy: 'createdTime', pageSize: 10,
   })
   ```
   - Si hay **≥1** → devuelve el `id` del primero por `createdTime` (el más antiguo,
     determinista, R8); si hay **>1** registra un `warn` (dato diagnóstico).
   - Si hay **0** → devuelve `null`.
2. **`ensureFolder`** (año, `procesados`, y el ladrillo de `createBank`) llama a
   `findFolder`; si es `null`, crea:
   ```typescript
   const created = await client.files.create({
     requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
     fields: 'id',
   })
   return created.data.id
   ```
   con el lock de §3.2.
3. **`resolveBankFolder`** (§6) llama a `findFolder(bank, rootFolderId)`; si es
   `null`, **no crea**: lanza `UnknownBankError` (R24). Esta es la diferencia
   semántica entre usar y crear.

> **Por qué la interpolación en `q` es segura sin escapar:** `name` es siempre un
> slug validado (`^[a-z0-9-]+$`, R14) o el literal `'procesados'`, y `parentId` es
> un fileId emitido por Drive o por config. Ninguno puede contener `'` ni `\`, así
> que no hay inyección posible en el filtro. **Esta es una razón de peso para
> validar el banco: la validación de forma protege el `q`, no solo el nombre de
> carpeta.** Aplica igual en la ruta de resolver y en la de crear.

### 3.2 La condición de carrera y su mitigación

Drive **permite** dos carpetas con el mismo nombre bajo el mismo padre:
`files.create` no impone unicidad por nombre. Por tanto dos `ensureFolder`
concurrentes que ejecuten "buscar (vacío) → crear" a la vez crean **dos** carpetas.

**Mitigación 1 (intra-proceso) — lock en memoria por `(padre, nombre)` (R7):**

```typescript
const inFlight = new Map<string, Promise<string>>()

async function ensureFolder(client, name, parentId) {
  const key = `${parentId}\n${name}`
  const running = inFlight.get(key)
  if (running) return running
  const p = resolveOrCreate(client, name, parentId)  // findFolder → crea si null
  inFlight.set(key, p)
  try {
    return await p
  } finally {
    inFlight.delete(key)
  }
}
```

Dos `ensureBankYearFolders` concurrentes del mismo banco/año comparten la misma
promesa por nivel creado (año, `procesados`) → cada carpeta se crea **una vez**
(el banco no se crea, se resuelve). Testeable con `Promise.all` + contador de
`files.create`.

**Mitigación 2 (lectura) — de-duplicación determinista (R8):** para lo que el lock
no cubre (dos procesos, o el humano duplicando a mano), `findFolder` elige la más
antigua y nunca crea una tercera. Convergente aunque existan duplicados, y aplica
también a la **resolución de banco** (dos carpetas de banco homónimas → se usa la
más antigua).

### 3.3 🔴 Límite honesto de la estrategia (anótalo, humano)

- El lock es **de un solo proceso**. Con **dos instancias** del backend corriendo
  a la vez, o si el humano crea la carpeta en la web de Drive justo entre el
  `list` y el `create`, aún pueden aparecer duplicados. La mitigación 2 los hace
  **inofensivos** (se reutiliza siempre el más antiguo, de forma estable) pero
  **no los borra**: borrar es destructivo y queda fuera de alcance. El despliegue
  previsto es **single-instance**, donde el lock cubre el caso real.
- No se usa `appProperties` como marca de unicidad: Drive tampoco la impone, no
  elimina la carrera y añade complejidad de lectura. Descartada.

### 3.4 "No dejar la estructura a medias" (R13)

Drive **no tiene transacciones**, así que no hay rollback atómico. La garantía se
da de otra forma:

- La cadena de la ruta normal es **resolver banco (existe) → `ensureFolder(año)` →
  `ensureFolder(procesados)`**, en orden e idempotente. Si `procesados` falla, el
  año ya creado es **válido y reutilizable**: una reinvocación reutiliza banco y
  año (no recrea) y completa `procesados`.
- La función **nunca reporta éxito parcial**: si algún paso lanza, la excepción se
  propaga y no se devuelve `BankYearFolders`.
- **No se intenta borrar** lo creado al fallar (destructivo; y sería contradictorio
  con la idempotencia, que quiere reutilizarlo en el reintento).

Interpretación: "no a medias" = nunca queda en un estado **incoherente que un
reintento no pueda completar**, y nunca se dice "listo" sin estarlo.

## 4. Decisión delegada #2 — cómo conoce el backend la raíz

**Variable nueva `GOOGLE_DRIVE_ROOT_FOLDER_ID`, obligatoria**, validada al
arrancar con el mismo patrón que las tres de la feature 3 (`env.ts:66-79`):

```typescript
const driveRootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID
if (!driveRootFolderId) {
  problems.push('GOOGLE_DRIVE_ROOT_FOLDER_ID is required (fileId of the manually-created notas-banco/ root)')
}
```

- Se añade su bloque **después** de los tres de Drive, y se suma `||
  !driveRootFolderId` al guard del `throw` (`env.ts:82-88`) — la misma trampa de
  narrowing que documentó la feature 3 (`|| !x` estrecha `string | undefined` →
  `string`, obligatorio con `strict`).
- El humano obtiene el fileId de la URL de la carpeta:
  `https://drive.google.com/drive/folders/<ESTE_ES_EL_ID>` (§9).

**Forma en `AppConfig`: campo hermano plano `driveRootFolderId`, no dentro de
`drive`.**

```typescript
export interface AppConfig {
  databaseUrl: string
  port: number
  host: string
  logLevel: LogLevel
  drive: DriveCredentials      // ← sin tocar (feature 3): las 3 credenciales del cliente
  driveRootFolderId: string    // ← nuevo
}
```

- **Por qué hermano y no dentro de `drive`:** `config.drive` (`DriveCredentials`)
  tipa **exactamente** el parámetro de `createDriveClient` (ADR-007); el fileId de
  la raíz **no es una credencial** y no debe entrar en la fábrica del cliente.
  Meterlo dentro de `DriveCredentials` ensuciaría esa firma. Como hermano, la
  llamada `createDriveClient(fastify.config.drive)` de `plugins/drive.ts` **queda
  intacta**.
- **Alternativa descartada — reestructurar a `drive: { credentials, rootFolderId }`:**
  agruparía mejor semánticamente, pero rompe `createDriveClient(fastify.config.drive)`
  y obliga a reescribir `env.test.ts` de la feature 3. No compensa el churn.

## 5. Decisión delegada #3 — superficie de exposición: servicio interno

**Decisión: servicio interno (funciones en `lib/drive-structure.ts`), SIN
endpoints de API en esta feature.** `docs/api-contract.md` no gana endpoints.

Razones:

1. **No hay consumidor externo todavía.** Quien encadena "asegurar carpeta →
   subir → mover a procesados" es la **ingesta** (idea nº1), que es **una feature
   futura del backend**, no el frontend. Construir el endpoint ahora lo dejaría
   huérfano de su disparador, y el `intent` excluye explícitamente el disparo
   ("No implementar… el disparo de la importación aquí").
2. **Seguridad.** La API hoy no tiene autenticación (`api-contract.md`:
   "Autenticación: ninguna por ahora"). Un endpoint que sube/mueve archivos
   escribe sobre un Drive con **scope completo** (ADR-007): exponerlo sin auth es
   el mismo tipo de riesgo que llevó a la feature 3 a **no** devolver el email en
   `/health/drive`. No se abre esa superficie sin necesidad.
3. **Testabilidad idéntica.** Como servicio interno se prueba entero con dobles
   del cliente (§8), sin red, igual que la feature 3.

**Qué se documenta (R20):** en `api-contract.md`, ampliar la nota de la reserva de
`DRIVE_CONNECTION_ERROR` para dejar constancia de que la feature 4 se resolvió como
**servicio interno** (sin endpoints), y **añadir `UNKNOWN_BANK` a la tabla de
códigos estables como reservado** (interno, ningún endpoint lo devuelve todavía;
lo devolverá la feature que exponga la operación de cara al cliente).

- **Alternativa descartada — endpoints (p. ej. `POST /api/drive/…`):** añade
  superficie HTTP sin consumidor, sin auth, sobre scope completo. Si la feature de
  ingesta necesita exponerse, definirá **su** endpoint con su contrato entonces.
  Reservado, no adelantado.

## 6. Decisión delegada #4 — identidad del banco (modelo de registro) y validación del año

> **Cambio de la puerta (2026-07-24).** El humano decidió el **modelo**: *Drive es
> el registro de bancos; crear un banco es una acción explícita*. El agente diseña
> el **mecanismo**. La validación de **forma** del slug (abajo) **no cambia**: es
> independiente y precede al modelo de registro.

### Forma del slug: string normalizado a slug seguro (sin cambios)

`normalizeBankName(input)`:

1. `input.normalize('NFD')` y quita diacríticos (`̀-ͯ`) → `'Bancó'`
   pierde el acento.
2. `toLowerCase()`, `trim()`.
3. Espacios y separadores → `-`; descarta todo lo que no sea `[a-z0-9-]`; colapsa
   `-` repetidos; quita `-` de los extremos.
4. Resultado: debe casar `^[a-z0-9-]{1,64}$` y **no** ser `'procesados'`
   (reservado: colisionaría con la subcarpeta). Si queda vacío, excede 64, o es el
   reservado → `throw new ValidationError(...)` (R15), **sin tocar Drive**.

- **Por qué normalizar la forma:** acepta entradas humanas realistas (`'La Caixa'`
  → `'la-caixa'`) y **garantiza** por construcción un nombre sin `/`, `.`, `'` ni
  control chars → path traversal y comillas neutralizados (R14), y el `q` a salvo
  (§3.1). Esta capa es de **forma**, no de existencia: un slug bien formado puede
  aún no estar registrado (eso lo decide el registro, abajo).

### Registro de bancos: resolver (usar) vs. crear (explícito)

**Fuente de verdad de "qué bancos existen": las subcarpetas directas de la raíz
`notas-banco/`.** No hay lista en config ni en BD. Dos operaciones separadas:

- **`resolveBankFolder(client, rootFolderId, bank)` — la ruta por defecto (segura).**
  `normalizeBankName` (forma) → `findFolder(slug, rootFolderId)`. Si devuelve id →
  ese banco existe, se usa (R23). Si devuelve `null` → **no crea**: construye la
  lista de bancos conocidos (`files.list` de las subcarpetas de la raíz), calcula
  la sugerencia con `suggestBank` y lanza `UnknownBankError` (R24-R26). La usan
  `ensureBankYearFolders`, la subida y la movida cotidianas.
- **`createBank(client, rootFolderId, bank)` — el alta explícita (deliberada).**
  `normalizeBankName` (forma) → `ensureFolder(slug, rootFolderId)` (crea si no
  existe, idempotente, R27). Es el **único** camino que da de alta una carpeta de
  banco. Devuelve el `bankFolderId`.

**Por qué función dedicada y no un flag `{ create: true }`:** una función con
nombre propio (`createBank`) hace el alta **inequívocamente deliberada**: la
ingesta cotidiana llama a `ensureBankYearFolders`/`uploadFile`, que jamás crean un
banco. Un flag booleano en la ruta normal sería más fácil de colar por descuido
(un `true` copiado, un default mal puesto) y reabriría justo el agujero del typo
que el humano quiere cerrar. La función aparte lo hace **imposible por
construcción**.

**La cadena de la ruta normal** (`ensureBankYearFolders`):
`resolveBankFolder(bank)` (debe existir) → `ensureFolder(year, bankFolderId)`
(auto) → `ensureFolder('procesados', yearFolderId)` (auto) → devuelve los tres ids.
El año ya está acotado (`^\d{4}$` + rango, R16) y un año nuevo es rutina esperada:
ahí **no** hay guardián de banco.

- **`suggestBank(slug, known)` — función pura (R26).** Levenshtein entre `slug` y
  cada nombre conocido; devuelve el de menor distancia **si** esa distancia ≤ **2**
  (umbral fijo, `(añadido)`); en empate, el primero por orden alfabético
  (determinista, `(añadido)`); si nadie entra en el umbral, `undefined` (no se
  fuerza una sugerencia disparatada). Testeable sin red.
- **Alternativa descartada — lista cerrada de bancos hardcodeada en código:** una
  constante en el repo obligaría a un deploy por cada banco nuevo y a inventar los
  nombres ahora, sin conocerlos. **El modelo de registro en Drive da la misma
  seguridad** (usar exige existencia) **sin acoplar la lista al código**: el humano
  da de alta un banco con una acción explícita (`createBank`) y Drive es la lista
  viva. Anotado para la puerta.
- **Alternativa descartada — auto-crear el banco en la ruta normal (modelo
  anterior):** descartada por el humano en la puerta. Convertía un typo
  (`santender`) en una carpeta nueva silenciosamente equivocada; la ingesta
  depositaría ahí sin que nadie lo note. Ver ADR-008 §10.

### Año: cadena de 4 dígitos en rango

`validateYear(input)`: `trim()`, exige `^\d{4}$` y `2000 ≤ n ≤ 2100`; si no,
`throw new ValidationError(...)` (R17), sin tocar Drive. La cadena validada se usa
tal cual como nombre de carpeta (solo dígitos → seguro).

- **Rango fijo 2000-2100, no relativo a "ahora":** deliberado para que los tests
  sean **deterministas** (no acoplados al reloj del sistema; la feature 3 evitó el
  mismo acoplamiento). El charset es la seguridad; el rango es cordura. Es un punto
  `(añadido)` que el humano debe mirar.

## 7. Errores: reutilizar donde encaja, añadir una clase donde el humano lo exige

- **Fallo de Drive** (`files.*` rechaza) → `DriveConnectionError` (ya existe:
  `DRIVE_CONNECTION_ERROR`, 503) con **mensaje sanitizado**. Para no duplicar la
  tabla de síntomas, `src/lib/drive.ts` **exporta** su `driveErrorMessage` (hoy
  privada; el cambio es añadir `export`, sin tocar su comportamiento ni su
  guardián `no files.`). `drive-structure.ts` envuelve así:
  ```typescript
  try { /* files.* */ } catch (error) {
    if (error instanceof AppError) throw error   // no re-envolver UnknownBank/Validation
    throw new DriveConnectionError(driveErrorMessage(error))
  }
  ```
  R12 lo verifica con un token falso: el `message` resultante no lo contiene. Nótese
  el `instanceof AppError`: si un `UnknownBankError` o `ValidationError` propio
  atraviesa el `try`, se re-lanza tal cual, **sin** convertirlo en un error de Drive
  (así se preserva la distinguibilidad de R28).
- **Entrada con formato inválido** (banco/año) → `ValidationError` (ya existe:
  `VALIDATION_ERROR`, 400). Es la subclase correcta para datos mal formados
  (Principio 3).
- **Banco con formato válido pero no registrado** → **`UnknownBankError` (NUEVA
  clase)**. Subclase de `AppError`, `code = 'UNKNOWN_BANK'`, `statusCode = 404`:
  ```typescript
  export class UnknownBankError extends AppError {
    constructor(message = 'Unknown bank') {
      super(message, 'UNKNOWN_BANK', 404)
    }
  }
  ```
  - **Por qué una clase nueva y no reutilizar (R24, R28, decisión delegada):** el
    humano exige que "banco desconocido" sea distinguible **de un fallo de Drive**
    (503) **y de un formato inválido** (400). Reutilizar `ValidationError` (400) lo
    haría indistinguible del formato inválido — justo lo que el humano prohíbe.
    Reutilizar `NotFoundError` (`NOT_FOUND` genérico, 404) lo confundiría con "gasto
    no existe" / "ruta no existe" y no dejaría a la ingesta futura discriminar
    exactamente "este banco no está dado de alta" (p. ej. para ofrecer crearlo). Un
    `code` propio y estable (`UNKNOWN_BANK`) resuelve ambas cosas. **ADR-005 ya
    prevé** subclases nuevas "cuando una feature las necesite" (cita el ejemplo de
    `ConflictError`); esta es una de esas veces.
  - **HTTP 404** encaja: la superficie es interna hoy (§5), pero el día que se
    exponga, "el banco pedido no existe en el registro" es semánticamente un
    not-found.
- **Alternativa descartada — `DriveStructureError` genérico** para todo lo de esta
  feature: mete en un mismo saco el fallo de conectividad y el banco desconocido,
  que el humano quiere separados. Descartada.
- **Alternativa descartada — reutilizar `ValidationError` para el banco desconocido:**
  la más barata (cero clases nuevas), pero rompe R28 (indistinguible del formato
  inválido). Descartada por requisito explícito del humano.

El `error-handler` central **no cambia**: mapea cualquier `AppError` por su
`statusCode`/`code`, así que `UnknownBankError` saldría como
`{ statusCode: 404, code: 'UNKNOWN_BANK', message }` el día que un endpoint lo
propague. Hoy nadie lo propaga por HTTP (servicio interno).

## 8. Estrategia de test SIN red (hereda `specs/drive-connection/design.md` §8)

**Postura declarada por la feature 3 y adoptada aquí:** *seam inyectable + doble en
el seam para los tests automáticos; el contacto real con Drive es smoke manual
(Nivel 3).* No hay "Drive local"; las funciones reciben el cliente por parámetro,
así que se prueban con un doble sin tocar la red.

**El doble** (mismo molde que `drive.test.ts:18-24` y `health.test.ts:38-40`):

```typescript
function driveDouble(files: {
  list?: ReturnType<typeof vi.fn>
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
}): AppDriveClient {
  return { files } as unknown as AppDriveClient
}
```

Para banco-desconocido, el doble modela `files.list` según el `q`: la búsqueda del
banco pedido resuelve `{ files: [] }` y la de las subcarpetas de la raíz resuelve
las de banco existentes (`santander`, `bbva`). La aserción clave es que
`files.create` **no** se llama.

**Mapa de qué prueba cada test (sin red):**

| Qué se prueba | Cómo | R |
| ------------- | ---- | - |
| `normalizeBankName` (casos válidos + traversal neutralizado) | entrada→salida, sin cliente | R14 |
| `normalizeBankName` rechaza (vacío/largo/reservado) | espera `ValidationError`; el doble no recibe llamadas | R15 |
| `validateYear` acepta / rechaza | entrada→salida / `ValidationError` sin llamadas | R16, R17 |
| `findFolder`/`ensureFolder` crea si no existe | `list` vacío → `create` con folder mimeType + `parents` | R4 |
| `ensureFolder` reutiliza si existe | `list` con una → sin `create`, devuelve su id | R6 |
| de-dup determinista | `list` con dos (createdTime distinto) → id más antiguo, sin `create` (banco y año) | R8 |
| `ensureFolder` concurrente | `Promise.all` de dos → `create` llamado una vez | R7 |
| `resolveBankFolder` banco existe | `list` del banco con una → devuelve id, sin `create` | R23 |
| `resolveBankFolder` banco desconocido | `list` del banco vacío + `list` de la raíz con `[santander,bbva]` → `UnknownBankError`, **sin `create`** | R24 |
| `UnknownBankError` lista bancos | `message` contiene `santander` y `bbva` | R25 |
| `suggestBank` (pura) | `('santender',[santander,bbva])→santander`; `('zzzzz',…)→undefined` | R26 |
| `UnknownBankError` sugiere | `message` de `santender` contiene `santander` como sugerencia | R26 |
| `createBank` crea | `list` vacío → `create` con `parents:[rootFolderId]`, devuelve id | R27 |
| `createBank` idempotente | `list` con una → sin `create`, devuelve id existente | R27 |
| `UnknownBankError` forma/discriminación | `instanceof AppError`, `UNKNOWN_BANK`, 404, `name`; distinto de `ValidationError`/`DriveConnectionError` | R28 |
| `ensureBankYearFolders` banco existe → año/procesados | `list` banco con una, año/procesados vacíos → 2 `create`; el primero cuelga de `bankFolderId`; nunca crea banco ni raíz | R3, R4, R5, R23 |
| `ensureBankYearFolders` banco desconocido | `list` banco vacío → `UnknownBankError`, ningún `create` | R24 |
| `ensureBankYearFolders` convergencia tras fallo parcial | fase 1 falla en el año; fase 2 reutiliza banco+año | R13 |
| `uploadFile` archivo nuevo | `create` con `parents:[folderId]` + `media`; devuelve id | R9 |
| `uploadFile` no sobrescribe | dos subidas mismo `name` → dos `create`, dos ids, nunca `update` | R10 |
| `moveFileToProcessed` | `update` con `addParents`/`removeParents`/`fileId` | R11 |
| error de Drive sanitizado | `create` rechaza con token falso → `DriveConnectionError` sin el token | R12 |
| `loadConfig` con/sin la raíz | env sintético → `driveRootFolderId` / lanza nombrándola | R1, R2 |
| guardianes de alcance | `architecture.test.ts` lee `drive-structure.ts` | R18, R19 |

**El implementer NO se bloquea** esperando la carpeta real del humano: todo lo
automático es verde con dobles y placeholders. El contacto real es el smoke manual
(§9), del humano.

## 9. 🚨 PASO MANUAL DEL HUMANO (una sola vez)

El backend **no crea la raíz** (R3). Tú la creas y le pasas su fileId:

1. En [drive.google.com](https://drive.google.com), con **la misma cuenta** cuyo
   Drive conectaste en la feature 3, crea una carpeta llamada **`notas-banco/`**
   (el nombre real es cosa tuya; el backend cuelga de su **id**, no de su nombre).
2. Abre la carpeta y copia el id de la URL:
   `https://drive.google.com/drive/folders/`**`<ESTE_ES_EL_ID>`**.
3. Pégalo en `.env` como `GOOGLE_DRIVE_ROOT_FOLDER_ID` (ver `.env.example`). **No**
   lo pegues en `.env.example` (ese se versiona: solo placeholder).

> **Consecuencia del modelo de registro:** las **subcarpetas** que crees a mano
> dentro de `notas-banco/` (o mediante `createBank`) son los bancos que el backend
> reconocerá. Si pides ingesta para un banco cuya carpeta no existe, el backend
> **no la inventa**: te devuelve `UnknownBankError` con la lista de bancos
> conocidos y una sugerencia. Dar de alta un banco es deliberado (R27).

> Sin esta variable, `pnpm dev` **no arranca** (fail-fast, R2), igual que ocurrió
> con las tres credenciales de la feature 3. La suite de tests **sí** arranca sin
> ella: usa un placeholder en `vitest.config.ts` (§8).

**Smoke manual opcional (Nivel 3):** como la superficie es interna (§5), no hay
`curl` que ejercerla end-to-end en esta feature; el contacto real con Drive
llegará cuando la ingesta encadene las funciones. Si quieres verificar antes, se
puede dar de alta un banco con `createBank(app.drive, config.driveRootFolderId,
'test')` y luego `ensureBankYearFolders(app.drive, config.driveRootFolderId,
'test', '2026')` desde un `tsx` de usar y tirar y comprobar en la web de Drive que
aparece `test/2026/procesados`. No es entregable de esta feature.

## 10. Borrador de ADR-008 (va a `docs/architecture.md`, tarea de docs)

> Formato de ADR-005/006/007. Exigido por el acceptance y por
> `architecture.md` ("decisiones delegadas anotadas como ADR").

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
     bancos conocidos y una sugerencia por distancia de edición, y **no crea nada**.
     **`createBank`** (operación explícita y aparte) es el **único** camino de alta,
     idempotente. El nivel año y su `procesados/` se auto-crean siempre (rutina
     acotada por la validación de año). La validación de **forma** del slug
     (`^[a-z0-9-]{1,64}$`, no `procesados`) y del año (`^\d{4}$` en 2000-2100)
     protege el nombre de carpeta **y** el filtro `q` (sin escapar).
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

## 11. Riesgos y notas para el implementer

- 🔴 **`pnpm`, NO npm.** No hay dependencias nuevas: `@googleapis/drive` (feature 3)
  ya trae `files.*` y sus tipos (`drive_v3.Schema$File`).
- 🔴 **No toques `.env`** (secretos locales del humano). Solo `.env.example`.
- 🔴 **El guardián `no files.` de la feature 3 es sobre `src/lib/drive.ts`**: los
  `files.*` van en `drive-structure.ts`, no en `drive.ts`. No muevas nada a
  `drive.ts`.
- 🔴 **El guardián `process.env` solo en `config/env.ts`** cubre también
  `drive-structure.ts`: ni en un comentario aparezca `process.env`. El
  `rootFolderId` llega por parámetro (desde `fastify.config`), nunca del entorno.
- 🔴 **`createBank` es el ÚNICO sitio donde una carpeta de banco se crea.** Ni
  `ensureBankYearFolders`, ni `uploadFile`, ni `moveFileToProcessed` crean bancos:
  todos resuelven vía `resolveBankFolder`. No metas un atajo "si no existe, créalo"
  en la ruta normal — es exactamente lo que el humano descartó.
- **El re-lanzado de errores respeta `instanceof AppError`** (no solo
  `DriveConnectionError`): así un `UnknownBankError` o `ValidationError` no se
  convierte en `DriveConnectionError` al pasar por el `catch` (R28).
- **`vitest.config.ts` y `env.test.ts` se arreglan en la MISMA tanda que `env.ts`**:
  en cuanto `GOOGLE_DRIVE_ROOT_FOLDER_ID` es obligatoria, la suite se cae hasta que
  el placeholder de vitest y el `baseEnv` estén puestos (misma trampa que la
  feature 3, T5-T7).
- Imports relativos con extensión `.js`; `import type` para tipos; vendor antes que
  relativos; comillas simples, sin `;`, 2 espacios, 100 columnas.
- El typecheck es estricto y tipa los tests: los dobles necesitan `as unknown as
  AppDriveClient`. `client.files.create`/`list`/`update` devuelven `GaxiosResponse`;
  en los dobles basta con `{ data: { id: '...' } }` / `{ data: { files: [...] } }`.
</content>
