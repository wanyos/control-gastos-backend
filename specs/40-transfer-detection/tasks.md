# Tasks — F40 `transfer-detection`

> Tres lotes. B depende de A; C depende de B. Los conjuntos de `Archivos:` no se
> solapan.

## Lote A — módulo de detección
Archivos: `src/modules/transfers/transfers.types.ts`,
`src/modules/transfers/transfers.service.ts`,
`src/modules/transfers/transfers.service.test.ts`,
`src/architecture.test.ts`
Depende de: —

- [x] T1 — Crear `transfers.types.ts` con `TransferCandidate`,
  `AmbiguousTransferGroup` y `TransferDetectionResult` (design §2). Cubre: R6, R7.
- [x] T2 — `pairTransferCandidates` (pura): grupos por `amount`, grafo
  expense↔income con cuentas distintas y ventana de 3 días, pareja solo con
  unicidad mutua, componentes no resueltas como grupos ambiguos, grado 0 fuera.
  Cubre: R2, R4, R5.
- [x] T3 — `detectTransfers(prisma)`: lee candidatos (`transferId = null`,
  `type != neutral`), empareja, escribe cada pareja con `crypto.randomUUID()`
  en una transacción con `WHERE transferId: null` y rollback si `count !== 2`;
  nunca lanza (fallo → `result.error` saneado). Cubre: R1 (mitad), R3, R11, R15.
- [x] T4 — Añadir los tres archivos nuevos a la lista de
  `src/architecture.test.ts`. Cubre: — (requisito del guardián de estructura).
- [x] T5 — Tests unitarios de `pairTransferCandidates`: pareja inequívoca; sin
  candidato (Bizum/tercero) ni se marca ni se reporta; dos candidatos → grupo
  ambiguo sin marcar; misma cuenta no empareja; fuera de ventana no empareja;
  mismo `type` no empareja. Cubre: R2, R4, R5.
- [x] T6 — Tests de integración de `detectTransfers`: dos piernas comparten un
  `transferId` nuevo y único por pareja; segunda ejecución deja exactamente las
  mismas parejas; una pierna que se inserta después se empareja en la segunda
  ejecución; la fila entera (menos `transferId` y `updatedAt`) queda idéntica,
  y el ancla de la cuenta no cambia. Cubre: R3, R8, R9, R10.

## Lote B — disparo desde el importador e informe
Archivos: `src/modules/import/import.service.ts`,
`src/modules/import/import.local.service.ts`,
`src/modules/import/import.types.ts`,
`src/modules/import/import.schema.ts`,
`src/modules/import/import.routes.test.ts`,
`src/modules/import/import.local.routes.test.ts`,
`src/modules/movements/movements.test.ts`
Depende de: Lote A

- [x] T7 — Añadir `transfers: TransferDetectionResult` a `ImportRunResult` y
  `LocalImportRunResult` (`import.types.ts`) y a los esquemas de respuesta de
  `import.schema.ts` para que Fastify no lo recorte. Cubre: R6, R7.
- [x] T8 — Llamar a `detectTransfers` al final de `importPending` y de
  `importLocalCopies`, después del bucle de archivos, y volcar su resultado en
  el campo `transfers`. Cubre: R1.
- [x] T9 — Tests de las dos rutas: el informe trae siempre `transfers` (con
  `pairsCreated: 0` y `ambiguous: []` cuando no hay nada); una importación que
  guarda las dos piernas las deja emparejadas y reporta `pairsCreated`; un caso
  ambiguo sale en `ambiguous` con sus movimientos; reimportar no cambia parejas.
  Cubre: R1, R6, R7, R8.
- [x] T10 — Test de punta a punta en `movements.test.ts`: tras emparejar con
  `detectTransfers`, los `totals` de `GET /api/movements` dejan fuera las dos
  piernas. Cubre: R12.

## Lote C — documentación
Archivos: `docs/api-contract.md`, `docs/data-model.md`
Depende de: Lote B

- [x] T11 — `docs/api-contract.md`: campo `transfers` en los informes de
  `POST /api/import` y `POST /api/import/local` (forma de design §4);
  actualizar la nota de `Movement.transferId` («hoy viaja siempre null» deja de
  ser cierto) y la nota de Traspasos del modelo `Movement`. Cubre: R13.
- [x] T12 — `docs/data-model.md`: sacar `transferId` de la tabla de columnas sin
  escritor (tachado con puntero a esta feature, como las demás) y reescribir en
  §Traspasos el párrafo «quién rellena transferId es una feature posterior».
  Cubre: R14.
