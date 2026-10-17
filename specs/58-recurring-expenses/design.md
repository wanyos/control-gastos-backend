# Design — F58 `recurring-expenses`

> Material del implementer y del reviewer. Las decisiones para el humano están
> en `decisions.md`. **Este archivo no lleva ninguna cifra ni concepto de la base
> del humano** (`src/no-real-data.test.ts`): lo medido se describe sin importes
> ni nombres. Las mediciones se hicieron el 2026-10-17 con consultas de solo
> lectura (`default_transaction_read_only=on`) sobre la base `gastos`.

## 1. Archivos

| Archivo | Qué cambia |
|---|---|
| `src/modules/recurring-expenses/recurring-expenses.types.ts` (nuevo) | Tipos de §5 |
| `src/modules/recurring-expenses/recurring-expenses.service.ts` (nuevo) | `recurringExpensesDb(app)`, `getRecurringExpenses(prisma, matchers, today)` y las funciones puras de §3 y §4. **Solo `findMany`** |
| `src/modules/recurring-expenses/recurring-expenses.schema.ts` (nuevo) | Esquema de respuesta de §6 (si un campo falta en el esquema, Fastify lo quita al serializar) |
| `src/modules/recurring-expenses/recurring-expenses.routes.ts` (nuevo) | `GET /`, opción `depositMaturityMatchers` (patrón de `overview.routes.ts`); pasa `todayInMadrid()` |
| `src/modules/recurring-expenses/recurring-expenses.test.ts` (nuevo) | Tests de §7 |
| `src/modules/recurring-expenses/recurring-expenses.docs.test.ts` (nuevo) | Test del contrato (R15), patrón de `movements.deposits.docs.test.ts` |
| `src/app.ts` | `app.register(recurringExpensesRoutes, { prefix: '/api/recurring-expenses', depositMaturityMatchers })` |
| `src/modules/movements/movements.service.ts` | Nueva `isCountedExpense(movement, deposits)` exportada; `computeTotals` la usa para su rama de gasto. **Comportamiento idéntico**: los tests existentes (`movements.test.ts`, `movements.exclusion.test.ts`, `movements.deposits.test.ts`, `overview.test.ts`) pasan **sin tocarlos** |
| `src/modules/transfers/transfers.service.ts` | `transferWords` pasa a `export const`. Nada más |
| `docs/api-contract.md` | Sección nueva (§8) y fila en el índice de endpoints si lo hay |
| `README.md` | Fila de la tabla de endpoints y línea del árbol `modules/` |
| `docs/architecture.md` | ADR-037 (§9) |

**No se tocan:** `prisma/schema.prisma` (ni columnas ni comentarios: ninguno pasa
a ser falso; `excludedFromTotals` sigue significando «no cuenta en las sumas»),
`docs/data-model.md` (sin columnas nuevas: la lección #2 no aplica), ninguna
migración, `architecture.test.ts` (su lista de archivos exige que existan unos
dados; no prohíbe módulos nuevos — comprobado leyéndolo, el implementer lo
confirma con `pnpm test`).

## 2. Qué movimientos entran

```ts
// movements.service.ts
export function isCountedExpense(
  movement: TotalsMovement,
  deposits: Map<number, DepositMovementReading>,
): boolean
// true ⇔ deposits.get(id) === undefined && !excludedFromTotals && transferId === null
//        && productId === null && type === 'expense'
```

`computeTotals` sustituye su rama `type === 'expense'` por `isCountedExpense`, sin
cambiar el orden de las comprobaciones de depósito. Así «qué es un gasto» tiene
una sola respuesta en el backend.

`getRecurringExpenses` lee con **un** `findMany` todos los movimientos `expense`
(`select`: `id`, `accountId`, `type`, `amount`, `description`, `bookingDate`,
`daySequence`, `categoryId`, `transferId`, `productId`, `excludedFromTotals`),
las categorías (`id`, `name`, `parentId`) y `readDepositMovements(prisma,
matchers)` en paralelo, y filtra en memoria con `isCountedExpense`. La base del
humano tiene del orden de dos mil movimientos: leerlo todo es lo que ya hace
`readDepositMovements`.

Clasificación de cada gasto que cuenta, **en este orden** (el primero que cumple):

1. **Recibo** — `/^(recibo|recib|tributo)(?![a-z])/` sobre el concepto normalizado.
2. **Transferencia a una persona** — `transferWords.test(description) ||
   /\bbizum\b/iu.test(description)`.
3. **Gasto variable** — el resto.

Medido (solo lectura, 2026-10-17): con esta regla salen **15 recibos distintos**,
todos de un mismo banco; ningún otro banco escribe esas palabras al principio
del concepto. Las transferencias a personas salen de dos bancos; en uno de ellos
algunas van a empresas y dos a una plataforma de inversión sin pareja de
traspaso (`decisions.md` 🔴 5). Hoy **ningún** gasto que cuenta está sin
categoría (el cierre del 2026-10-16 pone `Otros gastos`), pero la entrada `null`
de R9 existe igual. **No comprobado:** si algún banco escribe una transferencia
a una persona solo con su nombre (sin palabra de transferencia); esa iría al
gasto variable de su categoría.

## 3. Clave de un recibo (R4)

```ts
export function billKey(description: string): string
```

1. `normalizeForMatch(description)`.
2. Todo carácter que no sea `a-z`, `0-9` o espacio → espacio.
3. Partir por espacios; quitar vacías, **las que contienen algún dígito** (un
   número de referencia que cambia cada año) y las palabras de recibo.
4. Clave = las **dos primeras** que quedan, unidas por un espacio.
5. Si no queda ninguna, clave = la primera palabra de recibo del concepto
   (p. ej. un pago de impuestos cuyo concepto es solo la palabra y una referencia).

Por qué dos palabras: el banco que escribe recibos **corta el concepto a 30
caracteres**, y las grafías distintas de un mismo proveedor que hay hoy en la
base difieren solo en lo que va después de la segunda palabra (una forma
jurídica, una coma) o en repetir la palabra «recibo». Medido: con la regla, tres
proveedores que hoy salen con dos grafías cada uno quedan en una entrada, y ningún
par de proveedores distintos comparte clave.
⚠️ Efecto que puede morder: dos recibos distintos cuyas dos primeras palabras
coincidan se juntan en uno.

## 4. Periodicidad (R5), importe habitual (R6) y cambio (R7)

Sobre **toda la historia** del recibo:

- `months` = sus meses con cargo, ordenados, sin repetir.
- Si `months.length === 1` → `once`.
- Si no: huecos `g_i` en meses entre meses con cargo consecutivos
  (`(año2−año1)·12 + mes2 − mes1`); `g` = **mediana inferior** (con número par de
  huecos, el menor de los dos centrales).
  - `g === 1`: si la **moda** del número de cargos por mes con cargo (empate → el
    menor) es `>= 2` → `twice_monthly`; si no → `monthly`.
  - `g === 2` → `every_two_months`; `g === 3` → `every_three_months`;
    `4 <= g <= 8` → `every_six_months`; `g >= 9` → `annual`.

Por qué la moda y no la media para dos veces al mes: un suministro con alguna
factura doble suelta no es «dos veces al mes»; un gimnasio con dos cuotas casi
todos los meses sí. Medido sobre la base: la regla da dos veces al mes, mensual,
cada dos meses (dos recibos), cada tres meses (uno: varias pólizas con el mismo
concepto), cada seis meses (uno: un impuesto en dos plazos al año), anual (dos)
y una vez (tres).

- `usualAmount` = mediana inferior de los **totales del mes** de sus últimos 12
  meses con cargo (o de todos, si tiene menos).
- `lastMonth` / `previousMonth`: los dos últimos meses con cargo;
  `change = total(lastMonth) − total(previousMonth)`; `hasIncreased = change > 0`.
  Se compara por **total del mes** y no cargo a cargo: el gimnasio cobra dos
  cuotas de importe distinto el mismo día y en orden que cambia, y cargo a cargo
  daría subidas y bajadas que no existen.

`monthlyCost` (R11): `sum(cargos con bookingDate en el periodo) / 12`, con
`Prisma.Decimal` y `toFixed(2)` (decimal.js redondea mitad hacia arriba).
`monthlyTotal` (R12): suma de los `monthlyCost` **ya redondeados**, para que la
pantalla cuadre al sumar.

Orden de `bills`: `monthlyCost` desc, `lastDate` desc, `key` asc. Orden de
`variable`: `monthlyCost` desc, nombre de categoría asc, `null` al final.

## 5. Firmas y tipos

```ts
export function recurringExpensesDb(app: FastifyInstance): AppPrismaClient
export async function getRecurringExpenses(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
  today: string, // YYYY-MM-DD en Madrid; inyectable para tests
): Promise<RecurringExpensesResponse>
export function billKey(description: string): string
export function billPeriodicity(chargeDates: string[]): BillPeriodicity
```

```ts
type BillPeriodicity =
  | 'once' | 'twice_monthly' | 'monthly' | 'every_two_months'
  | 'every_three_months' | 'every_six_months' | 'annual'

interface RecurringMovement { id: number; accountId: number; bookingDate: string; amount: string; description: string }
interface MonthAmount { month: string; amount: string }

interface RecurringBill {
  key: string; name: string; periodicity: BillPeriodicity
  usualAmount: string; count: number; lastDate: string
  lastMonth: string; lastMonthAmount: string
  previousMonth: string | null; previousMonthAmount: string | null
  change: string | null; hasIncreased: boolean
  monthlyCost: string; movements: RecurringMovement[]
}
interface RecurringGroup { months: MonthAmount[]; monthlyCost: string; movements: RecurringMovement[] }
interface RecurringCategoryGroup extends RecurringGroup {
  category: { id: number; name: string; parentId: number | null } | null
}
interface RecurringExpensesResponse {
  period: { from: string; to: string; months: string[] }
  monthlyTotal: string
  bills: RecurringBill[]
  transfersToPeople: RecurringGroup
  variable: RecurringCategoryGroup[]
}
```

Importes como cadenas con dos decimales, como el resto del contrato. Sin
parámetros de query; uno desconocido se ignora (como `GET /api/transfers/ambiguous`).
Errores: ninguno propio; un fallo de la base es el `500` genérico.

## 6. Esquema

`recurring-expenses.schema.ts` declara `response: { 200: … }` con **todas** las
claves de §5 (`additionalProperties: false` no hace falta; lo que importa es no
olvidar ninguna, porque Fastify serializa solo lo declarado). `nullable` en
`previousMonth`, `previousMonthAmount`, `change` y `category`.

## 7. Tests (`recurring-expenses.test.ts`)

Integración con `buildApp()` + `app.inject()` contra la base desechable; siembran
cuentas (`syntheticIban()`), categorías con sufijo aleatorio y movimientos con
Prisma, y limpian en `afterEach`. Fechas **relativas** al mes de hoy
(`currentMonthInMadrid()`), para que el periodo las contenga siempre. Conceptos e
importes **inventados** (p. ej. `RECIBO /GIMNASIO INVENTADO`, `BIZUM PERSONA
INVENTADA`). ⚠️ No copies la forma de tres palabras con que un banco escribe sus
bizum o transferencias: `src/no-real-data.test.ts` la marca como frase de la base
(le pasó a este mismo archivo al redactarlo). Las funciones puras (`billKey`, `billPeriodicity`) pueden
tener además tests unitarios en el mismo archivo.

Los nombres entre comillas los filtran los `checks`: ver `tasks.md` T4.

## 8. Contrato (`docs/api-contract.md`)

Sección `### \`GET /api/recurring-expenses\`` después de `GET /api/overview`, con:
qué movimientos entran (la regla de la suma, enlazando a `GET /api/movements`);
los tres grupos y cómo se reconoce cada uno (§2), dicho con las palabras que se
buscan; la clave de un recibo (§3); los siete valores de `periodicity` y su regla
(§4); `usualAmount`, `change`, `hasIncreased` (sin umbral); el periodo de 12 meses
completos; `monthlyCost` y `monthlyTotal`; que los movimientos vienen en la
respuesta (de toda la historia en un recibo, del periodo en los otros dos); la
respuesta vacía; que es de solo lectura; y **un ejemplo JSON completo** con
datos inventados que `JSON.parse` acepte. Fila nueva en la tabla de endpoints de
`README.md` y línea `recurring-expenses/` en su árbol.

## 9. ADR-037 (`docs/architecture.md`)

«Qué gasto es un recibo, cuál es una transferencia a una persona y cuánto cuesta
un mes se decide al leer, en `recurring-expenses`, sin guardar nada»: recibo por
las palabras al principio del concepto; persona por las palabras de transferencia
de la detección más `bizum`; el resto por categoría; 12 meses completos / 12;
y que los gastos que entran son exactamente los que la suma general cuenta como
gasto (`isCountedExpense`).

## 10. Alternativas descartadas

- **Reconocer recibos por regularidad** (mismo concepto en muchos meses): no
  cumple «aunque haya aparecido una sola vez» y mete como recibo la máquina de
  vending que sale cientos de veces. Se queda como alternativa de 🔴 1.
- **Usar `paymentMethod = direct_debit`**: ningún importador lo escribe hoy (solo
  `null`, `import.service.ts`).
- **Reconocer «a personas» por la categoría `Transferencias a personas`**: depende
  de un nombre de categoría que el humano puede renombrar, y hoy menos de la
  mitad de las transferencias que reconoce la regla de §2 la tienen (el resto
  está en `Otros gastos`). Alternativa de 🔴 5.
- **Endpoint aparte para los movimientos de cada entrada**: una ruta más y una
  clave estable que mantener; con del orden de seiscientos movimientos en la
  respuesta, embebidos cuesta menos.
- **Guardar la detección en una tabla**: habría que recalcularla en cada
  importación y en cada cambio de categoría; el intent pide calcular al momento.
