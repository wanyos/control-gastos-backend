# Tasks — F37 `categories-and-tagging`

> Cuatro lotes. A, B y C no comparten archivos y pueden implementarse en
> paralelo; D los cierra. Cada test nuevo debe mapearse a su R en
> `progress/categories-and-tagging.md` (§Trazabilidad).

## Lote A — renombrar y borrar categorías
Archivos: `src/modules/categories/categories.routes.ts`,
`src/modules/categories/categories.schema.ts`,
`src/modules/categories/categories.service.ts`,
`src/modules/categories/categories.types.ts`,
`src/modules/categories/categories.test.ts`
Depende de: —

- [x] T1 — `renameCategory` en el servicio: trim, 404 si no existe, 409 en
      P2002; solo cambia `name`. Cubre: R3, R4, R11.
- [x] T2 — `deleteCategory` en el servicio: 404 si no existe; 409 con el
      recuento de movimientos si tiene movimientos o hijas; borra si está
      libre. Cubre: R5, R6, R11.
- [x] T3 — Esquemas y rutas `PATCH /api/categories/:id` (body solo `name`,
      `additionalProperties: false`) y `DELETE /api/categories/:id` (204).
      Cubre: R3, R5, R12.
- [x] T4 — Tests: renombrar ok / nombre duplicado 409 / id inexistente 404 /
      body con `kind` u otra propiedad extra 400 / name vacío 400. Cubre: R3,
      R4, R11, R12.
- [x] T5 — Tests: borrar categoría libre 204 sin tocar movimientos / borrar
      con movimientos 409 (y el movimiento sigue intacto) / borrar con hija
      409. Cubre: R5, R6.
- [x] T6 — Test de no-regresión explícito: `POST` y `GET` de categorías siguen
      respondiendo igual que antes (la suite existente en verde vale como
      cobertura; añadir aserción solo si algún test viejo no cubre el 201/200).
      Cubre: R1, R2.

## Lote B — categoría y estado de un movimiento
Archivos: `src/modules/movements/movements.routes.ts`,
`src/modules/movements/movements.schema.ts`,
`src/modules/movements/movements.service.ts`,
`src/modules/movements/movements.types.ts`,
`src/modules/movements/movements.test.ts`
Depende de: —

- [x] T7 — `updateMovement` en el servicio con el orden de validaciones del
      design §3; `data` del update lleva exclusivamente `categoryId`/`status`.
      Cubre: R7, R8, R9, R10, R11, R15.
- [x] T8 — `updateMovementSchema` (`minProperties: 1`,
      `additionalProperties: false`, `categoryId` entero≥1|null, `status`
      enum) y ruta `PATCH /api/movements/:id`; reescribir el comentario
      «READ-ONLY» de la ruta según design §1. Cubre: R7, R10, R12.
- [x] T9 — Tests de asignar/quitar: categoría compatible 200 con `category`
      embebida / `categoryId: null` 200 / categoría inexistente 404 /
      movimiento inexistente 404. Cubre: R7, R8, R11.
- [x] T10 — Tests de compatibilidad: categoría `income` sobre movimiento
      `expense` 400 / cualquier categoría sobre un `neutral` 400. Cubre: R9.
- [x] T11 — Tests de estado: `pending_review → confirmed` y vuelta, 200 los
      dos; body `{}` 400; body con `amount` u otro campo extra 400. Cubre:
      R10, R12.
- [x] T12 — Test de efectos colaterales: tras categorizar y confirmar un
      movimiento, sus demás campos, el `balance` de su cuenta
      (`GET /api/accounts/:id`) y los `totals` de `GET /api/movements` son
      idénticos a los previos. Cubre: R15.

## Lote C — siembra de la lista de arranque
Archivos: `src/modules/categories/categories.seed.ts`,
`src/modules/categories/categories.seed.test.ts`,
`prisma/seed-categories.ts`, `package.json`
Depende de: —

- [x] T13 — `defaultCategories` (las 16 del intent, literales, todas raíz) y
      `seedDefaultCategories` con `createMany` + `skipDuplicates`. Cubre: R13,
      R14.
- [x] T14 — Envoltorio CLI `prisma/seed-categories.ts` y script
      `"seed:categories"` en `package.json`. Cubre: R13.
- [x] T15 — Tests: primera ejecución crea exactamente 16 con su `kind` y
      `parentId: null`; segunda ejecución `created: 0` y las filas existentes
      idénticas (mismo `id`, mismo `name`). Cubre: R13, R14.

## Lote D — documentación
Archivos: `docs/api-contract.md`, `docs/data-model.md`
Depende de: Lote A, Lote B, Lote C

- [x] T16 — Contrato: documentar `PATCH /api/categories/:id`,
      `DELETE /api/categories/:id` y `PATCH /api/movements/:id` con sus tablas
      de errores; actualizar las notas «hoy siempre `null`» de
      `category`/`categoryId`, la nota de solo-lectura de movimientos (sigue
      sin `POST`/`DELETE`) y mencionar el comando de siembra. Cubre: R3, R5,
      R7, R10, R13.
- [x] T17 — Modelo: actualizar las filas `categoryId` y `status` de «Columnas
      reservadas» (escritor manual F37; el automático por reglas sigue
      pendiente) y la línea de categorías en §Reglas de negocio. Cubre: R7,
      R10, R13.
