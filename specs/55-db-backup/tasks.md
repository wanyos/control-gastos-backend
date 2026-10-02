# Tasks — F55 `db-backup`

> Dos lotes **en secuencia**: los documentos describen los comandos ya hechos y
> su test lee el documento.
>
> ❌ **Ningún agente ejecuta `pnpm run db:backup` ni `pnpm run db:restore`
> contra el Drive ni contra la base del humano.** Los dos comandos de verdad los
> prueba él (`decisions.md` 📌). Los tests usan el doble de Drive y bases
> `gastos_test_*`.

## Lote A — código, tests y configuración
Archivos: `src/modules/backup/backup.types.ts`, `src/modules/backup/backup.database.ts`, `src/modules/backup/backup.database.test.ts`, `src/modules/backup/backup.drive.ts`, `src/modules/backup/backup.service.ts`, `src/modules/backup/backup.service.test.ts`, `src/modules/backup/backup.confirm.ts`, `src/modules/backup/backup.confirm.test.ts`, `src/modules/backup/backup.fixture.ts`, `src/config/env.ts`, `src/config/env.test.ts`, `src/errors/app-error.ts`, `src/architecture.test.ts`, `scripts/db-backup.ts`, `scripts/db-restore.ts`, `package.json`, `.env.example`
Depende de: —

- [x] T1 — `src/config/env.ts`: `driveBackupFolderId` opcional (`design.md` §3.2), y en `src/config/env.test.ts` los tests `loads the configuration without GOOGLE_DRIVE_BACKUP_FOLDER_ID` y `accepts the backup folder as an id or as a folder URL`. Cubre: R4, R14.
- [x] T2 — `BackupError` en `src/errors/app-error.ts` y `src/modules/backup/backup.types.ts`. Cubre: R4, R5, R12.
- [x] T3 — `src/modules/backup/backup.database.ts` (`design.md` §3.1) y `backup.database.test.ts` con `names the same container as docker-compose.yml` y `reads the user and the database of a connection string`. Cubre: R1, R7, R10, R12.
- [x] T4 — `src/modules/backup/backup.drive.ts` y `backup.fixture.ts` (doble de Drive que apunta toda llamada recibida). Cubre: R1, R3, R4, R5, R11.
- [x] T5 — `createBackup`, `backupFileName` y los formateadores de la copia en `backup.service.ts`, con sus tests de `design.md` §4: `uploads a new dump file named with the local date and time into the configured folder`, `reports the name and the size of the uploaded copy and the name of the folder`, `adds a second file on a second backup and leaves the first one as it was`, los tres `fails without claiming a copy when the folder …`, `fails without claiming a copy when the dump fails`, `fails without claiming a copy when the upload fails`, `fails when Drive stored a different size than the one sent`. Cubre: R1, R2, R3, R4, R5.
- [x] T6 — `listBackups` y `restoreBackup` en `backup.service.ts`, con sus tests: `restores a copy into an empty database with the same tables and the same row counts`, `creates the target database when it does not exist`, `reports the target database and the rows of each table`, `leaves a database that has tables untouched unless its name is typed`, `keeps the previous database under another name when the overwrite is confirmed`, `lists the copies of the folder, newest first, without touching any database`, los tres `leaves every database as it was when …`, `rejects a target database name that is not valid`, y `calls nothing of Drive that deletes, moves or renames a file`. Cubre: R3, R7, R8, R9, R10, R11, R12.
- [x] T7 — `src/modules/backup/backup.confirm.ts` y `backup.confirm.test.ts` con `refuses to ask when the input is not a terminal` y `returns what was typed on a terminal`. Cubre: R9.
- [x] T8 — `scripts/db-backup.ts`, `scripts/db-restore.ts` y las entradas `db:backup` y `db:restore` de `package.json`. Cubre: R1, R2, R7, R8, R11.
- [x] T9 — `.env.example`: bloque de `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (`design.md` §3.2). Cubre: R4.
- [x] T10 — `src/architecture.test.ts`: los archivos del módulo en la lista del árbol (sin `backup.docs.test.ts`, que es del Lote B) y los tests `keeps the backup out of the app: no route and no import outside its module`, `keeps the backup off the filesystem` y `.env.example lists the backup folder variable with a placeholder`. Cubre: R4, R6, R13.
- [x] T11 — `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` y `pnpm test` en verde. En el informe: cuántos archivos de test y cuántos tests quedan (partida: 70 y 1302), cuánto tarda de más la suite, y que no queda ninguna base `gastos_test_backup_*` en el contenedor (`docker exec gastos-postgres psql -U postgres -Atc "select datname from pg_database where datname like 'gastos_test_backup%'"` sin filas), con la salida pegada.

## Lote B — documentos y su test
Archivos: `docs/database-backup.md`, `docs/architecture.md`, `docs/stack.md`, `docs/roadmap.md`, `README.md`, `src/modules/backup/backup.docs.test.ts`
Depende de: Lote A

- [x] T12 — `docs/database-backup.md` con los cinco apartados y las dos notas de `design.md` §5. Cubre: R15.
- [x] T13 — `src/modules/backup/backup.docs.test.ts` con `documents step by step how to make a copy and how to restore it`. Cubre: R15.
- [x] T14 — `docs/architecture.md`: `modules/backup/` en el árbol y ADR-034 nuevo (`design.md` §2, §7 y §8). Ningún ADR anterior se reescribe.
- [x] T15 — `docs/stack.md` (fila de la variable, no obligatoria) y `README.md` (las dos filas en §Scripts disponibles).
- [x] T16 — `docs/roadmap.md`: cabo 6 tachado «cerrado por la F55», F55 en la fila E0 y la prueba real del humano en §Deberes tuyos (los pasos de `decisions.md` 📌).
- [x] T17 — `./init.sh` en verde y `./init.sh --checks 55`, con la salida pegada en el informe.
