# Design — F26 `savings-account-as-product`

> **Material del `implementer` y del `reviewer`.** La hoja del humano es
> [`decisions.md`](decisions.md).
>
> Este documento no hace ingeniería desde cero: se apoya en `docs/architecture.md`
> (ADR-012 modelo de inversiones, ADR-013 contrato de salida, ADR-015 importador
> con registro inyectado, ADR-017 datos reales, ADR-024 Trade Republic sin parser,
> ADR-025 `procesados/` de dos sentidos) y en `docs/conventions.md`. Solo documenta
> dónde esta feature roza esas fronteras.

---

## 0. Estado de partida, verificado el 2026-08-20

Medido sobre el repo, no de memoria:

| Hecho | Dónde se comprueba |
|---|---|
| `InvestmentProduct` y `Valuation` existen y están probadas | [`prisma/schema.prisma`](../../prisma/schema.prisma) líneas 138-194, [`investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) |
| Nadie escribe en ellas fuera de los tests: `src/modules/investments/` **solo** contiene su test | `ls src/modules/investments/` → un único archivo |
| Clave natural `@@unique([bank, name])`, con el comentario «the name is written by hand in the product file… Reloading the same file upserts on it» | `prisma/schema.prisma` líneas 165-167 |
| El enum tiene **cuatro** valores: `fund \| etf \| managed_portfolio \| deposit` | `prisma/schema.prisma` líneas 58-63 |
| `Valuation` habla de `invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash` | `prisma/schema.prisma` líneas 172-194 |
| El registro de parsers de `POST /api/import` tiene 4 bancos y **no** a `trade-republic` | [`src/app.ts`](../../src/app.ts) líneas 41-46 |
| `selectAdapter` devuelve `no hay parser para el banco <slug>` / `extensión no soportada por el parser de <slug>` | [`import.service.ts`](../../src/modules/import/import.service.ts) líneas 417-431 |
| El contrato del futuro importador ya estaba escrito: **dos upserts**, `(bank, name)` y `(productId, date)` | `docs/architecture.md` §ADR-012 decisión 6 |

### Por qué el alcance se corta en Trade Republic

MyInvestor aporta **cuatro** tipos de producto (uno de ellos, `deposit`, sin serie
de fotos) y su propio parser de `.json`, con su propia forma de salida
(`ParsedProduct`, con `valuation` y `depositTerms` nullables). Meterlo aquí añade
como poco 5-6 requirements (upsert de `Valuation`, rama del depósito, regla del
servicio de ADR-012 decisión 9, adaptador propio, sus errores), lo que llevaría el
spec a ~21 y por encima del tope de `docs/specs.md`. **El servicio de persistencia
que esta feature construye está diseñado para que la feature hermana solo tenga que
añadir un adaptador y un segundo upsert**: la vía se construye una vez, se usa dos.

---

## 1. La forma: dónde viven los cinco importes

El humano ya cerró que la cuenta remunerada es un producto de inversión. Lo que
había que resolver es que **`Valuation` no le sirve**:

| Importe del archivo | Columna de `Valuation` que le tocaría | Verdad |
|---|---|---|
| `balance` | `marketValue` | plausible, pero un saldo no es un valor de mercado |
| `interest` | `gain` | falso: `gain` es la ganancia **acumulada** frente a lo invertido, no la del mes |
| `openingBalance` | — | no tiene sitio |
| `moneyIn` | — | no tiene sitio |
| `moneyOut` | — | no tiene sitio |
| — | `invested` (NOT NULL) | no existe: en una cuenta remunerada no hay «lo invertido» |

Tres de los cinco importes se perderían, y con ellos **la posibilidad de volver a
comprobar el cuadre desde la base de datos**. Eso choca de frente con
`que_no_quiero` nº 2.

### Decisión: tabla propia `SavingsSnapshot`, gemela de `Valuation`

```prisma
enum InvestmentProductType {
  fund
  etf
  managed_portfolio
  deposit
  savings_account  // feature 26: no fluctúa, crece con los intereses
}

/// La foto mensual de una cuenta remunerada. Gemela de `Valuation` en oficio
/// (una fila por producto y fecha, recarga por UPSERT, nada se calcula) y
/// distinta en contenido: aquí no hay valor de mercado ni ganancia acumulada,
/// hay un saldo que se mueve por entradas, salidas e intereses.
model SavingsSnapshot {
  id        Int               @id @default(autoincrement())
  product   InvestmentProduct @relation(fields: [productId], references: [id])
  productId Int
  date      DateTime          @db.Date

  openingBalance Decimal @db.Decimal(10, 2)
  moneyIn        Decimal @db.Decimal(10, 2)
  moneyOut       Decimal @db.Decimal(10, 2)
  interest       Decimal @db.Decimal(10, 2)
  balance        Decimal @db.Decimal(10, 2)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([productId, date])
}
```

y en `InvestmentProduct`, una línea: `savingsSnapshots SavingsSnapshot[]`.

**Los cinco son NOT NULL** (a diferencia de `gain`/`gainPercent` en `Valuation`)
porque el parser ya los exige todos: un archivo al que le falte uno **no llega**
a la base (R8), así que no hay ningún camino que pueda producir un hueco.

**Alternativas descartadas:**

1. **Mapear sobre `Valuation`** (`marketValue ← balance`, `invested ←
   openingBalance`, `gain ← interest`): descartada. Perdería `moneyIn` y
   `moneyOut`, y sobre todo **mentiría**: cualquier vista futura de patrimonio
   sumaría `invested` de una cuenta remunerada como si fuera capital invertido.
   Es la misma trampa que ADR-012 rechazó al negarse a modelar productos como
   `Account`: contaminar un modelo existente en vez de construir encima.
2. **Ensanchar `Valuation`** con los cinco importes nullable y aflojar
   `invested`/`marketValue` a NULL: descartada. Debilita dos `NOT NULL` que hoy
   son ciertos, deja cinco columnas siempre nulas para los cuatro tipos de
   inversión y otras cinco siempre nulas para la cuenta remunerada, y obliga a
   toda consulta futura a preguntar por el `type` antes de leer una columna.
3. **`Account` de tipo `savings` en el modelo del flujo**: descartada. Es lo que
   el humano descartó él mismo («creo que su sitio» es el producto de inversión) y
   ADR-012 ya lo razonó: un producto no tiene IBAN, y el IBAN es clave natural
   obligatoria y única de `Account`. Además arrastraría la cuenta al índice de
   dedup, a los totales de gasto y al cálculo de saldo del flujo.
4. **Una tabla `SavingsAccount` independiente de `InvestmentProduct`**:
   descartada. Duplicaría `bank`, `name`, `currency`, `openedAt`, `closedAt` y la
   clave natural, que es exactamente lo que ADR-012 evitó con «una sola tabla de
   producto».

### La migración

`prisma/migrations/<ts>_savings_account_as_product/migration.sql`, **aditiva**:

```sql
ALTER TYPE "InvestmentProductType" ADD VALUE 'savings_account';
CREATE TABLE "SavingsSnapshot" (...);
CREATE UNIQUE INDEX "SavingsSnapshot_productId_date_key" ON "SavingsSnapshot"("productId", "date");
ALTER TABLE "SavingsSnapshot" ADD CONSTRAINT ... FOREIGN KEY ("productId") REFERENCES "InvestmentProduct"("id") ...;
```

- ⚠️ **`ALTER TYPE … ADD VALUE` no puede ir en el mismo bloque transaccional que
  un uso posterior del valor** en PostgreSQL. Aquí no se usa el valor nuevo en la
  migración (no hay backfill), así que basta con dejarlo en su propia sentencia,
  la primera del archivo. Si Prisma genera dos migraciones, se dejan las dos.
- **Cero backfill:** `InvestmentProduct` y `Valuation` están vacías en la base
  real (nadie escribe en ellas fuera de los tests), así que no hay ni una fila que
  migrar. Nada de `Account` ni de `Movement` se toca (R14).
- **Cero SQL crudo añadido a mano** más allá del que genera Prisma: el índice es
  declarativo, como pide ADR-012 decisión 7.

---

## 2. Por dónde entra

### Decisión: `POST /api/import` gana un SEGUNDO registro, el de productos

`src/app.ts` es el único archivo de `src/` autorizado a nombrar bancos (ADR-015).
Hoy construye `parsers: BankParserRegistry`; pasa a construir además:

```ts
const productParsers: ProductParserRegistry = [
  {
    bank: 'trade-republic',
    extensions: ['.json'],
    parse: parseTradeRepublicProductFile, // (fileName: string, content: Buffer) => SavingsSnapshotInput
  },
]
app.register(importRoutes, { prefix: '/api/import', parsers, productParsers })
```

El importador sigue **sin conocer ningún banco**: elige el camino con la misma
regla de siempre —la carpeta dice el banco, la extensión dice el parser— y ahora
consulta **dos** registros:

```
selectAdapter(parsers, slug, name)          → extracto  → importStatement()   (sin cambios)
selectProductAdapter(productParsers, slug, name) → producto → importProductFile()  (nuevo)
ninguno de los dos                          → skipped   (sin cambios)
```

**El orden importa y es: primero extractos, después productos.** Ningún banco
declara hoy la misma extensión en los dos registros, y si algún día lo hiciera, un
guardián lo detecta (ver §5).

**Alternativas descartadas:**

- **Ruta aparte** (`POST /api/investments/import`): descartada. El humano tendría
  que pulsar dos botones cada mes y acordarse de cuál va con cada archivo, y
  habría que duplicar el recorrido de Drive, el movimiento a `procesados/` y el
  informe. El coste de la alternativa lo paga él todos los meses.
- **Añadir persistencia a `POST /api/parser/trade-republic`**: descartada.
  Rompería ADR-024 y su guardián («el módulo del banco no menciona la base de
  datos»), y mezclaría el ensayo con la escritura de verdad, que es justo lo que
  hace útil al ensayo.
- **Un tercer valor de `BankParserAdapter`** (un `kind: 'statement' | 'product'`
  en el mismo registro): descartada. `parse` devolvería `ParsedStatement |
  SavingsSnapshotInput`, una unión que obligaría a discriminar en cada uso — la
  misma rama nullable que ADR-013 rechazó con `providesBalance`. Dos registros
  separados es una unión resuelta en el sitio donde se elige, una sola vez.

### Qué pasa con `var/parsed/`

**Sigue existiendo y cambia de oficio.** Deja de ser la base de datos falsa y pasa
a ser el **ensayo**: `POST /api/parser/trade-republic` no se toca, no persiste
nada y sigue escribiendo `var/parsed/trade-republic/<año>/products.json` con lo
interpretado, lo fallido y lo ignorado. Sirve para **mirar qué ha entendido el
sistema de tu archivo antes de meterlo en la base**, y para revisar un archivo sin
escribir. El camino del import **no** escribe en `var/parsed/`: persiste.
`var/drive-read/` no cambia: sigue siendo el origen y lo que hace posible la
reimportación local de la F25.

---

## 3. Idempotencia — qué la sostiene y por qué aguanta

El aviso de la F25 («una idempotencia que dependa de algo que se renumera no es
idempotencia», por `Movement.daySequence`) **no aplica aquí**, y conviene decir
por qué:

| Clave | De dónde sale | ¿Se renumera? |
|---|---|---|
| `InvestmentProduct (bank, name)` | `bank` de la carpeta de Drive; `name` lo escribe el humano y lo copia igual todos los meses | **No.** Nada del sistema lo genera |
| `SavingsSnapshot (productId, date)` | `date` es la fecha del abono de intereses, escrita en el archivo | **No.** Es un hecho del extracto |

Ni un contador, ni una posición, ni un autoincremento entran en ninguna de las dos
claves. Por eso:

- **Mismo mes dos veces → upsert, gana el último** (R6). Es la resolución que
  ADR-012 decisión 6 ya fijó para las fotos, distinta a propósito de la del flujo
  (donde un duplicado se descarta): un archivo corregido y vuelto a subir **debe**
  pisar al anterior.
- **Mes siguiente → mismo producto, una fila más** (R7).
- ⚠️ **Límite heredado de la clave natural** (ADR-012 lo dejó escrito): cambiar el
  `name` en el archivo crea **otro** producto y deja la serie anterior colgando
  del nombre viejo. No se arregla aquí; va al bloque 📌 de la hoja.

### La transacción

Los dos upserts de un archivo van dentro de **un `prisma.$transaction`**: un fallo
a mitad no puede dejar un producto sin su foto. Es la razón por la que R8 («si el
parser rechaza, no se escribe nada») se puede cumplir de forma comprobable: la
validación entera del parser —**incluido el cuadre de los cinco importes**— ocurre
**antes** de abrir la transacción.

---

## 4. Archivos y firmas

### Se crean

| Archivo | Qué contiene |
|---|---|
| `src/modules/investments/investments.types.ts` | `SavingsSnapshotInput`, `ProductParserAdapter`, `ProductParserRegistry`, `ProductImportResult` |
| `src/modules/investments/investments.service.ts` | `persistSavingsSnapshot(...)` — los dos upserts |
| `src/modules/investments/investments.service.test.ts` | R3-R8 |
| `prisma/migrations/<ts>_savings_account_as_product/migration.sql` | R1, R2 |

```ts
// investments.types.ts
/** Lo que un archivo de cuenta remunerada aporta, ya validado por su parser. */
export interface SavingsSnapshotInput {
  /** Slug de la CARPETA, nunca del contenido. */
  bank: string
  name: string
  type: 'savings_account'
  currency: string
  /** ISO YYYY-MM-DD. */
  openedAt: string
  closedAt: string | null
  /** ISO YYYY-MM-DD: el día del abono de intereses. Clave de la foto. */
  date: string
  openingBalance: number
  moneyIn: number
  moneyOut: number
  interest: number
  balance: number
}

/** Gemelo de `BankParserAdapter`, para los archivos de PRODUCTO. */
export interface ProductParserAdapter {
  bank: string
  /** Extensiones que lee, en minúscula y con el punto. */
  extensions: string[]
  /** Lanza `ValidationError` con el motivo íntegro si el archivo está mal. */
  parse(fileName: string, content: Buffer): SavingsSnapshotInput
}
export type ProductParserRegistry = ProductParserAdapter[]

export interface ProductImportResult {
  product: { id: number; bank: string; name: string; type: string; created: boolean }
  snapshot: { date: string; created: boolean }
}

// investments.service.ts
export async function persistSavingsSnapshot(
  prisma: AppPrismaClient,
  input: SavingsSnapshotInput,
): Promise<ProductImportResult>
```

Detalles obligatorios de `persistSavingsSnapshot`, heredados del importador de
movimientos ([`import.service.ts:82-104`](../../src/modules/import/import.service.ts#L82)):

- los importes viajan como **string** (`toFixed(2)`), nunca como `number`, para
  que ningún coma flotante llegue a un `Decimal(10,2)`;
- las fechas se construyen con `new Date(\`${iso}T00:00:00.000Z\`)`, porque son
  columnas *date-only* y un `new Date('YYYY-MM-DD')` local desplaza el día en una
  zona negativa;
- `created` se deduce comparando `createdAt` y `updatedAt` de la fila devuelta por
  el upsert, o haciendo un `findUnique` previo dentro de la misma transacción; la
  segunda es la que no depende de la resolución del reloj.

### Se modifican

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | valor de enum + modelo `SavingsSnapshot` + relación inversa (R1, R2) |
| `src/modules/investments/investments.model.test.ts` | tests del enum y de la clave natural nueva (R1, R2, R3) |
| `src/modules/trade-republic/trade-republic.service.ts` | **exportar** el paso que hoy es privado, `parseAccountFile`, como `parseTradeRepublicProductFile(fileName, content: Buffer)` (decodifica UTF-8 estricto + parsea + lanza `ValidationError`). **No** se añade ningún archivo al módulo ni ninguna referencia a la base de datos (R15) |
| `src/modules/import/import.types.ts` | `ProductFileReport` / campos `product` y `snapshot` en el informe del archivo (R13) |
| `src/modules/import/import.service.ts` | `selectProductAdapter(...)`, `importProductFile(...)`, y la bifurcación de `importPending` (R8-R10, R12) |
| `src/modules/import/import.local.service.ts` | la misma bifurcación en la vía local (R11) |
| `src/modules/import/import.routes.ts` | acepta e inyecta `productParsers` |
| `src/app.ts` | construye `productParsers` con la única entrada de `trade-republic` |
| `src/architecture.test.ts` | guardianes nuevos (§5) |
| `docs/api-contract.md` | `POST /api/import` y `POST /api/import/local` reportan productos; §Inversiones deja de decir «sin endpoints todavía» |
| `docs/architecture.md` | **ADR-026** con esta decisión; nota en ADR-012 de que su contrato «dos upserts» ya tiene ejecutor |
| `docs/trade-republic-product-files.md` | «Dónde acaba lo que escribes» pasa a incluir la base de datos; `var/parsed/` se documenta como **ensayo** |
| `docs/roadmap.md` | se tacha el cabo suelto de «los `.json` no llegan a la base» |

### Errores

**No se añade ninguna clase de error nueva.** Se reutiliza `ValidationError` de
`src/errors/app-error.ts`, que es lo que ya lanza el parser de Trade Republic, y
la isla de `try/catch` por archivo que el importador ya tiene: un archivo que
falla se reporta y no tumba a los demás.

---

## 5. Guardianes

1. **El módulo del banco sigue sin base de datos** — el guardián que ya existe
   (`architecture.test.ts`, «keeps the trade-republic parser module free of data
   access») se queda **tal cual** y tiene que seguir verde (R15).
2. **Ningún banco declara la misma extensión en los dos registros** — guardián
   nuevo sobre `src/app.ts`: para cada `bank`, la intersección de las extensiones
   de `parsers` y de `productParsers` debe ser vacía. Es lo que hace que el orden
   de consulta no pueda morder nunca.
3. **`src/modules/investments/` es el único que escribe en `InvestmentProduct` y
   `SavingsSnapshot`** — guardián nuevo: ningún otro archivo de `src/` menciona
   `investmentProduct.` ni `savingsSnapshot.` del cliente Prisma.
4. **ADR-017 sin excepciones:** ni un dato real del humano en tests ni en
   fixtures. Los importes de los fixtures son inventados y cuadran por
   construcción; el guardián de dos capas de la F14 sigue activo.

---

## 6. Lo que esta feature NO hace

- **No toca los 5 `.json` de MyInvestor**, que siguen saliendo `skipped` con
  «extensión no soportada por el parser de myinvestor» (decisión 🔴 1).
- **No arregla el mensaje falso** «no hay parser para el banco trade-republic»
  para el `.pdf` del extracto. Después de esta feature el `.json` deja de salir
  `skipped` (R10), pero el `.pdf` seguirá dando ese motivo, que es **falso**: el
  parser existe, lo que no hay es parser **de su extracto**. Es un defecto
  conocido, está **fuera de alcance** y queda anotado en `decisions.md`
  §Incoherencias para que se abra su propia feature.
- **No añade el IBAN a la plantilla** (decisión 🔴 3): no cambia ni un campo de lo
  que el humano teclea cada mes.
- **No expone consultas**: no hay `GET` de patrimonio ni de la serie. Escribir es
  esta feature; leer es la siguiente.
- **No enlaza aportaciones**: `Movement.productId` sigue sin escritor, como dejó
  ADR-012 decisión 4.
