# Review — F67 `investments-gains`

## Review (2026-11-04)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `R8` — cubierto solo en parte. De los siete motivos, ningún test de
   `src/modules/investments/investments.gains.test.ts` crea un depósito cerrado
   `ambiguous` ni `below_principal`, ni un depósito con `missing_conditions` por
   `expectedGain` vacío, por `openedAt` ≥ `maturityDate` o, ya cerrado, por
   `principal` / `maturityDate` vacíos (`grep -n "ambiguous\|below_principal\|expectedGain: null\|principal: null\|maturityDate: null"`
   sobre el archivo: 0 coincidencias). Quedan sin ejecutar
   `src/modules/investments/investments.service.ts:1146` (el caso `term <= 0`, que es
   lo que evita dividir por 0), `:1181` y `:1227`. `below_principal` importa en
   particular: `getDepositEarnings` sí rellena `maturity.amount` en ese estado y R8
   exige `currentValue: null`; nada comprueba que no se cuele. Hace falta al menos un
   test por cada uno de esos caminos, con la entrada concreta esperada (cifras a
   `null`, `invested` = `principal`, su `reason`) y, en los vivos, su línea en
   `total.excluded`. Lo arregla el `implementer`.
2. `docs/vocabulary.md` — no tiene la fila de los nombres que el humano aprobó en
   `specs/67-investments-gains/decisions.md` («Los nombres en código»:
   `GET /api/investments/gains`, `live`, `closed`, `currentValue`, `valuedAt`,
   `closedOn`, `reason` y los siete motivos). Esos nombres están ya en el contrato,
   en el ADR-043 y en el informe, y no figuran ni en la tabla de `CLAUDE.md` ni en
   `docs/vocabulary.md` (precedente: la fila de la F63, «Propuesto en
   `specs/63-expenses-by-category/decisions.md` punto 6»). El archivo no está en el
   lote A: lo añade el leader (carril rápido).
3. `specs/67-investments-gains/requirements.md:145` y `:170` — la procedencia de R6 y
   R16 sigue diciendo «← REVISAR EN APROBACIÓN (🔴 1/2)», y la de R16 «queda como
   punto a confirmar», cuando `decisions.md` los da por aprobados el 2026-11-04.
   Quitar las marcas y decir que quedaron aprobados en la puerta. Leader (carril
   rápido).
4. `specs/67-investments-gains/requirements.md` — 16 requirements (R1–R16) y
   `decisions.md` no dice por qué pasa de ~15. La razón existe (R16 nace en la puerta
   al sacar el cancelado de R8), pero tiene que estar escrita en `decisions.md` y
   avisada al humano, que ya aprobó la hoja. Leader (carril rápido).

### Comprobado sin hallazgos

- `decisions.md` final (2026-11-04) ↔ `requirements.md` (R3, R6, R11, R16),
  `design.md` §2–§3 y `tasks.md` T4: depósito vivo con la ganancia esperada repartida
  por días, su capital en `total.invested` y su ganancia en `total.gain`; cancelado en
  `closed` con `"0.00"`; cada cerrado con `closedOn`, `currentValue` y `gain`. El
  código (`getInvestmentGains` y sus funciones privadas) sigue esa versión. Las
  cuentas de los ejemplos y de los tests cuadran (200 días y d = 100 / 50; 275 × 246 /
  364 = 185,85).
- Trazabilidad R1–R7, R9–R16 ↔ tests reales con salida concreta (base de tests, sin
  mocks); `tasks.md` T1–T8 en `[x]`.
- `docs/api-contract.md` §`GET /api/investments/gains`: publica la fórmula
  `total.gainPercent = total.gain / total.invested × 100`, la del reparto por días, la
  tabla de motivos y un ejemplo que cuadra (lo comprueba
  `investments.gains.docs.test.ts`); los dos párrafos de lectores enlazan la sección.
- Alcance del implementer: código y docs solo del lote A, más la fila de `README.md`
  autorizada; `tasks.md` y `progress/current.md` son de su rol. `feature_list.json`:
  la entrada de la F67, con los 17 `checks` iguales a la tabla 🧪 de `decisions.md`.
- Arquitectura (lectura solo en `investments.service.ts`, como exige
  `src/architecture.test.ts`; solo `findMany`; reutiliza `getDepositEarnings`),
  convenciones, ADR-043, `git grep` de documentos vueltos falsos (ninguno),
  `docs/lessons.md` (1–4: ninguna se repite; sin columna nueva, la 2 no aplica),
  ningún dato real (`src/no-real-data.test.ts` en verde dentro de la suite).
- CHECKPOINTS C1–C7 (C4 bis no aplica: solo lee la base; C6: contrato publicado en
  la misma feature). C8 pendiente del `APPROVED`.

### Comandos lanzados

- `./init.sh` → código de salida 0. `Test Files  93 passed (93)`,
  `Tests  1513 passed (1513)`, lint y formato en verde, «Entorno listo».
- `./init.sh --checks` → código de salida 0. `Checks: 17 de 17 en verde.` Los 16
  filtrados por nombre muestran `Tests  1 passed | 10 skipped (11)` (el de docs,
  `Tests  1 passed (1)`): cada uno ejecutó su test. El 17 (`pnpm test`), exit 0.

## Review 2 (2026-11-04)

**Veredicto:** APPROVED
Comprobado: los cuatro cambios de la Review 1 (1: dos tests nuevos que cubren
`ambiguous`, `below_principal` sin que se cuele el importe del movimiento, y
`missing_conditions` vivo —sin `expectedGain`, sin `maturityDate`, plazo 0 y
negativo— y cerrado —sin `principal`, sin `maturityDate`—; servicio sin cambios;
2: fila de la F67 en `docs/vocabulary.md`; 3: sin marcas «REVISAR» en
`requirements.md`; 4: razón de los 16 requirements en `decisions.md`), además de
acceptance/requirements ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C8. Checks: 17 de 17 en verde.
`./init.sh` → exit 0, `Test Files  93 passed (93)`, `Tests  1515 passed (1515)`.
`./init.sh --checks` → exit 0, `Checks: 17 de 17 en verde.`; los 16 filtrados por
nombre muestran `Tests  1 passed | 12 skipped (13)` (el de docs `Tests  1 passed (1)`).
Sin hallazgos.
Resumen de cierre: `progress/summaries/investments-gains.md`.
