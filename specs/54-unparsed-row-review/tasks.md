# Tasks — F54 `unparsed-row-review`

> Un solo lote: el cambio de código son cuatro archivos del mismo módulo y los
> documentos describen ese mismo cambio. Los nombres de test entre comillas son
> **exactos**: los `checks` de `feature_list.json` filtran por ellos.
>
> ❌ No se crea ninguna ruta para crear movimientos. No se toca
> `src/modules/import/import.service.ts`, ningún parser ni `src/app.ts`.
> ❌ Ningún test existente sobre descuadres de saldo cambia lo que afirma.

## Lote A — columnas, ruta, tests y documentos
Archivos: `prisma/schema.prisma`, `prisma/migrations/20261002120000_unparsed_row_review/migration.sql`, `src/modules/import/import.warnings.types.ts`, `src/modules/import/import.warnings.service.ts`, `src/modules/import/import.warnings.schema.ts`, `src/modules/import/import.warnings.routes.ts`, `src/modules/import/import.warnings.service.test.ts`, `src/modules/import/import.warnings.routes.test.ts`, `src/modules/import/import.warnings.docs.test.ts`, `src/lib/test-real-data.ts`, `src/lib/test-real-data.test.ts`, `docs/api-contract.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/conventions.md`
Depende de: —

- [x] T1 — `prisma/schema.prisma` y la migración de `design.md` §2.1 (solo `ADD COLUMN`); `prisma generate`. Cubre: R9.
- [x] T2 — `src/lib/test-real-data.ts`: `ImportUnparsedRow.note` en `comparedColumns` como `text` (`design.md` §2.6); `test-real-data.test.ts` solo si una aserción suya enumera las columnas. Cubre: R9.
- [x] T3 — `import.warnings.types.ts` y `import.warnings.service.ts` según `design.md` §2.2 y §2.3: `SerializedUnparsedRow` con `status`, `note`, `reviewedAt`; `counts.unparsedRows` solo las `pending`; `reviewUnparsedRow`. `persistImportWarnings` no cambia de código. Cubre: R1, R2, R3, R4, R6, R7, R8, R10.
- [x] T4 — `import.warnings.schema.ts` y `import.warnings.routes.ts` según `design.md` §2.4: `PATCH /warnings/unparsed-rows/:id`. Cubre: R1, R5.
- [x] T5 — `import.warnings.service.test.ts`, bloque nuevo `unreadable row review (feature 54)`, con datos inventados:
  - `stores a new unreadable row as pending, with no note and no review date` — tras `persistImportWarnings`, la fila tiene `status: 'pending'`, `note: null`, `reviewedAt: null`. Cubre: R9.
  - `reimporting does NOT take the reviewed mark nor the note off an unreadable row` — guardar, `reviewUnparsedRow` con `reviewed` y nota, volver a llamar a `persistImportWarnings` con el mismo archivo y la misma fila (con otro `reason`); la fila conserva `status`, `note` y el mismo `reviewedAt`, y hay una sola fila. Cubre: R8.
  - `throws NOT_FOUND when the id is of no stored unreadable row`. Cubre: R4.
- [x] T6 — `import.warnings.routes.test.ts`, bloque nuevo `unreadable row review routes (feature 54)`, con `buildApp()` + `app.inject()`:
  - `registers the unreadable-row review route under the /api/import prefix`. Cubre: R1.
  - `marks an unreadable row reviewed with its note and returns it serialized` — 200; cuerpo con exactamente los campos de la fila serializada (`Object.keys`), `status: 'reviewed'`, la nota y `reviewedAt` ISO; la fila sigue en la tabla. Cubre: R1, R10.
  - `puts a reviewed unreadable row back to pending keeping its note` — `reviewedAt: null`, nota intacta. Cubre: R2.
  - `stores only the note of an unreadable row without touching its status` — en una fila `pending` y en una `reviewed` (cuyo `reviewedAt` no cambia); `note: null` la borra. Cubre: R3.
  - `answers 404 NOT_FOUND when the id is of no stored unreadable row`. Cubre: R4.
  - `answers 400 VALIDATION_ERROR to a bad body or id of the unreadable-row route, changing nothing` — los cinco casos de R5, comprobando tras cada uno que la fila no cambió. Cubre: R5.
  - `lists a reviewed unreadable row as reviewed, with its note and when it was reviewed` — dos filas, una revisada; `GET` devuelve las dos, la revisada con `status`, `note` y `reviewedAt`, la otra con `pending`, `null`, `null`. Cubre: R6.
  - `counts only the unreadable rows still pending` — con una revisada y una sin revisar, `counts.unparsedRows` es `1` y la lista tiene 2. Cubre: R7.
- [x] T7 — Tests existentes de la feature 48: en `import.warnings.docs.test.ts` la lista `unparsedRowFields` pasa a los ocho campos de la fila serializada. Fuera de eso, **ningún** test existente de `import.warnings.*.test.ts`, `import.service.test.ts` ni `import.routes.test.ts` cambia lo que afirma; si alguno hay que tocarlo, se para y se dice cuál y por qué en el informe. Cubre: R11, R12.
- [x] T8 — `docs/api-contract.md` según `design.md` §4. Cubre: R13.
- [x] T9 — `docs/data-model.md` según `design.md` §4, comprobado contra `prisma/schema.prisma` (lección 2 de `docs/lessons.md`). Cubre: R14.
- [x] T10 — `docs/architecture.md` (línea «Revisado el 2026-10-02 por la feature 54…» encima del ADR-031, sin reescribirlo), `docs/roadmap.md` (fila 23 tachada y cerrada por la F54, diciendo que crear el movimiento a mano quedó descartado por el humano; fila E5 con la F54) y `docs/conventions.md` (`ImportUnparsedRow.note` en la lista de textos comparados). Cubre: R15.
- [x] T11 — `import.warnings.docs.test.ts`, tests nuevos que leen los documentos:
  - `api-contract: names the route that reviews an unreadable row and its fields` — la sección contiene `PATCH /api/import/warnings/unparsed-rows/:id`, nombra `` `reviewedAt` ``, y ya no contiene «no tienen estado». Cubre: R13.
  - `data-model: describes ImportUnparsedRow with its review columns` — `docs/data-model.md` contiene `model ImportUnparsedRow`, y dentro de ese bloque `status`, `note` y `reviewedAt`, y nombra `ImportUnparsedRow_identity_key` o su `@@unique`. Cubre: R14.
  - `roadmap: closes loose end 23 with feature 54 and says creating the movement by hand was discarded` — la fila 23 está tachada, nombra la F54 y contiene «descartado». Cubre: R15.
- [x] T12 — `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `./init.sh` y `./init.sh --checks 54` en verde, con la salida pegada en el informe y el recuento de archivos de test y de tests (partida: 70 y 1286). Cubre: R11, R12.
