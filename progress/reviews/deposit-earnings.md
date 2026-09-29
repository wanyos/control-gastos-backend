# Review — F50 `deposit-earnings`

**Veredicto:** APPROVED
Comprobado: requirements R1-R15 ↔ tests, tasks T1-T11 `[x]`, decisions.md (5 puntos 🔴,
bloques de la plantilla), procedencia, arquitectura (el servicio de inversiones no nombra
ningún banco; el texto `INTERESES DEP` vive en `modules/myinvestor/`), convenciones,
contrato ↔ código, los tres añadidos del leader, solo lectura, CHECKPOINTS C1-C8. Sin hallazgos.
Resumen de cierre: `progress/summaries/deposit-earnings.md`.

## Con qué se comprobó (2026-09-28)

- `./init.sh` completo, en solitario → `EXIT=0`; `Test Files 75 passed (75)`,
  `Tests 1393 passed (1393)`; tipos, lint y formato OK.
- `pnpm exec vitest run` de `investments.deposits.test.ts`,
  `myinvestor.deposit-maturity.test.ts`, `architecture.test.ts` e
  `investments.routes.test.ts` con `--reporter=verbose` → `84 passed`; cada R1-R14
  aparece en al menos un test en verde (R15 es documental: sección
  `GET /api/investments/deposits` de `docs/api-contract.md`, leída contra el código).
- Parámetro desconocido: el contrato dice «se ignora» y el test
  `ignores an unknown querystring parameter…` da `200`; además, contra el servidor
  arrancado, `GET /api/investments/deposits?foo=bar` → `200`.
- Solo lectura: `getDepositEarnings` solo usa `findMany` (dos); el test
  `writes nothing while answering (R14)` pasa por el servicio y por la ruta.
- Base real `gastos`, **solo `GET`** (servidor en el puerto 4917, luego parado):
  `200`, 3 depósitos — 2 `active` sin cifra y 1 `matured` con
  `maturity.date = maturityDate`, `earned = amount − principal` y `total = earned`.
  Lo que decía `decisions.md` §📌. Sin importes en este informe.

## Nota (no bloquea)

`specs/50-deposit-earnings/design.md` §5 y la T6 de `tasks.md` siguen diciendo «un
parámetro desconocido → 400». El código y el contrato dicen 200 («se ignora»), desviación
aceptada por el leader y anotada en `progress/implementations/deposit-earnings.md`. Si se
quiere que el spec no contradiga al código, lo corrige el leader en esos dos sitios.
