# Design — F53 `product-file-collision`

> Sin migración, sin dependencia nueva, sin variable de entorno, sin ruta nueva.
> El cambio de comportamiento vive en un solo archivo de código
> (`src/modules/import/import.service.ts`) más una clase de error.

## 1. Lo que hay hoy (leído el 2026-10-02)

- `importPending` ([import.service.ts:348](../../src/modules/import/import.service.ts#L348))
  recorre bancos → años → archivos, en el orden por nombre que devuelve Drive
  (`orderBy: 'name'` en `listBankFolders`, `listYearFolders` y `listPendingFiles`
  de `src/lib/drive-structure.ts`). Cada archivo de producto pasa por
  `importDriveFile` con un `store` que llama a `importProductFile`.
- `importProductFile` ([:560](../../src/modules/import/import.service.ts#L560))
  parsea y llama a `persistProductSnapshot`, que hace `upsert` del producto sobre
  `(bank, name)` y, según el tipo, `upsert` de `Valuation` o de `SavingsSnapshot`
  sobre `(productId, date)` (`src/modules/investments/investments.service.ts`).
  Nada recuerda qué escribió el archivo anterior de la misma ejecución: el segundo
  `upsert` sustituye al primero y los dos archivos salen `imported`.
- `importDriveFile` no mueve el archivo cuando `store` devuelve `status: 'failed'`
  ([:492](../../src/modules/import/import.service.ts#L492)).
- `totals` cuenta en `importedProductCount` los informes con `product != null`
  ([:824](../../src/modules/import/import.service.ts#L824)); un informe fallido
  lleva `product: null`.

## 2. Qué cambia

### 2.1 Un registro en memoria, por ejecución de `importPending`

`importPending` crea, al empezar, un `Map` vacío y se lo pasa a cada
`importProductFile` de esa ejecución. No se guarda en la base de datos ni
sobrevive a la llamada: una llamada nueva a `POST /api/import` empieza con el
`Map` vacío, y eso es exactamente lo que hace cierto R8.

```ts
/** Which file of THIS run stored each (bank, name, date). In memory, one per run. */
export interface StoredProductFileRef {
  year: string
  name: string
}
export type ProductFilesStoredInRun = Map<string, StoredProductFileRef>

/** Exact comparison, like the unique key `(bank, name)` of the database. */
export function productFileKey(bank: string, name: string, date: string): string {
  return JSON.stringify([bank, name, date])
}
```

Viven en `import.service.ts` (o en `import.types.ts` los dos tipos). Los nombres
describen literalmente lo que son; no se introduce ningún término nuevo.

### 2.2 `importProductFile`

`ImportProductFileDeps` gana dos campos **opcionales** (sin ellos se comporta como
hoy, para no tocar a quien ya la llama sin registro):

```ts
/** Year folder of the file, only to name it in the message of another file. */
year?: string
/** Files of this run already stored. Absent: nothing is compared (as before). */
storedInRun?: ProductFilesStoredInRun
```

Orden dentro del `try`, que es la regla entera:

1. `parsed = adapter.parse(...)` — como hoy. Si lanza, el archivo falla y **no**
   se apunta nada (R10).
2. `key = productFileKey(deps.bankSlug, parsed.name, parsed.date)`. El banco es el
   **slug de la carpeta**, no `parsed.bank`.
3. Si `storedInRun` tiene `key` → `throw new DuplicateProductFileError(...)`,
   **antes** de llamar a `persistProductSnapshot`. Así R3 es cierto sin
   transacción ni lectura previa: no se llega a abrir ninguna.
4. `persistProductSnapshot(...)` — como hoy. Si lanza, no se apunta nada (R10).
5. Solo tras guardar: `storedInRun.set(key, { year, name: fileName })`. Se apunta
   aquí, dentro de `importProductFile`, y no después del movimiento a
   `procesados/`: si el movimiento falla, el valor **ya está escrito** y el
   siguiente archivo igual lo sustituiría (definición de «ya guardado» de
   `requirements.md`).

El `catch` existente convierte el error en `status: 'failed'` + `describeError`,
con `product: null` y `snapshot: null` (R5), y `importDriveFile` no mueve el
archivo (R4) y el bucle sigue (R6). No hay que tocar `importDriveFile`, `totals`
ni `import.types.ts` más allá de los dos tipos nuevos.

La comprobación va antes que la de «un producto no cambia de tipo» de
`upsertProduct`: dos archivos de la misma ejecución con el mismo nombre y la misma
fecha y **distinto** `type` salen con `DUPLICATE_PRODUCT_FILE`. Con fechas
distintas sigue saliendo el `VALIDATION_ERROR` de hoy.

### 2.3 Los tres tipos (R9)

La clave no lleva el `type`: se calcula igual para `fund`/`etf`/
`managed_portfolio`, `savings_account` y `deposit`. `persistProductSnapshot` y los
tres escritores de `investments.service.ts` **no cambian una línea**.

### 2.4 Error nuevo

En `src/errors/app-error.ts`, con el patrón de `EmptyStatementError`:

```ts
export class DuplicateProductFileError extends AppError {
  constructor(message = 'Another file of this import already stored this product and date') {
    super(message, 'DUPLICATE_PRODUCT_FILE', 422)
  }
}
```

422 como el resto de «petición bien formada con contenido que no se puede usar».
Solo viaja dentro de `files[].error` de un 200; ninguna ruta lo devuelve como
cuerpo.

Texto del mensaje (en español, como los demás motivos de archivos de producto;
los valores que escribe el humano van entrecomillados, `docs/conventions.md`
§Tests):

```
este archivo declara el producto '<name>' con fecha <date>, lo mismo que el
archivo '<otro archivo>' de la carpeta <año>, que ya se ha guardado en esta misma
importación: de este no se ha guardado nada y NO se ha movido a procesados/. Si
son dos productos distintos, corrige el "name" de uno; si es el mismo archivo
subido dos veces, bórralo de Drive.
```

## 3. Archivos

| Archivo | Cambio |
|---|---|
| `src/errors/app-error.ts` | `DuplicateProductFileError` |
| `src/modules/import/import.service.ts` | el `Map` en `importPending`, los dos campos de `ImportProductFileDeps`, los pasos 2, 3 y 5 de §2.2, `productFileKey` |
| `src/modules/import/import.types.ts` | los dos tipos de §2.1, si el implementer los prefiere ahí |
| `src/modules/import/import.service.test.ts` | bloque `describe` nuevo (ver `tasks.md`) |
| `src/modules/myinvestor/myinvestor.import.test.ts` | dos tests con el registro real (R9) |
| `src/modules/import/import.product-files.docs.test.ts` | **nuevo**: lee los cuatro documentos (R13, R14, R15) |
| `src/architecture.test.ts` | solo si su lista de árbol exige nombrar el archivo de test nuevo |
| `docs/api-contract.md` | §4 |
| `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md` | §4 |
| `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md` | §4 |

## 4. Documentos que la feature vuelve falsos

- **`docs/api-contract.md`**, sección `### POST /api/import`:
  - en «Archivos de producto», tras el paso 5', un párrafo: antes de guardar se
    comprueba si otro archivo **de esta misma llamada** ya guardó el mismo
    `(bank, name, date)`; si es así, se rechaza con `DUPLICATE_PRODUCT_FILE`, no
    se guarda nada y no se mueve. Decir qué archivo es el rechazado (el que se
    recorre después: orden por nombre de banco, año y archivo) y que la
    comparación cruza carpetas de año;
  - el párrafo «Idempotencia» precisa que sustituir es lo que pasa cuando el
    archivo llega en **otra** llamada;
  - fila nueva `DUPLICATE_PRODUCT_FILE` en «Códigos que aparecen por archivo
    (dentro del 200)»;
  - la nota de `importedProductCount` no cambia de significado: se añade que el
    archivo rechazado por este motivo suma a `failedCount` y a nada más.
  No es un cambio que rompa el contrato: ningún campo cambia de forma; aparece un
  valor más de `files[].error.code`.
- **`docs/myinvestor-product-files.md`** (párrafo «Si dos archivos declaran el
  mismo `name` y la misma `date`») y **`docs/trade-republic-product-files.md`**
  (su párrafo gemelo): hoy dicen «nadie te avisa del choque». Pasan a decir que el
  segundo de la misma importación se rechaza con `DUPLICATE_PRODUCT_FILE`, que se
  queda en Drive y que, si se vuelve a importar sin corregirlo ni borrarlo, entra
  y sustituye. En cada uno, además, una fila en la tabla «Qué pasa cuando un
  archivo está mal». En el de Trade Republic no se toca ninguna frase que exija
  `src/modules/trade-republic/trade-republic.docs.test.ts`.
- **`docs/data-model.md`**, tabla de la sección que compara las dos resoluciones
  de conflicto (fila «Qué pasa», columna Inversiones): una nota debajo diciendo
  que, desde la F53, dentro de una misma importación el segundo archivo no
  sustituye, se rechaza.
- **`docs/architecture.md`**: ADR-033 nuevo (decisión, alternativas de §5,
  consecuencias) y, encima del ADR-026, la línea «Revisado el 2026-10-02 por la
  feature 53 `product-file-collision`: dentro de una misma importación el segundo
  archivo del mismo producto y fecha se rechaza en vez de sustituir; entre
  importaciones sigue sustituyendo. Ver ADR-033.» Ningún ADR se reescribe. Antes
  de tocarlo, comprobar que `src/retired-routes.docs.test.ts` sigue verde.
- **`docs/roadmap.md`**: fila 21 de «Cabos sueltos» tachada y «cerrado por la F53
  (2026-10-02)»; la fila E5 de la tabla de etapas gana la F53. **La fila 24 no se
  toca.**

`progress/current.md` es del leader.

## 5. Alternativas descartadas

1. **Comparar contra la base de datos** (rechazar todo archivo cuyo producto y
   fecha ya existan). Descartada: rompe R8, que el humano pide explícitamente
   («volver a importar otro día un archivo corregido sigue sustituyendo»), y el
   uso documentado de volver a subir un mes para corregirlo.
2. **Leer todos los archivos pendientes antes de guardar ninguno y rechazar los
   dos.** Descartada: el humano pidió «rechazar el segundo»; además obligaría a
   descargar y parsear todo antes de escribir nada y cambiaría el recorrido
   archivo a archivo en el que se apoya el aislamiento de fallos.
3. **Hacer la comprobación dentro de `persistProductSnapshot`.** Descartada:
   `investments.service.ts` es el escritor y no sabe qué es una ejecución de la
   importación ni cómo se llama un archivo; el dato (qué archivo, de qué carpeta)
   solo lo tiene el importador.
4. **Guardar en la base de datos qué archivo escribió cada valor** (columna de
   procedencia). Descartada: pide migración y es otra feature; permitiría además
   detectar el caso entre importaciones, que el humano quiere que siga
   sustituyendo.
5. **Reutilizar `VALIDATION_ERROR`.** Descartada: ese código dice «el archivo está
   mal escrito»; aquí el archivo puede estar bien escrito y sobrar. Un código
   propio deja al frontend dar un texto propio.

## 6. Casos parecidos que esta regla NO cubre (no se amplía el alcance)

- **Mismo nombre, otro `type`, fechas distintas**: ya se rechaza hoy
  (`upsertProduct`, `VALIDATION_ERROR` «un producto no cambia de tipo»). Sin
  cambios.
- **Dos productos distintos con el mismo `name` por error y fechas distintas**:
  entran los dos como el mismo producto, hoy y después de esta feature.
- **Dos archivos del mismo depósito con fechas distintas en la misma
  importación**: el segundo reescribe las condiciones del primero, como hoy.
- **El archivo rechazado, reimportado sin corregir**: en la llamada siguiente está
  solo (el otro ya está en `procesados/`), el `Map` empieza vacío, y entra
  sustituyendo. Es la consecuencia directa de R8.
- **Dos llamadas a `POST /api/import` a la vez**: cada una tiene su `Map`; no se
  ven entre sí. Tampoco hoy hay nada que lo impida.
- **Nombres que solo difieren en mayúsculas o espacios**: son productos distintos
  para la base de datos y también para esta comparación.

## 7. Tests y datos

Todo inventado (`docs/conventions.md` §Tests): bancos `zz-product-…`, nombres
generados, importes de los fixtures que ya existen. Los tests de
`import.service.test.ts` usan `fakeProductAdapter` (tipo `savings_account`) y
`buildDrive`/`treeWith`; los dos de `myinvestor.import.test.ts`, el registro real
y `driveWithPendingFiles`. Cada test limpia las filas que crea, como los del
bloque `importPending: the product files (feature 26)`.
