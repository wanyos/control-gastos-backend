# Design — F68 `movements-hide-not-counted`

> El nombre `hideNotCounted` es una propuesta pendiente de aprobación
> (`decisions.md` 🔴 3). Si cambia, se sustituye en todo el spec.

## 1. Archivos

| Archivo | Cambio |
|---|---|
| `src/modules/movements/movements.schema.ts` | `hideNotCounted: { type: 'boolean' }` en `listMovementsSchema.querystring.properties`, junto a `uncategorized` (mismo tipo, mismo criterio de coerción: R10). |
| `src/modules/movements/movements.types.ts` | `hideNotCounted?: boolean` en `MovementListQuery`. |
| `src/modules/movements/movements.service.ts` | `listMovements` lee `readDepositMovements` **antes** de construir el `where` (hoy lo lee en el `Promise.all` de después del `count`); `movementListWhere` recibe el mapa de depósitos y añade la condición de §2. `computeTotals` **no cambia**. |
| `src/modules/movements/movements.routes.ts` | Nada: el handler ya pasa `request.query` entero a `listMovements` (línea 110). |
| `src/modules/movements/movements.hide-not-counted.test.ts` | Nuevo: tests de comportamiento contra la base de tests, con los nombres de `tasks.md`. |
| `src/modules/movements/movements.hide-not-counted.docs.test.ts` | Nuevo: lee `docs/api-contract.md` (patrón de `movements.deposits.docs.test.ts`). |
| `docs/api-contract.md` | Fila nueva en la tabla de parámetros de `GET /api/movements`, un párrafo «Desde la feature 68» en la cabecera de la sección, la nota de `totals` y la fila 400 de errores (R13). |

Sin migración ni columna nueva: la lección 2 de `docs/lessons.md` no aplica y
`docs/data-model.md` no se toca (no cambia ninguna exclusión de §Totales globales).
Sin ADR: es un filtro más del mismo `where` compartido (feature 36), calculado al
leer como el de `ownership=doubtful` (ADR-040); no hay decisión de arquitectura
nueva.

## 2. La condición

En `movementListWhere(query, ownership, deposits)`:

```ts
if (query.hideNotCounted === true) {
  const depositsThatCount = [...deposits]
    .filter(([, reading]) => !reading.counted.isZero())
    .map(([id]) => id)
  where.AND = [
    ...(Array.isArray(where.AND) ? where.AND : []),
    {
      OR: [
        { excludedFromTotals: false, transferId: null },
        { id: { in: depositsThatCount } },
      ],
    },
  ]
}
```

- Va dentro del `where` compartido, así la página, el `count` y la consulta de los
  totales ven el mismo conjunto (R6) sin tocar `computeTotals`.
- **Por qué `AND` y no claves de primer nivel:** `ownership=doubtful` ya escribe
  `where.id = { in: … }`, y `excluded`/`transfer` escriben `where.excludedFromTotals`
  / `where.transferId`. Poner la condición en `AND` evita pisar cualquiera de ellas;
  Prisma combina con «y» las claves de primer nivel y las de `AND` (R11).
- `deposits` es el mapa de `readDepositMovements(prisma, matchers)`: ya se calcula
  sobre toda la historia de las cuentas, no sobre el filtro (R5). Se lee una sola
  vez por petición y se reutiliza para `serializeDeposit` y `computeTotals`, igual
  que hoy.
- La condición no mira `ownership`, `productId` ni `type`: lo que no está marcado
  ni emparejado entra siempre por la primera rama del `OR` (R4).

Orden nuevo en `listMovements`: validaciones → `readOwnership` →
`readDepositMovements` → `movementListWhere` → `count` → `Promise.all([página,
filas de totales])`. Pierde el paralelismo de `readDepositMovements` con las dos
`findMany`; es una consulta más en serie, sin cambio de resultado.

## 3. Firmas

```ts
function movementListWhere(
  query: MovementListQuery,
  ownership: Map<number, OwnershipReading>,
  deposits: Map<number, DepositMovementReading>,
): Prisma.MovementWhereInput
```

`listMovements(prisma, query, matchers)` no cambia de firma. No hay errores nuevos:
un valor inválido lo rechaza el esquema como `400 VALIDATION_ERROR` (R10), igual que
`uncategorized`.

## 4. Cómo cuenta el frontend lo escondido (R8)

Sin campo nuevo. El frontend ya lo hace así (`hiddenCountQuery` en
`gastos-frontend/src/features/statement/filters.ts`): pide el mismo mes y filtros
**sin** esconder, con `pageSize=1`, y resta los dos `pagination.total`. Como la
condición de §2 solo **quita** filas al conjunto sin ella (nunca añade), la resta es
exactamente lo escondido. Con el parámetro nuevo, el frontend solo cambia
`excluded=none&transfer=none` por `hideNotCounted=true` en `monthQuery`; la segunda
petición se queda igual.

## 5. Comprobación de R7 antes de redactar

R7 («los totales con el filtro son los mismos que sin él») es cierto si **cada**
movimiento que la condición de §2 quita suma 0 por sí solo en `computeTotals`
(`movements.service.ts`, la suma es fila a fila y no depende de las demás). Se
comprobó el 2026-11-06 con un script de solo lectura (sin base de datos) que llama
a `computeTotals` real sobre las 720 combinaciones de `type` (3) × marcado (2) ×
emparejado (2) × `productId` (2) × `ownership` (sin, `own`, `doubtful`, `mine`,
`not_mine`) × depósito (no, apertura, cancelación, vencimiento con interés,
vencimiento con interés 0, vencimiento dudoso):

```
combos 720 hidden 450 bad 0
all 720.00 300.00
newFilter 720.00 300.00
excluded=none&transfer=none 405.00 300.00
```

- `bad 0`: ninguna fila escondida suma nada. `own`/`mine` y `productId` no rompen
  la igualdad: si están marcados o emparejados ya sumaban 0; si no, la condición no
  los toca (R4).
- La última línea es el fallo de hoy: con `excluded=none&transfer=none` falta el
  interés de los vencimientos marcados o emparejados (720,00 frente a 405,00).

Esto cubre la función de suma; el test "gives the same totals with and without
hideNotCounted" lo comprueba de punta a punta por HTTP.

## 6. Alternativas descartadas

- **Un valor nuevo en `excluded` o `transfer`** (p. ej. `excluded=uncounted`):
  `excluded` habla de la marca y `transfer` del emparejado; el filtro pedido mezcla
  los dos y mira el depósito, así que no pertenece a ninguno. Además un valor nuevo
  en uno solo obligaría a decidir qué pasa con el otro parámetro en la misma
  petición.
- **Devolver el número de escondidos en la respuesta** (p. ej. `pagination.hidden`):
  ahorra la segunda petición, pero cambia la forma de la respuesta para todas las
  peticiones y el frontend ya tiene resuelto el contador con la resta.
- **400 al combinar `hideNotCounted` con `excluded` o `transfer`:** más
  restrictivo, pero rompe la regla de la ruta («combinables entre sí») y la
  combinación tiene un sentido claro (R11).
- **Filtrar en memoria después del `findMany`:** rompería la paginación y el
  `pagination.total`; el filtro tiene que ir al `where`.
