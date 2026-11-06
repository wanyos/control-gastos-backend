# Tasks — F68 `movements-hide-not-counted`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto**, ser únicos en
> su archivo y ejecutarse.
>
> **Ningún dato del humano en tests ni en ejemplos** (`docs/conventions.md` §Tests):
> importes, conceptos y números de depósito inventados. Los movimientos se siembran
> con Prisma dentro del test, en la base de tests (patrón de
> `movements.deposits.test.ts`: cuenta `myinvestor`, conceptos `APERTURA DEP`,
> `CANCELACION DEP`, `INTERESES DEP` y un `transferId` escrito a mano para
> «emparejado»).
>
> `hideNotCounted` está pendiente de aprobación (`decisions.md` 🔴 3). Si el humano
> cambia el nombre, se cambia aquí, en los nombres de test y en los `checks`
> **antes** de pasar la feature a `in_progress`.
>
> Un solo lote: 6 tasks sobre el mismo módulo; partirlo cuesta más de lo que ahorra.

## Lote A — el parámetro, sus tests y el contrato
Archivos: `src/modules/movements/movements.schema.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.hide-not-counted.test.ts`, `src/modules/movements/movements.hide-not-counted.docs.test.ts`, `docs/api-contract.md`, `README.md` (solo la fila de `GET /api/movements`; ampliado por la review 1)
Depende de: —

- [x] T1 — `hideNotCounted: { type: 'boolean' }` en `listMovementsSchema` y `hideNotCounted?: boolean` en `MovementListQuery`. Cubre: R9, R10.
- [x] T2 — `listMovements`: leer `readDepositMovements` antes del `where`; `movementListWhere` recibe el mapa y añade la condición en `where.AND` (`design.md` §2). `computeTotals` no se toca. Cubre: R1–R6, R11.
- [x] T3 — Tests en `movements.hide-not-counted.test.ts` (base de tests, por `app.inject`):
  - "keeps a marked maturity with interest and counts its interest" — R2, R6 (vencimiento con capital por apertura previa, marcado: sale y `totals.income` incluye su interés).
  - "keeps a paired maturity with interest and counts its interest" — R2, R6 (lo mismo con `transferId`; y uno marcado **y** emparejado).
  - "hides a normal movement that is marked or paired" — R1 (un gasto marcado, un ingreso emparejado: no salen ni cuentan en `pagination.total`).
  - "hides a doubtful maturity that is marked or paired" — R3 (vencimiento sin apertura posible, marcado; otro emparejado).
  - "hides a deposit opening or cancellation that is marked or paired" — R3.
  - "hides a maturity whose interest is exactly zero when marked" — R3 (apertura y vencimiento del mismo importe).
  - "keeps everything that is neither marked nor paired" — R4 (un `own` por la tabla de cuentas propias, un `neutral`, uno con `productId`, una apertura sin marcar: salen todos).
  - "keeps a maturity whose opening is before the requested range" — R5 (apertura en un mes, vencimiento marcado en el siguiente, se pide solo el segundo).
  - "gives the same totals with and without hideNotCounted" — R7 (un mes con todos los casos de arriba, también un `own` marcado y un `mine` emparejado: los tres importes de `totals` iguales con y sin el parámetro, y distintos de `excluded=none&transfer=none` en el interés del vencimiento marcado).
  - "what it shows plus what it hides is every movement of the month" — R8 (mismo mes: `total` sin el parámetro − `total` con él = número de filas escondidas sembradas; con `pageSize=1` en la petición sin filtro, como el frontend).
  - "hideNotCounted=false or absent does not filter" — R9 (respuesta igual a la de sin parámetro).
  - "rejects a hideNotCounted that is not true or false" — R10 (`yes` → 400 `VALIDATION_ERROR`).
  - "combines hideNotCounted with excluded, transfer and ownership" — R11 (`excluded=only` deja solo el vencimiento marcado que suma; `transfer=none` + parámetro; `ownership=doubtful` + parámetro devuelve los dudosos).
- [x] T4 — `docs/api-contract.md` §`GET /api/movements`: párrafo «Desde la feature 68», fila `hideNotCounted` en la tabla de parámetros, frase en la nota de `totals` («con `hideNotCounted=true` los `totals` son los mismos que sin él»), cómo contar los escondidos, y `hideNotCounted` en la fila 400 de errores. Cubre: R13.
- [x] T5 — Test en `movements.hide-not-counted.docs.test.ts`:
  - "the contract describes hideNotCounted and how to count what it hides" — R13 (la fila del parámetro existe; nombra la excepción del depósito que suma, que los `totals` no cambian, la combinación con `excluded`/`transfer`/`ownership` y la resta de los dos `pagination.total`).
- [x] T6 — `pnpm test` entero en verde: `movements.test.ts`, `movements.exclusion.test.ts`, `movements.deposits.test.ts` y los de `own-accounts` sin tocar. Cubre: R12.
