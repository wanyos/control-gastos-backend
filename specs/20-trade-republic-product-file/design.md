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
mes. El juego de campos se elige **para que cada valor se pueda copiar del
extracto**, sin que el humano tenga que buscar nada fuera. Tras la puerta del
2026-08-19 son nueve campos obligatorios: los seis del mínimo original más los
tres del cuadre (§2.1):

| Campo | Obligatorio | De dónde sale |
|---|---|---|
| `type` | sí | **DISEÑO** — único valor admitido `savings_account`. No está en el extracto: identifica la forma del archivo, como en MyInvestor. |
| `name` | sí | **HUMANO** — cómo llama él a esta cuenta. Es la **identidad**: cambiarlo crea otra cuenta. Misma semántica que `name` en ADR-016. |
| `date` | sí | **MUESTRA** — la columna `FECHA` del apunte de intereses de ese mes. |
| `openedAt` | sí | **HUMANO** — el extracto **no lo trae**. Obligatorio en todo producto desde la F15; se copia igual todos los meses. |
| `balance` | sí | **MUESTRA** — la columna `BALANCE` de ese mismo apunte: el saldo final, justo después del abono. |
| `interest` | sí | **MUESTRA** — la columna `ENTRADA DE DINERO` de ese mismo apunte: los intereses abonados ese mes. |
| `openingBalance` | sí | **MUESTRA** — el saldo inicial del periodo, del resumen del extracto. Es el `balance` del archivo del mes anterior. |
| `moneyIn` | sí | **MUESTRA** — lo que entró en el mes **sin contar los intereses** (ver aviso abajo). `0` si no entró nada. |
| `moneyOut` | sí | **MUESTRA** — lo que salió en el mes. `0` si no salió nada. |
| `currency` | no (def. `EUR`) | **ADR-016** — se hereda la doctrina: existe y no se escribe nunca. |
| `closedAt` | no | **ADR-016** — se escribe una sola vez, el mes que cierre la cuenta. Dejar de escribir el archivo **no** la cierra. |
| `_lo_que_sea` | no | **ADR-016** — sus notas, se ignoran. |

> ⚠️ **`moneyIn` excluye los intereses**, que van aparte en `interest`. Si el
> resumen del extracto los suma dentro de `ENTRADA DE DINERO`, hay que restarlos.
> Es la única resta del archivo y **no es opcional**: si los intereses fueran
> dentro de `moneyIn`, el cuadre de §2.1 los contaría dos veces y **rechazaría
> todos los meses buenos**. En una cuenta sin más movimientos que el abono,
> `moneyIn` es `0`. La plantilla lo dice en el propio marcador.

**La consecuencia práctica es la cadencia: un archivo por abono de intereses**,
es decir uno al mes, y lo que teclea cada vez son **seis valores** (`date`,
`openingBalance`, `moneyIn`, `moneyOut`, `interest` y `balance`): los tres
primeros salen del resumen del extracto y los dos últimos de la **misma fila** del
apunte de intereses. El resto se copia. Si un extracto cubre varios meses (la muestra cubre cuatro), se escriben
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
- **Los apuntes uno a uno** — eso es el parser del PDF, que es justo lo que esta
  feature no hace.

> 📌 `openingBalance`, `moneyIn` y `moneyOut` **estuvieron descartados** en la
> primera redacción («tres campos más que teclear que no aportan un dato nuevo»).
> El humano los recuperó en la puerta del 2026-08-19 **con una condición que lo
> cambia todo**: que sirvan para que el archivo se compruebe a sí mismo (§2.1).
> Con el cuadre, dejan de ser tres campos redundantes y pasan a ser la única
> defensa contra un dígito mal tecleado.

## 2.1 Decisión del 2026-08-19 — el CUADRE ARITMÉTICO (rechaza, no avisa)

```
openingBalance + moneyIn − moneyOut + interest  ==  balance
```

Si no cuadra, **el archivo de ese mes se rechaza**. Es una elección explícita del
humano frente a la versión blanda («avisar y dejarlo pasar»): un aviso en un
`products.json` que él no lee cada mes no impide que el dato malo entre.

**a) Cómo se comparan los importes sin que un céntimo dé un falso rechazo.**
El cuadre **no se hace en `number`**: `0.1 + 0.2 !== 0.3` en coma flotante, y
sumar cinco importes en euros produce restos del orden de `1e-13` que harían
fallar meses perfectamente buenos. El procedimiento es:

1. Cada importe se pasa a **céntimos enteros** con `Math.round(v * 100)`. El
   valor que se devuelve en el producto sigue siendo el escrito, sin tocar (R7):
   los céntimos son una variable local de la comprobación.
2. Se comparan enteros: `expected = openingBalanceC + moneyInC − moneyOutC +
   interestC`, `deviationC = balanceC − expected`.
3. **Tolerancia de 1 céntimo**: `Math.abs(deviationC) <= 1` cuadra. Se admite
   porque los cinco importes ya vienen redondeados a céntimo por el banco y el
   abono de intereses es un redondeo suyo; una errata humana real (un dígito, una
   coma, un signo) se desvía de céntimos a euros, nunca de un céntimo. Más margen
   dejaría pasar erratas; menos rechazaría el redondeo del propio banco.
4. **`deviationC` se reporta en euros y con signo**, para que se lea como lo que
   es: cuánto sobra o falta.

**b) Qué pasa si falta alguno de los tres campos nuevos.** Son **obligatorios,
como los otros seis**, y su ausencia se rechaza por la vía normal (R8), no por el
cuadre. Se descartó hacerlos opcionales y omitir el cuadre cuando falten:
olvidarse de un campo desactivaría el guardián **en silencio**, que es
exactamente el fallo que este cuadre viene a impedir. Y se descartó también
inventarles un valor por defecto de `0`, que convertiría un olvido en un rechazo
por descuadre y mandaría al humano a buscar un error de importes donde solo hay
un campo sin escribir.

**c) Cuándo NO se evalúa el cuadre (R18).** Solo se evalúa si los **cinco**
importes son números válidos. Si falta alguno o alguno es inválido (número como
texto, `null`, booleano), el archivo ya se rechaza por R8/R9 y el cuadre **no
añade motivo**: un descuadre calculado sobre datos incompletos es ruido que
esconde el problema de verdad. El cuadre es, por tanto, la **última**
comprobación del parser.

**d) Qué dice el motivo cuando no cuadra.** Los dos datos que el humano pidió
—cuánto se desvía y qué campos no cuadran— más lo necesario para localizarlo sin
abrir la calculadora: la desviación con signo, el saldo final esperado frente al
escrito, y **los cinco campos que intervienen con su valor** (el parser no puede
saber cuál de los cinco está mal; enseñarlos todos es lo que permite ver de un
vistazo cuál chirría). Se acumula con los demás motivos del archivo (R12).

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
tiene MyInvestor (R5, que absorbió el antiguo R6), y las entradas del módulo a
la lista del guardián del árbol.

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
| `src/modules/trade-republic/trade-republic.product.parser.test.ts` | R2, R7-R9, R11, R12, R17, R18 |
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
  /** El saldo inicial del mes, tal y como está escrito. */
  openingBalance: number
  /** Lo que entró en el mes SIN los intereses. Tal y como está escrito. */
  moneyIn: number
  /** Lo que salió en el mes, tal y como está escrito. */
  moneyOut: number
  /** El saldo final tras el abono, tal y como está escrito. */
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

/**
 * Última comprobación del parser (§2.1). Solo se llama cuando los cinco
 * importes son números válidos. `null` = cuadra dentro de la tolerancia.
 */
export function checkBalanceEquation(
  amounts: Pick<
    ParsedSavingsAccount,
    'openingBalance' | 'moneyIn' | 'moneyOut' | 'interest' | 'balance'
  >,
): string | null

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
  meses y pierde la serie mensual. El extracto ya da mes a mes los importes que
  el archivo necesita; una foto por mes es lo mismo que ya hace MyInvestor.
- **El cuadre como aviso en vez de como rechazo.** Descartada **por el humano**
  en la puerta del 2026-08-19: un aviso dentro de un `products.json` que no se lee
  cada mes no impide que el dato malo entre, y entonces los tres campos nuevos
  solo serían tres campos más que teclear.
- **Cuadrar en `number` con `===`, o con una tolerancia de tipo `1e-9`.**
  Descartada: la primera rechaza meses buenos por el error de la coma flotante; la
  segunda es tan fina que equivale a la primera. Céntimos enteros con 1 céntimo de
  margen (§2.1a).
- **Tolerancia «generosa» (p. ej. 1 €) para no molestar.** Descartada: una errata
  de un dígito puede ser de menos de un euro, y una red que deja pasar el caso que
  viene a cazar es peor que no tenerla, porque da confianza falsa.
- **`moneyIn` con los intereses dentro y fórmula sin `+ interest`.** Descartada:
  el humano escribió la fórmula con los intereses aparte, y separar el abono del
  banco de lo que él ingresa hace el archivo más informativo. El coste es una
  resta al copiar del resumen, avisada en la plantilla.
- **Hacer opcionales los tres campos nuevos y omitir el cuadre si faltan.**
  Descartada: convertiría el guardián en algo que se apaga olvidándose de escribir
  un campo (§2.1b).
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
