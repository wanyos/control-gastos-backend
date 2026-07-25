# Requirements — Feature 4: drive-structure

> Derivados del bloque `intent` de la feature 4 en `feature_list.json` (fuente
> de verdad del QUÉ) y de las decisiones ya tomadas en `docs/architecture.md`
> (Principios 1-5, ADR-004, ADR-005, ADR-006, **ADR-007**) y
> `docs/conventions.md`. Notación EARS estricta (ver `docs/specs.md`).
>
> Esta feature **se apoya en la feature 3 (`drive-connection`, ya `done`)**: NO
> vuelve a montar la conexión. Consume el cliente ya expuesto como
> `fastify.drive` (`AppDriveClient`) recibiéndolo por parámetro, exactamente
> como `checkDriveConnection(client)` (`src/lib/drive.ts:110`).
>
> Investigación previa que sostiene este spec: `progress/explorations/
> google-drive-auth.md` (§4.1 ya anticipa `GOOGLE_DRIVE_ROOT_FOLDER_ID` y cómo
> obtener el fileId de la raíz desde la URL de la carpeta en Drive).
>
> 🚨 **El paso manual que te toca a ti (crear la carpeta raíz `notas-banco/` a
> mano y pegar su fileId en `.env`) está en `design.md` §9.** Léelo en la puerta
> de aprobación: el backend NO crea la raíz, cuelga de ella.
>
> 🔁 **REVISIÓN DE LA PUERTA DE APROBACIÓN (2026-07-24) — modelo de identidad de
> banco.** El humano aprobó el spec con **un cambio**: sustituir "banco = slug
> libre con auto-crear si no existe" por **"Drive es el registro de bancos;
> crear un banco es una acción explícita"**. Motivo: auto-crear en la ruta normal
> convierte un typo (`santender` por `santander`) en una carpeta nueva
> silenciosamente equivocada. Requirements afectados: **R3, R4** (re-redactados) y
> **R23-R28** (nuevos). El resto del spec se mantiene. La validación de **forma**
> del slug (`^[a-z0-9-]{1,64}$`, R14/R15) y del año (`^\d{4}$` + rango, R16/R17)
> **no cambia**: el cambio es de SEMÁNTICA (usar-vs-crear), no de validación de forma.

## Decisiones delegadas que este spec resuelve (detalle y alternativas en `design.md`)

El `intent` cedió cuatro decisiones al agente (`delego_en_agente`). Se resuelven
aquí y se marcan `(delegado)` en la sección de Procedencia:

1. **Resolución nombre→fileId + idempotencia + condición de carrera**
   (`design.md` §3): `findFolder` lista por `q` y devuelve la existente (de-dup
   determinista); `ensureFolder` crea solo si no existe; lock en memoria por
   `(padre, nombre)` para el concurrente **dentro del proceso**. **Límite**
   anotado (R7, R8, `design.md` §3.3).
2. **Cómo conoce el backend la raíz** (`design.md` §4): variable de entorno nueva
   `GOOGLE_DRIVE_ROOT_FOLDER_ID`, **obligatoria**, validada al arrancar. El
   backend nunca crea la raíz (R1-R3).
3. **Superficie de exposición** (`design.md` §5): **servicio interno** (funciones
   puras en `src/lib/drive-structure.ts`), **no** endpoints de API. `api-contract.md`
   no gana endpoints; se documenta dónde y por qué (R20).
4. **Identidad del banco y validación del año** (`design.md` §6): el humano fijó en
   la puerta el **modelo de registro** (Drive es el registro de bancos; crear es
   explícito). El agente resuelve el **mecanismo**: forma del slug validada
   (R14/R15), resolución que exige existencia (R23), operación explícita
   `createBank` (R27), error `UnknownBankError` con lista + sugerencia por
   distancia de edición (R24-R26, R28); año = cadena de 4 dígitos en rango
   (R16/R17). Ambos protegen el nombre de carpeta y el filtro `q`.

## Configuración por entorno — la raíz creada a mano

### R1
CUANDO la app arranca con `GOOGLE_DRIVE_ROOT_FOLDER_ID` presente y no vacía, el
sistema DEBE construir una `AppConfig` que incluya `driveRootFolderId` con ese
valor exacto.

*Verificación:* test unitario de `loadConfig()` con un env sintético completo →
`config.driveRootFolderId` igual al valor pasado.

### R2
SI `GOOGLE_DRIVE_ROOT_FOLDER_ID` falta o está vacía ENTONCES `loadConfig()` DEBE
lanzar un error cuyo mensaje nombre `GOOGLE_DRIVE_ROOT_FOLDER_ID`, junto al resto
de problemas de configuración que hubiera (acumulados en el mismo mensaje).

*Verificación:* tests unitarios de `loadConfig()`: sin esa variable → lanza con
un mensaje que la nombra; y un caso con varias variables ausentes a la vez que la
lista junto a las demás.

### R3
El sistema NO DEBE crear ni asumir la carpeta raíz `notas-banco/`: DEBE tomar su
fileId de la configuración (`config.driveRootFolderId`) y usarlo como padre del
primer nivel (las carpetas de banco), sin invocar nunca `files.create` para la
propia raíz.

*Verificación:* test unitario de `createBank` con un doble de Drive: la creación
(`files.create`) de la carpeta del banco usa `parents: [rootFolderId]`; nunca se
crea la raíz. Complemento: en la ruta normal (`ensureBankYearFolders`), el primer
`files.create` que ocurre es el de la carpeta `<año>` con `parents:
[bankFolderId]` — la raíz nunca se crea.

## Asegurar la estructura de carpetas (`ensureBankYearFolders`)

> Modelo de registro (revisión de la puerta): la ruta normal **resuelve** la
> carpeta de banco existente (R23; error si no existe, R24) y a partir de ahí
> **auto-crea** de forma idempotente el nivel año y su `procesados/` (R4). El
> alta de una carpeta de banco nueva es una operación **explícita y aparte**
> (`createBank`, R27).

### R4
CUANDO se asegura un banco/año en la ruta normal y la carpeta del banco ya está
resuelta (existente, R23), el sistema DEBE crear —colgando de la carpeta del
banco— la carpeta `<año>` si no existe y —colgando de `<año>`— la subcarpeta
`procesados` si no existe, cada una con `mimeType:
'application/vnd.google-apps.folder'`.

*Verificación:* test unitario con un doble donde el `files.list` del banco
devuelve una carpeta existente y el `files.list` del año y de `procesados`
resuelven vacío → se comprueban **dos** llamadas a `files.create` (año con
`parents: [bankFolderId]`; `procesados` con `parents: [yearFolderId]`) y que
**no** se crea la carpeta del banco.

### R5
CUANDO se asegura un banco/año, el sistema DEBE devolver un objeto con los tres
identificadores reutilizables `{ bankFolderId, yearFolderId, processedFolderId }`.

*Verificación:* test unitario → el valor devuelto contiene el `bankFolderId` que
el `files.list` del banco existente produjo y los ids que el `files.create` (o
`files.list`) generó para año y `procesados`.

### R6
CUANDO una carpeta (banco, año o `procesados`) ya existe bajo su padre, el sistema
DEBE reutilizar su identificador existente sin invocar `files.create` para ella
(idempotencia).

*Verificación:* test unitario con un doble cuyo `files.list` devuelve una carpeta
existente en cada nivel → `files.create` **no** se llama y el resultado son los
ids devueltos por `files.list`. Segundo test: dos invocaciones seguidas de
`ensureBankYearFolders` con el mismo banco/año producen el mismo resultado y solo
la primera crea año/`procesados`.

### R7
CUANDO se invocan dos asegurados concurrentes del mismo banco/año dentro del mismo
proceso, el sistema DEBE crear cada carpeta como máximo una vez (no duplica por
carrera intra-proceso).

*Verificación:* test unitario que lanza dos `ensureBankYearFolders` en paralelo
(`Promise.all`) con un doble donde el banco YA existe y año/`procesados` resuelven
vacío → `files.create` se llama exactamente una vez por nivel creado (dos en
total: año y `procesados`), no cuatro. Cubre la condición de carrera que el
`intent` delegó al agente.

### R8
SI al resolver o asegurar una carpeta (banco bajo la raíz, o año/`procesados` bajo
su padre) el sistema encuentra más de una carpeta con el mismo nombre bajo el
mismo padre ENTONCES DEBE reutilizar de forma determinista una sola (la de
`createdTime` más antiguo) y NO DEBE crear otra.

*Verificación:* test unitario con un doble cuyo `files.list` devuelve dos carpetas
con `createdTime` distinto → el id devuelto es el de la más antigua y `files.create`
no se llama; se prueba tanto en resolución de banco (`resolveBankFolder`) como en
un nivel año/`procesados` (`ensureFolder`).

## Subir un archivo (`uploadFile`)

### R9
CUANDO se sube un archivo a la carpeta de un banco/año, el sistema DEBE crearlo
como archivo nuevo en esa carpeta mediante `files.create` con `parents:
[yearFolderId]` y el `media` del archivo, y DEBE devolver el `fileId` del nuevo
archivo.

*Verificación:* test unitario con un doble cuyo `files.create` devuelve un id →
se comprueba que se llamó con `requestBody.parents = [yearFolderId]`, el `name` y
el `media` dados, y que la función devuelve ese id.

### R10
SI ya existe un archivo con el mismo nombre en la carpeta del año ENTONCES el
sistema DEBE crear igualmente un archivo nuevo e independiente y NO DEBE
sobrescribir ni concatenar el existente (la subida nunca usa `files.update` sobre
un archivo previo).

*Verificación:* test unitario que sube dos veces el mismo `name` con un doble cuyo
`files.create` devuelve ids distintos → dos llamadas a `files.create` (nunca
`files.update`) y dos ids distintos devueltos.

## Mover a procesados (`moveFileToProcessed`)

### R11
CUANDO un archivo se da por procesado, el sistema DEBE moverlo a la subcarpeta
`procesados` invocando `files.update` con `addParents: processedFolderId` y
`removeParents: yearFolderId` para ese `fileId`, de modo que quede en `procesados`
y deje de colgar de la carpeta del año.

*Verificación:* test unitario con un doble de `files.update` → se comprueba que se
llamó con `fileId`, `addParents = processedFolderId` y `removeParents =
yearFolderId`.

## Errores de Drive y estructura no a medias

### R12
SI una operación de Drive (`files.list`, `files.create`, `files.update`) falla
(permiso, red, raíz inaccesible, cuota…) ENTONCES el sistema DEBE lanzar un
`DriveConnectionError` cuyo `message` NO DEBE contener el refresh token, el client
secret ni el texto crudo del error original.

*Verificación:* test unitario con un doble cuyo `files.create` rechaza con un error
que contiene una cadena con forma de token (`1//fake-token-value`) → el error
resultante es `DriveConnectionError` y su `message` **no** contiene esa cadena
(reutiliza el mapeo sanitizado de `src/lib/drive.ts`).

### R13
SI una operación falla a mitad de asegurar la estructura ENTONCES el sistema NO
DEBE devolver un resultado de éxito, y una reinvocación posterior de
`ensureBankYearFolders` DEBE completar la estructura reutilizando lo ya creado sin
duplicar (convergencia idempotente; Drive no tiene transacciones, ver `design.md`
§3.4).

*Verificación:* test unitario en dos fases con el mismo doble: (1) el banco existe
(`files.list` del banco lo devuelve); `files.list` del año rechaza → la llamada
lanza `DriveConnectionError` y no devuelve éxito. (2) reinvocación: el banco se
resuelve otra vez (nunca se crea), el año ahora se crea/reutiliza y `procesados`
se completa → la estructura converge y `files.create` del banco no se llama en
ninguna fase.

## Validación de banco y año

### R14
El sistema DEBE normalizar el nombre de banco a un slug seguro (minúsculas, sin
acentos, espacios y separadores a `-`, descartando cualquier carácter fuera de
`[a-z0-9-]`) antes de usarlo como nombre de carpeta y en el filtro `q`.

*Verificación:* tests unitarios de la función de normalización: `'BBVA'` →
`'bbva'`; `'La Caixa'` → `'la-caixa'`; `'Bancó'` → `'banco'`; `'../etc/passwd'`
→ un slug sin `/` ni `.` (p. ej. `'etcpasswd'`), demostrando que el path traversal
y las comillas quedan neutralizados por construcción.

### R15
SI el nombre de banco, tras normalizar, queda vacío, excede 64 caracteres, o es el
nombre reservado `procesados` ENTONCES el sistema DEBE lanzar `ValidationError` y
NO DEBE realizar ninguna llamada a Drive.

*Verificación:* tests unitarios: entrada `'///'` (normaliza a vacío) → lanza
`ValidationError`; entrada de 65+ caracteres válidos → lanza; entrada `'procesados'`
→ lanza; en los tres casos el doble de Drive no recibe ninguna llamada.

### R16
El sistema DEBE aceptar como año únicamente una cadena de exactamente cuatro
dígitos (`^\d{4}$`) con valor entre 2000 y 2100 inclusive, y usar esa misma cadena
como nombre de carpeta.

*Verificación:* test unitario: `'2026'` es aceptado y se usa como nombre de la
carpeta del año.

### R17
SI el año no es una cadena de cuatro dígitos en el rango de R16 ENTONCES el sistema
DEBE lanzar `ValidationError` y NO DEBE realizar ninguna llamada a Drive.

*Verificación:* tests unitarios: `'99'`, `'20260'`, `'abcd'`, `'1999'`, `'2101'`,
`"20'26"` → cada uno lanza `ValidationError` y el doble de Drive no recibe llamadas.

## Registro de bancos: resolver (usar) vs. crear (explícito)

> Núcleo del cambio decidido en la puerta de aprobación (2026-07-24): **las
> subcarpetas directas de la raíz `notas-banco/` son la única fuente de verdad de
> "qué bancos existen"** (no hay lista en config ni en BD). La ruta cotidiana
> **resuelve** (exige existencia, R23; error si no, R24-R26/R28); el alta de un
> banco es una operación **explícita y deliberada** (R27).

### R23
CUANDO se pide asegurar un banco/año en la ruta normal, o subir/mover un archivo
que dependa de la carpeta de un banco, el sistema DEBE resolver la carpeta del
banco reutilizando la subcarpeta existente de la raíz cuyo nombre sea el slug
validado del banco (R14, R15), sin invocar nunca `files.create` para el nivel de
banco.

*Verificación:* test unitario con un doble donde el `files.list` del banco bajo la
raíz devuelve una carpeta existente → `resolveBankFolder` devuelve su id y
`files.create` **no** se llama para la carpeta del banco.

### R24
SI el slug del banco tiene formato válido (R14, R15) pero NO existe una subcarpeta
suya bajo la raíz ENTONCES el sistema DEBE lanzar `UnknownBankError` y NO DEBE
crear ninguna carpeta (ni de banco, ni de año, ni `procesados`).

*Verificación:* test unitario con un doble donde el `files.list` del banco pedido
resuelve vacío y el `files.list` de las subcarpetas de la raíz devuelve
`['santander', 'bbva']` → `ensureBankYearFolders('santender', …)` lanza
`UnknownBankError` y `files.create` **no** se llama en ningún nivel.

### R25
CUANDO el sistema lanza `UnknownBankError`, el `message` DEBE incluir los nombres
de los bancos conocidos (las subcarpetas actuales de la raíz).

*Verificación:* test unitario: con la raíz conteniendo `['santander', 'bbva']`, el
`message` del `UnknownBankError` para `'santender'` contiene `'santander'` y
`'bbva'`.

### R26
CUANDO el sistema lanza `UnknownBankError` y existe un banco conocido cuya
distancia de edición (Levenshtein) al slug pedido es menor o igual al umbral
definido en `design.md` §6, el `message` DEBE incluir ese banco como sugerencia
(`¿quisiste decir <banco>?`).

*Verificación:* (a) test de la función pura de sugerencia `suggestBank`:
`suggestBank('santender', ['santander', 'bbva'])` → `'santander'`;
`suggestBank('zzzzz', ['santander', 'bbva'])` → `undefined` (nadie dentro del
umbral); (b) integración: el `message` del `UnknownBankError` para `'santender'`
contiene `'santander'` como sugerencia. Todo sin red (función pura + doble).

### R27
El sistema DEBE dar de alta una carpeta de banco nueva **únicamente** a través de
la operación explícita `createBank(client, rootFolderId, slug)`, que asegura la
carpeta del banco bajo la raíz de forma idempotente (la crea con `parents:
[rootFolderId]` si no existe; la reutiliza si ya existe) y devuelve su
identificador.

*Verificación:* tests unitarios: (a) `createBank` con un doble cuyo `files.list`
del banco resuelve vacío → `files.create` se llama con `mimeType` de carpeta y
`parents: [rootFolderId]`, y devuelve el id creado; (b) `createBank` cuando el
banco ya existe → `files.create` **no** se llama y devuelve el id existente
(idempotente); (c) el test de R24 confirma que la ruta normal nunca da de alta un
banco.

### R28
El sistema DEBE señalar el banco desconocido con `UnknownBankError` (subclase de
`AppError`, `code` `UNKNOWN_BANK`, HTTP 404), un error distinguible tanto de
`ValidationError` (slug/año con formato inválido, 400) como de
`DriveConnectionError` (fallo de conectividad con Drive, 503).

*Verificación:* test unitario de la clase: `UnknownBankError` es `instanceof
AppError`, con `code = 'UNKNOWN_BANK'`, `statusCode = 404` y `name =
'UnknownBankError'`. Complemento de discriminación: un slug de formato inválido
lanza `ValidationError` (R15), no `UnknownBankError`; un slug válido no registrado
lanza `UnknownBankError`, no `ValidationError`; un fallo de Drive lanza
`DriveConnectionError` (R12), no `UnknownBankError`.

## Alcance (los `que_no_quiero`)

### R18
El sistema NO DEBE leer ni parsear el contenido de los archivos, NO DEBE importar
datos a la base de datos, y NO DEBE detectar "N nuevos" ni disparar la importación:
`src/lib/drive-structure.ts` NO DEBE contener referencias a `prisma`.

*Verificación:* test guardián en `src/architecture.test.ts` que lee
`src/lib/drive-structure.ts` y falla si contiene la cadena `prisma`; complemento:
revisión del diff por el reviewer (sin lectura/parseo de contenido).

### R19
El sistema DEBE reutilizar la conexión de la feature 3 recibiendo el
`AppDriveClient` por parámetro, y NO DEBE construir un cliente de Drive ni resolver
autenticación en `src/lib/drive-structure.ts` (no `createDriveClient`,
`createDriveAuth`, `OAuth2` ni `process.env`).

*Verificación:* las funciones aceptan el cliente por parámetro (probadas con un
doble); test guardián en `src/architecture.test.ts` que falla si
`src/lib/drive-structure.ts` referencia `createDriveClient`, `createDriveAuth` o
`OAuth2`. Complemento: el guardián existente `reads process.env only in
src/config/env.ts` ya cubre `drive-structure.ts`.

## Exposición, documentación y verificación (requirements de proceso)

### R20
El sistema DEBE exponer esta capacidad como **servicio interno** (funciones puras
en `src/lib/drive-structure.ts`) y NO DEBE añadir endpoints de API en esta feature;
`docs/api-contract.md` NO gana endpoints nuevos y DEBE dejar anotado que la feature
4 se resolvió como servicio interno (por qué en `design.md` §5) y que el nuevo
código de error `UNKNOWN_BANK` queda **reservado** (interno, ningún endpoint lo
devuelve todavía), igual que `DRIVE_CONNECTION_ERROR`.

*Verificación:* manual — checklist del reviewer contra `design.md` §5 y el diff
(no aparecen rutas nuevas; las notas de `api-contract.md` quedan escritas).
Requirement de proceso sin superficie ejecutable propia (misma excepción consciente
que R21/R22/R23 de `specs/drive-connection/`).

### R21
El sistema DEBE registrar las decisiones delegadas como **ADR-008** en
`docs/architecture.md` (formato ADR-005/006/007) con el modelo de registro
aprobado (Drive como registro de bancos + `createBank` explícito + `UnknownBankError`),
añadir `lib/drive-structure.ts` al árbol de la §Estructura de carpetas, anotar en el
umbral de **ADR-006** que las variables llegan a **8** pero siguen siendo strings
planos (validador manual mantenido), documentar la nueva variable en `docs/stack.md`
y `.env.example` (solo placeholder), y registrar el nuevo error `UnknownBankError`
como subclase idiomática bajo **ADR-005**.

*Verificación:* manual — checklist del reviewer (mismo carácter de proceso que R20).

### R22
CUANDO se ejecuta `bash ./init.sh`, el proceso DEBE terminar con `[OK] Entorno
listo` (typecheck estricto + suite completa al 100%), sin credenciales reales de
Drive ni red; y cada `R<n>` DEBE quedar mapeado a al menos un test concreto en
`progress/implementations/drive-structure.md`.

*Verificación:* ejecución real de `bash ./init.sh` + revisión del mapa de
trazabilidad por el reviewer (Nivel 4 de `docs/verification.md`).

---

## Procedencia

> Clasificación obligatoria de cada `R<n>` (ver `docs/specs.md`). El humano revisa
> con lupa lo `(delegado)` y, sobre todo, lo `(añadido)`.
>
> 🔁 **Actualizada tras la revisión de la puerta (2026-07-24).** La identidad de
> banco pasa de "string libre auto-creado" (decisión que era `(delegado)` del
> agente) a **modelo de registro decidido por el humano en la puerta**: su núcleo
> es ahora `(humano)`; el mecanismo concreto que lo implementa es `(delegado)`.

### 🟥 AÑADIDO — revisar en la puerta de aprobación

- **R8 — (añadido)** El humano pidió idempotencia ("NO crea duplicados: la
  reutiliza"), **no** dijo qué hacer si Drive **ya** contiene dos carpetas con el
  mismo nombre bajo el mismo padre (Drive lo permite; puede pasar si el humano
  duplica a mano, o por una carrera entre dos instancias del backend). Propongo:
  **reutilizar la más antigua de forma determinista, sin crear una tercera y sin
  borrar la sobrante** (borrar es destructivo y queda fuera de alcance). Es la
  contraparte de lectura del lock de R7, y ahora aplica también a la resolución de
  banco bajo la raíz (dos carpetas homónimas de banco → se usa la más antigua).
  **← REVISAR EN APROBACIÓN.**
- **R16 (rango 2000-2100) — (añadido)** El humano pidió "cómo se valida el año",
  sin fijar un rango. El núcleo de seguridad es el charset (`^\d{4}$`, sin
  inyección). Añado el rango 2000-2100 como cota de cordura **fija** (no acoplada
  al reloj del sistema, para que los tests sean deterministas). Si prefieres otro
  rango o solo `^\d{4}$`, es un cambio de una línea. **← REVISAR EN APROBACIÓN.**
- **R26 (umbral y desempate de la sugerencia) — (añadido)** El humano pidió que el
  error de banco desconocido **sugiera el más parecido por distancia de edición**
  (eso es `(humano/delegado)`, abajo). Lo que YO fijo y debes revisar es: (1) el
  **umbral** por debajo del cual se ofrece sugerencia (propongo distancia de
  Levenshtein ≤ **2**, fijo); si nadie está a ≤2, no se fuerza una sugerencia
  disparatada, solo se lista. (2) el **desempate** cuando dos bancos empatan en
  distancia (propongo el primero por orden alfabético, para que sea determinista).
  Ajustables en una línea. **← REVISAR EN APROBACIÓN.**

### Delegado (resuelve algo de `delego_en_agente` o el mecanismo de lo que el humano decidió en la puerta)

- **R1, R2 — (delegado)** El humano cedió "cómo conoce el backend la carpeta raíz
  (p. ej. su fileId por variable de entorno)". Decido: variable **obligatoria**
  `GOOGLE_DRIVE_ROOT_FOLDER_ID`, validada al arrancar con el mismo patrón y la
  misma política fail-fast que las tres de la feature 3 (`env.ts`). Alternativa
  descartada: variable opcional con descubrimiento por nombre ("busca una carpeta
  llamada notas-banco") — reintroduce el problema nombre→id en la raíz y viola
  "no asumas la raíz". Detalle en `design.md` §4.
- **R3 — (delegado + humano)** Sale del `que_no_quiero` "No crear la carpeta raíz
  notas-banco/: la creo yo a mano y el backend cuelga de ella" **y** de la
  delegación de cómo conoce la raíz. El backend nunca la crea; la primera creación
  cuelga siempre de `rootFolderId`.
- **R4, R5, R6, R7 — (delegado)** El humano cedió "cómo resolver rutas por nombre
  (banco/año) a los IDs internos de Drive… y cómo hacer el ensureFolder idempotente
  evitando duplicados y condiciones de carrera". Decido: `findFolder` resuelve por
  `files.list` (`q` con `name`+`mimeType`+padre+`trashed=false`); `ensureFolder`
  crea solo si no existe; lock en memoria por `(padre, nombre)` para la carrera
  **intra-proceso**. En la ruta normal, año y `procesados` se auto-crean (rutina
  esperada acotada por R16); el banco NO (R23/R24). Alternativa descartada:
  `appProperties` como marca de unicidad (`design.md` §3.2). **Límite del lock
  anotado en R7/R8 y `design.md` §3.3.**
- **R9, R10 — (delegado)** Parte de "subir archivo" cedido. Decido `files.create`
  con `media` (nunca `update` sobre un existente): en Drive cada `create` produce
  un archivo nuevo, así que "sin sobrescribir ni concatenarse" se cumple por
  construcción. Sale también del `intent` "aparece como archivo nuevo… sin
  sobrescribir ni concatenarse".
- **R11 — (delegado + humano)** Sale de "lo mueve a procesados/ y deja de estar en
  la carpeta de pendientes". El **cómo** (`files.update` con
  `addParents`/`removeParents`, el idioma de mover en Drive v3) es criterio mío.
- **R12 — (humano + delegado)** Sale de "algo falla con Drive… error claro". Decido
  **reutilizar `DriveConnectionError`** (ya existe, `DRIVE_CONNECTION_ERROR`, 503,
  con mapeo sanitizado en `src/lib/drive.ts`) para el fallo de conectividad. Es
  además el uso que `api-contract.md` ya **reservó** para la feature 4. Alternativa
  descartada: `DriveStructureError` propio — detalle en `design.md` §7.
- **R13 — (delegado)** Resuelve "no deja la estructura a medias" con la restricción
  real de Drive (sin transacciones): en vez de rollback, **convergencia idempotente
  en la reinvocación** + no reportar éxito parcial. Alternativa descartada: borrar
  lo creado al fallar (destructivo y arriesgado), `design.md` §3.4.
- **R14, R15 — (delegado)** El humano cedió "cómo se identifica el banco de entrada
  (¿lista cerrada?, ¿string libre?)". Decido normalizar la entrada a un **slug
  seguro** y validar su **forma** (`^[a-z0-9-]{1,64}$`, no `procesados`). Esta
  validación de forma es independiente del modelo de registro (R23-R28) y lo
  **precede**: protege el nombre de carpeta y el filtro `q` tanto al resolver como
  al crear. Alternativa (lista cerrada hardcodeada) en `design.md` §6.
- **R16, R17 — (delegado)** Parte del "cómo se valida el año" cedido (el rango de
  R16 es `(añadido)`, ver arriba).
- **R20 — (delegado)** El humano cedió "si 'subir' y 'mover' se exponen como
  servicio interno, endpoint(s), o ambos; que lo proponga". Decido **servicio
  interno, sin endpoints**. Razones: no hay aún consumidor externo (el consumidor
  es la ingesta de una feature futura, que es backend), y exponer una subida/movida
  de archivos sin autenticación sobre un Drive con scope completo es un riesgo que
  el `que_no_quiero` ("no disparar la importación aquí") no justifica todavía.
  Alternativa descartada (endpoints) en `design.md` §5.
- **R23, R27 — (humano + delegado)** El **modelo** (Drive es el registro; usar
  resuelve-existente, crear es explícito) lo decidió el **humano** en la puerta
  (ver `(humano)` abajo). El **mecanismo** es mío: `resolveBankFolder` (resuelve o
  falla) frente a `createBank` (función **dedicada y aparte**, único camino de
  alta). Elegí **función dedicada** sobre un flag `{ create: true }` en la ruta
  normal porque hace el alta **inequívocamente deliberada** e imposible de
  disparar por descuido desde la ingesta cotidiana (un flag es más fácil de
  colar por error que una función con otro nombre). Detalle en `design.md` §6.
- **R24, R28 — (delegado)** El humano cedió elegir el error ("reutilizar
  `ValidationError`, o un error tipo not-found/`UnknownBankError` nuevo; propón y
  justifica"). Decido **crear `UnknownBankError`** (subclase de `AppError`,
  `UNKNOWN_BANK`, 404). Razón: el humano exige que "banco desconocido" sea
  distinguible de un fallo de Drive **y** de un formato inválido; reutilizar
  `ValidationError` (400) lo haría indistinguible del formato inválido, y
  `NotFoundError` (`NOT_FOUND` genérico) lo confundiría con "gasto/ruta no
  existe". Un `code` propio deja a la ingesta futura discriminar exactamente este
  caso (p. ej. para ofrecer crear el banco). ADR-005 ya prevé subclases nuevas
  "cuando una feature las necesite". Alternativas descartadas en `design.md` §7.
- **R25, R26 — (humano + delegado)** El humano pidió que el error **liste los
  bancos conocidos** (DEBE) y **sugiera el más parecido por distancia de edición**
  (esto último lo escribió como "debería"; lo convierto en un DEBE condicional
  verificable, R26). El **mecanismo** (listar las subcarpetas de la raíz para la
  lista; `suggestBank`, función pura con Levenshtein, para la sugerencia) es mío.
  El **umbral y el desempate** son `(añadido)`, ver arriba.

### Humano (trazable a una frase del `intent` o a la decisión de la puerta de aprobación)

- **R4, R6 — (humano)** "Cuando pido asegurar la carpeta de un banco/año que aún no
  existe, el backend la crea (con su procesados/ dentro)"; "Cuando esa carpeta ya
  existe… NO crea duplicados: la reutiliza (es idempotente)". Matizado en la puerta:
  el auto-crear de R4 aplica al año y `procesados/` (rutina esperada), no al banco.
- **R9, R10 — (humano)** "aparece como archivo nuevo dentro de
  notas-banco/<banco>/<año>/, sin sobrescribir ni concatenarse a otro archivo
  existente".
- **R11 — (humano)** "el backend lo mueve a notas-banco/<banco>/<año>/procesados/ y
  deja de estar en la carpeta de pendientes".
- **R12, R13 — (humano)** "Cuando algo falla con Drive (permiso, red, carpeta raíz
  inaccesible), el backend responde con un error claro y no deja la estructura a
  medias".
- **R23, R24, R25, R26, R27 — (humano)** Decisión tomada por el humano en la **puerta
  de aprobación (2026-07-24)**: "Drive es el registro de bancos; crear un banco es
  una acción explícita." De ahí salen directamente: la resolución que **exige que la
  carpeta de banco exista** (R23), el **error claro que NO crea** ante un banco
  desconocido (R24), con la **lista de bancos conocidos** (R25) y la **sugerencia
  del más parecido** (R26), y el **alta explícita y aparte** como único camino de
  creación (R27). El humano lo justificó con el caso del typo
  (`santender`→carpeta nueva errónea). El mecanismo concreto de cada uno está
  marcado arriba como `(delegado)`.
- **R18 — (humano)** Literal de los `que_no_quiero`: "No leer ni parsear el
  contenido de los archivos, ni importar movimientos a la base de datos"; "No
  implementar la detección de 'N nuevos' ni el disparo de la importación aquí". El
  test guardián que lo mecaniza es mío.
- **R19 — (humano)** Del `que_no_quiero` "No montar la conexión con Drive aquí:
  esta feature se apoya en la feature de conexión (id 3)". El guardián es mío.
- **R21, R22 — (humano)** Reglas de cierre del acceptance y de
  `docs/verification.md`/`docs/architecture.md` (ADR obligatorio, variables en
  stack/env, init.sh verde, trazabilidad).
</content>
</invoke>
