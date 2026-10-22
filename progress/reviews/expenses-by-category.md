# Revisión — F63 `expenses-by-category`

## Review (2026-10-21)

**Veredicto:** APPROVED
Comprobado: requirements R1–R15 ↔ tests, tasks T1–T10 en `[x]`, arquitectura,
convenciones, verificación, CHECKPOINTS C1-C8 (C4 bis no aplica: solo lee la base).
Checks: 12 de 12 en verde. Sin hallazgos.
Resumen de cierre: `progress/summaries/expenses-by-category.md`.

### Con qué comando y qué salió

- Procesos de `vitest` antes de lanzar nada (consulta `Win32_Process` de `node.exe`
  con `vitest` en la línea de comandos): `count=0`.
- `./init.sh` → `exit=0`: tsc sin errores, `pnpm run lint` y `pnpm run format:check`
  OK, `Test Files 93 passed (93)`, `Tests 1514 passed (1514)`.
- `./init.sh --checks 63` → `exit=0`, `Checks: 12 de 12 en verde.` Los checks
  [1]–[9] y [11] imprimen `Tests 1 passed | 12 skipped (13)`, el [7]
  `Tests 1 passed | 22 skipped (23)`, el [10] `Tests 1 passed (1)`, el [12]
  (`pnpm test`) exit 0: todos ejecutaron su test. Coinciden con la tabla 🧪 de
  `decisions.md`, fila a fila.
- La regla de las sumas se reutiliza, no se copia (leído en el código):
  `expenses-by-category.service.ts:206` filtra solo con `isCountedExpense(row,
  deposits, ownership)`, con `readDepositMovements` (historia entera) y
  `readOwnership`, las mismas lecturas que `getOverview`; `computeTotals` suma
  `expense` por esa misma función (`movements.service.ts:712`). El test
  «the month and the year add up to the expense of GET /api/overview» siembra
  traspaso emparejado, `excludedFromTotals`, apertura y vencimiento de depósito,
  aportación a producto, movimiento propio (F62), dudoso, ingreso y `neutral`, y
  compara con `GET /api/overview` del mes, del mes anterior y de los 12 meses del año
  además de con la cifra literal `144.30`. No he hecho la prueba de romper la regla
  en el módulo para ver caer el test (no se edita el código del implementer).
- `src/modules/recurring-expenses/` sin cambios (`git status`); cabo suelto 29 en
  `docs/roadmap.md:465`. Ningún ADR anterior tocado (`git diff docs/architecture.md`
  solo añade el ADR-041). Lección #2: diagrama ER, bloque Prisma, «Columnas
  reservadas» y claves naturales actualizados en `docs/data-model.md`.

### Comprobado sin hallazgos
R1–R15 ↔ tests (trazabilidad del informe contrastada con
`expenses-by-category.test.ts`, `categories.test.ts` y
`expenses-by-category.docs.test.ts`); cada lote dentro de su lista de archivos de
`tasks.md`; agrupación solo por `categoryId`; solo `findMany`; año en curso con los
mismos meses del anterior y ÷ meses que lleva; `new`/`gone`; reparto por `isFixed`
de cada categoría; movimientos solo del periodo pedido y solo los que cuentan;
`docs/api-contract.md`, `README.md`, `docs/vocabulary.md` (fila del punto 6 de la
hoja); ningún dato real (`src/no-real-data.test.ts` en verde dentro de la suite);
`decisions.md` en una página, 6 puntos 🔴 con alternativa, 15 requirements con
procedencia.
