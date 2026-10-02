# Review — feature 55 `db-backup`

## Review (2026-10-02)

**Veredicto:** CHANGES_REQUESTED

Checks: **12 de 12 en verde** (`./init.sh --checks 55`, código de salida 0, lanzado por mí).
`./init.sh`: código de salida 0, 74 archivos de test, 1340 tests. El código hace lo que
aprobó el humano en los seis puntos 🔴; lo que falla son dos frases de documentos.

### Cambios requeridos

1. `docs/database-backup.md:130` — la frase «Si algo falla, la primera línea es **siempre**
   `La copia NO está hecha.`» es falsa. Comprobado ejecutando `scripts/db-backup.ts` desde una
   carpeta vacía (sin `.env`), con variables inventadas y `GOOGLE_DRIVE_BACKUP_FOLDER_ID=` sin
   valor: sale con código 1 e imprime solo

   ```
   Invalid environment configuration:
   - GOOGLE_DRIVE_BACKUP_FOLDER_ID must be a bare Drive folder id or a folder URL (not the folder name), got ''; remove the line if the backup commands are not used
   ```

   sin la línea `La copia NO está hecha.` y en inglés. Es la rama de `scripts/db-backup.ts:19-26`
   (fallo de `loadConfig`), que también se toma si falta una variable obligatoria o si el valor
   lleva espacios (un nombre de carpeta con espacios cae aquí, no en el mensaje en español de
   `backup.drive.ts`). No incumple R4 ni R5 (no dice que la copia esté hecha), pero el documento
   paso a paso afirma algo que el comando no hace. Una de dos: que esa rama del script anteponga
   también `La copia NO está hecha.`, o que el documento diga que un `.env` mal escrito sale con
   el mensaje de configuración (en inglés) y sin esa línea. En cualquiera de los dos casos,
   `docs/database-backup.md` §1 («Una línea sin valor … o con espacios impide arrancar el
   servidor») debería decir además qué imprimen los dos comandos en ese caso.

2. Vocabulario (punto 3d): dos palabras cortas nuevas, que no están en la tabla de `CLAUDE.md`
   ni en `docs/vocabulary.md`, nombran cosas del proyecto en texto que no es del spec. Ninguna de
   las dos existía con ese uso en `HEAD` (`git grep -iwE "sello|ejecutor" HEAD -- docs README.md`:
   una sola línea, de otro tema).
   - `docs/architecture.md:2867` (ADR-034, decisión 4) — «pasa por el mismo **ejecutor**». Decirlo
     literal: «pasa por la misma función, `runInContainer`, que lanza `docker exec gastos-postgres` …».
   - `docs/architecture.md:2955` (ADR-034, consecuencias) — «`<base>_before_restore_<sello>`».
     Usar `<AAAAMMDDHHMMSS>`, como hace el mismo ADR en la decisión 9.
   - `progress/implementations/db-backup.md:79` — «`<base>_restore_<sello>`,
     `<base>_before_restore_<sello>`». Lo mismo.

### Observaciones (no bloquean; para el leader)

- **Cifra de tiempo.** `docs/stack.md` y el ADR-034 dicen «unos 2,3 s más por pasada». Medido
  por mí: `pnpm test` 15,41 s y 14,76 s (y 16,43 s dentro de `./init.sh`, que tardó 22 s de
  reloj entero); `pnpm exec vitest run --exclude "src/modules/backup/**"` 11,88 s y 11,96 s.
  Aquí son unos **3 s** más, no 2,3.
- **Lo que no he comprobado, y qué haría falta:**
  - Nada contra el Drive real: lo de Drive está juzgado **solo** por los tests y por mi prueba,
    los dos con el cliente de Drive simulado en memoria de `backup.fixture.ts`. Qué responde el
    Drive de verdad a un nombre de carpeta puesto como identificador, que `files.create` devuelva
    `size`, y que el acceso pueda escribir fuera de `notas-banco/`: hace falta la prueba del
    humano (está en `docs/roadmap.md` §Deberes tuyos pendientes).
  - Que la pregunta funcione en un terminal de verdad bajo `pnpm run` (que pregunte, acepte el
    nombre y el proceso termine). No tengo terminal: mi entrada no lo es. Solo está el test con
    una entrada simulada marcada como terminal. Sugerencia para el deber del humano: lanzar dos
    veces `pnpm run db:restore <archivo> gastos_restore_check`; la segunda ya tiene tablas y
    pregunta, sin tocar `gastos`. Hoy el deber lo deja para «si algún día restauras sobre
    `gastos`», que es el peor momento para descubrirlo.
  - Que el identificador de ejemplo de `docs/database-backup.md` no sea el de la carpeta del
    humano: habría que compararlo con su `.env`, que no he leído.
  - El mensaje con Docker instalado pero parado: habría que parar Docker.
- **Fuera del spec:** `db:restore` acepta como destino `template1` y `postgres` (no tienen
  tablas, así que restaura dentro sin preguntar; en `template1` cada base creada después
  heredaría esas tablas). El documento solo avisa de `postgres`. Lo dejo dicho; no lo pide
  ningún requirement.
- `src/architecture.test.ts` no lista `modules/backup/backup.docs.test.ts` en su árbol esperado
  (lo dicen los dos informes; `tasks.md` T10 lo excluía a propósito).

### Comprobado sin hallazgos

Con qué comando y qué salió:

- **`./init.sh`** → código 0; tipos, lint y formato en verde; `Test Files 74 passed (74)`,
  `Tests 1340 passed (1340)`, 16,43 s. Partida: 70 y 1302.
- **`./init.sh --checks 55`** → código 0, `Checks: 12 de 12 en verde`. Cada check imprime tests
  ejecutados: diez con `1 passed`, el 5 con `2 passed | 18 skipped (20)` y el 12 con
  `2 passed | 38 skipped (40)`. Todos terminan en `| grep -E "Tests +N passed"`, así que ninguno
  puede salir en verde sin ejecutar su test. Coinciden con la tabla 🧪 de `decisions.md` (ocho
  filas con comando → doce checks) y con los nombres de test de `tasks.md` y `design.md` §4.
- **Requirements ↔ tests:** R1 a R15, cada uno con al menos un test que existe y pasa en la
  pasada de arriba (mapa del informe contrastado con los archivos de test). `tasks.md`: T1 a T17
  en `[x]`. `decisions.md`: 73 líneas, los seis bloques del formato, 🔴 con 6 puntos y su
  alternativa. `requirements.md`: 15 requirements, todos con procedencia.
- **Los seis puntos 🔴:**
  1. Carpeta por identificador o dirección: `src/config/env.ts` + tests `accepts the backup
     folder as an id or as a folder URL` y `loads the configuration without …`. Con un **nombre**
     como valor: `loadConfig` lo acepta si no lleva espacios y el comando falla sin sacar ni subir
     nada, con «… tiene que llevar el identificador de la carpeta o su dirección completa
     (https://drive.google.com/drive/folders/<identificador>), no su nombre» (test `fails without
     claiming a copy when the folder does not exist`, con Drive simulado). Sin la variable,
     ejecutado por mí: `db-backup.ts` → código 1, `La copia NO está hecha.` + «falta la variable
     GOOGLE_DRIVE_BACKUP_FOLDER_ID …»; `db-restore.ts` (listar) → código 1, mismo motivo.
  2. Confirmación solo desde un terminal: `grep -nE "process\.(env|argv)|--yes|--confirm|--force|isTTY"`
     sobre el módulo y los dos scripts → solo `isTTY` en `backup.confirm.ts:15` y
     `process.argv.slice(2)` en `scripts/db-restore.ts:32` (un tercer argumento como `--yes` →
     código 1 y el uso; ejecutado). **Probado por mí sin terminal** (`process.stdin.isTTY =
     undefined`, con el nombre correcto esperando en la entrada), contra una base mía con tablas
     `gastos_review_f55_full`, llamando a `restoreBackup` con el `askDatabaseName` de verdad:
     `BackupError BACKUP_FAILED` — «… Este comando no se ha lanzado desde un terminal, así que
     no pregunta: no se ha tocado nada.»; la base quedó con los mismos recuentos y su fila de
     marca, ninguna descarga, ninguna base nueva. No lo lancé con el script entero porque el
     script llama a Drive antes de llegar a la pregunta.
  3. La base anterior queda renombrada y se restaura primero aparte: en mi prueba, con la
     respuesta correcta, quedó `gastos_review_f55_full_before_restore_20261002161346` con los
     mismos recuentos y la fila de marca, y el nombre original con el contenido de la copia.
     Orden en `backup.service.ts` → `replaceDatabase`: crear la base aparte, `restoreDump`, y solo
     entonces los dos renombrados.
  4. Las copias no se borran: `grep -nE "files\.(delete|update|copy|emptyTrash)|removeParents|addParents"`
     sobre el módulo y los scripts → nada. Llamadas a Drive del código: `files.get`,
     `files.create`, `files.list`, más `downloadFileContent` (`files.get` con `alt: 'media'`).
  5. Copia por nombre exacto, base obligatoria, listado sin argumentos: `findBackupFile` compara
     en código; un solo argumento → código 1 y el uso (ejecutado); tests de R11 y R12.
  6. Sin cifrar: `pg_dump --format=custom` tal cual sube; en mi prueba el archivo empieza por
     `PGDMP`.
- **Ida y vuelta real hecha por mí** (PostgreSQL del contenedor, Drive simulado, sin `.env`):
  origen `gastos_review_f55_src` (clon de `gastos_test_template` + 5 categorías inventadas) →
  `createBackup` (36,5 kB) → `restoreBackup` en `gastos_review_f55_dst`, que no existía → 10
  tablas en origen y 10 en destino, recuentos por tabla idénticos (comparados con `psql`, no con
  el código de la feature).
- **Bases al acabar** (`select datname from pg_database`): `gastos`, `gastos_test_1` a
  `gastos_test_8`, `gastos_test_template`, `postgres`, `template0`, `template1`. Ninguna
  `gastos_review_f55_*` ni `gastos_test_backup_*`. **`gastos` no cambió:** md5 de sus recuentos
  por tabla, de sus secuencias y de su tamaño, iguales antes de empezar y después de todo (solo
  lectura, sin imprimir ninguna cifra).
- **Ninguna ruta nueva:** no hay `*.routes.ts` en `src/modules/backup/`; nada de `src/` fuera del
  módulo lo importa salvo `src/architecture.test.ts`; `src/app.ts` y `docs/api-contract.md` sin
  diff. **Nada en el repositorio:** `git status --short` igual antes y después de las pasadas,
  ningún `*.dump`. **`var/` y disco:** `grep -nE "var/|node:fs|tmpdir|writeFile|createWriteStream"`
  sobre el código del módulo y los scripts → nada.
- **Documentos:** comandos, salidas y mensajes de `docs/database-backup.md` contrastados con
  `backup.service.ts`, `backup.drive.ts`, `backup.database.ts`, `backup.confirm.ts` y los
  scripts: coinciden, salvo el cambio 1. Dice que el valor es el identificador o la dirección y
  no el nombre. ADR-034 añadido al final, sin tocar ningún otro ADR. `docs/stack.md` con su fila.
  `.env.example`: una sola línea de la variable (`grep -c` → 1). `docs/roadmap.md`: cabo 6
  tachado, los dos deberes en §Deberes tuyos pendientes, y las dos frases del leader sobre el
  cabo 10 siguen en el diff.
- **`git stash list`** → vacío. Los doce archivos modificados y los seis sin seguimiento del
  estado inicial siguen ahí, con los cambios del leader en `docs/roadmap.md`,
  `feature_list.json` y `progress/current.md`.
- **Scripts:** `tsc --noEmit` con las opciones de `tsconfig.json` sobre los dos scripts y
  `src/app.ts` → código 0; `oxlint` y `prettier --check` sobre los dos → limpios.
- Ningún archivo del motor del harness en el diff. El repositorio del frontend tiene cambios sin
  commitear, pero ninguno nombra la copia (`git -C ../gastos-frontend diff | grep -ciE "backup|db:restore"` → 0).
- Convenciones (errores con `AppError`, `console` solo en los scripts, tests con PostgreSQL de
  verdad sobre bases desechables), `docs/lessons.md` (1 y 2 no aplican; 3: ningún fixture `.xls`
  ni `.pdf`), CHECKPOINTS C1-C5, C4 bis (prueba real no hecha, dicho en el informe y apuntado
  como deber), C6 (sin cambio de contrato), C7.

## Review (2026-10-02, segunda pasada)

**Veredicto:** APPROVED
Comprobado: requirements ↔ tests, arquitectura, convenciones, verificación, CHECKPOINTS C1-C8.
Checks: 12 de 12 en verde (`./init.sh --checks 55`, código 0, lanzado por mí; cada uno imprime
tests ejecutados). `./init.sh`: código 0, 75 archivos de test, 1342 tests, 17,13 s (23 s de reloj).
Sin hallazgos.
Resumen de cierre: `progress/summaries/db-backup.md`.

Los dos cambios de la primera pasada, comprobados ejecutando:

1. Repetida mi prueba (carpeta vacía sin `.env`, variables inventadas, sin terminal):
   - `db-backup.ts` con `GOOGLE_DRIVE_BACKUP_FOLDER_ID=` sin valor → código 1,
     `La copia NO está hecha.` y debajo `Invalid environment configuration: …`.
   - `db-backup.ts` sin ninguna variable obligatoria → código 1, misma primera línea.
   - `db-backup.ts` sin la variable de la carpeta → código 1, misma primera línea.
   - `db-restore.ts` con la variable sin valor → código 1, solo el problema de configuración.

   Coincide con `docs/database-backup.md:142` («la primera línea es siempre…», que ahora nombra
   el `.env` mal escrito) y con su §1 (líneas 95-108), que dice qué imprime cada comando.
   `src/modules/backup/backup.scripts.test.ts` fija las dos salidas línea a línea y pasa.
2. `grep -n -wE "sello|ejecutor"` sobre `docs/`, `README.md` y el informe → solo la línea 785 de
   `docs/architecture.md`, anterior a esta feature y de otro tema.

También: `git stash list` vacío; bases del servidor al acabar: `gastos`, `gastos_test_1` a
`gastos_test_8`, `gastos_test_template`, `postgres`, `template0`, `template1`; los md5 de los
recuentos y de las secuencias de `gastos`, iguales que al empezar la primera pasada.

Sigue sin comprobar, igual que en la primera pasada: todo lo que toca el Drive real y la
pregunta en un terminal de verdad (queda como deber del humano en `docs/roadmap.md`, ahora con
el paso 4 que la prueba sin tocar `gastos`).

Nota menor, no bloquea: en ese deber, la frase final «y, solo si algún día restauras sobre
`gastos`, que el comando … puede preguntarte en el terminal» se ha quedado vieja: eso lo prueba
ya el paso 4.

## Review (2026-10-02, tercera pasada)

**Veredicto:** APPROVED
Comprobado: el arreglo de la subida, la comprobación de tamaño, la lista y la descarga con la
librería de Drive de verdad, arquitectura, convenciones, CHECKPOINTS C1-C8.
Checks: 12 de 12 en verde (`./init.sh --checks 55`, código 0; cada uno imprime tests ejecutados).
`./init.sh`: código 0, 76 archivos de test, 1345 tests, 14,61 s (20 s de reloj).
Sin hallazgos que bloqueen.
Resumen de cierre: `progress/summaries/db-backup.md` (actualizado: el fallo y su arreglo).

⚠️ **Un error mío que hay que saber.** Al montar mi prueba hice **3 peticiones a
`www.googleapis.com`** (la dirección de subida de Google) sin querer: creí que la opción
`rootUrl` del cliente desviaba también las subidas a mi servidor local, y no lo hace. Iban con
un token inventado (`token-inventado`), sin ninguna credencial ni dato del humano: una con
300 000 bytes aleatorios y dos con el texto `0123456789`. Google respondió 401 («Request had
invalid authentication credentials») en las dos que miré; la primera la vi solo como «Cannot
reach Google Drive». No tocaron el Drive del humano ni su `.env`, pero no fue «sin red». Las
pruebas de abajo ya van con cada llamada forzada al servidor local y la salida HTTPS cerrada.

Con qué comando y qué salió:

1. **El arreglo es correcto.** Script propio fuera del repositorio: la librería de verdad
   (`@googleapis/drive` 26.0.0, `googleapis-common` 9.0.4, `gaxios` 7.3.0), token inventado, y un
   servidor HTTP en `127.0.0.1` que hace de Drive; las funciones de `backup.drive.ts` sin tocar.
   - Antes (un `Buffer` directo a `files.create`): cliente de verdad →
     `TypeError: part.body.pipe is not a function`, 0 peticiones. Drive simulado de
     `backup.fixture.ts` → el mismo `TypeError`. Los dos lo rechazan igual.
   - Ahora (`uploadBackup`): `POST /upload/drive/v3/files` con `uploadType`; el servidor recibió
     300 000 bytes aleatorios **idénticos** a los enviados; devuelve `sizeBytes: 300000`.
2. **La comprobación de tamaño sigue valiendo:** con el servidor respondiendo 7 bytes menos →
   «La copia subida no es fiable: se enviaron 300000 bytes y Drive dice haber guardado 299993».
   Compara con `content.length`, el `Buffer` original, no con el flujo.
3. **La lista y la descarga no tienen un fallo parecido** (misma prueba, librería de verdad):
   `listBackupFiles` → `GET /drive/v3/files` con `fields, orderBy, pageSize, q`, y devuelve el
   archivo con su tamaño. `downloadFileContent` → la librería devuelve un `ArrayBuffer`
   (`[object ArrayBuffer]`) y la función lo convierte en un `Buffer` idéntico a lo subido
   (300 000 bytes). El Drive simulado devuelve un `Buffer` en vez de un `ArrayBuffer`;
   `Buffer.from` acepta los dos, así que ahí no tapa nada. `resolveBackupFolder` con un 404 del
   servidor da el mensaje del identificador o la dirección.
4. **El test nuevo no sale a la red:** `HTTPS_PROXY=http://127.0.0.1:9 pnpm exec vitest run
   src/modules/backup/backup.drive.test.ts` → `Tests 3 passed (3)`; con un `Buffer` la librería
   falla antes de construir la petición, y con el flujo la petición se queda en la función
   `request` sustituida.
5. **El diff no toca nada más:** archivos cambiados después de mi segunda pasada
   (`find . -newer progress/summaries/db-backup.md`): `backup.drive.ts`, `backup.fixture.ts`,
   `backup.drive.test.ts`, el informe, `docs/architecture.md` (el test en el árbol),
   `feature_list.json`, `progress/current.md`, `progress/history.md` y el `.env` del humano, que
   no he leído. `git stash list` vacío.
6. Bases al acabar: `gastos`, `gastos_test_1` a `gastos_test_8`, `gastos_test_template`,
   `postgres`, `template0`, `template1`. El md5 de las secuencias de `gastos`, igual que en la
   primera pasada. No creé ninguna base esta vez.

### Observaciones (no bloquean)

- **El test nuevo depende de una propiedad interna de la librería**
  (`client.context._options.auth`, `backup.drive.test.ts`). Si una versión nueva la cambia, el
  test falla al prepararse (rojo, no en silencio), y habrá que rehacerlo. Además corta la
  petición antes de enviarla: comprueba que se construye con los bytes dentro, no que viaje.
  Lo segundo lo cubrió mi prueba con el servidor local, que no está en la suite.
- **Sigue sin comprobar:** la subida contra el Drive de verdad (que Drive acepte la petición y
  devuelva `size`). Solo se ve repitiendo la prueba del humano.
- `uploadFile` de `src/lib/drive-structure.ts:320` tiene el mismo fallo con un `Buffer`
  (`FileUpload.body` lo admite). `git grep "uploadFile("` fuera de los tests: solo su
  definición, así que hoy no afecta. Lo dice también el informe.
- `specs/55-db-backup/design.md` §1 afirma que un cuerpo `Buffer` «se envía tal cual»: es falso
  y era una lectura, no una ejecución. Es histórico; el ADR-034 no lo repite.
- `src/architecture.test.ts` sigue sin listar los tres archivos de test añadidos después del
  Lote A.
