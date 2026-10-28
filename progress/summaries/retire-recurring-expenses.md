# Resumen — feature 64 `retire-recurring-expenses`

Fecha de cierre: 2026-10-25
Intención original: `feature_list.json` → feature `retire-recurring-expenses`, bloque `intent`
Spec (si SDD): no es SDD (flujo simple)

## Qué hace ahora la app que antes no

Ya no existe `GET /api/recurring-expenses`: una petición a esa ruta responde 404. La ha sustituido `GET /api/expenses-by-category` (feature 63), que el frontend ya usa desde su feature 37. Se ha borrado el módulo entero con sus tests, y el contrato la pone en «Rutas retiradas». Las demás rutas y sus sumas responden igual que antes. No hay migración.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| La prueba de que `GET /api/recurring-expenses` responde 404 y de que su carpeta ya no existe | [architecture.test.ts:828](../../src/architecture.test.ts#L828) |
| La ruta en «Rutas retiradas» del contrato (fila 9) | [api-contract.md:65](../../docs/api-contract.md#L65) |
| La prueba de que el contrato la lista como retirada y no la nombra como vigente en ningún otro sitio | [retired-routes.docs.test.ts:177](../../src/retired-routes.docs.test.ts#L177) |
| La consulta que la sustituye, sin cambios | [expenses-by-category.service.ts:155](../../src/modules/expenses-by-category/expenses-by-category.service.ts#L155) |

## Dónde está el código

### Lo que se quitó

| Qué hace | Dónde |
| --- | --- |
| El registro de la ruta y su `import` | [app.ts](../../src/app.ts) → `buildApp` |
| Toda la carpeta `src/modules/recurring-expenses/` (rutas, esquema, servicio, tipos y sus dos tests) | borrada |
| El comentario que nombraba la ruta como una de las que usan `isCountedExpense` (no cambia código) | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `isCountedExpense` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| 404 con `NOT_FOUND`, y que la carpeta del módulo ya no existe | [architecture.test.ts](../../src/architecture.test.ts) → `retired route of feature 64` / `GET /api/recurring-expenses responds 404` |
| La fila 9 de «Rutas retiradas», con la fecha y la ruta que la sustituye; ninguna sección, enlace ni línea fuera de ahí que la presente como vigente | [retired-routes.docs.test.ts](../../src/retired-routes.docs.test.ts) → `api-contract: lists GET /api/recurring-expenses under the retired routes` |
| La sección de `GET /api/expenses-by-category` dice que sustituye a la ruta retirada (solo cambió ese bloque final) | [expenses-by-category.docs.test.ts](../../src/modules/expenses-by-category/expenses-by-category.docs.test.ts) → `the contract describes GET /api/expenses-by-category and what happens to GET /api/recurring-expenses` |
| Las tres sumas de las cuentas propias: la tercera es ahora `GET /api/expenses-by-category` del mes del test (`360.00` y `144.00`, iguales a la diferencia de `GET /api/overview`) | [own-accounts.totals.test.ts](../../src/modules/own-accounts/own-accounts.totals.test.ts) → `byCategory`, `threeSums` |
| El contrato nombra `GET /api/expenses-by-category` en la regla de las cuentas propias, y su sección enlaza a ella | [own-accounts.docs.test.ts](../../src/modules/own-accounts/own-accounts.docs.test.ts) |

### Documentos

| Qué cambia | Dónde |
| --- | --- |
| Se quita la sección de la ruta; aviso de breaking change y fila 9 en «Rutas retiradas»; se reescriben las frases de §Movimientos entre tus cuentas en las sumas y de §`GET /api/expenses-by-category` | [api-contract.md](../../docs/api-contract.md) |
| Se quitan su fila de endpoints y su línea en el árbol de `modules/`; aviso de breaking change de la F64 | [README.md](../../README.md) |
| Nota de revisión de la F64 al principio de ADR-037, ADR-040 y ADR-041 (no se ha borrado ninguno) | [architecture.md](../../docs/architecture.md) |
| Cabo suelto 29 cerrado; la fila E7 recoge la F64 | [roadmap.md](../../docs/roadmap.md) |

## Cumplimiento de la intención

- ✅ «GET /api/recurring-expenses responde 404.» → lo verifica `GET /api/recurring-expenses responds 404`. Check: ✅ `pnpm exec vitest run -t "GET /api/recurring-expenses responds 404" | grep -E "Tests +1 passed"` (`Tests 1 passed | 1486 skipped`). Check añadido: ✅ `test ! -d src/modules/recurring-expenses`.
- ✅ «GET /api/expenses-by-category sigue respondiendo igual.» → `expenses-by-category.test.ts` no ha cambiado. Check: ✅ `pnpm exec vitest run src/modules/expenses-by-category` (14 de 14 tests).
- ✅ «docs/api-contract.md la lista en «Rutas retiradas».» → lo verifica `api-contract: lists GET /api/recurring-expenses under the retired routes`. Check: ✅ (`Tests 1 passed | 1486 skipped`).
- ✅ «La suite pasa.» → Check: ✅ `pnpm test`. `./init.sh` en verde: 1487 de 1487 tests.

## Decisiones que se tomaron por ti

- En `own-accounts.totals.test.ts`, la tercera de las «tres sumas» pasa de la ruta retirada a `GET /api/expenses-by-category` del mismo mes. Por eso cambian dos cifras esperadas: antes eran la media mensual de 12 meses (`30.00`, `12.00`) y ahora son lo del mes (`360.00`, `144.00`). La otra opción era quitar esa tercera suma. Si la prefieres, es un cambio de pocas líneas.

## Qué NO se tocó / quedó fuera

- La base de datos y `prisma/schema.prisma`: sin migración.
- Lo que el módulo retirado usaba de otros (`isCountedExpense`, `readOwnership`, `transferWords`) sigue donde estaba y sin cambios.
- Los resúmenes de las features 58, 59 y 63 en `progress/summaries/` siguen contando la ruta como estaba entonces. Son historia.

## Notas para el futuro (opcional)

- `transferWords` (`src/modules/transfers/transfers.service.ts`) se exportó para la F58 y ya solo lo usa su propio archivo. Se podría dejar de exportar (sugerencia del implementer, no aplicada).
