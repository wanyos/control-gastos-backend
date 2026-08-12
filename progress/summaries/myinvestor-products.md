# Resumen — feature 13 `myinvestor-products`

Fecha de cierre: 2026-08-12
Intención original: `feature_list.json` → feature `myinvestor-products`, bloque `intent`
Spec: `specs/myinvestor-products/` (SDD, cinco archivos)

## Qué hace ahora la app que antes no

Ahora **el módulo de MyInvestor lee sus dos entradas, no una**. Además del extracto CSV de la
cuenta corriente (que ya leía desde la feature 10), lee **los archivos JSON de tus productos de
inversión** —los fondos, el ETF, la cartera automatizada y los depósitos— que escribes tú a mano
y dejas en la carpeta del banco en Drive. Con **el mismo botón de siempre**: una sola llamada a
`POST /api/parser/myinvestor` te devuelve los extractos **y** los productos.

De cada producto sale una ficha estructurada con su tipo, su nombre, su fecha, lo invertido, lo
que vale, lo que ganas y —en la cartera— el efectivo sin invertir **aparte, nunca sumado**. Todos
los productos de un año se juntan en **un único `var/parsed/myinvestor/<año>/products.json`** que
puedes abrir y revisar. Un archivo mal escrito te dice **qué archivo es y todo lo que le pasa de
una vez**, y los demás se parsean igual.

**Sigue sin tocar la base de datos.** Guardar los productos es otra feature.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/parser/myinvestor` — el mismo disparo de siempre, ahora devuelve también `products[]` y `productCount` | [myinvestor.routes.ts:37](../../src/modules/myinvestor/myinvestor.routes.ts#L37) |
| Recorre las copias locales, encamina cada archivo por su extensión y escribe los volcados | [myinvestor.service.ts:47](../../src/modules/myinvestor/myinvestor.service.ts#L47) |
| Interpreta **un** archivo de producto y devuelve la ficha o el motivo del fallo | [myinvestor.product.parser.ts:46](../../src/modules/myinvestor/myinvestor.product.parser.ts#L46) |
| Valida una fecha `AAAA-MM-DD` con calendario real (rechaza `2026-02-31`) | [myinvestor.format.ts:63](../../src/modules/myinvestor/myinvestor.format.ts#L63) |

## Dónde está el código

### Leer un archivo de producto

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Interpreta un `.json` de producto entero; devuelve la ficha o `{ reason }`, **nunca lanza** | `parseMyinvestorProduct` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| Los cuatro tipos admitidos; un tipo desconocido los lista todos en el motivo | `readType` / `productTypes` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| La identidad del producto, siempre del contenido y jamás del nombre del archivo | `readName` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| La moneda: si no la escribes, `EUR` | `readCurrency` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| Exige **número JSON nativo**; un número escrito como texto es un fallo con su propio motivo y **no se interpreta** | `readNumberField` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| Exige `AAAA-MM-DD` en `date`, `maturityDate` y `closedAt` | `readIsoField` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| Una clave que no está en la plantilla es un error; las que empiezan por `_` son tus notas y se ignoran | `reportUnknownKeys` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| Un campo ausente y un campo a `null` significan lo mismo | `isAbsent` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| El valor recibido, citado en el motivo, para que puedas arreglarlo sin adivinar | `display` | `src/modules/myinvestor/myinvestor.product.parser.ts` |
| Qué campos exige cada tipo (valoración / condiciones del depósito) | `commonKeys`, `valuationKeys`, `depositKeys` | `src/modules/myinvestor/myinvestor.product.parser.ts` |

### Fechas (se añade al formato que ya existía)

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| `AAAA-MM-DD` estricto, validando el día del calendario | `parseIsoDate` | `src/modules/myinvestor/myinvestor.format.ts` |

> `parseAmountText` y `parseStatementDate` **no se han tocado**: son del `.csv` y aquí no se usan.

### Encaminar, agrupar y volcar

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Recorre las copias locales y manda cada archivo a su parser según la extensión | `parseLocalMyinvestorCopies` | `src/modules/myinvestor/myinvestor.service.ts` |
| Lee un archivo de producto y convierte su motivo en una entrada de `failed[]` | `parseProductFile` | `src/modules/myinvestor/myinvestor.service.ts` |
| Detecta dos archivos con el mismo producto y la misma fecha (la copia que Drive duplica) | `findClash` | `src/modules/myinvestor/myinvestor.service.ts` |
| Escribe el `products.json` del año y devuelve un resumen por producto | `dumpProducts` | `src/modules/myinvestor/myinvestor.service.ts` |
| Constantes del encaminamiento y del volcado | `statementExtension`, `productExtension`, `productsDumpFile` | `src/modules/myinvestor/myinvestor.service.ts` |

### El vocabulario (tipos)

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Los cuatro tipos de producto | `InvestmentProductType` | `src/modules/myinvestor/myinvestor.types.ts` |
| Lo que fluctúa: invertido, valor, ganancia, porcentaje y efectivo aparte | `ParsedValuation` | `src/modules/myinvestor/myinvestor.types.ts` |
| Las condiciones del depósito: principal, TAE única, intereses y vencimiento | `ParsedDepositTerms` | `src/modules/myinvestor/myinvestor.types.ts` |
| La ficha completa de un producto, con su procedencia (`bank`, `file`) | `ParsedProduct` | `src/modules/myinvestor/myinvestor.types.ts` |
| Lo que contiene el `products.json` del año | `MyinvestorProductsResult` | `src/modules/myinvestor/myinvestor.types.ts` |
| El resumen que viaja en la respuesta HTTP | `ParsedProductSummary` | `src/modules/myinvestor/myinvestor.types.ts` |
| Los dos contadores nuevos de la ejecución | `MyinvestorParseRunResult` (`products`, `productCount`) | `src/modules/myinvestor/myinvestor.types.ts` |

### Fixtures (todo inventado)

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Un archivo de fondo/ETF/cartera con todos sus campos | `buildProductFund` | `src/modules/myinvestor/myinvestor.fixture.ts` |
| La cartera automatizada, la única que suele traer efectivo | `buildProductPortfolio` | `src/modules/myinvestor/myinvestor.fixture.ts` |
| Un depósito con sus cuatro condiciones | `buildProductDeposit` | `src/modules/myinvestor/myinvestor.fixture.ts` |
| Serializa un archivo como lo escribirías tú | `buildProductJson` | `src/modules/myinvestor/myinvestor.fixture.ts` |
| El tipo abierto que permite construir archivos **mal escritos** en los tests | `ProductFile` | `src/modules/myinvestor/myinvestor.fixture.ts` |

### Documentación

| Qué hace | Dónde |
| --- | --- |
| **La referencia del formato**: las dos plantillas, la tabla de campos con su origen, las reglas de números y fechas, la TAE única, el efectivo aparte, `closedAt` y la cadencia | `docs/myinvestor-product-files.md` |
| El modelo del producto parseado en el endpoint | `docs/api-contract.md` § `POST /api/parser/myinvestor` |
| **ADR-016** (la decisión de formato) + el árbol de carpetas del módulo | `docs/architecture.md` |
| La fila de MyInvestor · productos | `docs/roadmap.md` |

### Tests

| Qué cubre | Símbolo | Archivo |
| --- | --- | --- |
| Los cuatro tipos, la identidad, las fechas, la moneda, `closedAt`, los números tal cual, el efectivo aparte y los ocho casos de archivo mal escrito — **31 tests** | `describe('parseMyinvestorProduct — …')` (6 bloques) | `src/modules/myinvestor/myinvestor.product.parser.test.ts` |
| La fecha ISO estricta | `describe('parseIsoDate (R28)')` | `src/modules/myinvestor/myinvestor.format.test.ts` |
| Encaminamiento por extensión, volcado del año, aislamiento de un archivo roto, choque de duplicados, la ausencia que **no** cierra, dos ejecuciones idénticas y el origen intacto | `describe('parseLocalMyinvestorCopies — the product files of the same bank')` | `src/modules/myinvestor/myinvestor.service.test.ts` |
| La respuesta HTTP con productos y su `dumpPath` relativa | `myinvestor.routes.test.ts` | `src/modules/myinvestor/myinvestor.routes.test.ts` |
| Los archivos nuevos en el árbol esperado y el guardián de «sin `prisma`» | `describe('architecture invariants')` | `src/architecture.test.ts` |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien`:

- ✅ **«Un archivo JSON por producto, con campos explícitos, y una plantilla documentada por
  tipo»** → las dos plantillas están en `docs/myinvestor-product-files.md`; lo verifica
  «emits the whole product with its bank and its source file as provenance».
- ✅ **«Una entrada estructurada por producto, con su tipo y su fecha»** → lo verifican
  «parses a fund, an ETF and a managed portfolio…» y «takes the name and the date from the
  contents».
- ✅ **«Cada tipo con los campos que le corresponden»** → «parses a deposit with its four
  conditions and no valuation at all» y «rejects a deposit that carries valuation fields».
- ✅ **«El efectivo sin invertir, aparte del valor de mercado»** → «emits the uninvested cash
  apart, never added into marketValue», que comprueba que **la suma no aparece en ningún campo**.
- ✅ **«Los campos opcionales se pueden omitir sin que falle»** → «treats an absent optional
  field and a null one exactly the same».
- ✅ **«Los negativos se interpretan como negativos»** → «keeps the negative sign of gain and
  gainPercent».
- ✅ **«Un archivo mal escrito se reporta aparte y los demás se parsean igual»** → los ocho casos
  de error del parser, «accumulates every problem of the same file into a single reason» y, en el
  servicio, «isolates a broken product file and parses the healthy ones all the same».
- ✅ **«El parser no calcula nada»** → «returns the gain as written even when it does not match
  the other figures» y «neither rounds nor fixes the number of decimals».
- ✅ **«Puedo ver el resultado en un JSON local»** → «dumps every product of the year into a
  single products.json».
- ✅ **«Parsear dos veces da exactamente el mismo resultado»** → «produces byte-identical product
  dumps on two consecutive runs».

Y del `que_no_quiero`: ✅ **sin base de datos** (ni una mención a `prisma` en el módulo, con
guardián en `src/architecture.test.ts`), ✅ **sin enlazar movimientos con productos**, ✅ **sin
mover nada a `procesados/`**, ✅ **sin interfaz**, ✅ **la lista de campos la cerraste tú** antes
de implementar (`specs/myinvestor-products/CAMPOS-cerrados.md`), ✅ **no se guarda la TAE que no
se te aplica** (una segunda TAE se rechaza como clave desconocida) y ✅ **no se versiona ningún
dato financiero real**.

## Decisiones que se tomaron por ti

- **(cerrada por ti, 2026-08-11)** Los números van como **número JSON puro**, no como texto en
  formato español. Consecuencia: este parser **no usa** el intérprete de números del extracto, y
  un valor que llegue entre comillas es un fallo del archivo con su motivo, **nunca se
  interpreta**.
- **(añadido)** `date` es **obligatorio también en el depósito**, con el significado «el día que
  escribí esto». Es lo que permite detectar que has escrito dos veces lo mismo.
- **(añadido)** **Una clave que no está en la plantilla es un error**, salvo las que empiezan por
  `_`. Es lo único que atrapa una errata silenciosa como `uninvestedcash`, que si no te haría
  desaparecer el efectivo sin decir nada.
- **(añadido)** Si dos archivos declaran el mismo producto **y** la misma fecha, se conserva **el
  primero por orden alfabético** y el otro se reporta. Es el caso de `fondo.json` + `fondo (1).json`
  que crea Drive.
- **(añadido)** Un archivo roto reporta **todos** sus problemas de golpe, no el primero.
- **(añadido)** Los productos se vuelcan a **un `products.json` por año**, no un volcado por
  archivo (que habría dado `fondo.json.json`).
- **(delegado)** El extracto y el producto se distinguen **por la extensión**; el banco sigue
  saliendo de la carpeta y el nombre del archivo **no se valida nunca**, solo se usa para
  reportar.
- **(delegado)** `closedAt` es un campo opcional que escribes **una sola vez**; **dejar de
  escribir un producto NO lo cierra** — un olvido no puede desplomarte el patrimonio.
- **(delegado)** **El esquema de la feature 9 NO cambia**: ni una columna. De hecho estos
  formatos **cerraron dos de sus puntos abiertos** confirmándolo (el efectivo va fuera del total;
  una sola TAE por depósito).

## Qué NO se tocó / quedó fuera

- **La base de datos**: ni Prisma, ni migraciones, ni guardar un solo producto.
- **El parser del extracto** (feature 10) y su normalizador de números: intactos.
- **`myinvestor.routes.ts`**: ni una línea. El disparo es el mismo de siempre.
- **Enlazar movimientos con productos** (las aportaciones a la cartera, las compras del ETF, las
  aperturas de depósito que salen en el extracto): es de la feature de importación.
- **Cero dependencias nuevas** y ninguna variable de entorno nueva.
- **La plantilla que copias cada mes vive en Drive**, en una carpeta **hermana** de
  `notas-banco/`, y **el sistema no la crea ni la valida**. La del repo es la referencia; nadie
  comprueba que las dos coincidan.

## Notas para el futuro

1. **Privacidad — riesgo aceptado.** Los fixtures y la documentación llevaban tus cifras reales;
   se rechazó la primera pasada y **se sanearon** (código, docs, ADR y los cinco archivos del
   spec, más una fuga heredada de la feature 10). **Pero las cifras siguen en el histórico de
   git** y decidiste no reescribir la historia porque el repositorio es privado. Si algún día
   dejara de serlo, esto hay que revisarlo.
2. **Queda trabajo de saneamiento en otras features**, confirmado y listado en
   `progress/reviews/myinvestor-products.md`: la feature 9 (`docs/data-model.md`, ADR-012,
   `investments.model.test.ts`, su resumen y su review) y probablemente el fixture CSV de la
   feature 10. Merece una feature corta con un guardián automático que impida la recaída.
3. **Nadie guarda todavía los productos.** Cuando exista esa feature, su regla de recarga es
   **sobrescribir** (la contraria a la del importador de movimientos), y le toca escribir
   `InvestmentProduct.closedAt` a partir del campo del archivo.
4. **`tsconfig.tsbuildinfo` sigue versionado** y cambia en cada `./init.sh`: debería ir al
   `.gitignore`.
5. **La cabecera de `myinvestor.types.ts`** sigue diciendo que el IBAN de este banco es «siempre
   `null`», cosa que la feature 12 derogó.
6. **Recuerda la convención de nombre** `<producto>-<AAAA-MM-DD>.json`: si subes `fondo.json`
   todos los meses al mismo año, cada descarga pisa la copia local anterior.
