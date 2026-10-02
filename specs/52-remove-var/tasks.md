# Tasks — F52 `remove-var`

> Dos lotes **en secuencia**. El código es un solo lote porque `src/app.ts` y
> `src/architecture.test.ts` los tocan todas sus partes. Los documentos van
> después porque describen el comando nuevo y las rutas ya quitadas, y porque la
> verificación final necesita los dos.
>
> ❌ **Ningún agente borra, mueve ni abre la carpeta `var/` del disco.** La borra
> el humano al cerrar.

## Lote A — código, tests y `.gitignore`
Archivos: `src/app.ts`, `src/architecture.test.ts`, `src/no-real-data.test.ts`, `src/errors/app-error.ts`, `src/lib/test-var.ts`, `src/lib/test-var.test.ts`, `src/lib/test-guard.ts`, `src/lib/test-guard.test.ts`, `src/lib/test-guard.e2e.test.ts`, `src/lib/drive.fixture.ts`, `src/modules/import/**` (todos sus archivos, incluidos los nuevos `import.parse-file.ts` e `import.parse-file.test.ts`), `src/modules/ingestion/**`, `src/modules/bankinter/**`, `src/modules/myinvestor/**`, `src/modules/n26/**`, `src/modules/openbank/**`, `src/modules/revolut/**`, `src/modules/trade-republic/**`, `src/modules/category-rules/category-rules.seed.ts`, `vitest.global-setup.ts`, `scripts/parse-bank-file.ts`, `package.json`, `.gitignore`
Depende de: —

- [x] T1 — `src/lib/drive.fixture.ts`: `driveWithPendingFiles` (`design.md` §3.6). Cubre: R1.
- [x] T2 — Antes de borrar nada: reescribir sobre `importPending` los tests de `design.md` §3.6 (`revolut.import.test.ts`, `myinvestor.import.test.ts`, los dos de categorización a `import.service.test.ts`, los dos de traspasos a `import.routes.test.ts`), sin cambiar lo que afirman. Repasar test a test `import.local.service.test.ts` e `import.local.routes.test.ts`: el que no tenga gemelo en el camino de Drive se lleva también; decir en el informe cuáles se llevaron y cuáles se borraron por duplicados. Cubre: R1.
- [x] T3 — `src/modules/import/`: quitar `POST /local`, `rawCopyBaseDir`, la escritura de la copia, los tipos `Local*`, `import.schema.ts`, `import.local.service.ts` y sus dos tests; quitar `LocalCopyNotFoundError` de `src/errors/app-error.ts`; quitar de los tests el directorio temporal `rawCopyBaseDir` y el test `writes the raw copy of the downloaded file before parsing it` (`design.md` §3.2). Cubre: R1, R2, R3.
- [x] T4 — `src/modules/ingestion/`: quitar `POST /process`, `processPending`, sus tipos y sus tests; `GET /pending` y sus tests no cambian (`design.md` §3.3). Cubre: R3, R4.
- [x] T5 — Los seis módulos de banco: borrar `*.routes.ts` y `*.routes.test.ts`; borrar el `*.service.ts` y su test en bankinter, n26, openbank y revolut; reducir `myinvestor.service.ts` y `trade-republic.service.ts` (y sus tests) a la función que usa `src/app.ts`; borrar los tipos que ya no importe nadie, comprobándolo con una búsqueda por nombre; crear `<banco>.registry.test.ts` en n26, openbank, revolut y trade-republic con los tests de la tabla de `design.md` §3.1. Ningún `*.parser.ts` cambia una línea de código. Cubre: R3, R5.
- [x] T6 — `src/app.ts`: quitar los seis imports y los seis registros de `/api/parser` (`design.md` §3.4). Cubre: R3.
- [x] T7 — Quitar la comprobación de la feature 33: borrar `src/lib/test-var.ts` y `src/lib/test-var.test.ts`; `vitest.global-setup.ts` sin la foto de `var/`; cabecera de `src/lib/test-guard.ts`; `src/lib/test-guard.test.ts`; `src/lib/test-guard.e2e.test.ts` con su comparación propia por `statSync` (`design.md` §3.5). Los dos tests de extremo a extremo siguen afirmando código de salida ≠ 0 y = 0. Cubre: R6.
- [x] T8 — `.gitignore`: una sola línea `var/` (`design.md` §3.7). En `src/no-real-data.test.ts`, el test pasa a `has the var folder gitignored whole, and versions nothing under it`. Cubre: R7.
- [x] T9 — Corregir los comentarios que nombran `var/` (`design.md` §6). Solo comentarios. Cubre: R5.
- [x] T10 — `src/architecture.test.ts`: actualizar la lista del árbol y las listas por banco; borrar `keeps the local reimport away from Drive…` y los dos tests de `.gitignore`; añadir los cuatro tests con estos nombres exactos: `answers 404 to the eight routes retired by feature 52`, `keeps the importer off the filesystem`, `mentions the var folder nowhere in the code`, `has none of the files feature 52 removed` (`design.md` §3.5). Cubre: R2, R3, R5, R6.
- [x] T11 — `src/modules/import/import.parse-file.ts` (`summarizeBankFile`, `formatBankFileSummary`, `exitCodeOf`) y exportar `describeError` de `import.service.ts` (`design.md` §4). Cubre: R10, R11, R12.
- [x] T12 — `src/modules/import/import.parse-file.test.ts`, con registros y archivos inventados: `summarizes a statement with counts and shape, and no value of the file` (el texto impreso no contiene ningún importe, IBAN ni concepto del archivo de prueba); `summarizes a product file by its type`; `says there is no parser for the bank`; `says the extension is not read by that bank`; `reports a rejected file by its code only, never its message`; `takes no database nor Drive client, and imports nothing from node:fs`. Cubre: R10, R11, R12.
- [x] T13 — `scripts/parse-bank-file.ts` y la entrada `"parse-file"` de `package.json`. Ejecutarlo a mano con un archivo **inventado** (generado con un `*.fixture.ts` en una carpeta temporal del sistema, que se borra después) y con una ruta que no existe; pegar las dos salidas y sus códigos de salida en el informe. Cubre: R10, R12.
- [x] T14 — `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` y `pnpm test` en verde. En el informe: cuántos archivos de test y cuántos tests quedan (partida: 76 y 1385).

## Lote B — documentos y su test
Archivos: `docs/api-contract.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `docs/dar-de-alta-un-banco.md`, `docs/archivos-por-banco.md`, `docs/data-model.md`, `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md`, `docs/vocabulary.md`, `docs/roadmap.md`, `README.md`, `progress/current.md`, `src/retired-routes.docs.test.ts`
Depende de: Lote A

- [x] T15 — `docs/api-contract.md` según `design.md` §7.1: sección `## Rutas retiradas` antes de `## Errores`, borrado de las ocho subsecciones de ruta, secciones `## Qué lee el parser de <banco>`, menciones sueltas y la fila `LOCAL_COPY_NOT_FOUND`. Cubre: R8, R9.
- [x] T16 — `docs/architecture.md` según `design.md` §7.2: árbol de carpetas, ADR-032 nuevo, ADR-029 `Estado: superada por ADR-032`, y la línea «Revisado el 2026-10-02 por la feature 52 `remove-var`: …» encima de los ADR-009, 010, 014, 015, 016, 017, 020, 024, 025 y 026. Ningún ADR se reescribe. Cubre: R14.
- [x] T17 — Los documentos de la tabla de `design.md` §7.3, salvo los dos de T18. En `docs/trade-republic-product-files.md` no se toca ninguna frase que exija `trade-republic.docs.test.ts`. Cubre: R13.
- [x] T18 — `docs/vocabulary.md` (quitar la mención a la carpeta `var/` en **guardián** y **red**, sin cambiar el significado) y `docs/roadmap.md` (líneas que describen `var/` como algo de hoy; cabos 14 y 16 tachados con «cerrado por la F52»). Solo si el humano aprobó el punto 🔴 4 de `decisions.md`; si lo rechazó, `docs/vocabulary.md` no se toca.
- [x] T19 — `progress/current.md`: nota visible del cambio que rompe el contrato (las ocho rutas, la fecha, y que el frontend no llama a ninguna).
- [x] T20 — `src/retired-routes.docs.test.ts` con los cuatro tests de `design.md` §7.4. Cubre: R8, R9, R13, R14.
- [x] T21 — `./init.sh` en verde y `./init.sh --checks 52`, con la salida pegada en el informe.
