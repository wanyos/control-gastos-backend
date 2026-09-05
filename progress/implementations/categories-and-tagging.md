# categories-and-tagging — implementación

> Implementer, 2026-09-02. Spec: `specs/37-categories-and-tagging/`. Las cifras
> de los tests son inventadas (regla de fixtures).

## Archivos modificados / creados

- [`src/modules/categories/categories.schema.ts`](../../src/modules/categories/categories.schema.ts) — `renameCategorySchema`, `deleteCategorySchema`, `renameCategoryBodyProperties`.
- [`src/modules/categories/categories.service.ts`](../../src/modules/categories/categories.service.ts) — `renameCategory` (trim, 404, P2002→409) y `deleteCategory` (404; 409 con el recuento si tiene movimientos o hijas).
- [`src/modules/categories/categories.routes.ts`](../../src/modules/categories/categories.routes.ts) — `PATCH /:id` y `DELETE /:id` (204).
- [`src/modules/categories/categories.types.ts`](../../src/modules/categories/categories.types.ts) — `RenameCategoryBody`, `CategoryIdParams`.
- [`src/modules/categories/categories.test.ts`](../../src/modules/categories/categories.test.ts) — describe nuevo «rename and delete category routes (feature 37)» (12 tests).
- [`src/modules/movements/movements.schema.ts`](../../src/modules/movements/movements.schema.ts) — `updateMovementSchema` (`minProperties: 1`, `additionalProperties: false`, `categoryId` entero≥1|null, `status` enum), `updateMovementBodyProperties`.
- [`src/modules/movements/movements.service.ts`](../../src/modules/movements/movements.service.ts) — `updateMovement` con el orden de validaciones del design §3; el `data` del update solo puede llevar `categoryId`/`status`.
- [`src/modules/movements/movements.routes.ts`](../../src/modules/movements/movements.routes.ts) — `PATCH /:id`; comentario «READ-ONLY» reescrito según design §1.
- [`src/modules/movements/movements.types.ts`](../../src/modules/movements/movements.types.ts) — `UpdateMovementBody`, `MovementIdParams`.
- [`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts) — describe nuevo «PATCH /api/movements/:id …» (11 tests).
- [`src/modules/categories/categories.seed.ts`](../../src/modules/categories/categories.seed.ts) — `defaultCategories` (las 16 literales) y `seedDefaultCategories` (`createMany` + `skipDuplicates`).
- [`src/modules/categories/categories.seed.test.ts`](../../src/modules/categories/categories.seed.test.ts) — 4 tests de la siembra.
- [`prisma/seed-categories.ts`](../../prisma/seed-categories.ts) — envoltorio CLI (crea el cliente como `src/lib/prisma.ts`, imprime `{created, skipped}`, desconecta).
- [`package.json`](../../package.json) — script `"seed:categories": "tsx prisma/seed-categories.ts"`.
- [`src/lib/strict-body.ts`](../../src/lib/strict-body.ts) — **nuevo**, ver desviación 1.
- [`docs/api-contract.md`](../../docs/api-contract.md) — secciones `PATCH /api/categories/:id`, `DELETE /api/categories/:id`, `PATCH /api/movements/:id`; nota de la lista de arranque y su comando; filas `categoryId`/`category`/`status` del modelo `Movement`; la nota de solo-lectura de movimientos reescrita (sigue sin `POST`/`DELETE`); fila `CONFLICT` de la tabla de códigos.
- [`docs/data-model.md`](../../docs/data-model.md) — filas `categoryId` y `status` de «Columnas reservadas» (escritor manual F37, tachadas como las demás; el automático por reglas sigue pendiente) y la línea «Categorías» de §Reglas de negocio.
- `specs/37-categories-and-tagging/tasks.md` — T1–T17 marcadas `[x]`.

## Decisiones tomadas

Ninguna de producto: todo dentro del marco de `decisions.md`. Dos desviaciones
técnicas del design, abajo.

## Desviaciones del design (con motivo)

1. **El rechazo de propiedades no admitidas en un body no lo puede hacer el
   esquema solo.** Comprobado ejecutando los tests (2026-09-02): el AJV por
   defecto de Fastify corre con `removeAdditional`, así que
   `additionalProperties: false` **descarta en silencio** la propiedad extra en
   vez de fallar — un `PATCH` con `{ amount }` salía 200 ignorando el campo, y
   un rename con `kind` salía 200 renombrando. Como R12 exige 400, añadí
   [`src/lib/strict-body.ts`](../../src/lib/strict-body.ts)
   (`assertOnlyAllowedBodyProperties`) y los dos `PATCH` lo llaman en un hook
   `preValidation` (antes de que el esquema pueda descartar nada), con la lista
   admitida **derivada del propio esquema** para que no puedan divergir. No se
   cambió la configuración global de AJV: el comportamiento documentado de la
   F36 («un parámetro de querystring desconocido se ignora») queda intacto.
2. **⚠️ La siembra real ya está ejecutada, y la ejecuté yo por accidente.** Al
   verificar la salida de fallo del CLI lo lancé con `env -u DATABASE_URL`, pero
   el script carga `.env` (`dotenv/config`, igual que `src/server.ts`) y corrió
   contra la base `gastos` del humano: `created 16, skipped 0`. No lo revertí:
   borrar filas de su base sería peor, y el resultado es exactamente el que su
   deber de `decisions.md` §📌 iba a producir. Lo verifiqué re-ejecutando
   `pnpm run seed:categories`: `created 0, skipped 16` (idempotencia confirmada
   contra la base real; `createMany` solo inserta, jamás toca una fila). **Su
   deber de ejecutar el comando queda hecho**; si lo ejecuta igualmente, no pasa
   nada.

## Trazabilidad

Tests de `src/modules/categories/categories.test.ts` salvo indicación:

- R1 → `keeps POST 201 and GET 200 responding exactly as before (R1, R2)` (más la suite F8 existente, en verde)
- R2 → el mismo, y `GET /api/categories returns roots with their children embedded (R26)` (existente)
- R3 → `PATCH /api/categories/:id renames and changes nothing else (R3)`
- R4 → `PATCH /api/categories/:id colliding with a sibling name returns 409 untouched (R4)` · `allows the same name again for a different kind (R4)`
- R5 → `DELETE /api/categories/:id removes a free category and no movement (R5)`
- R6 → `DELETE /api/categories/:id with movements returns 409 with their count (R6)` · `… with subcategories returns 409 (R6)`
- R7 → `movements.test.ts` › `assigns a compatible category and embeds it in the response (R7)` · `takes categoryId and status together in one request (R7, R10)`
- R8 → `movements.test.ts` › `removes the category with categoryId: null (R8)`
- R9 → `movements.test.ts` › `rejects an income category on an expense movement with 400 (R9)` · `rejects any category on a neutral movement with 400 (R9)`
- R10 → `movements.test.ts` › `confirms a movement and takes it back to pending_review (R10)`
- R11 → `PATCH /api/categories/:id of an unknown id returns 404 (R11)` · `DELETE /api/categories/:id of an unknown id returns 404 (R11)` · `movements.test.ts` › `answers 404 for a categoryId that does not exist, without modifying (R11)` · `answers 404 for a movement that does not exist (R11)`
- R12 → `PATCH /api/categories/:id rejects kind, extra properties and an empty body (R12)` · `… rejects an empty and a whitespace-only name (R12)` · `movements.test.ts` › `rejects an empty body and an unknown status with 400 (R12)` · `rejects amount or any other property of the bank fact with 400 (R12, R15)`
- R13 → `categories.seed.test.ts` › `declares exactly the 16 of the intent: 13 expense and 3 income, verbatim` · `creates the 16 as roots with their kind on a base without them (R13)`
- R14 → `categories.seed.test.ts` › `creates 0 on a second run and leaves the existing rows identical (R14)` · `creates only what is missing when some of the 16 already exist (R14)`
- R15 → `movements.test.ts` › `changes nothing else: fields, account balance and totals stay identical (R15)` (compara campo a campo, el `balance` de `GET /api/accounts/:id` y los `totals` de `GET /api/movements` antes y después) · `rejects amount or any other property of the bank fact with 400 (R12, R15)`

## Último ./init.sh

Ejecutado completo el 2026-09-02 tras los cambios:

```
Test Files  53 passed (53)
     Tests  1041 passed (1041)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

(Lint y formato en `[OK]`; una pasada previa falló por 4 variables sin usar y
formato Prettier, arreglado antes de esta pasada final.)

## Sugerencias fuera de scope (NO aplicadas)

- `POST /api/accounts` y `POST /api/categories` comparten el mismo agujero de
  `removeAdditional` (una propiedad extra se descarta en silencio en vez de dar
  400). Hoy no violan ningún requirement escrito, así que no los toqué; si se
  quiere el mismo trato estricto, es reutilizar `assertOnlyAllowedBodyProperties`
  en esas rutas.
