## Review (2026-10-25)

**Veredicto:** APPROVED
Comprobado: acceptance ↔ tests, arquitectura, convenciones, verificación, CHECKPOINTS C1-C6 y C8 (C4 bis y C7 no aplican: no lee datos de fuera, no es SDD). Checks: 5 de 5 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/retire-recurring-expenses.md`.

### Comandos lanzados y qué salió

- `./init.sh --checks` → exit 0, `Checks: 5 de 5 en verde.` Los checks 1 y 4 muestran `Tests  1 passed | 1486 skipped (1487)`. El check 3 no imprime recuento en su resumen; lanzado aparte, `pnpm exec vitest run src/modules/expenses-by-category` → `Test Files 2 passed (2)`, `Tests 14 passed (14)`.
- `./init.sh` → exit 0: tsc, lint y format:check OK, `Test Files 91 passed (91)`, `Tests 1487 passed (1487)`. No hubo ningún límite de tiempo en `src/no-real-data.test.ts`.
- Los 11 `comando` de la F63 que filtran por nombre, lanzados uno a uno → todos exit 0, cada uno con `Tests  1 passed`. Los nombres que cita la F63 siguen existiendo, también `the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses`.
- `git grep -n "get-apirecurring"` → solo sale la aserción de `src/retired-routes.docs.test.ts:191`. `git grep -n -i recurring` fuera de `progress/`, `specs/` y `feature_list.json` → solo salen avisos de que la ruta está retirada, el histórico de ADR-037/040/041 (cada uno con su nota de la F64 al principio) y los cabos 28 y 29 del roadmap, ya cerrados.

### Puntos pedidos

- `GET /api/expenses-by-category`: `expenses-by-category.test.ts` no ha cambiado (`git status`). En `expenses-by-category.docs.test.ts` solo cambia el bloque final, el que habla de la ruta retirada (líneas 184-190). Lo que comprueba de la respuesta sigue igual.
- `own-accounts.totals.test.ts`: el cambio es correcto y no quita nada de lo que protegía el test. Sigue comprobando lo mismo: las tres sumas aplican la misma regla, tanto antes como después de rellenar la tabla, con los ids `toContain`/`not.toContain`. Esos ids demuestran que los movimientos caen en el periodo consultado. Las cifras `360.00` y `144.00` coinciden ahora con la diferencia de `GET /api/overview` del mismo mes. Antes eran 1/12 de esas cantidades (`30.00` y `12.00`), por la media de 12 meses de la ruta vieja.
- Ningún documento fuera de `progress/` y `specs/` presenta ya la ruta como vigente, y no queda ningún enlace a `#get-apirecurring-expenses`. Esto lo comprueba también `src/retired-routes.docs.test.ts:177`.
