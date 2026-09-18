# Prueba real de la F48 `import-warnings-persistence` — 2026-09-18

La lanzó el leader a petición del humano, contra la base real (`gastos`,
`localhost:5434`) y contra su Drive. El humano había vuelto a dejar su archivo de
Revolut de 2025 en la carpeta del banco, un archivo **ya procesado antes**.

## Qué se ejecutó

1. `pnpm exec prisma migrate deploy` → `No pending migrations to apply`: la
   migración `20260918091426_import_warnings` ya estaba aplicada, porque el lote A
   la creó con `migrate dev` contra esa misma base.
2. `pnpm run dev` y `GET /health` → `{"status":"ok"}`.
3. `GET /api/import/warnings` **antes** → las dos listas vacías,
   `counts: { unparsedRows: 0, balanceMismatches: 0 }`.
4. `GET /api/ingestion/pending` → `totalPending: 1`, el archivo de Revolut y nada
   más.
5. `POST /api/import`.
6. `GET /api/import/warnings` **después** → las dos listas vacías otra vez.

## Qué salió

Del run: `importedCount: 0`, `duplicateCount: 35`, `unparsedCount: 0`,
`failedCount: 0`, `skippedCount: 0`, `balanceMismatchCount: 0`,
`importedProductCount: 0`, `anchoredCount: 0`, `balanceFilledCount: 0`.
Del archivo: `status: "imported"`, `movedToProcessed: true`, `imported: 0`,
`duplicates: 35`, sin filas ilegibles y sin descuadres. La detección de traspasos
no creó ninguna pareja y la categorización dejó el mismo choque de reglas de
siempre.

## Qué demuestra y qué NO

✅ **La importación no ha cambiado.** Mismos contadores, el archivo se mueve a
`procesados/` igual, ningún movimiento nuevo (los 35 son duplicados) y una
importación sin nada raro **no deja ningún aviso** (R8, ahora también en real).

❌ **No demuestra que un aviso se guarde y se pueda consultar.** El extracto real
de Revolut no trae ni una fila que el parser no pueda leer ni un descuadre: sus
35 filas se leen todas. Esa mitad sigue cubierta solo por los tests.

⚠️ El leader había dicho antes, en la conversación, que ese archivo traía filas
`DEVUELTO`/`PENDIENTE`. **Era falso**: esas seis filas son del fixture sintético
de `src/modules/revolut/revolut.import.test.ts`, no del archivo del humano. El
leader lo dio por bueno leyendo el informe de un subagente en vez de mirar el
archivo. Corregido aquí para que no se repita.

## Decisión del humano

Probar la otra mitad exigiría estropear a propósito una fila de una copia local y
reimportarla: el aviso resultante **se quedaría en la base y hoy no se puede
borrar por la API** (cabo suelto 23). El humano decidió el 2026-09-18 **no
hacerlo** y esperar a que aparezca un aviso de verdad en una importación futura.
