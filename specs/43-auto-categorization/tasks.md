# Tasks — F43 `auto-categorization`

> Cuatro lotes. B y C no comparten archivos y pueden correr en paralelo una vez
> A esté en verde. D cierra con la documentación.

## Lote A — migración, módulo de reglas y pasada
Archivos: `prisma/schema.prisma`, `prisma/migrations/*`,
`src/modules/category-rules/category-rules.routes.ts`,
`src/modules/category-rules/category-rules.schema.ts`,
`src/modules/category-rules/category-rules.service.ts`,
`src/modules/category-rules/category-rules.types.ts`,
`src/modules/category-rules/category-rules.seed.ts`,
`src/modules/category-rules/category-rules.service.test.ts`,
`src/modules/category-rules/category-rules.routes.test.ts`,
`prisma/seed-category-rules.ts`, `package.json`, `src/app.ts`
Depende de: —

- [x] T1 — Modelo `CategoryRule` (+ relación inversa en `Category`) y su
      migración; aplicada sobre base limpia crea la tabla sin error. Cubre: R1.
- [x] T2 — `normalizeForMatch` y el predicado de casado (contiene + kind), con
      tests unitarios de mayúsculas, tildes y kind cruzado. Cubre: R6.
- [x] T3 — CRUD: servicios, esquemas AJV estrictos y rutas
      (`POST`/`GET`/`PATCH`/`DELETE /api/category-rules`), registro en
      `src/app.ts`. Cubre: R1, R2, R3, R4, R5.
- [x] T4 — Tests de rutas del CRUD: alta con categoría embebida, 404/400/409,
      PATCH parcial, DELETE 204 sin tocar movimientos. Cubre: R1, R2, R3, R4, R5.
- [x] T5 — `applyCategoryRules`: elegibilidad en el WHERE, asignación con
      re-chequeo concurrente, conflictos y no-casados al resultado, nunca
      lanza. Tests: asigna única, protege categorizado/confirmado/neutral,
      conflicto no asigna y sale listado, sin casar queda NULL, segunda pasada
      asigna 0, solo cambia `categoryId` (comparación de fila entera y de
      totales antes/después). Cubre: R7, R8, R9, R10, R11, R14.
- [x] T6 — `POST /api/category-rules/apply` con test de respuesta 200 y forma
      del resultado. Cubre: R13.
- [x] T7 — `defaultCategoryRules` (borrador de arranque, restricciones del
      design §5), `seedDefaultCategoryRules`, envoltorio CLI y script npm;
      tests de idempotencia y de categoría ausente reportada. Cubre: R15, R2.

## Lote B — guarda de borrado en categorías
Archivos: `src/modules/categories/categories.service.ts`,
`src/modules/categories/categories.test.ts`
Depende de: Lote A

- [x] T8 — `deleteCategory` rechaza con 409 (y el nº de reglas) una categoría
      referenciada por reglas; test del 409 y de que sin reglas sigue igual.
      Cubre: R16.

## Lote C — encaje en la importación
Archivos: `src/modules/import/import.service.ts`,
`src/modules/import/import.local.service.ts`,
`src/modules/import/import.types.ts`,
`src/modules/import/import.service.test.ts`,
`src/modules/import/import.local.service.test.ts`
Depende de: Lote A

- [x] T9 — Campo `categorization` en `ImportRunResult` y `LocalImportRunResult`
      y llamada a la pasada tras `detectTransfers` en las dos vías; tests: el
      informe trae el resultado (con ceros cuando no hay nada) y un fallo de la
      pasada viaja en `error` sin tumbar la importación. Cubre: R12.

## Lote D — documentación
Archivos: `docs/api-contract.md`, `docs/data-model.md`
Depende de: Lotes A, B, C

- [x] T10 — `api-contract.md`: los 5 endpoints de `/api/category-rules`, el
      campo `categorization` del informe (ambas vías) y el 409 nuevo de
      `DELETE /api/categories/:id`. Cubre: R1–R5, R10, R12, R13, R16.
- [x] T11 — `data-model.md`: tabla `CategoryRule` y actualización de «Columnas
      reservadas» (`categoryId` gana su escritor automático). Cubre: R15.
