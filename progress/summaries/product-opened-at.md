# Resumen — feature 15 `product-opened-at`

Fecha de cierre: 2026-08-13
Intención original: `feature_list.json` → feature `product-opened-at`, bloque `intent`
Spec: no tiene (`sdd: false`); la fuente son el `intent` y sus 8 criterios de `acceptance`

## Qué hace ahora la app que antes no

Los `.json` de producto de inversión que escribes a mano ahora llevan **la fecha de
apertura** (`openedAt`, en formato `AAAA-MM-DD`), y el parser la lee y la saca en el
resultado y en el volcado del año. Antes ese dato no existía en el archivo: la columna
`openedAt` estaba en la base de datos desde la feature 9 pero nadie iba a poder
escribirla nunca.

Y no es un campo que se pueda olvidar: es **obligatorio en los cuatro tipos** (`fund`,
`etf`, `managed_portfolio`, `deposit`). Si a un archivo le falta, ese archivo se reporta
como fallido diciéndote el nombre del campo, en el mismo motivo único donde ya se te
listan el resto de sus problemas — y los demás archivos del lote se parsean igual, así
que un despiste en un fondo no te deja sin el resto del mes.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/myinvestor` — **la misma ruta de siempre**, sin cambios. Recorre las
  copias locales, manda los `.csv` al parser del extracto y los `.json` al de producto, y
  deja el volcado en `var/parsed/myinvestor/<año>/products.json`, ahora con `openedAt` en
  cada producto.
- Lo que cambia de tu lado es **el archivo que escribes**: una línea más, siempre la
  misma, en las tres plantillas de
  [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md).

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de Markdown de
> VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### El parser (todo el cambio de comportamiento vive aquí)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Punto de entrada del parseo de UN archivo de producto | `parseMyinvestorProduct` | [myinvestor.product.parser.ts:52](../../src/modules/myinvestor/myinvestor.product.parser.ts#L52) |
| `openedAt` pasa a ser una clave admitida del archivo (antes se rechazaba como clave desconocida) | `commonKeys` | [myinvestor.product.parser.ts:44](../../src/modules/myinvestor/myinvestor.product.parser.ts#L44) |
| Se lee como **obligatorio**, y se lee **antes** de separar depósito del resto: por eso vale para los cuatro tipos con una sola línea | `readIso('openedAt', true)` | [myinvestor.product.parser.ts:80](../../src/modules/myinvestor/myinvestor.product.parser.ts#L80) |
| Sin fecha de apertura no se emite producto: el archivo sale por la puerta de «fallido» | guarda de salida de `parseMyinvestorProduct` | [myinvestor.product.parser.ts:116](../../src/modules/myinvestor/myinvestor.product.parser.ts#L116) |
| El campo, ya en el producto que se devuelve y se vuelca | `openedAt` del objeto devuelto | [myinvestor.product.parser.ts:134](../../src/modules/myinvestor/myinvestor.product.parser.ts#L134) |
| Lector de fechas reutilizado tal cual (`AAAA-MM-DD` estricto; lo que falta va a «faltan campos obligatorios», lo mal escrito a su propio motivo) | `readIsoField` | [myinvestor.product.parser.ts:221](../../src/modules/myinvestor/myinvestor.product.parser.ts#L221) |
| Un campo ausente y uno a `null` son lo mismo | `isAbsent` | [myinvestor.product.parser.ts:275](../../src/modules/myinvestor/myinvestor.product.parser.ts#L275) |

### El contrato del producto parseado

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| `openedAt: string`, nunca `null` — la decisión de que sea obligatorio, escrita en el tipo | `ParsedProduct` | [myinvestor.types.ts:99](../../src/modules/myinvestor/myinvestor.types.ts#L99) |

### Fixtures (todo inventado, como manda la regla de la F14)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Fecha de apertura sintética del fondo/ETF/cartera (`2025-01-15`, a propósito de otro año que la foto) | `buildProductFund` | [myinvestor.fixture.ts:109](../../src/modules/myinvestor/myinvestor.fixture.ts#L109) |
| Fecha de apertura sintética del depósito (`2026-01-15`) | `buildProductDeposit` | [myinvestor.fixture.ts:135](../../src/modules/myinvestor/myinvestor.fixture.ts#L135) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Bloque nuevo entero: la apertura de un producto (5 tests) | [myinvestor.product.parser.test.ts:141](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L141) |
| Se lee en los cuatro tipos y convive con `closedAt`, que sigue vacío | [myinvestor.product.parser.test.ts:142](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L142) |
| La fecha sale **exacta** tal como se escribió, en las dos formas de producto | [myinvestor.product.parser.test.ts:157](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L157) |
| Si falta, el archivo falla nombrando `openedAt` — recorriendo los **cuatro** tipos, depósito incluido | [myinvestor.product.parser.test.ts:164](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L164) |
| Un `openedAt: null` cuenta como ausente, no como «apertura desconocida» | [myinvestor.product.parser.test.ts:178](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L178) |
| Vacío (`""`) o mal escrito (`15/01/2025`, `2025-1-5`, `2025-02-30`) se rechaza diciendo `AAAA-MM-DD` | [myinvestor.product.parser.test.ts:184](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L184) |
| El fallo se **acumula** con los demás problemas del archivo: el motivo sigue siendo **uno** | [myinvestor.product.parser.test.ts:193](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L193) |
| El producto completo, con el campo dentro (comparación exhaustiva) | [myinvestor.product.parser.test.ts:83](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L83) |
| El volcado `products.json` del año trae la fecha de apertura | [myinvestor.service.test.ts:243](../../src/modules/myinvestor/myinvestor.service.test.ts#L243) |
| Un archivo sin `openedAt` **no tumba el lote**: falla solo él y los otros dos se parsean | [myinvestor.service.test.ts:272](../../src/modules/myinvestor/myinvestor.service.test.ts#L272) |
| Los dos tests de `closedAt` de la F13 siguen verdes **sin tocarse** (la prueba de que no cambió) | [myinvestor.product.parser.test.ts:206](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L206) |

### Documentación

| Qué hace | Código |
| --- | --- |
| Las tres plantillas que copias, la regla de fechas, la tabla de campos y la sección propia de `openedAt` | [docs/myinvestor-product-files.md:175](../../docs/myinvestor-product-files.md#L175) |
| El modelo del producto en el contrato de la API (ejemplo + fila de tabla) | [docs/api-contract.md:766](../../docs/api-contract.md#L766) |
| La columna `openedAt` deja de figurar como «condenada a `NULL`»: ya tiene quién la escribirá | [docs/data-model.md:214](../../docs/data-model.md#L214) |
| Deuda conocida nº 9 del roadmap, cerrada | [docs/roadmap.md:316](../../docs/roadmap.md#L316) |

## Cumplimiento de la intención

Por cada punto de tu `como_se_que_esta_bien`:

- ✅ **«Escribo un fondo, un ETF, una cartera y un depósito con su fecha de apertura y los
  cuatro se parsean bien, con esa fecha en el resultado»** → se cumple; verificado en
  `myinvestor.product.parser.test.ts:142` (los cuatro tipos) y `:157` (el valor sale
  exacto, no solo con la forma correcta).
- ✅ **«Si a un archivo le falta la fecha de apertura, ese archivo se reporta como fallido
  diciéndomelo, igual que cuando falta cualquier otro campo obligatorio; los demás
  archivos del lote se parsean igual»** → se cumple **en los cuatro tipos**, no solo en el
  fondo: `myinvestor.product.parser.test.ts:164`. Que el motivo siga siendo **uno solo**
  por archivo (tu regla de la F13) está fijado en `:193`, y que el resto del lote
  sobreviva, en `myinvestor.service.test.ts:272`.
- ✅ **«La fecha de cierre sigue funcionando como hasta ahora: opcional, vacía en los que
  siguen vivos»** → se cumple; los tests de `closedAt` de la F13
  (`myinvestor.product.parser.test.ts:206`) siguen verdes sin que se les haya tocado una
  línea, y `:142` comprueba además que conviven.
- ✅ **«El volcado `products.json` del año trae la fecha de apertura de cada producto»** →
  se cumple; verificado con el valor concreto en `myinvestor.service.test.ts:243`.
- ✅ **«Lo que ya funcionaba del parser de productos sigue exactamente igual: mismos
  campos, mismos errores, misma ruta»** → se cumple; la ruta y el encaminamiento por
  extensión no se han tocado (ni `myinvestor.service.ts` ni `myinvestor.routes.ts`
  aparecen en el diff) y los 372 tests anteriores siguen pasando sin que se haya relajado
  ninguna comprobación.

## Decisiones que se tomaron por ti

- **(delegado) El nombre y el formato del campo:** se llama `openedAt` y va en
  `AAAA-MM-DD`, igual que `closedAt` y que la columna de la base de datos. Nada nuevo que
  recordar.
- **(delegado) Dónde encaja en el parser:** en las claves **comunes** a todos los
  productos y leído antes de separar el depósito del resto
  ([`myinvestor.product.parser.ts:80`](../../src/modules/myinvestor/myinvestor.product.parser.ts#L80)).
  Esa colocación es la que hace que sea obligatorio en los cuatro tipos de verdad, y no
  solo en el camino que se probó.
- **(añadido, pequeño) Escribirlo vacío (`""`) no cuela**, y tampoco escribirlo en otro
  formato: se rechaza como cualquier otra fecha, diciéndote `AAAA-MM-DD`. Un `null` o la
  ausencia se tratan igual entre sí («falta»). Son mensajes distintos a propósito, porque
  te dicen cosas distintas.
- **(añadido, en el tipo) `openedAt` es `string`, nunca `null`.** Es la traducción a
  código de tu decisión del 2026-08-13: si un producto no tiene fecha de apertura, no es
  un producto con un hueco, es un **archivo fallido**. Así el día que exista la
  persistencia no podrá escribir `NULL` en esa columna «sin querer».

## Qué NO se tocó / quedó fuera

- **La base de datos, ni de lejos:** ni `prisma/schema.prisma`, ni migraciones, ni la BD.
  La columna ya existía desde la feature 9.
- **No se persiste ningún producto:** esto sigue siendo solo parseo y volcado, como la
  feature 13.
- **El parser del extracto `.csv` de MyInvestor y el de Bankinter no se han tocado**, ni
  su formato.
- **`closedAt` no ha cambiado en nada.**
- **Ningún endpoint nuevo** ni cambio en la forma de la respuesta HTTP: el resumen
  `products[]` que devuelve la ruta sigue con los mismos campos.

## Notas para el futuro

1. 🔴 **Lo único que tienes que hacer tú, hoy:** actualizar **la plantilla que guardas en
   Drive**. Nadie comprueba que coincida con la documentación, y **todos los archivos que
   escribas con la plantilla vieja fallarán** (les faltará `openedAt`). Es una línea:
   copia la de [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md).
2. **La otra mitad del hueco sigue abierta:** el archivo ya trae la fecha, pero **todavía
   no hay nadie que la guarde** en la columna. La escribirá la feature que persista las
   inversiones; hasta entonces la columna sigue vacía. Queda anotado en
   `docs/data-model.md:214`.
3. **El parser no comprueba que las fechas cuadren entre sí** (`openedAt` anterior a la
   foto, al vencimiento o al cierre). Un dedo torpe puede declarar un producto abierto
   después de su propia foto y pasa. Encaja mejor cuando exista la persistencia, que es
   quien sufre esa incoherencia.
4. **Tampoco comprueba que las copias mensuales del mismo producto declaren la misma
   apertura:** dos archivos del mismo fondo pueden decir fechas distintas y los dos
   parsean. Es el precio de que el parser no tenga memoria de un mes a otro; detectarlo le
   toca a quien agregue la serie.
