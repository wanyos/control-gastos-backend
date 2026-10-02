# Resumen — feature 55 `db-backup`

Fecha de cierre: 2026-10-02
Intención original: `feature_list.json` → feature `db-backup`, bloque `intent`
Spec (si SDD): `specs/55-db-backup/`

## Qué hace ahora la app que antes no

Ahora tu base de datos tiene copia. `pnpm run db:backup` saca una copia completa y la sube,
como un archivo nuevo con la fecha y la hora en el nombre, a tu carpeta `backup-control-gastos`
de Drive. `pnpm run db:restore` lista las copias que hay y, con `<archivo> <base>`, restaura una
en la base que le digas. Antes no había ninguna copia.

Los pasos, uno a uno, están en [`docs/database-backup.md`](../../docs/database-backup.md).

⚠️ **Está probado solo con un Drive simulado y con bases de pruebas.** Con tu Drive y tu base no
lo ha lanzado nadie: es tu prueba, y está en `docs/roadmap.md` §Deberes tuyos pendientes, junto
con el cambio del valor de `GOOGLE_DRIVE_BACKUP_FOLDER_ID` en tu `.env` (tiene que ser la
dirección de la carpeta o su identificador, no su nombre).

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `pnpm run db:backup` — saca la copia y la sube | [db-backup.ts:17](../../scripts/db-backup.ts#L17) |
| `pnpm run db:restore` — lista las copias; con `<archivo> <base>`, restaura | [db-restore.ts:31](../../scripts/db-restore.ts#L31) |
| Sacar y subir una copia | [backup.service.ts:47](../../src/modules/backup/backup.service.ts#L47) (`createBackup`) |
| Listar las copias | [backup.service.ts:55](../../src/modules/backup/backup.service.ts#L55) (`listBackups`) |
| Restaurar una copia | [backup.service.ts:85](../../src/modules/backup/backup.service.ts#L85) (`restoreBackup`) |

## Dónde está el código

### Los dos comandos

| Qué hace | Dónde |
| --- | --- |
| Lee el `.env`, llama a `createBackup` e imprime el resultado o `La copia NO está hecha.` | [db-backup.ts](../../scripts/db-backup.ts) → `main` |
| Sin argumentos lista; con dos restaura; con otro número imprime el uso | [db-restore.ts](../../scripts/db-restore.ts) → `main` |
| Las dos entradas `db:backup` y `db:restore` | [package.json](../../package.json) → `scripts` |

### Hacer la copia, listar y restaurar

| Qué hace | Dónde |
| --- | --- |
| Carpeta → copia → subida, en ese orden | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `createBackup` |
| Nombre del archivo con la fecha y la hora locales | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `backupFileName`, `timestampOf` |
| Busca la copia por su nombre exacto (0 o más de 1 → error) | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `findBackupFile` |
| Restaura en una base que no existe o sin tablas | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `restoreBackup` |
| Sobre una base con tablas: pide el nombre, restaura aparte y renombra | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `replaceDatabase` |
| Borra la base que creó el propio comando si la restauración falla | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `afterDropping` |
| Los textos que imprimen los comandos | [backup.service.ts](../../src/modules/backup/backup.service.ts) → `formatCreatedBackup`, `formatBackupList`, `formatRestoredDatabase`, `formatBytes` |
| Tipos del módulo | [backup.types.ts](../../src/modules/backup/backup.types.ts) → `BackupDeps`, `ContainerCommand`, `RestoredDatabase` |

### Lo que se ejecuta en el contenedor de PostgreSQL

| Qué hace | Dónde |
| --- | --- |
| Lanza `docker exec gastos-postgres <programa>` | [backup.database.ts](../../src/modules/backup/backup.database.ts) → `runInContainer`, `postgresContainerName` |
| Saca la copia con `pg_dump` y la restaura con `pg_restore`, por memoria | [backup.database.ts](../../src/modules/backup/backup.database.ts) → `dumpDatabase`, `restoreDump` |
| Existe, tiene tablas, crear, borrar, renombrar, contar filas | [backup.database.ts](../../src/modules/backup/backup.database.ts) → `databaseExists`, `hasTables`, `createDatabase`, `dropDatabase`, `renameDatabase`, `countRows` |
| Valida los nombres de base antes de usarlos en SQL | [backup.database.ts](../../src/modules/backup/backup.database.ts) → `assertDatabaseName`, `assertSqlSafeName` |
| Usuario y base de `DATABASE_URL` | [backup.database.ts](../../src/modules/backup/backup.database.ts) → `databaseTarget` |
| Convierte un fallo del programa en un mensaje propio | [backup.database.ts](../../src/modules/backup/backup.database.ts) → `symptomOf` |

### Lo que se le pide a Drive

| Qué hace | Dónde |
| --- | --- |
| Localiza la carpeta por su identificador y dice por qué no vale | [backup.drive.ts](../../src/modules/backup/backup.drive.ts) → `resolveBackupFolder` |
| Sube el archivo, entregándolo a la librería de Drive como flujo de lectura, y compara el tamaño guardado con el enviado | [backup.drive.ts](../../src/modules/backup/backup.drive.ts) → `uploadBackup` |
| Lista los archivos de la carpeta, del más reciente al más antiguo | [backup.drive.ts](../../src/modules/backup/backup.drive.ts) → `listBackupFiles` |

### La confirmación

| Qué hace | Dónde |
| --- | --- |
| Pregunta el nombre de la base solo si la entrada es un terminal | [backup.confirm.ts](../../src/modules/backup/backup.confirm.ts) → `askDatabaseName` |

### Configuración y errores

| Qué hace | Dónde |
| --- | --- |
| `GOOGLE_DRIVE_BACKUP_FOLDER_ID`, opcional; identificador o dirección | [env.ts](../../src/config/env.ts) → `loadConfig`, `AppConfig.driveBackupFolderId` |
| El error de los dos comandos (`BACKUP_FAILED`) | [app-error.ts](../../src/errors/app-error.ts) → `BackupError` |
| La línea de la variable, con su explicación | [.env.example](../../.env.example) → `GOOGLE_DRIVE_BACKUP_FOLDER_ID` |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Los pasos para ti | [database-backup.md](../../docs/database-backup.md) |
| Las decisiones y sus porqués | [architecture.md](../../docs/architecture.md) → `ADR-034` y el árbol de `modules/backup/` |
| La variable y la dependencia de Docker | [stack.md](../../docs/stack.md) → §Variables de entorno, §Base de datos, §Testing |
| Las dos filas de comandos | [README.md](../../README.md) → §Scripts disponibles |
| Cabo 6 cerrado y tus deberes | [roadmap.md](../../docs/roadmap.md) → §Deberes tuyos pendientes |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Copia, listado y restauración contra el PostgreSQL del contenedor y un Drive simulado (20 tests) | [backup.service.test.ts](../../src/modules/backup/backup.service.test.ts) → `backup commands` |
| El Drive simulado en memoria, que apunta cada llamada recibida | [backup.fixture.ts](../../src/modules/backup/backup.fixture.ts) → `backupDriveFixture` |
| La pregunta: sin terminal no pregunta; devuelve lo tecleado tal cual | [backup.confirm.test.ts](../../src/modules/backup/backup.confirm.test.ts) → `askDatabaseName` |
| Nombres de base, contenedor y mensajes de fallo | [backup.database.test.ts](../../src/modules/backup/backup.database.test.ts) → `backup database commands` |
| La subida con el cliente de Drive de verdad, credenciales inventadas y sin red | [backup.drive.test.ts](../../src/modules/backup/backup.drive.test.ts) → `uploadBackup` |
| Los dos scripts con un `.env` mal escrito | [backup.scripts.test.ts](../../src/modules/backup/backup.scripts.test.ts) → `backup scripts with a badly written .env` |
| El documento tiene los cinco apartados y lo que hay que teclear | [backup.docs.test.ts](../../src/modules/backup/backup.docs.test.ts) → `documents step by step how to make a copy and how to restore it` |
| Sin ruta, sin que la app lo importe, sin escribir en disco, y la línea de `.env.example` | [architecture.test.ts](../../src/architecture.test.ts) → `keeps the backup out of the app…`, `keeps the backup off the filesystem`, `.env.example lists the backup folder variable with a placeholder` |
| La variable: opcional, identificador o dirección, vacía o con espacios | [env.test.ts](../../src/config/env.test.ts) → `loads the configuration without GOOGLE_DRIVE_BACKUP_FOLDER_ID` y los tres siguientes |

## Cumplimiento de la intención

Resultados de `./init.sh --checks 55` lanzado por el reviewer el 2026-10-02: 12 de 12 en verde.

- ✅ "Cuando lanzo `pnpm run db:backup`, aparece … un archivo nuevo con la fecha y la hora en el
  nombre, y el comando me dice su nombre y su tamaño." → se cumple **con el Drive simulado**; lo
  verifican `uploads a new dump file named with the local date and time into the configured folder`
  y `reports the name and the size of the uploaded copy and the name of the folder`.
  Checks 1 y 2: ✅. Con tu Drive: sin comprobar, es tu prueba.
- ✅ "Lanzar el comando otra vez crea otro archivo y no borra ni sustituye los anteriores." → se
  cumple; `adds a second file on a second backup and leaves the first one as it was` y
  `calls nothing of Drive that deletes, moves or renames a file`. Checks 3 y 4: ✅. Además, el
  código de la copia solo llama a `files.get`, `files.create` y `files.list` (buscado con `grep`).
- ✅ "Si la carpeta de Drive no existe o no se puede subir, el comando falla con un mensaje claro
  y no dice que la copia está hecha." → se cumple; `fails without claiming a copy when the folder
  variable is missing`, `… when the folder does not exist`, `… when the upload fails`.
  Checks 5 y 6: ✅.
- ✅ "Puedo restaurar una copia en una base de datos vacía y quedan las mismas tablas con el mismo
  número de filas." → se cumple; `restores a copy into an empty database with the same tables and
  the same row counts`. Check 7: ✅. Repetido a mano por el reviewer con bases propias: 10 tablas
  y los mismos recuentos en origen y destino.
- ✅ "El comando de restaurar no pisa mi base de datos de verdad sin que yo lo confirme de forma
  explícita." → se cumple; `leaves a database that has tables untouched unless its name is typed`
  y `refuses to ask when the input is not a terminal`. Checks 8 y 9: ✅. Repetido a mano por el
  reviewer sin terminal contra una base propia con tablas: se negó y la base quedó igual.
  Sin comprobar: la pregunta en un terminal de verdad (paso 4 de tu prueba).
- ✅ "Hay un documento que explica paso a paso cómo hacer la copia y cómo restaurarla." → se
  cumple; `documents step by step how to make a copy and how to restore it`. Check 11: ✅.
- ✅ (añadido) Al confirmar, la base que había queda con otro nombre → `keeps the previous
  database under another name when the overwrite is confirmed`. Check 10: ✅.
- ✅ (añadido, de tus «no quiero») Sin ruta en la API, sin hacerse sola y sin archivo en el disco
  → `keeps the backup out of the app: no route and no import outside its module` y
  `keeps the backup off the filesystem`. Check 12: ✅.

## Decisiones que se tomaron por ti

Los seis puntos que aprobaste en `specs/55-db-backup/decisions.md`:

- (delegado) La carpeta se encuentra por su identificador o su dirección, en
  `GOOGLE_DRIVE_BACKUP_FOLDER_ID`. Con el nombre, el servidor arranca y los dos comandos fallan
  diciendo qué hay que poner.
- (delegado) Para restaurar sobre una base con tablas hay que escribir su nombre en un terminal;
  no hay argumento ni variable que lo sustituya, y sin terminal el comando se niega.
- (añadido) Lo que había queda como `<base>_before_restore_<AAAAMMDDHHMMSS>`; la copia se
  restaura primero aparte.
- (delegado) Las copias antiguas no se borran nunca desde el código.
- (delegado) La copia se elige por el nombre exacto del archivo y la base de destino es
  obligatoria; sin argumentos, lista.
- (delegado) La copia sube sin cifrar.

Y además:

- (añadido) El comando de restaurar imprime las filas de cada tabla al acabar.
- (añadido) Tras subir, se compara el tamaño que Drive dice haber guardado con el enviado.
- (añadido) La variable es opcional: sin ella el servidor y la suite funcionan igual. Una línea
  sin valor o con espacios sí impide arrancar.
- (decidido al implementar) El nombre de base que escribes tú admite 30 caracteres; los nombres
  que deriva el comando, hasta los 63 de PostgreSQL. El spec pedía 30 para todos y eso hacía
  fallar siempre la restauración sobre una base con tablas.
- (decidido al implementar) `db:restore` no tiene una primera línea fija para sus fallos, como sí
  tiene `db:backup` (`La copia NO está hecha.`): imprime solo el motivo.

## Qué NO se tocó / quedó fuera

- La API, la importación, el arranque del servidor y el modelo de datos: sin cambios. No hay
  migración ni dependencia nueva.
- No hay copia automática ni borrado de copias antiguas.
- El `.env` no va en la copia.
- Los dos comandos solo sirven mientras la base sea el contenedor `gastos-postgres` y necesitan
  Docker en marcha.
- Nada se ha lanzado contra tu Drive ni contra tu base `gastos`.

## Notas para el futuro (opcional)

- **Fallo que encontró tu prueba real (2026-10-02) y su arreglo.** La primera subida a tu Drive
  falló con «Cannot reach Google Drive»: el código entregaba la copia a la librería de Drive
  como `Buffer` y la librería solo sabe enviar un texto o un flujo de lectura. El Drive
  simulado de los tests lo aceptaba, por eso la suite estaba en verde. Ahora `uploadBackup`
  entrega un flujo, el Drive simulado rechaza un `Buffer` igual que la librería, y hay un test
  con el cliente de verdad. El reviewer lo comprobó con la librería de verdad contra un servidor
  local de su propia máquina: 300 000 bytes enviados y recibidos idénticos, y la lista y la
  descarga también. **Contra tu Drive sigue sin comprobar: hay que repetir tu prueba.**
- `uploadFile` de `src/lib/drive-structure.ts` tiene el mismo fallo con un `Buffer`. Hoy no lo
  llama nada de la aplicación.

- **Sin comprobar hasta tu prueba:** que tu acceso a Drive escriba fuera de `notas-banco/`, que
  Drive devuelva el tamaño al crear el archivo, qué responde Drive a un nombre puesto como
  identificador, y que la pregunta funcione en un terminal de verdad.
- `db:restore` acepta como destino `postgres` y `template1` (no tienen tablas, así que restaura
  dentro sin preguntar). El leader te lo propone aparte.
- El mensaje con Docker instalado pero parado no se ha comprobado; el documento dice que, ante
  un fallo del contenedor, lo primero es mirar que Docker está en marcha.
- La suite tarda entre 2,3 y 3 s más por pasada y necesita el programa `docker`.
- `src/architecture.test.ts` no lista `backup.docs.test.ts` ni `backup.scripts.test.ts` en su
  árbol esperado.

## Para qué sirve luego

Si se pierde la base o el disco, lo que has puesto a mano (categorías, reglas, alias,
movimientos confirmados, traspasos marcados, notas) se recupera de la última copia de Drive.
En un ordenador nuevo: `docker compose up -d` y restaurar **antes** de `pnpm run prisma:migrate`.

## Prueba real (2026-10-02, hecha por el humano)

- `pnpm run db:backup` contra su Drive: la primera vez falló al subir (el contenido se
  entregaba a la librería de Google como bloque de bytes y no como flujo de lectura);
  arreglado ese día y aprobado por el reviewer en su tercera pasada. La segunda vez
  subió la copia y el tamaño guardado coincidió con el enviado.
- `pnpm run db:restore` sin argumentos listó la copia.
- Restaurada en `gastos_restore_check`: 10 tablas y las mismas filas que la base real
  en las diez (comparado por el leader con consultas de solo lectura, más una huella
  de los movimientos, idéntica en las dos bases).
- Lanzada otra vez sobre esa base, ya con tablas: el comando preguntó el nombre en el
  terminal, restauró y dejó la anterior renombrada.
- Sin probar: restaurar sobre la base `gastos` y el mensaje con Docker parado.

## Añadido el 2026-10-02: las bases internas de PostgreSQL no valen como destino

- `pnpm run db:restore <archivo> <base>` rechaza `postgres`, `template0` y `template1` con un mensaje en español y código de salida 1, antes de llamar a Drive y de ejecutar nada en el contenedor. Sustituye a la línea de arriba que decía que las aceptaba. Con mayúsculas (`Postgres`) lo rechaza la regla de nombres de siempre.
- Dónde vive: [backup.database.ts](../../src/modules/backup/backup.database.ts) → `assertNotInternalDatabase`, llamada en la primera línea de `restoreBackup` de [backup.service.ts](../../src/modules/backup/backup.service.ts). Test: `rejects the internal databases of PostgreSQL as target before doing anything`.
