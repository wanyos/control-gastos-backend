# Requirements — F55 `db-backup`

> EARS estricto. Fuente de verdad: el `intent` de la feature 55 en
> `feature_list.json`. Estado de partida que dio el leader (2026-10-02):
> `./init.sh` en verde, 70 archivos de test y 1302 tests. Lo que se cita de
> código y de comandos está leído o ejecutado ese día (detalle en `design.md` §1).

Definiciones que usan todos los requirements, y ninguna más:

- **Carpeta de copias** = la carpeta de Google Drive cuyo identificador está en
  la variable `GOOGLE_DRIVE_BACKUP_FOLDER_ID` del `.env`. El humano la crea a
  mano con el nombre `backup-control-gastos`.
- **Base de origen** = la base de datos que nombra `DATABASE_URL` (hoy `gastos`).
- **Archivo de copia** = un archivo con la salida de `pg_dump --format=custom`
  de una base entera (todas sus tablas, incluida `_prisma_migrations`).
- **Base con tablas** = una base de datos que tiene al menos una tabla en el
  esquema `public`.
- **Base destino** = la base de datos, del mismo PostgreSQL que la base de
  origen, cuyo nombre recibe `db:restore` como segundo argumento.

## R1
CUANDO el humano ejecuta `pnpm run db:backup`, el sistema DEBE crear en la
carpeta de copias un archivo nuevo llamado `control-gastos-AAAA-MM-DD-HHMMSS.dump`
(fecha y hora locales del momento de la ejecución) cuyo contenido es un archivo
de copia de la base de origen.

## R2
CUANDO el archivo de copia ha quedado guardado en la carpeta de copias, el
sistema DEBE terminar con código 0 habiendo impreso el nombre del archivo, el
tamaño que Drive dice haber guardado y el nombre de la carpeta.

## R3
El sistema NO DEBE borrar, mover, renombrar ni sustituir ningún archivo que ya
esté en la carpeta de copias, en ninguno de los dos comandos.

## R4
SI la carpeta de copias no se puede localizar (la variable no está definida, el
identificador no corresponde a nada que la cuenta vea, no es una carpeta o está
en la papelera) ENTONCES `pnpm run db:backup` DEBE terminar con código distinto
de 0, con un mensaje que dice cuál de esas causas es, sin haber subido ningún
archivo y sin imprimir que la copia está hecha.

## R5
SI la obtención del archivo de copia falla, la subida falla, o el tamaño que
Drive dice haber guardado no coincide con el número de bytes enviados ENTONCES
`pnpm run db:backup` DEBE terminar con código distinto de 0, con un mensaje que
dice qué paso falló, sin imprimir que la copia está hecha.

## R6
El sistema NO DEBE escribir el contenido de un archivo de copia en ningún
archivo del disco (ni del repositorio ni del directorio temporal del sistema),
en ninguno de los dos comandos.

## R7
CUANDO el humano ejecuta `pnpm run db:restore <nombre-del-archivo> <base>` y la
base destino no existe o no es una base con tablas, el sistema DEBE dejar en la
base destino las mismas tablas, con el mismo número de filas en cada una, que
tenía la base de origen cuando se hizo ese archivo de copia.

## R8
CUANDO una restauración termina, el sistema DEBE imprimir el nombre de la base
destino y el número de filas de cada una de sus tablas.

## R9
SI la base destino es una base con tablas ENTONCES el sistema NO DEBE
modificarla salvo que el humano escriba el nombre exacto de esa base en el
terminal cuando el comando se lo pide (no existe argumento que lo sustituya, y
si la entrada del comando no es un terminal el comando no pregunta).

## R10
CUANDO el humano ha escrito el nombre de una base destino con tablas, el sistema
DEBE conservar esa base, con todo su contenido, bajo el nombre
`<base>_before_restore_<AAAAMMDDHHMMSS>`, y dejar el contenido del archivo de
copia bajo el nombre de la base destino.

## R11
CUANDO el humano ejecuta `pnpm run db:restore` sin argumentos, el sistema DEBE
imprimir los archivos de la carpeta de copias (nombre, tamaño y fecha de
subida), del más reciente al más antiguo, sin crear ni modificar ninguna base.

## R12
SI una restauración no puede completarse (el nombre no corresponde a
exactamente un archivo de la carpeta de copias, el archivo no es un archivo de
copia válido, el nombre de la base destino no es válido, la confirmación de R9
no se da, o la base destino está en uso al ir a renombrarla) ENTONCES el
sistema DEBE terminar con código distinto de 0 dejando como estaban todas las
bases de datos que existían antes de ejecutar el comando.

## R13
El sistema NO DEBE hacer ni restaurar una copia desde ningún sitio que no sean
esos dos comandos de terminal: ninguna ruta de la API, ni el arranque del
servidor, ni la importación, ni ningún otro módulo de `src/` importan el código
de la copia.

## R14
MIENTRAS `GOOGLE_DRIVE_BACKUP_FOLDER_ID` no está definida, el sistema DEBE
cargar la configuración sin error (el servidor arranca y la suite pasa igual
que antes de esta feature).

## R15
El documento `docs/database-backup.md` DEBE explicar paso a paso cómo preparar
la carpeta de copias, cómo hacer una copia, cómo ver las copias que hay, cómo
restaurar una en una base nueva y cómo restaurar sobre la base de origen.

---

## Procedencia

- R1 — (humano) «aparece en la carpeta backup-control-gastos de Drive un archivo
  nuevo con la fecha y la hora en el nombre». El formato del archivo
  (`pg_dump --format=custom`, obtenido dentro del contenedor) y el patrón exacto
  del nombre son (delegado, «el formato del archivo de la copia y cómo se
  hace»). Alternativa descartada: SQL en texto plano (legible, pero varias veces
  más grande y se restaura con otra herramienta).
- R2 — (humano) «el comando me dice su nombre y su tamaño». Que diga también el
  nombre de la carpeta es (añadido), menor: es la forma de que vea que el
  identificador del `.env` apunta a la carpeta que él cree.
- R3 — (humano) «crea otro archivo y no borra ni sustituye los anteriores», y
  (delegado, «si se borran alguna vez las copias antiguas»): decido que nunca.
  ← REVISAR EN APROBACIÓN.
- R4 — (humano) «Si la carpeta de Drive no existe… falla con un mensaje claro y
  no dice que la copia está hecha». Que la carpeta se localice por un
  identificador en el `.env` y no por su nombre es (delegado). ← REVISAR EN
  APROBACIÓN.
- R5 — (humano) «…o no se puede subir». Comparar el tamaño guardado con el
  enviado es (añadido): es la única comprobación barata de que lo subido es lo
  que se generó.
- R6 — (humano) «No quiero que la copia se quede guardada en mi ordenador ni
  dentro del repositorio». Que no haya ni archivo intermedio es (delegado):
  la base ocupa 9310 kB (medido el 2026-10-02), cabe en memoria.
- R7 — (humano) «Puedo restaurar una copia en una base de datos vacía y quedan
  las mismas tablas con el mismo número de filas». Que la base destino sea un
  argumento obligatorio y que se cree si no existe es (delegado, «cómo se elige…
  a qué base de datos»).
- R8 — (añadido) El humano no dijo qué imprime el comando de restaurar. Sin el
  recuento por tabla no tiene cómo ver, sin abrir la base, que quedó lo mismo.
- R9 — (humano) «El comando de restaurar no pisa mi base de datos de verdad sin
  que yo lo confirme de forma explícita» y «no quiero que ningún test ni ningún
  agente restaure sobre mi base de datos de verdad». La forma de la confirmación
  (escribir el nombre en el terminal, sin argumento que la salte) es (delegado).
  ← REVISAR EN APROBACIÓN.
- R10 — (añadido) El humano no dijo qué pasa con lo que había en la base al
  confirmar. Propongo no borrarlo: queda con otro nombre y lo borra él.
  ← REVISAR EN APROBACIÓN.
- R11 — (delegado) «Cómo se elige qué copia restaurar»: por el nombre exacto del
  archivo; sin argumentos, el comando las lista. Alternativa descartada: «la más
  reciente» por defecto.
- R12 — (añadido) Casos de error de la restauración que el humano no recorrió.
  Una sola regla para todos: nada de lo que existía cambia.
- R13 — (humano) «No quiero que la copia se haga sola: ni al importar ni con
  ningún temporizador» y «no quiero ninguna ruta nueva en la API».
- R14 — (añadido) Consecuencia de añadir la variable: la hago opcional para que
  el servidor y la suite no dependan de que la carpeta exista.
- R15 — (humano) «Hay un documento que explica paso a paso cómo hacer la copia y
  cómo restaurarla».
