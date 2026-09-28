# Design — F49 `honest-totals`

> Se apoya en `docs/architecture.md` (capas HTTP → servicio → datos, errores de
> dominio) y `docs/conventions.md`. Aquí solo lo que esta feature decide. Los
> nombres `excludedFromTotals`, `transfer`, `excluded`, `GET /api/transfers` y
> `GET /api/transfers/ambiguous` los aprobó el humano el 2026-09-27.

## 1. Archivos

| Archivo | Qué le pasa |
| --- | --- |
| `prisma/schema.prisma` | `Movement.excludedFromTotals Boolean @default(false)`; se corrige el comentario de `productId` («Nothing writes it yet» sigue siendo verdad; se añade que la marca general es `excludedFromTotals`) |
| `prisma/migrations/<ts>_movement_excluded_from_totals/migration.sql` | `ALTER TABLE "Movement" ADD COLUMN "excludedFromTotals" BOOLEAN NOT NULL DEFAULT false;` (la genera `prisma migrate dev`) |
| `src/modules/movements/movements.schema.ts` | `transfer` y `excluded` en `listMovementsSchema`; `excludedFromTotals` en los dos cuerpos de `PATCH`; `bulkUpdateMovementsWritableProperties` crece |
| `src/modules/movements/movements.types.ts` | `TotalsMovement`, `MovementListQuery`, `UpdateMovementBody`, `BulkUpdateMovementsBody`, `SerializedMovement` crecen |
| `src/modules/movements/movements.service.ts` | `movementListWhere` (filtro), select de totales, `computeTotals`, `updateMovement`, `bulkUpdateMovements`, `serializeMovement` |
| `src/modules/movements/movements.routes.ts` | `preValidation` de los dos `PATCH` añade la comprobación estricta del booleano (R3) |
| `src/modules/movements/movements.exclusion.test.ts` | **Nuevo**: tests de R1-R8, R10, R11, R16 |
| `src/modules/overview/overview.service.ts` | El `select` del periodo añade `excludedFromTotals` |
| `src/modules/overview/overview.test.ts` | Test de R6 |
| `src/modules/transfers/transfers.service.ts` | `readTransferCandidates` sale de `detectTransfers`; nuevas `listTransferPairs` y `listAmbiguousTransfers` |
| `src/modules/transfers/transfers.types.ts` | `TransferPair`, `TransferPairsResponse`, `AmbiguousTransfersResponse` |
| `src/modules/transfers/transfers.routes.ts` | `GET /` y `GET /ambiguous` |
| `src/modules/transfers/transfers.routes.test.ts` | Tests de R9, R12, R13, R14 |
| `docs/api-contract.md` | §`Movement`, §`GET /api/movements`, §`PATCH` ×2, §`GET /api/overview`, secciones nuevas de los dos `GET` de traspasos |
| `docs/data-model.md` | §Totales globales: tercera regla de exclusión |

No se toca: `computeAccountBalance`/`netOf` (el saldo no mira la marca, R7), `pairTransferCandidates`, `linkTransfer`, `unlinkTransfer`, el importador, el módulo de inversiones.

## 2. La marca: columna nueva, no `productId`

`excludedFromTotals Boolean NOT NULL DEFAULT false`. Existentes y nuevos nacen a
`false`; el importador no necesita cambiar (Prisma aplica el default; no se añade
la columna a `toMovementCreateInput`, así el importador sigue sin enriquecer).

**Alternativa descartada — dar escritor a `productId`.** Es una FK a
`InvestmentProduct`: marcar exigiría un producto por movimiento. En la base real
(consulta de solo lectura del 2026-09-27) hay 3 productos `deposit` para ~12
depósitos y 29 movimientos; los otros ~9 exigirían archivos de producto escritos a
mano antes de poder marcar nada, y un movimiento que no va a ningún producto (un
traspaso a una cuenta no dada de alta) no se podría marcar nunca. `productId` se
queda como está (sin escritor, sigue excluyendo en `computeTotals`) para la F50.

`computeTotals` (una línea más, antes de mirar el tipo):

```ts
if (movement.excludedFromTotals) return totals
```

`TotalsMovement` gana `excludedFromTotals: boolean`, y los **dos** `select` que
alimentan `computeTotals` lo piden: `listMovements` (`movements.service.ts:273-276`)
y `getOverview` (`overview.service.ts:55-65`). Si uno se olvida, TypeScript falla
porque el tipo lo exige.

## 3. Escritura (R1-R3)

- `updateMovementSchema.body.properties` y `bulkUpdateMovementsSchema.body.properties`
  ganan `excludedFromTotals: { type: 'boolean' }`. Como los allow-lists se derivan
  de `Object.keys(...properties)`, `assertOnlyAllowedBodyProperties` los acepta solo.
- `bulkUpdateMovementsWritableProperties` pasa a `['categoryId', 'status', 'excludedFromTotals']`
  (un cuerpo `{ ids, excludedFromTotals }` es una petición válida).
- `updateMovement` / `bulkUpdateMovements`: `data.excludedFromTotals = input.excludedFromTotals`
  cuando viene. No hay validación de dominio nueva: se puede marcar cualquier
  movimiento, también un `neutral` o una pierna de traspaso (R9). En el bloque, la
  marca entra en el mismo `updateMany` dentro de la misma transacción: todo o nada.
- **R3, booleano estricto.** Fastify usa AJV con conversión de tipos por defecto
  (no hay configuración propia en `src/app.ts`), así que `"true"` o `null` podrían
  llegar convertidos a booleano. No se ha comprobado ejecutándolo: el implementer
  lo comprueba con el test de R3. Para no depender de eso, la comprobación va en el
  `preValidation` de las dos rutas, que ve el cuerpo **crudo** antes del esquema:
  si `excludedFromTotals` está presente y `typeof !== 'boolean'` →
  `ValidationError("'excludedFromTotals' must be true or false")`. Una función
  `assertStrictBoolean(body, 'excludedFromTotals')` en `movements.routes.ts`.

## 4. Filtros `transfer` y `excluded` (R10, R11, R16)

Esquema: `transfer` y `excluded`, los dos `{ type: 'string', enum: ['only', 'none'] }`
(el `enum` da R11).
En `movementListWhere`, el único `where` que comparten página, `count` y totales
(invariante de la F36):

```ts
if (query.transfer === 'only') where.transferId = { not: null }
if (query.transfer === 'none') where.transferId = null
if (query.excluded === 'only') where.excludedFromTotals = true
if (query.excluded === 'none') where.excludedFromTotals = false
```

Nota: con `transfer=only` o `excluded=only` los `totals` salen `0/0/0` por
construcción (todos sus movimientos están fuera de las sumas). Es correcto y se
documenta en el contrato.

## 5. `GET /api/transfers` (R12)

```ts
export async function listTransferPairs(prisma: AppPrismaClient): Promise<TransferPairsResponse>
// TransferPair = { transferId: string; movements: [SerializedMovement, SerializedMovement] }
// TransferPairsResponse = { pairs: TransferPair[] }
```

Un `findMany({ where: { transferId: { not: null } }, include: { account: true, category: true } })`,
agrupado por `transferId` en memoria. Dentro de la pareja: el `expense` primero, el
`income` después (si alguna vez un grupo no fuera un `expense` + un `income`, por id
ascendente; no se inventa un error para un estado que la escritura no produce).
Orden de las parejas: `bookingDate` más reciente de sus dos piernas, descendente;
empate por `transferId` ascendente para que sea estable.

Sin paginación ni filtros: hoy hay 40 parejas (consulta del 2026-09-27). Decisión
visible en `decisions.md` 🔴 5.

**Alternativa descartada — solo el filtro `transfer=only`.** Cero endpoints nuevos,
pero la paginación por movimiento puede dejar las dos piernas de una pareja en
páginas distintas, y la parte 3 del frontend (deshacer) trabaja por pareja.

## 6. `GET /api/transfers/ambiguous` (R14)

Se extrae de `detectTransfers` (`transfers.service.ts:222-247`) la lectura de
candidatos a una función propia, sin cambiar lo que lee:

```ts
async function readTransferCandidates(prisma: AppPrismaClient): Promise<TransferCandidate[]>
export async function listAmbiguousTransfers(prisma: AppPrismaClient): Promise<AmbiguousTransfersResponse>
// AmbiguousTransfersResponse = { ambiguousCount: number; ambiguous: AmbiguousTransferGroup[] }
```

`detectTransfers` pasa a llamar a `readTransferCandidates` (mismo comportamiento;
sus tests existentes lo vigilan). `listAmbiguousTransfers` llama a
`pairTransferCandidates(await readTransferCandidates(prisma))` y devuelve **solo**
`ambiguous` y su longitud. Las `pairs` que devolviera se descartan: este `GET` no
escribe nunca (R14). En condiciones normales esas `pairs` vienen vacías, porque la
detección ya enlazó todo lo resoluble tras la última importación y una pareja
deshecha a mano está vetada por `undoneTransferId`.

A diferencia de `detectTransfers`, esta función **sí** lanza si la base falla: es una
lectura normal y el manejador central de errores responde `500`.

Por qué el resultado coincide con el del informe: `detectTransfers` lee toda la
tabla de movimientos sin enlazar en cada pasada, no solo lo recién importado
(`transfers.service.ts:203-207`). Si desde la importación el humano enlazó o
deshizo algo, este `GET` refleja ya ese cambio.

Rutas en `transfers.routes.ts`: `GET /` y `GET /ambiguous`. No chocan con
`DELETE /:transferId` (método distinto). Ninguno de los dos admite parámetros de
entrada.

## 7. Errores

Ninguno nuevo. `ValidationError` (400) para R3 y el `enum` de R11; `NotFoundError`
de los `PATCH` sin cambios.

## 8. Documentación

- `docs/api-contract.md`: ver R15 (incluidos los parámetros `transfer` y `excluded`). En §`Movement`, `excludedFromTotals` con la
  frase «no cambia el importe ni el saldo; solo saca el movimiento de `income` y
  `expense`». En §`GET /api/movements` y §`GET /api/overview`, la regla de
  totales pasa a tener tres exclusiones (`transferId`, `productId`,
  `excludedFromTotals`) además de `neutral`.
- `docs/data-model.md` §Totales globales: la tercera exclusión, y que el saldo no
  la mira.
