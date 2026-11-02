# Tasks — F66 `import-statement-all-or-nothing`

Un solo lote: el código y sus tests comparten `import.service.ts` e
`import.service.test.ts`, y los documentos son tres retoques que dependen de lo
que quede escrito en el código.

## Lote A — una transacción por extracto, sus tests y los documentos
Archivos: `src/lib/prisma.ts`, `src/modules/accounts/accounts.service.ts`, `src/modules/import/import.service.ts`, `src/modules/import/import.balance.service.ts`, `src/modules/import/import.warnings.service.ts`, `src/modules/import/import.service.test.ts`, `docs/api-contract.md`, `docs/architecture.md`, `docs/roadmap.md`
Depende de: —

- [x] T1 — Exportar `TransactionClient` desde `src/lib/prisma.ts` (design §2.1). No tocar `src/modules/investments/`. Cubre: R9.
- [x] T2 — Cambiar a `TransactionClient` el tipo del cliente en `resolveAccount`, `findOrCreateAccountFromMetadata`, `persistMovements`, `backfillMissingBalances`, `readStoredAnchor`, `anchorAccountIfMissing`, `readAccountAnchor` y `StatementBalanceCheckDeps.prisma`, sin tocar sus cuerpos (design §2.2). Cubre: R9.
- [x] T3 — `persistImportWarnings`: recibe `TransactionClient`, hace los `upsert` uno detrás de otro sin `prisma.$transaction`, mismo contenido de cada escritura; corregir su JSDoc (design §2.3). Cubre: R2, R6, R9.
- [x] T4 — `importStatement`: pasos de `resolveAccount` a `persistImportWarnings` dentro de `deps.prisma.$transaction(async (tx) => …, { timeout: STATEMENT_TRANSACTION_TIMEOUT_MS })`, con la constante a `60_000`; parseo y `assertTheFileBringsMovements` fuera; conservar el orden y los comentarios, incluido el 🔴 de leer el ancla antes de anclar (design §2.4). Cubre: R1, R2, R3, R4, R5, R6, R8, R12.
- [x] T5 — `failedStatementResult(result, error)` en el `catch` de `importStatement`: informe vacío + `unparsedRows`, `unparsedCount`, `status: 'failed'` y `error` (design §2.4). Cubre: R7.
- [x] T6 — Ayudante de test `insideStatementTransaction(prisma, wrap)` y adaptar `recordingPrisma` y `prismaThatCannotStoreWarnings` para que actúen sobre el `tx`, **sin cambiar ninguna aserción** de sus tests (design §5.1, §5.2). Cubre: R9.
- [x] T7 — Tests `F66 R1 rolls back every movement of a file whose preamble check throws` y `F66 R2 rolls back every movement of a file whose warnings cannot be stored` (design §5.3). Cubre: R1, R2, R6.
- [x] T8 — Tests `F66 R3 removes the account a failed file had just created`, `F66 R4 leaves unanchored the account a failed file had anchored` y `F66 R5 leaves empty the balances a failed file had filled`. Cubre: R3, R4, R5.
- [x] T9 — Tests `F66 R7 reports a failed file with no account and zero counters` y `F66 R8 keeps the files of the same run that were imported`. Cubre: R7, R8.
- [x] T10 — Tests `F66 R10 still imports a file whose preamble does not match`, `F66 R11 keeps what a statement stored when only its move to procesados fails` y `F66 R12 opens the transaction of a statement with a 60 second timeout`. Cubre: R10, R11, R12.
- [x] T11 — `pnpm exec vitest run src/modules/import src/modules/accounts` y `pnpm test` en verde; confirmar con `git diff --stat` que no se tocan `prisma/`, `src/modules/investments/` ni `importProductFile`. Cubre: R9.
- [x] T12 — Documentos (design §4): `docs/api-contract.md` (`POST /api/import`, estado `failed`, informe de un archivo fallido, la excepción de mover a `procesados/`, y la frase de la F48), `docs/architecture.md` (ADR-042 y la remisión en ADR-031 punto 5) y `docs/roadmap.md` (cabo 26 cerrado por la F66, F66 en la fila E5, y el deber de la prueba con datos reales). Después, `pnpm exec vitest run src/modules/import` otra vez por los tests que leen el contrato. Cubre: R7, R11.
