# Tasks — F12 `import`

> Checklist ejecutable. El `implementer` marca `[x]` al completar cada task; el
> `reviewer` rechaza cualquier `[ ]` sin justificación documentada.
> Los `Archivos:` de dos lotes no se solapan. **A y B corren en paralelo**; C espera a A
> (necesita el módulo para registrarlo en `app.ts`) y D espera a todos.

## Lote A — módulo importador

Archivos: `src/modules/import/import.types.ts`, `src/modules/import/import.service.ts`,
`src/modules/import/import.routes.ts`, `src/modules/import/import.service.test.ts`,
`src/modules/import/import.routes.test.ts`
Depende de: —

- [x] T1 — `import.types.ts`: `BankParserAdapter`, `BankParserRegistry`, `AccountReport`,
      `ImportedFileReport` (con `unparsedCount`), `ImportRunResult` (design §4, §9).
      Cubre: R2, R14.
- [x] T2 — `import.service.ts`: `toMovementRows` puro con el mapeo de design §8.
      Cubre: R1, R12, R16.
- [x] T3 — `import.service.ts`: `resolveAccount` (IBAN → `findOrCreateAccountFromMetadata`;
      sin IBAN → única cuenta ya existente del banco; 0 ó >1 → `MissingAccountDataError`
      con el mensaje que pide poner el IBAN una vez). Cubre: R4, R5, R6, R19.
- [x] T4 — `import.service.ts`: `persistMovements` con `createMany({ skipDuplicates: true })`
      y cálculo de `duplicates`. Cubre: R7, R8, R13.
- [x] T5 — `import.service.ts`: `importPending`, recorrido banco/año/fichero con los 8 pasos
      de design §5, copia cruda local, aislamiento de fallos, recuento de líneas no
      interpretables y movimiento a `procesados/` solo tras el guardado.
      Cubre: R9, R10, R11, R14.
- [x] T6 — `import.routes.ts`: `POST /api/import` con `parsers` y `rawCopyBaseDir`
      inyectables. Cubre: R2.
- [x] T7 — `test_maps_parsed_movement_to_movement_row` (abs, `neutral`, `balance: null`,
      `currency ''` → `'EUR'`, enriquecimiento a `null`). Cubre: R1, R12, R16.
- [x] T8 — `test_creates_account_from_iban_and_reports_defaults`. Cubre: R4.
- [x] T9 — `test_resolves_single_existing_account_by_bank_when_no_iban` y
      `test_fails_with_missing_account_data_when_zero_or_many_accounts` (no crea cuenta,
      no mueve el fichero, mensaje que pide el IBAN). Cubre: R5, R6.
- [x] T10 — `test_never_creates_an_account_without_iban` (invariante: tras importar un
      fichero sin IBAN y sin cuenta, el número de `Account` no cambia). Cubre: R19.
- [x] T11 — `test_reimport_creates_no_duplicates_and_reports_them` y
      `test_same_file_twice_leaves_same_state` (determinismo). Cubre: R7, R13.
- [x] T12 — `test_three_identical_lines_same_day_are_three_movements`. Cubre: R8.
- [x] T13 — `test_moves_to_processed_only_after_persisting` y
      `test_failed_file_stays_pending_and_does_not_stop_the_rest`. Cubre: R9, R10.
- [x] T14 — `test_partial_import_saves_good_rows_and_counts_unparsed` (el fichero se mueve
      igual; se comprueba `unparsedCount` por fichero y en el total). Cubre: R2, R11.
- [x] T15 — `test_skips_file_without_parser_or_unsupported_extension` (no importa, no
      mueve). Cubre: R14.
- [x] T16 — `test_post_api_import_returns_report` y
      `test_imported_movements_are_listed_most_recent_first` vía `app.inject()`.
      Cubre: R2, R3.

## Lote B — el IBAN en el extracto de MyInvestor

Archivos: `src/modules/myinvestor/myinvestor.statement.parser.ts`,
`src/modules/myinvestor/myinvestor.statement.parser.test.ts`
Depende de: —

- [x] T17 — `findIbanLine(lines, headerLine)`: busca **solo antes de la cabecera** una línea
      cuya primera celda normalizada sea `iban` y devuelve la segunda con `trim`; `null` si
      no está o está vacía. Cubre: R18.
- [x] T18 — Sustituir `accountIban: null` (línea 89) por la llamada a `findIbanLine`, sin
      tocar la detección de cabecera, el bucle de datos ni la descodificación UTF-8.
      Cubre: R18.
- [x] T19 — `test_reads_iban_from_labelled_preamble_line`,
      `test_tolerates_trailing_semicolons_in_the_iban_line`,
      `test_returns_null_when_the_iban_line_is_absent_or_empty` y
      `test_iban_line_does_not_reach_unparsed_rows`. Cubre: R18.
- [x] T20 — Verificar que el test existente
      `'emits accountIban null without inferring it from an IBAN-shaped concept (R20)'`
      (`myinvestor.statement.parser.test.ts:245`) **sigue en verde sin modificarlo**.
      Cubre: R18.

## Lote C — renombrado a inglés, retoque del flujo F5 y cableado

Archivos: `src/modules/ingestion/*` (renombrado de `src/modules/ingesta/*`), `src/app.ts`,
`src/architecture.test.ts`
Depende de: Lote A

- [x] T21 — `git mv src/modules/ingesta src/modules/ingestion` y renombrar sus cinco
      archivos a `ingestion.*`; renombrar los símbolos exportados (`ingestaRoutes` →
      `ingestionRoutes`, `IngestaRoutesOptions` → `IngestionRoutesOptions`) y la prosa de
      los comentarios. Cubre: R20.
- [x] T22 — Quitar de `processPending` el `ensureFolder(processedFolderName, …)` y el
      `moveFileToProcessed` (y sus imports), conservando descarga, copia local, aislamiento
      de fallos e idempotencia; actualizar los comentarios de servicio y tipos a
      «descargado y copiado». Cubre: R15.
- [x] T23 — `src/app.ts`: registrar `ingestionRoutes` con prefijo `/api/ingestion`,
      construir el registro de parsers (bankinter `.xlsx`, myinvestor `.csv`) y registrar
      `importRoutes` con prefijo `/api/import`. Cubre: R2, R14, R20.
- [x] T24 — `src/architecture.test.ts`: árbol objetivo con `modules/ingestion/*` y
      `modules/import/*`; actualizar el guardián «ingesta libre de acceso a datos» a los
      nombres nuevos; guardián nuevo «ningún archivo de `modules/import/` nombra un banco»;
      guardián nuevo «`modules/import/` no llama a `account.create`». Cubre: R14, R19, R20.
- [x] T25 — `test_process_does_not_move_files_to_processed`,
      `test_process_is_still_idempotent` y ajuste de los tests existentes que esperaban el
      movimiento (en los archivos ya renombrados). Cubre: R15.
- [x] T26 — `test_old_spanish_ingesta_routes_return_404` y
      `test_new_ingestion_routes_answer` vía `app.inject()`. Cubre: R20.

## Lote D — documentación y cierre

Archivos: `docs/api-contract.md`, `docs/architecture.md`, `docs/roadmap.md`,
`docs/conventions.md`, `docs/dar-de-alta-un-banco.md`, `progress/implementations/import.md`
Depende de: Lotes A, B, C

- [x] T27 — `docs/api-contract.md`: sección nueva `POST /api/import` (petición, respuesta
      con `unparsedCount`, estados por fichero, errores); sección de ingesta renombrada a
      `/api/ingestion/*` con **nota de breaking change** (`/api/ingesta/*` → 404); nota de
      que `process` ya no mueve ficheros; `MISSING_ACCOUNT_DATA` deja de estar «reservado»;
      y el modelo del parser anota que `accountIban` de MyInvestor puede venir de la línea
      `iban;…`. Cubre: R2, R6, R11, R15, R18, R20.
- [x] T28 — `docs/architecture.md`: ADR-015 según el borrador de design §13, y nota en
      ADR-009/ADR-014 apuntando al cambio. Cubre: R2, R5, R7, R9, R18, R20.
- [x] T29 — `docs/roadmap.md`: E5 ✅, E2 sin deuda, cabos sueltos **nº 1 y nº 4 tachados**,
      y anotado el límite vivo de `daySequence`. Cubre: R9, R15, R20.
- [x] T30 — `docs/dar-de-alta-un-banco.md` / `docs/conventions.md`: anotar la convención de
      la línea `iban;<IBAN>` en los ficheros que el humano prepara a mano. Cubre: R18.
- [x] T31 — `progress/implementations/import.md` con el mapa `R<n> → test` de las 20
      requirements y `./init.sh` en verde. Cubre: R1-R20.
