# retire-recurring-expenses — implementación

F64, flujo simple (sin spec). Trabajado a partir de `intent`, `acceptance` y `checks`
de `feature_list.json`. Estado pasado de `pending` a `in_progress` (no a `done`).
Sin commit. `progress/current.md` no se ha tocado (lo lleva el leader).

## Archivos modificados / creados

Borrados (la carpeta entera, `test ! -d src/modules/recurring-expenses` en verde):

- `src/modules/recurring-expenses/recurring-expenses.docs.test.ts`
- `src/modules/recurring-expenses/recurring-expenses.routes.ts`
- `src/modules/recurring-expenses/recurring-expenses.schema.ts`
- `src/modules/recurring-expenses/recurring-expenses.service.ts`
- `src/modules/recurring-expenses/recurring-expenses.test.ts`
- `src/modules/recurring-expenses/recurring-expenses.types.ts`

Borrados en el árbol de trabajo, **sin pasar al índice** (`git status`: ` D`).

Código:

- `src/app.ts` — fuera el `import recurringExpensesRoutes …` y su `app.register(…, { prefix: '/api/recurring-expenses', … })`.
- `src/modules/movements/movements.service.ts` — solo el comentario de `isCountedExpense`, que nombraba la ruta como una de las que preguntan ahí. Sin cambio de código.

Tests:

- `src/architecture.test.ts` — nuevo `describe('retired route of feature 64')` con el test **`GET /api/recurring-expenses responds 404`**: `buildApp()` + `inject`, comprueba 404 con cuerpo `{ statusCode: 404, code: 'NOT_FOUND' }` y que la carpeta del módulo no existe. Lo he puesto aquí porque es donde ya vive el test de las 404 de las ocho rutas que retiró la F52 (`retired routes of feature 52 (R3)`) y el de `/api/expenses`. La lista de árbol esperado de este archivo **no** tenía archivos del módulo retirado (comprobado con `grep -n -i recurring src/architecture.test.ts`, sin resultados antes del cambio): no había nada que quitar.
- `src/retired-routes.docs.test.ts` — nuevo `describe('docs/api-contract.md — the route retired by feature 64')` con el test **`api-contract: lists GET /api/recurring-expenses under the retired routes`**. Mismo archivo y mismas funciones (`splitContract`, `read`) que el de la F52. Comprueba: fila `| 9 | \`GET /api/recurring-expenses\` |` dentro de «Rutas retiradas» con enlace a `GET /api/expenses-by-category`, el aviso con feature 64 y fecha 2026-10-25, el cuerpo de error 404; y fuera de esa sección, que no queda sección `### \`GET /api/recurring-expenses\``, ni enlaces a `#get-apirecurring-expenses`, ni ninguna línea que nombre la ruta sin decir «retirada».
- `src/modules/own-accounts/own-accounts.totals.test.ts` — importaba `RecurringExpensesResponse` del módulo retirado y llamaba a la ruta como tercera de las «tres sumas». Ver «Decisiones tomadas».
- `src/modules/own-accounts/own-accounts.docs.test.ts` — las dos comprobaciones que pedían `GET /api/recurring-expenses` en el contrato (en §Movimientos entre tus cuentas en las sumas y su sección propia enlazando a esa regla) pasan a pedir `GET /api/expenses-by-category`, que es la que hoy lee la misma regla.
- `src/modules/expenses-by-category/expenses-by-category.docs.test.ts` — el bloque final comprobaba que la sección de la ruta vieja decía «Se retirará… sigue respondiendo igual». Ahora comprueba que esa sección ya no existe y que la sección de `GET /api/expenses-by-category` dice que sustituye a la ruta retirada en la feature 64 y enlaza a «Rutas retiradas». **El nombre del test no cambia** (`the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses`): lo nombra literalmente un `check` de la F63 en `feature_list.json`, y los checks no se tocan. Todo lo que el test comprueba de la respuesta de `GET /api/expenses-by-category` queda igual.

Documentos:

- `docs/api-contract.md` — borrada la sección `### GET /api/recurring-expenses` entera (con su `---`); en «Rutas retiradas», un segundo aviso «BREAKING CHANGE (feature 64 …, 2026-10-25)» con la fila 9 (qué hacía, qué se usa ahora), «Lo que NO cambia» y el puntero a ADR-041/ADR-037; reescrito el párrafo de §Movimientos entre tus cuentas en las sumas (la tercera suma es ya `GET /api/expenses-by-category`) y la frase «Sustituye a…» de §`GET /api/expenses-by-category`, que enlazaba al ancla borrada.
- `README.md` — quitadas la fila de la tabla de endpoints y la línea del árbol de `modules/`; añadido un aviso de breaking change de la F64 junto al de la F52.
- `docs/architecture.md` — ADR-037, ADR-040 y ADR-041 no se borran ni se reescriben: cada uno lleva al principio una nota «Revisado el 2026-10-25 por la feature 64 `retire-recurring-expenses`» que dice que la ruta quedó retirada y qué deja de ser verdad.
- `docs/roadmap.md` — cabo 29 tachado y cerrado por la F64; fila E7: añadido que `GET /api/recurring-expenses` (F58, F59) quedó retirada por la F64, y F64 en la columna de features.
- `feature_list.json` — solo `status` de la F64: `pending` → `in_progress`.

## Decisiones tomadas

1. **La tercera suma de `own-accounts.totals.test.ts` pasa a `GET /api/expenses-by-category`.** Antes medía `monthlyTotal` y los ids de `GET /api/recurring-expenses`; ahora mide `amount` y los ids de las líneas de `GET /api/expenses-by-category?month=<el mes del test>`. Es la ruta que la sustituye, lee la misma regla (`isCountedExpense` con `readOwnership`) y la tabla de §Movimientos entre tus cuentas en las sumas del contrato ya la contaba. Cambian dos cifras esperadas porque la ruta vieja dividía el periodo entre 12 y la nueva da el mes: `30.00` → `360.00` (120.00 + 240.00) y `12.00` → `144.00`. Las aserciones de `GET /api/movements` y `GET /api/overview` no cambian. Alternativa descartada: quitar la tercera suma sin poner nada, que habría dejado sin probar desde este archivo lo que la tabla de cuentas propias hace al gasto por categoría (aunque `expenses-by-category.test.ts` ya lo prueba en `the month and the year add up to the expense of GET /api/overview`). **Para el reviewer:** si el humano prefiere la otra opción, es un cambio de pocas líneas.
2. **Nada de código de otro módulo usaba el módulo retirado.** Comprobado con `git grep -n -i "recurring" -- src ':!src/modules/recurring-expenses'`: el único `import` desde fuera era el tipo `RecurringExpensesResponse` en `own-accounts.totals.test.ts` (resuelto en el punto 1). Lo que el módulo usaba de otros (`isCountedExpense`, `readOwnership`, `readDepositMovements`, `monthRange`, `normalizeForMatch`, `transferWords`) sigue donde estaba y sin cambios.
3. **Lección 2 (`docs/data-model.md`) no aplica:** no hay columnas nuevas ni que dejen de tener escritor; `prisma/schema.prisma` sin tocar (`git status --short prisma` vacío), sin migración. `docs/data-model.md` no nombra la ruta (`git grep -n -i recurring docs/data-model.md`, sin resultados). Lección 3 no aplica: no hay fixtures `.xls` ni `.pdf`. Lección 1 no aplica.

## Documentos actualizados

`git grep -n -i "recurring" -- . ':!progress' ':!specs'` antes del cambio daba, fuera del módulo: `README.md` (líneas 90 y 163), `docs/api-contract.md`, `docs/architecture.md`, `docs/roadmap.md`, `feature_list.json`, `src/app.ts`, `src/modules/movements/movements.service.ts`, los dos tests de own-accounts y el docs test de expenses-by-category. Todos corregidos como se dice arriba. También `git grep -n "get-apirecurring"` (enlaces al ancla borrada): ahora sin resultados.

Después del cambio, las menciones que quedan son:

- `README.md:114`, `docs/api-contract.md:65,66,74,1414,2038`: avisos de que está retirada.
- `docs/architecture.md`: las tres notas de revisión de la F64 y el cuerpo original de ADR-037, ADR-040 y ADR-041 (historia; la nota de cabecera dice qué deja de ser verdad).
- `docs/roadmap.md:112,463,464`: fila E7 (retirada), cabo 28 (cerrado por la F59, histórico) y cabo 29 (cerrado).
- `feature_list.json`: la propia F64 y las features 58, 59 y 63 (histórico; no se tocan).
- Los tests nuevos y comentarios que explican el cambio.

`docs/vocabulary.md` y la tabla de términos de `CLAUDE.md` revisados contra lo escrito: no he introducido nombres nuevos; «Rutas retiradas» y «BREAKING CHANGE» ya existían en el contrato.

## Prueba real (si la feature lee datos de fuera)

No aplica: la feature no lee archivos de banco ni datos de fuera del código; solo quita una ruta.

## Último ./init.sh

`./init.sh` → exit 0. Líneas relevantes:

```
[OK]    feature_list.json válido (64 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  91 passed (91)
      Tests  1487 passed (1487)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Además, `pnpm exec vitest run src/modules/expenses-by-category src/modules/own-accounts` → `Test Files 6 passed (6)`, `Tests 32 passed (32)`.

## Último ./init.sh --checks

`./init.sh --checks` → exit 0, `Checks: 5 de 5 en verde.`

```
[1] GET /api/recurring-expenses responde 404.
    $ pnpm exec vitest run -t "GET /api/recurring-expenses responds 404" | grep -E "Tests +1 passed"
    exit 0 — Tests  1 passed | 1486 skipped (1487)
[2] (añadido) La carpeta del módulo retirado ya no existe.
    $ test ! -d src/modules/recurring-expenses
    exit 0
[3] GET /api/expenses-by-category sigue respondiendo igual.
    $ pnpm exec vitest run src/modules/expenses-by-category
    exit 0
[4] docs/api-contract.md la lista en «Rutas retiradas».
    $ pnpm exec vitest run -t "api-contract: lists GET /api/recurring-expenses under the retired routes" | grep -E "Tests +1 passed"
    exit 0 — Tests  1 passed | 1486 skipped (1487)
[5] La suite pasa.
    $ pnpm test
    exit 0
```

## Mapeo criterio de aceptación → test

- Acceptance 1 (404, fuera de `src/app.ts`, carpeta borrada) → `GET /api/recurring-expenses responds 404` (`src/architecture.test.ts`); check 2 (`test ! -d …`).
- Acceptance 2 (`GET /api/expenses-by-category` igual) → `src/modules/expenses-by-category/expenses-by-category.test.ts` sin cambios (check 3); lo que se movía: `own-accounts.totals.test.ts` (decisión 1).
- Acceptance 3 (contrato, «Rutas retiradas» con fecha y sustituta) → `api-contract: lists GET /api/recurring-expenses under the retired routes` (`src/retired-routes.docs.test.ts`); y el bloque final de `the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses`.
- Acceptance 4 (README, ADR-037/041, roadmap) → editado a mano; README y contrato los cubren los dos tests de arriba. Las notas de ADR y el roadmap no tienen test (como en las features anteriores).
- Acceptance 5 (sin migración) → `git status --short prisma` vacío.
- Acceptance 6 (lista de árbol de `architecture.test.ts`) → no tenía archivos del módulo; nada que quitar.

## Sugerencias fuera de scope (NO aplicadas)

- `transferWords` (`src/modules/transfers/transfers.service.ts:68`) se exportó para la F58 y ya solo lo usa su propio archivo. Se podría dejar de exportar; no lo he cambiado porque la feature pide no tocar nada que no sea la ruta.
