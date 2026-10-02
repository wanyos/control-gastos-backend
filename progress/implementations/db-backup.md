# db-backup — implementación

## Lote A — implementación

Implementer, 2026-10-02. Tasks T1 a T11 de `specs/55-db-backup/tasks.md`, marcadas `[x]`.
Sin commit. La feature sigue `in_progress`.

**Dos cosas que hay que saber antes de leer el resto:**

1. **No he lanzado `pnpm run db:backup` ni `pnpm run db:restore` contra el Drive ni contra la
   base `gastos`.** Los dos scripts solo los he ejecutado desde una carpeta vacía (sin `.env`),
   con variables falsas y en casos que terminan antes de llamar a Drive o al contenedor
   (ver §Prueba real).
2. **Ejecuté un `git stash` que no debía.** Para medir la suite «sin mi cambio» lancé
   `git stash` y después `git stash pop`. `git stash` guardó también los cambios sin commitear
   que no eran míos (`.env.example`, `docs/roadmap.md`, `feature_list.json`,
   `progress/current.md`). El `pop` los devolvió: `git stash list` está vacío y `git diff --stat`
   muestra esos cuatro archivos modificados como antes. Además la medida no valió (los archivos
   nuevos, sin seguimiento de git, se quedaron y esa pasada salió roja); la medida buena se hizo
   de otra forma (§Cuánto tarda la suite). No se perdió nada, pero lo digo porque toqué archivos
   de fuera de mi lote.

### Archivos modificados / creados

Creados:

- `src/modules/backup/backup.types.ts`
- `src/modules/backup/backup.database.ts` y `backup.database.test.ts`
- `src/modules/backup/backup.drive.ts`
- `src/modules/backup/backup.service.ts` y `backup.service.test.ts`
- `src/modules/backup/backup.confirm.ts` y `backup.confirm.test.ts`
- `src/modules/backup/backup.fixture.ts` (cliente de Drive simulado en memoria)
- `scripts/db-backup.ts`, `scripts/db-restore.ts`

Modificados:

- `src/config/env.ts`, `src/config/env.test.ts`
- `src/errors/app-error.ts` (`BackupError`, código `BACKUP_FAILED`, 500)
- `src/architecture.test.ts`
- `package.json` (entradas `db:backup` y `db:restore`)
- `.env.example`
- `specs/55-db-backup/tasks.md` (marcas `[x]`), `progress/current.md` (línea de avance)

No he tocado `docs/` ni `README.md` (Lote B). Ninguna dependencia nueva.

### Qué hace el código con el valor que hay hoy en el `.env` (el nombre de la carpeta)

Probado con un nombre inventado de la misma forma (`copias-de-prueba`: sin espacios ni `/`),
nunca con el `.env`:

1. **`loadConfig` lo acepta.** La validación del design solo rechaza un valor vacío, con
   espacios o con `/`; un nombre con guiones no se distingue de un identificador. Test:
   `cannot tell a folder name without spaces from a folder id: that one is left to Drive`
   (`src/config/env.test.ts`). El servidor arranca y la suite pasa con ese valor.
2. **`db:backup` y `db:restore` le preguntan a Drive por un archivo con ese identificador**
   (`files.get`). Con el cliente simulado, que responde 404 a un identificador que no es el de
   la carpeta, el comando falla **sin obtener la copia y sin subir nada**, con este mensaje
   (test `fails without claiming a copy when the folder does not exist`, que incluye este caso):

   > No se puede localizar la carpeta de copias: lo que hay en GOOGLE_DRIVE_BACKUP_FOLDER_ID no
   > existe en Drive o esta cuenta no lo ve. GOOGLE_DRIVE_BACKUP_FOLDER_ID tiene que llevar el
   > identificador de la carpeta o su dirección completa
   > (https://drive.google.com/drive/folders/<identificador>), no su nombre.

   `db:backup` antepone la línea «La copia NO está hecha.» y sale con código 1.
3. **No he comprobado qué responde el Drive de verdad a un identificador así** (haría falta una
   llamada real, que no me toca). Si no fuera un 404, el código cae en la otra rama: «No se puede
   localizar la carpeta de copias: <mensaje constante de `driveErrorMessage`>.» seguido de la
   misma frase sobre el identificador o la dirección. En los dos casos el comando sale con 1 y no
   sube nada.

**Lo que tiene que hacer el humano:** sustituir en su `.env` el nombre por la dirección de la
carpeta copiada del navegador (o su identificador).

### Decisiones tomadas

1. **Desviación del design, forzada por un fallo suyo.** El design pide que
   `assertDatabaseName` (`^[a-z][a-z0-9_]{0,29}$`) se llame «antes de cualquier uso», pero los
   nombres que deriva el propio comando (`<base>_restore_<AAAAMMDDHHMMSS>`, `<base>_before_restore_<AAAAMMDDHHMMSS>`)
   pasan de 30 caracteres: con la regla aplicada a todo, restaurar sobre una base con tablas
   fallaba siempre (lo vi en rojo en tres tests). Queda así: `assertDatabaseName` (30) valida el
   nombre que escribe el humano, en `restoreBackup`; y toda función que interpola un nombre en SQL
   pasa por una comprobación interna con el tope de PostgreSQL (`^[a-z][a-z0-9_]{0,62}$`). Sigue
   sin llegar a SQL ningún nombre sin validar.
2. **El placeholder de `.env.example` no es el que escribió el humano.** Su línea
   (`…=your-name-backup-data-base`) invitaba a poner el nombre. Queda **una** línea,
   `GOOGLE_DRIVE_BACKUP_FOLDER_ID=your-backup-folder-id`, con un comentario que dice que es
   opcional, que la carpeta va fuera de `notas-banco/` y que el nombre no sirve.
3. **Variable definida pero vacía = error de configuración** (lo dice el design: «vacía → problema»).
   Efecto: una línea `GOOGLE_DRIVE_BACKUP_FOLDER_ID=` sin valor impide arrancar el servidor; el
   mensaje dice que se quite la línea si no se usan los comandos. Sin la línea, arranca igual.
4. **Síntomas reconocidos de más.** Además de los cuatro del design, se reconocen: `docker` no se
   puede ejecutar, el contenedor está parado y «ya existe una base con ese nombre». `does not
   exist` solo se reconoce referido a una base o a un usuario (no a una tabla durante una
   restauración). El texto del programa no se imprime nunca.
5. **`listBackupFiles` ordena también en código** por fecha de subida descendente, además de
   pedírselo a Drive con `orderBy`.
6. **Si falla el borrado de una base que creó el propio comando**, o no se puede deshacer el
   primer renombrado, el mensaje lo dice con los nombres de las bases; no se borra nada más. No
   tiene test (no hay forma barata de provocarlo contra el PostgreSQL de verdad).
7. **`db:restore` con un solo argumento (o más de dos)** imprime el uso y sale con 1 antes de leer
   la configuración.
8. **Los diez tests de `restoreBackup` se ejecutan a la vez** (`describe.concurrent`), cada uno
   sobre nombres de base propios. Motivo: PostgreSQL espera unos 5 s antes de negarse a renombrar
   una base en uso (medido: 5,19 s con `alter database … rename` sobre una base de pruebas con una
   sesión abierta), y en serie el archivo tardaba 13 s.
9. **`BackupError` no tiene test en `src/errors/app-error.test.ts`**: ese archivo no está en la
   cabecera `Archivos:` del lote. Su código (`BACKUP_FAILED`) se comprueba en
   `backup.service.test.ts`.

### Trazabilidad

- R1 → `uploads a new dump file named with the local date and time into the configured folder`;
  `names the same container as docker-compose.yml`; `reads the user and the database of a connection string`
- R2 → `reports the name and the size of the uploaded copy and the name of the folder`
- R3 → `adds a second file on a second backup and leaves the first one as it was`;
  `calls nothing of Drive that deletes, moves or renames a file`
- R4 → `fails without claiming a copy when the folder variable is missing`;
  `… when the folder does not exist`; `… when the id is not a folder or is in the bin`;
  `accepts the backup folder as an id or as a folder URL`;
  `.env.example lists the backup folder variable with a placeholder`
- R5 → `fails without claiming a copy when the dump fails`; `… when the upload fails`;
  `fails when Drive stored a different size than the one sent`
- R6 → `keeps the backup off the filesystem`
- R7 → `restores a copy into an empty database with the same tables and the same row counts`;
  `creates the target database when it does not exist`
- R8 → `reports the target database and the rows of each table`
- R9 → `leaves a database that has tables untouched unless its name is typed`;
  `refuses to ask when the input is not a terminal`; `returns what was typed on a terminal`
- R10 → `keeps the previous database under another name when the overwrite is confirmed`
- R11 → `lists the copies of the folder, newest first, without touching any database`
- R12 → `leaves every database as it was when the copy name matches no file`;
  `… when the file is not a valid copy`; `… when the target database is in use`;
  `rejects a target database name that is not valid`
- R13 → `keeps the backup out of the app: no route and no import outside its module`
- R14 → `loads the configuration without GOOGLE_DRIVE_BACKUP_FOLDER_ID`
- R15 → Lote B.

Los tests de `backup.service.test.ts` usan el PostgreSQL del contenedor a través del mismo
`docker exec` que usan los comandos: el origen es la base desechable del worker con tres
categorías inventadas, y los destinos son bases `gastos_test_backup_<worker>_<sufijo>` que el
archivo crea y borra. Ningún fixture es `.xls` ni `.pdf`.

### Documentos actualizados

`git grep -n "GOOGLE_DRIVE_BACKUP_FOLDER_ID\|db:backup\|db:restore\|BackupError\|BACKUP_FAILED\|driveBackupFolderId\|your-name-backup"`
fuera de `progress/`, `specs/` y `feature_list.json`: solo aparecen archivos de este lote. No hay
ninguna línea de documento que mi cambio haya vuelto falsa. Lo que **falta** por escribir es del
Lote B y no lo he tocado: las dos filas de `README.md` §Scripts disponibles, la fila de la
variable en `docs/stack.md`, y `modules/backup/` en el árbol de `docs/architecture.md`.
`docs/api-contract.md` no cambia: `BACKUP_FAILED` no llega nunca a una respuesta HTTP.

### Prueba real

No se ha hecho, y no me toca: la prueba con el Drive y la base de verdad es del humano
(`decisions.md` 📌). Lo que **no** está comprobado y solo se verá ahí:

- Que Drive devuelva `size` al crear el archivo. Si no lo devuelve, `db:backup` fallará con el
  mensaje del tamaño («Drive dice haber guardado un tamaño desconocido») aunque el archivo se
  haya subido.
- Que el acceso a Drive del `.env` pueda escribir en una carpeta fuera de `notas-banco/`.
- Que bajo `pnpm run` la entrada del comando sea un terminal (si no lo fuera, restaurar sobre una
  base con tablas se negaría siempre).
- Qué responde Drive a un identificador que en realidad es un nombre (ver arriba).

Lo que sí ejecuté de los dos scripts, desde una carpeta vacía y sin `.env`, con
`node node_modules/tsx/dist/cli.mjs scripts/<script>`:

| Caso | Sale con | Qué imprime |
|---|---|---|
| `db-restore.ts solo-uno` | 1 | «Hacen falta dos argumentos…» y el uso |
| `db-backup.ts` sin ninguna variable | 1 | la lista de variables obligatorias que faltan |
| `db-backup.ts` con variables falsas y sin la de la carpeta | 1 | «La copia NO está hecha.» + falta la variable |
| `db-restore.ts` (listar) con variables falsas y sin la de la carpeta | 1 | falta la variable |
| `db-backup.ts` con la variable con espacios | 1 | el problema de configuración que la nombra |
| `db-restore.ts archivo.dump Base-Mala` | 1 | «El nombre de la base de datos no es válido…» |

Los dos scripts tipan: `tsc -p` con un `tsconfig` temporal fuera del repositorio que los incluye,
código de salida 0 (`pnpm run typecheck` no los cubre: solo incluye `src/`).

### Cuánto tarda la suite

- Antes: 70 archivos, 1302 tests. Ahora: **73 archivos, 1339 tests**.
- `pnpm test` con el cambio, tres pasadas seguidas: 15,1 s · 14,6 s · 14,8 s.
- La misma suite sin los tres archivos de `src/modules/backup/`
  (`vitest run --exclude "src/modules/backup/**"`), tres pasadas: 12,6 s · 12,6 s · 12,5 s.
  (La única medida anterior a tocar nada, en caliente: 11,8 s.)
- **De más: unos 2,3 s.** `backup.service.test.ts` solo tarda 8,3 s, de los que algo más de 5 son
  la espera de PostgreSQL en el test de la base en uso.

### Último ./init.sh

Código de salida 0.

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  73 passed (73)
      Tests  1339 passed (1339)
   Duration  14.80s
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Bases que quedan en el contenedor después, con
`docker exec gastos-postgres psql -U postgres -Atc "select datname from pg_database where datname like 'gastos_test_backup%'"`:
ninguna fila (código de salida 0). La lista completa de bases es la misma que antes de empezar:
`gastos`, `gastos_test_1` a `gastos_test_8`, `gastos_test_template`, `postgres`, `template0`,
`template1`. La comprobación de `vitest.global-setup.ts` sobre la base `gastos` no saltó en
ninguna pasada.

### Último ./init.sh --checks 55

Código de salida 1: **11 de 12 en verde**. Los `checks` no se han modificado.

| # | Check | Resultado |
|---|---|---|
| 1 | `uploads a new dump file named with the local date and time into the configured folder` | exit 0 — `Tests 1 passed \| 19 skipped (20)` |
| 2 | `reports the name and the size of the uploaded copy and the name of the folder` | exit 0 — `1 passed` |
| 3 | `adds a second file on a second backup and leaves the first one as it was` | exit 0 — `1 passed` |
| 4 | `calls nothing of Drive that deletes, moves or renames a file` | exit 0 — `1 passed` |
| 5 | `fails without claiming a copy when the folder` | exit 0 — `2 passed \| 18 skipped (20)` |
| 6 | `fails without claiming a copy when the upload fails` | exit 0 — `1 passed` |
| 7 | `restores a copy into an empty database with the same tables and the same row counts` | exit 0 — `1 passed` |
| 8 | `leaves a database that has tables untouched unless its name is typed` | exit 0 — `1 passed` |
| 9 | `refuses to ask when the input is not a terminal` | exit 0 — `1 passed \| 3 skipped (4)` |
| 10 | `keeps the previous database under another name when the overwrite is confirmed` | exit 0 — `1 passed` |
| 11 | `backup.docs.test.ts` — `documents step by step how to make a copy and how to restore it` | **exit 1** — `No test files found`: el archivo y `docs/database-backup.md` son del Lote B |
| 12 | `src/architecture.test.ts -t "keeps the backup o"` | exit 0 — `2 passed \| 38 skipped (40)` |

### Sugerencias fuera de scope (NO aplicadas)

- `db:restore` acepta como destino cualquier nombre válido, también `postgres` (la base de
  mantenimiento del contenedor, que no tiene tablas): restauraría dentro de ella sin preguntar.
  El spec no lo prohíbe. Se podría rechazar ese nombre; cuesta una línea y un test.
- El Lote B tiene que añadir `modules/backup/backup.docs.test.ts` a la lista del árbol de
  `src/architecture.test.ts`, que no está en su cabecera `Archivos:`.

## Lote B — implementación

Implementer, 2026-10-02. Tasks T12 a T17 de `specs/55-db-backup/tasks.md`, marcadas `[x]`.
Sin commit. La feature sigue `in_progress`. No he tocado ningún archivo del Lote A, no he usado
`git stash`, no he leído ni impreso `.env`, y no he lanzado `db:backup` ni `db:restore`.

### Archivos modificados / creados

Creados:

- `docs/database-backup.md`
- `src/modules/backup/backup.docs.test.ts`

Modificados:

- `docs/architecture.md`: `modules/backup/` en el árbol y ADR-034 nuevo, al final de los ADR.
  Ningún ADR anterior cambia.
- `docs/stack.md`: fila de `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (no obligatoria), la línea de fuente,
  un punto en §Base de datos (los dos comandos necesitan Docker) y otro en §Testing (la suite
  ejecuta `docker`).
- `README.md`: las dos filas de §Scripts disponibles; además, la línea de PostgreSQL de
  §Requisitos, la fila de `pnpm test` y una línea en el árbol de §Estructura del proyecto.
- `docs/roadmap.md`: cabo 6 tachado, F55 en la fila E0 y en la lista de E0, y tres entradas en
  §Deberes tuyos pendientes. Los cambios sin commitear del leader sobre el cabo 10 siguen ahí
  (comprobado con `grep -c` de sus dos frases: 2).
- `specs/55-db-backup/tasks.md` (marcas), `progress/current.md` (una línea de avance).

### Decisiones tomadas

1. **Los cinco apartados del documento llevan estos títulos exactos**, que son los que busca el
   test: `## 1. Preparar la carpeta`, `## 2. Hacer una copia`, `## 3. Ver las copias que hay`,
   `## 4. Restaurar en una base nueva`, `## 5. Restaurar sobre la base de verdad`.
2. **El test comprueba más que la presencia de los títulos:** que están una vez y en ese orden,
   y que cada apartado lleva lo que el humano tiene que teclear en ese paso (la variable con `=`,
   `notas-banco/` y la forma de la dirección en el 1; cada comando en su apartado; el `dropdb`
   de la base de comprobación en el 4; `_before_restore_` y `pnpm run dev` en el 5). Comprobado
   que se pone rojo: cambié a propósito el título del apartado 3, lancé el test (`Tests 1
   failed`) y devolví el título.
3. **Los mensajes y salidas del documento están copiados del código del Lote A** (leído:
   `backup.service.ts`, `backup.drive.ts`, `backup.database.ts`, `backup.confirm.ts` y los dos
   scripts), con nombres de archivo, tamaños, identificador de carpeta y recuentos inventados.
   Los nombres de tabla del ejemplo son los modelos de `prisma/schema.prisma`.
4. **Añadido que el design no pedía: un comando para ver las filas de cada tabla de `gastos`**
   (apartado 4), porque la prueba real del humano pide comparar y sin él no tiene con qué. Es
   una sola línea de `docker exec … psql` que solo lee. Lo ejecuté contra `gastos_test_template`
   (no contra `gastos`) desde Git Bash y desde Windows PowerShell 5.1: código 0 en los dos, y
   una línea por tabla con la forma `Movement|0`. No lo he ejecutado contra `gastos`.
5. **El `dropdb` del documento está probado** con una base creada para ello
   (`gastos_test_docs55_check`): `createdb` y `dropdb -U postgres` dentro del contenedor, código
   0, y la base ya no existe.
6. **No he añadido `backup.docs.test.ts` a la lista del árbol de `src/architecture.test.ts`**:
   ese archivo no está en la cabecera `Archivos:` de mi lote. No pone nada en rojo (esa lista
   solo comprueba que existen los archivos que nombra). Va en sugerencias.
7. **En `docs/roadmap.md`, la frase sobre el valor del `.env`** dice que el humano puso el
   nombre de la carpeta según lo que él dijo, porque ningún agente ha leído ese archivo.

### Trazabilidad

- R15 → `documents step by step how to make a copy and how to restore it`
  (`src/modules/backup/backup.docs.test.ts`).

### Documentos actualizados

`git grep -n -i "copia de seguridad\|cabo suelto 6\|cabo 6\|backup\b"` fuera de `progress/`,
`specs/`, `feature_list.json`, `src/` y `scripts/`: las líneas que el cambio volvía falsas eran
la fila del cabo 6 de `docs/roadmap.md` («sin dueño») y, por la dependencia de Docker, la línea
de PostgreSQL de §Requisitos y la fila de `pnpm test` de `README.md`. Las tres corregidas.
`AGENTS.md`, `docs/verification.md` y `docs/related-projects.md` no nombran nada de esto.
La nota «Sobre el 6» que hay debajo de la tabla de cabos sueltos de `docs/roadmap.md` no la he
tocado.

### Prueba real

No se ha hecho: es del humano y está escrita en `docs/roadmap.md` §Deberes tuyos pendientes
(cuatro pasos, ninguno escribe en `gastos`), junto con el cambio del valor de
`GOOGLE_DRIVE_BACKUP_FOLDER_ID` en su `.env`. Siguen sin comprobar las cuatro cosas que listó el
Lote A (que Drive devuelva `size`, que el acceso pueda escribir fuera de `notas-banco/`, que bajo
`pnpm run` la entrada sea un terminal, y qué responde Drive a un nombre en vez de un
identificador); el documento y el ADR-034 lo dicen.

### Último ./init.sh

Código de salida 0.

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  74 passed (74)
      Tests  1340 passed (1340)
   Duration  14.80s
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Después, `docker exec gastos-postgres psql -U postgres -Atc "select datname from pg_database
where datname like 'gastos_test_backup%' or datname like 'gastos_test_docs55%'"`: ninguna fila,
código 0.

### Último ./init.sh --checks 55

Código de salida 0. Los `checks` no se han modificado.

```
[INFO]  [11] Hay un documento que explica paso a paso cómo hacer la copia y cómo restaurarla.
[INFO]      $ pnpm exec vitest run src/modules/backup/backup.docs.test.ts -t "documents step by step how to make a copy and how to restore it" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed (1)
[INFO]  [12] (añadido) De lo que no quiero: la copia no se hace sola ni tiene ruta en la API, y no se queda en mi ordenador.
[OK]        exit 0
                Tests  2 passed | 38 skipped (40)
[OK]    Checks: 12 de 12 en verde.
```

Los checks 1 a 10 salieron `exit 0` con los mismos recuentos que en la tabla del Lote A.

`./init.sh` se lanzó otra vez después de escribir este informe (los documentos de `progress/`
también los lee `src/no-real-data.test.ts`): código de salida 0, 74 archivos, 1340 tests, 15,89 s.

### Encontrado en el Lote A (NO corregido)

- **Docker instalado pero parado: no he comprobado qué mensaje sale.** `symptomOf`
  (`backup.database.ts`) da el mensaje de «no se ha podido ejecutar `docker`» solo cuando el
  programa no arranca (evento `error` de `spawn`). Si el programa `docker` arranca y falla por no
  poder hablar con Docker, por lectura del código ese texto no está entre los síntomas
  reconocidos y saldría el mensaje genérico «el programa del contenedor terminó con el código N».
  Es una deducción, no una comprobación: para comprobarlo hay que parar Docker, y no lo he hecho.
  El documento dice que, ante ese mensaje, lo primero es mirar que Docker está en marcha.

### Sugerencias fuera de scope (NO aplicadas)

- Añadir `modules/backup/backup.docs.test.ts` a la lista del árbol de `src/architecture.test.ts`
  (archivo del Lote A).
- La del Lote A sobre rechazar `postgres` como base de destino sigue en pie; el documento le
  dice al humano que no la use.

## Cambios tras la primera revisión

Implementer, 2026-10-02. Punto 1 de `progress/reviews/db-backup.md`. Sin commit, sin `git stash`,
sin tocar los `checks`, y sin lanzar ningún comando contra el Drive ni contra la base `gastos`.

### Qué cambia

- `scripts/db-backup.ts`: cuando falla `loadConfig` (variable sin valor, con espacios, o falta una
  obligatoria), la primera línea es ahora `La copia NO está hecha.` y debajo va el mensaje de
  configuración tal cual. El fallo no previsto también pasa a dos líneas, con esa misma primera
  línea exacta (antes era `La copia NO está hecha: el comando ha fallado…`).
- `scripts/db-restore.ts`: **no cambia.** Ese comando no tiene ninguna frase propia para sus
  fallos: imprime solo el mensaje del error. No he inventado una. Si se quiere una, hay que
  decidir cuál; el test nuevo fija lo que hace hoy.
- `src/modules/backup/backup.scripts.test.ts` (nuevo), un test por comando:
  - `db:backup says the copy is NOT made before the configuration problem`
  - `db:restore prints the configuration problem alone and restores nothing` (sin argumentos y
    con dos)

  Lanzan cada script como proceso aparte, con el directorio temporal del sistema como carpeta de
  trabajo (no se carga el `.env` del repositorio), todas las variables inventadas y la de la
  carpeta con espacios, de modo que el script termina en `loadConfig`, antes de crear el cliente
  de Drive o de ejecutar nada en el contenedor. Comprueban código de salida 1, salida estándar
  vacía y las líneas exactas de la salida de error.
- `docs/database-backup.md`: §1 dice qué imprimen los dos comandos con el `.env` mal escrito, con
  el ejemplo de `db:backup`; y la frase de «la primera línea es siempre…» incluye ese caso. El
  resto del documento no se ha tocado.

### Fuera de mis archivos (no aplicado)

- El árbol de `docs/architecture.md` (línea 137) lista los archivos de `modules/backup/` y no
  tiene `backup.scripts.test.ts`. Tampoco está en la lista de `src/architecture.test.ts`, que
  solo comprueba que existen los que nombra.

### Comandos y resultados

`pnpm exec vitest run src/modules/backup/backup.scripts.test.ts`:

```
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.87s
```

`./init.sh` — código de salida 0:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  75 passed (75)
      Tests  1342 passed (1342)
   Duration  15.64s
[OK]    Todos los tests pasan
```

`./init.sh --checks 55` — código de salida 0: los doce `exit 0`, `Checks: 12 de 12 en verde.`

`docker exec gastos-postgres psql -U postgres -Atc "select count(*) from pg_database where datname like 'gastos_test_backup%'"` → `0`.

## Fallo encontrado en la prueba real

Implementer, 2026-10-02. La prueba real del humano falló al subir: «No se ha podido subir la copia
a Drive: Cannot reach Google Drive». Sin commit, sin `git stash`, sin tocar los `checks`, y sin
lanzar ningún comando contra el Drive ni contra la base `gastos`. La feature sigue marcada `done`,
como estaba.

### Causa

`uploadBackup` entregaba el contenido a `files.create` como `Buffer`. El cliente de Drive
(`googleapis-common@9.0.4`, `build/src/apirequest.js`, función `multipartUpload`) solo trata aparte
un `string`; con cualquier otra cosa hace `part.body.pipe(...)`, y un `Buffer` no tiene `pipe`. El
`TypeError` salta antes de hacer ninguna petición, y `driveErrorMessage` lo convertía en el texto
genérico.

**Por qué no lo vio la suite.** El cliente de Drive simulado en memoria de `backup.fixture.ts`
aceptaba un `Buffer`, cosa que el de verdad no hace. Y el design daba por comprobado, leyendo el
código de la librería, que «un cuerpo que no es un stream se envía tal cual»: esa lectura era
errónea y yo la di por buena sin ejecutarla.

### Qué cambia

- `src/modules/backup/backup.drive.ts`: el contenido se entrega como flujo de lectura
  (`Readable.from(content, { objectMode: false })`). La comprobación de tamaño sigue comparando
  con `content.length`.
- `src/modules/backup/backup.fixture.ts`: el cliente simulado lee la subida como el de verdad. Un
  `string` va tal cual; si el cuerpo no tiene `pipe`, lanza
  `TypeError: part.body.pipe is not a function`; si lo tiene, guarda los bytes que lee del flujo.
- `src/modules/backup/backup.drive.test.ts` (nuevo), tres tests:
  - `hands the copy to the real Drive client as a stream it can send` — con el cliente **de
    verdad** de `createDriveClient`, credenciales inventadas y **sin red**: se sustituye el
    `request` de su cliente OAuth (el último paso antes de salir de la máquina), que lee la
    petición ya construida y responde con el fallo de credenciales. Comprueba que el error es el
    de credenciales («Drive OAuth credentials are not valid») y no el genérico, que la petición va
    a `/upload/drive/v3/files` como `multipart/related`, y que el cuerpo lleva todos los bytes de
    la copia, una sola vez, seguidos del cierre.
  - `would fail before any request if the copy were handed over as a Buffer` — el cliente de
    verdad y el simulado lanzan el mismo `TypeError` con un `Buffer`, sin construir ninguna
    petición.
  - `stores in the simulated Drive the bytes it read from the stream`.

Ese acceso al cliente OAuth pasa por una propiedad interna de la librería
(`client.context._options.auth`): si una versión nueva la cambia, el test falla al prepararse, no
en silencio.

### El test habría fallado antes del arreglo

Con el cliente simulado ya corregido y `backup.drive.ts` todavía con el `Buffer`,
`pnpm exec vitest run src/modules/backup/backup.service.test.ts`:

```
 ❯ src/modules/backup/backup.service.test.ts (20 tests | 20 skipped) 324ms
 FAIL  src/modules/backup/backup.service.test.ts > backup commands
BackupError: No se ha podido subir la copia a Drive: Cannot reach Google Drive. No se ha guardado ninguna copia.
 ❯ uploadBackup src/modules/backup/backup.drive.ts:92:11
 ❯ createBackup src/modules/backup/backup.service.ts:50:16
 ❯ src/modules/backup/backup.service.test.ts:204:5
 Test Files  1 failed (1)
      Tests  20 skipped (20)
```

Es el mismo mensaje que vio el humano. Falla en la preparación del archivo (la primera copia), por
eso los veinte tests salen como saltados. Con el arreglo, `pnpm exec vitest run src/modules/backup`:

```
 Test Files  6 passed (6)
      Tests  36 passed (36)
   Duration  8.69s
```

### `uploadFile` de `src/lib/drive-structure.ts` (no tocado)

- **Tiene el mismo fallo.** Pasa `file.body` tal cual a `files.create`, y `FileUpload.body` admite
  `Buffer`. Ejecutado con el cliente de verdad, credenciales inventadas y sin red (script temporal
  fuera del repositorio, ya borrado):

  ```
  Buffer -> DriveConnectionError | Cannot reach Google Drive | requests built so far: 0
  string -> DriveConnectionError | Drive OAuth credentials are not valid | requests built so far: 1
  ```

  Con un `Buffer` no llega a construir la petición; con un `string`, sí.
- **Ningún código de la aplicación lo llama.** `git grep -n "uploadFile(" -- src scripts prisma`
  sin los archivos de test solo da su propia definición. Sus tests (`src/lib/drive-structure.test.ts`)
  lo llaman con un `string` y un cliente simulado. Hoy no afecta a nada; fallaría el día que
  alguien lo use con un `Buffer`.

### Sin comprobar

- **La subida contra el Drive de verdad.** Lo comprobado es que la petición se construye entera y
  con los bytes dentro; que Drive la acepte y que devuelva `size` solo se ve repitiendo la prueba
  real.

### Fuera de mis archivos (no aplicado)

- `backup.drive.test.ts` no está en el árbol de `docs/architecture.md` (línea 137) ni en la lista
  de `src/architecture.test.ts`.
- `specs/55-db-backup/design.md` §1 sigue diciendo que un `Buffer` se envía tal cual; es histórico
  y no se toca, pero el ADR-034 no debería repetirlo (`git grep` de «Buffer» junto a la subida en
  `docs/` y `README.md`: ninguna línea).

### Comandos y resultados

`./init.sh` — código de salida 0:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  76 passed (76)
      Tests  1345 passed (1345)
   Duration  15.97s
[OK]    Todos los tests pasan
```

`./init.sh --checks 55` — código de salida 0: `Checks: 12 de 12 en verde.`

`docker exec gastos-postgres psql -U postgres -Atc "select count(*) from pg_database where datname like 'gastos_test_backup%'"` → `0`.

## Rechazo de las bases internas de PostgreSQL como destino

Implementer, 2026-10-02. Pedido por el humano a partir de la observación del reviewer
(`progress/reviews/db-backup.md`, primera pasada). Sin commit, sin `git stash`, sin tocar los
`checks` ni el estado de ninguna feature, sin leer `.env`, y sin lanzar `db:backup` ni `db:restore`
contra el Drive de verdad ni contra la base `gastos`. No se ha restaurado nada en `postgres`,
`template0` ni `template1`.

**A comprobar por el leader:** las dos bases de comprobación del humano (`gastos_restore_check` y
`gastos_restore_check_before_restore_20261002175832`) **no aparecen** en la lista de bases del
servidor que saqué al terminar (abajo). No saqué esa lista antes de empezar, así que no sé si
estaban cuando arranqué. Ningún comando que yo haya lanzado nombra esas bases; lo único que borra
bases en lo que ejecuté es la suite, y no he comprobado qué nombres borra más allá de leer que
`backup.service.test.ts` borra las que empiezan por `gastos_test_backup_`.

### Qué cambia

- `src/modules/backup/backup.database.ts`: función nueva `assertNotInternalDatabase(name)`. Lanza
  un `BackupError` si el nombre es `postgres`, `template0` o `template1`.
- `src/modules/backup/backup.service.ts`: `restoreBackup` la llama en su primera línea, antes de
  `assertDatabaseName`, de cualquier llamada a Drive y de cualquier comando en el contenedor.
- `scripts/db-restore.ts`: sin cambios. Ya imprime el mensaje de un `BackupError` y sale con 1.
- `docs/database-backup.md`, apartado 4: la línea que solo avisaba de `postgres` dice ahora que las
  tres se rechazan, con el mensaje.
- `docs/architecture.md`, ADR-034, punto 11 de la decisión (el de los nombres de base): una frase.
  Ningún otro ADR tocado.

Mensaje, con el nombre que se haya escrito:

```
La base «template1» es interna de PostgreSQL y no se puede usar como destino de una restauración: elige otro nombre. No se ha tocado nada.
```

### Mayúsculas

La comparación es exacta, distinguiendo mayúsculas, igual que la validación de nombres que ya
tenía el módulo: `assertDatabaseName` solo admite minúsculas. `Postgres` o `TEMPLATE1` no dan el
mensaje nuevo, pero se rechazan igualmente, sin llamar a Drive ni al contenedor, con el mensaje de
siempre («El nombre de la base de datos no es válido…»). El test lo fija con esos dos nombres.

### Tests (2 nuevos; la suite pasa de 1345 a 1347)

- `backup.service.test.ts` → `rejects the internal databases of PostgreSQL as target before doing
  anything`: con los tres nombres comprueba el código `BACKUP_FAILED` y el mensaje entero; al final,
  que no se ejecutó ningún comando del contenedor (`ran` vacío), que no hubo ninguna llamada al
  cliente de Drive simulado (`drive.calls` vacío), ninguna descarga y ninguna petición de
  confirmación. El comando del contenedor de este test es uno que no llega a ningún contenedor
  (responde código 1 sin ejecutar nada), para que el test no pueda restaurar en esas bases ni
  siquiera si la comprobación desapareciera.
- `backup.database.test.ts` → `refuses the three databases PostgreSQL creates and no other name`:
  los tres nombres lanzan; `gastos`, `gastos_restore_check`, `postgres_copia` y `template2` no.

**El test falla sin el cambio.** Con la llamada de `restoreBackup` comentada,
`pnpm exec vitest run src/modules/backup/backup.service.test.ts -t "internal databases"`:

```
AssertionError: expected 'No se ha podido comprobar si existe l…' to be 'La base «postgres» es interna de Post…'
 Test Files  1 failed (1)
      Tests  1 failed | 20 skipped (21)
```

Con la llamada puesta, `pnpm exec vitest run src/modules/backup`: `Test Files 6 passed (6)`,
`Tests 38 passed (38)`.

### El comando, lanzado de verdad

`scripts/db-restore.ts` lanzado con `tsx` desde una carpeta temporal fuera del repositorio (sin
ningún `.env`), con todas las variables inventadas (credenciales de Drive inventadas y
`DATABASE_URL` apuntando a una base que no existe), una vez por nombre:

```
La base «postgres» es interna de PostgreSQL y no se puede usar como destino de una restauración: elige otro nombre. No se ha tocado nada.
exit=1
La base «template0» es interna de PostgreSQL y no se puede usar como destino de una restauración: elige otro nombre. No se ha tocado nada.
exit=1
La base «template1» es interna de PostgreSQL y no se puede usar como destino de una restauración: elige otro nombre. No se ha tocado nada.
exit=1
```

Un primer intento de esta misma prueba, con `env -i`, no llegó a arrancar Node (código 134, fallo
de Node al iniciarse sin las variables de Windows): no ejecutó nada del script.

Después de todo lo anterior, leyendo sin escribir:
`select count(*) from pg_tables where schemaname='public'` da `0` en `postgres` y `0` en
`template1`. En `template0` no lo he comprobado (no admite conexiones).

### Documentos actualizados

`git grep -n -i "template1\|template0\|base interna\|como destino" -- . ':!progress' ':!specs'`:
solo salen las líneas nuevas de `docs/database-backup.md`, del ADR-034 y del módulo, y una línea
del ADR-034 sobre las bases de los tests que sigue siendo cierta. La única línea que el cambio
volvía falsa era la de `docs/database-backup.md` («No uses `postgres` como destino…»), ya
corregida.

`progress/current.md` no lo he anotado: no estaba entre los archivos que se me permitía tocar.

### Comandos y resultados

`./init.sh` — código de salida 0:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  76 passed (76)
      Tests  1347 passed (1347)
   Duration  15.95s
[OK]    Todos los tests pasan
```

`./init.sh --checks 55` — código de salida 0: `Checks: 12 de 12 en verde.`

`docker exec gastos-postgres psql -U postgres -Atc "select datname from pg_database order by 1"`,
al terminar: `gastos`, `gastos_test_1` a `gastos_test_8`, `gastos_test_template`, `postgres`,
`template0`, `template1`.

`git status --short`: `docs/architecture.md`, `docs/database-backup.md` y cuatro archivos de
`src/modules/backup/` (`backup.database.ts`, `backup.database.test.ts`, `backup.service.ts`,
`backup.service.test.ts`), más este informe.
