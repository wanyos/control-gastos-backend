# Design — F40 `transfer-detection`

> Encaja con `docs/architecture.md` (ADR-005 errores, ADR-011 modelo, ADR-015
> importación) y `docs/data-model.md` §Traspasos. **Cero migración**:
> `Movement.transferId` y `@@index([transferId])` existen desde la F8, y
> `transferId` queda fuera del índice de dedup a propósito (escribirlo no puede
> romper la deduplicación).

## 1. Dónde vive el código

Módulo nuevo `src/modules/transfers/`:

| Archivo | Qué contiene |
| --- | --- |
| `transfers.types.ts` | Los tipos del emparejamiento y del informe (`TransferDetectionResult`, `AmbiguousTransferGroup`, …). |
| `transfers.service.ts` | La función pura de emparejamiento + el escritor con transacción + la entrada `detectTransfers(prisma)`. |
| `transfers.service.test.ts` | Tests del módulo (unitarios de la función pura + integración con BD). |

No hay `transfers.routes.ts`: la detección **no tiene endpoint** (R1); la
disparan las dos vías del importador. `src/architecture.test.ts` mantiene una
lista cerrada de archivos de `src/` (línea 72 y siguientes): los tres archivos
nuevos se añaden ahí.

Quién la llama:

- `importPending` (`src/modules/import/import.service.ts:346`), tras el bucle de
  archivos y antes de devolver el `ImportRunResult`.
- `importLocalCopies` (`src/modules/import/import.local.service.ts:78`), en el
  mismo punto. La comparte sin una línea propia si la llamada se hace en un
  helper común; como los dos ya componen `totals(files)` por separado, la llamada
  se repite en los dos (dos líneas), que es más simple que un tercer seam.

El módulo `import/` ya importa de `modules/movements/` e `investments/`;
importar de `modules/transfers/` sigue el mismo patrón y no toca el guardián de
«el importador no nombra bancos» (el módulo nuevo tampoco nombra ninguno).

## 2. Firmas nuevas

```ts
// transfers.types.ts
export interface TransferCandidate {
  id: number
  accountId: number
  accountAlias: string
  type: 'expense' | 'income'
  amount: string          // decimal string, como viaja en todo el proyecto
  bookingDate: Date
  description: string
}

export interface AmbiguousTransferGroup {
  amount: string
  movements: Array<{
    id: number
    accountId: number
    accountAlias: string
    type: 'expense' | 'income'
    bookingDate: string   // YYYY-MM-DD
    description: string
  }>
}

export interface TransferDetectionResult {
  pairsCreated: number
  ambiguousCount: number  // grupos, no movimientos
  ambiguous: AmbiguousTransferGroup[]
  error?: { code: string; message: string }  // R15; ausente cuando fue bien
}

// transfers.service.ts
export const transferDateWindowDays = 3

/** Pura: sin BD, sin reloj. Decide qué parejas son inequívocas (R2, R5). */
export function pairTransferCandidates(candidates: TransferCandidate[]): {
  pairs: Array<[TransferCandidate, TransferCandidate]>
  ambiguous: AmbiguousTransferGroup[]
}

/** Lee candidatos, empareja, escribe. Nunca lanza: el fallo viaja en el result. */
export async function detectTransfers(prisma: AppPrismaClient): Promise<TransferDetectionResult>
```

## 3. Algoritmo de emparejamiento

1. **Leer candidatos**: `SELECT` de todos los movimientos con
   `transferId = null` y `type IN (expense, income)`, con
   `id, accountId, type, amount, bookingDate, description` y el `alias` de su
   cuenta. (~1520 filas hoy; una consulta, sin paginación.)
2. **Agrupar por `amount`** (string decimal exacto). Dentro de cada grupo,
   construir el grafo bipartito `expense ↔ income` con arista cuando
   `accountId` distinto y `|Δ bookingDate| ≤ 3` días naturales (diferencia en
   días UTC entre columnas date-only; `daySequence` no interviene).
3. **Pareja inequívoca** = arista cuyos dos extremos tienen **grado 1**
   (unicidad mutua, R5). Determinista e independiente del orden de entrada.
4. **Ambiguos** = componentes conexas del grafo con alguna arista que no
   cumplen el punto 3. Cada componente es un `AmbiguousTransferGroup` (R6).
   Los movimientos con grado 0 (sin candidato: Bizum, terceros) no se
   reportan (R4).
5. **Escribir cada pareja** (R2, R3, R11): `transferId = crypto.randomUUID()`
   y, dentro de `prisma.$transaction`:

   ```ts
   const { count } = await tx.movement.updateMany({
     where: { id: { in: [a.id, b.id] }, transferId: null },
     data: { transferId },
   })
   if (count !== 2) throw new PairRacedError()  // rollback de ESTA pareja
   ```

   El `transferId: null` en el WHERE es lo que hace la escritura segura frente a
   dos pasadas concurrentes (mismo patrón que `anchorAccountIfMissing`). Una
   pareja que pierde la carrera se salta sin marcar nada y sin tumbar el resto.

**Idempotencia (R8)** sale sola del paso 1: una pierna ya emparejada tiene
`transferId != null`, no entra en los candidatos y por tanto ni se reevalúa ni
puede cambiar. Reimportar no duplica movimientos (índice de dedup, intacto), así
que el grafo de la segunda pasada es el mismo menos las parejas ya hechas.

**Pierna tardía (R9)**: como el paso 1 lee la tabla entera y no «lo importado en
esta pasada», la pierna vieja sigue ahí como candidata cuando llega la nueva.

## 4. Forma del informe (contrato)

`ImportRunResult` y `LocalImportRunResult` ganan un campo raíz:

```json
"transfers": {
  "pairsCreated": 2,
  "ambiguousCount": 1,
  "ambiguous": [
    {
      "amount": "500.00",
      "movements": [
        { "id": 12, "accountId": 1, "accountAlias": "bankinter ···0236",
          "type": "expense", "bookingDate": "2026-08-01", "description": "TRANSFERENCIA" },
        { "id": 40, "accountId": 2, "accountAlias": "openbank ···1111",
          "type": "income", "bookingDate": "2026-08-01", "description": "TRANSFERENCIA RECIBIDA" },
        { "id": 41, "accountId": 3, "accountAlias": "n26 ···2222",
          "type": "income", "bookingDate": "2026-08-02", "description": "ABONO" }
      ]
    }
  ]
}
```

- Siempre presente, con `pairsCreated: 0` y `ambiguous: []` cuando no hay nada
  (misma regla que `balanceMismatches`: «no se encontró nada» ≠ «no se miró»).
- Con fallo (R15): `"transfers": { "pairsCreated": n, "ambiguousCount": 0,
  "ambiguous": [], "error": { "code": "...", "message": "..." } }` — `n` son las
  parejas que sí llegaron a escribirse antes del fallo. El error se sanea con el
  mismo `describeError` de patrón que usa el importador (AppError → su código;
  resto → `INTERNAL_SERVER_ERROR` genérico).
- Es **aditivo**: ningún campo existente del informe cambia. Hay que añadirlo a
  los esquemas de respuesta de `src/modules/import/import.schema.ts` para que
  Fastify no lo recorte al serializar.

## 5. Errores

Ningún código de error nuevo en la tabla del contrato: la detección no tiene
endpoint y su fallo viaja dentro del 200 del informe (R15), como
`MISSING_ACCOUNT_DATA`. `PairRacedError` es interno al servicio (control de
flujo de la transacción), no un `AppError` que salga por HTTP.

## 6. Transaccionalidad y lo que NO se toca

- Una transacción **por pareja**, no una global: un fallo en la pareja N no
  des-empareja las N−1 anteriores (que están bien hechas) y la siguiente pasada
  retoma donde quedó.
- El `update` escribe **solo** `transferId` (R10). `updatedAt` avanza porque es
  `@updatedAt` de Prisma; el test de R10 compara la fila entera **excepto**
  `transferId` y `updatedAt`, y lo deja dicho.
- Ni ancla, ni `balanceAfter`, ni saldo: `computeAccountBalance` no mira
  `transferId` (comprobado en `src/modules/movements/movements.service.ts:130`)
  y esta feature no lo cambia.
- El índice de dedup no incluye `transferId` (SQL de la migración de la F8), así
  que escribirlo no altera ninguna colisión futura.

## 7. Alternativas descartadas

1. **Emparejar solo lo importado en la pasada** (incremental): obligaría a un
   segundo camino para la pierna tardía y a distinguir «nuevo» de «viejo»; leer
   la tabla entera es barato (una consulta), determinista y hace R8 y R9
   triviales.
2. **Elegir el candidato de fecha más cercana cuando hay varios**: empareja en
   silencio exactamente el caso dudoso; el humano fijó el criterio contrario
   («antes sin marcar que mal enlazado»).
3. **Detectar por el `description`** («TRANSFERENCIA», «BIZUM»): el banco pone
   el mismo texto pagándote a ti que pagando a un tercero; el único hecho que
   distingue un traspaso interno es la pierna espejo en otra cuenta propia.
4. **Endpoint dedicado `POST /api/transfers/detect`**: un endpoint más de
   contrato para algo que cada importación ya dispara; la primera pasada sobre
   los 1520 movimientos guardados se consigue con `POST /api/import/local`
   (reimporta las copias locales —todo duplicados— y al final corre la
   detección). Si algún día hace falta bajo demanda de verdad, es una feature
   de una tarde sobre `detectTransfers`, que ya queda expuesto como función.
5. **Deshacer una pareja en esta feature**: un deshecho de verdad necesita
   memoria (sin ella, la siguiente pasada rehace la pareja: R8 + R9 la rehacen
   por diseño), y esa memoria es una columna o tabla nueva → migración → alcance
   nuevo. Se difiere; queda dicho en decisions.md.
