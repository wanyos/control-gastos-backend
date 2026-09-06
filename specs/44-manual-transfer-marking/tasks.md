# Tasks — F44 `manual-transfer-marking`

> Tres lotes. B y C dependen de A; entre sí no comparten archivos, pero C
> documenta la superficie que B implementa, así que conviene cerrarlos en ese
> orden. Los `Archivos:` de los tres lotes no se solapan.

## Lote A — migración, servicio y detección
Archivos: `prisma/schema.prisma`, `prisma/migrations/**` (nueva),
`src/modules/transfers/transfers.service.ts`,
`src/modules/transfers/transfers.types.ts`,
`src/modules/transfers/transfers.service.test.ts`
Depende de: —

- [x] T1 — Columna `undoneTransferId String?` en `model Movement` +
      `pnpm prisma migrate dev --name movement-undone-transfer-id`. Cubre: R9, R11.
- [x] T2 — `linkTransfer` en `transfers.service.ts`: validaciones en el orden
      del design §3 y escritura transaccional con guarda de carrera
      (`WHERE transferId: null`, `count !== 2` → conflicto). Cubre: R1, R2,
      R3, R4, R5, R6, R8, R13.
- [x] T3 — `unlinkTransfer`: `updateMany` único que pone `transferId = null` y
      `undoneTransferId = <valor deshecho>`; `count === 0` → `NotFoundError`.
      Cubre: R9, R10, R13.
- [x] T4 — Veto en la detección: `TransferCandidate.undoneTransferId`, select
      ampliado en `detectTransfers`, condición de arista y de resolubilidad
      del lote igualado en `pairTransferCandidates`. Cubre: R11, R12.
- [x] T5 — Tests de servicio: enlace válido (incluye fechas a 60 días, R8),
      cada rechazo (importes, tipos con `neutral`, misma cuenta, ya enlazado,
      inexistente), deshecho con memoria escrita, foto antes/después de campos
      no tocados. Cubre: R1, R2, R3, R4, R5, R6, R8, R9, R10, R13.
- [x] T6 — Tests de detección con veto: la pasada no rehace la pareja
      deshecha; el movimiento deshecho se empareja con un tercero compatible;
      un grupo par con una combinación deshecha dentro sale dudoso entero;
      un caso sin deshechos se comporta exactamente como en F40/F41.
      Cubre: R11, R12.

## Lote B — capa HTTP y registro
Archivos: `src/modules/transfers/transfers.routes.ts` (nuevo),
`src/modules/transfers/transfers.schema.ts` (nuevo),
`src/modules/transfers/transfers.routes.test.ts` (nuevo), `src/app.ts`,
`src/modules/movements/movements.routes.ts` (solo el comentario de cabecera)
Depende de: Lote A

- [x] T7 — `transfers.schema.ts`: `linkTransferSchema` (array de 2 enteros ≥ 1,
      `additionalProperties: false`) + `linkTransferBodyProperties`;
      `unlinkTransferSchema`. Cubre: R7.
- [x] T8 — `transfers.routes.ts`: `POST /` (con
      `assertOnlyAllowedBodyProperties` en `preValidation`, ids distintos
      verificados con mensaje claro) y `DELETE /:transferId`; registro en
      `src/app.ts` con prefijo `/api/transfers`; retocar el comentario de
      `movements.routes.ts` («no transfer endpoint» ya no es exacto).
      Cubre: R1, R7, R9.
- [x] T9 — Tests HTTP con `app.inject()`: `201` con
      `{ transferId, movements }`, `400` por body inválido / propiedad
      desconocida / ids repetidos, `404`, `409`, `204` del DELETE, y
      `GET /api/movements` excluyendo la pareja manual de los `totals`.
      Cubre: R1, R5, R6, R7, R9, R10, R14.

## Lote C — documentación
Archivos: `docs/api-contract.md`, `docs/data-model.md`
Depende de: Lote A

- [x] T10 — `docs/api-contract.md`: los dos endpoints con sus tablas de
      errores; reescribir la nota «No hay endpoint de traspasos» y el bloque
      de traspasos. Cubre: R1, R9 (documentación).
- [x] T11 — `docs/data-model.md`: columna nueva en el esquema copiado,
      §Traspasos (el marcado manual existe desde la F44, la memoria del
      deshecho y su semántica), fila de «Columnas reservadas». Cubre: R9, R11
      (documentación).
