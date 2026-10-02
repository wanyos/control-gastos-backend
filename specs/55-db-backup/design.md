# Design — F55 `db-backup`

## 1. Lo que se comprobó antes de escribir (2026-10-02)

Ejecutado, con su resultado:

| Qué | Comando | Resultado |
|---|---|---|
| Herramientas en el host Windows | `which pg_dump pg_restore psql` (Git Bash) | Ninguna en el `PATH`. Existe `C:\Program Files\PostgreSQL\17\`, pero no está en el `PATH` y no se ha mirado dentro |
| Herramientas en el contenedor | `docker exec gastos-postgres sh -c 'pg_dump --version; pg_restore --version; psql --version'` | Las tres, 17.9 |
| Acceso dentro del contenedor | `docker exec gastos-postgres psql -U postgres -Atc "select 1"` | Funciona sin contraseña (0,18 s) |
| Tamaño de la base del humano | `select pg_size_pretty(pg_database_size('gastos'))` | 9310 kB |
| Ida y vuelta por tuberías desde Node | Script de prueba con `spawn('docker', …)`: `pg_dump --format=custom --no-owner --no-privileges` de una base `gastos_test_spec55_src` (clon de `gastos_test_template` + una tabla de 37 filas) a un `Buffer`, y ese `Buffer` por la entrada de `docker exec -i … pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -d gastos_test_spec55_dst` | `pg_dump` código 0, 39195 bytes, empieza por `PGDMP`. `pg_restore` código 0. Origen y destino: 11 tablas, 37 filas, 11 migraciones, misma secuencia. Las dos bases de prueba se borraron (quedan 0) |
| `pg_restore` con un archivo que no es una copia | El mismo script, entrada `not a dump` | Código 1, `input file does not appear to be a valid archive` |
| `pg_dump` de una base que no existe | Ídem | Código 1, 0 bytes en la salida |
| Contenedor inexistente | `docker exec no-such-container …` | Código 1, `No such container` |
| Renombrar una base con otra sesión abierta | `alter database … rename to …` con una sesión en `pg_stat_activity` | Falla: `is being accessed by other users` |
| Cuerpo `Buffer` en una subida | Lectura de `googleapis-common@9.0.4/build/src/apirequest.js` (`multipartUpload`) | Un cuerpo que no es un stream se envía tal cual (`rStream.push(part.body)`) |
| Forma del error de Drive | Lectura de `gaxios@7.3.0/build/esm/src/common.js` | `GaxiosError` lleva `status` (número) y `response` |
| Permisos del token | Lectura de `scripts/get-drive-refresh-token.mjs` y `src/lib/drive.ts` | Se pide con `https://www.googleapis.com/auth/drive` (Drive completo): alcanza cualquier carpeta de la cuenta, cuelgue o no de `notas-banco/` |

**No comprobado, y qué haría falta:**

- Que la carpeta `backup-control-gastos` exista: hay que listar el Drive del
  humano, y no se ha tocado.
- Que el token que hay en su `.env` se emitiera con ese permiso y pueda escribir
  fuera de `notas-banco/`: hay que hacer una subida real. La hace él en la prueba
  real (`decisions.md` 📌).
- Que `files.create` devuelva `size` cuando se le pide en `fields`: es lo que
  documenta la API v3, no se ha llamado. Si no lo devolviera, R5 falla en la
  prueba real con el mensaje de tamaño; el implementer lo cubre entonces con un
  `files.get` posterior y lo dice en su informe.

## 2. Decisiones

1. **La copia se obtiene dentro del contenedor**, con
   `docker exec gastos-postgres pg_dump`, y viaja por la salida estándar a un
   `Buffer` de Node. No hay `pg_dump` en el host, y el del contenedor es siempre
   de la misma versión que el servidor.
2. **Formato `custom` de `pg_dump`** (`--format=custom --no-owner
   --no-privileges`): comprimido, se restaura con `pg_restore`, que acepta la
   entrada estándar y `--single-transaction` (todo o nada).
3. **Sin archivo intermedio** (R6): `Buffer` en memoria en los dos sentidos. Con
   9310 kB de base no hace falta streaming.
4. **Toda operación sobre PostgreSQL de estos comandos pasa por el mismo
   ejecutor**, `docker exec gastos-postgres <programa>` (`pg_dump`, `pg_restore`,
   `psql`). No se abre una conexión con `pg` ni con Prisma: un solo mecanismo y
   ninguna dependencia nueva.
5. **La carpeta se localiza por identificador** en
   `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (opcional en `loadConfig`, obligatoria para
   los dos comandos), normalizado con `normalizeDriveFolderId` igual que la raíz.
6. **La carpeta va FUERA de `notas-banco/`**: toda subcarpeta de la raíz es un
   banco para `listBankFolders` (`src/lib/drive-structure.ts`).
7. **Restaurar siempre a una base que no tiene nada que perder.** Tres casos:
   - destino inexistente → se crea y se restaura en él; si falla, se borra;
   - destino sin tablas → se restaura en él (`--single-transaction`: si falla,
     queda como estaba);
   - destino con tablas → confirmación (R9); se restaura primero en
     `<base>_restore_<sello>`; solo si termina bien se renombra el destino a
     `<base>_before_restore_<sello>` y la nueva al nombre del destino (R10). Si
     algo falla antes del segundo renombrado, se borra la base nueva y el destino
     recupera o conserva su nombre (R12).
8. **La confirmación es escribir el nombre de la base**, leído del terminal. Si
   `process.stdin.isTTY` no es `true`, no se pregunta y se trata como no
   confirmada. No hay argumento ni variable que la salte.
9. **Módulo `src/modules/backup/` sin rutas**, que nadie de `src/` importa; lo
   ejecutan dos scripts finos en `scripts/`, como `scripts/parse-bank-file.ts`.

## 3. Archivos

### 3.1 Nuevos

`src/modules/backup/backup.types.ts`

```ts
export interface CommandResult { exitCode: number; stdout: Buffer; stderr: string }
/** Runs `docker exec [-i] gastos-postgres <args>`; `input` goes to its stdin. */
export type ContainerCommand = (args: string[], input?: Buffer) => Promise<CommandResult>
export interface DatabaseTarget { user: string; database: string }
export interface BackupFolder { id: string; name: string }
export interface BackupFile { id: string; name: string; sizeBytes: number; createdTime: string }
export interface CreatedBackup { fileName: string; sizeBytes: number; folderName: string }
export interface TableRows { table: string; rows: number }
export interface RestoredDatabase {
  database: string
  tables: TableRows[]
  /** Name the previous content was kept under, or null if there was none. */
  previousDatabase: string | null
}
export interface BackupDeps {
  drive: AppDriveClient
  folderId: string | undefined
  databaseUrl: string
  run: ContainerCommand
  now: () => Date
  /** Returns what the human typed, or null if it could not ask. */
  confirm: (database: string, keptAs: string) => Promise<string | null>
}
```

`src/modules/backup/backup.database.ts` — lo que se ejecuta en el contenedor.

```ts
export const postgresContainerName = 'gastos-postgres'
export const runInContainer: ContainerCommand            // spawn('docker', ['exec', ('-i'), name, ...args])
export function databaseTarget(databaseUrl: string): DatabaseTarget
export function assertDatabaseName(name: string): void   // ^[a-z][a-z0-9_]{0,29}$
export async function dumpDatabase(run, target): Promise<Buffer>
export async function restoreDump(run, target, dump: Buffer): Promise<void>
export async function databaseExists(run, user, name): Promise<boolean>
export async function hasTables(run, target): Promise<boolean>
export async function createDatabase(run, user, name): Promise<void>
export async function dropDatabase(run, user, name): Promise<void>
export async function renameDatabase(run, user, from, to): Promise<void>
export async function countRows(run, target): Promise<TableRows[]>
```

- `pg_dump -U <user> --format=custom --no-owner --no-privileges <database>`.
  Sin `--file`: la salida es la estándar.
- `pg_restore -U <user> --no-owner --no-privileges --exit-on-error
  --single-transaction -d <database>`, con el `Buffer` por la entrada.
- `psql -U <user> -d postgres -v ON_ERROR_STOP=1 -At -c <sql>` para existir,
  crear, borrar y renombrar; `-d <database>` para `hasTables` y `countRows`.
- Los nombres de base se interpolan en SQL: por eso `assertDatabaseName` se
  llama antes de cualquier uso y los nombres derivados
  (`_restore_<sello>`, `_before_restore_<sello>`) se construyen solo a partir de
  uno ya validado. 30 caracteres de tope dejan sitio al sufijo más largo dentro
  de los 63 de PostgreSQL.
- `countRows` cuenta **todas** las tablas de `public`, también
  `_prisma_migrations`: es lo que el humano compara.
- Un código de salida distinto de 0 se convierte en `BackupError` con el paso
  que falló. De `stderr` solo se reconocen síntomas conocidos (`No such
  container`, `is being accessed by other users`, `does not appear to be a valid
  archive`, `does not exist`); el texto crudo no se imprime.
- `dropDatabase` solo se llama sobre una base que **este mismo comando** creó en
  esta ejecución.
- No importa de `src/lib/test-db.ts` (es código solo de tests): la lectura de la
  URL son tres líneas propias.

`src/modules/backup/backup.drive.ts` — lo que se le pide a Drive.

```ts
export async function resolveBackupFolder(client, folderId: string | undefined): Promise<BackupFolder>
export async function uploadBackup(client, folderId, name, content: Buffer): Promise<BackupFile>
export async function listBackupFiles(client, folderId): Promise<BackupFile[]>
```

- `resolveBackupFolder`: `files.get({ fileId, fields: 'id, name, mimeType,
  trashed' })`. `undefined` → causa «falta la variable»; `status === 404` →
  «no existe o esta cuenta no la ve»; `mimeType` distinto del de carpeta → «no
  es una carpeta»; `trashed` → «está en la papelera». Cualquier otro fallo →
  `driveErrorMessage(error)` (constantes, nunca el texto crudo).
- `uploadBackup`: `files.create({ requestBody: { name, parents: [folderId] },
  media: { mimeType: 'application/octet-stream', body: content }, fields: 'id,
  name, size, createdTime' })`. Si `Number(size) !== content.length` →
  `BackupError` (R5).
- `listBackupFiles`: `files.list` con `'<folderId>' in parents and trashed =
  false and mimeType != carpeta`, `fields: 'files(id, name, size,
  createdTime)'`, `orderBy: 'createdTime desc'`, `pageSize: 1000`. El nombre que
  escribe el humano **no** entra en la consulta: se compara en código.
- La descarga reutiliza `downloadFileContent` de `src/lib/drive-structure.ts`,
  sin tocar ese archivo.
- Este archivo no llama a `files.update`, `files.delete`, `files.copy` ni
  `files.emptyTrash` (R3).

`src/modules/backup/backup.service.ts`

```ts
export function backupFileName(now: Date): string          // control-gastos-2026-10-02-183045.dump (getters locales)
export function timestampOf(now: Date): string             // 20261002183045
export async function createBackup(deps: BackupDeps): Promise<CreatedBackup>
export async function listBackups(deps: BackupDeps): Promise<BackupFile[]>
export async function restoreBackup(
  deps: BackupDeps,
  args: { fileName: string; database: string },
): Promise<RestoredDatabase>
export function formatBytes(bytes: number): string         // «1,2 MB (1 234 567 bytes)»
export function formatCreatedBackup(created: CreatedBackup): string
export function formatBackupList(files: BackupFile[]): string
export function formatRestoredDatabase(restored: RestoredDatabase): string
```

Orden de `createBackup`: carpeta (R4) → `dumpDatabase` (R5) → `uploadBackup`
(R5). La carpeta va primero para no generar una copia que no se va a poder subir.

Orden de `restoreBackup`:

1. `assertDatabaseName(args.database)`; carpeta; `listBackupFiles`; exactamente
   un archivo con ese nombre (0 → el mensaje lista los que hay; 2 o más → lo
   dice).
2. Estado del destino: no existe / sin tablas / con tablas.
3. Con tablas: `confirm(database, keptAs)`; si lo devuelto no es exactamente
   `database` → `BackupError`, **sin haber descargado nada**.
4. Descarga; `restoreDump` en el destino o en la base nueva (decisión 7).
5. Con tablas: dos `renameDatabase`. Si el primero falla por sesiones abiertas,
   se borra la base nueva y el mensaje dice que pare `pnpm run dev` y cualquier
   otro programa conectado. Si falla el segundo, se deshace el primero.
6. `countRows` del destino.

`src/modules/backup/backup.confirm.ts`

```ts
export async function askDatabaseName(
  input: NodeJS.ReadableStream & { isTTY?: boolean },
  output: NodeJS.WritableStream,
  database: string,
  keptAs: string,
): Promise<string | null>
```

Devuelve `null` sin escribir nada si `input.isTTY !== true`. Si es un terminal,
escribe en `output` qué base se va a sustituir y con qué nombre se conserva la
actual, y devuelve la línea tecleada sin recortar más que el salto de línea.

`src/modules/backup/backup.fixture.ts` — doble de Drive en memoria: una carpeta
con sus archivos (`get` de metadatos, `get` con `alt: 'media'`, `list`,
`create`), que apunta **toda** llamada recibida por nombre de método, y con
interruptores para simular «la carpeta no existe» (lanza un error con
`status: 404`), «no es carpeta», «en la papelera», «la subida falla» y «Drive
guardó otro tamaño». Ningún identificador ni contenido es de nadie.

`scripts/db-backup.ts` y `scripts/db-restore.ts` — finos:
`import '../src/lib/load-env-file.js'` → `loadConfig()` → `createDriveClient`
→ servicio → `console.log` / `console.error` → `process.exitCode`. `console` es
la misma excepción consciente de `scripts/parse-bank-file.ts`. `db-restore` sin
argumentos llama a `listBackups`; con uno solo, imprime el uso y sale con 1.
Los mensajes al humano van en español, como los de `parse-file`.

`docs/database-backup.md` — ver §5.

### 3.2 Modificados

- `src/config/env.ts`: `AppConfig.driveBackupFolderId?: string`. Si la variable
  viene, se normaliza con `normalizeDriveFolderId` y se valida igual que la raíz
  (vacía o con espacios o `/` → problema). Si no viene, no es un problema (R14).
- `src/errors/app-error.ts`: `BackupError extends AppError`, código
  `BACKUP_FAILED`, 500. No llega nunca a una respuesta HTTP; existe para no
  lanzar `Error` sueltos (`docs/conventions.md` §Manejo de errores).
- `package.json`: `"db:backup": "tsx scripts/db-backup.ts"` y
  `"db:restore": "tsx scripts/db-restore.ts"`.
- `.env.example`: bloque de `GOOGLE_DRIVE_BACKUP_FOLDER_ID` con placeholder y
  la advertencia de que la carpeta va fuera de `notas-banco/`.
- `src/architecture.test.ts`: los archivos del módulo en la lista del árbol, y
  los tests de §4.
- `src/config/env.test.ts`: los dos tests de §4.

No cambian: `src/app.ts`, `src/lib/drive.ts`, `src/lib/drive-structure.ts`,
`src/lib/test-db.ts`, `vitest.*.ts`, `prisma/`, `docs/api-contract.md`,
`docs/data-model.md`.

## 4. Tests (nombres exactos; los `checks` filtran por ellos)

`src/modules/backup/backup.service.test.ts` — Drive: el doble de
`backup.fixture.ts`. PostgreSQL: el de verdad, con `runInContainer`, sobre la
base desechable del worker (`process.env.DATABASE_URL`, que `vitest.setup.ts` ya
apunta a `gastos_test_<n>`) como origen, con filas inventadas que el test borra,
y como destino bases `gastos_test_backup_<poolId>_<sufijo>` que el propio test
crea y borra en un `afterEach` (también las `_restore_` y `_before_restore_` que
deriven). Todo nombre empieza por `gastos_test_` y pasa por `assertTestDatabase`
antes de borrarse.

| Test | Cubre |
|---|---|
| `uploads a new dump file named with the local date and time into the configured folder` | R1 |
| `reports the name and the size of the uploaded copy and the name of the folder` | R2 |
| `adds a second file on a second backup and leaves the first one as it was` | R3 |
| `calls nothing of Drive that deletes, moves or renames a file` (tras una copia, un listado y una restauración) | R3 |
| `fails without claiming a copy when the folder variable is missing` | R4 |
| `fails without claiming a copy when the folder does not exist` | R4 |
| `fails without claiming a copy when the id is not a folder or is in the bin` | R4 |
| `fails without claiming a copy when the dump fails` (ejecutor que devuelve código 1) | R5 |
| `fails without claiming a copy when the upload fails` | R5 |
| `fails when Drive stored a different size than the one sent` | R5 |
| `restores a copy into an empty database with the same tables and the same row counts` | R7 |
| `creates the target database when it does not exist` | R7 |
| `reports the target database and the rows of each table` | R8 |
| `leaves a database that has tables untouched unless its name is typed` (respuesta `null`, vacía y otro nombre) | R9, R12 |
| `keeps the previous database under another name when the overwrite is confirmed` | R10 |
| `lists the copies of the folder, newest first, without touching any database` | R11 |
| `leaves every database as it was when the copy name matches no file` | R12 |
| `leaves every database as it was when the file is not a valid copy` | R12 |
| `leaves every database as it was when the target database is in use` (el test mantiene abierta una conexión `pg` al destino) | R12 |
| `rejects a target database name that is not valid` | R12 |

«Sin decir que la copia está hecha» se comprueba así: la función lanza
`BackupError`, y el doble de Drive no ha recibido ningún `create` (R4) o el
texto de `formatCreatedBackup` no se ha llegado a producir (R5).

`src/modules/backup/backup.confirm.test.ts`

| Test | Cubre |
|---|---|
| `refuses to ask when the input is not a terminal` (no escribe nada en `output` y devuelve `null`) | R9 |
| `returns what was typed on a terminal` | R9 |

`src/modules/backup/backup.database.test.ts`

| Test | Cubre |
|---|---|
| `names the same container as docker-compose.yml` | R1 |
| `reads the user and the database of a connection string` | R1 |

`src/architecture.test.ts`

| Test | Cubre |
|---|---|
| `keeps the backup out of the app: no route and no import outside its module` (ningún `*.routes.ts` en `modules/backup/`; ningún archivo de `src/` fuera de esa carpeta contiene `modules/backup` ni `/backup.`; `package.json` solo lo nombra en `db:backup` y `db:restore`) | R13 |
| `keeps the backup off the filesystem` (los archivos de `modules/backup/` que no son test ni fixture, y los dos scripts, no contienen `node:fs`, `'fs'`, `tmpdir`, `writeFile` ni `createWriteStream`; los argumentos de `pg_dump` no llevan `--file` ni `-f`) | R6 |
| `.env.example lists the backup folder variable with a placeholder` | R4 |

`src/config/env.test.ts`

| Test | Cubre |
|---|---|
| `loads the configuration without GOOGLE_DRIVE_BACKUP_FOLDER_ID` | R14 |
| `accepts the backup folder as an id or as a folder URL` | R4 |

`src/modules/backup/backup.docs.test.ts` (Lote B)

| Test | Cubre |
|---|---|
| `documents step by step how to make a copy and how to restore it` (`docs/database-backup.md` existe y contiene `pnpm run db:backup`, `pnpm run db:restore`, `GOOGLE_DRIVE_BACKUP_FOLDER_ID`, `backup-control-gastos`, `_before_restore_` y los cinco apartados de §5) | R15 |

Avisos para el implementer:

- El test `mentions the var folder nowhere in the code` recorre `src/` y
  `scripts/`: no escribas la ruta del socket de PostgreSQL ni ninguna otra que
  contenga el nombre de esa carpeta entre comillas.
- Ningún fixture lleva datos del humano: las filas del origen se inventan
  (`docs/conventions.md` §Tests). Los archivos de copia de los tests se generan
  en la pasada y no se versionan.
- Las conexiones que abra un test a una base destino se cierran antes de
  renombrarla o borrarla.
- Cada `docker exec` cuesta ~0,2 s aquí (medido); el archivo entero añadirá unos
  segundos a la suite. Di la cifra en el informe.

## 5. `docs/database-backup.md`

En español, con estos cinco apartados (los comprueba el test de R15):

1. **Preparar la carpeta** — crear `backup-control-gastos` en «Mi unidad», fuera
   de `notas-banco/`; copiar su dirección al `.env`.
2. **Hacer una copia** — Docker en marcha, `pnpm run db:backup`, qué imprime.
3. **Ver las copias** — `pnpm run db:restore` sin argumentos.
4. **Restaurar en una base nueva** — `pnpm run db:restore <archivo> <base>`,
   qué imprime, y cómo borrar esa base después
   (`docker exec gastos-postgres dropdb -U postgres <base>`).
5. **Restaurar sobre la base de verdad** — parar `pnpm run dev`, el nombre que
   hay que escribir, con qué nombre queda la anterior y cómo borrarla; y el caso
   de un ordenador nuevo (`docker compose up -d` y restaurar **antes** de
   `pnpm run prisma:migrate`: la base recién creada no tiene tablas y no pide
   confirmación).

Y dos notas: qué **no** va en la copia (los archivos de banco de Drive, el
`.env`) y que las copias antiguas se borran a mano en Drive.

## 6. Otros documentos (Lote B)

- `docs/architecture.md`: en el árbol, `modules/backup/` y sus archivos; ADR-034
  nuevo con las decisiones de §2 y las alternativas de §7. Ningún ADR anterior
  cambia de decisión.
- `docs/stack.md`: fila de `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (no obligatoria) y la
  línea de fuente.
- `README.md`: las dos filas en §Scripts disponibles.
- `docs/roadmap.md`: cabo 6 tachado «cerrado por la F55»; F55 en la fila E0; y en
  §Deberes tuyos, la prueba real de `decisions.md` 📌.

## 7. Alternativas descartadas

1. **`pg_dump` desde el host contra `localhost:5434`.** No hay `pg_dump` en el
   `PATH`; instalarlo o fijar una ruta de Windows ata el comando a esta máquina y
   abre el fallo de versiones distintas entre cliente y servidor.
2. **Buscar la carpeta por su nombre en todo Drive.** Sin variable nueva, pero
   dos carpetas con ese nombre (o una en la papelera, o renombrarla) vuelven la
   búsqueda ambigua, y el nombre tendría que entrar en una consulta.
3. **Archivo intermedio en el directorio temporal, borrado al terminar.** Hace
   falta solo si la copia no cabe en memoria; con 9310 kB sobra, y un fallo a
   mitad dejaría el archivo en el disco, contra la frase del humano.
4. **`pg_restore --clean` sobre el destino con tablas.** Borra antes de saber si
   la copia se puede restaurar y deja las tablas que no estén en la copia.
   Restaurar aparte y renombrar no pierde nada.
5. **Confirmar con un argumento (`--yes`, `--confirm=<base>`).** Lo puede pasar
   un agente o un script; lo tecleado en un terminal, no.
6. **Operar sobre PostgreSQL con `pg` o Prisma desde Node.** Serían dos
   mecanismos (uno para `pg_dump`, otro para lo demás) y `pg` es dependencia de
   desarrollo.

## 8. Límites conocidos (van al ADR-034)

- Los dos comandos solo sirven mientras PostgreSQL sea el contenedor
  `gastos-postgres` de `docker-compose.yml`. Si `DATABASE_URL` apuntara a otro
  servidor, operarían igualmente sobre el contenedor local. Se revisa en la E9.
- La copia se sube sin cifrar, igual que los archivos de banco que ya están en
  ese Drive.
- El `.env` no va en la copia.
- Las bases `<base>_before_restore_<sello>` se acumulan hasta que el humano las
  borra.
