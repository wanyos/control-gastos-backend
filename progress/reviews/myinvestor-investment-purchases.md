# Revisión — F71 `myinvestor-investment-purchases`

## Review (2026-11-10)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `README.md:81` — la fila de `GET /api/movements` enumera lo que trae cada
   movimiento y lo que no cuenta en las sumas («Cada movimiento dice en `ownership`
   si la tabla de cuentas propias lo reconoce como tuyo; lo que reconoce como tuyo
   no cuenta en las sumas»), y sigue sin el campo `investmentPurchase` ni sin decir
   que una compra de inversión de MyInvestor no cuenta: describe el listado de antes
   de la F71. Es el mismo caso que la revisión 1 de la F68 sobre esta misma fila.
   `README.md` no está en `Archivos:` de ningún lote de `tasks.md`: el leader tiene
   que ampliar un lote a esa línea (fuera del carril rápido).
2. `feature_list.json:3633` — el último punto de `como_se_que_esta_bien` de la F71
   lleva el gasto real de octubre de 2026 del humano, en euros, en un archivo que va
   a git (regla de `docs/conventions.md` §Tests: ningún dato real en el repositorio,
   tampoco los del dueño). `src/no-real-data.test.ts` no lo detecta porque compara
   valores de columna, no sumas de un mes. Es texto del intent aprobado: el leader
   tiene que proponer al humano reescribirlo sin la cifra (por ejemplo, «sigue siendo
   el mismo que antes de la feature»), y la cifra de antes, si hace falta, se le pasa
   al reviewer en el encargo, fuera del repositorio.
3. Punto «El gasto de octubre de 2026 en Overview sigue siendo el de hoy» (fila del
   🧪 de `decisions.md` que hace el reviewer a mano): **no lo he comprobado**. La API
   local no responde: `curl -s -m 10 -o /dev/null -w "%{http_code}"
   "http://localhost:3000/api/overview?month=2026-10"` → `000` (sin conexión), y
   `GET /api/movements?pageSize=1` → respuesta vacía. No la he arrancado yo: es la
   base real del humano. Hace falta que la API esté en marcha con el código actual
   (`pnpm run dev`) antes de la siguiente revisión; entonces se comprueba que
   `GET /api/movements` trae `investmentPurchase` y se compara
   `GET /api/overview?month=2026-10` con las cifras de `expense` e `income` del
   encargo.

### Comprobado sin hallazgos

- **`./init.sh`**: `./init.sh > <scratchpad>/init.log 2>&1` → `EXIT=0`; tipos, lint
  y `format:check` en `[OK]`; `Test Files 102 passed (102)`, `Tests 1581 passed
  (1581)`.
- **`./init.sh --checks`**: `EXIT=0`, `Checks: 14 de 14 en verde`. Cada check que
  filtra por nombre imprime `Tests 1 passed` (con `9 skipped`/`1 skipped` el resto del
  archivo): ninguno salió en verde sin ejecutar su test. Los 14 coinciden con la tabla
  🧪 de `decisions.md` (la fila de octubre, sin check, es el punto 3).
- **Los cuatro archivos de tests ya existentes** (`movements.deposits.test.ts`,
  `movements.exclusion.test.ts`, `movements.hide-not-counted.test.ts`,
  `overview.test.ts`): `git diff -U0 <los cuatro> | grep -E '^[-+].*(expect|toBe|toEqual|…|it\()'`
  → ninguna línea. Lo que cambia es dónde se siembra el gasto corriente (cuenta
  `bankinter`) y, en dos tests, el filtro de la consulta de `accountId` a fechas; las
  aserciones son las mismas. En `movements.test.ts` solo cambian las llamadas a
  `computeTotals` (cuarto argumento) y la clave `investmentPurchase` en la forma
  serializada (R9).
- **Trazabilidad R1–R14 ↔ tests**: cada `R<n>` tiene su test en
  `movements.investment-purchases.test.ts`, `myinvestor.investment-purchase.test.ts` o
  `movements.investment-purchases.docs.test.ts`; los tests miden cifras concretas y
  comparan contra las tres sumas leídas con el registro de compras vacío. Base
  desechable de vitest, fixtures inventados.
- **Spec**: `decisions.md` de 61 líneas con los bloques de la plantilla, 5 puntos en
  🔴 con alternativa; 14 requirements; procedencia con cada `R<n>` clasificado;
  T1–T9 en `[x]`.
- **Arquitectura y convenciones**: el banco solo se nombra en `src/app.ts` (registro
  `investmentPurchaseMatchers`), el clasificador del banco no importa otros módulos,
  lectura solo con `findMany`, cuarto parámetro obligatorio en `computeTotals` e
  `isCountedExpense`. Sin `console.log` ni TODO.
- **Documentos**: `docs/api-contract.md`, `docs/data-model.md`, ADR-046 y
  `docs/vocabulary.md` (punto 5 de la hoja) al día; `git grep` de `three registr`,
  `tres registros`, `computeTotals(…ownership)` fuera de `progress/` y `specs/` sin
  líneas falsas.
- **CHECKPOINTS** C1-C3, C4, C4 bis (no lee datos nuevos de fuera), C5 (en curso),
  C6 (el aviso al frontend está en el 📌 de la hoja), C7.

## Review 2 (2026-11-10)

**Veredicto:** APPROVED
Comprobado: requirements R1–R14 ↔ tests, arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Checks: 14 de 14 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/myinvestor-investment-purchases.md`.

Cómo se cerraron los tres puntos de la revisión 1 (comprobado ahora):

1. `README.md:81` — la fila de `GET /api/movements` nombra `investmentPurchase` y
   que una compra de inversión no cuenta en las sumas; `README.md` está en
   `Archivos:` del Lote B (`tasks.md:29`).
2. La cifra de antes ya no está en ningún archivo: `git grep` de la cifra (con y sin
   separadores) → 0 líneas; `grep -rl` sobre el árbol de trabajo, archivos sin
   versionar incluidos, fuera de `node_modules/` y `.git/` → ninguno. La frase de
   `feature_list.json` dice «sigue siendo el mismo que antes de la feature».
3. API local en marcha, solo `GET`:
   - `GET /api/overview?month=2026-10` → `period.totals.expense` e `income`
     **coinciden** con las cifras de antes de la feature que dio el leader.
   - `GET /api/movements?accountId=14787&pageSize=200` → 106 movimientos (65 gastos,
     41 ingresos), todos con la clave `investmentPurchase`. 11 compras: 2 con
     `certain: true`, 9 con `certain: false`; 54 gastos en `null`; 0 gastos emparejados
     como traspaso. Comparado movimiento a movimiento con la regla de la hoja (gasto,
     sin traspaso, concepto que no empieza por ninguno de los 6 conceptos fijos;
     `true` solo con «@ nº» al final): 0 discrepancias. Coincide con la tabla de
     `decisions.md` (106 / 11 / 54 / 41).
   - `GET /api/movements` de todas las cuentas (9 páginas de 200, 1711 movimientos):
     1711 con la clave `investmentPurchase`; 11 compras, todas de la cuenta 14787; 0 en
     otras cuentas.

### Comprobado sin hallazgos

- **`./init.sh`**: `./init.sh > <scratchpad>/init.log 2>&1` → `EXIT=0`; tipos, lint y
  `format:check` en `[OK]`; `Test Files 102 passed (102)`, `Tests 1581 passed (1581)`.
- **`./init.sh --checks`**: `EXIT=0`, `Checks: 14 de 14 en verde.` Los checks que
  filtran por nombre imprimen `Tests 1 passed` (con `9 skipped`, `1 skipped` o solo
  `(1)`): ninguno salió en verde sin ejecutar su test. Siguen coincidiendo con la
  tabla 🧪 de `decisions.md`.
- Vocabulario de la frase nueva del `README.md`: campo `investmentPurchase` y «compra de
  inversión», en `docs/vocabulary.md:49`.
- Lo demás de la revisión 1 (trazabilidad, spec, arquitectura, documentos, C1-C7): según el
  informe del implementer y el encargo, después solo se tocaron `README.md`, la frase del
  intent en `feature_list.json` y la línea `Archivos:` de `tasks.md`; los tres, revisados arriba.
