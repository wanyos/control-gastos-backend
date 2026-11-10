# Design — F71 `myinvestor-investment-purchases`

## 1. Idea

Igual que los depósitos (F57, ADR-035) y el dinero entre cuentas propias (F62,
ADR-040): **se decide al leer, no se guarda nada**. Una lectura nueva,
`readInvestmentPurchases`, devuelve un mapa `id de movimiento → lectura` sobre toda
la tabla, y las tres sumas lo consultan a la vez que el mapa de depósitos y el de
`ownership`. Como no escribe, vale igual para las compras ya guardadas y para las
que entren en la siguiente importación (R3, R4), sin migración.

Lo que es «un concepto de compra» es conocimiento del banco: vive en
`src/modules/myinvestor/` y llega a los demás módulos por un **registro nuevo de
`src/app.ts`**, el cuarto, gemelo de `depositMaturityMatchers` (ADR-015: solo
`app.ts` nombra bancos; lo vigila `src/architecture.test.ts`).

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/myinvestor/myinvestor.investment-purchase.ts` | **Nuevo.** Función pura `classifyMyinvestorInvestmentPurchase`. Sin `prisma`. |
| `src/modules/myinvestor/myinvestor.investment-purchase.test.ts` | **Nuevo.** Unitarios del clasificador. |
| `src/modules/movements/movements.types.ts` | Tipos del registro, de la lectura y del campo serializado; `ListedMovement` gana `investmentPurchase`; `TotalsMovement` no cambia. |
| `src/modules/movements/movements.investment-purchases.ts` | **Nuevo.** `resolveInvestmentPurchases` (pura) y `readInvestmentPurchases` (solo `findMany`). |
| `src/modules/movements/movements.service.ts` | `isCountedExpense` y `computeTotals` reciben el mapa nuevo; `listMovements` lo lee y serializa el campo. |
| `src/modules/movements/movements.routes.ts` | Opción nueva `investmentPurchaseMatchers` (por defecto `[]`), pasada a `listMovements`. |
| `src/modules/movements/movements.test.ts` | Las llamadas directas a `computeTotals` pasan el cuarto argumento (`new Map()`). |
| `src/modules/overview/overview.service.ts`, `overview.routes.ts` | Lee el mapa y lo pasa a `computeTotals`; opción nueva en la ruta. |
| `src/modules/expenses-by-category/expenses-by-category.service.ts`, `expenses-by-category.routes.ts` | Lee el mapa y lo pasa a `isCountedExpense`; opción nueva en la ruta. |
| `src/app.ts` | Registro `investmentPurchaseMatchers` y su paso a las tres rutas. |
| `src/modules/movements/movements.investment-purchases.test.ts` | **Nuevo.** Integración: importación por el registro real y las tres sumas. |
| `src/modules/movements/movements.investment-purchases.docs.test.ts` | **Nuevo.** Lee `docs/api-contract.md` (R14). |
| `docs/api-contract.md`, `docs/data-model.md`, `docs/architecture.md` | Ver §7. |

## 3. Firmas

```ts
// src/modules/myinvestor/myinvestor.investment-purchase.ts
export interface MyinvestorInvestmentPurchase { certain: boolean }
/** null = no es compra (concepto conocido). No mira el `type`: lo exige el llamador. */
export function classifyMyinvestorInvestmentPurchase(
  description: string,
): MyinvestorInvestmentPurchase | null
```

- Normaliza: `trimStart`, NFD sin marcas diacríticas, mayúsculas, espacios
  repetidos a uno. Compara con `startsWith` contra la lista cerrada (requirements
  §Vocabulario), escrita en mayúsculas y sin tildes.
- `certain`: `/@\s*\d+(?:[.,]\d+)?\s*$/` sobre el concepto original.
- Es el gemelo de `classifyMyinvestorDepositMovement`
  (`myinvestor.deposit-maturity.ts`): la lista incluye `APERTURA DEP` aunque la regla
  de depósitos vaya antes, para que el clasificador sea cierto por sí solo.
- El tipo del retorno es estructural, declarado aquí: un módulo de banco no importa
  otro módulo (`architecture.test.ts`).

```ts
// src/modules/movements/movements.types.ts
export interface InvestmentPurchaseMatcher {
  bank: string
  classifyInvestmentPurchase(description: string): { certain: boolean } | null
}
export type InvestmentPurchaseMatcherRegistry = InvestmentPurchaseMatcher[]
export interface InvestmentPurchaseReading { certain: boolean }
export interface SerializedInvestmentPurchase { certain: boolean }
export type ListedMovement = SerializedMovement & {
  deposit: SerializedDeposit | null
  ownership: SerializedOwnership | null
  investmentPurchase: SerializedInvestmentPurchase | null
}
```

```ts
// src/modules/movements/movements.investment-purchases.ts
export function resolveInvestmentPurchases(
  movements: { id: number; type: MovementType; transferId: string | null; description: string; bank: string }[],
  matchers: InvestmentPurchaseMatcherRegistry,
): Map<number, InvestmentPurchaseReading>
export async function readInvestmentPurchases(
  prisma: AppPrismaClient,
  matchers: InvestmentPurchaseMatcherRegistry,
): Promise<Map<number, InvestmentPurchaseReading>>
```

- `resolve…` exige `type === 'expense'` (R12) y `transferId === null` (R13), busca el
  matcher por `bank` (sin matcher → no hay lectura, R11) y guarda la lectura si el
  clasificador no da `null`.
- `read…`: con el registro vacío devuelve `new Map()` sin consultar. Si no, un
  `findMany` de los `expense` sin `transferId` de las cuentas de los bancos del
  registro, con `account: { select: { bank: true } }`, igual que
  `readDepositMovements`.

```ts
// src/modules/movements/movements.service.ts
export function isCountedExpense(movement, deposits, ownership, purchases): boolean
export function computeTotals(movements, deposits, ownership, purchases): MovementTotals
```

- `isCountedExpense` añade `purchases.get(movement.id) === undefined` (R2).
- `computeTotals`: **orden** depósito → compra → `ownership` → lo de siempre. Una
  compra devuelve `totals` sin sumar nada, tenga o no marca u `ownership` (R2, R8).
  Como R1 solo reconoce `expense`, el ramal de `income` no cambia (R12).
- El cuarto parámetro es **obligatorio**: un llamador olvidado no compila, en vez de
  sumar compras en silencio.

`src/app.ts`:

```ts
export const investmentPurchaseMatchers: InvestmentPurchaseMatcherRegistry = [
  { bank: 'myinvestor', classifyInvestmentPurchase: classifyMyinvestorInvestmentPurchase },
]
```

Se pasa a `movementsRoutes`, `overviewRoutes` y `expensesByCategoryRoutes` como
opción `investmentPurchaseMatchers` (por defecto `[]` en cada ruta, como
`depositMaturityMatchers`).

## 4. Errores

Ninguno nuevo. La regla no puede fallar: un concepto que no casa con nada da una
lectura, nunca un error.

## 5. Contrato

`movements[].investmentPurchase` viaja **solo** en `GET /api/movements`, como
`ownership` y `deposit`: `PATCH /api/movements`, `PATCH /api/movements/:id` y
`/api/transfers` no lo llevan. `hideNotCounted` **no cambia**: esconde lo marcado y
lo emparejado; una compra sin marcar sale siempre (F68: «lo que no está marcado ni
emparejado sale siempre, aunque no sume»).

## 6. Medición sobre datos reales (hecha por el spec-author, solo lectura)

`GET /api/movements?accountId=<la cuenta de MyInvestor>&pageSize=200` en la API
local (106 movimientos), clasificados con la regla de R1:

- **Reconocidos (11):** 2 del ETC de oro con participaciones (`certain: true`) y 9
  del fondo inmobiliario sin `@` (`certain: false`). Los 11 tienen hoy
  `excludedFromTotals: true` y `ownership.status: own`.
- **Gastos no reconocidos (54):** 19 aperturas de depósito, 12 suscripción premium,
  3 su IVA, 1 retención de la remuneración premium, 17 aportación automática a la
  cartera, 2 aportación a la cartera.
- **Ingresos (41):** no se miran (R12).

Consecuencia: **ninguna de las tres sumas cambia hoy**. La frase «el gasto de
octubre de 2026 sigue siendo el de hoy» no tiene test posible (la suite no lee la
base del humano). El reviewer la comprueba con la API en marcha, solo lectura:
`GET /api/overview?month=2026-10` antes y después, y compara `period.totals.expense`
con la cifra del intent.

## 7. Documentos que la feature vuelve falsos

- `docs/api-contract.md`: `GET /api/movements` (párrafo «Desde la feature 71», el
  campo en el ejemplo de respuesta, su tabla, el párrafo de `totals`) y una sección
  nueva `#### Compras de inversión de MyInvestor en las sumas` con la lista cerrada,
  la regla de `certain` y el orden. En `GET /api/overview` y
  `GET /api/expenses-by-category`, una línea que remite a esa sección.
- `docs/data-model.md` §Totales globales: un párrafo «desde la F71» tras el de
  depósitos. No hay columna nueva (la lección 2 no aplica).
- `docs/architecture.md`: **ADR-046** «Una compra de inversión de MyInvestor se
  reconoce al leer, por no ser ninguno de los conceptos fijos del banco, y no suma».
  No revisa ADR-035 ni ADR-040: se añade a ellos.

## 8. Datos reales en el código y los tests

- La lista cerrada de R1 son conceptos fijos del banco. Medido contra el detector de
  `src/no-real-data.test.ts`: ninguno de los seis prefijos forma una secuencia de
  tres palabras con dos palabras raras (`premium`, `aportacion`, `cartera` son
  comunes para él). Si aun así salta, se corrige el prefijo, nunca con
  `no-real-data-ok` sin decirlo en el informe.
- Los conceptos de compra de los tests se **inventan** (`ETC INVENTADO METAL @ 3`,
  `FONDO INVENTADO GLOBAL INDX`), y los importes también. Ni el nombre del ETC de oro
  ni el del fondo inmobiliario del humano se escriben en ningún archivo.

## 9. Alternativas descartadas

1. **Escribir `excludedFromTotals = true` al importar.** Cumple «sin marcar a mano»,
   pero confunde la marca del humano con la del importador, no arregla las compras
   ya guardadas y contradice ADR-040 (lo único que se guarda es la decisión del
   humano).
2. **Escribir `productId` al importar** (columna sin escritor desde la F9). Una
   compra de un producto nuevo no tiene archivo de producto con el que enlazar.
3. **Reconocer por forma positiva** (solo `@ n`, o una lista de gestoras como
   `ISHARES`, `VANGUARD`…): `@ n` coge 2 de 11; una lista de gestoras falla con la
   primera gestora nueva. Es la alternativa del punto 1 de la hoja.
4. **Reutilizar `depositMaturityMatchers`** con un método más: ahorra cablear un
   registro, pero mezcla en un nombre de depósitos algo que no lo es.
