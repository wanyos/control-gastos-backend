# Revisión — F68 `movements-hide-not-counted`

## Review (2026-11-06)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `README.md:81` — la fila de `GET /api/movements` enumera todos los filtros
   («Filtra por cuenta, fechas, …, `excluded` y … `ownership=doubtful`, feature 62»)
   y sigue sin `hideNotCounted`: describe el listado de antes de la F68. La F62
   añadió su filtro a esta misma fila (commit `f905fdb`), y la F57 tuvo que ampliar
   su lote a esta línea por lo mismo. Añadir `hideNotCounted` (feature 68). El
   implementer lo vio y no lo tocó porque `README.md` no está en `Archivos:` del
   Lote A (`progress/implementations/movements-hide-not-counted.md`, «Documentos
   actualizados» punto 1): el leader tiene que ampliar el lote a esa línea.
   `README.md` está fuera del carril rápido.
2. `progress/current.md:29` — dice «**Ninguna feature en curso.**» con la F68 en
   `in_progress` en `feature_list.json` (CHECKPOINTS C2: describe la sesión
   activa). Le toca al leader.

### Comprobado sin hallazgos

- **`./init.sh`**: `./init.sh > <scratchpad>/init.txt 2>&1` → `exit=0`; tsc, lint y
  format en `[OK]`; `Test Files 95 passed (95)`, `Tests 1535 passed (1535)`.
- **`./init.sh --checks 68`**: `exit=0`, **Checks: 9 de 9 en verde**. Los checks 1-7
  imprimen `Tests 1 passed | 12 skipped (13)`, el 8 `Tests 1 passed (1)`: todos
  ejecutaron su test. Los 9 checks coinciden uno a uno con la tabla 🧪 de
  `decisions.md`, sin aflojar ninguno.
- **Trazabilidad R1-R13 ↔ tests**: los 13 tienen test en
  `movements.hide-not-counted.test.ts` (R1-R11) y `.docs.test.ts` (R13); R12 por la
  suite entera, con `movements.test.ts`, `movements.exclusion.test.ts`,
  `movements.deposits.test.ts` y `src/modules/own-accounts` sin cambios
  (`git diff --stat HEAD` sobre ellos: vacío). Los tests comparan ids, `pagination`
  y `totals` exactos, comprueban antes sin el parámetro que cada fila escondida es de
  depósito y suma `0.00`, y cubren el 400. Base de tests por `app.inject`, sin
  mocks, datos inventados.
- **Totales y filtros sin el parámetro**: `hideNotCounted=false` da la respuesta
  entera igual que sin él (R9); la condición va en `where.AND`, así no pisa `id`,
  `transferId` ni `excludedFromTotals` (`movements.service.ts:213-226`);
  `computeTotals` no cambia.
- **Contrato** (`docs/api-contract.md`): párrafo «Desde la feature 68», fila del
  parámetro, nota de `totals`, `#### Esconder lo que no cuenta` (qué sale, qué no,
  combinación) y cómo contar lo escondido (misma petición sin el parámetro,
  `pageSize=1`, restar los dos `pagination.total`), y la fila 400. Basta para que
  el frontend construya contra él. No es un cambio que rompa nada.
- **Lote**: `git status` solo muestra, del implementer, los 6 archivos de
  `Archivos:` más `tasks.md` y su informe; lo demás es del leader.
- **Spec**: `decisions.md` de 60 líneas, 5 puntos aprobados con alternativa; 13
  requirements con procedencia clasificada; T1-T6 en `[x]`.
- Arquitectura, convenciones, `docs/lessons.md` (lección 2 y 3 no aplican: sin
  columna nueva ni fixtures `.xls`/`.pdf`), vocabulario (`hideNotCounted` en
  `docs/vocabulary.md:46`), sin `console.` ni `TODO`, sin `dist/` (no hice build).
  CHECKPOINTS C1, C3, C4, C4 bis (no lee datos de fuera), C6, C7.

## Review 2 (2026-11-06)

**Veredicto:** APPROVED
Comprobado: los dos cambios de la review 1, acceptance/requirements ↔ tests,
arquitectura, convenciones, verificación, CHECKPOINTS C1-C8. Checks: 9 de 9 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/movements-hide-not-counted.md`.

Con qué se comprobó:

- **Cambio 1** (`README.md:81`): `git diff README.md` → un solo hunk, la fila de
  `GET /api/movements`, con la frase de `hideNotCounted` (feature 68) añadida tras
  `ownership=doubtful`; nada más cambiado en el archivo. Coincide con
  `docs/api-contract.md:1177` y `docs/vocabulary.md:46`. Lote ampliado en
  `specs/68-movements-hide-not-counted/tasks.md` (cabecera `Archivos:` del Lote A).
- **Cambio 2** (`progress/current.md:29`): `git diff progress/current.md` → describe
  la F68 en curso, con enlaces a decisions, informe, review y encargo del frontend.
- **`./init.sh > <scratchpad>/init3.txt 2>&1`** → `exit=0`; `Test Files 95 passed (95)`,
  `Tests 1535 passed (1535)`. (Un primer intento, `init2.txt`, salió `exit=1` porque
  el bloqueo de la suite de tests (ADR-027) estaba tomado por otra ejecución ajena a
  esta revisión; relanzado sin cambiar nada, verde.)
- **`./init.sh --checks 68 > <scratchpad>/checks2.txt 2>&1`** → `exit=0`,
  `Checks: 9 de 9 en verde.`; los checks 1-7 imprimen `Tests 1 passed | 12 skipped (13)`
  y el 8 `Tests 1 passed (1)`: todos ejecutaron su test.
- `git status --short`: mismos archivos que en la review 1; no entró nada nuevo.
