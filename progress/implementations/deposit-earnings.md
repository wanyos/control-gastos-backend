# deposit-earnings — implementación

## Lote A — implementación (implementer, 2026-09-28)

Único lote, T1–T11, todas marcadas `[x]` en `specs/50-deposit-earnings/tasks.md`.
Nada se ha escrito en la base real `gastos`: los tests usan la base desechable del
worker y no se ha lanzado ninguna consulta contra la real. Sin migración.

### Archivos modificados / creados

- `src/modules/myinvestor/myinvestor.deposit-maturity.ts` — **nuevo**.
  `isMyinvestorDepositMaturity(description)`: `trimStart().startsWith('INTERESES DEP')`.
- `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts` — **nuevo**, 5 tests.
- `src/modules/investments/investments.types.ts` — `DepositMaturityMatcher`,
  `DepositMaturityMatcherRegistry`, `DepositEarningsStatus`, `DepositEarningsEntry`,
  `DepositEarningsResponse` (tal cual `design.md` §2).
- `src/modules/investments/investments.service.ts` — `getDepositEarnings(prisma,
  matchers, today)` + helper `isCancelledBeforeMaturity`. Dos lecturas: un `findMany`
  de productos `deposit` y, solo si hay algún depósito que ya tocaba, un `findMany`
  de movimientos (`type: 'income'`, `bookingDate in`, `account.bank in`). Aritmética
  en `Prisma.Decimal`, `toFixed(2)`.
- `src/modules/investments/investments.schema.ts` — `getDepositEarningsSchema`.
- `src/modules/investments/investments.routes.ts` — `GET /deposits`; opción
  `InvestmentsRoutesOptions { depositMaturityMatchers? }` (por defecto `[]`); `today`
  = fecha UTC a medianoche, igual que `net-worth.service.ts`.
- `src/modules/investments/investments.deposits.test.ts` — **nuevo**, 25 tests.
- `src/app.ts` — registro exportado `depositMaturityMatchers` (MyInvestor) pasado a
  `investmentsRoutes`.
- `docs/api-contract.md` — sección nueva `GET /api/investments/deposits` (cifras
  inventadas) y corregida la frase «el **único** endpoint bajo `/api/investments`»
  en **dos** sitios: §`GET /api/investments/overview` (la que pedía el diseño) y el
  párrafo de introducción de la capa de inversiones (~línea 290), que decía lo mismo.
- `docs/myinvestor-product-files.md` — nota en la plantilla B: `maturityDate` es lo
  que une el depósito con su vencimiento, y la cancelación anticipada se dice con
  `closedAt` anterior a `maturityDate`.

### Decisiones tomadas

- ⚠️ **Parámetro desconocido: 200, no 400.** `design.md` §5 y T6 dicen «un
  parámetro desconocido → 400 VALIDATION_ERROR, como el resto de rutas». El resto
  de rutas **no** hace eso: el AJV de Fastify quita la propiedad desconocida en vez
  de rechazarla (`removeAdditional`, ver `src/lib/strict-body.ts:6-8`), y el contrato
  lo dice de `GET /api/investments/overview` y `GET /api/net-worth` («se ignora»),
  con tests que lo fijan (`investments.routes.test.ts:440`, `net-worth.test.ts:139`).
  El esquema que pide `design.md` §1 (`additionalProperties: false` sobre objeto
  vacío) produce exactamente eso. **Comprobado ejecutando**: el test
  `ignores an unknown querystring parameter, same as the other investment views`
  pide `?foo=bar` y pasa con `200`. He seguido el esquema del diseño y la
  consistencia con las otras rutas, y el contrato dice «se ignora». Si se quiere un
  400, hace falta un gancho `preValidation` propio (no existe para querystring):
  sería una decisión nueva para el leader. No toca a ningún `R<n>` ni a
  `decisions.md`.
  ✅ **Aceptada por el leader el 2026-09-28**: el parámetro desconocido se ignora,
  como el resto de rutas.
- Orden de `deposits` con `maturityDate` `NULL` (defensivo, el parser lo impide):
  al final (`nulls: 'last'`). R1 no lo cubre.
- La segunda consulta (movimientos) no se lanza si ningún depósito había vencido:
  una lectura menos, mismo resultado.
- Defensivo sin requirement, como pide `design.md` §3: `principal` `NULL` en un
  depósito ya vencido → `maturity_not_found`; `maturityDate` `NULL` →
  `maturity_not_found` sin buscar. Los dos con test.

### Trazabilidad

Tests en `src/modules/investments/investments.deposits.test.ts` salvo que se diga otra cosa.

- R1 → `answers an empty list and a zero total when there is no deposit (R1, R9)`,
  `lists every deposit, live, matured or closed long ago, by maturityDate desc then id desc (R1)`,
  `reports the injected today as asOf (R1)`, `answers asOf with today in UTC`
- R2 → `carries the conditions of each product exactly as stored (R2)`
- R3 → `keeps a live deposit active with no figure, even with a maturity seeded on its future date (R3)`
- R4 → `gives a matured deposit amount minus principal, with the linked movement (R4)`,
  `looks for the maturity of a deposit that matures today (R4)`,
  `links a real MyInvestor maturity through the registry of app.ts (R4, R11)`
- R5 → `says maturity_not_found when no candidate exists, never a zero (R5)`
- R6 → `says ambiguous with the candidate ids ascending when two candidates exist (R6)`
- R7 → `says cancelled when closedAt is before maturityDate, even with a candidate (R7)`
- R8 → `says below_principal and shows the movement when it brings less than the principal (R8)`
- R9 → `sums only the matured entries into total (R9)`,
  `answers an empty list and a zero total when there is no deposit (R1, R9)`
- R10 → `leaves out a maturity whose deposit has no product file, and still answers (R10)`
- R11 → `src/modules/myinvestor/myinvestor.deposit-maturity.test.ts` (5 tests: sí
  `INTERESES DEP.:`, sí con espacios delante; no `APERTURA DEP.:`, no
  `CANCELACION DEP:`, no otra descripción),
  `ignores an opening or a cancellation with the real MyInvestor matcher (R11)`,
  `links a real MyInvestor maturity through the registry of app.ts (R4, R11)`
- R12 → `links each deposit only to the maturity on its own date, whatever the number says (R12)`
- R13 → `finds a candidate whether excludedFromTotals is true or false (R13)`
- R14 → `writes nothing while answering (R14)` (amount, excludedFromTotals,
  productId, transferId y updatedAt de los movimientos, `balance` de
  `GET /api/accounts` y los productos, antes y después del servicio y de la ruta)
- R15 → `docs/api-contract.md` §`GET /api/investments/deposits` (documental, sin test)

Otros tests del enlace (T8) sin `R<n>` propio: `ignores a movement of another bank,
an expense, another date or a non-maturity text`, `finds nothing for a bank with no
registered matcher`; de la ruta: `is registered as a GET only`,
`ignores an unknown querystring parameter, same as the other investment views`.

### Último ./init.sh

`./init.sh` completo, en solitario, 2026-09-28, repetido después de los tres añadidos del leader (mismo resultado que la pasada anterior):

```
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  75 passed (75)
      Tests  1393 passed (1393)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
EXIT=0
```

(Una pasada anterior salió exit 1 solo por Prettier en dos archivos míos; se
formatearon con `prettier --write` y la siguiente es la de arriba.)

### Añadidos al lote por el leader (2026-09-28)

Las tres sugerencias que dejé fuera de la cabecera del lote, asignadas después por
el leader. Ninguna cambia lo que comprueban los tests existentes:

- `src/architecture.test.ts` — `modules/myinvestor/myinvestor.deposit-maturity.ts`
  añadido a la lista del guardián «keeps the myinvestor parser module free of data
  access».
- `src/modules/investments/investments.routes.test.ts` — renombrado el test
  «exposes no write surface: only GET /overview exists under /api/investments» a
  «exposes no write surface: no POST, PATCH, PUT or DELETE on /overview or
  /api/investments». Mismo cuerpo, mismas aserciones.
- `README.md` — fila `GET /api/investments/deposits` en el índice de endpoints.

`./init.sh` completo después de estos tres cambios: ver §Último ./init.sh.

### Sugerencias fuera de scope (NO aplicadas)

Las tres que había aquí las aplicó después el leader (ver la sección de arriba).
