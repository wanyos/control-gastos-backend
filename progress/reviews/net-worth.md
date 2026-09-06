# Review — feature 42 `net-worth`

Fecha: 2026-09-06
Revisor: reviewer (subagente)
Spec: `specs/42-net-worth/` · Informe del implementer: `../implementations/net-worth.md`

**Veredicto:** APPROVED

## Comandos ejecutados y salida

1. `./init.sh` completo (los 7 pasos), lanzado por el revisor el 2026-09-06:

   ```
    Test Files  58 passed (58)
         Tests  1139 passed (1139)
   [OK]    Todos los tests pasan
   ── 7. Resumen ──────────────────────────────────────────
   [OK]    Entorno listo. Puedes empezar a trabajar.
   [exited with code 0]
   ```

2. `npx vitest run src/modules/net-worth/net-worth.test.ts
   src/modules/investments/investments.service.test.ts --reporter=verbose`:
   **2 archivos, 43 tests, todos en verde**, con los 14 tests de la feature 42
   vistos pasar uno a uno (los 5 de `GET /api/net-worth` R1/R2/R10/R11/R12 y
   los 9 de `getInvestmentsNetWorth` R3–R10).

3. `git status --short` + `git diff --stat`: los únicos archivos tocados son
   `docs/api-contract.md`, `feature_list.json`, `progress/current.md`,
   `src/app.ts`, los tres de `src/modules/investments/` y el módulo nuevo
   `src/modules/net-worth/`. **Cero cambios en `prisma/`**, cero en
   `src/architecture.test.ts`, cero en `src/modules/overview/`.

4. `git diff` de `investments.service.ts` y `investments.service.test.ts`:
   **solo adiciones** (0 líneas borradas) — ninguna aserción existente de la
   F39 modificada.

## Comprobaciones específicas del encargo

1. **Solo lectura, sin fecha** — `net-worth.schema.ts` (querystring vacía con
   `additionalProperties: false`), test R11 (un `?date=` y un `?foo=` devuelven
   exactamente lo mismo que sin parámetros) y test R12 (`hasRoute` niega
   POST/PATCH/PUT/DELETE). `getInvestmentsNetWorth` y `getNetWorth` son `find*`
   de punta a punta (leídos línea a línea). ✅
2. **Cuentas vía `listAccounts`** — `net-worth.service.ts:38` llama a
   `listAccounts` (fórmula única F31); el test R2 compara cada `balance` contra
   `GET /api/accounts` en la misma pasada. Sin segunda fórmula. ✅
3. **Reglas de valoración** — fluctuante = `marketValue.plus(uninvestedCash)`
   solo si el cash no es NULL (`investments.service.ts:616-621`), con test del
   caso NULL (solo marketValue, sin cero inventado); depósito = `principal`
   sin `expectedGain` (línea 561, test R4 con `expectedGain: '82.50'` presente
   y no sumado); remunerada = `balance` del último snapshot (línea 592, test
   R5 con dos snapshots que elige el más reciente). ✅
4. **Casos límite, cada uno con test visto pasar** — foto vieja
   (`date < staleBefore` = primer día del mes anterior, estricto) suma y avisa
   con `stale_valuation` + fecha, con los dos lados del umbral fijados
   (31-07 vieja, 01-08 fresca); sin foto → `value: null` fuera de la suma con
   `no_valuation` (incluida una foto posterior a hoy, que también es hueco);
   depósito vencido sin `closedAt` suma con `matured_not_closed` y su
   `maturityDate`; producto cerrado ni aparece ni suma ni avisa (R6). ✅
5. **ADR-026 intacto** — `src/architecture.test.ts` sin tocar (git diff), su
   test «writes the three investment tables only from modules/investments»
   pasó en la suite; `net-worth.service.ts` no nombra ningún modelo de
   inversiones (verificado leyéndolo; el regex del guardián lo detectaría). ✅
6. **`GET /api/overview` y `GET /api/investments/overview` intactos** —
   `overview/` sin tocar y las adiciones a investments son solo eso,
   adiciones; ambas suites en verde dentro del `./init.sh`. ✅
7. **`prisma/` sin cambios** — git status limpio en esa carpeta. ✅
8. **Ningún importe recalculado ni redondeado** — solo `toFixed(2)` de
   serialización sobre valores tal como están guardados y suma en
   `Prisma.Decimal`; test R10 con céntimos que un float desviaría. ✅
9. **Sin vocabulario nuevo** — contrastado contra `docs/vocabulario.md`; los
   términos usados («foto», «hueco», «aviso», «patrimonio neto») son del
   propio humano en el intent o descripción literal. ✅

## Juicio de las dos cuestiones señaladas por el leader

- **Desviación `staleBefore` derivado de `today` inyectado** — CORRECTA. El
  design §4 exige que `today` se inyecte «para que los tests fijen el reloj»;
  derivar el umbral de `currentMonth()` (reloj real) contradiría su propia
  firma. Mismo umbral, misma semántica, documentada en el informe y con test
  que fija ambos lados. No es motivo de rechazo.
- **Sugerencia NO aplicada (añadir `src/modules/net-worth/` al árbol de
  `src/architecture.test.ts:39`)** — decisión correcta del implementer: el
  archivo no estaba en la lista del spec y ese test solo comprueba existencia,
  así que nada falla hoy. PERO queda como **cabo suelto** (severidad baja): la
  F38 (overview, línea 198) y la F44 (transfers, línea 207) sí añadieron sus
  módulos, y mientras net-worth no esté en la lista es el único módulo cuyo
  borrado accidental el guardián no detectaría. Recomendación: chore de una
  línea en la próxima sesión, anotar en `docs/roadmap.md`.

## Checklist SDD (C7)

- `decisions.md` en una página, bloque 🔴 con 5 puntos (≤6), cada uno con
  alternativa. ✅
- 13 requirements (≤15), EARS estricto, sección de procedencia con los 13
  clasificados (humano/delegado/añadido). ✅
- Trazabilidad R1–R13 → tests concretos, todos vistos pasar (R13 = suite
  completa con overview e investments sin una aserción tocada). ✅
- `tasks.md`: T1–T7 todas `[x]`. ✅

## Comprobado sin hallazgos

acceptance ↔ tests, requirements ↔ tests (R1–R13), arquitectura
(`docs/architecture.md` §vertical slice, guardianes), convenciones,
`docs/api-contract.md` (sección `GET /api/net-worth` completa: reglas, enum de
`reason`, umbral exacto, ejemplo con cifras inventadas que cuadra —
12810.75 + 10000.00 + 5208.40 = 18208.90 — y nota «solo existe el GET»),
CHECKPOINTS C1–C5 y C7. C6: el contrato quedó actualizado; la parte frontend
es otra sesión por la regla de oro del workspace. C8: resumen escrito en
`../summaries/net-worth.md`.

## Hallazgos

| # | Severidad | Hallazgo |
|---|---|---|
| 1 | Baja (no bloquea) | `src/modules/net-worth/` no está en la lista del test de árbol (`src/architecture.test.ts:39`); overview y transfers sí están. Chore de seguimiento, fuera del scope del spec. |
