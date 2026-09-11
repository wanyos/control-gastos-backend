# Review — feature 45 `import-run-totals`

> Reviewer, 2026-09-11. Feature sin SDD: se juzga contra el `intent` y el
> `acceptance` de `feature_list.json`, `docs/conventions.md`,
> `docs/verification.md`, `docs/api-contract.md` y `CHECKPOINTS.md`.
> Informe del implementer: [`implementations/import-run-totals.md`](../implementations/import-run-totals.md).

**Veredicto:** APROBADO

Comprobado: acceptance ↔ tests (Drive y local), capa HTTP, contadores existentes
intactos, cambio de fixture, contrato, roadmap, vocabulario, CHECKPOINTS C1-C6 y
C8. Sin hallazgos que bloqueen.
Resumen de cierre: [`summaries/import-run-totals.md`](../summaries/import-run-totals.md).

## Comandos ejecutados y salida

1. **`./init.sh` completo** (docker en marcha, postgres en `localhost:5434`):
   pasos 1-5 en verde (node v24.18.0; `feature_list.json` válido, 45 features;
   `tsc --noEmit` sin errores; `oxlint` OK; `prettier --check` «All matched files
   use Prettier code style!»). Paso 6: `Test Files 60 passed (60)`,
   `Tests 1176 passed (1176)`, 10.84 s. Paso 7: «Entorno listo». **Exit 0.**
   Incluye los cambios ajenos de `src/architecture.test.ts` y
   `src/modules/bankinter/bankinter.routes.test.ts` (cabos 15 y 19): no rompen
   nada.
2. **Tests de la feature, aislados** (`npx vitest run import.service.test.ts
   import.local.service.test.ts no-real-data.test.ts -t "feature 45|totals|R15|R11|R5|no pending file"
   --reporter=verbose`): 18 tests, **18 en verde**. Entre ellos los ocho de la
   F45 en Drive (`totals` unitario ×2, producto guardado/fallido, producto
   reescrito, anclaje y relleno en dos cuentas, `failed` no ancla) y los cinco
   ampliados en local (R15, R5/R15, R11, R11/R7, R8/R11).
3. **Capa HTTP, comprobada y no deducida.** `import.schema.ts` declara a propósito
   que ninguna de las dos rutas lleva `response schema`, pero lo verifiqué con un
   test desechable (`src/modules/import/review-tmp-f45.test.ts`, creado, ejecutado
   y **borrado** en el mismo comando; `git status` limpio después): `POST
   /api/import/local` con un extracto que trae saldo devolvió en la raíz
   `importedCount,duplicateCount,unparsedCount,failedCount,skippedCount,
   balanceMismatchCount,importedProductCount,anchoredCount,balanceFilledCount,
   files,transfers,categorization`, con `anchoredCount: 1`,
   `importedProductCount: 0`, `balanceFilledCount: 0`. 1 test, verde.
4. `git diff` de `src/modules/import/{import.types,import.service}.ts` y de los
   dos archivos de test; `git diff` de `docs/api-contract.md`, `docs/roadmap.md`,
   `feature_list.json`, `progress/current.md`.
5. `grep -n "No hay total de run\|no suma\|importedProductCount\|anchoredCount\|balanceFilledCount" docs/api-contract.md`;
   `git show HEAD:docs/api-contract.md | grep -c "pasada"` (17) y `"foto"` (38).
6. `grep -rn "console.log\|TODO"` sobre los dos archivos de código tocados: nada.

## Los siete puntos pedidos por el leader

1. **`./init.sh`**: verde, exit 0 (arriba, punto 1).
2. **Agregación en los DOS caminos y `failed` no suma.** Los dos caminos pasan
   por la misma `totals()` ([`import.service.ts:801`](../../src/modules/import/import.service.ts#L801));
   el local la extiende en [`import.local.service.ts:131`](../../src/modules/import/import.local.service.ts#L131)
   sin cambios. Drive: [`import.service.test.ts:1003`](../../src/modules/import/import.service.test.ts#L1003)
   (unitario: 3 extractos + 2 productos + 1 skipped → `2/2/5`, con `toEqual` de
   las nueve claves), `:1200` (producto bueno + producto fallido → `1`, `failedCount 1`,
   `importedCount 0`), `:1631` (dos cuentas: primera pasada `anchoredCount 2`,
   segunda `0` y `balanceFilledCount 2`, igual a los `balancesFilled: 1` de cada
   informe). `failed`: `:1026` (unitario, extracto y producto fallidos → `0/0/0`)
   y `:1676` (por Drive, parser que lanza → `failedCount 1`, `anchoredCount 0`,
   `balanceFilledCount 0`). Local: [`import.local.service.test.ts:512`](../../src/modules/import/import.local.service.test.ts#L512)
   (`anchoredCount 1`, `balanceFilledCount 1` junto al informe por archivo
   `anchored: true, balancesFilled: 1`), `:546` (`0/0`), `:749`
   (`importedProductCount 1, importedCount 0`), `:793` (`2` con el segundo mes
   `created: false`), `:815` (fallido → `0`, `failedCount 1`). Ejecutados: verdes.
3. **Ningún contador existente cambia.** El `git diff` de los dos archivos de
   test **no tiene ni una línea borrada**: solo añadidos; el único test existente
   modificado es el `toEqual` del run vacío (`:737-741`), que gana las tres claves
   a cero. En `totals()` las seis líneas anteriores están intactas. Los tests de
   rutas siguen en verde con sus `toMatchObject` sobre los seis viejos.
4. **El «importe de fixture corregido».** Es el saldo por línea `87.31` de
   [`import.service.test.ts:1656`](../../src/modules/import/import.service.test.ts#L1656),
   dentro de un test **nuevo** de esta feature (todo el bloque `:1631-1673` es
   `+` en el diff): no había fixture previo en `HEAD` que se haya alterado. El
   guardián `src/no-real-data.test.ts` y `vitest.global-setup.ts` están sin
   tocar (`git status` no los lista) y el guardián pasa en la suite completa. La
   cifra no interviene en ninguna aserción (se comprueba `balancesFilled: 1`, no
   el valor). Es exactamente el caso «si salta con razón: inventa otro valor» de
   `docs/conventions.md` §Tests. **Legítimo, no esconde nada.**
5. **`docs/api-contract.md`.** La frase «No hay total de run para `anchored` ni
   para `balancesFilled`» **ya no existe** (grep vacío); en su lugar, la
   descripción de los tres contadores en `:1522-1532`. La nota «un archivo de
   producto no suma a `importedCount`» sigue (es verdad) pero ahora dice que suma
   a `importedProductCount` (`:1514-1518`). Los dos ejemplos llevan los campos:
   `POST /api/import` en `:1397-1399` (`1/1/0`, coherente con su archivo de
   producto y su extracto anclado) y `POST /api/import/local` en `:1728-1730`
   (`0/0/12`, coherente con `balancesFilled: 12` y la cuenta ya anclada, dicho en
   `:1787-1788`). Cambio aditivo: no hay breaking change que anotar.
6. **`docs/roadmap.md`.** Filas 13 (`:368`) y 17 (`:376`) tachadas y
   «✅ cerrado por la F45 (2026-09-11)», con la misma forma que las demás
   cerradas de la tabla.
7. **Vocabulario.** Los tres nombres se componen del sufijo `Count` y de
   palabras ya presentes en el contrato (`imported`, `product`, `anchored`,
   `balancesFilled` → singular como `balanceMismatchCount`). En la prosa nueva
   del contrato solo aparecen «pasada» y «foto», que ya estaban en `HEAD` (17 y
   38 usos). Ningún término nuevo en docs, tipos ni tests.

## CHECKPOINTS

- C1 ✅ archivos base y docs presentes; `./init.sh` exit 0.
- C2 ✅ una sola `in_progress` (F45); `progress/current.md` describe la sesión.
- C3 ✅ sin archivos nuevos ni dependencias; sin `console.log`/TODO; convenciones
  (inglés, comentarios con la feature que los motiva, `import type`) respetadas.
- C4 ✅ camino feliz y de error (`failed`) en unitario, por Drive y por local,
  contra la base desechable del worker; C4 bis no aplica (no toca ningún parser).
- C5 ✅ untracked solo `progress/implementations/{import-run-totals,cabos-15-19}.md`;
  `history.md` se rellena al cerrar (una línea con enlace al resumen).
- C6 ✅ contrato actualizado en la misma feature, cambio aditivo; `related-projects.md`
  no necesita cambios.
- C7 — no aplica (sin SDD).
- C8 ✅ [`summaries/import-run-totals.md`](../summaries/import-run-totals.md) escrito.

## Observaciones (no bloquean)

- `feature_list.json` en el árbol de trabajo lleva también F43
  `pending → done` (`:1816`). Es un resto del cierre de la F43 (commit `96f450a`
  dejó `HEAD` con la 43 en `pending`), no obra de esta feature; que vaya en el
  commit que toque.
- La sugerencia del implementer de añadir los tres campos a los `toMatchObject`
  de `import.routes.test.ts:133` e `import.local.routes.test.ts:124` es razonable
  y barata; no la exijo porque la capa HTTP queda comprobada arriba (punto 3) y
  el contrato ya dice que ninguna ruta lleva `response schema`.
