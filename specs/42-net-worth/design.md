# Design — F42 `net-worth`

## 1. Endpoint nuevo, no ampliación de `GET /api/overview`

`GET /api/net-worth`, módulo nuevo `src/modules/net-worth/`, registrado en
`src/app.ts` con `prefix: '/api/net-worth'` (mismo patrón que `overview`).

Alternativa descartada: añadir un bloque `investments` + `total` a
`GET /api/overview`. Se descarta porque (a) el intent exige que «la F38 y la
F39 siguen igual» y ampliar el overview cambia su contrato para el frontend;
(b) el overview es una vista MENSUAL (period/totals) y el patrimonio es una
foto a HOY sin periodo — mezclar los dos ejes en una respuesta obliga a
explicar por qué la mitad de los campos ignoran `?month`; (c) el propio humano
cerró en la F38/F39 que «cada dinero tiene su vista» y esta es «la de arriba
del todo», una tercera vista.

## 2. Dónde vive cada lectura (el guardián de ADR-026 no se toca)

`src/architecture.test.ts` (línea ~424) exige que el ÚNICO archivo de `src/`
que nombra `prisma.investmentProduct`, `prisma.savingsSnapshot` o
`prisma.valuation` sea `modules/investments/investments.service.ts`. Por tanto:

- La lectura de las tres tablas de inversión vive en
  `investments.service.ts`, como una función nueva del lado de lectura
  (sección "Read side" ya existente, feature 39).
- El módulo `net-worth` COMPONE: llama a `listAccounts` (accounts) y a esa
  función nueva (investments), y suma. No nombra ningún modelo Prisma de
  inversiones.

Alternativa descartada: relajar el guardián para permitir lecturas desde el
módulo nuevo. Distinguir lectura de escritura por regex es frágil y el coste
de mantener la promesa «un solo escritor» sube; componer funciones entre
módulos es el patrón ya usado (overview importa de accounts y movements).

## 3. Archivos

**Se modifican**

| Archivo | Cambio |
|---|---|
| `src/modules/investments/investments.types.ts` | Tipos nuevos del lado net-worth (abajo). |
| `src/modules/investments/investments.service.ts` | `getInvestmentsNetWorth` (solo `find*`). |
| `src/modules/investments/investments.service.test.ts` | Tests de la valoración (R3–R9). |
| `src/app.ts` | `app.register(netWorthRoutes, { prefix: '/api/net-worth' })`. |
| `docs/api-contract.md` | Sección `GET /api/net-worth` completa. |

**Se crean**

| Archivo | Contenido |
|---|---|
| `src/modules/net-worth/net-worth.types.ts` | `NetWorthResponse` y bloques. |
| `src/modules/net-worth/net-worth.schema.ts` | Querystring vacía (`additionalProperties: false`, sin properties → todo parámetro desconocido se descarta, R11). |
| `src/modules/net-worth/net-worth.service.ts` | `netWorthDb(app)` + `getNetWorth(prisma)`: compone y suma. |
| `src/modules/net-worth/net-worth.routes.ts` | `GET /` con el schema; solo lectura (R12). |
| `src/modules/net-worth/net-worth.test.ts` | Tests de integración (R1, R2, R10–R13). |

## 4. Firmas nuevas

```ts
// investments.service.ts (read side)
export async function getInvestmentsNetWorth(
  prisma: AppPrismaClient,
  today: Date, // date-only UTC; inyectada para que los tests fijen el reloj
): Promise<InvestmentsNetWorth>

// net-worth.service.ts
export function netWorthDb(app: FastifyInstance): AppPrismaClient
export async function getNetWorth(prisma: AppPrismaClient): Promise<NetWorthResponse>
```

## 5. Tipos (en `investments.types.ts` los de inversiones; en `net-worth.types.ts` la respuesta)

```ts
export type NetWorthIssueReason = 'no_valuation' | 'stale_valuation' | 'matured_not_closed'

export interface NetWorthIssue {
  productId: number
  name: string
  reason: NetWorthIssueReason
  /** date de la foto usada; maturityDate en matured_not_closed; null en no_valuation. */
  valuedAt: string | null
}

/** Discriminado por type, como en la F39: un null nunca es ambiguo. */
export interface FluctuatingNetWorthProduct {
  id: number; bank: string; name: string
  type: 'fund' | 'etf' | 'managed_portfolio'
  value: string | null            // marketValue + uninvestedCash; null sin foto (R7)
  marketValue: string | null      // tal como está guardado
  uninvestedCash: string | null   // tal como está guardado (NULL = no lo trae)
  valuedAt: string | null         // date de la Valuation usada
  stale: boolean                  // R8
}
export interface DepositNetWorthProduct {
  id: number; bank: string; name: string
  type: 'deposit'
  value: string | null            // = principal (null solo si principal es NULL)
  principal: string | null
  expectedGain: string | null     // informativo: NO sumado (R4)
  maturityDate: string | null
  matured: boolean                // maturityDate < hoy (R9)
}
export interface SavingsNetWorthProduct {
  id: number; bank: string; name: string
  type: 'savings_account'
  value: string | null            // = balance del último snapshot
  valuedAt: string | null
  stale: boolean
}
export type NetWorthProduct =
  FluctuatingNetWorthProduct | DepositNetWorthProduct | SavingsNetWorthProduct

export interface InvestmentsNetWorth {
  total: string
  products: NetWorthProduct[]
  issues: NetWorthIssue[]
}

// net-worth.types.ts
export interface NetWorthAccounts {
  total: string
  accounts: OverviewAccount-like[]  // misma forma que accounts de GET /api/overview
}
export interface NetWorthResponse {
  asOf: string                      // YYYY-MM-DD (hoy, UTC)
  total: string                     // accounts.total + investments.total
  accounts: NetWorthAccounts
  investments: InvestmentsNetWorth
}
```

Nota: el bloque de cuentas repite la forma de `OverviewAccount` pero se declara
en `net-worth.types.ts` (o se importa de `overview.types.ts`, que ya exporta el
tipo — preferible: importarlo, un solo dueño de la forma).

## 6. Algoritmo de `getInvestmentsNetWorth`

1. `today` = medianoche UTC de hoy; `staleBefore` = primer día del mes
   anterior (derivado con `currentMonth()`/`monthRange()` de overview.service,
   ya importados por este archivo).
2. `investmentProduct.findMany({ where: { closedAt: null }, orderBy: { id: 'asc' } })`
   — R6: cerrado = fuera, sin excepciones.
3. Para los ids resultantes, `valuation.findMany` y `savingsSnapshot.findMany`
   con `date <= today`, `orderBy: { date: 'desc' }` (mismo patrón que la F39);
   por producto, la primera fila es "la más reciente con date <= hoy".
4. Por producto según `type`:
   - fluctuante: sin fila → R7; con fila → `value = marketValue +
     (uninvestedCash ?? 0 SOLO como identidad de suma — implementado como
     marketValue.plus(uninvestedCash) únicamente si no es null)`; `stale` si
     `date < staleBefore` → issue R8.
   - `deposit`: `value = principal` (si `principal` es NULL — no debería, el
     parser lo exige — `value: null` y NO suma, sin issue nuevo); `matured` y
     su issue si `maturityDate < today` (R9).
   - `savings_account`: como fluctuante pero con `balance` del snapshot.
5. `total` = Σ `Prisma.Decimal` de los `value` computables; serialización
   `toFixed(2)` para todo lo monetario (R10). Nada más se deriva: no se toca
   `gain`, no se compara con `invested`.

`getNetWorth` (módulo net-worth): `Promise.all([listAccounts(prisma),
getInvestmentsNetWorth(prisma, todayUtc())])`, suma los dos totales y arma la
respuesta. Solo `find*` en todo el camino (R12).

## 7. Errores

Ninguno nuevo. Sin parámetros no hay 400 posible (la querystring desconocida
se descarta, R11); no hay 404 (no hay recurso direccionable). Los errores
genéricos (500) los cubre el handler central de la F2.

## 8. Contrato (`docs/api-contract.md`)

Sección nueva `### GET /api/net-worth` tras `GET /api/investments/overview`,
con: las tres reglas de valoración, el enum cerrado de `issues.reason` (tabla
como la de `excluded` en F39), el umbral exacto de `stale_valuation`, ejemplo
de respuesta con cifras inventadas, y la nota «solo existe el GET». Además, en
la sección de F39, actualizar la frase «la consulta de patrimonio neto es otra
feature» → referencia a la sección nueva, y en la línea 796 el «único endpoint
bajo /api/investments» sigue siendo cierto (el nuevo cuelga de /api/net-worth).
