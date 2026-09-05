# Tasks — F41 `transfer-batch-pairing`

> Feature pequeña: **un solo lote** (el cambio de lógica, sus tests y las dos
> correcciones de prosa caben en una sesión y giran alrededor del mismo módulo).

## Lote A — regla de grupos igualados, tests y docs
Archivos: `src/modules/transfers/transfers.types.ts`,
`src/modules/transfers/transfers.service.ts`,
`src/modules/transfers/transfers.service.test.ts`,
`docs/api-contract.md`, `docs/data-model.md`
Depende de: —

- [x] T1 — Añadir `daySequence: number | null` a `TransferCandidate` y al
      `select` de `detectTransfers`. Cubre: R2.
- [x] T2 — En `pairTransferCandidates`, antes de dar una componente por dudosa:
      si número de salidas = número de entradas Y cada combinación
      salida×entrada cumple candidato válido, ordenar cada lado por
      `(bookingDate, daySequence null=0, id)` y emparejar posición a posición;
      si no, la componente entera sigue a `ambiguous`. Cubre: R1, R2, R3, R4, R9.
- [x] T3 — Tests unitarios (sin BD) con los fixtures sintéticos de design §5:
      punto 1 (3×1000 mismo día → 3 pares en orden), punto 2 (cruce hacia dos
      bancos → 2 pares), punto 3 (2×3000 días consecutivos → d1↔d1, d2↔d2),
      punto 4 (2×500 y una entrada → dudoso entero), borde encadenado por
      ventana (→ dudoso entero) y empates de fecha con y sin `daySequence`.
      Cubre: R1, R2, R3, R4, R9.
- [x] T4 — Verificar R5: la suite existente de la F40 pasa **sin modificar sus
      expectativas** (si algún test de la F40 esperaba como dudoso un grupo que
      ahora se resuelve, ese test se revisa a mano contra el intent antes de
      tocarlo, y el cambio se anota en `progress/transfer-batch-pairing.md`).
      Cubre: R5.
- [x] T5 — Test de integración (BD): añadir un grupo igualado al escenario
      existente y comprobar (1) segunda pasada → mismas parejas y los
      `transferId` previos intactos; (2) fila entera sin cambios salvo
      `transferId` y `updatedAt`; (3) las dos piernas de cada par nuevo se
      escriben en una transacción (mismo mecanismo F40). Cubre: R6, R7, R8.
- [x] T6 — Actualizar la prosa de la regla: `docs/api-contract.md` (nota de
      `POST /api/import/local` ~línea 260 y tabla del campo `transfers`
      ~línea 1017) y `docs/data-model.md` (§Traspasos ~línea 374 y tabla de
      columnas ~línea 231): «solo parejas inequívocas» pasa a incluir los grupos
      con igual número de salidas que de entradas totalmente combinables entre
      sí. La **forma** del informe no cambia. Cubre: R10.
