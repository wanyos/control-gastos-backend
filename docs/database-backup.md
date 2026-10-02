# Copia de la base de datos en Google Drive y cómo restaurarla

> Feature 55 `db-backup` (2026-10-02). Decisiones y porqués: ADR-034 de
> [`architecture.md`](./architecture.md).
>
> Son **dos comandos de terminal** que lanzas tú, cuando tú quieres, desde la
> carpeta `gastos-backend/`:
>
> | Comando | Qué hace |
> |---|---|
> | `pnpm run db:backup` | Saca una copia completa de la base de datos y la sube, como un archivo nuevo, a tu carpeta `backup-control-gastos` de Drive |
> | `pnpm run db:restore` | Sin argumentos, enseña las copias que hay en esa carpeta |
> | `pnpm run db:restore <archivo> <base>` | Restaura esa copia en la base de datos que le digas |
>
> Nada de esto se hace solo: ni al importar, ni al arrancar el servidor, ni con un
> temporizador. Tampoco hay ninguna ruta de la API para ello.
>
> Los nombres de archivo, los tamaños, los identificadores y los recuentos de filas
> de los ejemplos de este documento son **inventados**.

## Antes de empezar: lo que hace falta

- **Docker en marcha, con el contenedor `gastos-postgres` arrancado**
  (`docker compose up -d`). La copia se saca y se restaura con los programas
  `pg_dump` y `pg_restore` que hay **dentro** del contenedor; en Windows no hay
  ninguno instalado que el comando pueda usar. Sin Docker, los dos comandos fallan.
- **El archivo `.env`** con las credenciales de Drive que ya usa la importación y,
  además, la variable `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (apartado 1).
- **El servidor (`pnpm run dev`) puede estar arrancado o parado** para hacer una
  copia, para ver las copias y para restaurar en una base nueva. Solo hay que
  pararlo para restaurar sobre la base de verdad (apartado 5).

Si un comando falla con un mensaje que habla de `docker`, del contenedor
`gastos-postgres` o de que «el programa del contenedor terminó con el código…»,
lo primero es comprobar que Docker está en marcha y lanzar `docker compose up -d`.

## 1. Preparar la carpeta

Se hace **una sola vez**.

1. En Google Drive, en «Mi unidad», crea una carpeta llamada
   `backup-control-gastos`.

   ⚠️ **Tiene que estar FUERA de `notas-banco/`.** Todo lo que cuelga de
   `notas-banco/` es un banco para la importación: si la carpeta de copias
   estuviera dentro, la importación la tomaría por un banco más.

2. Abre esa carpeta en el navegador y copia su dirección de la barra de
   direcciones. Tiene esta forma (el identificador de este ejemplo es inventado):

   ```
   https://drive.google.com/drive/folders/1QxZ7kLm3TnVb8RwYs2HdPf4JcUe6Ga9Bo
   ```

   El **identificador** de la carpeta es lo que va detrás de `/folders/`:
   `1QxZ7kLm3TnVb8RwYs2HdPf4JcUe6Ga9Bo`.

3. En el archivo `.env`, pon esa dirección entera **o** solo el identificador.
   Valen las dos formas:

   ```
   GOOGLE_DRIVE_BACKUP_FOLDER_ID=https://drive.google.com/drive/folders/1QxZ7kLm3TnVb8RwYs2HdPf4JcUe6Ga9Bo
   ```

   ```
   GOOGLE_DRIVE_BACKUP_FOLDER_ID=1QxZ7kLm3TnVb8RwYs2HdPf4JcUe6Ga9Bo
   ```

   ❌ **El nombre de la carpeta NO sirve.** Esto está mal:

   ```
   GOOGLE_DRIVE_BACKUP_FOLDER_ID=backup-control-gastos
   ```

   El comando busca la carpeta por su identificador, no por su nombre. Con el
   nombre, el servidor arranca igual (un nombre sin espacios no se distingue de
   un identificador al leer el `.env`), pero los dos comandos fallan sin sacar ni
   subir nada. En las pruebas, con un Drive simulado, el mensaje es este; qué
   responde el Drive de verdad a un nombre no se ha comprobado, pero en todos
   los casos el comando termina con error y el mensaje acaba con la misma frase
   sobre el identificador o la dirección:

   ```
   La copia NO está hecha.
   No se puede localizar la carpeta de copias: lo que hay en GOOGLE_DRIVE_BACKUP_FOLDER_ID no existe en Drive o esta cuenta no lo ve. GOOGLE_DRIVE_BACKUP_FOLDER_ID tiene que llevar el identificador de la carpeta o su dirección completa (https://drive.google.com/drive/folders/<identificador>), no su nombre.
   ```

   **Si en tu `.env` pusiste el nombre, cámbialo** por la dirección o por el
   identificador.

Otras cosas que conviene saber de esa variable:

- **Es opcional para el servidor.** Si la línea no está, el servidor y la suite
  funcionan igual; solo fallan estos dos comandos, diciendo que falta.
- **Una línea sin valor (`GOOGLE_DRIVE_BACKUP_FOLDER_ID=`) o con espacios impide
  arrancar el servidor.** O lleva un valor, o se quita la línea entera. Con el
  `.env` así, los dos comandos terminan con error sin llamar a Drive ni tocar
  ninguna base, e imprimen el problema de configuración, que está en inglés y
  nombra la variable (lo mismo pasa si falta una de las variables obligatorias
  del `.env`). `pnpm run db:backup` pone delante `La copia NO está hecha.`;
  `pnpm run db:restore` imprime solo el problema. Con un nombre de carpeta con
  espacios (el de este ejemplo es inventado), `db:backup` imprime:

  ```
  La copia NO está hecha.
  Invalid environment configuration:
  - GOOGLE_DRIVE_BACKUP_FOLDER_ID must be a bare Drive folder id or a folder URL (not the folder name), got 'copias de prueba'; remove the line if the backup commands are not used
  ```
- Si la carpeta está en la papelera de Drive, o el identificador es de un archivo
  y no de una carpeta, los comandos fallan diciendo cuál de las dos cosas pasa.

## 2. Hacer una copia

Con Docker en marcha:

```
pnpm run db:backup
```

Si todo va bien, imprime cuatro líneas y termina sin error:

```
Copia hecha y guardada en Drive.
  Archivo: control-gastos-2026-03-14-090507.dump
  Tamaño guardado en Drive: 403,1 kB (412 733 bytes)
  Carpeta: backup-control-gastos
```

- **El nombre del archivo lleva la fecha y la hora de tu ordenador** en el momento
  de lanzar el comando: `control-gastos-AAAA-MM-DD-HHMMSS.dump`.
- **La línea «Carpeta» es el nombre que tiene en Drive la carpeta del `.env`.** Si
  no es `backup-control-gastos`, el identificador apunta a otra carpeta.
- **Cada vez que lo lanzas se añade un archivo nuevo.** Los anteriores no se
  borran, no se sustituyen y no se renombran.
- **La copia no pasa por el disco de tu ordenador:** va del contenedor a Drive por
  la memoria del programa. No queda ningún archivo ni en el repositorio ni en una
  carpeta temporal.
- **Lleva todas las tablas**, también la de migraciones de Prisma
  (`_prisma_migrations`), y sube **sin cifrar**, igual que los archivos de banco
  que ya tienes en Drive.

**Si algo falla, la primera línea es siempre `La copia NO está hecha.`** y debajo
va el motivo: el `.env` está mal escrito (apartado 1), falta la variable, la
carpeta no se encuentra, no se pudo obtener la copia de la base, o no se pudo
subir. Hay un caso aparte: si Drive dice haber
guardado un tamaño distinto del que se envió, el archivo **puede estar en la
carpeta** pero no es fiable; el mensaje te dice su nombre para que lo revises y
vuelvas a lanzar el comando.

## 3. Ver las copias que hay

```
pnpm run db:restore
```

Sin argumentos, el comando **no restaura nada ni toca ninguna base de datos**:
lista los archivos de la carpeta, del más reciente al más antiguo, con su tamaño y
la fecha y hora en que se subieron, y recuerda cómo se usa:

```
Copias que hay en la carpeta, de la más reciente a la más antigua:
  control-gastos-2026-03-14-090507.dump  403,1 kB (412 733 bytes)  subida el 2026-03-14 09:05
  control-gastos-2026-02-27-214412.dump  398,6 kB (408 166 bytes)  subida el 2026-02-27 21:44

Uso:
  pnpm run db:restore                     lista las copias que hay en la carpeta de Drive
  pnpm run db:restore <archivo> <base>    restaura esa copia en esa base de datos
```

Si la carpeta está vacía, dice `La carpeta de copias no tiene ningún archivo.`

De aquí se copia el nombre del archivo para los dos apartados siguientes: hay que
escribirlo **exacto y entero**, con su `.dump`. No existe «la más reciente» por
defecto: siempre eliges tú cuál.

## 4. Restaurar en una base nueva

Es la forma de **comprobar que una copia sirve** sin tocar tu base de verdad: se
restaura en una base aparte, se mira y se borra.

```
pnpm run db:restore control-gastos-2026-03-14-090507.dump gastos_restore_check
```

- El primer argumento es el nombre del archivo; el segundo, el nombre de la base
  de destino. Hacen falta los dos.
- **Si la base de destino no existe, el comando la crea.** Si existe pero no tiene
  ninguna tabla, restaura dentro. En ninguno de los dos casos pregunta nada.
- El nombre de la base tiene que empezar por una letra minúscula y llevar solo
  minúsculas, números y guiones bajos, 30 caracteres como mucho.
- **`postgres`, `template0` y `template1` no valen como destino:** son las bases
  internas de PostgreSQL y el comando las rechaza. Termina con error antes de
  hacer nada (no descarga la copia ni ejecuta nada en el contenedor), con este
  mensaje:

  ```
  La base «template1» es interna de PostgreSQL y no se puede usar como destino de una restauración: elige otro nombre. No se ha tocado nada.
  ```

Al terminar imprime la base y **las filas de cada tabla**:

```
Copia restaurada en la base «gastos_restore_check».
Filas de cada tabla:
  Account: 6
  Category: 43
  CategoryRule: 58
  ImportBalanceMismatch: 3
  ImportUnparsedRow: 9
  InvestmentProduct: 7
  Movement: 1873
  SavingsSnapshot: 14
  Valuation: 96
  _prisma_migrations: 11
```

**Para comparar con tu base de verdad**, este comando imprime las filas de cada
tabla de `gastos` (solo lee; va en una sola línea y vale igual en PowerShell y en
Git Bash):

```
docker exec gastos-postgres psql -U postgres -d gastos -Atc "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text::int from information_schema.tables where table_schema = 'public' order by 1"
```

Sale una línea por tabla, con la forma `Movement|1873`. Si la copia es de hace un
rato y no has importado nada desde entonces, los números tienen que coincidir
tabla a tabla.

**Cuando hayas terminado de mirar, borra la base de comprobación:**

```
docker exec gastos-postgres dropdb -U postgres gastos_restore_check
```

Si la restauración falla (el nombre no es de ningún archivo de la carpeta, el
archivo no es una copia válida, el nombre de la base no vale), el comando termina
con error y **todas las bases quedan como estaban**; la base que hubiera creado él
mismo la borra. Si el nombre del archivo no coincide con ninguno, el mensaje
incluye la lista de las copias que sí hay.

## 5. Restaurar sobre la base de verdad

Esto **sustituye el contenido de `gastos`** por el de una copia. Lo que había no
se borra: se queda guardado con otro nombre.

1. **Para el servidor** (`pnpm run dev`) y cualquier otro programa conectado a la
   base (Prisma Studio, un cliente de PostgreSQL). Con algo conectado, el comando
   espera unos segundos, falla con este mensaje y tu base queda como estaba:

   ```
   No se ha podido renombrar la base «gastos» a «gastos_before_restore_20260314101530»: la base de datos está en uso. Para `pnpm run dev` y cualquier otro programa conectado a ella, y vuelve a lanzar el comando.
   ```

2. Lanza el comando **desde un terminal, escribiéndolo tú**:

   ```
   pnpm run db:restore control-gastos-2026-03-14-090507.dump gastos
   ```

3. Como `gastos` ya tiene tablas, el comando **se para y pregunta**:

   ```
   La base «gastos» ya tiene tablas. Si sigues, su contenido se sustituye por el de la copia y lo que hay ahora se conserva entero en la base «gastos_before_restore_20260314101530».
   Para seguir, escribe el nombre de la base (gastos) y pulsa Intro. Cualquier otra cosa cancela:
   ```

   Escribe `gastos` y pulsa Intro. Cualquier otra cosa (nada, otro nombre, el
   nombre con una mayúscula o un espacio) cancela con
   `Lo que has escrito no es el nombre de la base «gastos»: no se ha tocado nada.`

   **No hay ninguna opción de la línea de comandos que sustituya a escribir el
   nombre.** Y si el comando no se lanza desde un terminal (lo lanza un script o
   un agente), ni siquiera pregunta: se niega, diciendo que no se ha lanzado
   desde un terminal y que no se ha tocado nada.

4. Al terminar imprime lo mismo que en el apartado 4 y una línea más, con el
   nombre bajo el que queda lo que había:

   ```
   Copia restaurada en la base «gastos».
   Filas de cada tabla:
     Account: 6
     …
   Lo que había antes en «gastos» se conserva entero en la base «gastos_before_restore_20260314101530».
   ```

   El nombre es `gastos_before_restore_` seguido de la fecha y la hora
   (`AAAAMMDDHHMMSS`) de cuando lanzaste el comando.

5. Arranca el servidor otra vez (`pnpm run dev`) y comprueba que ves lo que
   esperabas.

6. **La base anterior no se borra sola.** Cuando estés seguro de que no la
   necesitas, bórrala tú, con el nombre exacto que imprimió el comando:

   ```
   docker exec gastos-postgres dropdb -U postgres gastos_before_restore_20260314101530
   ```

   Para ver cuántas de esas bases tienes acumuladas:

   ```
   docker exec gastos-postgres psql -U postgres -Atc "select datname from pg_database where datname like '%before_restore%'"
   ```

**Por qué una restauración que falla no rompe nada:** la copia se restaura primero
en una base aparte (`gastos_restore_<fecha y hora>`). Solo si eso termina bien se
renombra `gastos` a `gastos_before_restore_…` y la base nueva pasa a llamarse
`gastos`. Si la copia no es válida, tu base ni se entera.

Después de una restauración, la base anterior sigue entera con su nombre
`gastos_before_restore_…` hasta que la borres. Ninguno de los dos comandos le
devuelve el nombre `gastos`.

### En un ordenador nuevo (o con el contenedor recién creado)

1. Recrea el archivo `.env` (ver la nota de abajo: no va en la copia) y lanza
   `pnpm install`.
2. `docker compose up -d`. El contenedor crea la base `gastos` **vacía, sin
   tablas**.
3. **Antes** de `pnpm run prisma:migrate`, restaura:

   ```
   pnpm run db:restore control-gastos-2026-03-14-090507.dump gastos
   ```

   Como la base no tiene tablas, el comando **no pide confirmación** y no deja
   ninguna base `gastos_before_restore_…`. Si lanzaras antes
   `pnpm run prisma:migrate`, la base ya tendría tablas y el comando te pediría
   escribir su nombre, como en los pasos de arriba.

## Dos notas

**Lo que NO va en la copia:**

- **El archivo `.env`.** Si se rompe el disco, las credenciales de Drive
  (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
  `GOOGLE_DRIVE_REFRESH_TOKEN`) y los dos identificadores de carpeta hay que
  volver a sacarlos. Sin ellas no se puede ni descargar una copia.
- **Los archivos de banco.** Esos ya viven en Drive, en `notas-banco/`; la copia
  lleva solo la base de datos.

**Las copias antiguas se borran a mano.** El código no borra nunca nada de la
carpeta `backup-control-gastos`: cada copia es un archivo más. Las que sobren las
borras tú en Drive. Lo mismo con las bases `gastos_before_restore_…` del
contenedor (paso 6 del apartado 5).

**Un límite:** los dos comandos trabajan siempre sobre el contenedor
`gastos-postgres` de este ordenador. El día que la base de datos viva en otro
sitio habrá que revisarlos (ADR-034).
