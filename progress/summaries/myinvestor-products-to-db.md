# Resumen — feature 29 `myinvestor-products-to-db`

Fecha de cierre: 2026-08-21
Intención original: `feature_list.json` → feature `myinvestor-products-to-db`, bloque `intent`
Spec: no aplica (`"sdd": false`; mandan los 10 criterios de `acceptance`)

## Qué hace ahora la app que antes no

**Tus cinco `.json` de MyInvestor ya entran en la base de datos.** Antes los subías, el
importador los miraba y los devolvía como «extensión no soportada»: se quedaban en un
volcado, que era la base de datos falsa que querías quitar. Ahora tu fondo, tu ETF, tu
cartera gestionada y tus dos depósitos están guardados, cada uno con su tipo.

Y entran **como ya entraba tu cuenta remunerada de Trade Republic**: por el mismo sitio,
con las mismas garantías. No has tenido que escribir ni un campo nuevo en tus archivos, ni
se ha tocado el parser que llevaba funcionando desde el principio.

Lo que hay en tu base ahora mismo, entrado en la prueba real del 2026-08-21:

| | Productos | Valoraciones |
|---|---|---|
| Fondo, ETF y cartera gestionada | 3 | 3 (una por fecha) |
| **Depósitos** | 2 | **0** — a propósito, ver abajo |
| Cuenta remunerada (feature 26) | 1 | su foto de siempre, intacta |

**La regla del depósito, en cristiano:** un depósito no sube ni baja —lo firmas una vez con
un principal, un tipo y un vencimiento—, así que **no guarda una foto por mes**. Guardar la
misma cifra doce veces sería ruido. Sus cuatro condiciones viven en el propio producto. Por
eso, cuando importas un depósito, la respuesta trae `snapshot: null`: es la forma de no
mentirte diciendo «he guardado una foto» cuando no había ninguna que guardar.

## Por dónde se usa (puntos de entrada)

- **`POST /api/import`** — la de siempre: recoge lo pendiente de Drive, importa y mueve a
  `procesados/`. Ahora también tus `.json` de MyInvestor.
- **`POST /api/import/local`** — reimporta desde las copias locales, sin volver a Drive.
- **`POST /api/parser/myinvestor`** — sigue siendo el **ensayo**: lee y te enseña qué ha
  entendido, **sin guardar nada**. No ha cambiado.

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de Markdown de
> VS Code (o con Ctrl/Cmd + clic).

### Quién escribe en la base (el corazón de la feature)

Todo vive en un solo archivo, `src/modules/investments/investments.service.ts`, que es el
**único** sitio de todo `src/` autorizado a escribir estas tres tablas (lo vigila un
guardián).

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| **La entrada.** Mira el `type` del archivo una sola vez y reparte al escritor que toca | `persistProductSnapshot` | [investments.service.ts:93](../../src/modules/investments/investments.service.ts#L93) |
| Escribe fondo, ETF y cartera: producto + **una valoración por fecha** | `persistValuation` | `investments.service.ts` |
| Escribe un **depósito**: un solo guardado, sus 4 condiciones, **ninguna** valoración | `persistDeposit` | `investments.service.ts` |
| El escritor de la cuenta remunerada de la feature 26: **intacto**, no se tocó | `persistSavingsSnapshot` | `investments.service.ts` |
| El tronco común: guarda el producto por `(banco, nombre)` y **rechaza** un nombre que ya existe con otro tipo | `upsertProduct` | `investments.service.ts` |
| Los tres tipos que fluctúan; un depósito no es uno de ellos | `fluctuatingTypes` | `investments.service.ts` |
| Construye la mitad «producto» de la respuesta | `toProductReport` | `investments.service.ts` |

### La puerta de MyInvestor al importador

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Envuelve el parser: decodifica en UTF‑8 estricto y delega **sin tocarlo** | `parseMyinvestorProductFile` | [myinvestor.service.ts:38](../../src/modules/myinvestor/myinvestor.service.ts#L38) |
| Estrecha lo que el parser leyó al tipo exacto que la base espera | `toProductInput` | `myinvestor.service.ts` |
| La línea que mete a MyInvestor en el registro de productos | registro `productParsers` | [app.ts:63](../../src/app.ts#L63) |
| El importador llama al despachador en vez de al escritor de la F26 | `importProductFile` | [import.service.ts:403](../../src/modules/import/import.service.ts#L403) |

### Las formas de los datos (contratos)

| Qué define | Símbolo | Código |
| --- | --- | --- |
| Lo que todo archivo de producto aporta | `ProductFileCommon` | `investments.types.ts` |
| Un producto que fluctúa, con su valoración obligatoria | `ValuationInput` | `investments.types.ts` |
| Un depósito, con sus cuatro condiciones | `DepositInput` | `investments.types.ts` |
| La unión de los cinco tipos, discriminada por `type` | `ProductFileInput` | `investments.types.ts` |
| La respuesta; su `snapshot` es **anulable** por el depósito | `ProductImportResult` | `investments.types.ts` |
| Las mismas formas del lado de MyInvestor (un banco no importa los tipos de otro módulo) | `MyinvestorProductInput` y compañía | `myinvestor.types.ts` |

### Guardián

| Qué vigila | Código |
| --- | --- |
| Que **solo** `modules/investments/` escriba `InvestmentProduct`, `SavingsSnapshot` y —desde ahora— `Valuation` | [architecture.test.ts:404](../../src/architecture.test.ts#L404) |

### Tests

| Qué cubre | Código |
| --- | --- |
| **De punta a punta**, con el registro real de `app.ts` y la base de verdad: los 4 tipos entran, el depósito sin valoración, no duplica, el mes siguiente añade, un archivo malo no deja rastro ni se mueve a `procesados/` | [myinvestor.import.test.ts:106](../../src/modules/myinvestor/myinvestor.import.test.ts#L106) |
| Los tres escritores por dentro: 17 tests nuevos (condiciones del depósito, columnas a `NULL`, choque de tipos, rollback, idempotencia) | `investments.service.test.ts` |
| El adaptador de MyInvestor: no reinterpreta nada, no pide ni un campo nuevo, rechaza UTF‑8 inválido | `myinvestor.service.test.ts` |
| Los 13 tests de la feature 26 sobre la cuenta remunerada: **ninguno borrado ni debilitado** | `investments.service.test.ts` |

### Documentación

| Qué | Dónde |
| --- | --- |
| El registro único de columnas: las 4 del depósito y `Valuation` entera dejan de estar «sin escritor» | `docs/data-model.md` |
| El contrato: tabla `type` → dónde va la foto, y por qué el depósito devuelve `snapshot: null` | `docs/api-contract.md` |
| **La que lees tú**: qué pasa ahora con tus archivos | `docs/myinvestor-product-files.md` |
| La prueba real con tus 5 archivos | `progress/explorations/prueba-real-myinvestor-productos-2026-08-21.md` |

## Cumplimiento de la intención

- ✅ **«Subo mis 5 `.json` y después están en la base de datos, cada uno con su tipo.»**
  Se cumple, y está comprobado **con tus archivos de verdad**, no solo con tests: los 5
  entraron `imported` el 2026-08-21. En tests, `myinvestor.import.test.ts` › *stores the
  four types instead of reporting them as skipped*.
- ✅ **«Subo el mes siguiente y no se me duplican: son los mismos, con una valoración
  más.»** Se cumple; verificado en `myinvestor.import.test.ts` › *adds a valuation for the
  next month without creating a product* y en `investments.service.test.ts` › *reuses the
  product and adds a row for the next date*.
- ✅ **«Si vuelvo a subir el mismo mes, no se duplica nada.»** Se cumple; verificado en
  `myinvestor.import.test.ts` › *does not duplicate anything when the same month is
  uploaded twice* (dos pasadas reales), y confirmado sobre tus datos: la segunda pasada dio
  los cinco `created: false` y la base se quedó clavada.
- ✅ **«Mi cuenta remunerada de Trade Republic y sus meses siguen exactamente igual, y mis
  4 cuentas y mis 455 movimientos también.»** Se cumple. Tu cuenta remunerada conserva su
  foto y sigue sin valoraciones; 4 cuentas y 455 movimientos intactos. El revisor comparó
  hashes del contenido completo de las cinco tablas antes y después: idénticos.

## Decisiones que se tomaron por ti

Las tres que delegaste explícitamente, resueltas por escrito en el informe del implementer:

- **(delegado) Cómo convivir con el escritor de la feature 26, que rechazaba cualquier tipo
  que no fuera cuenta remunerada** → **se repartió**. Se añadió un despachador
  (`persistProductSnapshot`) que mira el tipo y reparte a tres escritores hermanos. El de
  la F26 se quedó **exactamente como estaba**, con su guardián y sus tests. Lo común —
  guardar el producto y rechazar el cambio de tipo— se escribió **una sola vez**.
- **(delegado) Dónde viven las condiciones del depósito y cómo se respeta que no tenga
  valoraciones** → en **columnas del propio producto**, que ya existían desde la feature 9
  sin que nadie las escribiera. La regla no se respeta por convención: `persistDeposit`
  hace **un solo guardado** y no menciona la tabla de valoraciones en ninguna línea.
- **(delegado) Qué identifica una valoración** → la pareja **(producto, fecha)**, y el
  producto es **(banco, nombre)**. Las dos mitades las escribes **tú**: el nombre que
  tecleas y la fecha del archivo. Ninguna lleva un contador que se pueda renumerar, que fue
  justo el fallo de la feature 25.
- **(añadido) Un nombre que ya existe con otro tipo se rechaza** en vez de convertirte el
  producto en silencio, porque convertirlo dejaría huérfana la serie que ya tenía.

⚠️ **Lo único que tienes que saber para el mes que viene:** el **nombre** es la identidad
del producto. Si lo cambias en el archivo se crea **otro** producto y la serie anterior se
queda colgando del nombre viejo. Escríbelo igual todos los meses.

## Qué NO se tocó / quedó fuera

- **No se tocó el parser de MyInvestor** (lo pediste): `myinvestor.product.parser.ts`,
  `myinvestor.format.ts` y `myinvestor.statement.parser.ts` tienen el diff vacío.
- **No escribes ni un campo nuevo**: el formato de tus `.json` es idéntico. Los tests usan
  las mismas fixtures de la feature 13, sin tocar.
- **Cero migración**: no se cambió el esquema. Todo lo que hacía falta existía desde la
  feature 9; lo que faltaba era quién lo escribiera.
- **No hay que reimportar nada** de lo que ya tenías.
- **Nada LEE todavía estas tablas.** Ya tienes productos y valoraciones guardados, pero
  **ningún endpoint te los devuelve**: no hay vista de patrimonio ni serie de un producto.
  Es el hueco más visible del proyecto ahora mismo, y es la feature que viene sola detrás.
- **La fecha de un depósito se lee y se tira**: no identifica ninguna fila, porque no hay
  fila por fecha.

## Notas para el futuro

- **Los contadores de la respuesta cuentan movimientos, no productos.** En la prueba real
  entraron 5 productos y el resumen dijo `importedCount: 0`. Confunde, viene de la feature
  26 y merece su arreglo.
- **La base no puede impedir** que alguien inserte a mano una valoración sobre un depósito;
  lo impide el servicio. Límite conocido y decidido desde la feature 9.
- **Un `.json` guardado con BOM** se rechazaría con un mensaje confuso («JSON inválido»).
  Se comprobó que ninguno de tus cinco lo lleva. Si algún mes reguardas uno con otro
  editor, ése es el síntoma.
- **`docs/plantillas/` no tiene plantilla de MyInvestor**, al contrario que Trade Republic:
  tus productos dependen de una copia en Drive que nadie comprueba.
- **`myinvestor.product.parser.test.ts` está sin formatear** desde la feature 15; un
  `pnpm format` lo cierra. No es de esta feature.
- Queda por borrar la base temporal **`gastos_f26`** de tu Postgres, deber de cierre que se
  quedó pendiente de la feature 26.
