# Tasks — F32 `balance-reconciliation`

> Dos lotes. **B** depende de **A** (necesita las dos funciones de comprobación
> ya en verde), así que van en secuencia y la cadena más larga es A → B. Ningún
> archivo aparece en los dos.
>
> **ADR-017: ni un importe real en los fixtures nuevos.** Al terminar, ejecutar
> `pnpm exec vitest run src/no-real-data.test.ts` y comprobar que ningún archivo
> de esta feature sale entre los offenders.
>
> **Vocabulario:** en código `balanceMismatch`; en prosa «descuadre». **No se usa
> la palabra «testigo»** en ningún archivo de esta feature.

---

## Lote A — las dos comprobaciones, aisladas
Archivos: `src/modules/import/import.balance.service.ts`,
`src/modules/import/import.balance.service.test.ts`,
`src/modules/movements/movements.service.ts`,
`src/modules/movements/movements.test.ts`
Depende de: —

- [x] T1 — Exportar `netOf` desde `movements.service.ts` **sin tocar su cuerpo**,
  para que la suma «ingreso suma, gasto resta, `neutral` no toca» siga existiendo
  una sola vez. Cubre: R3.
- [x] T2 — Crear `import.balance.service.ts` con el tipo `BalanceMismatch`
  (`accountId`, `accountAlias`, `date`, `computed`, `fromFile`, `difference`,
  `check`). Cubre: R6.
- [x] T3 — `findPerLineMismatches`: ordena los movimientos del archivo por
  `(bookingDate, daySequence)` con el `isAfter` que ya existe y compara cada par
  consecutivo cuyas DOS líneas traen saldo. Cubre: R1, R2.
- [x] T4 — `findStatementBalanceMismatch`: devuelve `null` si el archivo no trae
  `accountBalance`, si el ancla recibida es `null`, o si el movimiento más
  reciente del archivo no es posterior al ancla; si no, suma desde el ancla con
  `netOf` sobre la ventana `gte`/`lte` y afina el corte con `isAfter`.
  Cubre: R3, R4.
- [x] T5 — Comparar con `Prisma.Decimal` y considerar coincidencia **solo** la
  diferencia exactamente cero. Sin constante de tolerancia en ninguna parte.
  Cubre: R5.
- [x] T6 — Tests de la comprobación línea a línea: una cadena que cuadra no
  produce nada; una línea cuyo importe no explica el salto de saldo produce un
  descuadre con los cinco datos; un par en el que una línea no trae saldo no
  produce nada; un archivo sin ningún saldo por línea no produce nada.
  Cubre: R1, R2, R6, R9.
- [x] T7 — Tests de la comprobación del preámbulo (con base de datos): cuenta
  anclada cuyo neto posterior cuadra con el preámbulo → `null`; el mismo caso con
  un movimiento de más → descuadre; cuenta sin ancla → `null`; archivo cuyo
  movimiento más reciente es anterior al ancla → `null`. Cubre: R3, R4, R5, R6.

---

## Lote B — el informe de la importación
Archivos: `src/modules/import/import.service.ts`,
`src/modules/import/import.types.ts`,
`src/modules/import/import.service.test.ts`,
`src/modules/import/import.local.service.test.ts`,
`docs/api-contract.md`, `docs/architecture.md`
Depende de: Lote A

- [x] T8 — `import.types.ts`: `balanceMismatches: BalanceMismatch[]` en
  `StatementResult` (array vacío, nunca `undefined`), `balanceMismatches?` en
  `FileCounts`, y `balanceMismatchCount` en `ImportRunResult` y
  `LocalImportRunResult`. Cubre: R6, R10, R11.
- [x] T9 — `import.service.ts`: función privada `readStoredAnchor` y llamada
  **antes** de `anchorAccountIfMissing`; después del anclaje, las dos
  comprobaciones; el resultado se acumula en `result.balanceMismatches` y el
  archivo termina `imported`. Inicializar el array en `emptyStatementResult()`.
  Cubre: R4, R6, R7.
- [x] T10 — `totals()` suma `balanceMismatchCount` de todos los archivos; la vía
  local no necesita ningún cambio porque comparte `importStatement` y `totals`.
  Cubre: R10, R11.
- [x] T11 — Tests de `importStatement`: un archivo con un descuadre sale con
  `status: "imported"`, se guarda todo, la ejecución sigue con el archivo
  siguiente y el ancla de la cuenta no cambia. Cubre: R7, R8.
- [x] T12 — Test de que un archivo sin `accountBalance` y sin ningún saldo por
  línea se importa igual y devuelve `balanceMismatches: []`. Cubre: R9.
- [x] T13 — Test de la reimportación local: los descuadres y
  `balanceMismatchCount` salen con la misma forma que por la vía de Drive.
  Cubre: R11.
- [x] T14 — Test de que un archivo con descuadre NO mueve el `balance` que
  devuelven `GET /api/accounts` y `GET /api/accounts/:id`. Cubre: R8.
- [x] T15 — `docs/api-contract.md`: `balanceMismatchCount` y `balanceMismatches`
  en las respuestas de `POST /api/import` y `POST /api/import/local`, con un
  ejemplo inventado, y la frase explícita de que `GET /api/accounts` **no
  cambia**. Cubre: R6, R10, R11.
- [x] T16 — ADR nuevo en `docs/architecture.md` (le toca el número **ADR-030**,
  detrás del ADR-029): las dos comprobaciones, por qué la del preámbulo no puede
  reutilizar `computeAccountBalance`, por qué la tolerancia es cero y por qué el
  descuadre no se persiste. Cubre: R5.
