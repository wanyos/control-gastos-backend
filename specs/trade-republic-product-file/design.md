# Design — F20 `trade-republic-product-file`

> Material del `implementer` y del `reviewer`. Se apoya en
> `docs/architecture.md` (ADR-013, ADR-016, ADR-017, ADR-018) y en
> `docs/conventions.md` §Parsers de banco; aquí solo se documentan los puntos
> donde esta feature roza esas fronteras.

---

## 1. Qué se está construyendo, y qué NO

Trade Republic es el **tercer banco con módulo propio** y el **segundo formato
escrito por el humano** (el primero fueron los productos de MyInvestor, ADR-016).
La diferencia con los otros dos bancos: aquí **no se lee nada de lo que el banco
emite**. El `.pdf` que baja la ingesta se queda como está y no se abre.

Por qué no se abre está medido en
[`progress/explorations/inventario-bancos-2026-08-17.md`](../../progress/explorations/inventario-bancos-2026-08-17.md)
§Trade Republic: el texto del PDF se extrae, pero **la tabla no sobrevive a la
extracción** (las descripciones se desalinean de su fila), así que reconstruirla
exige agrupar por coordenadas. Es el parser más caro de los cuatro pendientes y
el banco con menos apuntes: uno o dos al mes, todos abonos de intereses.

**Fuera de alcance, explícitamente:** el parser del PDF, cualquier escritura en
base de datos, cualquier cambio en `prisma/schema.prisma`, el registro de parsers
que el importador recibe inyectado (`BankParserRegistry` en `src/app.ts`: es para
extractos que se importan, y aquí no se importa nada) y el IBAN de la cuenta.

## 2. Decisión delegada nº 1 — los campos de una CUENTA REMUNERADA

No es ninguno de los cuatro tipos de ADR-016 (`fund`, `etf`,
`managed_portfolio`, `deposit`): es una cuenta con saldo que abona intereses cada
mes. El juego de campos mínimo se elige **para que cada valor se pueda copiar de
una fila del extracto**, sin que el humano tenga que calcular ni buscar nada
fuera:

| Campo | Obligatorio | De dónde sale |
|---|---|---|
| `type` | sí | **DISEÑO** — único valor admitido `savings_account`. No está en el extracto: identifica la forma del archivo, como en MyInvestor. |
| `name` | sí | **HUMANO** — cómo llama él a esta cuenta. Es la **identidad**: cambiarlo crea otra cuenta. Misma semántica que `name` en ADR-016. |
| `date` | sí | **MUESTRA** — la columna `FECHA` del apunte de intereses de ese mes. |
| `openedAt` | sí | **HUMANO** — el extracto **no lo trae**. Obligatorio en todo producto desde la F15; se copia igual todos los meses. |
| `balance` | sí | **MUESTRA** — la columna `BALANCE` de ese mismo apunte (el saldo justo después del abono). |
| `interest` | sí | **MUESTRA** — la columna `ENTRADA DE DINERO` de ese mismo apunte: los intereses abonados ese mes. |
| `currency` | no (def. `EUR`) | **ADR-016** — se hereda la doctrina: existe y no se escribe nunca. |
| `closedAt` | no | **ADR-016** — se escribe una sola vez, el mes que cierre la cuenta. Dejar de escribir el archivo **no** la cierra. |
| `_lo_que_sea` | no | **ADR-016** — sus notas, se ignoran. |

**La consecuencia práctica es la cadencia: un archivo por abono de intereses**,
es decir uno al mes, y lo que teclea cada vez son **tres valores** (`date`,
`balance`, `interest`) leídos de la **misma fila** del extracto. El resto se
copia. Si un extracto cubre varios meses (la muestra cubre cuatro), se escriben
tantos archivos como filas de intereses tenga: el extracto trae el `BALANCE` tras
cada una, así que se rellenan hacia atrás sin calcular nada.

**Descartados, con su razón:**

- **`iban`** — es el único banco que lo da sin intervención, pero **hoy no tiene
  consumidor**: no hay base de datos en esta feature y sin base de datos un IBAN
  no crea ninguna cuenta (ADR-015). A cambio metería un dato real más en un
  archivo que el humano escribe a mano cada mes. Cuando llegue la importación, se
  añade entonces —una línea— y no antes.
- **`interestRate`** — **no está en el extracto**. Obligaría a ir a buscarlo a la
  app y a mantenerlo cuando el banco lo cambie, que es exactamente el tipo de
  paso manual que ya costó dos incidencias.
- **`openingBalance` / `moneyIn` / `moneyOut`** — el resumen del extracto los
  trae, pero el saldo inicial de un mes es el final del anterior y las entradas
  ya son `interest`. Tres campos más que teclear para no aportar un dato nuevo.
- **Los apuntes uno a uno** — eso es el parser del PDF, que es justo lo que esta
  feature no hace.

## 3. Decisión delegada nº 2 — la forma de la salida

La norma del proyecto es: **el código que lee el formato no se comparte nunca; la
forma de la salida sí** (es lo que hizo ADR-013 con los extractos). Aplicada
aquí, la respuesta tiene dos mitades:

**a) La FORMA se copia, deliberadamente.** El vocabulario y la semántica de los
campos comunes son los mismos que en ADR-016 (`type`, `name`, `date`, `openedAt`,
`closedAt`, `currency`, claves `_`), las reglas de escritura son las mismas, el
motivo acumulado por archivo es el mismo, el volcado es **un `products.json` por
año** y la ruta tiene la misma pinta. Quien lea los dos volcados ve el mismo
esqueleto.

**b) El TIPO no se comparte, y esta vez es lo correcto.** No se mueve
`ParsedProduct` a `src/lib/`. Razones, en orden:

1. **No es la misma forma.** `ParsedProduct` lleva `valuation` y `depositTerms`;
   una cuenta remunerada no tiene ninguno de los dos, tiene `balance` e
   `interest`. Compartirlo obligaría a una tercera rama nullable y a un quinto
   valor de `InvestmentProductType` **que MyInvestor no puede emitir nunca**: un
   tipo común donde cada banco usa una mitad disjunta. Es el mismo error que
   ADR-013 rechazó explícitamente con `providesBalance`.
2. **`ParsedProduct` no es un contrato, es un tipo interno.** El único contrato
   común que este repo declaró (con ADR, con guardián y con `src/lib/`) es
   `ParsedStatement`. `ParsedProduct` nació dentro del módulo de MyInvestor y ahí
   sigue; extraerlo ahora sería inventar un contrato compartido a partir de **un
   solo** productor.
3. **Extraerlo hoy colisiona con trabajo en curso.** `FailedFile` / `IgnoredFile`
   ya están declarados por triplicado (`modules/ingestion/`, `modules/myinvestor/`
   y `modules/n26/`, este último de una feature que se está escribiendo en
   paralelo). Sacarlos a `lib/` es un refactor transversal de tres módulos que no
   cabe en esta feature y que se pisaría con esa otra.

**Qué se hace en su lugar:** `src/modules/trade-republic/trade-republic.types.ts`
declara **lo suyo** (`TradeRepublicProductType`, `ParsedSavingsAccount`,
`TradeRepublicProductsResult`, y sus propios `FailedFile` / `IgnoredFile` /
resúmenes), exactamente como hizo Bankinter y como está haciendo N26.

**Qué guardián lo protege:** el que ya existe,
[`src/architecture.test.ts`](../../src/architecture.test.ts) §*shares no parsing
code between bank modules*, **ampliado a este banco**: `bankModules` pasa a
`['bankinter', 'myinvestor', 'n26'?, 'trade-republic']` y se añade la comprobación
de imports permitidos (`./`, `../../errors/`, `../../lib/`) y de importadores
externos (`app.ts` y nadie más) sobre `modules/trade-republic/`. Con eso, el día
que alguien importe `myinvestor.product.parser.js` desde aquí, la suite se pone en
rojo. Se añade además el guardián «módulo libre de `prisma`», calcado del que ya
tiene MyInvestor (R6), y las entradas del módulo a la lista del guardián del árbol.

> ⚠️ **Cuando el TERCER banco escriba un `.json` a mano, esta decisión se
> revisa.** Ahí sí habrá tres productores y el contrato compartido de producto
> tendrá que salir a `src/lib/parsed-product.ts` con su ADR y su guardián, como
> hizo ADR-013 al llegar el segundo banco. Queda anotado en `decisions.md`
> §Incoherencias.

## 4. Archivos que se crean y se modifican

**Se crean:**

| Archivo | Qué contiene |
|---|---|
| `src/modules/trade-republic/trade-republic.types.ts` | solo lo suyo: `ParsedSavingsAccount`, resultados y resúmenes |
| `src/modules/trade-republic/trade-republic.product.parser.ts` | parser puro de **un** archivo; devuelve el motivo, no lanza |
| `src/modules/trade-republic/trade-republic.service.ts` | recorre las copias locales, encamina por extensión, vuelca `products.json` |
| `src/modules/trade-republic/trade-republic.routes.ts` | `POST /trade-republic` bajo el prefijo `/api/parser` |
| `src/modules/trade-republic/trade-republic.fixture.ts` | fixtures **sintéticos** en memoria (ADR-017) |
| `src/modules/trade-republic/trade-republic.product.parser.test.ts` | R2, R7-R12 |
| `src/modules/trade-republic/trade-republic.service.test.ts` | R13-R15 |
| `src/modules/trade-republic/trade-republic.routes.test.ts` | R16 |
| `src/modules/trade-republic/trade-republic.docs.test.ts` | R1, R3, R4 (lee los `docs/`, no toca código) |
| `docs/trade-republic-product-files.md` | la referencia del formato, hermana de la de MyInvestor |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `src/app.ts` | una línea: `app.register(tradeRepublicRoutes, { prefix: '/api/parser' })` (único archivo de `src/` que puede nombrar un banco) |
| `src/architecture.test.ts` | tres guardianes: árbol, aislamiento entre bancos, módulo sin `prisma` |
| `docs/architecture.md` | el árbol gana el módulo + **ADR-019** con estas decisiones |
| `docs/api-contract.md` | sección «Parser de Trade Republic» + `POST /api/parser/trade-republic` |
| `docs/roadmap.md` | E4 pasa a **3 de 6 bancos** y la nota de provisionalidad (R4) |
| `docs/conventions.md` | una línea en §Parsers de banco: un banco puede entrar **solo** por archivo escrito a mano |

## 5. Firmas nuevas

```ts
// trade-republic.types.ts
export type TradeRepublicProductType = 'savings_account'

export interface ParsedSavingsAccount {
  bank: 'trade-republic'
  /** Procedencia: el nombre del archivo. Nunca decide el nombre ni la fecha. */
  file: string
  type: TradeRepublicProductType
  name: string
  /** ISO AAAA-MM-DD: el día del abono de intereses (la foto). */
  date: string
  /** ISO AAAA-MM-DD: el día que se abrió la cuenta. Obligatorio (F15). */
  openedAt: string
  currency: string
  /** El saldo tras el abono, tal y como está escrito. */
  balance: number
  /** Los intereses abonados en esa fecha, tal y como están escritos. */
  interest: number
  /** ISO AAAA-MM-DD; `null` = viva. Dejar de escribirla NO la cierra. */
  closedAt: string | null
}

export interface TradeRepublicProductsResult {
  bank: 'trade-republic'
  year: string
  products: ParsedSavingsAccount[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}

// trade-republic.product.parser.ts
export function parseTradeRepublicProduct(
  file: string,
  content: string,
): ParsedSavingsAccount | { reason: string }

// trade-republic.service.ts
export async function parseLocalTradeRepublicCopies(
  sourceBaseDir: string,
  dumpBaseDir: string,
): Promise<TradeRepublicParseRunResult>
```

**El parser devuelve el motivo, no lanza** (mismo criterio que ADR-016 §9.3): un
archivo mal escrito no es una excepción de la petición, es parte de su respuesta.
El servicio lo convierte en `ValidationError` para que caiga en `failed[]` por la
misma vía que los demás.

## 6. Puntos donde esta feature roza una regla existente

1. **`decodeUtf8Strict`, no `readFile(…, 'utf8')`.** `docs/conventions.md` y
   ADR-018 son tajantes: el archivo se lee como `Buffer` y se descodifica con
   [`src/lib/utf8.ts`](../../src/lib/utf8.ts), que **rechaza el fichero entero**
   si trae un byte que no es UTF-8. Es `lib/` (encoding, no formato), así que
   usarlo **no** rompe «un parser por banco». ⚠️ El servicio de MyInvestor todavía
   lee sus `.json` con `readFile(…, 'utf8')`
   ([`myinvestor.service.ts:132`](../../src/modules/myinvestor/myinvestor.service.ts#L132)):
   es una divergencia consciente, **este banco no la hereda** y queda anotada como
   sugerencia fuera de scope.
2. **El `.pdf` no es un fallo (R14).** El extracto real seguirá bajando a
   `var/drive-read/trade-republic/<año>/` todos los meses. Cae en `ignored[]`, que
   es exactamente el papel que esa lista tiene desde la F10.
3. **Choque `(name, date)`.** Se resuelve como en ADR-016: dos archivos con la
   misma cuenta y la misma fecha son la copia que Drive crea al subir dos veces;
   se conserva el **primero por orden alfabético** y el otro se reporta diciendo
   con cuál choca. Va en el servicio, que es quien ve el conjunto.
4. **ADR-017 (datos reales).** Ni un valor de la muestra real —IBAN, nombre,
   dirección, importes— llega a un archivo versionado. Los fixtures son
   **sintéticos y en memoria**. `npx vitest run src/no-real-data.test.ts` es parte
   del cierre.

## 7. Alternativas descartadas

- **Escribir el parser del PDF ahora.** Descartada por el humano el 2026-08-17 y
  respaldada por el diagnóstico: reconstruir la tabla por coordenadas es un parser
  de otro orden de complejidad para uno o dos apuntes al mes.
- **Meter la cuenta remunerada en `InvestmentProductType` como quinto tipo y
  reutilizar el parser de MyInvestor.** Descartada por el `intent` («son bancos
  distintos») y por la norma «un parser por banco»: el formato de un banco cambia
  sin avisar y un parser compartido convierte ese cambio en una regresión para
  todos.
- **Mover `ParsedProduct` a `src/lib/` en esta feature.** Descartada: ver §3b.
- **Un archivo por extracto, con `periodStart`/`periodEnd` y el interés del
  periodo.** Descartada: obliga a sumar a mano cuando el extracto cubre varios
  meses y pierde la serie mensual. La fila del extracto ya da los tres valores del
  mes; una foto por mes es lo mismo que ya hace MyInvestor.
- **Validar con AJV.** Descartada por el mismo motivo que ADR-016: es la
  herramienta de la capa HTTP y acumula peor los motivos, que es justo lo que R12
  necesita.
- **Adivinar el tipo de archivo por su contenido en vez de por la extensión.**
  Descartada (ADR-016): convierte un archivo corrupto en «no sé ni qué querías que
  fuera».

## 8. Dependencias

**Cero dependencias nuevas.** `JSON.parse` es nativo y la validación va a mano,
igual que en ADR-016. Ninguna clase de error nueva: `ValidationError` de
`src/errors/app-error.ts` basta.
