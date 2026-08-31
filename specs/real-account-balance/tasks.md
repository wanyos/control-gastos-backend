# Tasks — F31 `real-account-balance`

> Cuatro lotes. **A** y **B** no dependen de nada y corren a la vez; **C** y **D**
> arrancan cuando **B** está en verde y también corren a la vez entre sí.
> Ningún archivo aparece en dos lotes.
>
> Cadena más larga: B → D. **ADR-017: ni un importe real en los fixtures nuevos.**

---

## Lote A — Openbank deja de tirar su saldo por línea
Archivos: `src/modules/openbank/openbank.statement.parser.ts`,
`src/modules/openbank/openbank.statement.parser.test.ts`,
`src/modules/openbank/openbank.types.ts`,
`progress/implementations/openbank-statement.md`
Depende de: —

- [x] T1 — En `toMovement`, devolver el importe ya parseado de la quinta columna
  en `balance` en vez de `null`. Cubre: R11.
- [x] T2 — Corregir los textos que afirman lo contrario: el bloque WHAT IS
  DELIBERATELY DROPPED de la cabecera del parser, el comentario de la fila
  (línea 310), `openbank.types.ts:59` y
  `progress/implementations/openbank-statement.md`. Decir que la F19 se revierte
  y por qué, no borrar el rastro. Cubre: R11.
- [x] T3 — Test: un extracto de Openbank produce movimientos con `balance` no
  nulo, y una fila cuya quinta celda no es un importe se sigue reportando en
  `unparsedRows` como hasta ahora. Cubre: R11.

---

## Lote B — el ancla en el modelo y la nueva fórmula del saldo
Archivos: `prisma/schema.prisma`, `prisma/migrations/`,
`src/modules/movements/movements.service.ts`,
`src/modules/movements/movements.types.ts`,
`src/modules/movements/movements.test.ts`
Depende de: —

- [x] T4 — Añadir `balanceAnchor`, `balanceAnchorDate` y
  `balanceAnchorDaySequence` (nullable) a `model Account`. Cubre: R1, R14.
- [x] T5 — Migración `_balance_anchor`: solo columnas nuevas, más el `CHECK` que
  obliga a que importe y fecha sean ambos NULL o ambos no NULL. No reescribe
  ninguna fila. Cubre: R1.
- [x] T6 — Extraer la comparación de recencia `(bookingDate, daySequence)` a un
  `isAfter` único y reescribir `byMostRecent` sobre él, para que el orden no
  pueda divergir entre el punto de anclaje y el filtro de posteriores.
  Cubre: R7.
- [x] T7 — `readAnchor` y `resolveAnchorPoint`: el punto de anclaje efectivo es
  el más reciente entre el ancla guardada y el movimiento más reciente que trae
  saldo por línea. Cubre: R7.
- [x] T8 — `computeAccountBalance` con tercer parámetro opcional: importe del
  punto de anclaje más el neto de lo estrictamente posterior. Cubre: R6, R9, R10.
- [x] T9 — Sin ancla y sin ningún saldo por línea, sumar todo sobre
  `initialBalance`, exactamente como hoy. Cubre: R8.
- [x] T10 — **Reescribir el caso de `movements.test.ts:118`**, que hoy afirma que
  un movimiento sin saldo por línea nunca mueve el resultado. Partirlo en dos:
  posterior al punto (sí suma) y anterior (no suma). Es el cambio de
  comportamiento del aviso 7, no una regresión. Cubre: R9, R10.
- [x] T11 — Tests de la fórmula: manda el saldo del archivo cuando es lo más
  reciente; un ancla de importe cero es un ancla real; un movimiento anterior al
  punto no mueve el saldo. Cubre: R4, R6, R7, R9.

---

## Lote C — lo que ve quien pregunta por una cuenta
Archivos: `src/modules/accounts/accounts.service.ts`,
`src/modules/accounts/accounts.types.ts`,
`src/modules/accounts/accounts.schema.ts`,
`src/modules/accounts/accounts.routes.ts`,
`src/modules/accounts/accounts.test.ts`,
`docs/api-contract.md`, `docs/dar-de-alta-un-banco.md`, `docs/architecture.md`
Depende de: Lote B

- [x] T12 — Reescribir `attachBalances`: traer, por lote y no por cuenta, el
  movimiento con saldo más reciente y los posteriores al punto de anclaje, y
  pasar el ancla a `computeAccountBalance`. Cubre: R6, R7, R10.
- [x] T13 — `serializeAccount` y el schema de respuesta añaden `balanceAnchor` y
  `balanceAnchorDate` (`null` en una cuenta sin anclar). Cubre: R14.
- [x] T14 — Tests de `GET /api/accounts` y `GET /api/accounts/:id`: cuenta
  anclada, cuenta sin anclar, y una cuenta con movimientos posteriores al último
  que trae saldo. Cubre: R7, R10, R14.
- [x] T15 — Actualizar `docs/api-contract.md`: nueva definición de `balance`
  (líneas 169 y 285), los dos campos nuevos, la nota sobre `initialBalance` y la
  tabla de qué banco trae `balance` por movimiento (líneas 944 y 1395). Cubre:
  R14.
- [x] T16 — ADR nuevo en `docs/architecture.md`: el ancla se guarda como hecho
  (importe + fecha), la precedencia del archivo no cambia, y en qué se revierte
  la F19 sin derogar ADR-013. Más una línea en `docs/dar-de-alta-un-banco.md`:
  la línea `saldo;` hace falta una vez por cuenta. Cubre: R6.

---

## Lote D — el importador ancla y rellena
Archivos: `src/modules/import/import.service.ts`,
`src/modules/import/import.types.ts`,
`src/modules/import/import.service.test.ts`,
`src/modules/import/import.local.service.test.ts`
Depende de: Lote A, Lote B

- [x] T17 — `deriveAnchorFromStatement`: el preámbulo gana al saldo por línea, y
  la fecha sale del movimiento más reciente del archivo. Comparar con `!== null`,
  nunca por veracidad, para que el cero entre. Cubre: R1, R2, R4, R5.
- [x] T18 — `anchorAccountIfMissing` con la condición `balanceAnchor: null` **en
  el WHERE**, no en un `if` previo. Cubre: R3.
- [x] T19 — Engancharlo en `importStatement` después de guardar los movimientos y
  antes de dar el archivo por importado; reportar `anchored` y el ancla en el
  resultado. Cubre: R1, R2.
- [x] T20 — `backfillMissingBalances`: rellena el saldo por línea de las filas
  duplicadas que lo tienen a NULL, con la condición en el WHERE; no consulta nada
  si no hubo duplicados. Cubre: R12, R13.
- [x] T21 — Tests del anclaje: cuenta sin ancla queda anclada; segundo extracto
  no la reescribe; ancla de importe cero se guarda; archivo sin saldo importa
  igual y deja la cuenta sin anclar; archivo que falla no ancla nada. Cubre: R1,
  R2, R3, R4, R5.
- [x] T22 — Tests del relleno: una fila ya guardada con saldo vacío se rellena,
  una que ya tenía saldo no se toca, y ninguna de las dos crea un movimiento
  nuevo. Cubre: R12, R13.
- [x] T23 — Test de la reimportación local sobre copias de `var/drive-read/`:
  ancla las cuentas y rellena los saldos que faltan sin duplicar movimientos.
  Cubre: R15.
