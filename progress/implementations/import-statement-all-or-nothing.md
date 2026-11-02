# import-statement-all-or-nothing — implementación

F66, SDD, lote A (único). Implementer, 2026-11-02. Sin commit; la feature sigue
`in_progress` a la espera del reviewer.

No se ha escrito nada en la base del humano ni en sus carpetas: todo lo ejecutado
fue la suite (bases `gastos_test_<n>`) y `./init.sh`.

## Lote A — implementación

## Archivos modificados / creados

Todos dentro de la cabecera `Archivos:` del lote A, más `progress/current.md`
(plan, paso 3 del protocolo), `specs/66-…/tasks.md` (marcas `[x]`) y este informe.

- `src/lib/prisma.ts` — exporta `TransactionClient` (T1).
- `src/modules/accounts/accounts.service.ts` — `findOrCreateAccountFromMetadata`
  recibe `TransactionClient`; cuerpo igual (T2).
- `src/modules/import/import.balance.service.ts` — `StatementBalanceCheckDeps.prisma:
  TransactionClient`; ya no importa `AppPrismaClient` (no lo usaba en nada más) (T2).
- `src/modules/import/import.warnings.service.ts` — `persistImportWarnings` recibe
  `TransactionClient`, hace los `upsert` uno detrás de otro (`for` + `await`) sin
  `prisma.$transaction`, mismos `where` / `create` / `update`; JSDoc corregido (T3).
- `src/modules/import/import.service.ts` — `resolveAccount`, `persistMovements`,
  `backfillMissingBalances`, `anchorAccountIfMissing`, `readAccountAnchor` y
  `readStoredAnchor` con `TransactionClient` (T2); `importStatement` abre
  `deps.prisma.$transaction(async (tx) => …, { timeout: STATEMENT_TRANSACTION_TIMEOUT_MS })`
  con los pasos de `resolveAccount` a `persistImportWarnings` en el mismo orden y
  con sus comentarios (incluido el 🔴 de leer el ancla antes de anclar); parseo y
  `assertTheFileBringsMovements` fuera (T4); constante a `60_000` con su porqué;
  `failedStatementResult(result, error)` en el `catch` (T5).
- `src/modules/import/import.service.test.ts` — ayudantes `insideStatementTransaction`
  y `txWhere`; `recordingPrisma` y `prismaThatCannotStoreWarnings` pasan a actuar
  sobre el `tx` (T6); `describe('importStatement is all or nothing per file (feature 66)')`
  con los 10 tests de design §5.3 (T7-T10).
- `docs/api-contract.md`, `docs/architecture.md`, `docs/roadmap.md` (T12).

## Decisiones tomadas

Ninguna fuera del spec. Detalles de cómo, dentro de lo que dice el design:

- **`txWhere(tx, model, method, message)`**: ayudante de test que devuelve el `tx`
  con un solo método roto. Lo usan `prismaThatCannotStoreWarnings` y los tests F66;
  sustituye el `Proxy` a mano que tenía `prismaThatCannotStoreWarnings`.
- **`onTransaction(n, breakIt)`** (dentro del `describe` de la F66): rompe solo la
  transacción número `n` de la llamada. Hace falta en R1, R2 y R8, que usan
  `importPending`, porque después del bucle de archivos `detectTransfers` y otros
  pasos también abren `$transaction` y pasan por el mismo `Proxy`; sin el contador,
  romper `movement.findMany` habría roto también esos pasos. En R8 el segundo
  extracto es la segunda transacción de la llamada.
- **R7**: el extracto del test trae además `accountBalance`, para que
  `anchored: false` no sea trivial (sin fallo, ese archivo anclaría).
- **R11**: además de lo que pide el design, el test comprueba `file.imported === 1`
  (el informe conserva lo guardado cuando solo falla mover), que es lo que ahora dice
  el contrato.
- **Las aserciones existentes no cambian**: `git diff -U0` del archivo de tests no
  tiene ninguna línea `-` con `expect(` (resultado del recuento: `0`). Lo que se
  quitó son los cuerpos de los dos `Proxy` y la línea del `import type`.

Comprobado que los tests nuevos miden algo: con `import.service.ts` e
`import.warnings.service.ts` devueltos a la versión de `HEAD` (y restaurados
después), `vitest run … -t "F66"` dio **8 fallados, 2 pasados**: R1, R2, R3, R4,
R5, R7, R8 y R12 en rojo; R10 y R11 en verde, que es lo esperado (son de «sigue
igual que antes»).

## Trazabilidad (solo SDD)

- R1 → `F66 R1 rolls back every movement of a file whose preamble check throws`
- R2 → `F66 R2 rolls back every movement of a file whose warnings cannot be stored`
- R3 → `F66 R3 removes the account a failed file had just created`
- R4 → `F66 R4 leaves unanchored the account a failed file had anchored`
- R5 → `F66 R5 leaves empty the balances a failed file had filled`
- R6 → `F66 R2 …` (comprueba 0 filas en `ImportUnparsedRow` y `ImportBalanceMismatch` de ese `bank`)
- R7 → `F66 R7 reports a failed file with no account and zero counters`
- R8 → `F66 R8 keeps the files of the same run that were imported`
- R9 → suite existente de `src/modules/import/` y `src/modules/accounts/` sin cambiar
  aserciones (208 tests en verde antes de añadir los F66; incluye
  `hands the preamble check the anchor from BEFORE this file anchored the account (R4)`
  y `reports the file as failed and does not move it when storing its warnings fails (R5)`,
  que fallaban tras el cambio de código y pasan con los ayudantes adaptados)
- R10 → `F66 R10 still imports a file whose preamble does not match`
- R11 → `F66 R11 keeps what a statement stored when only its move to procesados fails`
- R12 → `F66 R12 opens the transaction of a statement with a 60 second timeout`

## Documentos actualizados

- `docs/api-contract.md` (`POST /api/import`): fila `failed` de la tabla de estados
  («no deja nada guardado de ese archivo», salvo el fallo al mover); el punto «En un
  archivo `failed` no se ancla ni se rellena nada» reescrito (no quedan movimientos,
  cuenta creada, ancla ni avisos; informe con `account: null` y contadores a cero;
  solo se deshace ese archivo) y un punto nuevo con la excepción de mover a
  `procesados/`; en §Lo que una importación deja sin resolver, «… sale `failed`,
  **no** se mueve a `procesados/` y no queda nada de él (feature 66)». No se tocaron
  las frases que lee `import.warnings.docs.test.ts` (pasa en la suite).
- `docs/architecture.md`: ADR-042 nuevo (antes de §Qué NO hacer) y nota de revisión
  en el punto 5 del ADR-031.
- `docs/roadmap.md`: cabo 26 tachado y cerrado por la F66; F66 en la fila E5; deber
  nuevo en §Deberes tuyos pendientes con la prueba real (copia antes con
  `pnpm run db:backup`).

Búsqueda de lo que el cambio vuelve falso:

```
git grep -n -i "persistImportWarnings\|single transaction\|opens no transaction\|no abre transacción\|AppPrismaClient\['\$transaction'\]" -- ':!progress' ':!specs'
git grep -n -i "deja la cuenta\|no se ancla ni se rellena" -- ':!progress' ':!specs'
grep -n -i "transaction\|transacci" src/modules/import/import.warnings.*.ts src/modules/import/import.routes*.ts README.md docs/data-model.md
```

Lo que salió y ya no era verdad estaba en archivos del lote y está corregido (JSDoc de
`persistImportWarnings`, ADR-031 punto 5, contrato). El resto de resultados son
verdad tal cual: las llamadas de test a `persistImportWarnings(app.prisma, …)`
(el cliente global es un `TransactionClient`), el alias local de
`investments.service.ts:250` (fuera de alcance por el spec) y las transacciones de
traspasos y productos en `docs/data-model.md`. Ninguna línea falsa fuera del lote.

## Prueba real (si la feature lee datos de fuera)

**No hecha.** La feature cambia cómo se guardan los extractos que llegan de Drive,
pero la prueba con un dato real escribe en la base del humano (importar un extracto
y reimportar el más largo), y este rol no puede escribir en ella. Queda como deber
del humano, tal como decidió la hoja (📌), apuntado en `docs/roadmap.md`
§Deberes tuyos pendientes. Lo que no está medido: si el extracto más largo cabe en
los 60 s.

## Último ./init.sh

Código de salida `0`. Final de la salida (sin colores):

```
── 4. Type checking (tsc) ──────────────────────────────
[INFO]  Ejecutando: npx tsc --noEmit --incremental
[OK]    Type check OK (tsc sin errores)

── 5. Lint y formato ───────────────────────────────────
[INFO]  Ejecutando: pnpm run lint
$ oxlint
[OK]    OK: pnpm run lint
[INFO]  Ejecutando: pnpm run format:check
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
[OK]    OK: pnpm run format:check

── 6. Ejecutando tests ─────────────────────────────────
[INFO]  Ejecutando: pnpm test
$ vitest run

 RUN  v5.0.5 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

 Test Files  91 passed (91)
      Tests  1501 passed (1501)
   Start at  19:39:53
   Duration  21.43s (tests 54%, import 38%, setup 6%, transform 2%)

[OK]    Todos los tests pasan

── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

`src/no-real-data.test.ts` no dio timeout en esta pasada: los 91 archivos pasaron.

## Último ./init.sh --checks (si la feature tiene checks)

Código de salida `0`:

```
[INFO]  Feature: F66 import-statement-all-or-nothing
[INFO]  [1] Si falla la comprobación de saldo, el archivo sale failed, no se mueve a procesados/ y no queda ningún movimiento suyo.
[OK]        exit 0
                Tests  1 passed | 180 skipped (181)
[INFO]  [2] Si falla el guardado de avisos, igual.
[OK]        exit 0
                Tests  1 passed | 180 skipped (181)
[INFO]  [3] Si la cuenta se creó con ese archivo, tampoco queda.
[OK]        exit 0
                Tests  1 passed | 180 skipped (181)
[INFO]  [4] (añadido) Si el saldo de partida se fijó con ese archivo, tampoco queda.
[OK]        exit 0
                Tests  1 passed | 180 skipped (181)
[INFO]  [5] (añadido) En una importación con varios archivos, el fallo de uno no deshace los que salieron bien.
[OK]        exit 0
                Tests  1 passed | 180 skipped (181)
[INFO]  [6] Un archivo que se importa bien sigue guardando lo mismo que hoy.
[OK]        exit 0
[INFO]  [7] La suite pasa.
[OK]        exit 0
[OK]    Checks: 7 de 7 en verde.
```

T11: `git diff --stat -- prisma src/modules/investments` vacío, y el diff de
`import.service.ts` no toca `importProductFile`.

## Sugerencias fuera de scope (NO aplicadas)

- `src/modules/investments/investments.service.ts:250` sigue con su alias local
  `TransactionClient`, igual al que ahora exporta `src/lib/prisma.ts`. Se podría
  importar de ahí en una feature que toque ese módulo.
