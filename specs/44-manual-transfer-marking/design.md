# Design — F44 `manual-transfer-marking`

> Encaja con `docs/architecture.md` (ADR-005 errores centralizados) y
> `docs/conventions.md`. **Primera migración desde la F9**: una columna
> nullable en `Movement`. La detección (F40/F41) no se reescribe: se le añade
> una condición de arista y el complemento manual vive en el mismo módulo
> `src/modules/transfers/`, que estrena capa HTTP.

## 1. Superficie HTTP

| Método y ruta | Nueva | Qué hace |
| --- | --- | --- |
| `POST /api/transfers` | **sí** | Enlaza dos movimientos como pareja de traspaso. Body `{ movementIds: [a, b] }`. `201` → `{ transferId, movements }`. |
| `DELETE /api/transfers/:transferId` | **sí** | Deshace la pareja (manual o de la detección) y apunta la memoria del deshecho. `204` sin cuerpo. |

**Por qué NO se amplía `PATCH /api/movements/:id` (F37).** Ese PATCH edita
campos de anotación de UN movimiento con allow-list estricta
(`src/lib/strict-body.ts`); un enlace es un hecho sobre DOS movimientos que se
escriben juntos o ninguno, y un deshecho escribe además la memoria en las dos
piernas. Meterlo en el PATCH obligaría a aceptar `transferId` en el body (un
cliente podría inventarse el valor o escribir media pareja) y rompería la
doctrina de la F40: el enlace lo fabrica el servidor (UUID), nunca el cliente.
El recurso es la **pareja**, no el movimiento → endpoints propios.

La nota «No hay endpoint de traspasos» de `docs/api-contract.md` (línea ~248)
y el comentario de `src/modules/movements/movements.routes.ts` (líneas 18-24)
se reescriben: los movimientos siguen sin crearse ni borrarse por API; lo que
aparece es un escritor manual del **enlace**.

## 2. Migración (primera desde la F9)

`prisma/schema.prisma`, `model Movement`:

```prisma
  // The transferId both legs carried until the human undid that pair (F44).
  // Detection never re-links two movements sharing the same non-null value;
  // everything else about them stays eligible. Overwritten by a later undo:
  // one movement remembers only its LAST undone pair (decisions.md #3).
  undoneTransferId String?
```

- `pnpm prisma migrate dev --name movement-undone-transfer-id` — una sola
  columna nullable, sin backfill (todo lo existente queda `NULL`), sin índice
  (nunca se filtra por ella: la detección la lee dentro del select de
  candidatos que ya recorre la tabla de no enlazados).
- Tests: nada que hacer a mano — `gastos_test_template` se re-migra sola en la
  siguiente pasada (`docs/conventions.md` §Tests con base de datos).
- La columna **no** se expone en `SerializedMovement` ni en el contrato: es
  maquinaria interna de la detección. Si el frontend la necesita algún día, se
  añade entonces (una línea en el serializador + contrato).

## 3. Servicio (`src/modules/transfers/transfers.service.ts`)

Firmas nuevas:

```ts
export async function linkTransfer(
  prisma: AppPrismaClient,
  input: LinkTransferBody,        // { movementIds: [number, number] }
): Promise<LinkTransferResult>    // { transferId, movements: [SerializedMovement, SerializedMovement] }

export async function unlinkTransfer(
  prisma: AppPrismaClient,
  transferId: string,
): Promise<void>                  // NotFoundError 404 si no hay piernas con ese id
```

`linkTransfer`, validaciones en orden (R6 → R5 → R3 → R4 → R2):

1. Carga los dos movimientos con `include { account, category }` (para
   responder con el `serializeMovement` **exportado** de
   `src/modules/movements/movements.service.ts:278` — se reutiliza, no se
   duplica). Falta alguno → `NotFoundError` (R6).
2. Alguno con `transferId != null` → `ConflictError` (R5).
3. Tipos no son {`expense`, `income`} → `ValidationError` (R3). `neutral`
   nunca es pierna de traspaso (igual que en la detección, que los excluye
   del WHERE).
4. Misma cuenta → `ValidationError` (R4).
5. Importes distintos (comparación por `Decimal.equals`, nunca por float) →
   `ValidationError` con los dos importes en el mensaje (R2).
6. **Ninguna comprobación de fechas** (R8) y **ninguna consulta a
   `undoneTransferId`**: el humano manda; enlazar a mano dos movimientos que
   él mismo deshizo antes es legítimo y solo escribe `transferId` (la memoria
   vieja se queda, inofensiva: solo veta a la detección automática).
7. Escritura: `randomUUID()` + el mismo patrón de transacción/carrera de
   `detectTransfers` (`transfers.service.ts:224-230`): `updateMany` con
   `WHERE id IN (a,b) AND transferId: null`, `count !== 2` → rollback y
   `ConflictError` (otra escritura llegó antes). Solo viaja `transferId` en
   `data` (R13).

`unlinkTransfer`:

- `updateMany({ where: { transferId }, data: { transferId: null, undoneTransferId: transferId } })`
  — una sola sentencia, las dos piernas a la vez (R9, R13). `count === 0` →
  `NotFoundError` (R10). (Por construcción un `transferId` lo llevan
  exactamente 2 filas; no se re-verifica el conteo a 2 para no inventar un
  estado imposible.)
- Uniforme para parejas manuales y de la detección: mismo endpoint, misma
  memoria (decisión delegada, marcada en decisions.md #4).

Cambios en la detección (mismo archivo):

- `TransferCandidate` (en `transfers.types.ts`) gana
  `undoneTransferId: string | null`; el select de `detectTransfers` lo añade.
- `pairTransferCandidates`: una arista expense–income además exige
  `!(expense.undoneTransferId !== null && expense.undoneTransferId === income.undoneTransferId)`
  (R11); la misma condición entra en el chequeo de resolubilidad del lote
  igualado (F41: «toda combinación es válida») — un grupo con una combinación
  deshecha dentro queda dudoso entero (R11), y el resto de candidatos del
  movimiento deshecho siguen jugando (R12). La función sigue pura y se testea
  sin base de datos.

## 4. Capa HTTP (nuevos archivos + registro)

- `src/modules/transfers/transfers.routes.ts` — plugin async, dos rutas.
  `POST /` con `preValidation: assertOnlyAllowedBodyProperties(body,
  linkTransferBodyProperties)` (mismo patrón que
  `movements.routes.ts:46-48`, R7).
- `src/modules/transfers/transfers.schema.ts` — `linkTransferSchema` (body:
  `movementIds` array de enteros ≥ 1, `minItems: 2`, `maxItems: 2`,
  `additionalProperties: false`; los ids **distintos** se comprueban en el
  handler/servicio porque `uniqueItems` de AJV con `removeAdditional` no
  sustituye al mensaje claro) y `unlinkTransferSchema` (params:
  `transferId` string `minLength: 1`).
- `src/app.ts` — `app.register(transfersRoutes, { prefix: '/api/transfers' })`
  junto al resto (línea ~88).
- El comentario de cabecera de `transfers.types.ts` («The detection has NO
  endpoint») se ajusta: la detección sigue sin endpoint; lo que tiene endpoint
  es el enlace manual.

Errores: se **reutilizan** `NotFoundError`, `ConflictError` y
`ValidationError` de `src/errors/app-error.ts`. Ningún código nuevo en la
tabla del contrato (ADR-005).

## 5. Alternativas descartadas

1. **Ampliar `PATCH /api/movements/:id`** — ver §1: recurso equivocado,
   cliente fabricando `transferId`, media pareja posible.
2. **Tabla aparte de deshechos** (`(movementAId, movementBId)` única) — cubre
   el caso de varios deshechos acumulados sobre el mismo movimiento, pero
   cuesta un modelo, una FK doble y un join en la detección para un caso que
   hoy no existe (un solo grupo dudoso vivo). La columna cumple la
   anticipación literal de la decisión 4 de la F41 («columna nueva,
   migración») y su límite (solo se recuerda el ÚLTIMO deshecho por
   movimiento) queda dicho en decisions.md #3. Si algún día muerde, la tabla
   se añade entonces y la columna se migra a ella.
3. **Boolean «excluido de la detección» por movimiento** — más simple aún,
   pero veta al movimiento con TODO el mundo, no con su antigua pareja: si la
   detección enlazó mal A–B y la verdad es A–C, el boolean impediría que la
   pasada siguiente encontrara A–C sola. Contradice el «estos dos no» literal
   de la decisión 4 de la F41.

## 6. Lo que esta feature NO toca

- La detección sobre lo no deshecho: ventana de 3 días, orden de
  emparejamiento del lote igualado, transacción por pareja, informe de la
  importación — idénticos (R12; los tests de F40/F41 siguen en verde sin
  cambios).
- `computeTotals` (`movements.service.ts:331`): ya excluye por
  `transferId != null` sin mirar quién lo escribió; R14 se cumple sin tocarlo
  (test de integración lo verifica).
- El ancla, los saldos, el dedup, la importación.
- Fixtures: el caso vivo (2×500 Bankinter → 1×500 N26) se reproduce con datos
  inventados (cuentas ficticias, `syntheticIban()`), como en F40/F41; el
  guardián de datos reales sigue aplicando.

## 7. Documentación

- `docs/api-contract.md`: sección nueva `POST /api/transfers` y
  `DELETE /api/transfers/:transferId` con tablas de errores; reescribir la
  nota «No hay endpoint de traspasos» (línea ~248) y el aviso equivalente del
  bloque de traspasos (~255-267): la detección sigue sin endpoint, el enlace
  manual sí lo tiene.
- `docs/data-model.md`: la columna nueva en el esquema copiado y en
  §Traspasos («sin marcado manual, como se decidió» deja de ser cierto); la
  fila `~~transferId~~` de «Columnas reservadas» gana el escritor manual F44.
