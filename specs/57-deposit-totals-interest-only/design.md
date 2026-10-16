# Design — F57 `deposit-totals-interest-only`

> Material del implementer y del reviewer. Las decisiones para el humano están
> en `decisions.md`. **Este archivo no lleva ninguna cifra de la base del
> humano** (`src/no-real-data.test.ts` la marcaría): lo medido se describe sin
> importes; las cifras están en `../docs/handoff-depositos.md`, fuera del repo.

## 1. Archivos

| Archivo | Qué cambia |
|---|---|
| `src/modules/myinvestor/myinvestor.deposit-maturity.ts` | Nueva `classifyMyinvestorDepositMovement`. `isMyinvestorDepositMaturity` pasa a llamarla (una sola lista de prefijos) |
| `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts` | Tests de la clasificación |
| `src/modules/investments/investments.types.ts` | `DepositMovementKind`, `classifyDepositMovement` en `DepositMaturityMatcher`, tipos de entrada/salida del cálculo |
| `src/modules/investments/investments.deposit-movements.ts` (nuevo) | Función **pura** `resolveDepositMovements` (sin `prisma`, sin nombre de banco) |
| `src/modules/investments/investments.deposit-movements.test.ts` (nuevo) | Tests unitarios de la función pura |
| `src/modules/investments/investments.service.ts` | `readDepositMovements(prisma, matchers)`: lee productos `deposit` y movimientos de las cuentas de los bancos del registro, y llama a la pura. Aquí porque `architecture.test.ts` solo deja a este archivo nombrar `.investmentProduct.` |
| `src/app.ts` | La entrada `myinvestor` del registro gana `classifyDepositMovement`; el registro se pasa también a `movementsRoutes` y `overviewRoutes` |
| `src/modules/movements/movements.types.ts` | `TotalsMovement` gana `id`; `SerializedDeposit`; `ListedMovement = SerializedMovement & { deposit }` |
| `src/modules/movements/movements.service.ts` | `computeTotals(movements, deposits)`; `listMovements` recibe el registro, llama a `readDepositMovements` y añade `deposit` a cada fila de la página |
| `src/modules/movements/movements.routes.ts` | Opción `depositMaturityMatchers` (como en `investments.routes.ts`) |
| `src/modules/movements/movements.schema.ts` | `deposit` en el esquema de respuesta de `GET /api/movements` (si no, Fastify lo quita al serializar) |
| `src/modules/movements/movements.deposits.test.ts` (nuevo) | Tests de integración por HTTP de la regla en `GET /api/movements` |
| `src/modules/overview/overview.service.ts`, `overview.routes.ts` | Mismo registro; `computeTotals` con el mapa de depósitos |
| `src/modules/overview/overview.test.ts` | Test de R13 |
| `prisma/migrations/20261016120000_deposit_movements_unmark/migration.sql` (nuevo) | Solo `UPDATE` (R14). Sin cambio de esquema |
| `src/modules/movements/movements.deposit-unmark-migration.test.ts` (nuevo) | Ejecuta el SQL de la migración sobre filas sembradas en la base desechable |
| `docs/api-contract.md` | R16 (ver §8) |
| `docs/data-model.md` | §Totales: la regla de depósitos y que la marca no cuenta en ellos. **No hay columnas nuevas**: la lección #2 no aplica |
| `docs/architecture.md` | ADR-035 nuevo: lo que suma un movimiento de depósito se calcula al leer, por cuenta y en orden, con capital del `.json` o de la apertura aún no devuelta; y la marca no cuenta en ellos. Añadir el módulo nuevo al árbol de §estructura si lo lista por archivo |
| `src/modules/movements/movements.deposits.docs.test.ts` (nuevo) | Test del contrato (R16) |

## 2. Firmas

```ts
// investments.types.ts
export type DepositMovementKind = 'opening' | 'cancellation' | 'maturity'

export interface DepositMaturityMatcher {
  bank: string
  isDepositMaturity(description: string): boolean            // F50, sin cambios de uso
  classifyDepositMovement(description: string): DepositMovementKind | null   // F57
}

export type DepositAmbiguityReason = 'principal_not_found' | 'several_principals' | 'opening_not_found'

export interface DepositMovementInput {          // lo que la pura necesita de cada movimiento
  id: number
  accountId: number
  bank: string
  type: MovementType
  bookingDate: Date
  daySequence: number | null
  amount: Prisma.Decimal
  description: string
}

export interface DepositProductInput { id: number; bank: string; maturityDate: Date | null; principal: Prisma.Decimal | null }

export interface DepositMovementReading {
  kind: DepositMovementKind
  principal: Prisma.Decimal | null
  counted: Prisma.Decimal            // lo que suma: a income si kind=maturity; 0 en el resto
  ambiguous: boolean
  reason: DepositAmbiguityReason | null
  candidateMovementIds: number[]
}

// investments.deposit-movements.ts (pura)
export function resolveDepositMovements(
  movements: DepositMovementInput[],
  products: DepositProductInput[],
  matchers: DepositMaturityMatcherRegistry,
): Map<number, DepositMovementReading>

// investments.service.ts
export async function readDepositMovements(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
): Promise<Map<number, DepositMovementReading>>

// movements.service.ts
export function computeTotals(
  movements: TotalsMovement[],              // TotalsMovement gana `id`
  deposits: Map<number, DepositMovementReading>,
): MovementTotals
export async function listMovements(
  prisma: AppPrismaClient,
  query: MovementListQuery,
  matchers: DepositMaturityMatcherRegistry,
): Promise<MovementListResponse>            // movements: ListedMovement[]
```

Serialización de `deposit` (R10): `kind`, `principal` (`toFixed(2)` o `null`),
`countedAmount` (`toFixed(2)`), `ambiguous`, `reason`, `candidateMovementIds`.

## 3. La regla, paso a paso (`resolveDepositMovements`)

1. Clasifica cada movimiento con el `classifyDepositMovement` del matcher de su
   `bank` (sin matcher → no es de depósito). Además exige el `type`: apertura
   `expense`, cancelación y vencimiento `income`; si no coincide, no es de depósito
   (R1).
2. Agrupa por `accountId` y ordena por `bookingDate`, `daySequence ?? 0`, `id`
   (la misma comparación que `isAfter` de `movements.service.ts`, más `id` para
   desempatar). Cada cuenta lleva su lista de **aperturas aún no devueltas**.
3. Recorre en ese orden:
   - **Apertura** → `counted 0`, `principal = amount`; se añade a la lista.
   - **Cancelación** → `counted 0`. Busca la apertura más antigua de la lista con
     `amount` exactamente igual: si la hay, la quita y `principal = amount`; si no,
     `ambiguous`, `reason: opening_not_found`, `principal: null` (R8).
   - **Vencimiento** (`M` = su importe):
     a. Productos del mismo `bank` con `maturityDate` = `bookingDate`, `principal`
        no nulo y que cumplen la condición de importe (`P ≤ M` y `M − P < P`).
        Uno → capital `P`; quita de la lista la apertura más antigua de importe `P`
        si la hay (puede no haberla). Más de uno → dudoso `several_principals`,
        `candidateMovementIds: []`.
     b. Ningún producto → candidatos = aperturas de la lista que cumplen la
        condición de importe. Todas del mismo importe → capital ese importe, quita
        la más antigua. Ninguna → `principal_not_found`. Varios importes →
        `several_principals` con sus ids ascendentes.
     c. Con capital → `counted = M − capital`. Dudoso → `counted 0` y no quita nada
        de la lista (R7).
4. Todo con `Prisma.Decimal`, nunca `number` (convención del módulo).

Por qué «anterior» incluye el mismo día con `daySequence` menor: en MyInvestor un
vencimiento y la apertura del depósito siguiente caen a menudo el mismo día, y el
vencimiento va antes. La apertura del mismo día **posterior** no es candidata.

## 4. Totales y listado

- `computeTotals`: si `deposits.has(movement.id)`, suma `counted` a `income`
  cuando `kind === 'maturity'` y nada en el resto, **sin mirar**
  `excludedFromTotals`, `transferId` ni `productId` (R9). Si no, la regla de hoy
  sin cambios. Sigue siendo la única suma de `GET /api/movements` y
  `GET /api/overview` (R13).
- El mapa se calcula sobre **toda la historia** de las cuentas de los bancos del
  registro, no sobre el filtro: lo que cuenta un vencimiento de octubre no puede
  depender de que el filtro deje fuera su apertura de septiembre. La consulta lee
  todos los movimientos de las cuentas de esos bancos (hoy, solo la cuenta de
  MyInvestor, algo menos de cien filas; comprobado) y clasifica en memoria: así la
  consulta no repite los prefijos del banco.
- `deposit` solo se añade en `GET /api/movements`. `PATCH /api/movements`,
  `PATCH /api/movements/:id` y las respuestas de `/api/transfers` siguen con la
  forma de hoy (`serializeMovement` no cambia).
- Solo `find*` en todo el camino (R15).

## 5. Migración (R14)

`UPDATE "Movement" SET "excludedFromTotals" = false WHERE "excludedFromTotals" AND
"accountId" IN (SELECT id FROM "Account" WHERE bank = 'myinvestor') AND (
(type = 'expense' AND ltrim(description) LIKE 'APERTURA DEP%') OR (type = 'income'
AND (ltrim(description) LIKE 'CANCELACION DEP%' OR ltrim(description) LIKE
'INTERESES DEP%')))`. Ni `updatedAt` a mano ni otra columna. Repite los prefijos
de R1 porque una migración no puede llamar al código: el comentario del SQL lo
dice y remite a `myinvestor.deposit-maturity.ts`. Como R9 ya hace que la marca no
cuente en un movimiento de depósito, si un día los prefijos divergieran la suma
no cambiaría; solo el listado por `excluded=only`.

El test la ejecuta leyendo `migration.sql` y lanzándolo con `$executeRawUnsafe`
sobre la base desechable del worker, con filas sembradas: una apertura, una
cancelación y un vencimiento marcados de `myinvestor`, un movimiento marcado que
no es de depósito, y un movimiento con descripción de depósito en una cuenta de
otro banco. Solo los tres primeros se desmarcan.

## 6. Lo comprobado contra la base real (2026-10-16, solo lectura)

Conexión con `default_transaction_read_only=on` al contenedor `gastos-postgres`.
Ninguna escritura.

- 35 movimientos de depósito, todos en la cuenta de MyInvestor: 18 aperturas
  (`expense`), 4 cancelaciones (`income`) y 13 vencimientos (`income`); ninguno
  con un `type` distinto del esperado. 29 marcados (15 aperturas, 2 cancelaciones
  y 12 vencimientos, de agosto de 2025 a septiembre de 2026) y 6 sin marcar
  (octubre). Hay 30 marcas en total: la otra es de un
  movimiento de septiembre que no es de depósito.
- Ninguno tiene `transferId` ni `productId`.
- 4 productos `deposit` (aperturas de julio, agosto, septiembre y octubre de 2026).
  Dos vencimientos tienen producto por fecha; los demás no.
- Simulé la regla de §3 sobre esos datos (script fuera del repo, solo lectura):
  - Un único dudoso: el **vencimiento del 2025-08-25**, `principal_not_found`. Es
    el primer movimiento de la cuenta; su apertura es anterior al primer extracto.
  - Todos los demás vencimientos tienen capital cierto, y el capital que sale de
    las aperturas coincide con el `principal` del producto en los dos que lo tienen
    (también si se ignoran los productos).
  - Ninguna cancelación queda dudosa.
  - Al final del recorrido quedan sin devolver exactamente dos aperturas, que son
    las de los dos productos vivos: cuadra.
  - **Sin la condición «el interés es menor que el capital»**, el vencimiento del
    2026-07-30 queda dudoso entre dos aperturas de importes distintos. Con ella,
    no. Por eso está en R5.
  - Octubre: aperturas y cancelaciones suman 0 y el vencimiento suma su interés,
    que coincide con el `expectedGain` de su producto.
- **No lo he comprobado por la API**: las cifras de `GET /api/movements` tras la
  feature solo se pueden ver con el código hecho y la migración aplicada. Es la
  prueba real del humano (`decisions.md` 🧪).

## 7. Errores

Ninguno nuevo. Un dudoso no es un error: es un dato de la respuesta (200).

## 8. `docs/api-contract.md`

- `### Movement` / `GET /api/movements`: el campo `deposit` con tabla de claves y
  un ejemplo de cada clase y uno dudoso. Sección nueva «Movimientos de depósito en
  las sumas» con la regla de §3 en llano: qué cuenta cada clase, de dónde sale el
  capital, cuándo es dudoso y qué cuenta entonces.
- `excludedFromTotals` (fila de `Movement`, `PATCH` y filtro `excluded`): en un
  movimiento de depósito se guarda, se filtra y se devuelve, pero **no cambia lo
  que suma**; las marcas de depósito anteriores las quitó la migración de la F57.
- `GET /api/overview`: `period.totals` sigue la misma regla.
- `GET /api/investments/deposits`: quitar o corregir la frase que diga que lo
  generado por un depósito no entra en ninguna suma (la F50 lo dejaba como
  incoherencia).
- `GET /api/net-worth`: no cambia.

## 9. Alternativas descartadas

- **Guardar la clasificación y el capital al importar** (columnas nuevas en
  `Movement`): hay que recalcular cuando llega un `.json` de producto, cuando se
  importa un mes anterior (cambia qué aperturas siguen sin devolver) y rellenar lo
  que ya hay. Tres escritores para un dato que se calcula en memoria sobre menos
  de cien filas.
- **Usar el número de la descripción** como filtro adicional: hoy daría el mismo
  resultado, pero el humano dijo en la F50 que no quiere que se empareje por él, y
  la condición de importe resuelve el único caso en que haría falta.
- **Que un dudoso cuente entero** (como hoy): vuelve a meter el capital como
  ingreso, que es lo que la feature quita.
- **Que la marca mande sobre la regla**: contradice «un vencimiento marcado no
  puede seguir ocultando su interés».
- **Calcular el mapa solo con los movimientos del filtro**: un mes cuyo vencimiento
  tiene la apertura en el mes anterior saldría dudoso.
