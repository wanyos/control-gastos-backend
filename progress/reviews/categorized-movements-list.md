# Review — feature 56 `categorized-movements-list`

## Review (2026-10-13)

**Veredicto:** APROBADO (APPROVED)
Comprobado: acceptance ↔ tests, arquitectura, convenciones, verificación,
`docs/lessons.md`, vocabulario, CHECKPOINTS C1-C6 y C8 (C4 bis y C7 no aplican: la
feature no lee datos de fuera y no tiene spec). Checks: 7 de 7 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/categorized-movements-list.md`.

### Qué ejecuté y qué salió

`./init.sh` → código de salida 0:

```
── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (56 features)
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Lint y formato ───────────────────────────────────
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
── 6. Ejecutando tests ─────────────────────────────────
 Test Files  77 passed (77)
      Tests  1358 passed (1358)
[OK]    Todos los tests pasan
── 7. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

`./init.sh --checks` → código de salida 0. Cada check que filtra por nombre muestra
un test ejecutado:

```
[INFO]  Feature: F56 categorized-movements-list
[1] … -t "lists exactly the movements the run categorized, as many as categorized says"
[OK]        exit 0      Tests  1 passed | 17 skipped (18)
[2] … -t "answers each categorized movement with its id, description, date, amount, type, category and matching rules"
[OK]        exit 0      Tests  1 passed | 14 skipped (15)
[3] … -t "every listed movement reads back from GET /api/movements with the category the list says"
[OK]        exit 0      Tests  1 passed | 14 skipped (15)
[4] … -t "a second run right after answers categorized 0 and an empty list"
[OK]        exit 0      Tests  1 passed | 14 skipped (15)
[5] … -t "api-contract: describes categorizedMovements in apply and in the import report"
[OK]        exit 0      Tests  1 passed (1)
[6] … -t "carries the categorized movements list inside categorization"
[OK]        exit 0      Tests  1 passed | 79 skipped (80)
[7] pnpm test
[OK]        exit 0
[OK]    Checks: 7 de 7 en verde.
```

`pnpm exec vitest run src/modules/category-rules/category-rules.service.test.ts --reporter=verbose`
→ `Tests  18 passed (18)`, con estas cuatro líneas entre ellas:

```
✓ … > lists exactly the movements the run categorized, as many as categorized says
✓ … > answers an empty list when the run writes nothing
✓ … > neither counts nor lists a movement another request changed before the write
✓ … > keeps in the list what was written before a failure half way
```

### Los puntos que pidió el leader, uno a uno

- **La lista cuadra con `categorized` en todos los caminos.** Leído en
  `src/modules/category-rules/category-rules.service.ts:225-246`: el contador suma
  `count` y el elemento se añade solo si `count === 1`; el `where` de la escritura
  lleva `id`, así que `count` es 0 o 1. Los tres caminos tienen test que falla si la
  lista y el contador se separan: escritura que no llega a hacerse
  (`category-rules.service.test.ts`, `neither counts nor lists…`: espera
  `categorized` 1 y la lista con un solo id, con dos movimientos que casan), fallo
  en la segunda escritura (`keeps in the list…`: `error` presente, `categorized` 1,
  lista de 1, y en la base el segundo movimiento sigue con `categoryId` a `null`), y
  fallo en la lectura (`never throws…`: `[]`). Los cuatro pasan (comando de arriba).
- **Cada test de los `checks` comprueba lo que dice su `descripcion`.** El del check
  3 pide `GET /api/movements?accountId=…` y compara, para cada elemento de la lista,
  el `categoryId` leído con el de la lista; un movimiento que faltara en la lectura
  da `undefined` y el test falla. El del check 5 analiza el JSON del ejemplo del
  contrato (orden de claves, `amount` con dos decimales, `bookingDate`
  `YYYY-MM-DD`, lista tan larga como `categorized`), exige una fila de tabla por
  campo y la frase «**Viaja también aquí**» en la fila de `POST /api/import`.
  **No lo he hecho fallar yo**: lo que comprobé es que
  `git show HEAD:docs/api-contract.md | grep -c categorizedMovements` da `0`, así
  que con el documento anterior la comparación de claves del ejemplo no puede pasar.
- **Nada más cambió al aplicar las reglas.** `git diff -- src | grep -E '^-[^-]'`
  devuelve ocho líneas quitadas: dos comentarios de cabecera, el `select` (gana
  `amount`), las tres líneas de `categoryId` → `winner`, un `import type`, y una
  línea de `import.service.test.ts` que se reescribe con `categorizedMovements: []`.
  El `where` de la lectura, el `where` y el `data` de la escritura son los mismos.
  Los tres `toEqual` que ganaron `categorizedMovements: []` son solo eso
  (`category-rules.service.test.ts:333`, `import.service.test.ts:734` y `:2649`).
  Los tests de la feature 43 (R6 a R14) pasan sin cambios.
- **El contrato.** `docs/api-contract.md:622-720` describe el campo con ejemplo y
  tabla campo a campo; `:2081` dice de forma explícita que viaja también en
  `categorization` de `POST /api/import`, y el ejemplo de `:1930` lo trae. Nombres y
  formatos coinciden con el código.
- **`amount`.** `movement.amount.toFixed(2)` en `category-rules.service.ts:240`, la
  misma expresión que `movements.service.ts:440` (lo que devuelve
  `GET /api/movements`). El test del check 2 siembra `63.8` y recibe `"63.80"`.
- **Fixtures.** Conceptos, importes y nombres inventados, cuentas con
  `syntheticIban()`, base de test desechable. `src/no-real-data.test.ts` pasa dentro
  de la suite.

### Comprobado sin hallazgos

acceptance 1-12 ↔ tests; capas y dependencias; estilo, nombres y comentarios; sin
`console.log` ni `TODO`; sin dependencias ni migraciones nuevas; documentos fuera de
`progress/` y `specs/` que nombran la ruta o sus campos (`README.md:78`,
`docs/data-model.md:285` siguen siendo ciertos); lecciones 1-3 de `docs/lessons.md`
(ninguna aplica: no hay columna nueva ni fixture `.xls`/`.pdf`); una sola feature
`in_progress`; sin archivos sin trackear fuera de los dos de la feature.
