# Review — F57 `deposit-totals-interest-only`

## Review (2026-10-16)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `docs/api-contract.md:1052` (fila `excludedFromTotals` del body de
   `PATCH /api/movements`) y `docs/api-contract.md:1124` (la misma fila en
   `PATCH /api/movements/:id`): siguen diciendo, sin salvedad, «`true` los saca / saca
   el movimiento de las sumas de `income` y `expense`; `false` los devuelve». Desde la
   F57 eso es falso en un movimiento de depósito (R9). Es la misma frase que se
   corrigió en `README.md:81` con autorización del leader, y es la tabla contra la que
   el frontend construye el `PATCH`. El párrafo de arriba de cada sección ya tiene la
   salvedad (líneas 1038-1042 y 1114-1117), pero la fila no. Añade a las dos filas la
   misma salvedad («salvo en un movimiento de depósito, donde la marca se guarda pero
   no cambia lo que suma», con el enlace a §Movimientos de depósito en las sumas).
2. `docs/api-contract.md:297-298` (nota de traspasos en `### Movement`): «ambas
   piernas comparten un `transferId` y **no cuentan como gasto ni como ingreso** en
   los totales globales». Desde la F57, una pierna que sea un vencimiento de depósito
   suma su interés aunque tenga `transferId` (R9). El propio lote B ya corrigió este
   mismo caso en `DELETE /api/transfers/:transferId` (líneas 1212-1215) y en el
   párrafo de `totals` (línea 900). Añade la misma salvedad aquí.

Comando con que lo encontré:
`git grep -n -E "marcad|saca|los saca|no cuenta" -- docs/api-contract.md` y lectura de
cada línea que devuelve.

Lo demás está bien; con estas tres líneas del contrato corregidas, no veo nada más
que impida aprobar.

### Comprobado sin hallazgos

- **`./init.sh`** (lanzado por mí, solo, 2026-10-16): exit 0. `Type check OK`,
  `OK: pnpm run lint`, `OK: pnpm run format:check`,
  `Test Files 81 passed (81)`, `Tests 1392 passed (1392)`, `Entorno listo`.
- **`./init.sh --checks`** (lanzado por mí, después y solo): exit 0,
  `Checks: 11 de 11 en verde.` Cada check que filtra por nombre imprime
  `Tests 1 passed` (con `8 skipped (9)`, `13 skipped (14)` o `(1)`): todos ejecutan
  su test. El 11 (`pnpm test`) sale con exit 0. Los 11 checks coinciden con la tabla
  🧪 de `decisions.md` (2 de octubre, 3 de agosto-septiembre, importe, dudoso,
  contrato, y los tres añadidos).
- **Trazabilidad R1-R16 ↔ tests**: cada `R<n>` tiene al menos un test que comprueba
  cifras concretas (`movements.deposits.test.ts`, `investments.deposit-movements.test.ts`,
  `myinvestor.deposit-maturity.test.ts`, `movements.test.ts` › `computeTotals`,
  `overview.test.ts`, `movements.deposit-unmark-migration.test.ts`,
  `movements.deposits.docs.test.ts`). R8 solo tiene test de la función pura; es
  suficiente.
- **`tasks.md`**: T1-T15 en `[x]`. La parte de T6 «`deposit` en el esquema de
  respuesta» no se hizo y está justificada en el informe: comprobado que
  `listMovementsSchema` (`movements.schema.ts:10`) no tiene esquema de respuesta, y los
  tests HTTP leen `deposit` de la respuesta.
- **`amount` y `type` no cambian**: test `keeps the bank amount and type…` compara
  respuesta y base. `computeTotals` no toca el movimiento; nada escribe en
  `readDepositMovements` (solo `findMany`).
- **`GET /api/net-worth` no se toca**: `git diff --stat` no lista ningún archivo de
  `src/modules/net-worth/`; `net-worth.test.ts` en verde dentro de la suite.
  `getDepositEarnings` (F50) tampoco cambia: el diff de `investments.service.ts` solo
  añade `readDepositMovements` y su import.
- **Nada se adivina**: sin capital cierto → `counted 0`, `principal null`,
  `ambiguous`, motivo y candidatos, y no consume apertura (tests de R7, R11 y
  `an ambiguous maturity returns no opening`). Dos productos el mismo día → dudoso.
- **Vencimiento marcado no oculta su interés**: `computeTotals` mira el mapa de
  depósitos antes que la marca (`movements.service.ts:532-536`); test
  `counts a deposit maturity marked excludedFromTotals by its interest` y el unitario
  con marca, `transferId` y `productId`.
- **Migración**: solo `UPDATE` de `excludedFromTotals`; ejecutada por el test sobre la
  base desechable del worker con 6 filas (3 desmarcadas, 3 que conservan la marca) y
  comparación del resto de columnas, `updatedAt` incluido. No la he lanzado contra la
  base real. Es la única migración nueva (`git status` de `prisma/`).
- **Ampliaciones autorizadas**: `README.md`, una línea cambiada (la 81, `git diff`).
  `prisma/schema.prisma`, `git diff --numstat` → `4 0`, las cuatro líneas son `//`;
  `pnpm exec prisma migrate diff --from-schema <schema de HEAD> --to-schema prisma/schema.prisma --script`
  → `-- This is an empty migration.`, exit 0. `investments.deposits.test.ts`: solo el
  import y `classifyDepositMovement` en las dos entradas del registro de prueba.
- **Arquitectura y convenciones**: la función pura no nombra banco ni Prisma; los
  prefijos viven en el módulo del banco y llegan por el registro de `src/app.ts`
  (ADR-015); `Prisma.Decimal` en todo el cálculo; `architecture.test.ts` en verde.
- **Documentos que la feature vuelve falsos**: `docs/data-model.md`,
  `docs/architecture.md` (ADR-035 y notas en ADR-011/012), `README.md`, comentarios de
  `src/` y `schema.prisma`, al día; los fallos están arriba.
- **`docs/lessons.md`**: #2, no hay columna nueva ni escritor de una columna que no lo
  tuviera (`excludedFromTotals` ya lo escribían los dos `PATCH`), y aun así
  `data-model.md` está al día; #3, no hay fixtures `.xls` ni `.pdf`.
  `src/no-real-data.test.ts` en verde; importes de los tests inventados.
- **Vocabulario**: ningún término nuevo en el código ni en los documentos tocados;
  «dudoso», «movimiento de depósito», «apertura aún no devuelta» y «condición de
  importe» se usan como descripciones literales, definidas en `requirements.md` y
  en la hoja que aprobó el humano. `docs/vocabulary.md` sin cambios.
- **Spec (C7)**: `decisions.md` con los bloques de la plantilla, 🔴 de 6 puntos, cada
  uno con alternativa; 16 requirements con la razón dicha en ⚙️ 6; procedencia de
  R1-R16 clasificada.
- **`api-contract.md` y el último «cómo sé»**: dice cómo cuenta cada clase, el campo
  `deposit` con sus claves y valores, cómo se señala uno dudoso y qué pasa con
  `excludedFromTotals`; el test del contrato lo comprueba. Solo fallan las tres
  líneas de arriba.
- CHECKPOINTS C1-C7. C4 bis: no aplica, la feature no lee archivos de fuera (la prueba
  con los datos reales la hace el humano, según la tabla 🧪).

## Review — segunda revisión (2026-10-16)

**Veredicto:** APPROVED
Comprobado: los tres pasajes rechazados ya son ciertos (`docs/api-contract.md:297-300`
nota de traspasos, `:1055` y `:1127` filas `excludedFromTotals` de los dos `PATCH`). Las
dos frases más que corrigió el implementer también son ciertas: la entrada de la F49 en
`GET /api/movements` (`:761-762`) y el campo `transfers` de `POST /api/import`
(`:2226-2229`). Busqué otra vez la misma afirmación con
`git grep -n -E "marcad|saca|los saca|no cuenta|fuera de las sumas|no inflan|deja fuera|dejan fuera|quedan fuera|las dejan|traspaso.*(totales|sumas)|no suman|no entra" -- docs/api-contract.md`
y la extendí a `README.md`, `docs/data-model.md`, `docs/myinvestor-product-files.md` y
`docs/roadmap.md`. Cada línea que sale lleva la salvedad en la misma fila o en el
párrafo de al lado, o no habla de las sumas. Para saber qué tocó la corrección, busqué
los archivos modificados después de la primera revisión
(`find . -newer progress/reviews/deposit-totals-interest-only.md`): solo
`docs/api-contract.md`, `src/modules/movements/movements.deposits.docs.test.ts` (que
ahora comprueba también las tres salvedades) y el informe. `tsconfig.tsbuildinfo` es un
archivo de compilación que no está en git. Lancé las dos pasadas, una después de otra y
sin nadie más ejecutando la suite.
`./init.sh` dio exit 0: `Type check OK`, `OK: pnpm run lint`, `OK: pnpm run format:check`,
`Test Files 81 passed (81)`, `Tests 1392 passed (1392)`.
`./init.sh --checks` dio exit 0. Checks: 11 de 11 en verde, y cada check que filtra por
nombre imprime `Tests 1 passed`.
Sin hallazgos. Lo demás quedó comprobado en la primera revisión, CHECKPOINTS C1-C8.
Resumen de cierre: `progress/summaries/deposit-totals-interest-only.md`.
