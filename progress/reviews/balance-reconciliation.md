# Review — F32 `balance-reconciliation`

Fecha: 2026-08-30 · Revisor: `reviewer` · Spec: `specs/balance-reconciliation/`
Informe revisado: `progress/implementations/balance-reconciliation.md` (lotes A y B)

## Review

**Veredicto:** APPROVED

Sin hallazgos. Todo lo de abajo se ejecutó; no hay ninguna afirmación salida solo
de leer código.

### La comprobación central: el test del orden

Hecha por mí, no aceptada del informe.

1. Baseline: `pnpm exec vitest run src/modules/import/import.service.test.ts`
   → **54 passed (54)**.
2. Inversión: moví
   `const storedAnchor = await readStoredAnchor(deps.prisma, resolution.account.id)`
   ([`import.service.ts:617`](../../src/modules/import/import.service.ts#L617)) a
   **después** de `anchorAccountIfMissing` / `readAccountAnchor` (línea 626).
3. Re-ejecución del archivo → **1 failed | 53 passed (54)**. El único rojo:
   `hands the preamble check the anchor from BEFORE this file anchored the account (R4)`
   ([`import.service.test.ts:1783`](../../src/modules/import/import.service.test.ts#L1783)),
   con `AssertionError: expected 4 to be less than 2` (el índice de la lectura del
   ancla deja de ser anterior al `updateMany`).
4. Restaurado desde copia de seguridad: `md5sum` de `import.service.ts` idéntico
   al de antes de tocarlo (`946e27a6294bb169ce7bca056e01928a` antes y después).

Es decir: lo que el lote B afirmó (53 de 54 verdes con el orden malo, y ese test
como único guardián) es **exacto**. La feature no queda sin red.

### Las 5 decisiones aprobadas por el humano

1. **Tolerancia cero.** No existe constante de tolerancia. `grep -rni
   "toleran|epsilon|margin"` sobre `src/`: en los archivos de la feature solo
   aparece en prosa (el docstring de
   [`import.balance.service.ts:44`](../../src/modules/import/import.balance.service.ts#L44)
   que dice que no la hay) y en dos nombres de test que dicen «the tolerance is
   zero». La única constante `toleranceCents` del repo vive en
   `trade-republic.product.parser.ts:211`, es previa y ajena. La comparación es
   `difference.isZero()` (línea 50).
2. **`/api/accounts` no cambia.** Comprobado en código, no solo en el documento:
   `grep -rn "mismatch|descuadre"` sobre `src/modules/accounts/` → **cero
   resultados**. Y el test de R8 hace `app.inject` real a `GET /api/accounts` y
   `GET /api/accounts/:id` y afirma `balance: "60.00"` con un descuadre presente
   ([`import.service.test.ts:1852`](../../src/modules/import/import.service.test.ts#L1852)).
   Los campos `balanceAnchor`/`balanceAnchorDate` que sí tiene la respuesta son de
   la F31, no de esta.
3. **Sin dos números que comparar, silencio.** Los tres `null` de
   `findStatementBalanceMismatch` (líneas 174-181) y el `continue` del par
   incompleto (línea 135), cada uno con test: R2, R4 y R9.
4. **Se comprueba el archivo que se importa.** `findPerLineMismatches` es pura
   sobre `statement.movements`; la del preámbulo consulta solo la ventana
   `ancla → movimiento más reciente del archivo` (líneas 187-203). No hay barrido
   del histórico.
5. **Doble comprobación.** Las dos se llaman incondicionalmente en
   `importStatement` (líneas 631-637) y el `check` distingue cuál produjo cada
   descuadre; qué se comprueba lo decide lo que el archivo trae, no el banco
   (ningún nombre de banco en el módulo, guardián de `architecture.test.ts` verde).

Las tres ya cerradas por el humano: `status: "imported"` y el archivo siguiente
entra igual (test de R6/R7, línea 1650); ancla y saldo intactos (tests de R8,
líneas 1705 y 1852); archivo sin ningún saldo se importa igual (test de R9,
línea 1824).

### Comprobado sin hallazgos

- **Trazabilidad R1-R11.** Cada requirement tiene al menos un test con nombre y
  aserción de valor concreto (`toEqual` del objeto entero en R6): R1/R2/R5/R6/R9
  en `import.balance.service.test.ts` (15 tests), R3/R4/R6/R7/R8/R9/R10 en
  `import.service.test.ts` (6 tests nuevos), R11 en
  `import.local.service.test.ts:553`. Ningún test se limita a «no lanza»; los del
  preámbulo corren contra PostgreSQL real.
- **Tasks:** las 16 en `[x]`, ninguna `[ ]`.
- **Sin persistencia:** `grep -rin mismatch prisma/` → cero. La única migración sin
  commitear es `20260825183936_balance_anchor` (F31). No hay columna nueva.
- **`docs/api-contract.md`:** documenta `balanceMismatches` (los siete campos),
  `balanceMismatchCount`, los **dos** valores de `check` con cuándo se hace cada
  una, y la frase 🔴 de que `GET /api/accounts` no cambia. El ejemplo (`computed`
  `-40.00`, `fromFile` `-20.00`, `difference` `-20.00`, `check: "per-line"`)
  coincide con lo que produce el código (`computed − fromFile`, `toFixed(2)`,
  fecha del punto comparado). El array aparece también en el archivo `failed`,
  como hace `emptyStatementResult()`.
- **ADR-030** (`docs/architecture.md:2390`): explica las dos comprobaciones, por
  qué la del preámbulo no puede reutilizar `computeAccountBalance`
  (`resolveAnchorPoint` prefiere el saldo por línea del propio archivo →
  compararía el archivo consigo mismo), por qué la tolerancia es cero y por qué no
  se persiste; y deja escrita la trampa del orden de líneas.
- **Vocabulario:** «testigo» **no aparece** en ningún archivo de la feature
  (`src/modules/import/`, `src/modules/movements/`, `docs/api-contract.md`,
  `docs/architecture.md`). Las únicas apariciones del repo son previas y ajenas a
  esta feature: `docs/vocabulario.md:44` (que es justamente la lista de palabras
  sin aprobar) y `docs/roadmap.md:242` (línea escrita al cerrar la F31). En código
  `balanceMismatch`, en prosa «descuadre».
- **ADR-017:** `src/no-real-data.test.ts` pasa (48 tests) dentro de la suite y no
  se le ha añadido ninguna entrada a `allowedPaths`: la feature no añade offenders.
- **Las tres sugerencias fuera de alcance:** bien no aplicadas. (a) El árbol del
  ADR-004 en `src/architecture.test.ts` solo comprueba que un archivo **exista**,
  nunca que sea el único —lo dice su propio comentario en la línea 180—, así que
  no listar `import.balance.service.ts` no rompe nada; (b) los valores `per-line` /
  `statement-balance` son traducción literal de cómo `requirements.md` describe las
  dos comprobaciones y quedan a la vista del humano en el contrato; (c)
  `scripts/bankinter-pdf-a-xlsx.mjs` es previo y ajeno.
- **Verificación ejecutada por mí:** `./init.sh` → exit 0, **52 archivos, 995
  tests** verdes, `[OK] Entorno listo`. `pnpm run lint` (oxlint) sin salida.
  `pnpm run format:check` → único aviso `scripts/bankinter-pdf-a-xlsx.mjs`, el
  conocido y ajeno.
- **CHECKPOINTS C1-C5, C6, C7:** una sola feature `in_progress`; sin `console.log`
  ni TODO en los archivos de la feature; `progress/current.md` describe la sesión
  activa; el contrato del frontend está actualizado en `docs/api-contract.md`
  (C6, que es lo que manda `docs/related-projects.md`); spec completo con
  procedencia y decisiones. **C8:** resumen de cierre escrito.

### Lo que NO he comprobado

- **La prueba real (C4 bis)**: no he lanzado `POST /api/import/local` contra los
  archivos de `var/` ni he mirado `balanceMismatchCount` sobre los datos del
  humano. Haría falta ejecutar la reimportación local con sus copias reales; es
  suya y está anotada en `decisions.md` §Consecuencias. La suite dice que el
  código hace lo que el spec dice, no que sus cuatro cuentas cuadren.

Resumen de cierre: [`progress/summaries/balance-reconciliation.md`](../summaries/balance-reconciliation.md).
