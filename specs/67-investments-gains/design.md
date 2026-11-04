# Design — F67 `investments-gains`

> Nombres de ruta, campos y motivos: aprobados el 2026-11-04 (`cancelled` ya no es motivo).

## 1. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/investments/investments.service.ts` | Nueva `getInvestmentGains`. **Tiene que vivir aquí**: el guardián `writes the three investment tables only from modules/investments` de `src/architecture.test.ts` busca `.investmentProduct.` y `prisma.valuation.` en cualquier `.ts` que no sea test, lecturas incluidas, y espera solo este archivo. Un `investments.gains.ts` con un `findMany` lo pondría rojo. |
| `src/modules/investments/investments.types.ts` | Tipos de la respuesta (§3). |
| `src/modules/investments/investments.schema.ts` | `getInvestmentGainsSchema`: querystring vacío, mismo patrón que `getDepositEarningsSchema`. |
| `src/modules/investments/investments.routes.ts` | `GET /gains` (queda `/api/investments/gains` por el prefijo de `src/app.ts`), con `todayInMadridAsDate()` y el `depositMaturityMatchers` que ya recibe el plugin. `src/app.ts` no cambia. |
| `src/modules/investments/investments.gains.test.ts` | Nuevo: tests de comportamiento con nombres de `tasks.md`. |
| `src/modules/investments/investments.gains.docs.test.ts` | Nuevo: lee `docs/api-contract.md` (patrón de `expenses-by-category.docs.test.ts`). |
| `docs/api-contract.md` | Sección `GET /api/investments/gains` tras `GET /api/investments/deposits`; una línea en §«Inversiones — quién las escribe y quién las lee» con el lector nuevo. |
| `docs/architecture.md` | ADR-043 (§6). |

Sin migración, sin columna nueva: la lección 2 de `docs/lessons.md` no aplica y
`docs/data-model.md` no se toca. `GET /api/investments/overview`,
`GET /api/investments/deposits` y `GET /api/net-worth` no cambian.

## 2. Firma

```ts
export async function getInvestmentGains(
  prisma: AppPrismaClient,
  matchers: DepositMaturityMatcherRegistry,
  today: Date, // date-only, medianoche UTC
): Promise<InvestmentGainsResponse>
```

Pasos:

1. `investmentProduct.findMany({ where: { type: { in: ['fund','etf','managed_portfolio','deposit'] } } })`.
2. Fecha de cierre por producto (`requirements.md` §definiciones); cerrado si ≤ `today`.
3. Fotos: `valuation.findMany({ where: { productId: { in }, date: { lte: today } }, orderBy: { date: 'desc' } })`.
   Para un vivo, la primera de su producto; para un cerrado, la primera con
   `date ≤ fecha de cierre` (fecha de cierre ≤ hoy, así que está en el mismo
   resultado). Mismo patrón que `getInvestmentsNetWorth`.
4. Depósitos: **llamar a `getDepositEarnings(prisma, matchers, today)`** e indexar
   sus `deposits` por `id`. No se reescribe la búsqueda del vencimiento: si la F50
   cambia, esta vista cambia con ella. Su `status` se usa para un depósito
   **cerrado**; uno vivo es siempre R6 (aunque la F50 diga `active`, son lo mismo).
   - `matured` → R7 (`currentValue` = `maturity.amount`, `valuedAt` = `maturity.date`).
   - `cancelled` → R16 (`gain` 0, `currentValue` = `principal`, `valuedAt` = `closedAt`, `reason: null`).
   - `maturity_not_found` / `ambiguous` / `below_principal` → `reason` = ese `status`.
   - `principal` o `maturityDate` `NULL` → `missing_conditions`, antes que lo anterior.
   - **Vivo (R6), reparto por días:** `D` = días de `openedAt` a `maturityDate`,
     `d` = días de `openedAt` a hoy, acotado a `[0, D]`; todo en fechas date-only
     UTC, `(b.getTime() − a.getTime()) / 86_400_000`. `gain` =
     `expectedGain.times(d).dividedBy(D).toDecimalPlaces(2, ROUND_HALF_UP)`.
     `openedAt` o `expectedGain` `NULL`, o `D ≤ 0` → `missing_conditions` (nunca
     se divide por 0). El día que abre gana 0; el día antes de vencer, casi toda;
     el día que vence ya está en `closed` (R3).
5. Total sobre `live` (R10–R13) en `Prisma.Decimal`, con la ganancia **ya
   redondeada** de cada depósito (así el total cuadra con la suma de las filas) y su
   `principal` en `total.invested`; `gainPercent` con
   `.dividedBy(invested).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)`.

Solo `find*` en todo el camino (R14).

## 3. Forma de la respuesta

```json
{
  "asOf": "2026-11-03",
  "total": {
    "gain": "686.35", "invested": "22300.00", "gainPercent": "3.08",
    "excluded": [{ "productId": 2, "name": "ETF Mundo", "reason": "no_photo" }]
  },
  "live": [
    {
      "id": 1, "bank": "myinvestor", "name": "Fondo Global", "type": "fund",
      "openedAt": "2025-11-03", "closedAt": null,
      "invested": "12300.00", "currentValue": "12800.50", "gain": "500.50",
      "gainPercent": "4.07", "uninvestedCash": "10.25", "valuedAt": "2026-09-30",
      "reason": null
    },
    {
      "id": 4, "bank": "myinvestor", "name": "Deposito 12m", "type": "deposit",
      "openedAt": "2026-03-02", "closedAt": "2027-03-01",
      "conditions": { "principal": "10000.00", "interestRate": "2.75",
                      "expectedGain": "275.00", "maturityDate": "2027-03-01" },
      "invested": "10000.00", "currentValue": "10185.85", "gain": "185.85",
      "gainPercent": "1.86", "valuedAt": "2026-11-03", "reason": null
    }
  ],
  "closed": [
    {
      "id": 7, "bank": "myinvestor", "name": "Deposito 3m", "type": "deposit",
      "openedAt": "2026-06-01", "closedAt": "2026-09-01", "closedOn": "2026-09-01",
      "conditions": { "...": "..." },
      "invested": "5000.00", "currentValue": "5031.20", "gain": "31.20",
      "gainPercent": "0.62", "valuedAt": "2026-09-01", "reason": null
    }
  ]
}
```

- Comunes: `id`, `bank`, `name`, `type`, `openedAt`, `closedAt` (tal como están
  guardados), las cuatro cifras, `valuedAt`, `reason`; en `closed`, además `closedOn`.
- Fluctúa: `uninvestedCash` (tal cual, `null` si `NULL`).
- `deposit`: `conditions` (mismo objeto y formato que en `GET /api/investments/overview`).
- En el ejemplo, el depósito lleva 246 de 364 días: 275,00 × 246 / 364 = 185,85 (redondeado).
  Total: 500,50 + 185,85 = 686,35 sobre 12.300 + 10.000 = 22.300 → 3,08 %.
- Un cancelado sale en `closed` con `closedOn` = `closedAt`, `invested` =
  `currentValue` = `principal`, `gain` y `gainPercent` `"0.00"`.
- Importes con 2 decimales; `gainPercent` de una foto y `interestRate` **sin relleno
  de ceros**, como en `overview` (no se inventan dígitos); los `gainPercent`
  calculados (R6, R7, R12) siempre con 2 decimales.
- Orden: `live` por `openedAt` ascendente (`null` al final) y después `id`;
  `closed` por `closedOn` descendente y después `id` descendente.
- `total.excluded` en el orden de `live`.

Tipos nuevos en `investments.types.ts`: `InvestmentGainsResponse`,
`InvestmentGainsTotal`, `GainsProduct` (unión discriminada por `type`, como
`NetWorthProduct`), `GainsReason` (unión de los 7 literales de R8).

## 4. Errores

Ninguno propio: sin parámetros no hay 400 y no hay recurso que dé 404. Base sin
productos → `200` con `live: []`, `closed: []`, `total.gain` y `total.invested`
`"0.00"`, `gainPercent: null`, `excluded: []`.

## 5. Alternativas descartadas

- **Ampliar `GET /api/investments/overview`** (p. ej. `?since=opened`): la vista es
  de un mes y su `periodGain` es variación de un mes; sumarle lo acumulado obliga a
  que `valuation` deje de significar «la foto del periodo». Rompería lo que el
  frontend ya consume.
- **Dejar fuera del total los depósitos vivos** (propuesta inicial): rechazada por el
  humano el 2026-11-04, un depósito vivo es inversión.
- **Sumar la `expectedGain` entera de un depósito vivo**: el humano eligió el
  reparto por días. **Reparto por interés compuesto con la TAE**: más exacto en
  teoría, pero se aparta de `expectedGain`, que es la cifra que escribe el humano.
- **`currentValue` = `marketValue + uninvestedCash`** (como `GET /api/net-worth`):
  dejaría de cumplirse `invested + gain = currentValue` con las cifras guardadas
  (`docs/data-model.md` §Patrimonio). El efectivo va en su campo.
- **Rehacer la búsqueda del vencimiento** dentro de la consulta nueva: dos copias de
  la misma regla que se separarían. Se llama a `getDepositEarnings`.
- **Archivo de servicio propio (`investments.gains.ts`)**: lo impide el guardián de
  `src/architecture.test.ts` (§1).

## 6. ADR-043

Título propuesto: «Lo que gana cada inversión desde que se abrió se lee en una ruta
propia, a fecha de hoy, con las fotos tal como están y la regla de los depósitos de
la F50; un depósito vivo reparte su ganancia esperada por días y entra en el total
con su capital».
Contexto (encargo del frontend para su feature 40, decisiones del humano del
2026-11-03), decisión (§2–§3), alternativas (§5), consecuencias: un depósito
vencido sin `closedAt` cuenta como cerrado aquí pero `GET /api/net-worth` lo sigue
sumando con `matured_not_closed` (comportamiento distinto a propósito: allí importa
dónde está el dinero, aquí si terminó).
