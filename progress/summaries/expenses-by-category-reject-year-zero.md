# Resumen — feature 65 `expenses-by-category-reject-year-zero`

Fecha de cierre: 2026-11-02
Intención original: `feature_list.json` → feature `expenses-by-category-reject-year-zero`, bloque `intent`
Spec: no (flujo simple)

## Qué hace ahora la app que antes no

`GET /api/expenses-by-category` solo acepta `year` y `month` con años desde el 2000. Un
año anterior (también el `0000`) se responde con `400 VALIDATION_ERROR`, igual que un
parámetro mal escrito. Antes el `0000` pasaba la validación, y el `0001` o cualquier mes
con año por debajo de 1000 respondían 500.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/expenses-by-category?year=` / `?month=` — la ruta | [expenses-by-category.routes.ts:32](../../src/modules/expenses-by-category/expenses-by-category.routes.ts#L32) |
| Los patterns de `month` y `year` (años desde el 2000) | [expenses-by-category.schema.ts:78](../../src/modules/expenses-by-category/expenses-by-category.schema.ts#L78) |

## Dónde está el código

### Validación de parámetros

| Qué hace | Dónde |
| --- | --- |
| `month` = `^[2-9]\d{3}-(0[1-9]\|1[0-2])$`, `year` = `^[2-9]\d{3}$`; lo que no encaja es `400 VALIDATION_ERROR` del manejador central | [expenses-by-category.schema.ts](../../src/modules/expenses-by-category/expenses-by-category.schema.ts) → `getExpensesByCategorySchema` (`querystring`) |

`resolvePeriods` no cambia: los años anteriores al 2000 ya no le llegan.

### Tests

| Qué cubre | Dónde |
| --- | --- |
| `year=0000` → 400, con el mismo formato que `year=20x6` | [expenses-by-category.test.ts](../../src/modules/expenses-by-category/expenses-by-category.test.ts) → `year=0000 responds 400 VALIDATION_ERROR, like a malformed year` |
| `month=0000-01`, `-06`, `-12`, con y sin `compare` → 400 | [expenses-by-category.test.ts](../../src/modules/expenses-by-category/expenses-by-category.test.ts) → `month=0000-01 responds 400 VALIDATION_ERROR, and so does every month of the year 0000` |
| `1999`, `1999-12`, `0001`, `0001-01`, `0999`, `0999-02`, `1000`, `1000-06` → 400 | [expenses-by-category.test.ts](../../src/modules/expenses-by-category/expenses-by-category.test.ts) → `year=1999 and month=1999-12 respond 400 VALIDATION_ERROR, like every year before 2000` |
| `year=2000`, `month=2000-01` (y con `same-month-last-year`) → 200, comparando con 1999 | [expenses-by-category.test.ts](../../src/modules/expenses-by-category/expenses-by-category.test.ts) → `year=2000 and month=2000-01 respond 200` |

### Documentos

| Qué dice | Dónde |
| --- | --- |
| Parámetros `month` y `year` desde el 2000, y la fila del `400` | [api-contract.md](../../docs/api-contract.md) → `GET /api/expenses-by-category` |
| Cabo 30 cerrado por la F65 | [roadmap.md](../../docs/roadmap.md) → fila 30 |

## Cumplimiento de la intención

- ✅ "year=0000 responde 400 VALIDATION_ERROR." → lo verifica `year=0000 responds 400 VALIDATION_ERROR, like a malformed year`.
  Check: ✅ `-t "year=0000 responds 400"` (1 passed).
- ✅ "month=0000-01 responde 400 VALIDATION_ERROR." → lo verifica `month=0000-01 responds 400 VALIDATION_ERROR, and so does every month of the year 0000`.
  Check: ✅ `-t "month=0000-01 responds 400"` (1 passed).
- ✅ "year=1999 y month=1999-12 responden 400 VALIDATION_ERROR." → lo verifica `year=1999 and month=1999-12 respond 400 VALIDATION_ERROR, like every year before 2000`.
  Check: ✅ `-t "year=1999 and month=1999-12 respond 400"` (1 passed).
- ✅ "year=2000, month=2000-01 y los años reales siguen respondiendo 200 como hoy." → lo verifica `year=2000 and month=2000-01 respond 200`, y los tests de la F63 siguen sin cambios.
  Check: ✅ `pnpm exec vitest run src/modules/expenses-by-category` (18 passed).
- ✅ "La suite pasa." → Check: ✅ `pnpm test` (91 archivos, 1491 tests).

## Decisiones que se tomaron por ti

- Qué responde: `400 VALIDATION_ERROR` (decidido por el leader, aprobado).
- Años válidos: desde el 2000 (aprobado el 2026-11-02; sustituye a «desde el 0001», que
  ya respondía 500).

## Qué NO se tocó / quedó fuera

- `resolvePeriods` y ninguna otra ruta ni schema.

## Notas para el futuro

- El implementer anota que `src/modules/overview/overview.schema.ts` y
  `src/modules/investments/investments.schema.ts` aceptan `month` con cualquier año de
  cuatro cifras; no se ha comprobado qué responden con `0000-01` o `0001-01`.
