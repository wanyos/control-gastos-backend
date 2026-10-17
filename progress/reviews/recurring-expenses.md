# Review — feature 58 `recurring-expenses`

## Review (2026-10-17)

**Veredicto:** APPROVED
Comprobado: requirements ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C8 (C4 bis no aplica: la consulta solo lee la base que escribe el
propio importador; la prueba con datos reales es del humano, `decisions.md` 📌).
Checks: 15 de 15 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/recurring-expenses.md`.

### Con qué comando y qué salió

- `./init.sh` (lanzado una vez, sin otra pasada a la vez) → exit 0:
  `Type check OK`, `OK: pnpm run lint`, `OK: pnpm run format:check`,
  `Test Files 85 passed (85)`, `Tests 1439 passed (1439)`, `Entorno listo`.
- `./init.sh --checks` (después, sin otra pasada a la vez) → exit 0,
  `Checks: 15 de 15 en verde`. Los 13 que filtran por nombre imprimen
  `Tests 1 passed | 22 skipped (23)`, y el del contrato `Tests 1 passed (1)`: todos
  ejecutaron su test. El 15 es `pnpm test` entero, sin filtro.
- Los 15 `checks` coinciden con las 10 filas de la tabla 🧪 de `decisions.md`, sin
  ninguno de más ni aflojado.

### Lo que se pidió mirar en especial, sin hallazgos

- **Trazabilidad**: R1-R15 tienen al menos un test que comprueba el valor exacto
  (leídos en `recurring-expenses.test.ts` y `recurring-expenses.docs.test.ts`);
  `tasks.md` T1-T7 en `[x]`.
- **Archivos por lote**: los cambiados (`git status`) son exactamente la unión de los
  `Archivos:` de los lotes A y B, más `feature_list.json` (solo líneas añadidas),
  `progress/` y `specs/`.
- **No escribe**: el servicio solo hace dos `findMany` y `readDepositMovements`; el
  test `writes nothing in the database while answering` compara recuento y
  `max(updatedAt)` de `Movement`, `Account` y `CategoryRule` y todas las filas de
  `Category` antes y después.
- **`computeTotals`**: con la rama de depósito delante, `isCountedExpense` es la
  misma condición que la cadena anterior para sumar a `expense`; ningún test
  existente se ha tocado (`git status`) y la suite pasa.
- **Fuera traspasos emparejados, `excludedFromTotals`, depósitos, `productId`,
  ingresos y neutrales**: test `leaves out paired transfers, movements excluded from
  totals and deposit movements`.
- **Las cuatro decisiones del humano**: recibo de un solo cargo como entrada propia;
  anual, dos veces al mes y cada dos meses con su test; subida de un céntimo
  `hasIncreased: true` sin umbral (y bajada de un céntimo `false`); transferencia y
  bizum en `transfersToPeople` y sumados en `monthlyTotal`.
- **Ni categorías ni reglas**: ninguna escritura en el código; el test de categorías
  cuenta las filas antes y después.
- **`docs/api-contract.md:1500`** describe lo que hace el código (reglas de cada grupo,
  `key`, periodo, `monthlyCost`, `monthlyTotal`, orden, respuesta vacía); las sumas
  del ejemplo cuadran.
- **`docs/lessons.md`** #2 (sin columnas nuevas) y #3 (sin fixtures `.xls`/`.pdf`):
  no se repiten. `src/no-real-data.test.ts` en verde; los datos de los tests son
  inventados.
- **Vocabulario**: ningún término nuevo; «recibo», «transferencias a personas» y
  «gasto variable» son las palabras del humano en el handoff, y los nombres de la API
  los aprobó en la hoja (⚙️ 1). `docs/vocabulary.md` sin cambios.
- **Documentos que la feature vuelve falsos**: `git grep` de `transferWords`,
  `isCountedExpense` y `recurring` fuera de `progress/` y `specs/` solo da líneas
  nuevas y ciertas.
