# Resumen — feature 47 `movements-review-bulk`

Fecha de cierre: 2026-09-18
Intención original: `feature_list.json` → feature `movements-review-bulk`, bloque `intent`
Spec: [`specs/47-movements-review-bulk/`](../../specs/47-movements-review-bulk/)

## Qué hace ahora la app que antes no

Hasta hoy, la lista de movimientos se podía pedir por cuenta, por fechas, por
tipo y por estado, y para confirmar o poner categoría había que ir **de uno en
uno**. Con 1.378 movimientos sin categoría, eso eran 1.378 peticiones.

Ahora la API sabe hacer tres cosas más:

1. **Pedir los movimientos de una categoría**, o **los que no tienen ninguna**.
2. **Buscar por un trozo de texto de la descripción**, sin que importen las
   mayúsculas ni las tildes: `cafeteria` encuentra `CAFETERÍA`, y al revés. El
   `%` y el `_` se buscan tal cual, como caracteres normales, no como comodines.
3. **Cambiar varios movimientos en una sola petición**: marcar confirmados y/o
   ponerles categoría a los que vengan en una lista (hasta 200), **todo o nada**.
   Si uno solo de ellos no vale —no existe, es de importe cero, o la categoría no
   casa con su tipo—, **no cambia ninguno**, y el mensaje de error dice qué ids
   son los que fallan.

Los filtros nuevos se mezclan con los que ya había y con la paginación, y los
totales que acompañan a la lista salen **de lo filtrado**, no de la tabla entera.

Esto es lo que le faltaba al frontend para construir su pantalla de revisión
(parte 1 de `../../docs/handoff-pantalla-revision.md`).

Lo que **no** cambió: `GET /api/movements` devuelve exactamente la misma forma de
respuesta y los mismos campos de siempre, `PATCH /api/movements/:id` sigue
funcionando igual, y **no se puede tocar el importe, la fecha ni la descripción**
de un movimiento por ninguna de las dos vías.

## Por dónde se usa (puntos de entrada)

- **`GET /api/movements?categoryId=…`** — solo los de esa categoría exacta. Una
  categoría padre **no** arrastra las de sus hijas. Si la categoría no existe,
  404. → [movements.routes.ts:64](../../src/modules/movements/movements.routes.ts#L64)
- **`GET /api/movements?uncategorized=true`** — solo los que no tienen categoría.
  Mandado junto a `categoryId`, da 400 (piden cosas contrarias). Con `false` no
  filtra nada. → [movements.service.ts:158](../../src/modules/movements/movements.service.ts#L158)
- **`GET /api/movements?q=texto`** — los que llevan ese texto en la descripción.
  Entre 2 y 100 caracteres. → [movements.service.ts:195](../../src/modules/movements/movements.service.ts#L195)
- **`PATCH /api/movements`** — la operación sobre varios: cuerpo
  `{ ids, categoryId?, status? }`, responde cuántos cambiaron y los devuelve ya
  con su categoría dentro.
  → [movements.routes.ts:75](../../src/modules/movements/movements.routes.ts#L75)

Todo está descrito para el frontend en `docs/api-contract.md`: los tres
parámetros nuevos en §`GET /api/movements` y la sección nueva
§`PATCH /api/movements`.

## Dónde está el código (para revisión directa)

### Cómo se busca sin tildes (base de datos)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Columna que PostgreSQL rellena sola con la descripción en minúsculas y sin tildes; **ningún código de la app puede escribirla** | `Movement.descriptionSearch` | [schema.prisma:141](../../prisma/schema.prisma#L141) |
| Índice por categoría, que es el filtro nuevo más usado | `@@index([categoryId])` | [schema.prisma:184](../../prisma/schema.prisma#L184) |
| La migración que añade las dos cosas. Es **solo estructura**: ni un `INSERT`, ni un `UPDATE`, ni un `DELETE` | — | [migration.sql](../../prisma/migrations/20260918140000_movement_description_search/migration.sql) |

> Ya está aplicada a tu base de datos real (con `prisma migrate deploy`, el
> 2026-09-18): las 1.607 filas quedaron con la columna rellena y **no se insertó,
> cambió ni borró ninguna**.

### La lógica

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Monta los filtros de la consulta, los viejos y los tres nuevos, **en un solo sitio** — por eso la página, el contador y los totales siempre miran lo mismo | `movementListWhere` | [movements.service.ts:158](../../src/modules/movements/movements.service.ts#L158) |
| Deja el texto buscado igual que la columna (minúsculas, sin tildes) y protege el `%`, el `_` y la barra invertida para que se busquen tal cual | `normalizeForSearch` | [movements.service.ts:195](../../src/modules/movements/movements.service.ts#L195) |
| Las comprobaciones previas del listado: categoría y «sin categoría» a la vez (400), texto que se queda en menos de 2 letras al recortar espacios (400), cuenta o categoría inexistente (404) | `listMovements` | [movements.service.ts:219](../../src/modules/movements/movements.service.ts#L219) |
| El cambio sobre varios: comprueba la lista entera primero, escribe una sola vez y todo dentro de una transacción; el mensaje de error nombra los ids concretos que fallan | `bulkUpdateMovements` | [movements.service.ts:344](../../src/modules/movements/movements.service.ts#L344) |

### La capa HTTP

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los tres parámetros nuevos de la querystring, con sus tipos y límites | `listMovementsSchema` | [movements.schema.ts:25](../../src/modules/movements/movements.schema.ts#L25) |
| Qué se admite en el cuerpo del cambio sobre varios: de 1 a 200 ids sin repetidos, y solo `categoryId` y/o `status` | `bulkUpdateMovementsSchema` | [movements.schema.ts:85](../../src/modules/movements/movements.schema.ts#L85) |
| La ruta nueva y sus dos porteros: rechaza cualquier campo que no toque (un importe en el cuerpo es un 400, no un 200 que lo ignora) y exige que se pida al menos una de las dos cosas | `PATCH /` | [movements.routes.ts:75](../../src/modules/movements/movements.routes.ts#L75) |

### Documentación

| Qué hace | Código |
| --- | --- |
| Los tres parámetros nuevos, la nota «Cómo busca `q`» y los dos errores nuevos | [api-contract.md:637](../../docs/api-contract.md#L637) §`GET /api/movements` |
| La operación sobre varios entera: cuerpo, respuesta, errores y lo que **no** se ofrece | [api-contract.md:778](../../docs/api-contract.md#L778) §`PATCH /api/movements` |
| Índice de endpoints con la ruta nueva y los filtros | [README.md](../../README.md) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Los filtros nuevos y la búsqueda, uno a uno y combinados con cuenta, fechas, tipo, estado y paginación; que la forma de la respuesta no cambió | [movements.test.ts:1252](../../src/modules/movements/movements.test.ts#L1252) |
| El cambio sobre varios por HTTP con la app real: los casos que funcionan y **cada rechazo releyendo las filas** para comprobar que no se tocó ninguna (18 tests) | [movements.bulk.test.ts:13](../../src/modules/movements/movements.bulk.test.ts#L13) |
| Que la columna de búsqueda se rellena sola al crear y al cambiar la descripción, y que PostgreSQL rechaza cualquier intento de escribirla | [movements.search-column.test.ts:11](../../src/modules/movements/movements.search-column.test.ts#L11) |

## Cumplimiento de la intención

Por cada punto de tu `como_se_que_esta_bien`:

- ✅ **«Pido `GET /api/movements` con una categoría y solo vienen los de esa
  categoría.»** → test `GET /api/movements?categoryId= returns only the movements
  of that category (R1)`.
- ✅ **«…con la opción de "sin categoría" y solo vienen los que no tienen.»** →
  tests `?uncategorized=true returns only the ones with no category (R2)` y
  `?uncategorized=false does not filter anything out (R2)`.
- ✅ **«Busco un texto y vienen los movimientos cuya descripción lo contiene, sin
  importar mayúsculas ni tildes si es viable.»** → sí era viable, y funciona en
  los dos sentidos: tests `matches the description ignoring case and diacritics
  (R5)` y `also finds an accented word typed WITH its accent (R5)`.
- ✅ **«Los filtros nuevos se combinan con los que ya existen y con la paginación,
  y los totals salen de lo filtrado.»** → test `combines the new filters with
  account, range, type, status and pagination (R7)`, que comprueba a la vez la
  página, el total y los totales.
- ✅ **«Mando varios movimientos con un estado y/o una categoría y quedan todos
  cambiados en una sola petición.»** → cinco tests de `PATCH /api/movements`,
  incluido quitar la categoría a varios de golpe.
- ✅ **«Si uno de ellos no cumple las reglas del PATCH individual, no cambia
  ninguno.»** → cuatro tests (id inexistente, categoría inexistente, categoría
  que no casa con el tipo, movimiento de importe cero); **cada uno relee las
  filas** después del error y comprueba que siguen exactamente igual.
- ✅ **«`docs/api-contract.md` describe los parámetros, respuestas y errores
  nuevos.»** → hecho, y el reviewer lo contrastó fila a fila contra el código
  lanzando peticiones de verdad.

## Decisiones que se tomaron por ti

- **(tuya) La operación sobre varios es solo por lista de ids**, como dijiste en
  la puerta del spec. No existe la variante «confirma todo lo que cumple estos
  filtros»: si quieres confirmar 500, el frontend manda los 500 ids.
- **(delegado) Cómo se pide «sin categoría»**: `uncategorized=true`, un parámetro
  aparte, en vez de un `categoryId=none`. Así `categoryId` sigue siendo un número
  y nada más.
- **(delegado) El parámetro de búsqueda se llama `q`** y busca **solo en la
  descripción**: ni en tu nota, ni en el nombre de la cuenta, ni en la categoría,
  ni en el importe.
- **(delegado) El tope por petición son 200 movimientos**, el mismo número que ya
  es el máximo de una página del listado.
- **(añadido) Sin tildes se resuelve con una columna que calcula PostgreSQL**, no
  con código que mantenga una copia: nadie puede olvidarse de actualizarla, y de
  hecho la base de datos rechaza que se intente.
- **(añadido) `uncategorized=false` no filtra nada** (es igual que no mandarlo),
  y está documentado y con test, porque es fácil leerlo como «los que sí tienen
  categoría».

## Qué NO se tocó / quedó fuera

- **Ninguna pantalla.** El frontend hace su parte en otra sesión, contra
  `docs/api-contract.md` (partes 2 y 3 del traspaso).
- **Editar importe, fecha o descripción**: sigue siendo imposible, y ahora hay
  test que lo vigila en la vía nueva.
- **`PATCH /api/movements/:id`** no cambió ni un campo.
- **Ningún endpoint nuevo para crear reglas** desde un movimiento: el frontend ya
  puede con `POST /api/category-rules`, como dijiste.
- **El extracto (E7) y los dashboards** siguen donde estaban.

## Notas para el futuro

- **La búsqueda por texto lee la tabla entera** (no hay índice que sirva para
  «contiene»). Con las filas de hoy no se nota; si algún día tarda, la solución
  conocida es un índice de trigramas sobre esa misma columna.
- **Un parámetro mal escrito en la querystring se ignora en silencio** y devuelve
  la lista entera sin avisar (por ejemplo `categoryid=3` en minúscula). Es como
  se comportaba ya todo el proyecto y no se cambió aquí, pero conviene saberlo al
  construir el frontend.
- **Un id mandado entre comillas** (`"12"` en vez de `12`) no da 400: se convierte
  a número, y si no existe sale 404. También es el comportamiento que ya tenía el
  resto de la API.
