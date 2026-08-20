# Diagnóstico — Bankinter parsea pero no está en la base de datos (2026-08-20)

> Exploración de solo lectura. No se ha ejecutado `POST /api/import` ni
> `POST /api/ingestion/process`, no se ha tocado Drive y no se ha escrito nada
> en la base de datos. Sin datos reales: solo recuentos y forma (ADR-017).

## 0. El síntoma, medido

- `POST /api/parser/bankinter` parsea la copia local sin un fallo: 1 fichero,
  **39 movimientos**, 0 filas sin parsear, IBAN leído.
- En la base de datos hay **3 cuentas** (myinvestor, n26, openbank) y **416
  movimientos** = 204 + 201 + 11. **De Bankinter no hay ni cuenta ni movimiento.**
- `GET /api/ingestion/pending` → **8 pendientes**: 5 `.json` de myinvestor,
  1 `.csv` de revolut, 2 de trade-republic. **Bankinter no aparece.**
- `bankinter` **sí** está en el registro de parsers
  ([`src/app.ts:42`](../../src/app.ts#L42), `extensions: ['.xlsx']`).
- Existe la copia local en `var/drive-read/bankinter/2026/` (1 fichero).

## 1. La causa: el fichero se movió a `procesados/` un mes antes de que existiera la persistencia

**No es un `migrate reset`. Es un artefacto histórico del endpoint de ingesta.**

### 1.1 El orden de hoy es correcto y no permite el fallo

[`importFile`](../../src/modules/import/import.service.ts#L214) hace, en este
orden estricto y dentro de un único `try`:

1. `downloadFileContent`
2. copia cruda local (`rawCopyBaseDir`, por defecto `var/drive-read/`)
3. `adapter.parse`
4. `resolveAccount`
5. `persistMovements` (`createMany` + `skipDuplicates`)
6. **y solo entonces** `moveFileToProcessed`

Cualquier excepción en 1–5 salta al `catch`, marca el fichero `failed`,
`movedToProcessed: false` y **no mueve nada**: el fichero sigue pendiente en
Drive y se puede reintentar. Está cubierto por dos tests explícitos:
[`import.service.test.ts:494`](../../src/modules/import/import.service.test.ts#L494)
(«moves the file to procesados only after its movements are stored (R9)») y
[`:532`](../../src/modules/import/import.service.test.ts#L532) («does not move a
file whose import failed and goes on with the rest (R10)»). **Con el código de
hoy, un fichero no puede acabar movido sin que sus movimientos se hayan
guardado** —salvo el caso del §1.4.

### 1.2 El código de ayer sí lo permitía

`POST /api/ingestion/process` **movía el original a `procesados/` sin base de
datos ninguna**. Está en el commit de la feature 5:

- `d66378f feat(drive-read): leer archivos de banco desde Drive y moverlos a
  procesados (feature 5)` — 2026-08-04. En esa versión,
  `src/modules/ingesta/ingesta.service.ts:104` llamaba a `moveFileToProcessed`
  después de escribir la copia local. El propio mensaje de commit lo dice:
  «descarga tal cual, guarda copia local gitignoreada y **mueve el original a
  procesados/**».
- El movimiento desaparece del servicio de ingesta en `c3db02f` (renombrado
  `ingesta` → `ingestion`, en el tren de la feature 12). El
  `ingestion.service.ts` actual ya no importa `moveFileToProcessed` y lo declara
  en su comentario: «It does NOT move anything in Drive: a file only reaches
  `procesados/` once its movements are stored, which is the importer's job».
- El mensaje de `c0415c0` (feature 12, 2026-08-12) lo llama por su nombre: «Eso
  cierra el cabo suelto nº1: "procesado" pasa a significar "guardado en la base
  de datos", no "descargado"».

### 1.3 La fecha exacta, escrita en el histórico

[`progress/history.md:444`](../history.md) — smoke real Nivel 3 de la feature 5,
**2026-08-04**:

> `pending` detectó el `.xlsx` de `bankinter/2026/`, `process` lo descargó (copia
> local de 8.548 bytes), **lo movió a `procesados/`** y `pending` volvió a 0.

Ese día:

- no existía el modelo de datos (feature 8, migración `20260806191700_data_model`,
  **2026-08-06**),
- no existía el importador (feature 12, `c0415c0`, **2026-08-12**),
- ni siquiera existía todavía el parser de Bankinter (feature 6, más tarde ese
  mismo día).

Es decir: **el fichero salió de la carpeta de pendientes cuando no había ninguna
línea de código capaz de escribir un `Movement`.** Desde entonces el importador
nunca lo ha visto, porque `listPendingFiles` solo mira los hijos directos de la
carpeta del año que no son carpetas, y él vive dentro de `procesados/`.

### 1.4 La trampa que SÍ sigue viva hoy

[`persistMovements`](../../src/modules/import/import.service.ts#L153) devuelve
`{ imported: 0, duplicates: 0 }` **sin tocar la base de datos** cuando `rows`
está vacío, y `importFile` continúa: resuelve la cuenta, **mueve el fichero a
`procesados/`** y lo reporta como `imported` con `imported: 0`. Un parser que un
día devuelva **cero movimientos en silencio** (formato del banco cambiado, hoja
renombrada, mes vacío) hace exactamente lo que pasó en agosto: el fichero sale de
pendientes y no queda nada guardado. No hay test que lo prohíba
([`import.service.test.ts:183`](../../src/modules/import/import.service.test.ts#L183)
solo comprueba el mapeo vacío, no el movimiento). Es el mismo agujero, más
estrecho.

### 1.5 Se descarta el reset de la base de datos

- El único `prisma migrate reset --force` del histórico es de **2026-07-10**
  ([`history.md:31`](../history.md)), un mes antes, por la migración del dominio
  a inglés — y entonces no había ni un dato de banco.
- La otra mención a resetear ([`current.md:786`](../current.md)) dice
  literalmente lo contrario: «**No hace falta resetear la base de datos**».
- `git log --oneline --all -- prisma/` son 5 commits, todos de esquema, ninguno
  de borrado de datos.
- Los ids de cuenta altos (cinco cifras) **no** son rastro de un borrado: la
  suite corre contra la **misma** base de datos de desarrollo (`vitest.config.ts`
  carga `dotenv/config` y `.env` trae el `DATABASE_URL` real) y los tests de
  integración crean y borran cuentas por id
  ([`accounts.test.ts:32`](../../src/modules/accounts/accounts.test.ts#L32)).
  Cada `pnpm test` consume secuencia. Es ruido esperado, no una amputación.

## 2. ¿Hay vía de vuelta? **No, ninguna, sin tocar Drive a mano**

Revisado endpoint por endpoint:

- `GET /api/ingestion/pending` y `POST /api/ingestion/process` recorren
  `listBankFolders → listYearFolders → listPendingFiles`.
  [`listPendingFiles`](../../src/lib/drive-structure.ts#L407) filtra
  `mimeType != folder` entre los **hijos directos del año**: lo que está dentro de
  `procesados/` es hijo de `procesados/`, no del año. **Queda excluido para
  siempre, sin excepción ni parámetro.**
- `POST /api/import` no acepta cuerpo, ni `fileId`, ni ruta, ni bandera: la ruta
  ([`import.routes.ts`](../../src/modules/import/import.routes.ts)) registra un
  `POST /` a secas que llama a `importPending`, que solo recorre pendientes.
  `rawCopyBaseDir` es inyectable, pero **solo como destino de escritura**, nunca
  como origen.
- No existe ningún endpoint que lea `procesados/`, ni que liste su contenido, ni
  que devuelva un fichero de ahí.
- `POST /api/parser/bankinter` **sí** lee la copia local de `var/drive-read/`,
  pero es de solo lectura por diseño: parsea y vuelca un JSON a `var/parsed/`.
  **No toca la base de datos.**
- `POST /api/accounts` existe, pero **no hay `POST /api/movements`**:
  `movements.routes.ts` solo registra un `GET /`. No hay forma de meter un
  movimiento por la API, ni siquiera manual.

**Conclusión, sin adornos: `procesados/` es una puerta de un solo sentido. Un
fallo del importador que llegue al paso 6 es irreversible sin intervención manual
en Drive.** El fichero no se pierde (sigue en Drive, y hay copia local), pero el
sistema, por sí solo, no tiene ninguna forma de volver a mirarlo.

## 3. Opciones, de menos a más invasiva

### (a) El humano mueve el fichero en Drive de `procesados/` a `<banco>/<año>/`, y luego `POST /api/import`

- **Qué hay que implementar:** nada.
- **Coste:** un arrastre en la web de Drive + una llamada.
- **Duplicados:** ninguno. Bankinter tiene **0 movimientos** en la base, así que
  no hay contra qué duplicar. La cuenta se crea sola desde el IBAN del fichero
  (`findOrCreateAccountFromMetadata`), que es el único camino que crea cuentas.
- **`daySequence`:** [`assignDaySequence`](../../src/lib/parsed-statement.ts#L108)
  numera **por fichero y por día**, y Bankinter es `newest-first`. Como se importa
  el fichero entero, la numeración es determinista y reproducible.
- **Deduplicación:** el índice único **parcial** `Movement_imported_dedup_key`
  sobre `(accountId, bookingDate, type, amount, description, daySequence)
  WHERE origin = 'imported'`
  (`prisma/migrations/20260806191700_data_model/migration.sql:106`), aplicado vía
  `createMany({ skipDuplicates: true })`. Reimportar el mismo fichero es
  idempotente y está testeado
  ([`import.service.test.ts:431`](../../src/modules/import/import.service.test.ts#L431)).
  Incluso si el humano **copia** en vez de mover y el fichero acaba importándose
  dos veces, el índice lo absorbe.
- **Riesgo:** bajo. El único cuidado: mover, no dejar dos copias sueltas.
  Renombrarlo no rompe nada (el nombre no entra en la clave de dedup).
- **Lo que NO arregla:** la puerta sigue siendo de un solo sentido la próxima vez.

### (b) Una vía de reimportación desde la copia local ya existente

Ya está todo el material: `var/drive-read/<banco>/<año>/` guarda el mismo
contenido que se descargó, y el registro de parsers de `app.ts` ya sabe qué
parser va con qué carpeta.

- **Qué hay que implementar:** una ruta nueva (p. ej. `POST /api/import/local`,
  con banco/año opcionales) que recorra `rawCopyBaseDir`, aplique
  `normalizeBankName` al nombre de la carpeta y reutilice `selectAdapter`,
  `resolveAccount`, `toMovementRows` y `persistMovements` — es decir, `importFile`
  **sin los pasos 1, 2 y 6**: sin Drive, sin descarga y **sin mover nada**.
  Extraer una función común y una ruta: una feature pequeña.
- **Duplicados:** ninguno, por el mismo índice parcial. Y como no mueve nada, es
  segura de ejecutar tantas veces como haga falta.
- **`daySequence`:** idéntico al caso (a): mismo fichero, misma numeración.
- **Riesgo:** medio-bajo. Punto delicado 1: el nombre de la carpeta local es el
  nombre de la carpeta de **Drive**, no el slug (`N26` vs `n26`);
  `normalizeBankName` lo resuelve, pero hay que hacerlo explícito y testearlo.
  Punto delicado 2: la copia local está gitignoreada y puede no existir (se
  sobrescribe con dos pendientes homónimos, límite ya conocido de la f5); hay que
  reportar «no hay copia local» como fallo claro y no como éxito de 0 ficheros.
- **Lo que arregla de más:** cierra la puerta de un solo sentido para **todos** los
  bancos y para el caso del §1.4, y no depende de que el humano recuerde cómo
  funciona `procesados/`.

### (c) Reimportar desde `procesados/` por API (bandera o endpoint)

- **Qué hay que implementar:** un `listProcessedFiles(client, yearFolderId)`
  (resolver `procesados/` con `findFolder`, que ya existe, y listar sus hijos) y un
  modo de importación que la use y **no mueva** (el fichero ya está en su sitio).
- **Duplicados / `daySequence`:** iguales que (a) y (b); el índice parcial cubre.
- **Riesgo:** el más alto de los tres. Reintroduce en el importador la idea de
  «volver a mirar lo ya procesado», que es justo lo que la feature 12 quitó, y abre
  la puerta a reimportar en masa sin querer. Si se hace, debería ser explícito por
  banco/año y nunca el comportamiento por defecto.

### (d) Escribir los 39 movimientos a mano en la base de datos — **descartada**

Saltaría `toMovementRows` (el mapeo de `specs/data-model/design.md` §9: importe
como string, fechas `T00:00:00.000Z`, `origin: 'imported'`,
`status: 'pending_review'`), la creación de cuenta con IBAN validado y el
`daySequence`. Es exactamente el atajo que el índice parcial y el
`MissingAccountDataError` están ahí para evitar.

### (e) Independiente de todo lo anterior: tapar el §1.4

Que un fichero con **cero movimientos parseados** no se mueva a `procesados/` y se
reporte como fallo (o al menos `skipped`) de ese fichero, con su test. Es una
condición y evita que la misma historia se repita con otro banco dentro de seis
meses, esta vez sin un histórico que lo explique.

## 4. ¿Es Bankinter un caso único?

**Como víctima consumada, sí. Como trampa, no del todo.**

- La ventana en la que `process` movía sin guardar estuvo abierta del
  **2026-08-04** (`d66378f`) al tren de la **feature 12** (`c3db02f` / `c0415c0`,
  2026-08-12). En esa ventana **solo se ejecutó `process` una vez contra el Drive
  real**, el smoke del 2026-08-04, y en Drive **solo había el fichero de
  Bankinter** (`pending` lo detectó a él y volvió a 0). La otra ejecución
  registrada, [`prueba-drive-real-2026-08-15.md:26`](../prueba-drive-real-2026-08-15.md)
  (4 copiados, 1 fallido), es **posterior** al arreglo: no movió nada.
- La cuadratura lo confirma: 204 + 201 + 11 = 416, el total de la base. No falta
  ningún otro banco.
- Los bancos sin parser en el registro (**revolut**) o sin extracto que importar
  (**trade-republic**, ADR-024) se reportan `skipped`, **no se mueven** y siguen
  pendientes: `selectAdapter` devuelve `reason` y se sale antes de `importFile`
  (testeado en
  [`import.service.test.ts:649`](../../src/modules/import/import.service.test.ts#L649)).
  Ahí no hay trampa.
- Pero la trampa genérica sigue en pie por partida doble: (1) el fichero que
  parsea a cero movimientos del §1.4, y (2) el hecho de que **cualquier** cosa que
  llegue a `procesados/` —el importador, o un arrastre accidental del humano en
  Drive— desaparece del sistema para siempre. Le puede pasar a cualquier banco.

## 5. Recomendación

1. **Ahora:** (a). Cuesta cero, desbloquea hoy, la deduplicación y el
   `daySequence` lo cubren y no hay ningún movimiento de Bankinter contra el que
   duplicar.
2. **Después, como feature:** (b), la reimportación desde la copia local, junto con
   (e). Es lo que convierte «un fallo del importador es irreversible» en «un fallo
   del importador se reintenta».
