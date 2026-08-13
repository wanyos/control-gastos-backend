# Resumen — feature 9 `investments-data-model`

Fecha de cierre: 2026-08-11
Intención original: `feature_list.json` → feature `investments-data-model`, bloque `intent`
Spec (SDD): [`specs/investments-data-model/`](../../specs/investments-data-model/decisions.md)

## Qué hace ahora la app que antes no

Ahora la base de datos **sabe guardar tus inversiones**. Antes no existía ningún
sitio donde meter un fondo, un ETF, un depósito o la cartera automatizada, así
que el patrimonio sencillamente no existía en la aplicación.

Con esta feature hay **dos tablas nuevas**:

- **`InvestmentProduct`** — el producto: banco, nombre, tipo, divisa, cuándo se
  abrió y cuándo se cerró. Si es un **depósito**, además guarda sus cuatro
  condiciones propias (capital, TAE, ganancia final y vencimiento), que en los
  otros tres tipos quedan vacías. **Una sola tabla para los cuatro tipos**, como
  pediste.
- **`Valuation`** — la **foto** de un producto en una fecha: cuánto llevas metido,
  cuánto vale hoy, cuánto ganas, en qué porcentaje y cuánto queda sin invertir.
  Una foto por producto y fecha; las de meses distintos **se conservan todas**, así
  que la serie histórica queda disponible.

Y una **columna nueva en los movimientos** (`Movement.productId`) que permitirá
enlazar tu aportación mensual con el producto al que fue ese dinero. Hoy la
columna existe pero **nadie la escribe todavía**: eso es de una feature posterior.

Importante para entender el alcance: esto es **solo el almacén**. No hay pantallas
ni endpoints ni lector de ficheros: exactamente el mismo alcance que la feature 8
tuvo con el flujo.

## Por dónde se usa (puntos de entrada)

**Ninguno todavía, a propósito.** Esta feature no abre ninguna URL ni ningún
comando: las tablas están en la base de datos esperando a quien las llene.

- La capa de inversiones **no expone endpoints**; queda anotado en
  [api-contract.md:168](../../docs/api-contract.md#L168).
- `GET /api/movements` **devuelve exactamente lo mismo que antes**: la columna
  nueva no se filtra al contrato.
- Quien las usará: el **parser** del fichero de MyInvestor (feature 10) y el
  **importador** (feature 12), que escribirán productos y fotos.

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de
> Markdown de VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### El esquema (lo que define las tablas)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los cuatro tipos de producto, ni uno más | `InvestmentProductType` | [schema.prisma:58](../../prisma/schema.prisma#L58) |
| El producto, con lo común de todos | `model InvestmentProduct` | [schema.prisma:138](../../prisma/schema.prisma#L138) |
| Las cuatro columnas propias del depósito (vacías en los demás) | `principal`, `interestRate`, `expectedGain`, `maturityDate` | [schema.prisma:153](../../prisma/schema.prisma#L153) |
| Aviso de que la TAE va **en porcentaje** (`2.7500` = 2,75 %) | comentario | [schema.prisma:154](../../prisma/schema.prisma#L154) |
| Dos productos con el mismo nombre en el mismo banco no pueden coexistir | `@@unique([bank, name])` | [schema.prisma:167](../../prisma/schema.prisma#L167) |
| La foto periódica, con los cinco números tal cual vienen | `model Valuation` | [schema.prisma:172](../../prisma/schema.prisma#L172) |
| Una sola foto por producto y fecha (recargar sobrescribe) | `@@unique([productId, date])` | [schema.prisma:193](../../prisma/schema.prisma#L193) |
| La columna que enlazará un movimiento con su producto | `productId Int?` | [schema.prisma:124](../../prisma/schema.prisma#L124) |
| Su índice, gemelo del de traspasos | `@@index([productId])` | [schema.prisma:131](../../prisma/schema.prisma#L131) |

### La migración (lo que crea las tablas de verdad)

| Qué hace | Código |
| --- | --- |
| Todo el cambio, **generado por Prisma, sin una línea de SQL a mano** | [migration.sql:1](../../prisma/migrations/20260811152117_investments/migration.sql#L1) |
| La columna nueva en `Movement` (añadir, nunca modificar lo existente) | [migration.sql:5](../../prisma/migrations/20260811152117_investments/migration.sql#L5) |
| Los tres índices, todos declarativos | [migration.sql:43](../../prisma/migrations/20260811152117_investments/migration.sql#L43) |

### Tests (23 nuevos, todos contra el PostgreSQL real)

| Qué cubre | Código |
| --- | --- |
| Alta de un producto con todos sus datos comunes | [investments.model.test.ts:120](../../src/modules/investments/investments.model.test.ts#L120) |
| Los cuatro tipos existen, y **solo** esos cuatro | [investments.model.test.ts:143](../../src/modules/investments/investments.model.test.ts#L143) |
| Fondo, ETF y cartera llevan exactamente los mismos campos | [investments.model.test.ts:166](../../src/modules/investments/investments.model.test.ts#L166) |
| El depósito guarda sus cuatro condiciones; en un fondo quedan vacías | [investments.model.test.ts:208](../../src/modules/investments/investments.model.test.ts#L208) |
| Nombre repetido en el mismo banco: rechazado; en otro banco: permitido | [investments.model.test.ts:254](../../src/modules/investments/investments.model.test.ts#L254) |
| Una foto completa vuelve con sus céntimos exactos | [investments.model.test.ts:269](../../src/modules/investments/investments.model.test.ts#L269) |
| Pérdidas: ganancia y porcentaje negativos, idénticos | [investments.model.test.ts:293](../../src/modules/investments/investments.model.test.ts#L293) |
| Sin dinero sin invertir se guarda vacío; con él se conserva | [investments.model.test.ts:308](../../src/modules/investments/investments.model.test.ts#L308) |
| La ganancia se guarda **tal cual**, aunque no cuadre con la resta | [investments.model.test.ts:325](../../src/modules/investments/investments.model.test.ts#L325) |
| Tres meses del mismo fondo, sin pisarse y en orden | [investments.model.test.ts:354](../../src/modules/investments/investments.model.test.ts#L354) |
| Dos fotos del mismo producto y fecha: rechazado | [investments.model.test.ts:396](../../src/modules/investments/investments.model.test.ts#L396) |
| Recargar el mismo archivo sobrescribe: sigue habiendo **una** foto | [investments.model.test.ts:410](../../src/modules/investments/investments.model.test.ts#L410) |
| Un movimiento enlazado a su producto, recuperado enlazado | [investments.model.test.ts:439](../../src/modules/investments/investments.model.test.ts#L439) |
| Un movimiento normal sigue sin producto | [investments.model.test.ts:466](../../src/modules/investments/investments.model.test.ts#L466) |
| Límite conocido: hoy la BD **no** impide una foto sobre un depósito | [investments.model.test.ts:497](../../src/modules/investments/investments.model.test.ts#L497) |
| Guardián: no hay ninguna restricción `CHECK` en `Valuation` | [investments.model.test.ts:510](../../src/modules/investments/investments.model.test.ts#L510) |
| La migración creó de verdad las tablas y los tres índices | [investments.model.test.ts:521](../../src/modules/investments/investments.model.test.ts#L521) |

### Documentación

| Qué explica | Código |
| --- | --- |
| El modelo de inversiones en cristiano, con el cálculo del patrimonio | [data-model.md:364](../../docs/data-model.md#L364) |
| Las cinco reglas del modelo (la 4 y la 5 son nuevas) | [data-model.md:19](../../docs/data-model.md#L19) |
| La decisión completa, con lo descartado y por qué | [architecture.md:661](../../docs/architecture.md#L661) (ADR-012) |
| "La capa de inversiones no expone endpoints todavía" | [api-contract.md:168](../../docs/api-contract.md#L168) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ **"Doy de alta un fondo, un ETF y una cartera automatizada y los tres admiten
  exactamente los mismos datos; el depósito guarda además sus condiciones propias,
  que en los otros tres quedan vacías."** → se cumple. Los tres tipos se comparan
  campo a campo en
  [investments.model.test.ts:166](../../src/modules/investments/investments.model.test.ts#L166),
  y el depósito con sus cuatro condiciones (más el fondo con las cuatro vacías) en
  [investments.model.test.ts:208](../../src/modules/investments/investments.model.test.ts#L208).
  Todo en **una sola tabla**: no existe ninguna tabla `Fund`, `Etf` ni `Deposit`.
- ✅ **"Guardo la foto de un fondo con los cinco números tal como vienen y los
  recupero idénticos, incluidos los negativos."** → se cumple. Round-trip exacto
  al céntimo en
  [investments.model.test.ts:269](../../src/modules/investments/investments.model.test.ts#L269)
  (con números **inventados** —saneado en la F14, 2026-08-12: 8.250,45 / 9.500,60 /
  1.250,15 / 15,1525 % / 75,25— que conservan la relación de tu muestra) y los
  negativos en
  [investments.model.test.ts:293](../../src/modules/investments/investments.model.test.ts#L293)
  (−1.234,56 y −3,47 %).
- ✅ **"Tres fotos del mismo fondo en tres meses, con el capital creciendo, se
  conservan las tres sin pisarse."** → se cumple, y el test es exigente: las
  inserta **desordenadas** y comprueba que salen ordenadas por fecha con sus tres
  capitales y sus tres valores —
  [investments.model.test.ts:354](../../src/modules/investments/investments.model.test.ts#L354).
- ✅ **"Un producto que no trae dinero sin invertir se guarda sin ese dato, y otro
  que sí lo trae lo conserva."** → se cumple; las dos ramas en
  [investments.model.test.ts:308](../../src/modules/investments/investments.model.test.ts#L308).
- ✅ **"Volver a cargar el mismo archivo no duplica: la foto de una fecha es única
  y se queda con el último dato."** → se cumple por partida doble: el intento de
  duplicar se rechaza
  ([investments.model.test.ts:396](../../src/modules/investments/investments.model.test.ts#L396))
  y la recarga sobrescribe la misma fila
  ([investments.model.test.ts:410](../../src/modules/investments/investments.model.test.ts#L410):
  mismo identificador, valor nuevo, y sigue habiendo **una** foto).
- ✅ **"Un movimiento puede quedar enlazado a su producto y se recupera
  enlazado."** → se cumple:
  [investments.model.test.ts:439](../../src/modules/investments/investments.model.test.ts#L439)
  lo recupera con el producto dentro, y
  [investments.model.test.ts:466](../../src/modules/investments/investments.model.test.ts#L466)
  comprueba que un movimiento normal sigue sin producto.
- ✅ **"Aplico la migración sobre una base limpia y las tablas se crean sin error,
  y todo lo que ya funcionaba del flujo sigue funcionando exactamente igual."** →
  se cumple, y el reviewer lo repitió por su cuenta sobre una base de datos
  **creada vacía para la ocasión**: las tres migraciones se aplicaron sin error y
  el resultado no diverge ni un carácter del esquema. Del lado del flujo: el
  esquema tiene **77 líneas añadidas y 0 borradas**, ningún archivo de
  `accounts`/`categories`/`movements` se tocó y los **197 tests que había siguen
  pasando**, ahora acompañados de 23 nuevos (220 en total).

Y del `que_no_quiero`, lo que **no** se hizo, tal como pediste: no hay
participaciones ni valor liquidativo, la cartera es **un** producto sin desglose,
la ganancia **nunca** se calcula (hay un test que guarda a propósito una ganancia
que no cuadra con la resta y exige que se devuelva la guardada), el depósito no
lleva fotos, no hay una tabla por tipo, y **no hay endpoints, ni parser, ni
importador**.

## Decisiones que se tomaron por ti

Lo que en el spec estaba marcado como `(delegado)` o `(añadido)`, recordado aquí
para que lo tengas presente. **Las dos que confirmaste en la puerta se
implementaron tal cual, sin reabrirse.**

- 🔴 **(confirmada por ti) Que un depósito no tenga fotos es una regla del
  servicio, no de la base de datos.** Hoy, técnicamente, nada impide meter una
  foto sobre un depósito: es un **límite conocido**, escrito como test
  ([investments.model.test.ts:497](../../src/modules/investments/investments.model.test.ts#L497)).
  A cambio, la migración no tiene **ni una línea de SQL a mano**, y hay un test
  que salta si alguien intenta meterla a escondidas
  ([investments.model.test.ts:510](../../src/modules/investments/investments.model.test.ts#L510)).
- 🔴 **(confirmada por ti) Los importes llegan hasta ~100 millones de €**
  (`Decimal(10,2)`), el mismo techo que el modelo del flujo. Si algún día se sube,
  hay que subirlo **en las dos capas a la vez**.
- **(delegado) El nombre es la clave del producto** (`banco + nombre`). Como el
  fichero lo escribes tú, el nombre es estable y no hace falta ningún ISIN.
  ⚠️ **Efecto que debes conocer:** si un día **renombras** un producto en el
  fichero, el importador lo tomará por uno **nuevo** y la serie anterior se
  quedará colgando del nombre viejo.
- **(delegado) La TAE se guarda en porcentaje** (`2.7500` = 2,75 %), no como
  fracción, y de un depósito se guarda **una sola** TAE: la que se te aplica. La
  hipotética "sin Premium" no se guarda en ningún sitio.
- **(delegado) El efectivo sin invertir va APARTE del valor de mercado.** Era el
  único punto capaz de darte un patrimonio equivocado, y lo confirmaste tú: el
  patrimonio de un producto es **valor de mercado + efectivo sin invertir**, sin
  contar nada dos veces. La aritmética de tus muestras lo demuestra y está escrita
  en [data-model.md:586](../../docs/data-model.md#L586).
- **(delegado) Recargar el mismo fichero sobrescribe** (gana el último), al revés
  que en los movimientos, donde un duplicado se descarta. Está la tabla que
  compara ambos casos en [data-model.md:531](../../docs/data-model.md#L531) para
  que nadie invente una tercera regla.
- **(añadido) La regla "una aportación no cuenta como gasto" está DOCUMENTADA
  pero no implementada.** La columna existe, nadie la escribe, y por eso los
  totales todavía no la excluyen. **Efecto práctico hoy: cero**, porque la columna
  siempre vale vacío. Se implementará junto a quien la rellene.
- **(añadido) El módulo `src/modules/investments/` tiene un solo archivo, su
  test.** No se puso ningún guardián de "esta carpeta solo puede tener un
  archivo", a propósito: esa carpeta está pensada para crecer con el servicio del
  importador.

## Qué NO se tocó / quedó fuera

- **El modelo del flujo, entero.** Cuentas, categorías y movimientos siguen
  exactamente igual: la única línea que los roza es la columna nueva
  `Movement.productId`. Ni un servicio, ni un endpoint, ni un test del flujo
  cambió.
- **Nada de leer ficheros.** El parser del banco de inversión (feature 10) y el
  importador que escriba productos y fotos (feature 12) están fuera.
- **Nada de pantallas ni de API de inversiones:** no hay endpoints todavía.
- **Nada de dashboards de patrimonio.** El **cálculo** queda escrito en
  [data-model.md:586](../../docs/data-model.md#L586), pero la consulta que lo
  responda es de otra feature.
- **Sin dependencias ni variables de entorno nuevas.**

## Notas para el futuro

1. **Cuando llegue quien escriba `Movement.productId`**, hay que excluir en esa
   misma feature los movimientos con producto de los totales globales
   (`computeTotals`). Si no, tus aportaciones mensuales seguirán contando como
   gasto del mes.
2. **`InvestmentProduct.openedAt` se quedará siempre vacío**: el formato del
   fichero no lleva ese campo. No es un problema (la columna ya existe: admitirlo
   algún día sería cero migración), pero conviene saberlo.
3. **La cuenta corriente de MyInvestor habrá que darla de alta a mano**, y con un
   saldo inicial **correcto**: su extracto no trae IBAN ni saldo por línea, así
   que ese saldo inicial será el **único ancla** de esa cuenta.
4. **Dos nits de documentación** detectados en la review, de una línea cada uno:
   en la tabla de columnas reservadas, `status` aparece dos veces
   ([data-model.md:209](../../docs/data-model.md#L209)) y una nota dice "las dos
   últimas filas" cuando son tres
   ([data-model.md:216](../../docs/data-model.md#L216)).
5. **`prisma/schema.prisma` no está en la forma canónica de `prisma format`**
   (tampoco lo estaba antes). Se dejó así **a propósito**, para que el diff de
   esta feature fuera estrictamente aditivo y se pudiera demostrar que el flujo no
   se tocó. Si algún día se quiere reformatear, mejor como tarea propia y aislada.
