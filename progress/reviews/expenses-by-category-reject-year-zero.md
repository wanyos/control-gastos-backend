## Review — 2026-11-02

**Veredicto:** APPROVED
Comprobado: acceptance ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C6 y C8 (C4 bis y C7 no aplican). Checks: 5 de 5 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/expenses-by-category-reject-year-zero.md`.

Lo ejecutado:

- `./init.sh` → exit 0: `Test Files 91 passed (91)`, `Tests 1491 passed (1491)`,
  `Entorno listo`. `src/no-real-data.test.ts` no dio timeout (está entre los 91 en verde).
- `./init.sh --checks 65` → exit 0, `Checks: 5 de 5 en verde.` Los checks 1-3 muestran
  `Tests 1 passed | 17 skipped (18)` cada uno (los `-t` coinciden con los nombres de los
  tests). El check 4 no imprime recuento; lanzado aparte,
  `pnpm exec vitest run src/modules/expenses-by-category` → `Tests 18 passed (18)`, y con
  `-t "year=2000 and month=2000-01 respond 200"` → `1 passed | 17 skipped`.
- Bordes, compilando el `querystring` del schema con el `ajv` del proyecto (script en el
  scratchpad, fuera del repo): `year` 0000, 0001, 1000, 1999, 10000 → rechazado; 2000,
  2026, 9999 → aceptado. `month` 0000-01, 0001-01, 1999-12, 2000-00, 2000-13 →
  rechazado; 2000-01, 9999-12 → aceptado.
- `git status`: en `src/` solo cambian `expenses-by-category.schema.ts` y
  `expenses-by-category.test.ts`; `resolvePeriods` y los demás schemas, intactos.
- `git grep` de `cabo 30`, `cuatro cifras`, `year=0000` y `desde el 2000` fuera de
  `progress/` y `specs/`: `docs/api-contract.md:2049,2050,2212` y `docs/roadmap.md:465`
  dicen lo que hace el código; nada más describe el rango de años de esta ruta.
