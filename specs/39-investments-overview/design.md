# Design — F39 `investments-overview`

> Cómo se construye la vista de solo lectura de las inversiones. Se apoya en
> `docs/architecture.md` (ADR-012, ADR-026), `docs/data-model.md` §Parte 2 y en
> el módulo `src/modules/overview/` (F38) como patrón de una vista que no
> calcula nada propio y no escribe nada.

## 1. Endpoint

```
GET /api/investments/overview?month=YYYY-MM&productId=<n>&type=<InvestmentProductType>
```

- Un solo endpoint: la lista de productos y la ganancia del periodo salen de la
  misma consulta, igual que `GET /api/overview` combina saldos y totales del
  mes. Registrado en `src/app.ts` bajo el prefijo `/api/investments`.
- Los tres parámetros son opcionales y combinables. `month` idéntico en forma y
  semántica al de la F38 (patrón `^\d{4}-(0[1-9]|1[0-2])$`, default = mes en
  curso UTC). `productId` entero ≥ 1. `type` enum de cinco valores.
- `additionalProperties: false` en el querystring: un parámetro desconocido se
  descarta antes del handler, como en el resto de la API.

## 2. Archivos

| Archivo | Qué |
| --- | --- |
| `src/modules/investments/investments.routes.ts` | **nuevo** — plugin Fastify con el único `GET /overview` |
| `src/modules/investments/investments.schema.ts` | **nuevo** — esquema del querystring |
| `src/modules/investments/investments.service.ts` | **modificado** — se añaden las funciones de lectura; los escritores (`persistProductSnapshot` y hermanos) no se tocan |
| `src/modules/investments/investments.types.ts` | **modificado** — tipos de la query y de la respuesta |
| `src/modules/investments/investments.routes.test.ts` | **nuevo** — tests de integración con `app.inject()` |
| `src/app.ts` | **modificado** — `app.register(investmentsRoutes, { prefix: '/api/investments' })` |
| `docs/api-contract.md` | **modificado** — sección nueva del endpoint; la nota «se ESCRIBEN, todavía no se LEEN» se actualiza |

## 3. Firmas nuevas

```ts
// investments.service.ts (lectura; junto a los escritores existentes)
export function investmentsDb(app: FastifyInstance): AppPrismaClient // gemela de overviewDb
export async function getInvestmentsOverview(
  prisma: AppPrismaClient,
  query: InvestmentsOverviewQuery,
): Promise<InvestmentsOverviewResponse>

// investments.routes.ts
export default async function investmentsRoutes(fastify: FastifyInstance)
```

`currentMonth()` y `monthRange()` se **importan** de
`src/modules/overview/overview.service.ts` (ya exportadas): una sola resolución
del mes en todo el backend. Precedente de import entre servicios:
`overview.service.ts` ya importa `listAccounts` de `accounts.service.ts`.

## 4. Consultas (todas `findMany` / `findUnique`; cero escrituras)

Volumen real: ~6 productos con fotos mensuales, así que se lee poco y se
resuelve en memoria, sin SQL a medida:

1. `investmentProduct.findMany` con `where` según filtros (`id`, `type`) y la
   regla de vigencia: `closedAt: null` **o** `closedAt >= from` (R9). Si se
   pidió `productId` y no hay fila → `404 NOT_FOUND` (R11), como el
   `accountId` de movements.
2. `valuation.findMany({ where: { productId: { in }, date: { lte: to } }, orderBy: { date: 'desc' } })`
   — de aquí salen, por producto, la foto del periodo (`date >= from`) y la
   anterior (primera con `date` menor que la foto del periodo, o menor que
   `from` si no la hay).
3. `savingsSnapshot.findMany` con el mismo criterio para las cuentas
   remuneradas.

## 5. Cálculo (derivar al leer, sí; persistir o alterar lo escrito, no)

- **Todos los importes guardados se serializan tal cual**: los `Decimal(10,2)`
  con `toFixed(2)` (la convención del contrato; el humano escribe 2 decimales)
  y `gainPercent` / `interestRate` con `Decimal.toString()` — sin `toFixed(4)`,
  que rellenaría con ceros lo que él no tecleó.
- `change.amount = gain_periodo − gain_anterior` (euros, con signo).
  `change.percentPoints = gainPercent_periodo − gainPercent_anterior` (puntos
  porcentuales, con signo). Cada componente es `null` si le falta un insumo
  (R4); nunca se inventa base ni se calcula un ratio nuevo — los dos números de
  partida son siempre los que escribió el humano.
- `periodGain.fluctuation` = Σ `change.amount` computables;
  `periodGain.interest` = Σ `interest` de los snapshots del periodo;
  `periodGain.total` = suma de ambas. Aritmética con `Prisma.Decimal`, nunca
  `number` (mismo criterio que `computeTotals`).
- Motivos de exclusión (enum cerrado, en el contrato): `no_photo_in_period`
  (sin foto en el mes), `no_previous_photo` (primera foto de la serie: no hay
  contra qué variar), `gain_not_reported` (algún `gain` implicado es `NULL`).
  Un `deposit` jamás aparece aquí: no tiene serie que echar en falta.

## 6. Forma de la respuesta (ejemplo; cifras inventadas)

```json
{
  "period": { "month": "2026-08", "from": "2026-08-01", "to": "2026-08-31" },
  "products": [
    {
      "id": 1, "bank": "myinvestor", "name": "Fondo Global", "type": "fund",
      "currency": "EUR", "openedAt": "2025-11-03", "closedAt": null,
      "valuation": {
        "date": "2026-08-29", "invested": "12300.00", "marketValue": "12800.50",
        "gain": "500.50", "gainPercent": "4.07", "uninvestedCash": "10.25"
      },
      "previousValuation": {
        "date": "2026-07-30", "invested": "12000.00", "marketValue": "12380.00",
        "gain": "380.00", "gainPercent": "3.17", "uninvestedCash": "10.25"
      },
      "change": { "amount": "120.50", "percentPoints": "0.90" }
    },
    {
      "id": 4, "bank": "myinvestor", "name": "Deposito 12m", "type": "deposit",
      "currency": "EUR", "openedAt": "2026-03-02", "closedAt": null,
      "conditions": {
        "principal": "10000.00", "interestRate": "2.75",
        "expectedGain": "275.00", "maturityDate": "2027-03-02"
      }
    },
    {
      "id": 5, "bank": "trade-republic", "name": "Cuenta remunerada",
      "type": "savings_account", "currency": "EUR",
      "openedAt": "2026-01-10", "closedAt": null,
      "snapshot": {
        "date": "2026-08-31", "openingBalance": "5000.00", "moneyIn": "200.00",
        "moneyOut": "0.00", "interest": "8.40", "balance": "5208.40"
      }
    }
  ],
  "periodGain": {
    "total": "128.90",
    "fluctuation": "120.50",
    "interest": "8.40",
    "excluded": [{ "productId": 2, "name": "ETF Mundo", "reason": "no_photo_in_period" }]
  }
}
```

- La forma de cada producto **depende de su tipo**: los que fluctúan llevan
  `valuation` / `previousValuation` / `change` (nullables); el `deposit` lleva
  `conditions` y ninguno de esos tres; el `savings_account` lleva `snapshot`
  (nullable). Así un `null` nunca es ambiguo: solo existe el campo en los tipos
  que pueden tener ese dato.
- **No hay patrimonio total aquí**: el aviso de la F9 (`marketValue` y
  `uninvestedCash` van aparte) se respeta devolviéndolos como dos campos
  separados, sin sumarlos. La consulta de patrimonio neto es una feature
  posterior ya prevista en `docs/data-model.md` §Patrimonio.

## 7. Errores

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `month` mal formado, `type` fuera del enum, `productId` no entero ≥ 1 (R14). |
| 404 | `NOT_FOUND` | `productId` que no existe (R11). |

Un periodo sin ninguna foto **no** es un error: 200 con los huecos a `null`,
`excluded` poblado y los tres importes de `periodGain` a `"0.00"`.

## 8. Alternativas descartadas

1. **Dos endpoints** (lista de productos / ganancia del periodo): dos
   peticiones para la misma pantalla y dos sitios donde la misma suma puede
   divergir. La F38 ya sentó el patrón contrario.
2. **Módulo nuevo `src/modules/investments-overview/`**: los datos y sus reglas
   (ADR-012: qué serie corresponde a cada tipo) viven en
   `modules/investments/`; separar la lectura duplicaría el conocimiento del
   dominio. El módulo se diseñó «para crecer» (ADR-012 decisión 12) y esto es
   exactamente ese crecimiento.
3. **Variación sobre `marketValue`**: contaría la aportación mensual como
   subida del mercado, que es la confusión que la serie existe para evitar
   (`docs/data-model.md` §Por qué `invested` está en la foto). Se mide sobre
   los `gain` del banco. Queda como 🔴 en `decisions.md` por si el humano
   prefiere la otra lectura.
4. **Arrastrar la última foto conocida cuando falta la del mes**: prohibido por
   el intent («en vez de dar por bueno el mes anterior») y por la regla del
   modelo de no convertir ausencias en hechos.
