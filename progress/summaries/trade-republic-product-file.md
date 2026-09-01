# Resumen — feature 20 `trade-republic-product-file`

Fecha de cierre: 2026-08-20
Intención original: `feature_list.json` → feature `trade-republic-product-file`, bloque `intent`
Spec (SDD): [`specs/trade-republic-product-file/`](../../specs/trade-republic-product-file/decisions.md)
Prueba real (C4 bis): [`explorations/prueba-real-trade-republic-2026-08-20.md`](../explorations/prueba-real-trade-republic-2026-08-20.md)

## Qué hace ahora la app que antes no

**Trade Republic es el quinto banco que entra en el sistema, y el único que entra sin
parser de lo que emite el banco.** Su extracto es un PDF con dos apuntes al mes y no
merecía un parser, así que en su lugar **escribes tú un `.json` al mes**, lo dejas en su
carpeta de Drive y el backend lo lee por `POST /api/parser/trade-republic`, exactamente
igual que ya hacía con los productos de inversión de MyInvestor. Tienes una plantilla
copiable, `docs/plantillas/trade-republic-cuenta-remunerada.json` (**retirado del repositorio el 2026-08-22**; el formato vive en [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md)),
donde **todos** los valores son marcadores `<…>`: lo que te dejes sin rellenar canta a la
vista, y si aun así se cuela, el parser lo rechaza **nombrando los diez campos**.

Lo que este banco trae y ningún otro tenía: **el archivo se comprueba a sí mismo**. Los
cinco importes que escribes tienen que cuadrar —`saldo inicial + entradas − salidas +
intereses = saldo final`— y un descuadre **rechaza el archivo**, no lo avisa. Sin eso, un
mes con el abono de intereses escrito en la casilla equivocada habría entrado en silencio
con los intereses contados como ingreso; la prueba real cometió esa errata exacta y el
cuadre la paró.

Los motivos de error llegan **todos de golpe y por su nombre** (campo que falta, número
con coma decimal, número entre comillas, fecha en otro formato, clave desconocida,
marcador sin sustituir), y el mensaje de descuadre enseña **la desviación con signo, el
saldo esperado frente al escrito, la fórmula en castellano y los cinco importes**.

Como los productos de MyInvestor, esto **no toca la base de datos**: parsea y vuelca un
JSON por año en `var/parsed/`. Y queda escrito que es **provisional**: el día que la
cuenta tenga movimientos de verdad se escribe el parser del PDF.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/trade-republic` — recorre tus copias locales de
  `var/drive-read/trade-republic/<año>/`, parsea cada `.json` y deja el volcado del año en
  `var/parsed/`. Devuelve 200 aunque un archivo falle: el fallo va dentro, en `failed[]`.
  Ver [trade-republic.routes.ts:41](../../src/modules/trade-republic/trade-republic.routes.ts#L41).
- **La plantilla que copias cada mes**:
  `docs/plantillas/trade-republic-cuenta-remunerada.json` (**retirado del repositorio el 2026-08-22**; el formato vive en [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md)),
  y el runbook con de dónde sale cada campo en
  [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md).
- **No** entra en el registro de parsers de `POST /api/import`: este banco no tiene
  extracto que importar. Es deliberado y hay test que lo fija.

## Dónde está el código (para revisión directa)

### El parser del archivo (lo principal)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Un archivo → cuenta parseada o **el motivo** (nunca lanza) | `parseTradeRepublicProduct` | [trade-republic.product.parser.ts:47](../../src/modules/trade-republic/trade-republic.product.parser.ts#L47) |
| El cuadre de los cinco importes, en **céntimos enteros**, tolerancia 1 céntimo | `checkBalanceEquation` | [trade-republic.product.parser.ts:172](../../src/modules/trade-republic/trade-republic.product.parser.ts#L172) |
| El cuadre **no se evalúa** si falta alguno de los cinco (un campo que falta no genera además un descuadre) | — | [trade-republic.product.parser.ts:101](../../src/modules/trade-republic/trade-republic.product.parser.ts#L101) |
| Reconoce un marcador `<…>` a medio sustituir (`name` es la trampa: un marcador *es* un texto válido) | `isMarker` | [trade-republic.product.parser.ts:221](../../src/modules/trade-republic/trade-republic.product.parser.ts#L221) |
| Número escrito como texto o con coma decimal, por su nombre | `readNumberField` | [trade-republic.product.parser.ts:298](../../src/modules/trade-republic/trade-republic.product.parser.ts#L298) |
| Fecha `AAAA-MM-DD` que además exista de verdad | `readIsoField`, `parseIsoDate` | [trade-republic.product.parser.ts:329](../../src/modules/trade-republic/trade-republic.product.parser.ts#L329), [:366](../../src/modules/trade-republic/trade-republic.product.parser.ts#L366) |
| Claves desconocidas por su nombre; las que empiezan por `_` se ignoran | `reportUnknownKeys` | [trade-republic.product.parser.ts:394](../../src/modules/trade-republic/trade-republic.product.parser.ts#L394) |

### El recorrido de la carpeta

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Recorre `<año>/`, parsea, aísla el fallo por archivo y vuelca | `parseLocalTradeRepublicCopies` | [trade-republic.service.ts:48](../../src/modules/trade-republic/trade-republic.service.ts#L48) |
| Lee en **UTF-8 estricto** (no `readFile(…, 'utf8')`): un archivo tuyo guardado en cp1252 no pierde los acentos en silencio | `parseAccountFile` | [trade-republic.service.ts:128](../../src/modules/trade-republic/trade-republic.service.ts#L128) |
| El `.pdf` va a `ignored[]` con su motivo, **no** es un fallo | — | [trade-republic.service.ts:71](../../src/modules/trade-republic/trade-republic.service.ts#L71) |
| Dos archivos con la misma cuenta y la misma fecha = copia duplicada de Drive | `findClash` | [trade-republic.service.ts:142](../../src/modules/trade-republic/trade-republic.service.ts#L142) |
| Un `products.json` por año, solo si el año tiene algún `.json` | `dumpProducts` | [trade-republic.service.ts:157](../../src/modules/trade-republic/trade-republic.service.ts#L157) |

### Tipos, ruta y fixtures

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| La cuenta remunerada: su forma propia, sin compartir tipo con MyInvestor | `ParsedSavingsAccount` | [trade-republic.types.ts:30](../../src/modules/trade-republic/trade-republic.types.ts#L30) |
| Lo que devuelve el endpoint | `TradeRepublicParseRunResult` | [trade-republic.types.ts:95](../../src/modules/trade-republic/trade-republic.types.ts#L95) |
| La ruta `POST /api/parser/trade-republic` | `tradeRepublicRoutes` | [trade-republic.routes.ts:34](../../src/modules/trade-republic/trade-republic.routes.ts#L34) |
| Archivos de cuenta **inventados** y el texto literal de la plantilla | `buildSavingsAccount`, `tradeRepublicTemplate` | [trade-republic.fixture.ts:27](../../src/modules/trade-republic/trade-republic.fixture.ts#L27), [:95](../../src/modules/trade-republic/trade-republic.fixture.ts#L95) |
| El módulo entra en la app | — | [app.ts:19](../../src/app.ts#L19) y [:65](../../src/app.ts#L65) |

### Tests

| Qué cubre | Código |
| --- | --- |
| La plantilla copiada **sin rellenar** se rechaza nombrando los diez campos | [parser.test.ts:77](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L77) |
| Los nueve campos entran **tal cual escritos**, sin calcular ni redondear | [parser.test.ts:30](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L30) |
| Campos obligatorios que faltan, **todos** por su nombre | [parser.test.ts:111](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L111) |
| Número como texto, coma decimal, fecha mala, `type` no admitido | [parser.test.ts:154](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L154) |
| Claves desconocidas por su nombre; las `_` no fallan | [parser.test.ts:215](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L215) |
| Cinco problemas distintos → **un solo motivo** | [parser.test.ts:242](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L242) |
| El descuadre **rechaza**, con desviación con signo, esperado vs escrito y los cinco importes | [parser.test.ts:264](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L264) |
| 1 céntimo pasa, **2 no**; y la tolerancia perdona, no corrige el saldo | [parser.test.ts:289](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L289), [:297](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L297) |
| Un campo que falta **no** produce además un descuadre (motivo exacto) | [parser.test.ts:310](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L310) |
| `moneyIn` **sin** los intereses (regresión de la errata más fácil) | [parser.test.ts:327](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L327) |
| Recorrido del año, un volcado por año, UTF-8 estricto con bytes cp1252 reales | [service.test.ts:40](../../src/modules/trade-republic/trade-republic.service.test.ts#L40), [:123](../../src/modules/trade-republic/trade-republic.service.test.ts#L123) |
| El `.pdf` sale en `ignored[]` y `failed` vacío | [service.test.ts:140](../../src/modules/trade-republic/trade-republic.service.test.ts#L140) |
| Un `.json` roto se aísla y el resto se parsea igual; choque `(nombre, fecha)` | [service.test.ts:158](../../src/modules/trade-republic/trade-republic.service.test.ts#L158), [:187](../../src/modules/trade-republic/trade-republic.service.test.ts#L187) |
| El endpoint responde 200 aun con fallos dentro, y **no** entra en el registro de `/api/import` | [routes.test.ts:45](../../src/modules/trade-republic/trade-republic.routes.test.ts#L45), [:127](../../src/modules/trade-republic/trade-republic.routes.test.ts#L127) |
| El **candado de identidad a tres bandas**: el `.json` copiable, el bloque del documento y la plantilla del test son byte a byte lo mismo, y ningún valor es copiable | [docs.test.ts:113](../../src/modules/trade-republic/trade-republic.docs.test.ts#L113) |
| Módulo aislado: ni comparte con otro banco, ni menciona `prisma` | [architecture.test.ts:342](../../src/architecture.test.ts#L342), [:358](../../src/architecture.test.ts#L358) |

## Cumplimiento de la intención

- ✅ «Tengo una plantilla `.json` que copiar cada mes, con marcadores tipo `<…>` para que
  se vea a simple vista lo que me he dejado sin rellenar» → se cumple, y además la
  plantilla es un **archivo copiable** aparte del documento, con test que impide que las
  tres copias se separen. Verificado en
  [docs.test.ts:113](../../src/modules/trade-republic/trade-republic.docs.test.ts#L113) y
  [parser.test.ts:77](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L77).
- ✅ «Relleno el archivo, lo dejo en la carpeta de Trade Republic de Drive y el backend lo
  lee y me dice si está bien o qué le falta» → se cumple, **y está probado con tu archivo
  real**: `productCount: 1`, `failedCount: 0`, `ignoredCount: 1`
  ([prueba real](../explorations/prueba-real-trade-republic-2026-08-20.md)). Verificado
  además en [service.test.ts:40](../../src/modules/trade-republic/trade-republic.service.test.ts#L40).
- ✅ «Si escribo un número con coma decimal, o una fecha en otro formato, me lo dice por su
  nombre, como ya hace el de MyInvestor» → se cumple, y **todos de golpe**. Verificado en
  [parser.test.ts:154](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L154)
  y [:242](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L242).
- ✅ «Queda escrito que esto es provisional: el día que la cuenta tenga movimientos de
  verdad, se hace el parser» → se cumple, en la plantilla **y** en el roadmap, con test que
  lo vigila. Verificado en
  [docs.test.ts:91](../../src/modules/trade-republic/trade-republic.docs.test.ts#L91) y
  [:98](../../src/modules/trade-republic/trade-republic.docs.test.ts#L98).
- ✅ «No quiero un parser del PDF ahora» → el `.pdf` ni se abre: se lista como **ignorado**
  con su motivo. [service.test.ts:140](../../src/modules/trade-republic/trade-republic.service.test.ts#L140).
- ✅ «No quiero que esto toque la base de datos» → no se toca `prisma/schema.prisma` y hay
  guardián que prohíbe que el módulo mencione siquiera Prisma.
  [architecture.test.ts:342](../../src/architecture.test.ts#L342).
- ✅ «No quiero que el archivo de Trade Republic use el parser de MyInvestor» → módulo
  propio, tipos propios, cero imports cruzados.
  [architecture.test.ts:358](../../src/architecture.test.ts#L358).

## Decisiones que se tomaron por ti

- **(delegada)** *Qué campos lleva una cuenta remunerada*: diez —`type`, `name`, `date`,
  `openedAt`, `closedAt`, `openingBalance`, `moneyIn`, `moneyOut`, `interest`, `balance`—,
  ninguno calculado por ti. **IBAN y TAE quedan fuera** a propósito, y el documento dice
  por qué y qué los traería de vuelta. Escrito en el **ADR-024** de `docs/architecture.md`.
- **(delegada)** *Forma de la salida*: propia de este banco, no la de los productos de
  MyInvestor. El código del formato no se comparte; el tipo tampoco, porque una cuenta
  remunerada no es ninguno de los cuatro productos que ya existían.
- **(añadido, y aprobado por ti en la puerta del spec)** *El cuadre aritmético que
  **rechaza***: los cinco importes tienen que cuadrar al céntimo (tolerancia de 1 céntimo,
  aritmética en enteros). No es un aviso: el archivo no entra.
- **(añadido)** *Los marcadores numéricos van entre comillas en la plantilla*, para que la
  plantilla entera sea JSON válido y el rechazo pueda **nombrar los diez campos** en vez de
  morir con un «JSON inválido» que no dice nada. El propio marcador te avisa de quitarlas.
- **(añadido)** *El parser reconoce un marcador a medio sustituir*: sin eso, la cuenta
  habría entrado llamándose `<cómo llamas tú a esta cuenta>` — el accidente exacto del
  2026-08-15.
- **(añadido)** *Se lee en UTF-8 estricto*: este banco no hereda la lectura laxa que sigue
  teniendo MyInvestor.

## Qué NO se tocó / quedó fuera

- **No se persiste nada**: parsea y vuelca JSON, como los productos de MyInvestor.
- **No hay parser del PDF**, y esto es **provisional por diseño**: el día que la cuenta
  tenga movimientos de verdad, se escribe el parser y este `.json` a mano desaparece. El
  diagnóstico del PDF ya está hecho en
  [`explorations/inventario-bancos-2026-08-17.md`](../explorations/inventario-bancos-2026-08-17.md).
- **Este banco no entra en `POST /api/import`**: no tiene extracto que importar.
- **Falta Revolut** para cerrar el inventario de seis bancos: su carpeta y su fichero ya se
  bajan de Drive, pero **nadie los parsea todavía** (E4: 5 de 6).

## Notas para el futuro

- **Lo que dejó la prueba real, ya cerrado:** la documentación afirmaba que los tres
  importes del mes salían del **resumen** del extracto, y es **falso** —el resumen es del
  **periodo entero**, y seguirlo al pie de la letra daba descuadre garantizado todos los
  meses—. Corregido: los tres salen de la **tabla de transacciones**
  ([`docs/trade-republic-product-files.md:66`](../../docs/trade-republic-product-files.md#L66)).
  El otro hallazgo, 270 avisos falsos del guardián de datos reales, salió como la **F24
  `guardian-own-words`**, ya cerrada.
- **Candidato pendiente de tu sí:** cuando te dejas un `<` de la plantilla sin borrar en
  una fecha, el motivo dice «fecha inválida», que es verdad pero no ayuda. Es la errata
  número uno al rellenar a mano —sobrevivió incluso a una corrección con las erratas
  señaladas una a una— y el parser tiene la prueba delante.
- **Sugerencias fuera de scope** que anotó el implementer y siguen abiertas: MyInvestor
  sigue leyendo sus `.json` con `readFile(…, 'utf8')` (un archivo suyo en cp1252 pierde los
  acentos en silencio); el árbol de `docs/architecture.md` no lista `modules/n26/` ni
  `modules/openbank/`; `FailedFile`/`IgnoredFile` están declarados por quintuplicado y toca
  revisarlos cuando entre el tercer banco por `.json` escrito a mano; y
  `normalizeBankName('Trade Republic')` —el único nombre de carpeta con espacio— no está en
  el guardián que sí comprueba los otros tres.
