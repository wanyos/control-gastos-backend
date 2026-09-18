# movements-review-bulk — review (F47)

Revisado el 2026-09-18 sobre los tres lotes (A, B y C) descritos en
[`implementations/movements-review-bulk.md`](../implementations/movements-review-bulk.md),
contra [`specs/47-movements-review-bulk/`](../../specs/47-movements-review-bulk/).

## Review

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. [`docs/api-contract.md`](../../docs/api-contract.md) §`GET /api/movements`,
   nota «Cómo busca `q`», viñeta del recorte — dice: «Se le **recortan los
   espacios de los extremos** antes de buscar. Lo que quede después de recortar
   tiene que medir **entre 2 y 100 caracteres**; si no, **400**». **El tope
   superior no se mide después del recorte, se mide antes**, y esa frase es
   falsa en el caso `raw > 100` / `recortada ≤ 100`. Comprobado ejecutándolo
   (no leyéndolo), con una `q` de 99 caracteres más tres espacios al final
   (102 en crudo):

   ```
   GET /api/movements?q=<99 chars + 3 espacios>
   -> 400 {"statusCode":400,"code":"VALIDATION_ERROR",
           "message":"querystring/q must NOT have more than 100 characters"}
   ```

   Según el contrato esa petición tendría que responder 200 (99 caracteres una
   vez recortada). El límite inferior sí está implementado como el contrato
   dice —`'   a   '` da 400 con `"'q' must have at least 2 characters once
   trimmed"`, comprobado en la misma pasada—, así que **solo falla la mitad
   superior de la frase**. Dos formas de cerrarlo, a elección del implementer:
   - corregir la frase del contrato (mínimo 2 **después** del recorte, máximo
     100 **antes** del recorte), o
   - mover la comprobación de longitud entera detrás del `trim` en
     `listMovements` ([`movements.service.ts`](../../src/modules/movements/movements.service.ts),
     bloque `'q' must have at least 2 characters once trimmed`) y relajar el
     `maxLength` del esquema.

   No es un fallo de comportamiento (la respuesta es un 400 con mensaje claro),
   pero el contrato es el entregable de R15 y lo va a leer el frontend en su
   sesión: una frase del contrato que el código no cumple es exactamente lo que
   esta feature tenía que evitar.

### Comprobado sin hallazgos

#### Ejecución

- `./init.sh` completo, **en solitario** (nadie más corriendo, aviso del lote C
  respetado): exit **0**, `Type check OK`, `Lint OK`, `Formato OK`,
  **Test Files 72 passed (72)**, **Tests 1328 passed (1328)**. Coincide con lo
  que reportó el lote B.
- `npx vitest run src/modules/movements/ --reporter=verbose`: **110 tests en 3
  archivos, todos verdes**, incluidos uno a uno los tests nombrados `(R1)` …
  `(R14)` de la tabla de trazabilidad.
- **Comprobaciones propias en vivo** (script de un solo uso en el scratchpad,
  contra la base desechable `gastos_test_1`, **nunca** contra `gastos`; las
  filas creadas se borraron y la base quedó en `Movement 0 / Account 0 /
  Category 0`). Resultados literales:
  - `q='   a   '` → 400 `VALIDATION_ERROR`, `'q' must have at least 2 characters
    once trimmed` — **el punto fino del lote C: el 400 existe porque el servicio
    lo comprueba aparte, no por AJV.**
  - `categoryId=1&uncategorized=true` → 400 `VALIDATION_ERROR`,
    `'categoryId' and 'uncategorized' cannot be combined…`.
  - `PATCH /api/movements` con dos gastos y **un ingreso** y una categoría
    `expense` → 400 `VALIDATION_ERROR`,
    `Category kind 'expense' does not match the type of movement(s): 652`, y
    **releyendo las tres filas después**: `categoryId: null` y
    `status: 'pending_review'` en las tres, con el `updatedAt` original. Todo o
    nada confirmado sobre las filas, no sobre el código de estado.
  - El mismo `PATCH` sin el ingreso → 200 `{ updated: 2, movements: [...] }`, y
    las dos filas quedan con la categoría y `confirmed`, con `amount` y
    `description` idénticos.
  - `GET ?accountId=&categoryId=&pageSize=1` → `movements` trae **1** fila,
    `pagination.total: 2`, `totalPages: 2`, `totals.expense: '20.00'`: la página
    y los totales salen del mismo `where`.
  - Claves de un movimiento serializado: `id,type,bookingDate,valueDate,amount,
    description,balanceAfter,currency,note,accountId,categoryId,paymentMethod,
    origin,status,transferId,daySequence,createdAt,updatedAt,account,category`
    — **`descriptionSearch` no se filtra al contrato** y la forma de
    `GET /api/movements` (`{ movements, pagination, totals }`) está intacta.
- Base real del humano: **no se escribió en ella**. Lectura de control después
  de todo: `select count(*), count("descriptionSearch") from "Movement"` →
  `1607 | 1607`, lo mismo que reportó el lote A.

#### Trazabilidad requirements ↔ tests (los 15)

R1–R7 en [`movements.test.ts`](../../src/modules/movements/movements.test.ts),
R8–R13 en [`movements.bulk.test.ts`](../../src/modules/movements/movements.bulk.test.ts),
R14 en [`movements.search-column.test.ts`](../../src/modules/movements/movements.search-column.test.ts).
Los 14 primeros tienen test que **comprueba salida concreta contra PostgreSQL
real**, no «no lanza excepción»: cada test de rechazo de `PATCH /api/movements`
relee las filas, el de R7 asierta a la vez página, `pagination.total` y
`totals`, el de R13 compara doce columnas antes y después, y el de R6 distingue
`DESCUENTO 100% ONLINE` de `DESCUENTO 100 ONLINE` y `PAGO A_B ONLINE` de
`PAGO AXB ONLINE`. **R15 es el único sin test** —es prosa, y T13–T15 no lo
piden—; se ha verificado a mano contra el código, y de ahí sale el cambio
requerido de arriba.

#### El `intent` respetado y no ampliado

- No se puede editar importe, fecha ni descripción: el esquema del cuerpo lleva
  `additionalProperties: false`, el `preValidation` rechaza la propiedad
  desconocida antes de que AJV la borre, y el `data:` del `updateMany` solo
  monta `categoryId` y/o `status`.
- `GET /api/movements` conserva la forma `{ movements, pagination, totals }` y
  la lista exacta de claves de cada movimiento (comprobado arriba).
- `PATCH /api/movements/:id` no cambia ni un campo: `updateMovementSchema` y
  `updateMovement` intactos en el diff, y hay test de que sigue funcionando.
- No hay endpoint nuevo para crear reglas; solo `PATCH /` en
  [`movements.routes.ts`](../../src/modules/movements/movements.routes.ts).
- La operación en bloque es **solo por lista de ids** (🔴 #1 de `decisions.md`),
  sin variante por filtro.

#### Contrato ↔ código, fila a fila de la tabla del lote C

Las 12 filas contrastadas contra el código: tipos y límites de los tres
parámetros, coincidencia exacta de `categoryId` (sin `in` de subcategorías),
`uncategorized === true`, escape de `\`, `%` y `_`, búsqueda solo sobre
`description`, las dos validaciones previas, el cuerpo 1–200 sin repetidos, el
`preValidation`, `{ updated, movements }` con `updated === ids.length`,
transacción todo o nada con el `message` nombrando los ids, y los `code`/HTTP de
400 y 404. **Todas cuadran salvo la mitad superior del rango de `q`** (cambio
requerido 1).

#### Columna generada y migración

`descriptionSearch` no la escribe nadie: no aparece en ningún `data:` del código
de producción (solo en el `where … contains` del listado y en el test que
comprueba que PostgreSQL rechaza la escritura), y
[`migration.sql`](../../prisma/migrations/20260918140000_movement_description_search/migration.sql)
es **solo DDL**: un `ALTER TABLE … ADD COLUMN … GENERATED ALWAYS … STORED` y un
`CREATE INDEX`. Ni `INSERT`, ni `UPDATE`, ni `DELETE`.

#### Arquitectura, convenciones y checkpoints

Capas HTTP → servicio → Prisma respetadas; errores con `ValidationError` /
`NotFoundError` y el handler central; sin `console.log`, sin TODO nuevo, sin
dependencias nuevas; tests con `buildApp()` + `app.inject()`, `syntheticIban()`,
nombres con sufijo aleatorio y limpieza en `afterEach`, sin cadenas de conexión
escritas a mano. **C1, C2, C3, C4, C6 y C7 sin hallazgos** (C4 bis no aplica:
no hay parser de banco tocado). **C5** solo se puede cerrar al cierre de la
feature; los untracked de hoy son todos legítimos (specs, `progress/`,
migraciones y los archivos nuevos de F47 y F48), sin temporales ni builds.
**C7:** `decisions.md` cabe en una página, bloque 🔴 con **5** puntos y cada uno
con su alternativa, 15 requirements (dentro del tope), procedencia completa con
los 15 clasificados (`humano` / `delegado` / `añadido`) y las 15 tasks en `[x]`.
**C8** no se escribe todavía: no hay resumen de cierre porque el veredicto no es
`APPROVED`.

### Nota menor (no bloquea, no es de este lote)

[`progress/current.md`](../current.md) tiene sección de los lotes A y C de la
F47 pero **no del lote B**, que es el que trae el código. El propio informe del
lote B dice que no tocó ese archivo a propósito (lo comparten los tres lotes en
paralelo). Lo apunta quien coordine, no el implementer.

---

## Review — segunda pasada (2026-09-18)

**Veredicto:** APPROVED

El único cambio requerido está aplicado. Comprobado, no deducido:

- [`docs/api-contract.md`](../../docs/api-contract.md) §`GET /api/movements`,
  nota «Cómo busca `q`» (línea 680): ahora dice que el **máximo de 100** se mide
  sobre lo que llega **tal cual** y el **mínimo de 2** sobre lo que queda
  **después de recortar**, que los dos casos son 400 con mensajes distintos, y
  pone el ejemplo de las 99 letras más tres espacios. **Es exactamente lo que
  hace el código**, verificado otra vez lanzando las dos peticiones contra la
  base desechable `gastos_test_1`:

  ```
  GET /api/movements?q=<'   a   '>  -> 400 "'q' must have at least 2 characters once trimmed"
  GET /api/movements?q=<99+3 esp.>  -> 400 "querystring/q must NOT have more than 100 characters"
  ```

- **No se ha tocado nada de código ni de tests**, comprobado por fecha de
  modificación: todos los archivos de `src/modules/movements/` son anteriores a
  mi primer veredicto (12:52:30) y el único posterior es `docs/api-contract.md`
  (12:52:50).
- `./init.sh` completo y en solitario después del cambio: exit **0**,
  `Type check OK`, `Lint OK`, `Formato OK`, **Test Files 72 passed (72)**,
  **Tests 1328 passed (1328)**.
- La base desechable quedó vacía tras mis comprobaciones
  (`Movement 0 / Account 0 / Category 0`) y **no se escribió en la base `gastos`**.

Todo lo demás sigue como en la primera pasada: los 15 requirements con test que
comprueba salida concreta, el `intent` respetado y no ampliado, el contrato
cuadrando fila a fila con el código, el todo o nada verificado releyendo las
filas, `pagination.total` y `totals` saliendo del mismo `where` que la página,
la columna generada que nadie escribe, la migración solo-DDL, y **CHECKPOINTS
C1-C7 sin hallazgos**. **C8 cumplido ahora**: resumen de cierre en
[`progress/summaries/movements-review-bulk.md`](../summaries/movements-review-bulk.md).

Sigue en pie la nota menor de la primera pasada (el lote B no tiene sección en
`progress/current.md`), que no bloquea y no es del implementer.
