# transfer-detection — implementación

> Feature 40. Spec: `specs/40-transfer-detection/`. Implementada el 2026-09-03.
> Todos los importes, IBAN y descripciones de los tests son inventados.

## Archivos modificados / creados

**Nuevos (Lote A):**

- [`src/modules/transfers/transfers.types.ts`](../../src/modules/transfers/transfers.types.ts) — `TransferCandidate`, `AmbiguousTransferGroup`, `TransferDetectionResult` (design §2).
- [`src/modules/transfers/transfers.service.ts`](../../src/modules/transfers/transfers.service.ts) — `transferDateWindowDays = 3`, `pairTransferCandidates` (pura) y `detectTransfers(prisma)` (nunca lanza; una transacción por pareja con `WHERE transferId: null` y rollback si `count !== 2`).
- [`src/modules/transfers/transfers.service.test.ts`](../../src/modules/transfers/transfers.service.test.ts) — 14 tests (7 unitarios de la función pura + 7 de integración/fakes).

**Modificados (Lotes A y B):**

- [`src/architecture.test.ts`](../../src/architecture.test.ts) — los 3 archivos nuevos en la lista cerrada de `src/` (T4).
- [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts) — campo `transfers: TransferDetectionResult` en `ImportRunResult` y `LocalImportRunResult` (T7).
- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts) — llamada a `detectTransfers` al final de `importPending`, tras el bucle de archivos (T8); comentario de `toMovementRows` actualizado (ya no dice que emparejar es «feature posterior»).
- [`src/modules/import/import.local.service.ts`](../../src/modules/import/import.local.service.ts) — misma llamada al final de `importLocalCopies` (T8).
- [`src/modules/import/import.schema.ts`](../../src/modules/import/import.schema.ts) — solo un comentario (ver desviación 1).
- [`src/modules/import/import.routes.test.ts`](../../src/modules/import/import.routes.test.ts) — `transfers` siempre presente con ceros; emparejado de una pierna importada con su espejo ya guardado (T9).
- [`src/modules/import/import.local.routes.test.ts`](../../src/modules/import/import.local.routes.test.ts) — `transfers` con ceros; emparejado + reimportación que no cambia nada; caso ambiguo listado sin emparejar; fallo de la detección dentro del 200 (T9).
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts) — un `toEqual` del run vacío ganó el campo `transfers` (ver desviación 2).
- [`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts) — test de punta a punta detección → totales (T10).
- [`src/modules/movements/movements.service.ts`](../../src/modules/movements/movements.service.ts) — solo el comentario de `computeTotals` («hoy ninguna fila lleva transferId» dejó de ser cierto; ver desviación 3).

**Docs (Lote C):**

- [`docs/api-contract.md`](../../docs/api-contract.md) — campo `transfers` en los informes de `POST /api/import` y `POST /api/import/local` (forma de design §4, con tabla de campos); nota de `Movement.transferId` y nota de Traspasos reescritas («hoy viaja siempre null» eliminado); la nota de `totals` de `GET /api/movements` ya no dice que `transferId` no tiene escritor (T11).
- [`docs/data-model.md`](../../docs/data-model.md) — `transferId` tachado en la tabla de columnas sin escritor con puntero a la F40; §Traspasos reescrito: quién lo rellena, con qué regla y qué no toca (T12).
- `specs/40-transfer-detection/tasks.md` — las 12 tasks marcadas `[x]`.
- `progress/current.md` — plan de la sesión.

## Decisiones tomadas

- **Emparejamiento**: grafo bipartito expense↔income por `amount` exacto (string decimal), arista con cuentas distintas y `|Δ bookingDate| ≤ 3` días naturales; pareja solo si los dos extremos tienen grado 1; el resto de componentes con arista → grupo ambiguo; grado 0 → fuera del informe. La entrada se ordena por `id` antes de agrupar, así el resultado no depende del orden de llegada.
- **Una transacción por pareja** con `WHERE transferId: null`; si `count !== 2` un error interno de control de flujo (`PairRacedError`, no es `AppError`) hace rollback de ESA pareja y se salta sin tumbar el resto.
- **`detectTransfers` nunca lanza**: el fallo viaja en `result.error` con el patrón de saneado del importador (AppError → su código; resto → `INTERNAL_SERVER_ERROR`); `pairsCreated` conserva las parejas escritas antes del fallo.
- **Cero cambios en `prisma/schema.prisma`** y cero migraciones, como exigía el spec.

## Trazabilidad (requirement → test)

Todos en archivo:test con su nombre; `transfers` = `src/modules/transfers/transfers.service.test.ts`, `local` = `src/modules/import/import.local.routes.test.ts`, `drive` = `src/modules/import/import.routes.test.ts`, `movements` = `src/modules/movements/movements.test.ts`.

- **R1** (corre al final de las dos vías) → `drive`: `pairs an imported leg with its stored mirror and reports it (feature 40, R1)`; `local`: `pairs the imported leg with its stored mirror, and a reimport changes nothing (feature 40, R1, R8)`; el «siempre presente» también en `drive`: `returns 200 with the report of every file (R2)` y `src/modules/import/import.service.test.ts`: `reports nothing and touches nothing when there is no pending file`.
- **R2** (pareja inequívoca) → `transfers`: `pairs an unambiguous expense-income couple of the same amount (R2)`, `pairs at exactly the window edge and not one day beyond (R2)`, `does not pair two legs of the same account (R2)`, `does not pair two movements of the same type (R2)`.
- **R3** (transferId nuevo y único por pareja) → `transfers`: `writes one fresh transferId per pair, never shared between pairs (R2, R3)`.
- **R4** (sin candidato: ni marca ni informe) → `transfers`: `neither pairs nor reports a movement with no valid candidate (R4)` y el `lonely` del test de R3.
- **R5** (ambiguo: nadie se empareja) → `transfers`: `pairs nobody when one leg has two valid candidates, and reports the group (R5, R6)`, `resolves the clean pair and reports the tangled group of another amount (R2, R5)`; `local`: `links nobody when two mirrors compete, and lists the group in the report (feature 40, R5, R6)`.
- **R6** (informe con datos para localizarlos) → los mismos dos tests de R5 (aserción sobre `id`, `accountId`, `accountAlias`, `type`, `bookingDate`, `description`).
- **R7** (contador de parejas en el informe) → `drive` y `local`: los tests de R1 comprueban `pairsCreated` en el cuerpo de la respuesta.
- **R8** (idempotencia) → `transfers`: `leaves exactly the same pairs on a second run (R8)` (fila a fila con `toEqual`); `local`: test de R1/R8 (reimportación por HTTP).
- **R9** (pierna tardía) → `transfers`: `pairs a mirror leg that arrives in a later run with the old lonely one (R9)`.
- **R10** (solo cambia transferId; ancla y saldos intactos) → `transfers`: `changes nothing but transferId (and updatedAt) on any row, and no account (R10)` — compara la fila entera menos `transferId` y `updatedAt` (que avanza por `@updatedAt` de Prisma, dicho en design §6) y las cuentas enteras, ancla incluida.
- **R11** (dos piernas juntas o ninguna) → `transfers`: `skips a pair whole when the transaction finds fewer than two free legs (R11)` (cliente fake que responde `count: 1`: nada se cuenta y nada se reporta como error).
- **R12** (detección → totales, punta a punta) → `movements`: `leaves both legs out of the totals once detectTransfers pairs them (feature 40, R12)`.
- **R13** (api-contract.md) → hecho a mano; sin test (documentación).
- **R14** (data-model.md) → hecho a mano; sin test (documentación).
- **R15** (fallo dentro del informe, sin cambiar HTTP ni archivos) → `transfers`: `never throws: an AppError travels in result.error with its own code (R15)` y `never throws: any other failure is reported generically (R15)`; `local`: `reports a detection failure inside the 200, with the import intact (feature 40, R15)` (proxy sobre el cliente real que revienta solo la lectura de la detección: 200, `importedCount: 2`, archivo `imported`, `transfers.error` presente).

## Desviaciones del design

1. **`import.schema.ts` no gana esquema de respuesta** (T7, segunda mitad). El design decía añadir `transfers` «a los esquemas de respuesta … para que Fastify no lo recorte», pero **no existe ningún esquema de respuesta** en las rutas del importador (comprobado en `src/modules/import/import.routes.ts:56-73`: solo `localImportSchema`, que es de request), así que Fastify no recorta nada y no hay dónde añadirlo. Añadir un esquema de respuesta nuevo del informe entero habría sido alcance nuevo con riesgo de recortar campos existentes. Queda un comentario en `import.schema.ts` dejándolo dicho, y los tests de las dos rutas comprueban que `transfers` viaja entero por HTTP.
2. **Un test existente ajustado**: `import.service.test.ts` › `reports nothing and touches nothing when there is no pending file` usaba `toEqual` sobre el resultado entero y falló al ganar éste el campo `transfers`; se añadió el campo esperado. Es la única línea tocada fuera de los archivos de las tasks dentro de `src/` junto con el comentario de la desviación 3.
3. **Comentario de `computeTotals` en `movements.service.ts`** (archivo no listado en ningún lote): decía «Today no row carries either column — their writers are later features», que esta feature vuelve falso para `transferId`. Solo cambia el comentario, ninguna línea de código.

## Último ./init.sh

Completo, en verde, 2026-09-03:

```
Test Files  54 passed (54)
     Tests  1060 passed (1060)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

(Además: `Type check OK (tsc sin errores)`, `Lint OK`, `Formato OK`. El archivo nuevo `transfers.service.test.ts` aporta 14 de los 1060, verificado ejecutándolo solo.)

## Sugerencias fuera de scope (NO aplicadas)

- Un endpoint dedicado para lanzar la detección bajo demanda quedó descartado en decisions.md (decisión 3); `detectTransfers` queda expuesto como función para hacerlo en una tarde si algún día hace falta.
- Deshacer una pareja: fuera de esta feature por decisión 4 (necesita memoria → migración).
- El informe del importador sigue sin esquema de respuesta de Fastify (ver desviación 1); si algún día se añade uno, tendrá que declarar el informe entero, `transfers` incluido.
