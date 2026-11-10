# Review — F70 `product-file-same-opening`

## Review (2026-11-09)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos
1. `feature_list.json:3536`, `:3538`, `:3540`, `:3541`, `:3565`, `:3569`, `:3573`, `:3577`: hay un nombre real de un producto del humano en un archivo que va a git (8 líneas: `_procedencia`, `por_que`, dos frases de `como_se_que_esta_bien` y cuatro `descripcion` de `checks`), y también su nombre anterior. Lo he comprobado en la base `gastos` con una consulta de solo lectura (`BEGIN READ ONLY; SELECT count(*) FROM "InvestmentProduct" WHERE name IN ('<el nombre de feature_list.json:3541>'); ROLLBACK;` → `1`). Va contra `docs/conventions.md` §Tests («Ningún dato real en un fixture… incluso los que él mismo pegue en una conversación»; el alcance es todo archivo versionado). `src/no-real-data.test.ts` no lo detecta porque son dos palabras, por debajo de las tres a partir de las que compara frases. En `HEAD` no está: entra con esta feature. Qué hacer: cambiar esos nombres por una descripción («la cartera gestionada con su nombre actual» / «el nombre anterior») o por nombres inventados en las 8 líneas. El `spec-author` ya lo evitó en `decisions.md` («el duplicado del 2026-11-09»). Son frases que aprobó el humano, así que el leader le confirma el texto nuevo antes de cambiarlas. Ningún comando de `checks` cambia.
2. `feature_list.json:3558` (`acceptance`) y `:3597` (`descripcion` de un check): siguen diciendo «opción (a), a confirmar en la puerta». El humano lo confirmó el 2026-11-09 (`decisions.md`, «Aprobado por el humano»). Hay que quitar el «a confirmar». Se corrige en la misma edición que el punto 1.

### Comprobado sin hallazgos
- Alcance: el diff (`git diff --stat`, 15 archivos, más `specs/70-…/` y el informe sin seguimiento en git) no sale de la línea `Archivos:` del Lote A, más `tasks.md`, `progress/current.md`, `feature_list.json` y `docs/vocabulary.md`. Los escritores (`persistProductSnapshot`, `persistSavingsSnapshot`, `persistValuation`, `persistDeposit`, `upsertProduct`) y los parsers no se tocan. No hay migración ni ruta nueva.
- Requirements ↔ tests: R1–R13 tienen cada uno al menos un test concreto (la tabla de trazabilidad del informe cuadra con el código leído). Los tests de rechazo comprueban el código, el texto del mensaje, el producto y sus filas idénticos (`toEqual` antes/después, `lastImportedAt` incluido) y `movedToProcessed: false`, con llamadas a `update` de Drive. Usan la base desechable, bancos `zz-product-…` y nombres generados.
- Arquitectura y convenciones: la consulta vive en `investments.service.ts`, el único archivo que puede leer la tabla de productos según `src/architecture.test.ts`. Usa solo `findUnique` / `findMany`. La comprobación va después de la de la F53 y antes de escribir, con el banco de la carpeta. La clase de error sigue el patrón de `app-error.ts`.
- SDD: `decisions.md` cabe en una página y tiene los bloques; quedan 4 puntos por confirmar, ya aprobados. Hay 13 requirements (≤ 15) y la procedencia está completa. `tasks.md` tiene T1–T11 en `[x]`. Los `checks` coinciden con la tabla 🧪 de `decisions.md`.
- Documentos: `docs/api-contract.md` (párrafo, aviso del `name`, totales y fila de la tabla de códigos), los dos documentos de archivos de producto, `docs/data-model.md`, ADR-045 y la línea de revisión encima del ADR-012, y la fila E5 del roadmap. `git grep` de `SAME_OPENING_PRODUCT` / `DUPLICATE_PRODUCT_FILE` / `findSameOpeningProducts` fuera de `progress/` y `specs/`: ninguna línea describe lo de antes.
- Vocabulario: `SAME_OPENING_PRODUCT` / `SameOpeningProductError` está en `docs/vocabulary.md` con la fecha de aprobación. «guardián» está aprobado allí.
- `docs/lessons.md`: ninguna lección activa se repite (no hay columna nueva, así que la 2 no aplica; los tests no llevan fixtures `.xls` ni `.pdf`).
- Verificación, lanzada por mí:
  - `./init.sh` → exit 0; `Test Files  99 passed (99)`, `Tests  1568 passed (1568)`, `[OK] Entorno listo.`
  - `./init.sh --checks` → exit 0; **`Checks: 13 de 13 en verde.`** Cada uno de los 12 checks filtrados por nombre muestra `Tests  1 passed | N skipped`; ninguno salió en verde sin ejecutar nada.
- CHECKPOINTS C1–C5, C4 bis (el implementer hizo una consulta de solo lectura sobre la base real; la prueba con el archivo real le toca al humano) y C7. C8 queda pendiente del veredicto.

## Review 2 (2026-11-10)

**Veredicto:** APPROVED
Comprobado: requirements ↔ tests, arquitectura, convenciones, verificación y CHECKPOINTS C1-C8, con los dos cambios de la Review 1 corregidos. En `feature_list.json` ya no aparecen los nombres reales ni «a confirmar en la puerta». Recorrí los 11 nombres de `InvestmentProduct` de la base (consulta `READ ONLY`, sin imprimirlos) contra `git diff` y los archivos nuevos todavía fuera de git, y no aparece ninguno. `./init.sh` → exit 0, `Tests  1568 passed (1568)`. Checks: `./init.sh --checks` → exit 0, **13 de 13 en verde**; cada uno de los 12 que filtran por nombre ejecutó `1 passed`.
Sin hallazgos.
Resumen de cierre: `progress/summaries/product-file-same-opening.md`.
