# Resumen — feature 53 `product-file-collision`

Fecha de cierre: 2026-10-02
Intención original: `feature_list.json` → feature `product-file-collision`, bloque `intent`
Spec: `specs/53-product-file-collision/`

## Qué hace ahora la app que antes no

Cuando en una misma llamada a `POST /api/import` hay dos archivos de producto con
el mismo banco, el mismo `name` y la misma `date`, el primero se guarda y el
segundo se rechaza con el código `DUPLICATE_PRODUCT_FILE`: no se guarda nada de
él, se queda en Drive sin moverse a `procesados/` y el informe dice con qué
archivo coincide y en qué carpeta de año está. Antes, el segundo sustituía el
valor que acababa de guardar el primero y los dos salían como importados.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/import` — la ruta, que no ha cambiado | [import.routes.ts:47](../../src/modules/import/import.routes.ts#L47) |
| `importPending` — crea la lista en memoria de lo que cada archivo ha guardado en esta llamada | [import.service.ts:350](../../src/modules/import/import.service.ts#L350) |
| `importProductFile` — compara antes de guardar y rechaza | [import.service.ts:576](../../src/modules/import/import.service.ts#L576) |
| `DuplicateProductFileError` — el código `DUPLICATE_PRODUCT_FILE` | [app-error.ts:147](../../src/errors/app-error.ts#L147) |

## Dónde está el código

### La comparación y el rechazo

| Qué hace | Dónde |
| --- | --- |
| Crea un `Map` vacío al empezar cada llamada y se lo pasa, con el nombre de la carpeta de año, a cada archivo de producto | [import.service.ts](../../src/modules/import/import.service.ts) → `importPending` |
| Tras leer el archivo y antes de guardar, mira si otro archivo de esta llamada ya guardó el mismo banco, `name` y `date`; si es así lanza el error con el texto del mensaje. Apunta el archivo solo después de guardarlo | [import.service.ts](../../src/modules/import/import.service.ts) → `importProductFile` |
| Los dos campos opcionales nuevos (`year`, `storedInRun`) | [import.service.ts](../../src/modules/import/import.service.ts) → `ImportProductFileDeps` |
| La clave que se compara: banco de la carpeta, `name` y `date`, carácter a carácter | [import.service.ts](../../src/modules/import/import.service.ts) → `productFileKey` |
| Los tipos del `Map` y de lo que guarda de cada archivo (nombre y carpeta de año) | [import.types.ts](../../src/modules/import/import.types.ts) → `ProductFilesStoredInRun`, `StoredProductFileRef` |
| El error, con código `DUPLICATE_PRODUCT_FILE` y 422; solo viaja dentro de `files[].error` de un 200 | [app-error.ts](../../src/errors/app-error.ts) → `DuplicateProductFileError` |

### Documentos

| Qué dice | Dónde |
| --- | --- |
| El rechazo dentro de `POST /api/import`: párrafo en «Archivos de producto», precisión en «Idempotencia», nota de `importedProductCount` y fila en la tabla de códigos por archivo | [api-contract.md](../../docs/api-contract.md) → `DUPLICATE_PRODUCT_FILE` |
| Decisión nueva, y línea de revisión encima del ADR-026 | [architecture.md](../../docs/architecture.md) → `ADR-033` |
| Nota bajo la tabla que compara qué pasa con un duplicado en movimientos y en inversiones | [data-model.md](../../docs/data-model.md) → «Desde la feature 53» |
| Ya no dice que nadie avisa: el segundo se rechaza; fila nueva en «Qué pasa cuando un archivo está mal» | [myinvestor-product-files.md](../../docs/myinvestor-product-files.md) |
| Lo mismo para la cuenta remunerada | [trade-republic-product-files.md](../../docs/trade-republic-product-files.md) |
| Cabo suelto 21 cerrado, cabo 24 nuevo y abierto, fila E5 con la F53 | [roadmap.md](../../docs/roadmap.md) → «Cabos sueltos» |

### Tests

Los diez primeros están en el bloque `importPending: two product files of one run
declaring the same product and date (feature 53)`.

| Qué cubre | Dónde |
| --- | --- |
| El primero entra, el segundo sale `failed` con el código y un mensaje que nombra el primero y su carpeta | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `rejects the second product file of a run that declares the same bank, name and date, naming the first` |
| Solo se mueve a `procesados/` el primero | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `leaves the rejected product file pending in Drive and moves only the first` |
| En la base quedan los cinco importes del primero, una sola fila y un solo producto | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `keeps the value the first file stored exactly as it stored it` |
| Mismo producto con dos fechas: entran los dos | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `imports two files of the same product with different dates in one run` |
| Una segunda llamada con el archivo corregido sustituye | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `still replaces the value when a corrected file of the same product and date arrives in a later run` |
| `importedProductCount: 1`, `failedCount: 1`, y el rechazado con `product: null` y `snapshot: null` | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `counts only the stored file in importedProductCount and the rejected one in failedCount` |
| El archivo que va después del rechazado se importa y se mueve | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `goes on with the files that come after the rejected one` |
| Si el primero falla (no cuadra), el segundo entra | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `does not hold a file that failed against the next one with the same product and date` |
| Si el primero guardó su valor y Drive no pudo moverlo, el segundo se rechaza igual | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `holds a stored file against the next one even when its move to procesados failed` |
| Entre dos carpetas de año del mismo banco se rechaza; entre dos bancos entran los dos | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `rejects the second file across two year folders of the same bank, and not across two banks` |
| Fondo, con el parser real de MyInvestor: una sola fila de `Valuation`, con el valor del primero | [myinvestor.import.test.ts](../../src/modules/myinvestor/myinvestor.import.test.ts) → `rejects the second file of the same fund and date in one run` |
| Depósito, con el parser real de MyInvestor: el producto conserva el `principal` del primero | [myinvestor.import.test.ts](../../src/modules/myinvestor/myinvestor.import.test.ts) → `rejects the second file of the same deposit and date in one run` |
| El contrato nombra el código y dice que no se guarda ni se mueve | [import.product-files.docs.test.ts](../../src/modules/import/import.product-files.docs.test.ts) → `api-contract: describes the rejection of the second product file of one import` |
| Los dos documentos de archivos de producto dicen que el segundo se rechaza | [import.product-files.docs.test.ts](../../src/modules/import/import.product-files.docs.test.ts) → `product-file documents: say the second file is rejected, not that nobody warns` |
| El cabo 21 está cerrado y el 24 sigue abierto | [import.product-files.docs.test.ts](../../src/modules/import/import.product-files.docs.test.ts) → `roadmap: closes loose end 21 with feature 53 and leaves 24 open` |

## Cumplimiento de la intención

Resultados de `./init.sh --checks 53` lanzado por el reviewer el 2026-10-02:
8 de 8 en verde. `./init.sh`: 70 archivos de test, 1286 tests, todos pasan.

- ✅ "Cuando importo dos archivos de producto con el mismo banco, el mismo nombre
  y la misma fecha, el primero se guarda y el segundo sale como fallido, con un
  mensaje que nombra el archivo con el que choca." → se cumple; lo verifican
  `rejects the second product file of a run…` y los dos tests de MyInvestor.
  Checks 1 y 2: ✅ (`Tests 1 passed`, `Tests 2 passed`).
- ✅ "El archivo rechazado no se mueve a procesados/…" → se cumple;
  `leaves the rejected product file pending in Drive and moves only the first`.
  Check 3: ✅.
- ✅ "El valor que guardó el primer archivo sigue en la base de datos tal como lo
  guardó." → se cumple; `keeps the value the first file stored exactly as it
  stored it`. Check 4: ✅.
- ✅ "Dos archivos del mismo producto con fechas distintas… se importan los dos
  igual que hoy." → se cumple; `imports two files of the same product with
  different dates in one run`. Check 5: ✅.
- ✅ "Volver a importar otro día un archivo corregido… sigue sustituyendo el
  valor." → se cumple; `still replaces the value when a corrected file…`.
  Check 6: ✅.
- ✅ "docs/api-contract.md describe el rechazo nuevo." → se cumple;
  `api-contract: describes the rejection of the second product file of one
  import`. Check 7: ✅.
- ✅ (añadido) Los extractos de movimientos entran igual → `pnpm test` entero.
  Check 8: ✅. Ningún test que ya existía se ha modificado (0 líneas borradas en
  `src/`).

## Decisiones que se tomaron por ti

Las seis que confirmaste en `decisions.md`:

- (delegado) «El segundo» es el archivo que la importación lee después: por
  nombre de banco, de carpeta de año y de archivo.
- (añadido) Se compara dentro de una llamada entera, también entre carpetas de
  año del mismo banco; nunca entre bancos.
- (delegado) La misma regla para los tres tipos: fondo/ETF/cartera, cuenta
  remunerada y depósito.
- (delegado) Código propio `DUPLICATE_PRODUCT_FILE` y el texto del mensaje, en
  `importProductFile`.
- (añadido) Si el primero de los dos falla, el segundo se importa con normalidad.
- (añadido) Se corrigieron los dos documentos de archivos de producto.
- (delegado) `importedProductCount` cuenta solo los archivos guardados: ya era
  así y ahora lo fija un test.

## Qué NO se tocó / quedó fuera

- Los extractos de movimientos, los parsers y cómo se guarda un producto
  (`src/modules/investments/`): sin una línea cambiada.
- No hay ruta nueva, ni migración, ni dependencia. Borrar un producto o un valor
  desde la API sigue sin existir: es el cabo suelto 24.
- No se mira la base de datos: lo que llega en otra llamada sigue sustituyendo.
  Por eso, si vuelves a importar el archivo rechazado sin corregirlo ni borrarlo
  de Drive, entra él solo y sustituye el valor del primero.
- El frontend no conoce todavía el código nuevo: mostrará su texto genérico con
  el mensaje del backend en el detalle.

## Notas para el futuro

- **No se ha probado con una importación real.** Nadie ha lanzado
  `POST /api/import` con dos archivos repetidos en tu Drive: un agente no puede
  hacerlo porque escribe en tu base y mueve archivos. Debe salir el primero
  `imported` y el segundo `failed` con `DUPLICATE_PRODUCT_FILE`, sin moverse. No
  está apuntado como deber tuyo en `docs/roadmap.md`.
- **El orden por nombre no lo fija ningún test.** Los tests demuestran que se
  rechaza el archivo leído después; que Drive los devuelve por nombre está en
  `src/lib/drive-structure.ts` (`orderBy: 'name'`), que esta feature no toca.
- `specs/53-product-file-collision/decisions.md` cita dos trozos de nombres de
  archivo de tu caso del 2026-09-12. Ya estaban en
  `progress/explorations/prueba-real-importacion-2026-09-12.md`, que está en git.
- Sugerencia del implementer, no aplicada: un archivo de producto cuyo valor se
  guarda y que Drive no consigue mover a `procesados/` sale `failed` pero suma a
  la vez a `failedCount` y a `importedProductCount`. Ya era así antes.
